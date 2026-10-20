/**
 * Backend Strict Family-Friendly Nickname & Stand Name Filter
 * Synchronized with frontend/js/profanityFilter.js for standalone backend deployment.
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');

const sharedFilterPath = path.resolve(__dirname, '../../frontend/js/profanityFilter.js');

if (fs.existsSync(sharedFilterPath)) {
  module.exports = require(sharedFilterPath);
} else {
  // Standalone fallback if backend directory is deployed without frontend directory
  const ALLOWED_REGEX = /^[A-Za-z0-9_]{3,12}$/;
  const BANNED_SUBSTRINGS = [
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
    'slut', 'slvt', 'slutt', 'skank', 'sk4nk',
    'bastard', 'bstrd', 'prick', 'pr1ck', 'prik',
    'wank', 'w4nk', 'wanker', 'bollock', 'bellend', 'knobhead', 'tosser',
    'piss', 'p1ss', 'pisser', 'damn', 'd4mn', 'damnit', 'goddamn',
    'crap', 'cr4p', 'hell', 'h3ll',
    'fag', 'f4g', 'fgt', 'faggot', 'fagot', 'phag', 'dyke',
    'nigga', 'nigger', 'nigg', 'n1gg', 'n1g', 'niglet', 'niqqa', 'nibba',
    'chink', 'ch1nk', 'spic', 'sp1c', 'spik', 'kike', 'k1ke', 'kyke',
    'gook', 'g00k', 'wetback', 'beaner', 'coon', 'c00n', 'darkie', 'raghead', 'towelhead',
    'tranny', 'tr4nny', 'shemale', 'retard', 'r3tard', 'retrd', 'tard',
    'nazi', 'n4zi', 'hitler', 'h1tler', 'gestapo', 'kkk', 'klan',
    'porn', 'p0rn', 'pr0n', 'porno', 'sex', 's3x', 'sexx', 'sexy',
    'jizz', 'j1zz', 'jiz', 'cum', 'cvm', 'kumm', 'semen', 'sperm',
    'penis', 'p3nis', 'pen1s', 'phallus', 'boner', 'b0ner', 'erection',
    'vagina', 'v4gina', 'vag', 'vulva', 'clit', 'cl1t',
    'boob', 'b00b', 'bewb', 'tits', 't1ts', 'titty', 'titties', 't1tty', 'nipple',
    'anal', 'an4l', 'anus', 'rectum', 'rimjob', 'blowjob', 'bl0wjob', 'handjob', 'footjob', 'fellatio',
    'dildo', 'd1ldo', 'buttplug', 'vibrator', 'orgasm', 'masturbat', 'fap', 'f4p',
    'rape', 'r4pe', 'rapist', 'molest', 'pedo', 'p3do', 'paedo', 'incest',
    'bestiality', 'zoophil', 'necrophil',
    'cocaine', 'heroin', 'meth', 'm3th', 'crackhead', 'weed', 'w33d', 'stoner', 'bong',
    'suicide', 'su1cide', 'kys', 'killurself', 'murder'
  ];

  const LEET_MAP_PRIMARY = { '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '+': 't' };
  const LEET_MAP_SECONDARY = { '0': 'o', '1': 'l', '2': 's', '3': 'e', '4': 'a', '5': 's', '6': 'b', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'l', '+': 't' };

  function applyLeetMap(str, map) {
    let out = '';
    for (let i = 0; i < str.length; i++) out += map[str[i]] !== undefined ? map[str[i]] : str[i];
    return out;
  }

  function collapseRepeatedChars(str, maxRepeat) {
    if (!str) return '';
    const regex = new RegExp(`(.)\\1{${maxRepeat},}`, 'g');
    return str.replace(regex, (_, ch) => ch.repeat(maxRepeat));
  }

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

  function getNormalizedCandidates(rawInput) {
    if (typeof rawInput !== 'string') return [];
    const alphaNumOnly = rawInput.toLowerCase().replace(/[\s_\-\.]+/g, '').replace(/[^a-z0-9]/g, '');
    const leetPrimary = applyLeetMap(alphaNumOnly, LEET_MAP_PRIMARY);
    const leetSecondary = applyLeetMap(alphaNumOnly, LEET_MAP_SECONDARY);
    const baseSet = [
      alphaNumOnly,
      leetPrimary,
      leetSecondary,
      applyPhoneticNormalization(alphaNumOnly),
      applyPhoneticNormalization(leetPrimary),
      applyPhoneticNormalization(leetSecondary)
    ];
    const candidates = new Set();
    for (const variant of baseSet) {
      if (!variant) continue;
      candidates.add(variant);
      const c2 = collapseRepeatedChars(variant, 2);
      const c1 = collapseRepeatedChars(variant, 1);
      candidates.add(c2);
      candidates.add(c1);
      candidates.add(applyPhoneticNormalization(c2));
      candidates.add(applyPhoneticNormalization(c1));
    }
    return Array.from(candidates);
  }

  function normalizeNickname(rawInput) {
    if (typeof rawInput !== 'string') return '';
    const stripped = rawInput.toLowerCase().replace(/[\s_]+/g, '');
    const deLeeted = applyLeetMap(stripped, LEET_MAP_PRIMARY);
    return collapseRepeatedChars(applyPhoneticNormalization(deLeeted), 2);
  }

  const FRIENDLY_FAILURE_MSG = 'Stand Name not allowed. Please choose a family-friendly name.';

  function validateStandName(input) {
    if (typeof input !== 'string') {
      return { valid: false, sanitized: '', normalized: '', code: 'INVALID_TYPE', reason: FRIENDLY_FAILURE_MSG };
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return { valid: false, sanitized: '', normalized: '', code: 'EMPTY', reason: FRIENDLY_FAILURE_MSG };
    }
    if (trimmed.length < 3 || trimmed.length > 12) {
      return { valid: false, sanitized: trimmed, normalized: normalizeNickname(trimmed), code: 'INVALID_LENGTH', reason: FRIENDLY_FAILURE_MSG };
    }
    if (!ALLOWED_REGEX.test(trimmed)) {
      return { valid: false, sanitized: trimmed, normalized: normalizeNickname(trimmed), code: 'INVALID_CHARS', reason: FRIENDLY_FAILURE_MSG };
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
    return { valid: true, sanitized: trimmed, normalized: normalizeNickname(trimmed), code: 'OK', reason: '' };
  }

  module.exports = { ALLOWED_REGEX, BANNED_SUBSTRINGS, normalizeNickname, getNormalizedCandidates, validateStandName, FRIENDLY_FAILURE_MSG };
}
