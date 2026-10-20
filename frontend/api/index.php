<?php
/**
 * Lemonade Stand - PHP Backend API for Apache / JetHost / cPanel Hosting
 * Supports PHP 7.4+ and 8.x with built-in PDO SQLite.
 * Provides all 8 SQLite leaderboard tables, strict family-friendly filtering,
 * score integrity checksum verification, and game save synchronization.
 */

error_reporting(0);
ini_set('display_errors', '0');

// CORS Headers
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// Helper to return JSON response
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
    // Protect data directory from direct browser downloads
    file_put_contents($dataDir . '/.htaccess', "Deny from all\n");
}

$dbFile = $dataDir . '/lemonadestand.db';

try {
    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode = WAL;');
    $pdo->exec('PRAGMA foreign_keys = ON;');
} catch (Exception $e) {
    jsonResponse(['ok' => false, 'error' => 'Database connection failed: ' . $e->getMessage()], 500);
}

// Ensure schema tables exist
$pdo->exec("
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

CREATE TABLE IF NOT EXISTS game_saves (
    stand_token TEXT PRIMARY KEY,
    stand_name TEXT NOT NULL,
    game_state TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_saves_token ON game_saves (stand_token);
");

// -----------------------------------------------------------------------------
// Profanity & Nickname Filter
// -----------------------------------------------------------------------------
const FRIENDLY_FAILURE_MSG = "Please choose a friendly, family-safe stand name (3-12 letters, numbers, or underscores). Let's keep Lemonadeville welcoming for everyone!";

const BANNED_WORDS = [
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

function validateStandName($input) {
    if (!is_string($input)) {
        return ['valid' => false, 'error' => FRIENDLY_FAILURE_MSG];
    }
    $trimmed = trim($input);
    if (!preg_match('/^[A-Za-z0-9_]{3,12}$/', $trimmed)) {
        return ['valid' => false, 'error' => FRIENDLY_FAILURE_MSG];
    }

    $lower = strtolower($trimmed);
    $leetMap1 = ['0'=>'o','1'=>'i','2'=>'z','3'=>'e','4'=>'a','5'=>'s','6'=>'g','7'=>'t','8'=>'b','9'=>'g','@'=>'a','$'=>'s','!'=>'i','+'=>'t'];
    $leetMap2 = ['0'=>'o','1'=>'l','2'=>'s','3'=>'e','4'=>'a','5'=>'s','6'=>'b','7'=>'t','8'=>'b','9'=>'g','@'=>'a','$'=>'s','!'=>'l','+'=>'t'];
    
    $c1 = strtr($lower, $leetMap1);
    $c2 = strtr($lower, $leetMap2);
    $c3 = preg_replace('/(.)\1+/', '$1', $c1);
    $c4 = preg_replace('/(.)\1+/', '$1', $c2);

    $candidates = [$lower, $c1, $c2, $c3, $c4];
    foreach ($candidates as $cand) {
        $noUnderscore = str_replace('_', '', $cand);
        foreach (BANNED_WORDS as $banned) {
            if (strpos($cand, $banned) !== false || strpos($noUnderscore, $banned) !== false) {
                return ['valid' => false, 'error' => FRIENDLY_FAILURE_MSG];
            }
        }
    }

    return ['valid' => true, 'sanitized' => $trimmed];
}

// -----------------------------------------------------------------------------
// Checksum Calculation (FNV-1a 32-bit)
// -----------------------------------------------------------------------------
function computeRunChecksum($standName, $score, $totalGlasses, $bestDayProfit, $bestDayGlasses, $daysPlayed) {
    $payload = strtolower((string)$standName) . "|{$score}|{$totalGlasses}|{$bestDayProfit}|{$bestDayGlasses}|{$daysPlayed}|LEMSTAND_V1_SALT";
    $hash = 2166136261;
    $len = strlen($payload);
    for ($i = 0; $i < $len; $i++) {
        $hash ^= ord($payload[$i]);
        // 32-bit multiplication
        $hash = ($hash * 16777619) & 0xFFFFFFFF;
    }
    return str_pad(dechex($hash), 8, '0', STR_PAD_LEFT);
}

// -----------------------------------------------------------------------------
// Request Routing
// -----------------------------------------------------------------------------
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Normalize uri: remove leading /api or /lemstand/api or script path
$path = preg_replace('#^.*?/api/?#i', '', $uri);
$path = trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'];
$bodyJson = file_get_contents('php://input');
$body = json_decode($bodyJson, true) ?: [];

// 1. Health Check
if ($path === 'health' || $path === '') {
    jsonResponse(['ok' => true, 'version' => '1.0.0', 'engine' => 'php-sqlite', 'time' => gmdate('Y-m-d\TH:i:s\Z')]);
}

// 2. Validate Nickname
if ($path === 'validate-nickname' && $method === 'POST') {
    $name = $body['stand_name'] ?? '';
    $check = validateStandName($name);
    if (!$check['valid']) {
        jsonResponse(['ok' => false, 'error' => $check['error']], 400);
    }
    jsonResponse(['ok' => true, 'sanitized' => $check['sanitized']]);
}

// 3. Score Submission
if (($path === 'scores' || $path === 'leaderboard/submit' || $path === 'leaderboard') && $method === 'POST') {
    $nameCheck = validateStandName($body['stand_name'] ?? '');
    if (!$nameCheck['valid']) {
        jsonResponse(['ok' => false, 'error' => $nameCheck['error']], 400);
    }
    $standName = $nameCheck['sanitized'];
    $score = intval($body['score'] ?? 0);
    $totalGlasses = intval($body['total_glasses_sold'] ?? 0);
    $bestDayProfit = intval($body['best_day_profit'] ?? 0);
    $bestDayGlasses = intval($body['best_day_glasses'] ?? 0);
    $daysPlayed = intval($body['days_played'] ?? 12);
    $mode = in_array($body['mode'] ?? '', ['retro', '8-bit', 'modern']) ? $body['mode'] : 'modern';
    $gameMode = in_array($body['game_mode'] ?? '', ['standard', 'endless']) ? $body['game_mode'] : 'standard';
    $standToken = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($body['stand_token'] ?? ''));

    // Checksum verification
    if (!empty($body['integrity_hash'])) {
        $expectedHash = computeRunChecksum($standName, $score, $totalGlasses, $bestDayProfit, $bestDayGlasses, $daysPlayed);
        if (strtolower($body['integrity_hash']) !== strtolower($expectedHash)) {
            jsonResponse(['ok' => false, 'error' => 'Score submission integrity check failed.'], 403);
        }
    }

    $timestamp = gmdate('Y-m-d\TH:i:s\Z');
    $uuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );

    $pdo->beginTransaction();
    try {
        $stmtDaily = $pdo->prepare("INSERT INTO leaderboard_daily (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)");
        $stmtDaily->execute([$uuid . '-d', $standName, $score, $timestamp, $mode, $gameMode, $daysPlayed, $standToken]);

        $stmtWeekly = $pdo->prepare("INSERT INTO leaderboard_weekly (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)");
        $stmtWeekly->execute([$uuid . '-w', $standName, $score, $timestamp, $mode, $gameMode, $daysPlayed, $standToken]);

        $stmtAllTime = $pdo->prepare("INSERT INTO leaderboard_all_time (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)");
        $stmtAllTime->execute([$uuid . '-a', $standName, $score, $timestamp, $mode, $gameMode, $daysPlayed, $standToken]);

        if ($bestDayProfit > 0) {
            $stmtBestDay = $pdo->prepare("INSERT INTO leaderboard_best_day (id, stand_name, score, date, mode, version, day_number, weather, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, 'sunny', ?)");
            $stmtBestDay->execute([$uuid . '-bd', $standName, $bestDayProfit, $timestamp, $mode, intval($body['best_day_number'] ?? 1), $standToken]);
        }

        if ($gameMode === 'standard' && $daysPlayed === 12) {
            $stmtBestRun = $pdo->prepare("INSERT INTO leaderboard_best_run (id, stand_name, score, date, mode, version, final_assets, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?)");
            $stmtBestRun->execute([$uuid . '-br', $standName, $score, $timestamp, $mode, intval($body['final_assets'] ?? $score), $standToken]);
        }

        if ($bestDayGlasses > 0) {
            $stmtGDay = $pdo->prepare("INSERT INTO leaderboard_glasses_day (id, stand_name, score, date, mode, version, day_number, weather, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, 'sunny', ?)");
            $stmtGDay->execute([$uuid . '-gd', $standName, $bestDayGlasses, $timestamp, $mode, intval($body['best_day_number'] ?? 1), $standToken]);
        }

        if ($totalGlasses > 0) {
            $stmtGRun = $pdo->prepare("INSERT INTO leaderboard_glasses_run (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token) VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)");
            $stmtGRun->execute([$uuid . '-gr', $standName, $totalGlasses, $timestamp, $mode, $gameMode, $daysPlayed, $standToken]);
        }

        $pdo->commit();
        jsonResponse([
            'ok' => true,
            'entry' => [
                'id' => $uuid,
                'stand_name' => $standName,
                'score' => $score,
                'mode' => $mode,
                'stand_token' => $standToken
            ]
        ], 201);
    } catch (Exception $e) {
        $pdo->rollBack();
        jsonResponse(['ok' => false, 'error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

// 4. Fetch Leaderboards
if (strpos($path, 'leaderboard') === 0 && $method === 'GET') {
    $category = str_replace('leaderboard/', '', $path);
    if ($category === 'leaderboard' || empty($category)) {
        $category = $_GET['category'] ?? 'all-time';
    }
    $category = str_replace('_', '-', $category);
    if ($category === 'alltime') $category = 'all-time';

    $tableMap = [
        'daily' => ['table' => 'leaderboard_daily', 'title' => 'Daily High Scores', 'unit' => 'cents'],
        'weekly' => ['table' => 'leaderboard_weekly', 'title' => 'Weekly High Scores', 'unit' => 'cents'],
        'all-time' => ['table' => 'leaderboard_all_time', 'title' => 'All-Time Profit Hall of Fame', 'unit' => 'cents'],
        'best-day' => ['table' => 'leaderboard_best_day', 'title' => 'Best Single-Day Profit', 'unit' => 'cents'],
        'best-run' => ['table' => 'leaderboard_best_run', 'title' => 'Best 12-Day Run', 'unit' => 'cents'],
        'glasses-day' => ['table' => 'leaderboard_glasses_day', 'title' => 'Most Glasses Sold in a Day', 'unit' => 'glasses'],
        'glasses-run' => ['table' => 'leaderboard_glasses_run', 'title' => 'Most Glasses Sold in a Full Run', 'unit' => 'glasses'],
    ];

    if (!isset($tableMap[$category])) {
        jsonResponse(['ok' => false, 'error' => "Invalid category: $category"], 400);
    }

    $meta = $tableMap[$category];
    $mode = $_GET['mode'] ?? null;
    $limit = min(100, max(1, intval($_GET['limit'] ?? 50)));

    $sql = "SELECT id, stand_name, score, date, mode, version, stand_token FROM {$meta['table']}";
    $params = [];
    if ($mode && in_array(strtolower($mode), ['retro', '8-bit', 'modern'])) {
        $sql .= " WHERE mode = ?";
        $params[] = strtolower($mode);
    }
    $sql .= " ORDER BY score DESC, date DESC LIMIT " . $limit;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $entries = [];
    foreach ($rows as $idx => $row) {
        $row['rank'] = $idx + 1;
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
}

// 5. Active Game Save & Sync
if ($path === 'save' && $method === 'POST') {
    $standToken = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($body['standToken'] ?? ''));
    $state = $body['state'] ?? null;
    if (empty($standToken) || empty($state)) {
        jsonResponse(['ok' => false, 'error' => 'standToken and state required.'], 400);
    }
    $standName = $state['standName'] ?? 'Lemonade Stand';
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $stmt = $pdo->prepare("INSERT OR REPLACE INTO game_saves (stand_token, stand_name, game_state, updated_at) VALUES (?, ?, ?, ?)");
    $stmt->execute([$standToken, $standName, json_encode($state), $now]);
    jsonResponse(['ok' => true, 'updated_at' => $now]);
}

if (strpos($path, 'save/') === 0) {
    $token = preg_replace('/[^A-Za-z0-9_-]/', '', substr($path, 5));
    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT game_state FROM game_saves WHERE stand_token = ?");
        $stmt->execute([$token]);
        $row = $stmt->fetch();
        if (!$row) {
            jsonResponse(['ok' => false, 'error' => 'No saved game found for this token.'], 404);
        }
        jsonResponse(['ok' => true, 'state' => json_decode($row['game_state'], true)]);
    } elseif ($method === 'DELETE') {
        $stmt = $pdo->prepare("DELETE FROM game_saves WHERE stand_token = ?");
        $stmt->execute([$token]);
        jsonResponse(['ok' => true]);
    }
}

// Fallback: 404 Not Found
jsonResponse(['ok' => false, 'error' => 'API endpoint not found.'], 404);
