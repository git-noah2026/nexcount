/**
 * NEXCOUNT – Buchhaltungs- & Lagersystem by Andrerer
 * Cloudflare Worker: Anmeldung, Teams, Synchronisierung (D1) und Live-Updates (Durable Object + WebSocket)
 */
import { DurableObject } from 'cloudflare:workers';

const COLLECTIONS = new Set(['articles', 'movements', 'contacts', 'documents', 'entries', 'settings']);
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_RECORD = 256 * 1024;
const PAGE = 1000; // Datensätze pro Sync-Antwort
const PBKDF2_ITER = 100000; // Maximum in Workers

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

// ---------------------------------------------------------------- Hilfen
const enc = new TextEncoder();
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const newInviteCode = () => hex(crypto.getRandomValues(new Uint8Array(5))).toUpperCase();
const newToken = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...headers },
  });
}
async function readJson(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) throw httpError(413, 'Anfrage zu groß');
  const text = await request.text();
  if (text.length > MAX_BODY) throw httpError(413, 'Anfrage zu groß');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw httpError(400, 'Ungültiges JSON');
  }
}
function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---------------------------------------------------------------- Passwörter (PBKDF2-SHA256, WebCrypto)
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITER))}`;
}
async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2') return false;
  const calc = await pbkdf2(password, unb64(salt), Number(iter));
  const ref = unb64(hash);
  if (calc.length !== ref.length) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(calc, ref);
  let diff = 0;
  for (let i = 0; i < calc.length; i++) diff |= calc[i] ^ ref[i];
  return diff === 0;
}
const DUMMY_HASH = `pbkdf2$${PBKDF2_ITER}$${'A'.repeat(22)}==$${'A'.repeat(43)}=`;

// ---------------------------------------------------------------- Begrenzung von Anmeldeversuchen
async function rateLimit(env, request, key, max, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at < ?3 THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < ?3 THEN ?2 ELSE rate_limits.reset_at END
     RETURNING count`
  ).bind(`${key}:${ip}`, now + windowMs, now).first();
  if (row && row.count > max) throw httpError(429, 'Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.');
}

// ---------------------------------------------------------------- Sitzungen
function sessionCookie(url, token, maxAgeSec) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `nc_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
async function createSession(env, url, userId) {
  const token = newToken();
  const now = Date.now();
  return {
    stmt: env.DB.prepare('INSERT INTO sessions (hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, now, now + SESSION_TTL),
    cookie: sessionCookie(url, token, SESSION_TTL / 1000),
  };
}
async function getSession(env, request) {
  const token = parseCookies(request.headers.get('Cookie')).nc_session;
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT s.hash AS session_hash, u.id, u.name, u.email, u.role, u.password_hash, u.created_at,
            c.id AS company_id, c.name AS company_name, c.invite_code, c.seq, c.created_at AS company_created
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN companies c ON c.id = u.company_id
      WHERE s.hash = ? AND s.expires_at > ?`
  ).bind(await sha256(token), Date.now()).first();
  if (!row) return null;
  return {
    sessionHash: row.session_hash,
    user: { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at, passwordHash: row.password_hash },
    company: { id: row.company_id, name: row.company_name, inviteCode: row.invite_code, seq: row.seq, createdAt: row.company_created },
  };
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt ?? u.created_at });
async function mePayload(env, { user, company }) {
  const admin = user.role === 'admin';
  let members = [];
  if (admin) {
    const rs = await env.DB.prepare('SELECT id, name, email, role, created_at FROM users WHERE company_id = ? ORDER BY name').bind(company.id).all();
    members = rs.results.map(publicUser);
  }
  return {
    user: publicUser(user),
    company: { id: company.id, name: company.name, createdAt: company.createdAt, ...(admin ? { inviteCode: company.inviteCode } : {}) },
    members,
  };
}

const hub = (env, companyId) => env.SYNC_HUB.get(env.SYNC_HUB.idFromName(companyId));

// ---------------------------------------------------------------- Auth-Endpunkte
async function register(request, env, url) {
  await rateLimit(env, request, 'register', 10);
  const b = await readJson(request);
  const name = str(b.name, 80);
  const email = str(b.email, 120).toLowerCase();
  const password = String(b.password || '');
  if (!name) throw httpError(400, 'Bitte gib deinen Namen an.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Ungültige E-Mail-Adresse.');
  if (password.length < 8 || password.length > 200) throw httpError(400, 'Das Passwort muss mindestens 8 Zeichen lang sein.');
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) throw httpError(409, 'Diese E-Mail-Adresse ist bereits registriert.');

  const stmts = [];
  let company;
  let role;
  const code = str(b.inviteCode, 20).toUpperCase();
  if (code) {
    const c = await env.DB.prepare('SELECT id, name, invite_code, seq, created_at FROM companies WHERE invite_code = ?').bind(code).first();
    if (!c) throw httpError(400, 'Einladungscode ist ungültig.');
    company = { id: c.id, name: c.name, inviteCode: c.invite_code, seq: c.seq, createdAt: c.created_at };
    role = 'member';
  } else {
    const companyName = str(b.companyName, 120);
    if (!companyName) throw httpError(400, 'Bitte gib einen Firmennamen an.');
    company = { id: crypto.randomUUID(), name: companyName, inviteCode: newInviteCode(), seq: 0, createdAt: Date.now() };
    stmts.push(env.DB.prepare('INSERT INTO companies (id, name, invite_code, seq, created_at) VALUES (?, ?, ?, 0, ?)').bind(company.id, company.name, company.inviteCode, company.createdAt));
    role = 'admin';
  }
  const user = { id: crypto.randomUUID(), name, email, role, createdAt: Date.now() };
  stmts.push(env.DB.prepare('INSERT INTO users (id, company_id, name, email, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(user.id, company.id, name, email, role, await hashPassword(password), user.createdAt));
  const session = await createSession(env, url, user.id);
  stmts.push(session.stmt);
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw httpError(409, 'Diese E-Mail-Adresse ist bereits registriert.');
    throw e;
  }
  return json(await mePayload(env, { user, company }), 201, { 'Set-Cookie': session.cookie });
}

async function login(request, env, url) {
  await rateLimit(env, request, 'login', 20);
  const b = await readJson(request);
  const email = str(b.email, 120).toLowerCase();
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.password_hash, u.created_at,
            c.id AS company_id, c.name AS company_name, c.invite_code, c.seq, c.created_at AS company_created
       FROM users u JOIN companies c ON c.id = u.company_id WHERE u.email = ?`
  ).bind(email).first();
  const ok = await verifyPassword(String(b.password || ''), row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok) throw httpError(401, 'E-Mail oder Passwort ist falsch.');
  const session = await createSession(env, url, row.id);
  await session.stmt.run();
  const user = { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at };
  const company = { id: row.company_id, name: row.company_name, inviteCode: row.invite_code, seq: row.seq, createdAt: row.company_created };
  return json(await mePayload(env, { user, company }), 200, { 'Set-Cookie': session.cookie });
}

// ---------------------------------------------------------------- Synchronisierung
const rowToChange = (r) => ({
  collection: r.collection, id: r.id, data: r.data ? JSON.parse(r.data) : null,
  deleted: !!r.deleted, updatedAt: r.updated_at, rev: r.rev,
});

async function changesSince(env, companyId, since, currentSeq) {
  const rs = await env.DB.prepare(
    'SELECT collection, id, data, deleted, updated_at, rev FROM records WHERE company_id = ? AND rev > ? ORDER BY rev LIMIT ?'
  ).bind(companyId, since, PAGE + 1).all();
  const more = rs.results.length > PAGE;
  const rows = rs.results.slice(0, PAGE);
  return { changes: rows.map(rowToChange), more, seq: more ? rows[rows.length - 1].rev : currentSeq };
}

async function pushOps(env, ctx, request, waitUntil) {
  const maxOps = Number(env.MAX_OPS) || 40;
  const b = await readJson(request);
  const ops = Array.isArray(b.ops) ? b.ops : [];
  if (ops.length > maxOps) throw httpError(413, `Maximal ${maxOps} Änderungen pro Anfrage.`);
  const since = Math.max(0, Number(b.since) || 0);
  const cid = ctx.company.id;
  const now = Date.now();
  const results = [];
  const valid = [];

  for (const op of ops) {
    const id = op && op.id;
    if (!op || typeof op !== 'object' || !COLLECTIONS.has(op.collection) || typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) {
      results.push({ id, ok: false, error: 'Ungültige Operation' });
      continue;
    }
    let ts = Number(op.updatedAt);
    if (!Number.isFinite(ts) || ts <= 0) ts = now;
    ts = Math.min(Math.round(ts), now + 5 * 60 * 1000);
    let data = null;
    if (!op.deleted) {
      if (!op.data || typeof op.data !== 'object' || Array.isArray(op.data)) {
        results.push({ id, ok: false, error: 'Daten fehlen' });
        continue;
      }
      data = JSON.stringify({ ...op.data, id });
      if (data.length > MAX_RECORD) {
        results.push({ id, ok: false, error: 'Datensatz zu groß' });
        continue;
      }
    }
    const r = { id, ok: false };
    results.push(r);
    valid.push({ op, id, ts, data, result: r });
  }

  let seq = ctx.company.seq;
  const conflicts = [];
  if (valid.length) {
    // Ein Batch = eine Transaktion: Revisionen werden lückenlos geordnet vergeben (Last-Write-Wins je Datensatz)
    const stmts = valid.map((v, k) => env.DB.prepare(
      `INSERT INTO records (company_id, collection, id, data, deleted, updated_at, updated_by, rev)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, (SELECT seq FROM companies WHERE id = ?1) + ?8)
       ON CONFLICT (company_id, collection, id) DO UPDATE SET
         data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at,
         updated_by = excluded.updated_by, rev = excluded.rev
       WHERE excluded.updated_at >= records.updated_at`
    ).bind(cid, v.op.collection, v.id, v.data, v.op.deleted ? 1 : 0, v.ts, ctx.user.id, k + 1));
    stmts.push(env.DB.prepare('UPDATE companies SET seq = seq + ? WHERE id = ? RETURNING seq').bind(valid.length, cid));
    const out = await env.DB.batch(stmts);
    seq = out[out.length - 1].results[0].seq;
    valid.forEach((v, k) => {
      if (out[k].meta.changes > 0) {
        v.result.ok = true;
        v.result.rev = seq - valid.length + k + 1;
      } else {
        v.result.conflict = true;
        conflicts.push(v);
      }
    });
    if (valid.some((v) => v.result.ok)) waitUntil(hub(env, cid).notify(seq));
  }

  const res = await changesSince(env, cid, since, seq);
  if (conflicts.length) {
    // Neuere Serverversion an den Client zurückgeben, falls sie nicht ohnehin in den Änderungen steckt
    const ids = [...new Set(conflicts.map((c) => c.id))].slice(0, 90);
    const rs = await env.DB.prepare(
      `SELECT collection, id, data, deleted, updated_at, rev FROM records WHERE company_id = ? AND id IN (${ids.map(() => '?').join(',')})`
    ).bind(cid, ...ids).all();
    for (const r of rs.results) {
      if (r.rev <= since && conflicts.some((c) => c.id === r.id && c.op.collection === r.collection)) res.changes.push(rowToChange(r));
    }
  }
  return json({ ...res, results });
}

// ---------------------------------------------------------------- API-Router
function requireAdmin(ctx) {
  if (ctx.user.role !== 'admin') throw httpError(403, 'Nur für Administratoren.');
}

async function handleApi(request, env, url, waitUntil) {
  const p = url.pathname;
  const m = request.method;
  // CSRF-Schutz: schreibende Anfragen brauchen einen eigenen Header (erzwingt Same-Origin)
  if (m !== 'GET' && request.headers.get('X-Nexcount') !== '1') throw httpError(403, 'Ungültige Anfrage.');

  if (p === '/api/health') return json({ ok: true, time: Date.now() });
  if (p === '/api/auth/register' && m === 'POST') return register(request, env, url);
  if (p === '/api/auth/login' && m === 'POST') return login(request, env, url);
  if (p === '/api/auth/logout' && m === 'POST') {
    const token = parseCookies(request.headers.get('Cookie')).nc_session;
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(url, '', 0) });
  }

  const ctx = await getSession(env, request);
  if (!ctx) throw httpError(401, 'Nicht angemeldet.');

  if (p === '/api/me' && m === 'GET') return json(await mePayload(env, ctx));

  if (p === '/api/live' && m === 'GET') {
    if (request.headers.get('Upgrade') !== 'websocket') throw httpError(426, 'WebSocket erwartet.');
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) throw httpError(403, 'Ungültige Herkunft.');
    const target = `https://hub/connect?u=${encodeURIComponent(ctx.user.id)}&seq=${ctx.company.seq}`;
    return hub(env, ctx.company.id).fetch(new Request(target, request));
  }

  if (p === '/api/sync' && m === 'GET') {
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    return json(await changesSince(env, ctx.company.id, since, ctx.company.seq));
  }
  if (p === '/api/sync' && m === 'POST') return pushOps(env, ctx, request, waitUntil);

  if (p === '/api/account/password' && m === 'POST') {
    await rateLimit(env, request, 'password', 10);
    const b = await readJson(request);
    if (!(await verifyPassword(String(b.oldPassword || ''), ctx.user.passwordHash))) throw httpError(400, 'Aktuelles Passwort ist falsch.');
    const pw = String(b.newPassword || '');
    if (pw.length < 8 || pw.length > 200) throw httpError(400, 'Das neue Passwort muss mindestens 8 Zeichen lang sein.');
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(pw), ctx.user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND hash <> ?').bind(ctx.user.id, ctx.sessionHash),
    ]);
    return json({ ok: true });
  }
  if (p === '/api/account/profile' && m === 'POST') {
    const b = await readJson(request);
    const name = str(b.name, 80);
    if (!name) throw httpError(400, 'Name darf nicht leer sein.');
    await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, ctx.user.id).run();
    ctx.user.name = name;
    return json(await mePayload(env, ctx));
  }

  if (p === '/api/company' && m === 'POST') {
    requireAdmin(ctx);
    const b = await readJson(request);
    const name = str(b.name, 120);
    if (name) {
      await env.DB.prepare('UPDATE companies SET name = ? WHERE id = ?').bind(name, ctx.company.id).run();
      ctx.company.name = name;
    }
    return json(await mePayload(env, ctx));
  }
  if (p === '/api/company/invite' && m === 'POST') {
    requireAdmin(ctx);
    ctx.company.inviteCode = newInviteCode();
    await env.DB.prepare('UPDATE companies SET invite_code = ? WHERE id = ?').bind(ctx.company.inviteCode, ctx.company.id).run();
    return json(await mePayload(env, ctx));
  }
  const mm = p.match(/^\/api\/company\/members\/([\w-]{1,64})$/);
  if (mm) {
    requireAdmin(ctx);
    const target = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND company_id = ?').bind(mm[1], ctx.company.id).first();
    if (!target) throw httpError(404, 'Benutzer nicht gefunden.');
    if (target.id === ctx.user.id) throw httpError(400, 'Du kannst dein eigenes Konto hier nicht ändern.');
    if (m === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
        env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id),
      ]);
      waitUntil(hub(env, ctx.company.id).kick(target.id));
      return json(await mePayload(env, ctx));
    }
    if (m === 'PATCH') {
      const b = await readJson(request);
      if (!['admin', 'member'].includes(b.role)) throw httpError(400, 'Ungültige Rolle.');
      await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(b.role, target.id).run();
      return json(await mePayload(env, ctx));
    }
  }
  throw httpError(404, 'Nicht gefunden.');
}

// ---------------------------------------------------------------- Einstiegspunkte
export default {
  async fetch(request, env, execCtx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url, (p) => execCtx.waitUntil(p));
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      return json({ error: status === 500 ? 'Interner Serverfehler.' : err.message }, status);
    }
  },

  // täglicher Cron: abgelaufene Sitzungen und Rate-Limit-Einträge aufräumen
  async scheduled(_event, env) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now),
    ]);
  },
};

/**
 * Ein Durable Object pro Firma: hält die WebSocket-Verbindungen aller Geräte
 * und verteilt „es gibt Neues“-Signale. Nutzt die Hibernation-API (kostet im Leerlauf nichts).
 */
export class SyncHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/connect' || request.headers.get('Upgrade') !== 'websocket') return new Response('Nicht gefunden', { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [url.searchParams.get('u') || 'anon']);
    server.send(JSON.stringify({ type: 'change', seq: Number(url.searchParams.get('seq')) || 0 }));
    return new Response(null, { status: 101, webSocket: client });
  }

  notify(seq) {
    const msg = JSON.stringify({ type: 'change', seq });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* Verbindung bereits zu */ }
    }
  }

  kick(userId) {
    const socks = this.ctx.getWebSockets(userId);
    for (const ws of socks) {
      try { ws.send(JSON.stringify({ type: 'kicked' })); } catch { /* egal */ }
      try { ws.close(4001, 'removed'); } catch { /* egal */ }
    }
    return socks.length;
  }

  webSocketMessage() { /* Clients senden nur Pings (Auto-Response) */ }

  webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch { /* egal */ }
  }
}
