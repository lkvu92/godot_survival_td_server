import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('identity_runtime_config', ROOT / 'nakama/configure_runtime.py')
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


class IdentityConfigurationTests(unittest.TestCase):
    def fixture(self):
        env = {'ACCOUNT_IDENTITY_SECRET': 'a'*64, 'ACCOUNT_IDENTITY_OUTBOX_KEY': 'b'*64,
               'SMTP_HOST': 'smtp.gmail.com', 'SMTP_PORT': '465', 'SMTP_USER': 'test@gmail.com',
               'SMTP_PASSWORD': 'synthetic-private-value', 'SMTP_FROM': 'test@gmail.com',
               'GOOGLE_WEB_CLIENT_IDS': 'test-client', 'ACCOUNT_IDENTITY_PUBLIC_URL': 'https://identity.example',
               'APP_ENVIRONMENT': 'production'}
        return {'nakama': {'environment': {'ACCOUNT_IDENTITY_ENABLED': 'true', 'ACCOUNT_IDENTITY_SECRET': 'a'*64}},
                'account-identity': {'environment': env}}

    def test_disabled_does_not_require_smtp(self):
        self.assertFalse(runtime.validate_identity({'nakama': {'environment': {}}}))

    def test_enabled_configuration_and_smtp_tls_ports(self):
        services = self.fixture()
        for port in ['465', '587']:
            services['account-identity']['environment']['SMTP_PORT'] = port
            self.assertTrue(runtime.validate_identity(services))

    def test_missing_mail_key_and_public_http_fail_without_secret_leak(self):
        for key, value in [('SMTP_USER', ''), ('SMTP_PASSWORD', ''), ('SMTP_PORT', '25'),
                           ('ACCOUNT_IDENTITY_OUTBOX_KEY', 'a'*64), ('ACCOUNT_IDENTITY_PUBLIC_URL', 'http://identity.example')]:
            services = self.fixture()
            services['account-identity']['environment'][key] = value
            with self.assertRaises(runtime.ConfigError) as caught:
                runtime.validate_identity(services)
            self.assertNotIn('synthetic-private-value', str(caught.exception))


@unittest.skipUnless(shutil.which('powershell'), 'PowerShell required')
class LocalDeployIdentityTests(unittest.TestCase):
    def execute(self, action='start', enabled=True, smtp_failure=0):
        with tempfile.TemporaryDirectory(prefix='c232 local deploy ') as temporary:
            root = Path(temporary)
            (root/'nakama').mkdir()
            (root/'nakama/.env.local').write_text('NAKAMA_HTTP_PORT=7350\n')
            (root/'nakama/iap.local.secret.yml').write_text('synthetic fixture\n')
            (root/'deploylocal.ps1').write_text((ROOT/'deploylocal.ps1').read_text(encoding='utf-8'), encoding='utf-8')
            harness = r'''
function global:docker {
    @{program='docker';arguments=@($args)} | ConvertTo-Json -Compress | Add-Content -LiteralPath $env:TEST_LOG
    $global:LASTEXITCODE=0
    if ($args -contains 'src/verify-smtp.js') { $global:LASTEXITCODE=[int]$env:TEST_SMTP_FAILURE }
}
function global:python {
    @{program='python';arguments=@($args)} | ConvertTo-Json -Compress | Add-Content -LiteralPath $env:TEST_LOG
    $global:LASTEXITCODE=0
    if ($args[0] -eq 'identity_config.py') { Write-Output $env:TEST_PROFILE }
}
function global:Invoke-WebRequest { return @{StatusCode=200} }
& (Join-Path $PSScriptRoot 'deploylocal.ps1') -Action $env:TEST_ACTION
'''
            (root/'harness.ps1').write_text(harness, encoding='utf-8')
            log = root/'calls.jsonl'
            env = {**os.environ, 'TEST_LOG': str(log), 'TEST_PROFILE': 'identity' if enabled else 'none',
                   'TEST_SMTP_FAILURE': str(smtp_failure), 'TEST_ACTION': action}
            result = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(root/'harness.ps1')],
                                    env=env, capture_output=True, text=True, timeout=30)
            calls = [json.loads(line.lstrip('\ufeff')) for line in log.read_text(encoding='utf-8-sig').splitlines()] if log.exists() else []
            return result, calls

    def test_enabled_start_builds_profile_reloads_runtime_and_checks_smtp(self):
        result, calls = self.execute()
        self.assertEqual(result.returncode, 0, result.stderr)
        docker = [c['arguments'] for c in calls if c['program']=='docker']
        self.assertTrue(any('--profile' in c and 'identity' in c and '--build' in c for c in docker))
        self.assertTrue(any('--no-deps' in c and '--force-recreate' in c and 'nakama' in c for c in docker))
        self.assertTrue(any('src/verify-smtp.js' in c for c in docker))

    def test_disabled_start_omits_identity_and_smtp(self):
        result, calls = self.execute(enabled=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any('src/verify-smtp.js' in c['arguments'] for c in calls))
        self.assertTrue(any(c['arguments'][-3:] == ['up','-d','--build'] and '--profile' not in c['arguments'] for c in calls))

    def test_smtp_failure_is_not_reported_as_deployed(self):
        result, _ = self.execute(smtp_failure=23)
        self.assertNotEqual(result.returncode, 0)

    def test_stop_manages_identity_even_when_flag_is_disabled(self):
        result, calls = self.execute(action='stop', enabled=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(any('--profile' in c['arguments'] and c['arguments'][-1]=='down' for c in calls))


if __name__ == '__main__':
    unittest.main()
