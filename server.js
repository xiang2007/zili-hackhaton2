'use strict';

require('./src/env');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const geo = require('./src/geo');
const opencellid = require('./src/opencellid');
const dashboardData = require('./src/dashboard-data');
const scheduler = require('./src/scheduler');

const app = express();
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const GEOJSON_PATH = path.join(DATA_DIR, 'dashboard_data_v6_kl.geojson');
const CSV_PATH = path.join(DATA_DIR, 'uhvi_areas_v6.csv');
const AUTH_DB_PATH = process.env.AUTH_DB_PATH || path.join(DATA_DIR, 'navi-auth.sqlite');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 310000;

fs.mkdirSync(path.dirname(AUTH_DB_PATH), { recursive: true });
let authDb = null;
let jsonAuth = null;
let jsonAuthPath = null;
try {
  const { DatabaseSync } = require('node:sqlite');
  authDb = new DatabaseSync(AUTH_DB_PATH);
  fs.chmodSync(AUTH_DB_PATH, 0o600);
  authDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_iterations INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
  `);
} catch (error) {
  jsonAuthPath = `${AUTH_DB_PATH}.json`;
  try {
    jsonAuth = JSON.parse(fs.readFileSync(jsonAuthPath, 'utf8'));
  } catch (readError) {
    jsonAuth = { nextUserId: 1, users: [], sessions: [] };
  }
  jsonAuth.nextUserId = Number(jsonAuth.nextUserId) || 1;
  jsonAuth.users = Array.isArray(jsonAuth.users) ? jsonAuth.users : [];
  jsonAuth.sessions = Array.isArray(jsonAuth.sessions) ? jsonAuth.sessions : [];
  fs.writeFileSync(jsonAuthPath, `${JSON.stringify(jsonAuth, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(jsonAuthPath, 0o600);
  console.warn('[auth] node:sqlite is unavailable; using the Node 18 JSON auth fallback. Upgrade to Node 22+ for SQLite-backed auth.');
}

function saveJsonAuth() {
  if (!jsonAuthPath) return;
  fs.writeFileSync(jsonAuthPath, `${JSON.stringify(jsonAuth, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(jsonAuthPath, 0o600);
}

function removeExpiredJsonSessions(now = Date.now()) {
  if (!jsonAuth) return;
  const active = jsonAuth.sessions.filter((session) => session.expires_at > now);
  if (active.length !== jsonAuth.sessions.length) {
    jsonAuth.sessions = active;
    saveJsonAuth();
  }
}

let geojsonCache = null;

function loadGeojson() {
  if (!geojsonCache) {
    geojsonCache = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));
  }
  return geojsonCache;
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').flatMap((part) => {
    const separator = part.indexOf('=');
    if (separator === -1) return [];
    return [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]];
  }));
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateCredentials(username, password) {
  if (username.length < 3 || username.length > 80) return 'Use a username or email between 3 and 80 characters.';
  if (!/^[a-z0-9._+@-]+$/i.test(username)) return 'Use letters, numbers, dots, underscores, hyphens, @, or + in the username.';
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) return 'Use a password between 10 and 256 characters.';
  return null;
}

function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function userCount() {
  if (jsonAuth) return jsonAuth.users.length;
  return authDb.prepare('SELECT COUNT(*) AS count FROM users').get().count;
}

function getSessionUser(request) {
  const token = parseCookies(request).navi_session;
  if (!token) return null;
  const now = Date.now();
  if (jsonAuth) {
    removeExpiredJsonSessions(now);
    const session = jsonAuth.sessions.find((item) => item.token_hash === hashSessionToken(token) && item.expires_at > now);
    return session ? jsonAuth.users.find((user) => user.id === session.user_id) || null : null;
  }
  authDb.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  return authDb.prepare(`
    SELECT users.id, users.username
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashSessionToken(token), now) || null;
}

function setSession(response, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  if (jsonAuth) {
    removeExpiredJsonSessions(Date.now());
    jsonAuth.sessions = jsonAuth.sessions.filter((session) => session.user_id !== userId);
    jsonAuth.sessions.push({ token_hash: hashSessionToken(token), user_id: userId, expires_at: expiresAt });
    saveJsonAuth();
  } else {
    authDb.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    authDb.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashSessionToken(token), userId, expiresAt);
  }
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `navi_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`);
}

function clearSession(request, response) {
  const token = parseCookies(request).navi_session;
  if (token && jsonAuth) {
    jsonAuth.sessions = jsonAuth.sessions.filter((session) => session.token_hash !== hashSessionToken(token));
    saveJsonAuth();
  } else if (token) {
    authDb.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token));
  }
  response.setHeader('Set-Cookie', 'navi_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function requireAuthentication(request, response, next) {
  const user = getSessionUser(request);
  if (user) {
    request.user = user;
    next();
    return;
  }
  if (request.path.startsWith('/api/')) {
    response.status(401).json({ error: 'Sign in is required.' });
    return;
  }
  response.redirect('/login');
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/login', (req, res) => {
  if (getSessionUser(req)) {
    res.redirect('/');
    return;
  }
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.get('/api/auth/status', (req, res) => {
  const user = getSessionUser(req);
  res.json({ authenticated: Boolean(user), setupRequired: userCount() === 0, user: user ? { username: user.username } : null });
});

app.post('/api/auth/setup', (req, res) => {
  if (userCount() !== 0) {
    res.status(409).json({ error: 'An operator account already exists. Please sign in.' });
    return;
  }
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;
  const error = validateCredentials(username, password);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  try {
    let userId;
    if (jsonAuth) {
      if (jsonAuth.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) throw new Error('duplicate');
      userId = jsonAuth.nextUserId;
      jsonAuth.nextUserId += 1;
      jsonAuth.users.push({ id: userId, username, password_hash: passwordHash, password_salt: salt, password_iterations: PASSWORD_ITERATIONS });
      saveJsonAuth();
    } else {
      const result = authDb.prepare('INSERT INTO users (username, password_hash, password_salt, password_iterations) VALUES (?, ?, ?, ?)').run(username, passwordHash, salt, PASSWORD_ITERATIONS);
      userId = Number(result.lastInsertRowid);
    }
    setSession(res, userId);
    res.status(201).json({ ok: true, username });
  } catch (err) {
    res.status(409).json({ error: 'That username is already in use.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;
  const user = jsonAuth
    ? jsonAuth.users.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase())
    : authDb.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || typeof password !== 'string') {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
  const candidate = hashPassword(password, user.password_salt, user.password_iterations);
  const stored = Buffer.from(user.password_hash, 'hex');
  const supplied = Buffer.from(candidate, 'hex');
  if (stored.length !== supplied.length || !crypto.timingSafeEqual(stored, supplied)) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
  setSession(res, user.id);
  res.json({ ok: true, username: user.username });
});

app.post('/api/auth/logout', (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use(requireAuthentication);
app.use(express.static(PUBLIC_DIR));
app.use('/data', express.static(DATA_DIR));

app.get('/api/meta', (req, res) => {
  try {
    const geojson = loadGeojson();
    res.json({
      dataset: {
        name: 'dashboard_data_v6_kl',
        schema_version: 6,
        feature_count: geojson.features.length,
        bounds: geo.bounds(geojson)
      },
      reference_maps: {
        uhvi: '/assets/UHVI_Klang_Valley_v6.pdf',
        baseline_lst: '/assets/LST_Baseline_Klang_Valley_v6.pdf',
        greening_delta: '/assets/Delta_Greening_Klang_Valley_v6.pdf',
        industrial_delta: '/assets/Delta_Industrial_Klang_Valley_v6.pdf'
      },
      cells: opencellid.getMeta() || null,
      thresholds: opencellid.THRESHOLDS,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(err && err.code === 'ENOENT' ? 404 : 500).json({ error: err.message });
  }
});

app.get('/api/geojson', (req, res) => {
  try {
    res.json(loadGeojson());
  } catch (err) {
    res.status(err && err.code === 'ENOENT' ? 404 : 500).json({ error: err.message });
  }
});

app.get('/api/csv', (req, res) => {
  try {
    const csv = fs.readFileSync(CSV_PATH, 'utf8');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  } catch (err) {
    res.status(err && err.code === 'ENOENT' ? 404 : 500).json({ error: err.message });
  }
});

app.get('/api/cells', (req, res) => {
  res.json(opencellid.getCells());
});

app.get('/api/cells/meta', (req, res) => {
  res.json(opencellid.getMeta() || {});
});

app.post('/api/cells/refresh', async (req, res) => {
  try {
    const meta = await opencellid.refresh();
    const built = dashboardData.build();
    res.json({ ok: true, count: meta.count, fetched_at: meta.fetched_at, sites: built.sites, grid_cells: built.gridCells });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Navi Heat Dashboard listening on http://localhost:${port}`);
  scheduler.start();
});

module.exports = app;
