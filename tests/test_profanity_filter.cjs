const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const sandbox = vm.createContext({});
const filterCode = fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build/profanity_filter.js'), 'utf8');
vm.runInContext(filterCode, sandbox);
const validate = vm.runInContext('validatePlayerName', sandbox);

console.log('--- Testing Clean Single Words (Từ đơn sạch) ---');
const cleanSingleWords = [
    'Long', 'Phúc', 'Khang', 'Bác', 'Cát', 'Cúc', 'Bích', 'Tích', 'Dung',
    'Tiêu', 'Hàn', 'Vân', 'Thắng', 'Bách', 'Liễu', 'Lạc', 'long', 'phuc', 'khang'
];
for (const word of cleanSingleWords) {
    const res = validate(word);
    assert.strictEqual(res.valid, true, `Clean single word "${word}" MUST pass, got error: ${res.message}`);
}

console.log('--- Testing Clean Compound Words (Từ ghép sạch) ---');
const cleanCompoundWords = [
    'Thăng Long', 'Bạch Long', 'Bác Ái', 'Tác Giả', 'Thác Bản', 'Các Hạ',
    'Cát Tường', 'Bách Thắng', 'Phúc Khang', 'Bích Dao', 'Cúc Hoa', 'Hàn Lập',
    'Tiêu Viêm', 'Thanh Vân', 'Thiên Mệnh', 'Di Tích', 'Chiến Tích', 'Cổ Tích',
    'Phi Long', 'Hắc Long', 'Kim Long', 'Bạch Thiển',
    'thang long', 'bach long', 'bac ai', 'tac gia', 'cac ha', 'cat tuong',
    'Assassin', 'Classic', 'Cassandra', 'Passionate', 'Asset', 'Entity', 'Title', 'Titan'
];
for (const compound of cleanCompoundWords) {
    const res = validate(compound);
    assert.strictEqual(res.valid, true, `Clean compound word "${compound}" MUST pass, got error: ${res.message}`);
}

console.log('--- Testing Vulgar Single Words (Từ đơn tục >= 3 ký tự) ---');
const vulgarSingleWords = [
    'cac', 'cặc', 'cặk', 'cax',
    'lon', 'lồn', 'lồz', 'loz',
    'dit', 'địt', 'đệch', 'đếch',
    'buoi', 'buồi',
    'dkm', 'đkm', 'dcm', 'đcm',
    'vcl', 'vkl', 'clgt', 'vcc',
    'ass', 'cum', 'fag', 'tit', 'dick', 'cock', 'cunt', 'twat', 'piss', 'slut', 'whore',
    'l0n', 'c4c', 'b1tch'
];
for (const word of vulgarSingleWords) {
    const res = validate(word);
    assert.strictEqual(res.valid, false, `Vulgar single word "${word}" MUST be rejected`);
    assert.strictEqual(res.error_code, 'NAME_CONTAINS_PROFANITY', `Expected NAME_CONTAINS_PROFANITY for "${word}"`);
}

console.log('--- Testing 2-letter Vulgar Tokens in compounds ---');
const vulgarShortInCompound = [
    'thang dm', 'ten cc', 'anh cl', 'vai vl', 'con đm'
];
for (const word of vulgarShortInCompound) {
    const res = validate(word);
    assert.strictEqual(res.valid, false, `Compound containing short token "${word}" MUST be rejected`);
    assert.strictEqual(res.error_code, 'NAME_CONTAINS_PROFANITY', `Expected NAME_CONTAINS_PROFANITY for "${word}"`);
}

console.log('--- Testing Vulgar Compound Words & Phrases (Từ ghép tục & cụm từ) ---');
const vulgarCompoundWords = [
    'địt mẹ', 'dit me', 'dit con me', 'địt con mẹ',
    'đụ má', 'du ma', 'dume', 'đụ mẹ', 'du me',
    'ăn cặc', 'an cac', 'cặc ngựa', 'cac ngua',
    'bú cặc', 'bu cac', 'bú cu', 'bu cu',
    'thằng chó', 'thang cho', 'con chó', 'con cho',
    'chó đẻ', 'cho de', 'óc chó', 'oc cho',
    'mẹ mày', 'me may', 'bố mày', 'bo may',
    'đĩ mẹ', 'di me', 'con đĩ', 'con di',
    'fuck', 'motherfucker', 'mother fucker', 'bitch', 'bastard', 'asshole',
    'd.k.m', 'd_m', 'f.u.c.k', 'c-a-c', 'l.o.n'
];
for (const phrase of vulgarCompoundWords) {
    const res = validate(phrase);
    assert.strictEqual(res.valid, false, `Vulgar compound phrase "${phrase}" MUST be rejected`);
    assert.strictEqual(res.error_code, 'NAME_CONTAINS_PROFANITY', `Expected NAME_CONTAINS_PROFANITY for "${phrase}"`);
}

console.log('--- Testing Reserved Keywords (Mạo danh hệ thống) ---');
const reservedKeywords = [
    'Admin', 'admin', 'admin_01', 'GM_Master', 'gm_tester', 'CSKH', 'cskh_01', 'Hệ Thống', 'hethong', 'Server_01', 'BQT'
];
for (const kw of reservedKeywords) {
    const res = validate(kw);
    assert.strictEqual(res.valid, false, `Reserved keyword "${kw}" MUST be rejected`);
    assert.strictEqual(res.error_code, 'NAME_RESERVED_KEYWORD', `Expected NAME_RESERVED_KEYWORD for "${kw}"`);
}

console.log('--- Testing Invalid Format (Độ dài & ký tự cấm) ---');
const invalidFormats = [
    { name: 'ab', code: 'NAME_INVALID_FORMAT' },
    { name: 'a'.repeat(25), code: 'NAME_INVALID_FORMAT' },
    { name: 'bad\nname', code: 'NAME_INVALID_FORMAT' },
    { name: '<script>', code: 'NAME_INVALID_FORMAT' },
    { name: '[b]name[/b]', code: 'NAME_INVALID_FORMAT' }
];
for (const item of invalidFormats) {
    const res = validate(item.name);
    assert.strictEqual(res.valid, false, `Invalid format "${item.name}" MUST be rejected`);
    assert.strictEqual(res.error_code, item.code, `Expected ${item.code} for "${item.name}"`);
}

console.log('PASS: All 70+ profanity filter test cases passed cleanly (single words, compound words, leetspeak, reserved, whitelist)!');
