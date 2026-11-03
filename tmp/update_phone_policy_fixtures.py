from pathlib import Path
root = Path(__file__).resolve().parents[1] / 'tests'
for name in ['test_otp_throttle.cjs', 'test_mock_phone_verification.cjs', 'test_profile_lifecycle.cjs', 'test_soft_gate.cjs', 'test_speedsms_otp.cjs']:
    p = root / name
    text = p.read_text(encoding='utf-8')
    text = text.replace('guardian_below_age:16,provider:', 'guardian_below_age:16,guardian_phone_max_accounts:3,provider:')
    p.write_text(text, encoding='utf-8')
print('Policy fixtures updated.')
