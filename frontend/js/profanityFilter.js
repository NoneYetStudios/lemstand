/**
 * Lemonade Stand - Shared Family-Friendly Nickname & Stand Name Filter
 * Single canonical implementation shared by Browser (window.ProfanityFilter) and Node.js (CommonJS).
 *
 * Design:
 * - Long, unambiguous profanities (BANNED_SUBSTRINGS) are matched anywhere as substrings.
 * - Short/ambiguous profanities (BANNED_TOKENS) are matched ONLY as whole tokens (split by
 *   underscores, CamelCase boundaries, or numeric prefixes/suffixes), preventing false positives
 *   on innocent words like "Glass", "Michelle", "Classic", "Cucumber", "GrapeSoda", etc.
 * - Preserves multi-map leetspeak decoding, phonetic normalization, and repeated-character collapsing.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProfanityFilter = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ALLOWED_REGEX = /^[A-Za-z0-9_]{3,18}$/;

  // Long or unambiguous profanities matched anywhere as substrings
  const BANNED_SUBSTRINGS = [
    // Direct & Obfuscated Unambiguous Profanity
    'fuck', 'fuk', 'fuq', 'fux', 'fck', 'fkn', 'fcuk', 'phuck', 'phuk', 'phuq', 'fvck', 'fvk',
    'shit', 'shyt', 'sh1t', 'bullshit', 'shiz',
    'bitch', 'btch', 'bytch', 'biatch', 'biotch', 'b1tch', 'beotch',
    'asshole', 'ashole', 'azzhole', 'butthole',
    'cunt', 'kunt', 'cvnt',
    'cawk', 'kawk', 'kock', 'c0ck', 'cocksuck',
    'dick', 'd1ck', 'dikhead', 'dickhead',
    'pussy', 'pusy', 'pussi', 'pu55y', 'pvssy',
    'whore', 'wh0re',
    'slutt', 'skank', 'sk4nk',
    'bastard', 'bstrd',
    'prick', 'pr1ck',
    'wanker', 'bollock', 'bellend', 'knobhead', 'tosser',
    'pisser', 'goddamn', 'damnit',
    'douche', 'd0uche',

    // Slurs & Hate Speech
    'faggot', 'fagot', 'phag',
    'nigga', 'nigger', 'nigg', 'n1gg', 'niglet', 'niqqa', 'nibba',
    'chink', 'ch1nk',
    'wetback', 'beaner', 'darkie', 'raghead', 'towelhead',
    'tranny', 'tr4nny', 'shemale',
    'retard', 'r3tard', 'retrd',
    'nazi', 'n4zi', 'hitler', 'h1tler', 'gestapo',

    // Sexual / Anatomical / Inappropriate Terms
    'porn', 'p0rn', 'pr0n', 'porno',
    'sexx',
    'jizz', 'j1zz',
    'kumm', 'semen', 'sperm',
    'penis', 'p3nis', 'pen1s', 'phallus', 'boner', 'b0ner', 'erection', 'scrotum',
    'vagina', 'v4gina', 'vulva', 'clit', 'cl1t',
    'boob', 'b00b', 'bewb', 'titty', 'titties', 't1tty', 'nipple',
    'anus', 'rectum', 'rimjob',
    'blowjob', 'bl0wjob', 'handjob', 'footjob', 'fellatio', 'jackoff', 'jerkoff',
    'dildo', 'd1ldo', 'buttplug', 'vibrator',
    'orgasm', 'masturbat',
    'rapist', 'molest', 'paedo', 'incest',
    'bestiality', 'zoophil', 'necrophil',

    // Hard Drugs / Violence / Self-harm
    'cocaine', 'heroin', 'crackhead',
    'suicide', 'su1cide', 'killurself', 'murder'
  ];

  // Short profanities matched ONLY as whole tokens (so "Glass", "Michelle", "Classic", "Cucumber", "GrapeSoda" pass)
  const BANNED_TOKENS = [
    'ass', 'a55', 'azz', 'arse',
    'sht', 'shat',
    'cnt', 'knt',
    'cock', 'cok',
    'dik', 'dyk', 'd1k',
    'puss',
    'twat', 'tw4t', 'twot',
    'whor', 'hoar', 'hore',
    'slut', 'slvt',
    'prik',
    'wank', 'w4nk',
    'piss', 'p1ss',
    'damn', 'd4mn',
    'crap', 'cr4p',
    'hell', 'h3ll',
    'fag', 'f4g', 'fgt',
    'dyke',
    'n1g', 'nig',
    'spic', 'sp1c', 'spik',
    'kike', 'k1ke', 'kyke',
    'gook', 'g00k',
    'coon', 'c00n',
    'tard',
    'kkk', 'klan',
    'sex', 's3x', 'sexy',
    'jiz',
    'cum', 'cvm',
    'vag',
    'tit', 'tits', 't1ts',
    'anal', 'an4l',
    'fap', 'f4p',
    'rape', 'r4pe',
    'pedo', 'p3do',
    'meth', 'm3th', 'weed', 'w33d', 'stoner', 'bong',
    'kys'
  ];

  const BANNED_TOKEN_SET = new Set(BANNED_TOKENS);

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

  // Word banks for "Pick Your Stand Name" generator (Adjective + Fruit/Flavor + Stand Type)
  const NAME_PREFIXES = [
    'Sunny', 'Golden', 'Fresh', 'Cool', 'Sweet',
    'Tangy', 'Zesty', 'Pixel', 'Retro', 'Happy',
    'Breezy', 'Crisp'
  ];
  const NAME_THEMES = [
    'Lemon', 'Citrus', 'Lime', 'Berry', 'Honey',
    'Peach', 'Mint', 'Apple', 'Melon', 'Sugar'
  ];
  const NAME_SUFFIXES = [
    'Cart', 'Stand', 'Cups', 'Drop', 'Press',
    'Shack', 'Booth', 'Jug', 'Bar', 'Co'
  ];

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
   * Collapse repeated characters down to maxRepeat (1 or 2).
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
      .replace(/fcuk/g, 'fuck')
      .replace(/phuck/g, 'fuck')
      .replace(/phuk/g, 'fuck')
      .replace(/phuq/g, 'fuck')
      .replace(/fvck/g, 'fuck')
      .replace(/fvk/g, 'fuck')
      .replace(/fuq/g, 'fuck')
      .replace(/fux/g, 'fuck')
      .replace(/fuk/g, 'fuck')
      .replace(/cawk/g, 'cock')
      .replace(/kawk/g, 'cock')
      .replace(/shyt/g, 'shit')
      .replace(/biatch/g, 'bitch')
      .replace(/biotch/g, 'bitch')
      .replace(/bytch/g, 'bitch')
      .replace(/beotch/g, 'bitch')
      .replace(/azz/g, 'ass');
  }

  /**
   * Expand a single lowercase alphanumeric string into all leetspeak, phonetic, and repeat-collapsed variants.
   */
  function expandNormalizedVariants(alphaNumStr) {
    if (!alphaNumStr) return [];
    const leetPrimary = applyLeetMap(alphaNumStr, LEET_MAP_PRIMARY);
    const leetSecondary = applyLeetMap(alphaNumStr, LEET_MAP_SECONDARY);

    const baseSet = [
      alphaNumStr,
      leetPrimary,
      leetSecondary,
      applyPhoneticNormalization(alphaNumStr),
      applyPhoneticNormalization(leetPrimary),
      applyPhoneticNormalization(leetSecondary)
    ];

    const variants = new Set();
    for (const variant of baseSet) {
      if (!variant) continue;
      variants.add(variant);
      const collapsed2 = collapseRepeatedChars(variant, 2);
      const collapsed1 = collapseRepeatedChars(variant, 1);
      variants.add(collapsed2);
      variants.add(collapsed1);
      variants.add(applyPhoneticNormalization(collapsed2));
      variants.add(applyPhoneticNormalization(collapsed1));
    }
    return Array.from(variants);
  }

  /**
   * Extract discrete word tokens from a raw stand name for whole-token matching.
   * Splits on:
   * - Explicit separators (_, -, ., spaces)
   * - CamelCase transitions (e.g. "GrapeSoda" -> ["grape", "soda"], "BadAss" -> ["bad", "ass"])
   * - Trailing/leading pure numeric runs (e.g. "ass99" -> ["ass", "99"], while keeping "a55", "f4g", "5h1t" intact)
   * - Consecutive single-character tokens (e.g. "a_s_s" -> "ass", "f_u_u_c_k" -> "fuuck")
   */
  function extractTokenCandidates(rawInput) {
    if (typeof rawInput !== 'string') return [];

    // 1. Split by explicit separators
    const rawParts = rawInput.trim().split(/[\s_\-\.]+/).filter(Boolean);
    const rawTokens = new Set();

    // If single-character parts appear consecutively (e.g. "a_s_s" or "f_u_u_c_k"), join them into a token
    let singleCharRun = '';
    for (const part of rawParts) {
      if (part.length === 1) {
        singleCharRun += part;
      } else {
        if (singleCharRun.length >= 2) {
          rawTokens.add(singleCharRun.toLowerCase());
        }
        singleCharRun = '';
      }
    }
    if (singleCharRun.length >= 2) {
      rawTokens.add(singleCharRun.toLowerCase());
    }

    for (const part of rawParts) {
      const lowerPart = part.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (lowerPart) {
        rawTokens.add(lowerPart);
      }

      // Split CamelCase words: e.g. "GrapeSoda" -> ["Grape", "Soda"], "HTTPServer" -> ["HTTP", "Server"]
      const camelSplit = part
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/\s+/)
        .filter(Boolean);

      for (const sub of camelSplit) {
        const cleanSub = sub.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanSub) {
          rawTokens.add(cleanSub);
          // Also strip purely leading or purely trailing digits (e.g., "ass99" -> "ass", "99ass" -> "ass")
          // Only if the remaining alphabetic core is >= 3 chars (so "a55" isn't stripped to "a")
          const strippedEdges = cleanSub.replace(/^[0-9]+|[0-9]+$/g, '');
          if (strippedEdges.length >= 3 && strippedEdges !== cleanSub) {
            rawTokens.add(strippedEdges);
          }
        }
      }
    }

    const expandedTokens = new Set();
    for (const tok of rawTokens) {
      for (const v of expandNormalizedVariants(tok)) {
        expandedTokens.add(v);
      }
    }
    return Array.from(expandedTokens);
  }

  /**
   * Generate all full-string normalized candidate strings for substring matching.
   */
  function getNormalizedCandidates(rawInput) {
    if (typeof rawInput !== 'string') return [];
    const base = rawInput.toLowerCase().replace(/[\s_\-\.]+/g, '');
    const alphaNumOnly = base.replace(/[^a-z0-9]/g, '');
    return expandNormalizedVariants(alphaNumOnly);
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
   * Returns { valid: boolean, sanitized: string, normalized: string, reason: string, code: string }
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

    if (trimmed.length < 3 || trimmed.length > 18) {
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

    // 1. Check full-string candidates against long, unambiguous BANNED_SUBSTRINGS
    const fullCandidates = getNormalizedCandidates(trimmed);
    for (const candidate of fullCandidates) {
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

    // 2. Check discrete word tokens against short BANNED_TOKENS (whole-token match only)
    const tokenCandidates = extractTokenCandidates(trimmed);
    for (const token of tokenCandidates) {
      if (BANNED_TOKEN_SET.has(token)) {
        return {
          valid: false,
          sanitized: trimmed,
          normalized: normalizeNickname(trimmed),
          code: 'PROFANITY_REJECTED',
          reason: FRIENDLY_FAILURE_MSG
        };
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

  /**
   * "Pick Your Stand Name" generator (e.g., Sunny + Lemon + Cart -> "SunnyLemonCart" or "Sunny_Cart").
   * Guaranteed to pass validateStandName().
   */
  function generateStandName(parts) {
    if (parts && typeof parts === 'object') {
      const p1 = String(parts.prefix || NAME_PREFIXES[0]).replace(/[^A-Za-z0-9]/g, '');
      const p2 = String(parts.theme || NAME_THEMES[0]).replace(/[^A-Za-z0-9]/g, '');
      const p3 = String(parts.suffix || NAME_SUFFIXES[0]).replace(/[^A-Za-z0-9]/g, '');
      const combined = `${p1}${p2}${p3}`.slice(0, 18);
      if (validateStandName(combined).valid) {
        return combined;
      }
    }

    for (let attempt = 0; attempt < 20; attempt++) {
      const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
      const theme = NAME_THEMES[Math.floor(Math.random() * NAME_THEMES.length)];
      const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
      const candidate = `${prefix}${theme}${suffix}`;
      if (candidate.length <= 18 && validateStandName(candidate).valid) {
        return candidate;
      }
    }
    return 'SunnyLemonCart';
  }

  return {
    ALLOWED_REGEX,
    BANNED_SUBSTRINGS,
    BANNED_TOKENS,
    NAME_PREFIXES,
    NAME_THEMES,
    NAME_SUFFIXES,
    normalizeNickname,
    getNormalizedCandidates,
    extractTokenCandidates,
    validateStandName,
    generateStandName,
    FRIENDLY_FAILURE_MSG
  };
});
