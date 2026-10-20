<?php
/**
 * Lemonade Stand - PHP Backend API for Apache / JetHost / cPanel Hosting
 * Supports PHP 7.4+ and 8.x with built-in PDO SQLite.
 * Uses canonical schema.sql, SHA-256 hashed stand_token, token-vs-substring profanity filter,
 * and server-issued per-run seeds.
 */

error_reporting(0);
ini_set('display_errors', '0');

// Public CORS Headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Accept");
header("Access-Control-Max-Age: 86400");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// -----------------------------------------------------------------------------
// Database Initialization (SQLite via PDO using canonical schema.sql)
// -----------------------------------------------------------------------------
$dataDir = __DIR__ . '/../data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
    file_put_contents($dataDir . '/.htaccess', "Deny from all\n");
}

$dbFile = $dataDir . '/lemonadestand.db';

try {
    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $schemaPath = file_exists(__DIR__ . '/../../schema.sql')
        ? __DIR__ . '/../../schema.sql'
        : __DIR__ . '/../schema.sql';
    if (file_exists($schemaPath)) {
        $pdo->exec(file_get_contents($schemaPath));
    }
} catch (Exception $e) {
    jsonResponse(['ok' => false, 'code' => 'DB_INIT_ERROR', 'error' => 'Database connection failed.'], 500);
}

// -----------------------------------------------------------------------------
// Stand Token Hashing (SHA-256)
// -----------------------------------------------------------------------------
function isValidRawStandToken($token) {
    return is_string($token) && preg_match('/^[A-Za-z0-9]{16,24}$/', trim($token)) === 1;
}

function hashStandToken($rawToken) {
    if (!isValidRawStandToken($rawToken)) return '';
    return hash('sha256', trim($rawToken));
}

// -----------------------------------------------------------------------------
// Profanity & Nickname Filter (Synchronized with frontend/js/profanityFilter.js)
// -----------------------------------------------------------------------------
const FRIENDLY_FAILURE_MSG = 'Stand Name not allowed. Please choose a family-friendly name.';

const BANNED_SUBSTRINGS = [
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
    'faggot', 'fagot', 'phag',
    'nigga', 'nigger', 'nigg', 'n1gg', 'niglet', 'niqqa', 'nibba',
    'chink', 'ch1nk',
    'wetback', 'beaner', 'darkie', 'raghead', 'towelhead',
    'tranny', 'tr4nny', 'shemale',
    'retard', 'r3tard', 'retrd',
    'nazi', 'n4zi', 'hitler', 'h1tler', 'gestapo',
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
    'cocaine', 'heroin', 'crackhead',
    'suicide', 'su1cide', 'killurself', 'murder'
];

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

function validateStandName($input) {
    if (!is_string($input)) {
        return ['valid' => false, 'code' => 'INVALID_TYPE', 'error' => FRIENDLY_FAILURE_MSG];
    }
    $trimmed = trim($input);
    if (!preg_match('/^[A-Za-z0-9_]{3,18}$/', $trimmed)) {
        return ['valid' => false, 'code' => 'INVALID_FORMAT', 'error' => FRIENDLY_FAILURE_MSG];
    }

    $leetMap1 = ['0'=>'o','1'=>'i','2'=>'z','3'=>'e','4'=>'a','5'=>'s','6'=>'g','7'=>'t','8'=>'b','9'=>'g','@'=>'a','$'=>'s','!'=>'i','+'=>'t'];
    $leetMap2 = ['0'=>'o','1'=>'l','2'=>'s','3'=>'e','4'=>'a','5'=>'s','6'=>'b','7'=>'t','8'=>'b','9'=>'g','@'=>'a','$'=>'s','!'=>'l','+'=>'t'];

    $fullLower = strtolower(str_replace('_', '', $trimmed));
    $c1 = strtr($fullLower, $leetMap1);
    $c2 = strtr($fullLower, $leetMap2);
    $c3 = preg_replace('/(.)\1+/', '$1', $c1);
    $c4 = preg_replace('/(.)\1+/', '$1', $c2);

    foreach ([$fullLower, $c1, $c2, $c3, $c4] as $cand) {
        foreach (BANNED_SUBSTRINGS as $banned) {
            if (strpos($cand, $banned) !== false) {
                return ['valid' => false, 'code' => 'PROFANITY_REJECTED', 'error' => FRIENDLY_FAILURE_MSG];
            }
        }
    }

    $parts = preg_split('/_+/', $trimmed, -1, PREG_SPLIT_NO_EMPTY);
    foreach ($parts as $part) {
        $camelTokens = preg_split('/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/', $part, -1, PREG_SPLIT_NO_EMPTY);
        $allParts = array_merge([$part], $camelTokens);
        foreach ($allParts as $tok) {
            $tl = strtolower($tok);
            $t1 = strtr($tl, $leetMap1);
            $t2 = strtr($tl, $leetMap2);
            $t3 = preg_replace('/(.)\1+/', '$1', $t1);
            foreach ([$tl, $t1, $t2, $t3] as $tc) {
                if (in_array($tc, BANNED_TOKENS, true)) {
                    return ['valid' => false, 'code' => 'PROFANITY_REJECTED', 'error' => FRIENDLY_FAILURE_MSG];
                }
            }
        }
    }

    return ['valid' => true, 'sanitized' => $trimmed];
}

// -----------------------------------------------------------------------------
// Request Routing
// -----------------------------------------------------------------------------
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^.*?/api/?#i', '', $uri);
$path = trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'];
$bodyJson = file_get_contents('php://input');
$body = json_decode($bodyJson, true) ?: [];

if ($path === 'health' || $path === '') {
    jsonResponse(['ok' => true, 'version' => '1.0.0', 'engine' => 'php-sqlite', 'timestamp' => gmdate('Y-m-d\TH:i:s\Z')]);
}

if ($path === 'validate-nickname' && $method === 'POST') {
    $name = $body['stand_name'] ?? '';
    $check = validateStandName($name);
    if (!$check['valid']) {
        jsonResponse(['ok' => false, 'valid' => false, 'code' => $check['code'], 'error' => $check['error']], 400);
    }
    jsonResponse(['ok' => true, 'valid' => true, 'stand_name' => $check['sanitized'], 'message' => '']);
}

if ($path === 'run/start' && $method === 'POST') {
    $check = validateStandName($body['stand_name'] ?? '');
    if (!$check['valid']) {
        jsonResponse(['ok' => false, 'code' => $check['code'], 'error' => $check['error']], 400);
    }
    $gameMode = ($body['game_mode'] ?? 'standard') === 'endless' ? 'endless' : 'standard';
    $runId = bin2hex(random_bytes(16));
    $runSeed = random_int(1, 0x7fffffff);
    $secret = 'lemstand-server-seed-hmac-key-v2';
    $payload = $runId . '|' . $runSeed . '|' . strtolower($check['sanitized']) . '|' . $gameMode;
    $runToken = hash_hmac('sha256', $payload, $secret);
    $tokenHash = hashStandToken($body['stand_token'] ?? '');
    $now = gmdate('Y-m-d\TH:i:s\Z');

    $stmt = $pdo->prepare("INSERT INTO game_runs (run_id, run_seed, stand_name, game_mode, stand_token, created_at, used) VALUES (?, ?, ?, ?, ?, ?, 0)");
    $stmt->execute([$runId, $runSeed, $check['sanitized'], $gameMode, $tokenHash, $now]);

    jsonResponse([
        'ok' => true,
        'run_id' => $runId,
        'run_seed' => $runSeed,
        'run_token' => $runToken,
        'stand_name' => $check['sanitized'],
        'game_mode' => $gameMode
    ], 201);
}

if ($path === 'save' && $method === 'POST') {
    $rawToken = $body['stand_token'] ?? ($body['standToken'] ?? '');
    $state = $body['state'] ?? null;
    if (!isValidRawStandToken($rawToken) || !is_array($state)) {
        jsonResponse(['ok' => false, 'code' => 'INVALID_SAVE_STATE', 'error' => 'Valid 16-24 char stand_token and state required.'], 400);
    }
    $tokenHash = hashStandToken($rawToken);
    unset($state['stand_token'], $state['standToken']);
    $standName = $state['standName'] ?? 'Lemonade Stand';
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $stmt = $pdo->prepare("INSERT OR REPLACE INTO game_saves (stand_token, stand_name, game_state, updated_at) VALUES (?, ?, ?, ?)");
    $stmt->execute([$tokenHash, $standName, json_encode($state), $now]);
    jsonResponse(['ok' => true, 'updated_at' => $now]);
}

if (strpos($path, 'save/') === 0) {
    $rawToken = substr($path, 5);
    if (!isValidRawStandToken($rawToken)) {
        jsonResponse(['ok' => false, 'code' => 'INVALID_STAND_TOKEN', 'error' => 'Valid 16-24 char stand token required.'], 400);
    }
    $tokenHash = hashStandToken($rawToken);
    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT game_state FROM game_saves WHERE stand_token = ?");
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch();
        if (!$row) {
            jsonResponse(['ok' => false, 'code' => 'SAVE_NOT_FOUND', 'error' => 'No saved game found for this token.'], 404);
        }
        jsonResponse(['ok' => true, 'state' => json_decode($row['game_state'], true)]);
    } elseif ($method === 'DELETE') {
        $stmt = $pdo->prepare("DELETE FROM game_saves WHERE stand_token = ?");
        $stmt->execute([$tokenHash]);
        jsonResponse(['ok' => true]);
    }
}

jsonResponse(['ok' => false, 'code' => 'NOT_FOUND', 'error' => 'API endpoint not found.'], 404);
