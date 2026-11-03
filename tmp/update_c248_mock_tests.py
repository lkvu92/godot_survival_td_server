from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'tests'
for name in ['test_soft_gate.cjs', 'test_mock_phone_verification.cjs', 'test_profile_lifecycle.cjs', 'test_soft_gate_local.cjs', 'test_profile_lifecycle_local.cjs']:
    path = root / name
    source = path.read_text(encoding='utf-8')
    source = source.replace("'123456'", "'12345'")
    source = source.replace("COMPLIANCE_ALLOW_MOCK:'true'", "APP_ENVIRONMENT:'develop',COMPLIANCE_ALLOW_MOCK:'true'")
    path.write_text(source, encoding='utf-8')
print('Mock fixtures updated.')
