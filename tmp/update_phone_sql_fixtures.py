from pathlib import Path
root = Path(__file__).resolve().parents[1] / 'tests'
for name in ['test_otp_throttle.cjs', 'test_mock_phone_verification.cjs', 'test_profile_lifecycle.cjs', 'test_soft_gate.cjs', 'test_speedsms_otp.cjs']:
    p = root / name
    text = p.read_text(encoding='utf-8')
    text = text.replace('sqlQuery(){return [', "sqlQuery(q){if(q.includes('personal_count'))return [{personal_count:0,guardian_count:0}];return [")
    text = text.replace('sqlQuery:()=>[', "sqlQuery:q=>q.includes('personal_count')?[{personal_count:0,guardian_count:0}]:[")
    text = text.replace('assert.equal(lastBatch.length,2)', 'assert.equal(lastBatch.length,3)')
    p.write_text(text, encoding='utf-8')
print('SQL fixtures updated.')
