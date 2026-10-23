// Cloudflare Pages Function: anonymous player observations for a game.
//
// Requires a D1 binding named DB and a secret named FEEDBACK_SECRET.
// The table is created / migrated automatically on first use, so a missing
// schema no longer causes "提交失败". See FEEDBACK_SETUP.md.
//
// GET  /api/feedback?game=steam:123&voter=<uuid>  -> counts, total, your vote
// GET  /api/feedback?health=1                     -> configuration check
// POST /api/feedback {game, vote, voter}          -> record or change your vote

const VOTES = ['no_ai_suspected', 'some_ai_suspected', 'heavy_ai_suspected', 'all_ai_suspected'];
const allowed = new Set(VOTES);

// Abuse limits. Shared networks (schools, offices, dorms) are allowed several
// voters per game; beyond that votes are kept but flagged and excluded from
// the public counts instead of being rejected outright.
const PER_GAME_PER_NETWORK = 5;
const NEW_VOTES_PER_NETWORK_PER_HOUR = 30;

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

const validKey = (k) => typeof k === 'string' && /^(steam:[0-9]{1,12}|name:[^<>\\\x00-\x1f]{1,120})$/.test(k);
const validVoter = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const readyDbs = new WeakSet();
async function ensureSchema(db) {
  if (readyDbs.has(db)) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS game_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_key TEXT NOT NULL,
    vote TEXT NOT NULL CHECK(vote IN ('no_ai_suspected','some_ai_suspected','heavy_ai_suspected','all_ai_suspected')),
    visitor_hash TEXT NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_key,visitor_hash)
  )`).run();
  const { results } = await db.prepare('PRAGMA table_info(game_feedback)').all();
  const columns = new Set(results.map((c) => c.name));
  if (!columns.has('ip_hash')) await db.prepare('ALTER TABLE game_feedback ADD COLUMN ip_hash TEXT').run();
  if (!columns.has('updated_at')) await db.prepare('ALTER TABLE game_feedback ADD COLUMN updated_at TEXT').run();
  if (!columns.has('flagged')) await db.prepare('ALTER TABLE game_feedback ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_game_feedback_game_vote ON game_feedback(game_key,vote)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_game_feedback_ip ON game_feedback(ip_hash,created_at)').run();
  readyDbs.add(db);
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, '0')).join('');
}
const voterHash = (secret, voter) => hmac(secret, `voter:${voter.toLowerCase()}`).then((h) => `v:${h}`);

async function summary(db, game, mineHash) {
  const { results } = await db
    .prepare('SELECT vote, COUNT(*) AS count FROM game_feedback WHERE game_key = ? AND flagged = 0 GROUP BY vote')
    .bind(game).all();
  const counts = Object.fromEntries(VOTES.map((v) => [v, 0]));
  for (const row of results) if (allowed.has(row.vote)) counts[row.vote] = Number(row.count) || 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  let mine = null;
  if (mineHash) {
    const row = await db.prepare('SELECT vote FROM game_feedback WHERE game_key = ? AND visitor_hash = ?').bind(game, mineHash).first();
    mine = row?.vote || null;
  }
  return { game, counts, total, mine };
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.has('health')) {
    const status = { db: Boolean(env.DB), secret: Boolean(env.FEEDBACK_SECRET), schema: false };
    if (env.DB) {
      try { await ensureSchema(env.DB); status.schema = true; } catch (e) { status.schemaError = String(e?.message || e).slice(0, 200); }
    }
    status.writable = status.db && status.secret && status.schema;
    return respond(status, status.writable ? 200 : 503);
  }
  if (!env.DB) return respond({ error: 'not_configured', missing: 'DB', writable: false }, 503);
  const game = url.searchParams.get('game');
  if (!validKey(game)) return respond({ error: 'invalid_game' }, 400);
  try {
    await ensureSchema(env.DB);
    const voter = url.searchParams.get('voter');
    const mineHash = env.FEEDBACK_SECRET && validVoter(voter) ? await voterHash(env.FEEDBACK_SECRET, voter) : null;
    return respond({ ...(await summary(env.DB, game, mineHash)), writable: Boolean(env.FEEDBACK_SECRET) });
  } catch (e) {
    console.error('feedback GET failed', e);
    return respond({ error: 'read_failed', writable: false }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.FEEDBACK_SECRET) {
    return respond({ error: 'not_configured', missing: !env.DB ? 'DB' : 'FEEDBACK_SECRET' }, 503);
  }
  if (!sameOrigin(request)) return respond({ error: 'bad_origin' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 4096) return respond({ error: 'too_large' }, 413);

  let data;
  try { data = await request.json(); } catch { return respond({ error: 'invalid_json' }, 400); }
  const { game, vote, voter } = data || {};
  if (!validKey(game) || !allowed.has(vote) || !validVoter(voter)) return respond({ error: 'invalid_feedback' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  try {
    await ensureSchema(env.DB);
    const db = env.DB;
    const mineHash = await voterHash(env.FEEDBACK_SECRET, voter);
    const ipHash = ip ? await hmac(env.FEEDBACK_SECRET, `ip:${ip}`) : null;

    const existing = await db
      .prepare('SELECT id, vote FROM game_feedback WHERE game_key = ? AND visitor_hash = ?')
      .bind(game, mineHash).first();

    if (existing) {
      if (existing.vote !== vote) {
        await db.prepare('UPDATE game_feedback SET vote = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(vote, existing.id).run();
      }
      return respond({ ok: true, changed: existing.vote !== vote, ...(await summary(db, game, mineHash)) }, 200);
    }

    let flagged = 0;
    if (ipHash) {
      const recent = await db
        .prepare("SELECT COUNT(*) AS n FROM game_feedback WHERE ip_hash = ? AND created_at > datetime('now','-1 hour')")
        .bind(ipHash).first();
      if (Number(recent?.n) >= NEW_VOTES_PER_NETWORK_PER_HOUR) return respond({ error: 'rate_limited' }, 429);
      const sameGame = await db
        .prepare('SELECT COUNT(*) AS n FROM game_feedback WHERE game_key = ? AND ip_hash = ? AND flagged = 0')
        .bind(game, ipHash).first();
      if (Number(sameGame?.n) >= PER_GAME_PER_NETWORK) flagged = 1;
    }

    await db
      .prepare('INSERT INTO game_feedback (game_key, vote, visitor_hash, ip_hash, flagged) VALUES (?, ?, ?, ?, ?)')
      .bind(game, vote, mineHash, ipHash, flagged).run();
    // A flagged vote is stored for review but not shown in public counts.
    // The voter still sees their own choice so the UI stays consistent.
    return respond({ ok: true, created: true, ...(await summary(db, game, mineHash)) }, 201);
  } catch (e) {
    console.error('feedback POST failed', e);
    return respond({ error: 'write_failed' }, 500);
  }
}
