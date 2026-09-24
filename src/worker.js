const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MIN_RACE_MS = 8000;
const MAX_RACE_MS = 1000 * 60 * 10;
const TRACK_KEY = 'neon-city';

const CARS = {
  red: { key: 'red', name: 'VOLT R', speed: 90, acceleration: 84, braking: 77, handling: 72, nitro: 80 },
  purple: { key: 'purple', name: 'VIOLET X', speed: 85, acceleration: 92, braking: 70, handling: 90, nitro: 88 },
  blue: { key: 'blue', name: 'OCEAN GT', speed: 96, acceleration: 76, braking: 82, handling: 78, nitro: 94 },
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 1000,
    races INTEGER NOT NULL DEFAULT 0,
    best_time INTEGER,
    selected_car TEXT NOT NULL DEFAULT 'red',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS race_runs (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    car TEXT NOT NULL,
    track TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL DEFAULT 'active'
  );`,
  `CREATE TABLE IF NOT EXISTS race_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    time_ms INTEGER NOT NULL,
    car TEXT NOT NULL,
    track TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);`,
  `CREATE INDEX IF NOT EXISTS idx_race_results_time ON race_results(time_ms);`,
  `CREATE INDEX IF NOT EXISTS idx_race_results_user ON race_results(username);`,
];

let schemaReady = false;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (!env.DB) {
      return json({ error: 'Banco D1 não configurado. Crie um binding chamado DB no Cloudflare Dashboard.' }, 503);
    }

    try {
      await ensureSchema(env);
      return await handleApi(request, env, url);
    } catch (error) {
      console.error(error);
      return json({ error: 'Erro interno do servidor.' }, 500);
    }
  },
};

async function ensureSchema(env) {
  if (schemaReady) return;

  for (const statement of SCHEMA) {
    await env.DB.prepare(statement).run();
  }

  schemaReady = true;
}

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (pathname === '/api/health' && method === 'GET') {
    return json({ ok: true, service: 'neon-apex', database: 'd1' });
  }

  if (pathname === '/api/register' && method === 'POST') {
    const data = await readJson(request);
    const username = sanitizeUsername(data.player);
    const password = String(data.password || '');

    const validation = validateCredentials(username, password);
    if (validation) return json({ error: validation }, 400);

    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (existing) return json({ error: 'Esse usuário já existe.' }, 409);

    const salt = randomToken(16);
    const hash = await hashPassword(password, salt);
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO users (username, password_hash, password_salt, level, xp, coins, races, best_time, selected_car, created_at, updated_at)
      VALUES (?, ?, ?, 1, 0, 1000, 0, NULL, 'red', ?, ?)
    `).bind(username, hash, salt, now, now).run();

    const token = await createSession(env, username);
    const profile = await getProfile(env, username);
    return json({ ok: true, token, profile }, 201);
  }

  if (pathname === '/api/login' && method === 'POST') {
    const data = await readJson(request);
    const username = sanitizeUsername(data.player);
    const password = String(data.password || '');

    const validation = validateCredentials(username, password);
    if (validation) return json({ error: 'Usuário ou senha inválidos.' }, 400);

    const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    if (!user) return json({ error: 'Usuário ou senha inválidos.' }, 401);

    const valid = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!valid) return json({ error: 'Usuário ou senha inválidos.' }, 401);

    const token = await createSession(env, username);
    const profile = publicProfile(user);
    return json({ ok: true, token, profile });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const token = getBearer(request);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return json({ ok: true });
  }

  if (pathname === '/api/cars' && method === 'GET') {
    const session = await requireSession(request, env);
    if (session.response) return session.response;
    return json({ cars: Object.values(CARS) });
  }

  if (pathname === '/api/profile' && method === 'GET') {
    const session = await requireSession(request, env);
    if (session.response) return session.response;
    const profile = await getProfile(env, session.username);
    return json({ ok: true, profile, cars: Object.values(CARS) });
  }

  if (pathname === '/api/profile/car' && method === 'POST') {
    const session = await requireSession(request, env);
    if (session.response) return session.response;
    const data = await readJson(request);
    const car = String(data.car || '');
    if (!CARS[car]) return json({ error: 'Carro inválido.' }, 400);

    await env.DB.prepare('UPDATE users SET selected_car = ?, updated_at = ? WHERE username = ?')
      .bind(car, Date.now(), session.username).run();
    const profile = await getProfile(env, session.username);
    return json({ ok: true, profile });
  }

  if (pathname === '/api/race/cancel' && method === 'POST') {
    const session = await requireSession(request, env);
    if (session.response) return session.response;
    const data = await readJson(request);
    const raceId = String(data.raceId || '');
    if (!raceId) return json({ ok: true });
    await env.DB.prepare("UPDATE race_runs SET status = 'cancelled', finished_at = ? WHERE id = ? AND username = ? AND status = 'active'")
      .bind(Date.now(), raceId, session.username).run();
    return json({ ok: true });
  }

  if (pathname === '/api/leaderboard' && method === 'GET') {
    const result = await env.DB.prepare(`
      SELECT rr.username AS player, MIN(rr.time_ms) AS time
      FROM race_results rr
      GROUP BY rr.username
      ORDER BY time ASC, player ASC
      LIMIT 10
    `).all();
    return json({ scores: result.results || [] });
  }

  if (pathname === '/api/race/start' && method === 'POST') {
    const session = await requireSession(request, env);
    if (session.response) return session.response;
    const data = await readJson(request);
    const car = String(data.car || 'red');
    if (!CARS[car]) return json({ error: 'Carro inválido.' }, 400);

    const now = Date.now();
    const raceId = randomToken(24);
    await env.DB.prepare(`
      INSERT INTO race_runs (id, username, car, track, started_at, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).bind(raceId, session.username, car, TRACK_KEY, now).run();

    await env.DB.prepare('UPDATE users SET selected_car = ?, updated_at = ? WHERE username = ?')
      .bind(car, now, session.username).run();

    return json({ ok: true, raceId, startedAt: now });
  }

  if (pathname === '/api/race/finish' && method === 'POST') {
    const session = await requireSession(request, env);
    if (session.response) return session.response;
    const data = await readJson(request);
    const raceId = String(data.raceId || '');
    if (!raceId) return json({ error: 'Corrida inválida.' }, 400);

    const race = await env.DB.prepare('SELECT * FROM race_runs WHERE id = ? AND username = ?')
      .bind(raceId, session.username).first();
    if (!race || race.status !== 'active') return json({ error: 'Corrida não encontrada ou já finalizada.' }, 409);

    const now = Date.now();
    const elapsed = now - Number(race.started_at);
    if (elapsed < MIN_RACE_MS) {
      return json({ error: 'Resultado inválido: corrida concluída rápido demais.' }, 400);
    }
    if (elapsed > MAX_RACE_MS) {
      await env.DB.prepare("UPDATE race_runs SET status = 'expired', finished_at = ? WHERE id = ?")
        .bind(now, raceId).run();
      return json({ error: 'A corrida expirou.' }, 400);
    }

    const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(session.username).first();
    if (!user) return json({ error: 'Usuário não encontrado.' }, 401);

    const rewards = computeRewards(elapsed);
    const nextXp = Number(user.xp || 0) + rewards.xp;
    const nextCoins = Number(user.coins || 0) + rewards.coins;
    const nextLevel = computeLevel(nextXp);
    const nextBest = user.best_time == null ? elapsed : Math.min(Number(user.best_time), elapsed);

    await env.DB.batch([
      env.DB.prepare("UPDATE race_runs SET status = 'finished', finished_at = ? WHERE id = ?").bind(now, raceId),
      env.DB.prepare(`
        INSERT INTO race_results (username, time_ms, car, track, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(session.username, elapsed, race.car, race.track, now),
      env.DB.prepare(`
        UPDATE users
        SET races = races + 1, xp = ?, coins = ?, level = ?, best_time = ?, selected_car = ?, updated_at = ?
        WHERE username = ?
      `).bind(nextXp, nextCoins, nextLevel, nextBest, race.car, now, session.username),
    ]);

    const profile = await getProfile(env, session.username);
    return json({ ok: true, time: elapsed, rewards, profile });
  }

  return json({ error: 'Rota não encontrada.' }, 404);
}

async function createSession(env, username) {
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
  await env.DB.prepare('INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, username, now, now + SESSION_TTL_MS).run();
  return token;
}

async function requireSession(request, env) {
  const token = getBearer(request);
  if (!token) return { response: json({ error: 'Sessão não encontrada.' }, 401) };

  const session = await env.DB.prepare('SELECT * FROM sessions WHERE token = ?').bind(token).first();
  if (!session || Number(session.expires_at) < Date.now()) {
    if (session) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return { response: json({ error: 'Sessão expirada. Entre novamente.' }, 401) };
  }
  return { username: session.username, token };
}

async function getProfile(env, username) {
  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  return publicProfile(user);
}

function publicProfile(user) {
  if (!user) return null;
  return {
    player: user.username,
    level: Number(user.level || 1),
    xp: Number(user.xp || 0),
    coins: Number(user.coins || 0),
    races: Number(user.races || 0),
    bestTime: user.best_time == null ? null : Number(user.best_time),
    selectedCar: CARS[user.selected_car] ? user.selected_car : 'red',
  };
}

function computeLevel(xp) {
  return Math.max(1, Math.floor(Number(xp || 0) / 500) + 1);
}

function computeRewards(timeMs) {
  const seconds = timeMs / 1000;
  const coins = Math.max(180, Math.min(650, Math.round(760 - seconds * 6)));
  const xp = Math.max(90, Math.min(350, Math.round(400 - seconds * 3)));
  return { coins, xp };
}

function validateCredentials(username, password) {
  if (username.length < 3 || username.length > 16) return 'O usuário deve ter de 3 a 16 caracteres.';
  if (!/^[\p{L}\p{N}_-]+$/u.test(username)) return 'Use apenas letras, números, hífen ou underline no usuário.';
  if (password.length < 5 || password.length > 72) return 'A senha deve ter de 5 a 72 caracteres.';
  return null;
}

function sanitizeUsername(value) {
  return String(value || '').trim().slice(0, 16);
}

function getBearer(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function hashPassword(password, saltHex) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: hexToBytes(saltHex),
    iterations: 100000,
    hash: 'SHA-256',
  }, keyMaterial, 256);
  return bytesToHex(new Uint8Array(bits));
}

async function verifyPassword(password, salt, expectedHash) {
  const actual = await hashPassword(password, salt);
  return timingSafeStringEqual(actual, String(expectedHash || ''));
}

function timingSafeStringEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const clean = String(hex || '');
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    },
  });
}
