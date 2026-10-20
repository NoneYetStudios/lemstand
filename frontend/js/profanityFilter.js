/**
 * Lemonade Stand - Strict Family-Friendly Nickname & Stand Name Filter
 * Works in both Browser (window.ProfanityFilter) and Node.js (CommonJS).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProfanityFilter = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ALLOWED_REGEX = /^[A-Za-z0-9_]{3,12}$/;

  // Comprehensive strict blocklist of direct, partial, leetspeak, and obfuscated profanity
  const BANNED_SUBSTRINGS = [
    // Direct & Partial Profanity
    'fuck', 'fuk', 'fuq', 'fux', 'fck', 'fkn', 'phuck', 'phuk', 'phuq', 'fvck', 'fvk',
    'shit', 'shyt', 'sht', 'sh1t', 'shat', 'shiz',
    'bitch', 'btch', 'bytch', 'biatch', 'b1tch', 'beotch',
    'ass', 'a55', 'azz', 'arse', 'ashole', 'asshole', 'azzhole', 'butthole',
    'cunt', 'kunt', 'cnt', 'knt', 'cvnt',
    'cock', 'cawk', 'kawk', 'cok', 'kock', 'c0ck',
    'dick', 'dik', 'dyk', 'd1ck', 'd1k', 'dikhead',
    'pussy', 'pusy', 'puss', 'pussi', 'pu55y', 'pvssy',
    'twat', 'tw4t', 'twot',
    'whore', 'wh0re', 'whor', 'hoar', 'hore',
    'slut', 'slvt', 'slutt',
    'skank', 'sk4nk',
    'bastard', 'bstrd',
    'prick', 'pr1ck', 'prik',
    'wank', 'w4nk', 'wanker',
    'bollock', 'bellend', 'knobhead', 'tosser',
    'piss', 'p1ss', 'pisser',
    'damn', 'd4mn', 'damnit', 'goddamn',
    'crap', 'cr4p',
    'hell', 'h3ll',

    // Slurs & Hate Speech
    'fag', 'f4g', 'fgt', 'faggot', 'fagot', 'phag',
    'dyke',
    'nigga', 'nigger', 'nigg', 'n1gg', 'n1g', 'niglet', 'niqqa', 'nibba',
    'chink', 'ch1nk',
    'spic', 'sp1c', 'spik',
    'kike', 'k1ke', 'kyke',
    'gook', 'g00k',
    'wetback', 'beaner', 'coon', 'c00n', 'darkie', 'raghead', 'towelhead',
    'tranny', 'tr4nny', 'shemale',
    'retard', 'r3tard', 'retrd', 'tard',
    'nazi', 'n4zi', 'hitler', 'h1tler', 'gestapo', 'kkk', 'klan',

    // Sexual / Anatomical / Inappropriate Terms
    'porn', 'p0rn', 'pr0n', 'porno',
    'sex', 's3x', 'sexx', 'sexy',
    'jizz', 'j1zz', 'jiz',
    'cum', 'cvm', 'kumm', 'semen', 'sperm',
    'penis', 'p3nis', 'pen1s', 'phallus', 'boner', 'b0ner', 'erection',
    'vagina', 'v4gina', 'vag', 'vulva', 'clit', 'cl1t',
    'boob', 'b00b', 'bewb', 'tits', 't1ts', 'titty', 'titties', 't1tty', 'nipple',
    'anal', 'an4l', 'anus', 'rectum', 'rimjob',
    'blowjob', 'bl0wjob', 'handjob', 'footjob', 'fellatio',
    'dildo', 'd1ldo', 'buttplug', 'vibrator',
    'orgasm', 'masturbat', 'fap', 'f4p',
    'rape', 'r4pe', 'rapist', 'molest', 'pedo', 'p3do', 'paedo', 'incest',
    'bestiality', 'zoophil', 'necrophil',

    // Drugs / Violence / Self-harm
    'cocaine', 'heroin', 'meth', 'm3th', 'crackhead', 'weed', 'w33d', 'stoner', 'bong',
    'suicide', 'su1cide', 'kys', 'killurself', 'murder'
  ];

  // Primary Leetspeak replacement map (1 -> i)
  const LEET_MAP_PRIMARY = {
    '0': 'o',
    '1': 'i',
    '2': 'z',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '6': 'g',
    '7': 't',
    '8': 'b',
    '9': 'g',
    '@': 'a',
    '$': 's',
    '!': 'i',
    '+': 't'
  };

  // Secondary Leetspeak replacement map (1 -> l, 6 -> b)
  const LEET_MAP_SECONDARY = {
    '0': 'o',
    '1': 'l',
    '2': 's',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '6': 'b',
    '7': 't',
    '8': 'b',
    '9': 'g',
    '@': 'a',
    '$': 's',
    '!': 'l',
    '+': 't'
  };

  /**
   * Decode leetspeak characters using a specific mapping table.
   */
  function applyLeetMap(str, map) {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      out += map[ch] !== undefined ? map[ch] : ch;
    }
    return out;
  }

  /**
   * Collapse repeated characters:
   * - collapseToOne: "fuuuuck" -> "fuck", "biiiiitch" -> "bitch", "shiiiit" -> "shit"
   * - collapseToTwo: "a5555" -> "a55" -> "ass", "boooob" -> "boob"
   */
  function collapseRepeatedChars(str, maxRepeat) {
    if (!str) return '';
    const regex = new RegExp(`(.)\\1{${maxRepeat},}`, 'g');
    return str.replace(regex, (_, ch) => ch.repeat(maxRepeat));
  }

  /**
   * Apply phonetic / obfuscated normalizations so creative spellings resolve to canonical roots.
   */
  function applyPhoneticNormalization(str) {
    return str
      .replace(/ph/g, 'f')
      .replace(/vv/g, 'w')
      .replace(/cawk/g, 'cock')
      .replace(/kawk/g, 'cock')
      .replace(/shyt/g, 'shit')
      .replace(/biatch/g, 'bitch')
      .replace(/bytch/g, 'bitch')
      .replace(/azz/g, 'ass')
      .replace(/fuq/g, 'fuck')
      .replace(/fux/g, 'fuck')
      .replace(/fuk/g, 'fuck');
  }

  /**
   * Generate all normalized candidate strings for a given raw input.
   */
  function getNormalizedCandidates(rawInput) {
    if (typeof rawInput !== 'string') return [];

    // 1. Lowercase and strip spaces, underscores, and any non-alphanumeric separators
    const base = rawInput.toLowerCase().replace(/[\s_\-\.]+/g, '');
    const alphaNumOnly = base.replace(/[^a-z0-9]/g, '');

    // 2. Leetspeak decodings
    const leetPrimary = applyLeetMap(alphaNumOnly, LEET_MAP_PRIMARY);
    const leetSecondary = applyLeetMap(alphaNumOnly, LEET_MAP_SECONDARY);

    // 3. Phonetic normalizations on raw and leet-decoded strings
    const phoneticRaw = applyPhoneticNormalization(alphaNumOnly);
    const phoneticPrimary = applyPhoneticNormalization(leetPrimary);
    const phoneticSecondary = applyPhoneticNormalization(leetSecondary);

    const baseSet = [
      alphaNumOnly,
      leetPrimary,
      leetSecondary,
      phoneticRaw,
      phoneticPrimary,
      phoneticSecondary
    ];

    const candidates = new Set();
    for (const variant of baseSet) {
      if (!variant) continue;
      candidates.add(variant);
      const collapsed2 = collapseRepeatedChars(variant, 2);
      const collapsed1 = collapseRepeatedChars(variant, 1);
      candidates.add(collapsed2);
      candidates.add(collapsed1);
      candidates.add(applyPhoneticNormalization(collapsed2));
      candidates.add(applyPhoneticNormalization(collapsed1));
    }

    return Array.from(candidates);
  }

  /**
   * Primary normalization helper (returns canonical normalized string).
   */
  function normalizeNickname(rawInput) {
    if (typeof rawInput !== 'string') return '';
    const stripped = rawInput.toLowerCase().replace(/[\s_]+/g, '');
    const deLeeted = applyLeetMap(stripped, LEET_MAP_PRIMARY);
    return collapseRepeatedChars(applyPhoneticNormalization(deLeeted), 2);
  }

  const FRIENDLY_FAILURE_MSG = 'Stand Name not allowed. Please choose a family-friendly name.';

  /**
   * Validate and filter a Stand Name.
   * Returns { valid: boolean, sanitized: string, normalized: string, reason?: string, code?: string }
   */
  function validateStandName(input) {
    if (typeof input !== 'string') {
      return {
        valid: false,
        sanitized: '',
        normalized: '',
        code: 'INVALID_TYPE',
        reason: FRIENDLY_FAILURE_MSG
      };
    }

    const trimmed = input.trim();

    if (trimmed.length === 0) {
      return {
        valid: false,
        sanitized: '',
        normalized: '',
        code: 'EMPTY',
        reason: FRIENDLY_FAILURE_MSG
      };
    }

    if (trimmed.length < 3 || trimmed.length > 12) {
      return {
        valid: false,
        sanitized: trimmed,
        normalized: normalizeNickname(trimmed),
        code: 'INVALID_LENGTH',
        reason: FRIENDLY_FAILURE_MSG
      };
    }

    if (!ALLOWED_REGEX.test(trimmed)) {
      return {
        valid: false,
        sanitized: trimmed,
        normalized: normalizeNickname(trimmed),
        code: 'INVALID_CHARS',
        reason: FRIENDLY_FAILURE_MSG
      };
    }

    const candidates = getNormalizedCandidates(trimmed);

    for (const candidate of candidates) {
      for (const banned of BANNED_SUBSTRINGS) {
        if (candidate.includes(banned)) {
          return {
            valid: false,
            sanitized: trimmed,
            normalized: normalizeNickname(trimmed),
            code: 'PROFANITY_REJECTED',
            reason: FRIENDLY_FAILURE_MSG
          };
        }
      }
    }

    return {
      valid: true,
      sanitized: trimmed,
      normalized: normalizeNickname(trimmed),
      code: 'OK',
      reason: ''
    };
  }

  return {
    ALLOWED_REGEX,
    BANNED_SUBSTRINGS,
    normalizeNickname,
    getNormalizedCandidates,
    validateStandName
  };
});
