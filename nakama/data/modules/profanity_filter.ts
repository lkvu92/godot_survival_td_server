// Bilingual Profanity & Sensitive Keyword Filter (English & Vietnamese)
// Contract: C125 v1.2.0

const PROFANITY_CONFIG = {
    leetspeak: {
        '0': 'o',
        '1': 'i',
        '3': 'e',
        '4': 'a',
        '5': 's',
        '7': 't',
        '8': 'b',
        '@': 'a',
        '$': 's'
    } as Record<string, string>,

    reserved_words: [
        'admin', 'administrator', 'gamemaster', 'gm', 'moderator', 'mod',
        'bqt', 'banquantri', 'cskh', 'hotro', 'hethong', 'system', 'server', 'official'
    ],

    exact_tokens: [
        // Vietnamese single vulgar tokens / acronyms
        'cac', 'cặc', 'lon', 'lồn', 'dit', 'địt', 'buoi', 'buồi',
        'cc', 'cl', 'dm', 'đm', 'dkm', 'đkm', 'dcm', 'đcm',
        'vcl', 'vkl', 'clgt', 'loz', 'cax', 'vl', 'vcc', 'đù', 'lồz', 'cặk', 'đệch', 'đếch',
        // English short vulgar tokens
        'ass', 'cum', 'fag', 'tit', 'dick', 'cock', 'cunt', 'twat', 'piss', 'slut', 'whore', 'shat', 'crap'
    ],

    contains_phrases: [
        // Vietnamese vulgar compound phrases
        'địt mẹ', 'dit me', 'địt con mẹ', 'dit con me', 'đụ má', 'du ma', 'dume', 'đụ mẹ', 'du me',
        'lồn mẹ', 'lon me', 'ăn cặc', 'an cac', 'cặc ngựa', 'cac ngua', 'bú cặc', 'bu cac',
        'bú cu', 'bu cu', 'thằng chó', 'thang cho', 'con chó', 'con cho', 'địt bà', 'dit ba',
        'chó đẻ', 'cho de', 'óc chó', 'oc cho', 'mẹ mày', 'me may', 'bố mày', 'bo may',
        'tiên sư', 'mất dạy', 'mat day', 'đĩ mẹ', 'di me', 'con đĩ', 'con di',
        'làm tình', 'lam tinh', 'thủ dâm', 'thu dam',
        // English vulgar phrases
        'fuck', 'motherfucker', 'mother fucker', 'bitch', 'bastard', 'nigger', 'nigga',
        'pussy', 'asshole', 'blowjob', 'handjob', 'deepthroat', 'masturbat',
        'dumbass', 'jackass', 'dipshit', 'bullshit', 'horseshit'
    ],

    whitelist: [
        // Clean single words in Vietnamese / Xianxia
        'long', 'bác', 'bac', 'cát', 'cat', 'phúc', 'phuc', 'khang', 'bách', 'bach',
        'thắng', 'thang', 'bích', 'bich', 'cúc', 'cuc', 'tích', 'tich', 'dung',
        'tiêu', 'tieu', 'hàn', 'han', 'liễu', 'lieu', 'vân', 'van', 'lạc', 'lac',
        'tác', 'tac', 'các',
        // Clean compound words in Vietnamese / Xianxia
        'thăng long', 'thang long', 'bạch long', 'bach long', 'long thần', 'long than',
        'long vương', 'long vuong', 'phi long', 'hắc long', 'hac long', 'kim long',
        'bác ái', 'bac ai', 'thác bản', 'thac ban', 'tác giả', 'tac gia', 'các hạ', 'cac ha',
        'cát tường', 'cat tuong', 'phúc khang', 'phuc khang', 'bách thắng', 'bach thang',
        'bích dao', 'bich dao', 'cúc hoa', 'cuc hoa', 'hàn lập', 'han lap', 'tiêu viêm', 'tieu viem',
        'bạch thiển', 'bach thien', 'thanh vân', 'thanh van', 'thiên mệnh', 'thien menh',
        'di tích', 'di tich', 'cổ tích', 'co tich', 'chiến tích', 'chien tich',
        // Clean English words containing sensitive substrings
        'assassin', 'classic', 'cassandra', 'passionate', 'asset', 'assist', 'entity', 'title', 'titan'
    ]
};

function stripAccents(str: string): string {
    return str
        .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
        .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
        .replace(/[ìíịỉĩ]/g, 'i')
        .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
        .replace(/[ùúụủũưừứựửữ]/g, 'u')
        .replace(/[ỳýỵỷỹ]/g, 'y')
        .replace(/đ/g, 'd');
}

function canonicalizeText(str: string): string {
    let s = str.normalize('NFC').toLowerCase().trim();
    for (const [k, v] of Object.entries(PROFANITY_CONFIG.leetspeak)) {
        s = s.split(k).join(v);
    }
    return s;
}

function validatePlayerName(name: string): { valid: boolean; code?: number; error_code?: string; message?: string } {
    if (typeof name !== 'string') {
        return { valid: false, code: 400, error_code: 'NAME_INVALID_FORMAT', message: 'Tên người chơi không hợp lệ.' };
    }
    const trimmed = name.trim();
    const charCount = Array.from(trimmed).length;
    if (charCount < 3 || charCount > 24 || /[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff<>\[\]]/.test(trimmed)) {
        return { valid: false, code: 400, error_code: 'NAME_INVALID_FORMAT', message: 'Tên cần từ 3 đến 24 ký tự, không chứa ký tự điều khiển hoặc ký hiệu định dạng.' };
    }

    const norm = canonicalizeText(trimmed);
    const unacc = stripAccents(norm);

    // Whitelist check: If the full name or its unaccented version is explicitly whitelisted, pass directly.
    const whitelistSet = new Set(PROFANITY_CONFIG.whitelist);
    if (whitelistSet.has(norm) || whitelistSet.has(unacc)) {
        return { valid: true };
    }

    // System reserved keywords check
    const collapsedAlphanumeric = unacc.replace(/[^a-z0-9]/g, '');
    for (const reserved of PROFANITY_CONFIG.reserved_words) {
        if (collapsedAlphanumeric === reserved || collapsedAlphanumeric.startsWith(reserved + '_') || collapsedAlphanumeric.startsWith(reserved + '0') || collapsedAlphanumeric.startsWith(reserved + '1') || collapsedAlphanumeric.startsWith(reserved + '2') || collapsedAlphanumeric.startsWith(reserved + '3') || collapsedAlphanumeric.startsWith(reserved + '4') || collapsedAlphanumeric.startsWith(reserved + '5') || collapsedAlphanumeric.startsWith(reserved + '6') || collapsedAlphanumeric.startsWith(reserved + '7') || collapsedAlphanumeric.startsWith(reserved + '8') || collapsedAlphanumeric.startsWith(reserved + '9')) {
            return { valid: false, code: 400, error_code: 'NAME_RESERVED_KEYWORD', message: 'Tên chứa từ khóa của hệ thống hoặc Ban Quản Trị.' };
        }
        const tokens = unacc.split(/[^a-z0-9]+/);
        if (tokens.includes(reserved)) {
            return { valid: false, code: 400, error_code: 'NAME_RESERVED_KEYWORD', message: 'Tên chứa từ khóa của hệ thống hoặc Ban Quản Trị.' };
        }
    }

    const exactTokensSet = new Set(PROFANITY_CONFIG.exact_tokens);

    // Delimiter collapse check for short evasions like "d.k.m", "d_m", "c-a-c", "l.o.n"
    const collapsedRaw = norm.replace(/[\s._\-–—,;:!?'"/\\]+/g, '');
    const collapsedSpacesAndDots = unacc.replace(/[\s._\-–—,;:!?'"/\\]+/g, '');
    if ((exactTokensSet.has(collapsedRaw) || exactTokensSet.has(collapsedSpacesAndDots)) && !whitelistSet.has(collapsedRaw) && !whitelistSet.has(collapsedSpacesAndDots)) {
        return { valid: false, code: 400, error_code: 'NAME_CONTAINS_PROFANITY', message: 'Tên chứa từ ngữ không phù hợp.' };
    }

    // Compound phrases match (Contains / Substring check)
    for (const phrase of PROFANITY_CONFIG.contains_phrases) {
        const phraseNorm = canonicalizeText(phrase);
        const phraseUnacc = stripAccents(phraseNorm);
        const phraseCollapsed = phraseUnacc.replace(/[\s._\-–—,;:!?'"/\\]+/g, '');

        if (norm.includes(phraseNorm) || unacc.includes(phraseUnacc) || (phraseCollapsed.length >= 3 && collapsedSpacesAndDots.includes(phraseCollapsed))) {
            return { valid: false, code: 400, error_code: 'NAME_CONTAINS_PROFANITY', message: 'Tên chứa từ ngữ không phù hợp.' };
        }
    }

    // Exact single vulgar tokens match (Token boundary check)
    // Extract tokens from both accented and unaccented representations
    const rawTokens = norm.split(/[^a-z0-9à-ỹđ]+/i).filter(Boolean);
    const unaccTokens = unacc.split(/[^a-z0-9]+/i).filter(Boolean);

    for (const token of rawTokens) {
        if (whitelistSet.has(token)) continue;
        if (exactTokensSet.has(token)) {
            return { valid: false, code: 400, error_code: 'NAME_CONTAINS_PROFANITY', message: 'Tên chứa từ ngữ không phù hợp.' };
        }
    }

    for (const token of unaccTokens) {
        if (whitelistSet.has(token)) continue;
        if (exactTokensSet.has(token)) {
            return { valid: false, code: 400, error_code: 'NAME_CONTAINS_PROFANITY', message: 'Tên chứa từ ngữ không phù hợp.' };
        }
    }

    return { valid: true };
}
