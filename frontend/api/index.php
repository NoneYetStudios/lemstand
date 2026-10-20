<?php
/**
 * Lemonade Stand - PHP Backend API for Apache / JetHost / cPanel Hosting
 * Supports PHP 7.4+ and 8.x with built-in PDO SQLite.
 * Uses SHA-256 hashed stand_token, token-vs-substring profanity filter,
 * server-issued per-run seeds, full 7-category leaderboards, and game saves.
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
// Database Initialization (SQLite via PDO)
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

    // Apply Schema
    $pdo->exec("
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS leaderboard_daily (
        id TEXT PRIMARY KEY,
        stand_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        date TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
        version TEXT NOT NULL DEFAULT '1.0.0',
        game_mode TEXT NOT NULL DEFAULT 'standard',
        days_played INTEGER NOT NULL DEFAULT 12,
        stand_token TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_daily_score_date ON leaderboard_daily (score DESC, date DESC);
    CREATE INDEX IF NOT EXISTS idx_daily_date ON leaderboard_daily (date DESC);

    CREATE TABLE IF NOT EXISTS leaderboard_weekly (
        id TEXT PRIMARY KEY,
        stand_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        date TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
        version TEXT NOT NULL DEFAULT '1.0.0',
        game_mode TEXT NOT NULL DEFAULT 'standard',
        days_played INTEGER NOT NULL DEFAULT 12,
        stand_token TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_weekly_score_date ON leaderboard_weekly (score DESC, date DESC);
    CREATE INDEX IF NOT EXISTS idx_weekly_date ON leaderboard_weekly (date DESC);

    CREATE TABLE IF NOT EXISTS leaderboard_all_time (
        id TEXT PRIMARY KEY,
        stand_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        date TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
        version TEXT NOT NULL DEFAULT '1.0.0',
        game_mode TEXT NOT NULL DEFAULT 'standard',
        days_played INTEGER NOT NULL DEFAULT 12,
        stand_token TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_all_time_score ON leaderboard_all_time (score DESC, date DESC);
    CREATE INDEX IF NOT EXISTS idx_all_time_date ON leaderboard_all_time (date DESC);

    CREATE TABLE IF NOT EXISTS leaderboard_best_day (
        id TEXT PRIMARY KEY,
        stand_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        date TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
        version TEXT NOT NULL DEFAULT '1.0.0',
        day_number INTEGER NOT NULL DEFAULT 1,
        weather TEXT DEFAULT 'sunny',
        stand_token TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_best_day_score ON leaderboard_best_day (score DESC, date DESC);
    CREATE INDEX IF NOT EXISTS idx_best_day_date ON leaderboard_best_day (date DESC);

    CREATE TABLE IF NOT EXISTS leaderboard_best_run (
        id TEXT PRIMARY KEY,
        stand_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        date TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
        version TEXT NOT NULL DEFAULT '1.0.0',
        final_assets INTEGER NOT NULL DEFAULT 200,
        stand_token TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_best_run_score ON leaderboard_best_run (score DESC, date DESC);
    CREATE INDEX IF NOT EXISTS idx_best_run_date ON leaderboard_best_run (date DESC);

    CREATE TABLE IF NOT EXISTS leaderboard_glasses_day (
        id TEXT PRIMARY KEY,
        stand_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        date TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
        version TEXT NOT NULL DEFAULT '1.0.0',
        day_number INTEGER NOT NULL DEFAULT 1,
        weather TEXT DEFAULT 'sunny',
        stand_token TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_glasses_day_score ON leaderboard_glasses_day (score DESC, date DESC);
    CREATE INDEX IF NOT EXISTS idx_glasses_day_date ON leaderboard_glasses_day (date DESC);

    CREATE TABLE IF NOT EXISTS leaderboard_glasses_run (
        id TEXT PRIMARY KEY,
        stand_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        date TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
        version TEXT NOT NULL DEFAULT '1.0.0',
        game_mode TEXT NOT NULL DEFAULT 'standard',
        days_played INTEGER NOT NULL DEFAULT 12,
        stand_token TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_glasses_run_score ON leaderboard_glasses_run (score DESC, date DESC);
    CREATE INDEX IF NOT EXISTS idx_glasses_run_date ON leaderboard_glasses_run (date DESC);

    CREATE TABLE IF NOT EXISTS game_saves (
        stand_token TEXT PRIMARY KEY,
        stand_name TEXT NOT NULL,
        game_state TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_game_saves_token ON game_saves (stand_token);

    CREATE TABLE IF NOT EXISTS game_runs (
        run_id TEXT PRIMARY KEY,
        run_seed INTEGER NOT NULL,
        stand_name TEXT NOT NULL,
        game_mode TEXT NOT NULL DEFAULT 'standard',
        stand_token TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_game_runs_created_at ON game_runs (created_at DESC);
    ");

    // Seed initial family-friendly entries if all-time leaderboard is empty
    $count = $pdo->query("SELECT COUNT(*) AS cnt FROM leaderboard_all_time")->fetchColumn();
    if ($count == 0) {
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $twoDaysAgo = gmdate('Y-m-d\TH:i:s\Z', time() - 2 * 86400);
        $fiveDaysAgo = gmdate('Y-m-d\TH:i:s\Z', time() - 5 * 86400);

        $starters = [
            ['Apple_IIe', 3480, 640, 9, 'heatwave', 485, 78, 'retro', 12, $now],
            ['Pixel_Press', 2950, 520, 7, 'hot_dry', 412, 65, '8-bit', 12, $now],
            ['Citrus_Drop', 2640, 475, 5, 'sunny', 376, 58, 'modern', 12, $now],
            ['Woz_Lemons', 2210, 410, 11, 'hot_dry', 330, 52, 'retro', 12, $twoDaysAgo],
            ['Sunny_Cups', 1890, 360, 4, 'sunny', 295, 46, 'modern', 12, $fiveDaysAgo],
            ['Bit_Breeze', 1540, 310, 6, 'sunny', 248, 42, '8-bit', 12, $fiveDaysAgo]
        ];

        foreach ($starters as $s) {
            $uuid = bin2hex(random_bytes(16));
            $tokenHash = hash('sha256', 'StarterSeedToken_' . $s[0]);
            $pdo->prepare("INSERT INTO leaderboard_daily VALUES (?, ?, ?, ?, ?, '1.0.0', 'standard', ?, ?)")->execute([$uuid . '-d', $s[0], $s[1], $s[9], $s[7], $s[8], $tokenHash]);
            $pdo->prepare("INSERT INTO leaderboard_weekly VALUES (?, ?, ?, ?, ?, '1.0.0', 'standard', ?, ?)")->execute([$uuid . '-w', $s[0], $s[1], $s[9], $s[7], $s[8], $tokenHash]);
            $pdo->prepare("INSERT INTO leaderboard_all_time VALUES (?, ?, ?, ?, ?, '1.0.0', 'standard', ?, ?)")->execute([$uuid . '-a', $s[0], $s[1], $s[9], $s[7], $s[8], $tokenHash]);
            $pdo->prepare("INSERT INTO leaderboard_best_day VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)")->execute([$uuid . '-bd', $s[0], $s[2], $s[9], $s[7], $s[3], $s[4], $tokenHash]);
            $pdo->prepare("INSERT INTO leaderboard_best_run VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?)")->execute([$uuid . '-br', $s[0], $s[1], $s[9], $s[7], 200 + $s[1], $tokenHash]);
            $pdo->prepare("INSERT INTO leaderboard_glasses_day VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)")->execute([$uuid . '-gd', $s[0], $s[6], $s[9], $s[7], $s[3], $s[4], $tokenHash]);
            $pdo->prepare("INSERT INTO leaderboard_glasses_run VALUES (?, ?, ?, ?, ?, '1.0.0', 'standard', ?, ?)")->execute([$uuid . '-gr', $s[0], $s[5], $s[9], $s[7], $s[8], $tokenHash]);
        }
    }
} catch (Exception $e) {
    jsonResponse(['ok' => false, 'code' => 'DB_INIT_ERROR', 'error' => 'Database connection failed: ' . $e->getMessage()], 500);
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
// Profanity & Nickname Filter
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
// Request Routing (Fail-safe for LiteSpeed, Apache, and cPanel PATH_INFO / URI)
// -----------------------------------------------------------------------------
$rawUri = $_SERVER['REQUEST_URI'] ?? '';
$parsedPath = parse_url($rawUri, PHP_URL_PATH) ?? '';

if (!empty($_GET['__route__'])) {
    $path = trim($_GET['__route__'], '/');
} elseif (!empty($_SERVER['PATH_INFO'])) {
    $path = trim($_SERVER['PATH_INFO'], '/');
} else {
    $path = preg_replace('#^.*?/api/?#i', '', $parsedPath);
    $path = trim(preg_replace('#^index\.php/?#i', '', $path), '/');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$bodyJson = file_get_contents('php://input');
$body = json_decode($bodyJson, true) ?: [];

// 1. Healthcheck
if ($path === 'health' || $path === '') {
    jsonResponse(['ok' => true, 'version' => '1.0.0', 'engine' => 'php-sqlite', 'timestamp' => gmdate('Y-m-d\TH:i:s\Z')]);
}

// 2. Validate Nickname
if ($path === 'validate-nickname' && $method === 'POST') {
    $name = $body['stand_name'] ?? '';
    $check = validateStandName($name);
    if (!$check['valid']) {
        jsonResponse(['ok' => false, 'valid' => false, 'code' => $check['code'], 'error' => $check['error']], 400);
    }
    jsonResponse(['ok' => true, 'valid' => true, 'stand_name' => $check['sanitized'], 'message' => '']);
}

// 3. Start Run & Issue Per-Run Seed
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

// 4. Fetch Leaderboards (All 7 Categories)
if (strpos($path, 'leaderboard') === 0 && $method === 'GET') {
    $category = str_replace('leaderboard/', '', $path);
    if ($category === 'leaderboard' || empty($category)) {
        $category = $_GET['category'] ?? 'all-time';
    }
    $category = str_replace('_', '-', $category);
    if ($category === 'alltime') $category = 'all-time';

    $tableMap = [
        'daily' => ['table' => 'leaderboard_daily', 'title' => 'Daily High Scores (Last 24 Hours)', 'unit' => 'cents'],
        'weekly' => ['table' => 'leaderboard_weekly', 'title' => 'Weekly High Scores', 'unit' => 'cents'],
        'all-time' => ['table' => 'leaderboard_all_time', 'title' => 'All-Time Profit Hall of Fame', 'unit' => 'cents'],
        'best-day' => ['table' => 'leaderboard_best_day', 'title' => 'Best Single-Day Profit', 'unit' => 'cents'],
        'best-run' => ['table' => 'leaderboard_best_run', 'title' => 'Best 12-Day Run', 'unit' => 'cents'],
        'glasses-day' => ['table' => 'leaderboard_glasses_day', 'title' => 'Most Glasses Sold in a Day', 'unit' => 'glasses'],
        'glasses-run' => ['table' => 'leaderboard_glasses_run', 'title' => 'Most Glasses Sold in a Full Run', 'unit' => 'glasses'],
    ];

    if (!isset($tableMap[$category])) {
        jsonResponse(['ok' => false, 'code' => 'INVALID_CATEGORY', 'error' => "Invalid category: $category"], 400);
    }

    $meta = $tableMap[$category];
    $mode = $_GET['mode'] ?? null;
    $limit = min(100, max(1, intval($_GET['limit'] ?? 25)));

    $sql = "SELECT id, stand_name, score, date, mode, version, stand_token FROM {$meta['table']}";
    $params = [];
    $where = [];

    if ($category === 'daily') {
        $where[] = "date >= ?";
        $params[] = gmdate('Y-m-d\TH:i:s\Z', time() - 86400);
    } elseif ($category === 'weekly') {
        $where[] = "date >= ?";
        $params[] = gmdate('Y-m-d\TH:i:s\Z', time() - 7 * 86400);
    }

    if ($mode && in_array(strtolower($mode), ['retro', '8-bit', 'modern'])) {
        $where[] = "mode = ?";
        $params[] = strtolower($mode);
    }

    if (!empty($where)) {
        $sql .= " WHERE " . implode(' AND ', $where);
    }
    $sql .= " ORDER BY score DESC, date DESC LIMIT " . $limit;

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $entries = [];
        foreach ($rows as $idx => $row) {
            $row['rank'] = $idx + 1;
            $row['score'] = intval($row['score']);
            $entries[] = $row;
        }

        jsonResponse([
            'ok' => true,
            'category' => $category,
            'title' => $meta['title'],
            'unit' => $meta['unit'],
            'count' => count($entries),
            'entries' => $entries
        ]);
    } catch (Exception $e) {
        jsonResponse(['ok' => false, 'code' => 'DB_READ_ERROR', 'error' => 'Could not fetch leaderboard.'], 500);
    }
}

// 5. Submit Score
if (($path === 'scores' || $path === 'leaderboard/submit' || $path === 'leaderboard') && $method === 'POST') {
    $nameCheck = validateStandName($body['stand_name'] ?? '');
    if (!$nameCheck['valid']) {
        jsonResponse(['ok' => false, 'code' => $nameCheck['code'], 'error' => $nameCheck['error']], 400);
    }
    $standName = $nameCheck['sanitized'];
    $score = intval($body['score'] ?? 0);
    $totalGlasses = intval($body['total_glasses_sold'] ?? 0);
    $bestDayProfit = intval($body['best_day_profit'] ?? 0);
    $bestDayGlasses = intval($body['best_day_glasses'] ?? 0);
    $daysPlayed = intval($body['days_played'] ?? 12);
    $mode = in_array($body['mode'] ?? '', ['retro', '8-bit', 'modern']) ? $body['mode'] : 'modern';
    $gameMode = in_array($body['game_mode'] ?? '', ['standard', 'endless']) ? $body['game_mode'] : 'standard';
    $rawToken = $body['stand_token'] ?? ($body['standToken'] ?? '');
    $tokenHash = hashStandToken($rawToken);

    if (empty($body['day_log']) || !is_array($body['day_log'])) {
        jsonResponse(['ok' => false, 'code' => 'MISSING_DAY_LOG', 'error' => 'A valid day_log is required.'], 400);
    }

    $timestamp = gmdate('Y-m-d\TH:i:s\Z');
    $uuid = bin2hex(random_bytes(16));
    $ids = [
        'daily' => $uuid . '-d',
        'weekly' => $uuid . '-w',
        'all_time' => $uuid . '-a',
        'best_day' => $uuid . '-bd',
        'best_run' => $uuid . '-br',
        'glasses_day' => $uuid . '-gd',
        'glasses_run' => $uuid . '-gr'
    ];

    $pdo->beginTransaction();
    try {
        $pdo->prepare("INSERT INTO leaderboard_daily (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)")->execute([$ids['daily'], $standName, $score, $timestamp, $mode, $gameMode, $daysPlayed, $tokenHash]);
        $pdo->prepare("INSERT INTO leaderboard_weekly (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)")->execute([$ids['weekly'], $standName, $score, $timestamp, $mode, $gameMode, $daysPlayed, $tokenHash]);
        $pdo->prepare("INSERT INTO leaderboard_all_time (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)")->execute([$ids['all_time'], $standName, $score, $timestamp, $mode, $gameMode, $daysPlayed, $tokenHash]);

        if ($bestDayProfit > 0) {
            $pdo->prepare("INSERT INTO leaderboard_best_day (id, stand_name, score, date, mode, version, day_number, weather, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)")->execute([$ids['best_day'], $standName, $bestDayProfit, $timestamp, $mode, intval($body['best_day_number'] ?? 1), $body['best_day_weather'] ?? 'sunny', $tokenHash]);
        }

        if ($gameMode === 'standard' && $daysPlayed === 12) {
            $pdo->prepare("INSERT INTO leaderboard_best_run (id, stand_name, score, date, mode, version, final_assets, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?)")->execute([$ids['best_run'], $standName, $score, $timestamp, $mode, intval($body['final_assets'] ?? ($score + 200)), $tokenHash]);
        }

        if ($bestDayGlasses > 0) {
            $pdo->prepare("INSERT INTO leaderboard_glasses_day (id, stand_name, score, date, mode, version, day_number, weather, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)")->execute([$ids['glasses_day'], $standName, $bestDayGlasses, $timestamp, $mode, intval($body['best_glasses_day_number'] ?? 1), $body['best_glasses_weather'] ?? 'sunny', $tokenHash]);
        }

        if ($totalGlasses > 0) {
            $pdo->prepare("INSERT INTO leaderboard_glasses_run (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)")->execute([$ids['glasses_run'], $standName, $totalGlasses, $timestamp, $mode, $gameMode, $daysPlayed, $tokenHash]);
        }

        // Clean up active save on run completion
        if (!empty($tokenHash)) {
            $pdo->prepare("DELETE FROM game_saves WHERE stand_token = ?")->execute([$tokenHash]);
        }

        $pdo->commit();

        jsonResponse([
            'ok' => true,
            'message' => 'Score verified and recorded on leaderboards!',
            'entry' => [
                'id' => $ids['all_time'],
                'ids' => $ids,
                'stand_name' => $standName,
                'score' => $score,
                'mode' => $mode,
                'date' => $timestamp,
                'version' => '1.0.0',
                'stand_token' => $tokenHash
            ]
        ], 201);
    } catch (Exception $e) {
        $pdo->rollBack();
        jsonResponse(['ok' => false, 'code' => 'DB_ERROR', 'error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

// 6. Active Game Save & Sync
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
    $stmt = $pdo->prepare("INSERT INTO game_saves (stand_token, stand_name, game_state, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(stand_token) DO UPDATE SET stand_name = excluded.stand_name, game_state = excluded.game_state, updated_at = excluded.updated_at");
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
