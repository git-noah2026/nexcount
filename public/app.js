/* NEXCOUNT – Buchhaltungs- & Lagersystem by Andrerer */
'use strict';
(() => {
  // =============================================================== Hilfsfunktionen
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const uid = () => {
    if (window.isSecureContext && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    let s = String(v ?? '').trim().replace(/\s/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
  const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const NUMF = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
  const COMPACT = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });
  const money = (n) => EUR.format(r2(n));
  const fmtNum = (n) => NUMF.format(Number(n) || 0);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoDate(new Date());
  const addDays = (s, n) => {
    const d = new Date(`${s}T12:00:00`);
    d.setDate(d.getDate() + n);
    return isoDate(d);
  };
  const fmtDate = (s) => {
    if (!s) return '';
    const [y, m, d] = String(s).slice(0, 10).split('-');
    return `${d}.${m}.${y}`;
  };
  const fmtTime = (t) => new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de');
  const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0);
  const initials = (n) => String(n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const monthLabel = (k) => new Date(`${k}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  const lastMonths = (n) => {
    const out = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < n; i++) {
      out.unshift(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
      d.setMonth(d.getMonth() - 1);
    }
    return out;
  };

  // =============================================================== Konstanten
  const MV_TYPES = {
    initial: 'Anfangsbestand', in: 'Wareneingang', out: 'Warenausgang', correction: 'Inventurkorrektur',
    sale: 'Verkauf', purchase: 'Einkauf', storno: 'Storno',
  };
  const DOC_STATUS = { draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', cancelled: 'Storniert' };
  const KINDS = { income: 'Einnahme', expense: 'Ausgabe' };
  const CONTACT_TYPES = { customer: 'Kunde', supplier: 'Lieferant', both: 'Kunde & Lieferant' };
  const METHODS = ['Bank', 'Kasse', 'Karte', 'PayPal', 'Sonstige'];
  const CAT_IN = ['Warenverkauf', 'Dienstleistung', 'Provision', 'Zinserträge', 'Sonstige Einnahmen'];
  const CAT_OUT = ['Wareneinkauf', 'Miete', 'Personal', 'Büromaterial', 'Software', 'Fahrzeug', 'Reisekosten', 'Marketing', 'Versicherung', 'Telefon/Internet', 'Bankgebühren', 'Sonstige Ausgaben'];
  const RATES = [[19, '19 %'], [7, '7 %'], [0, '0 %']];
  const UNITS = ['Stk', 'kg', 'g', 'l', 'm', 'm²', 'Pkt', 'Karton', 'Std'];

  const I = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    layers: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    sync: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  };
  const icon = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;

  // =============================================================== Zustand
  const S = {
    user: null, company: null, members: [],
    online: navigator.onLine, syncing: false, syncAgain: false, lastSync: 0, syncError: '',
    db: {}, seq: 0, pending: [], ver: 0,
  };
  const UI = { route: 'dashboard', q: {} };

  // =============================================================== Supabase
  const CFG = window.NEXCOUNT_CONFIG || {};
  const configured = !!(CFG.supabaseUrl && CFG.supabaseKey && !/DEIN-PROJEKT|DEIN-SCHLUESSEL/.test(CFG.supabaseUrl + CFG.supabaseKey));
  const sb = configured && window.supabase
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'nexcount-auth' },
    })
    : null;

  const offlineError = () => Object.assign(new Error('Keine Verbindung zum Server.'), { offline: true });
  const isNetworkMsg = (m) => /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(String(m || ''));

  // Datenbankfunktion aufrufen (supabase/schema.sql)
  async function rpc(fn, args = {}) {
    if (!navigator.onLine) throw offlineError();
    let res;
    try { res = await sb.rpc(fn, args); } catch { throw offlineError(); }
    if (res.error) {
      const msg = res.error.message || 'Unbekannter Fehler';
      if (isNetworkMsg(msg) || res.status === 0) throw offlineError();
      const err = new Error(msg === 'NO_COMPANY' ? 'Du gehörst keiner Firma mehr an.' : msg);
      if (msg === 'NO_COMPANY') err.noCompany = true;
      if (res.status === 401 || res.error.code === '28000' || /jwt|token/i.test(msg)) err.status = 401;
      throw err;
    }
    return res.data;
  }

  // Fehlermeldungen von Supabase Auth auf Deutsch
  function authMessage(error) {
    const m = String((error && error.message) || error || '');
    if (isNetworkMsg(m)) return 'Keine Verbindung zum Server.';
    if (/invalid login credentials/i.test(m)) return 'E-Mail oder Passwort ist falsch.';
    if (/email not confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der Bestätigungsmail).';
    if (/already registered|already been registered/i.test(m)) return 'Diese E-Mail-Adresse ist bereits registriert.';
    if (/password should be at least|weak password/i.test(m)) return 'Das Passwort ist zu schwach (mindestens 8 Zeichen, besser länger).';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.';
    if (/invalid email|unable to validate email/i.test(m)) return 'Ungültige E-Mail-Adresse.';
    if (/same password|different from the old/i.test(m)) return 'Das neue Passwort muss sich vom alten unterscheiden.';
    return m || 'Unbekannter Fehler';
  }

  // =============================================================== Lokaler Speicher (Offline-Cache)
  const lsKey = () => `nexcount:v1:${S.user.id}`;
  const safeLS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
  };
  function loadLocal() {
    const d = safeLS.get(lsKey());
    S.db = (d && d.db) || {};
    S.seq = (d && d.seq) || 0;
    S.pending = (d && d.pending) || [];
    S.lastSync = (d && d.lastSync) || 0;
    S.ver++;
  }
  let lsWarned = false;
  function persistLocal() {
    if (!S.user) return;
    const ok = safeLS.set(lsKey(), { db: S.db, seq: S.seq, pending: S.pending, lastSync: S.lastSync });
    if (!ok && !lsWarned) {
      lsWarned = true;
      toast('Lokaler Speicher ist voll – Offline-Cache nicht aktuell.', 'error');
    }
  }

  // =============================================================== Datenzugriff
  const col = (c) => S.db[c] || (S.db[c] = {});
  const all = (c) => Object.values(col(c)).filter((r) => !r.deleted && r.data).map((r) => r.data);
  const get = (c, id) => {
    const r = id && col(c)[id];
    return r && !r.deleted ? r.data : null;
  };
  let lastTs = 0;
  const clock = () => (lastTs = Math.max(Date.now(), lastTs + 1));

  function put(c, data) {
    const now = clock();
    const prev = data.id && col(c)[data.id];
    const d = {
      ...data,
      id: data.id || uid(),
      createdAt: data.createdAt || now,
      createdBy: data.createdBy || (S.user && S.user.name) || '',
      updatedAt: now,
    };
    col(c)[d.id] = { id: d.id, data: d, deleted: false, updatedAt: now, rev: (prev && prev.rev) || 0 };
    enqueue({ collection: c, id: d.id, data: d, deleted: false, updatedAt: now });
    return d;
  }
  function del(c, id) {
    const now = clock();
    col(c)[id] = { id, data: null, deleted: true, updatedAt: now, rev: (col(c)[id] && col(c)[id].rev) || 0 };
    enqueue({ collection: c, id, deleted: true, updatedAt: now });
  }
  function enqueue(op) {
    S.pending = S.pending.filter((o) => !(o.collection === op.collection && o.id === op.id));
    S.pending.push(op);
    S.ver++;
    persistLocal();
    scheduleSync();
  }

  const memoCache = {};
  function memo(key, fn) {
    const c = memoCache[key];
    if (c && c.v === S.ver) return c.r;
    const r = fn();
    memoCache[key] = { v: S.ver, r };
    return r;
  }
  const settings = () => get('settings', 'company') || {};
  const companyName = () => settings().name || (S.company && S.company.name) || '';
  const articles = () => memo('arts', () => all('articles').filter((a) => !a.archived).sort(byName));
  const articleRaw = (id) => (col('articles')[id] && col('articles')[id].data) || null;
  const stockMap = () => memo('stock', () => {
    const m = {};
    for (const mv of all('movements')) m[mv.articleId] = (m[mv.articleId] || 0) + num(mv.qty);
    for (const k of Object.keys(m)) m[k] = r3(m[k]);
    return m;
  });
  const isLow = (a, st) => num(a.min) > 0 && (st[a.id] || 0) <= num(a.min);

  // =============================================================== Synchronisierung
  const SYNC_BATCH = 200; // Änderungen pro Anfrage (Datenbank erlaubt bis 500)
  const SYNC_BYTES = 900 * 1024; // und höchstens ~0,9 MB pro Anfrage
  let syncTimer = null;
  function scheduleSync(delay = 400) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, delay);
  }

  async function sync() {
    if (!S.user) return;
    if (S.syncing) { S.syncAgain = true; return; }
    S.syncing = true;
    renderStatus();
    let changedView = false;
    try {
      const ops = [];
      let bytes = 0;
      for (const o of S.pending) {
        const size = JSON.stringify(o).length;
        if (ops.length && (ops.length >= SYNC_BATCH || bytes + size > SYNC_BYTES)) break;
        ops.push(o);
        bytes += size;
      }
      const res = await rpc('sync', { p_ops: ops, p_since: S.seq });
      const sent = new Map(ops.map((o) => [`${o.collection}:${o.id}`, o.updatedAt]));
      S.pending = S.pending.filter((o) => sent.get(`${o.collection}:${o.id}`) !== o.updatedAt);
      const stillPending = new Set(S.pending.map((o) => `${o.collection}:${o.id}`));
      for (const ch of res.changes || []) {
        if (stillPending.has(`${ch.collection}:${ch.id}`)) continue;
        const local = col(ch.collection)[ch.id];
        if (!local || local.updatedAt !== ch.updatedAt || !!local.deleted !== !!ch.deleted) changedView = true;
        col(ch.collection)[ch.id] = { id: ch.id, data: ch.data, deleted: ch.deleted, updatedAt: ch.updatedAt, rev: ch.rev };
      }
      const failed = (res.results || []).filter((r) => !r.ok && !r.conflict);
      if (failed.length) console.warn('Sync: abgelehnte Operationen', failed);
      S.seq = res.seq;
      S.online = true;
      S.syncError = '';
      S.lastSync = Date.now();
      if (changedView) S.ver++;
      // weitere Pakete: noch ungesendete Änderungen oder weitere Seiten vom Server
      if (res.more || S.pending.length) S.syncAgain = true;
      persistLocal();
    } catch (e) {
      if (e.status === 401) {
        sessionExpired();
        return;
      }
      if (e.noCompany) {
        lostCompany();
        return;
      }
      if (e.offline) S.online = false;
      else S.syncError = e.message;
    } finally {
      S.syncing = false;
      renderStatus();
      if (S.syncAgain) {
        S.syncAgain = false;
        scheduleSync(50);
      }
    }
    if (changedView) render({ fromSync: true });
  }

  // Live-Verbindung: Supabase Realtime meldet jede neue Revision der Firma (companies.seq)
  let channel = null;
  function connectEvents() {
    disconnectEvents();
    if (!sb || !S.user || !S.company) return;
    const cid = S.company.id;
    channel = sb.channel(`nexcount-${cid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${cid}` }, (payload) => {
        const row = payload.new || {};
        if (row.name && S.company && row.name !== S.company.name) { S.company.name = row.name; render({ fromSync: true }); }
        if (Number(row.seq) !== S.seq || S.pending.length) sync();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          S.online = true;
          renderStatus();
          sync(); // Verpasstes nachholen
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!navigator.onLine) S.online = false;
          renderStatus();
        }
      });
  }
  function disconnectEvents() {
    if (channel && sb) sb.removeChannel(channel);
    channel = null;
  }

  window.addEventListener('online', () => { S.online = true; renderStatus(); sync(); });
  window.addEventListener('offline', () => { S.online = false; renderStatus(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  setInterval(() => { if (S.user) sync(); }, 60000);

  // =============================================================== Sitzung
  function setSession(me, offline = false) {
    const userChanged = !S.user || S.user.id !== me.user.id;
    S.user = me.user;
    S.company = me.company;
    S.members = me.members || [];
    safeLS.set('nexcount:last', { user: me.user, company: me.company });
    if (userChanged) loadLocal();
    render();
    if (offline) {
      S.online = false;
      renderStatus();
    } else {
      sync();
    }
    connectEvents();
  }

  // Profil/Firma laden und je nach Zustand App, Firmen-Einrichtung oder Anmeldung zeigen
  async function loadMe() {
    try {
      const me = await rpc('me');
      if (!me.company) return autoOnboard(me);
      setSession(me);
    } catch (e) {
      const last = safeLS.get('nexcount:last');
      if (e.offline && last && last.user && last.company) {
        setSession({ ...last, members: [] }, true);
        toast('Offline-Modus: Änderungen werden synchronisiert, sobald eine Verbindung besteht.');
      } else if (e.status === 401) {
        await signOutQuietly();
        renderAuth('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
      } else {
        renderAuth(e.message);
      }
    }
  }

  async function refreshMe() {
    try {
      const me = await rpc('me');
      if (!me.company) return lostCompany();
      S.user = me.user;
      S.company = me.company;
      S.members = me.members || [];
      safeLS.set('nexcount:last', { user: me.user, company: me.company });
      render();
    } catch (e) {
      if (e.status === 401) sessionExpired();
    }
  }

  // Nach der Registrierung: gewählte Firma automatisch anlegen bzw. beitreten
  async function autoOnboard(me) {
    let meta = {};
    try { meta = ((await sb.auth.getUser()).data.user || {}).user_metadata || {}; } catch { /* egal */ }
    const name = meta.name || (me.user && me.user.name) || '';
    if (meta.companyName || meta.inviteCode) {
      try {
        const res = meta.inviteCode
          ? await rpc('join_company', { p_code: meta.inviteCode, p_name: name })
          : await rpc('create_company', { p_company_name: meta.companyName, p_name: name });
        await sb.auth.updateUser({ data: { companyName: null, inviteCode: null } }).catch(() => {});
        setSession(res);
        toast(`Willkommen bei NEXCOUNT, ${res.user.name}!`, 'ok');
        return;
      } catch (e) {
        await sb.auth.updateUser({ data: { companyName: null, inviteCode: null } }).catch(() => {});
        return renderOnboarding(me, e.message);
      }
    }
    renderOnboarding(me, '');
  }

  // Zugang zur Firma wurde entzogen (z. B. vom Admin entfernt)
  function lostCompany() {
    disconnectEvents();
    if (S.user) safeLS.del(lsKey());
    safeLS.del('nexcount:last');
    const me = { user: { ...(S.user || {}) } };
    Object.assign(S, { company: null, members: [], db: {}, seq: 0, pending: [], lastSync: 0, user: null });
    S.ver++;
    closeModal();
    renderOnboarding(me, 'Du gehörst keiner Firma (mehr) an. Lege eine neue Firma an oder tritt mit einem Einladungscode bei.');
  }

  function sessionExpired() {
    disconnectEvents();
    S.user = null;
    S.syncing = false;
    safeLS.del('nexcount:last');
    closeModal();
    renderAuth('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an – ungesendete Änderungen bleiben erhalten.');
  }
  async function signOutQuietly() {
    try { await sb.auth.signOut({ scope: 'local' }); } catch { /* offline egal */ }
  }
  async function logout() {
    if (S.pending.length && !confirm(`${S.pending.length} Änderung(en) wurden noch nicht synchronisiert und gehen beim Abmelden verloren. Trotzdem abmelden?`)) return;
    disconnectEvents();
    if (S.user) safeLS.del(lsKey());
    safeLS.del('nexcount:last');
    Object.assign(S, { user: null, company: null, members: [], db: {}, seq: 0, pending: [], lastSync: 0 });
    S.ver++;
    await signOutQuietly();
    authTab = 'login';
    renderAuth('');
  }

  // =============================================================== Theme
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const themePref = () => { try { return localStorage.getItem('nexcount:theme') || 'system'; } catch { return 'system'; } };
  function applyTheme() {
    const p = themePref();
    document.documentElement.dataset.theme = p === 'system' ? (mq.matches ? 'dark' : 'light') : p;
  }
  mq.addEventListener && mq.addEventListener('change', applyTheme);

  // =============================================================== UI-Bausteine
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toast-root').appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 5200 : 3000);
  }
  const field = (label, input, cls = '') => `<label class="field ${cls}"><span>${esc(label)}</span>${input}</label>`;
  const inp = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
  const numInp = (name, value = '', attrs = '') => `<input name="${name}" type="number" step="any" class="num" value="${esc(value)}" ${attrs}>`;
  const selectEl = (name, options, value, attrs = '') =>
    `<select name="${name}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const textarea = (name, value = '', attrs = '') => `<textarea name="${name}" ${attrs}>${esc(value)}</textarea>`;
  const datalist = (id, values) => `<datalist id="${id}">${[...new Set(values)].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const kpi = (label, value, tone = '', sub = '') =>
    `<div class="kpi"><span class="label">${esc(label)}</span><span class="value ${tone}">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  const empty = (ic, text, btn = '') => `<div class="empty">${icon(ic, 34)}<div>${text}</div>${btn}</div>`;
  const searchBox = (key, placeholder) =>
    `<label class="search">${icon('search', 16)}<input id="q-${key}" data-ui="${key}" value="${esc(UI.q[key] || '')}" placeholder="${esc(placeholder)}" type="search"></label>`;
  const uiSelect = (key, options, attrs = '') =>
    `<select id="s-${key}" data-ui="${key}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(UI.q[key] ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

  // ---------- Modal
  let modalKeyHandler = null;
  function openModal({ title, body, submit = 'Speichern', onSubmit, wide = false, extra = '', onMount }) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop"><form class="modal ${wide ? 'wide' : ''}" autocomplete="off">
      <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${extra}<span class="spacer"></span><button type="button" class="btn ghost" data-close>${onSubmit ? 'Abbrechen' : 'Schließen'}</button>${onSubmit ? `<button class="btn primary" type="submit">${esc(submit)}</button>` : ''}</div>
    </form></div>`;
    const form = $('form', root);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!onSubmit) return;
      const fd = Object.fromEntries(new FormData(form));
      try {
        if (onSubmit(fd, form) !== false) closeModal();
        render();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    $$('[data-close]', root).forEach((b) => b.addEventListener('click', closeModal));
    $('.modal-backdrop', root).addEventListener('mousedown', (ev) => { if (ev.target === ev.currentTarget) closeModal(); });
    modalKeyHandler = (ev) => { if (ev.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', modalKeyHandler);
    if (onMount) onMount(form);
    setTimeout(() => {
      const f = $('input:not([readonly]):not([type=hidden]),select,textarea', form);
      if (f && window.innerWidth > 600) f.focus();
    }, 30);
    return form;
  }
  function closeModal() {
    $('#modal-root').innerHTML = '';
    if (modalKeyHandler) document.removeEventListener('keydown', modalKeyHandler);
    modalKeyHandler = null;
  }

  // ---------- Diagramm (gruppierte Balken, zwei Serien)
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function barChart(rows, labels = ['Einnahmen', 'Ausgaben']) {
    const W = 640, H = 230, L = 58, B = 26, T = 10, R = 6;
    const top = niceMax(Math.max(0, ...rows.flatMap((r) => [r.a, r.b])));
    const ch = H - T - B;
    const cw = (W - L - R) / rows.length;
    const bw = Math.max(4, Math.min(22, cw / 3.2));
    const y = (v) => T + ch * (1 - Math.max(0, v) / top);
    let g = '<g class="grid axis">';
    for (let i = 0; i <= 4; i++) {
      const v = (top * i) / 4;
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${COMPACT.format(v)} €</text>`;
    }
    g += '</g>';
    let bars = '';
    rows.forEach((r, i) => {
      const cx = L + cw * i + cw / 2;
      const ha = Math.max(0, ch - (y(r.a) - T));
      const hb = Math.max(0, ch - (y(r.b) - T));
      bars += `<rect class="a" x="${cx - bw - 1.5}" y="${y(r.a)}" width="${bw}" height="${ha}" rx="3"><title>${esc(r.label)} · ${labels[0]}: ${money(r.a)}</title></rect>`;
      bars += `<rect class="b" x="${cx + 1.5}" y="${y(r.b)}" width="${bw}" height="${hb}" rx="3"><title>${esc(r.label)} · ${labels[1]}: ${money(r.b)}</title></rect>`;
      bars += `<g class="axis"><text x="${cx}" y="${H - 7}" text-anchor="middle">${esc(r.label)}</text></g>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${labels.join(' und ')} je Monat">${g}${bars}</svg>
      <div class="legend"><span><i style="background:var(--series-a)"></i>${labels[0]}</span><span><i style="background:var(--series-b)"></i>${labels[1]}</span></div>`;
  }

  // ---------- Export
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function downloadCsv(name, header, rows) {
    const cell = (v) => {
      if (typeof v === 'number') return String(r3(v)).replace('.', ',');
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // Schutz vor CSV-Formel-Injection
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
    download(name, csv, 'text/csv;charset=utf-8');
  }

  // =============================================================== Geschäftslogik
  function calcTotals(items = []) {
    const byRate = {};
    let net = 0;
    for (const it of items) {
      const line = r2(num(it.qty) * num(it.price));
      net += line;
      const rate = num(it.tax);
      byRate[rate] = (byRate[rate] || 0) + line;
    }
    let tax = 0;
    const rates = Object.keys(byRate).map(Number).sort((a, b) => b - a).map((rate) => {
      const t = r2((byRate[rate] * rate) / 100);
      tax += t;
      return { rate, net: r2(byRate[rate]), tax: t };
    });
    net = r2(net);
    tax = r2(tax);
    return { net, tax, gross: r2(net + tax), rates };
  }
  const docTotals = (d) => memo(`doc:${d.id}:${d.updatedAt}`, () => calcTotals(d.items));

  function nextDocNumber(kind, date) {
    const prefix = kind === 'sale' ? (settings().invoicePrefix || 'RE') : (settings().purchasePrefix || 'EK');
    const year = String(date || today()).slice(0, 4);
    const safePrefix = prefix.replace(/[^A-Za-z0-9]/g, '');
    const re = new RegExp('^' + safePrefix + '-' + year + '-(\\d+)$');
    let max = 0;
    for (const d of all('documents')) {
      const m = d.kind === kind && re.exec(d.number || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${safePrefix}-${year}-${String(max + 1).padStart(4, '0')}`;
  }
  function nextCode(collection, prefix, keyName) {
    let max = 0;
    const re = new RegExp(`^${prefix}-(\\d+)$`);
    for (const x of all(collection)) {
      const m = re.exec(x[keyName] || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  function finalizeDoc(doc) {
    if (!doc.items.length) throw new Error('Bitte mindestens eine Position erfassen.');
    if (!doc.number) doc.number = nextDocNumber(doc.kind, doc.date);
    doc.status = 'open';
    doc.finalizedAt = Date.now();
    doc.movementIds = [];
    for (const it of doc.items) {
      if (!it.articleId || !num(it.qty)) continue;
      const art = articleRaw(it.articleId);
      const mv = put('movements', {
        articleId: it.articleId,
        qty: doc.kind === 'sale' ? -num(it.qty) : num(it.qty),
        type: doc.kind,
        date: doc.date,
        unitCost: doc.kind === 'purchase' ? num(it.price) : num(art && art.ek),
        docId: doc.id,
        note: doc.number,
      });
      doc.movementIds.push(mv.id);
      if (doc.kind === 'purchase' && art && num(it.price) > 0 && num(art.ek) !== num(it.price)) {
        put('articles', { ...art, ek: num(it.price) }); // letzter Einkaufspreis
      }
    }
    return put('documents', doc);
  }
  function markDocPaid(doc, date, method) {
    const t = calcTotals(doc.items);
    const sale = doc.kind === 'sale';
    const rate = t.rates.length === 1 ? t.rates[0].rate : null;
    const entry = put('entries', {
      date,
      kind: sale ? 'income' : 'expense',
      category: sale ? 'Warenverkauf' : 'Wareneinkauf',
      description: `${doc.number} · ${(doc.contact && doc.contact.name) || ''}`.trim(),
      net: t.net, tax: t.tax, gross: t.gross, rate,
      method, ref: doc.number, docId: doc.id,
    });
    return put('documents', { ...doc, status: 'paid', paidAt: date, entryId: entry.id });
  }
  function cancelDoc(doc) {
    for (const id of doc.movementIds || []) {
      const mv = get('movements', id);
      if (mv) put('movements', { articleId: mv.articleId, qty: -num(mv.qty), type: 'storno', date: today(), unitCost: mv.unitCost, docId: doc.id, note: `Storno ${doc.number}` });
    }
    if (doc.entryId && get('entries', doc.entryId)) del('entries', doc.entryId);
    return put('documents', { ...doc, status: 'cancelled', cancelledAt: Date.now(), entryId: null });
  }
  function splitGross(gross, rate) {
    const g = r2(gross);
    const net = r2(g / (1 + num(rate) / 100));
    return { gross: g, net, tax: r2(g - net) };
  }

  // =============================================================== Shell & Rendering
  const VIEWS = {
    dashboard: { title: 'Übersicht', icon: 'dashboard', render: viewDashboard },
    articles: { title: 'Artikel', icon: 'box', render: viewArticles },
    stock: { title: 'Lager', icon: 'layers', render: viewStock },
    documents: { title: 'Belege', icon: 'file', render: viewDocuments },
    entries: { title: 'Buchungen', icon: 'book', render: viewEntries },
    contacts: { title: 'Kontakte', icon: 'users', render: viewContacts },
    reports: { title: 'Berichte', icon: 'chart', render: viewReports },
    settings: { title: 'Einstellungen', icon: 'settings', render: viewSettings },
  };

  function shellHtml() {
    return `<div id="shell" class="shell">
      <aside class="sidebar">
        <div class="brand"><img src="/icon.svg" alt=""><div><div class="brand-name">NEXCOUNT</div><div class="brand-sub">by Andrerer</div></div></div>
        <nav class="nav" id="nav">${Object.entries(VIEWS).map(([k, v]) => `<a href="#/${k}" data-route="${k}">${icon(v.icon)}<span>${v.title}</span><span class="count hidden"></span></a>`).join('')}</nav>
        <div class="sidebar-foot"><div class="avatar" id="me-avatar"></div><div class="who"><b id="me-name"></b><span id="me-company"></span></div>
          <button class="icon-btn" data-action="logout" title="Abmelden" aria-label="Abmelden">${icon('logout')}</button></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" data-action="toggle-menu" aria-label="Menü">${icon('menu')}</button>
          <h1 id="page-title"></h1>
          <button id="sync-status" class="sync" data-action="sync-now" type="button"></button>
        </header>
        <main id="view" class="view"></main>
      </div>
    </div>`;
  }

  function render({ fromSync = false } = {}) {
    if (!S.user) return renderAuth();
    // ungespeicherte Eingaben in Seitenformularen nicht durch Live-Updates überschreiben
    if (fromSync && UI.formDirty && $('#shell')) return renderStatus();
    if (!$('#shell')) $('#app').innerHTML = shellHtml();
    const view = VIEWS[UI.route] || VIEWS.dashboard;
    // Navigation & Kopf
    const st = stockMap();
    const lowCount = articles().filter((a) => isLow(a, st)).length;
    const overdue = all('documents').filter((d) => d.kind === 'sale' && d.status === 'open' && d.dueDate && d.dueDate < today()).length;
    for (const a of $$('#nav a')) {
      a.classList.toggle('active', a.dataset.route === UI.route);
      const c = $('.count', a);
      const n = a.dataset.route === 'articles' ? lowCount : a.dataset.route === 'documents' ? overdue : 0;
      c.textContent = n;
      c.classList.toggle('hidden', !n);
    }
    $('#me-avatar').textContent = initials(S.user.name);
    $('#me-name').textContent = S.user.name;
    $('#me-company').textContent = companyName();
    $('#page-title').textContent = view.title;
    document.title = `${view.title} · NEXCOUNT`;
    // Fokus erhalten (z. B. Suche während Live-Sync)
    const active = document.activeElement;
    const fid = active && active.id && $('#view').contains(active) ? active.id : null;
    let selRange = null;
    try { if (fid) selRange = [active.selectionStart, active.selectionEnd]; } catch { /* nicht unterstützt */ }
    $('#view').innerHTML = view.render();
    if (fid) {
      const el = document.getElementById(fid);
      if (el) {
        el.focus();
        try { if (selRange && selRange[0] != null) el.setSelectionRange(selRange[0], selRange[1]); } catch { /* egal */ }
      }
    }
    renderStatus();
  }

  function renderStatus() {
    const el = $('#sync-status');
    if (!el) return;
    const n = S.pending.length;
    let cls;
    let text;
    if (S.syncing) { cls = 'busy'; text = 'Synchronisiere …'; }
    else if (!S.online) { cls = 'off'; text = n ? `Offline · ${n} ausstehend` : 'Offline'; }
    else if (S.syncError) { cls = 'err'; text = 'Sync-Fehler'; }
    else if (n) { cls = 'busy'; text = `${n} ausstehend`; }
    else { cls = 'ok'; text = S.lastSync ? `Synchronisiert · ${new Date(S.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Verbunden'; }
    el.className = `sync ${cls}`;
    el.innerHTML = `<span class="dot"></span><span class="sync-text">${esc(text)}</span>`;
    el.title = S.syncError || (S.online ? 'Jetzt synchronisieren' : 'Keine Verbindung – Änderungen werden lokal gespeichert');
  }

  function onRoute() {
    const r = (location.hash.match(/^#\/(\w+)/) || [])[1];
    UI.route = VIEWS[r] ? r : 'dashboard';
    UI.formDirty = false;
    const shell = $('#shell');
    if (shell) shell.classList.remove('menu-open');
    if (S.user) {
      render();
      window.scrollTo(0, 0);
      if (UI.route === 'settings') refreshMe();
    }
  }

  // =============================================================== Anmeldung
  let authTab = 'login'; // login | register | forgot
  let authMode = 'new';
  let authMsg = '';
  let authMsgType = 'error';
  let authEmail = '';
  const companyFields = () => `<div class="seg full"><button type="button" data-action="auth-mode" data-mode="new" class="${authMode === 'new' ? 'active' : ''}">Neue Firma</button><button type="button" data-action="auth-mode" data-mode="join" class="${authMode === 'join' ? 'active' : ''}">Einladungscode</button></div>
    ${authMode === 'new' ? field('Firmenname', '<input name="companyName" required maxlength="120" autocomplete="organization">') : field('Einladungscode', '<input name="inviteCode" required maxlength="20" style="text-transform:uppercase;letter-spacing:.12em" placeholder="z. B. 8F3A21C09B">')}`;

  function renderAuth(msg, type) {
    if (msg !== undefined) { authMsg = msg; authMsgType = type || (/^Deine Sitzung/.test(msg) ? 'info' : 'error'); }
    const reg = authTab === 'register';
    const forgot = authTab === 'forgot';
    authShell(`
        <div class="stack" style="gap:6px">
          <h1>${forgot ? 'Passwort zurücksetzen' : reg ? 'Konto erstellen' : 'Willkommen zurück'}</h1>
          <p class="muted">${forgot ? 'Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.' : reg ? 'Lege eine neue Firma an oder tritt deinem Team mit einem Einladungscode bei.' : 'Melde dich an, um Buchhaltung und Lager zu verwalten.'}</p>
        </div>
        ${forgot ? '' : `<div class="seg full"><button type="button" data-action="auth-tab" data-tab="login" class="${reg ? '' : 'active'}">Anmelden</button><button type="button" data-action="auth-tab" data-tab="register" class="${reg ? 'active' : ''}">Registrieren</button></div>`}
        <div id="auth-msg" class="alert ${authMsgType === 'info' ? 'info' : ''} ${authMsg ? '' : 'hidden'}">${esc(authMsg)}</div>
        <form data-form="auth" class="stack">
          ${reg ? field('Dein Name', '<input name="name" required maxlength="80" autocomplete="name">') : ''}
          ${field('E-Mail', `<input name="email" type="email" required maxlength="120" autocomplete="email" value="${esc(authEmail)}">`)}
          ${forgot ? '' : field('Passwort', `<input name="password" type="password" required ${reg ? 'minlength="8"' : ''} autocomplete="${reg ? 'new-password' : 'current-password'}">`)}
          ${reg ? companyFields() : ''}
          <button class="btn primary block" type="submit">${forgot ? 'Link senden' : reg ? 'Konto erstellen' : 'Anmelden'}</button>
        </form>
        <p class="muted small">${forgot ? '<a href="#" data-action="auth-tab" data-tab="login">Zurück zur Anmeldung</a>'
          : reg ? 'Mindestens 8 Zeichen. Nach der Registrierung bekommst du eine E-Mail zur Bestätigung.'
            : '<a href="#" data-action="auth-tab" data-tab="forgot">Passwort vergessen?</a>'}</p>`);
  }

  // Angemeldet, aber noch keiner Firma zugeordnet
  function renderOnboarding(me, msg) {
    authTab = 'onboard';
    authShell(`
        <div class="stack" style="gap:6px">
          <h1>Firma einrichten</h1>
          <p class="muted">Angemeldet als <b>${esc((me.user && me.user.email) || '')}</b>. Lege deine Firma an oder tritt einem bestehenden Team bei.</p>
        </div>
        <div id="auth-msg" class="alert ${msg ? '' : 'hidden'}">${esc(msg || '')}</div>
        <form data-form="onboard" class="stack">
          ${field('Dein Name', `<input name="name" required maxlength="80" value="${esc((me.user && me.user.name) || '')}">`)}
          ${companyFields()}
          <button class="btn primary block" type="submit">Weiter</button>
        </form>
        <p class="muted small"><a href="#" data-action="logout">Abmelden</a></p>`);
  }

  function renderSetupMissing() {
    authShell(`<h1>Einrichtung fehlt</h1>
      <div class="alert">Die Verbindung zu Supabase ist noch nicht konfiguriert.</div>
      <p class="muted">Trage in <code>public/config.js</code> die Project URL und den Publishable Key deines Supabase-Projekts ein (Supabase → Project Settings → API).</p>`);
  }

  function authShell(inner) {
    $('#app').innerHTML = `<div class="auth">
      <div class="auth-panel">
        <div class="brand big"><img src="/icon.svg" alt=""><div><div class="brand-name">NEXCOUNT</div><div class="brand-sub">by Andrerer</div></div></div>
        ${inner}
      </div>
      <div class="auth-hero">
        <h2>Buchhaltung und Lager in einem – live synchronisiert.</h2>
        <p>NEXCOUNT verbindet Rechnungen, Kassenbuch und Warenwirtschaft. Alle Geräte deines Teams sehen Änderungen in Echtzeit – auch offline geht nichts verloren.</p>
        <ul>
          <li>${icon('zap', 20)}<div><b>Echtzeit-Synchronisierung</b><span>Änderungen erscheinen sofort auf allen angemeldeten Geräten.</span></div></li>
          <li>${icon('cloud', 20)}<div><b>Offline-fähig</b><span>Weiterarbeiten ohne Netz – Änderungen werden automatisch nachgereicht.</span></div></li>
          <li>${icon('layers', 20)}<div><b>Lager & Belege verknüpft</b><span>Rechnungen buchen Bestände und Einnahmen automatisch.</span></div></li>
          <li>${icon('shield', 20)}<div><b>Team & Rollen</b><span>Mitarbeiter per Einladungscode hinzufügen, Admins verwalten Zugänge.</span></div></li>
        </ul>
      </div>
    </div>`;
    const first = $('.auth-panel form input:not([value]), .auth-panel form input[value=""]') || $('.auth-panel form input');
    if (first) first.focus();
  }

  // Link aus „Passwort vergessen“-Mail geöffnet → neues Passwort setzen
  function openNewPassword() {
    openModal({
      title: 'Neues Passwort festlegen',
      body: `<p class="muted">Lege ein neues Passwort für dein NEXCOUNT-Konto fest.</p>
        ${field('Neues Passwort', '<input name="password" type="password" required minlength="8" autocomplete="new-password">')}
        ${field('Wiederholen', '<input name="password2" type="password" required minlength="8" autocomplete="new-password">')}`,
      submit: 'Passwort speichern',
      onSubmit(fd) {
        if (fd.password !== fd.password2) throw new Error('Die Passwörter stimmen nicht überein.');
        sb.auth.updateUser({ password: fd.password }).then(({ error }) => {
          if (error) return toast(authMessage(error), 'error');
          closeModal();
          toast('Passwort geändert', 'ok');
          if (!S.user) loadMe();
        });
        return false;
      },
    });
  }

  // =============================================================== Ansicht: Übersicht
  function viewDashboard() {
    const arts = articles();
    const entries = all('entries');
    const docs = all('documents');
    if (!arts.length && !entries.length && !docs.length && !all('contacts').length) return welcomeHtml();
    const ym = today().slice(0, 7);
    const mEntries = entries.filter((e) => String(e.date || '').startsWith(ym));
    const inc = sum(mEntries.filter((e) => e.kind === 'income'), (e) => e.net);
    const exp = sum(mEntries.filter((e) => e.kind === 'expense'), (e) => e.net);
    const st = stockMap();
    const stockValue = sum(arts, (a) => Math.max(0, st[a.id] || 0) * num(a.ek));
    const open = docs.filter((d) => d.kind === 'sale' && d.status === 'open').sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const openSum = sum(open, (d) => docTotals(d).gross);
    const overdue = open.filter((d) => d.dueDate && d.dueDate < today());
    const low = arts.filter((a) => isLow(a, st));
    const months = lastMonths(6).map((k) => {
      const es = entries.filter((e) => String(e.date || '').startsWith(k));
      return { label: monthLabel(k), a: sum(es.filter((e) => e.kind === 'income'), (e) => e.net), b: sum(es.filter((e) => e.kind === 'expense'), (e) => e.net) };
    });
    const recent = entries.slice().sort(byDateDesc).slice(0, 6);
    return `
      <div class="kpis">
        ${kpi('Einnahmen · Monat (netto)', money(inc), 'pos')}
        ${kpi('Ausgaben · Monat (netto)', money(exp), 'neg')}
        ${kpi('Ergebnis · Monat', money(inc - exp), inc - exp >= 0 ? 'pos' : 'neg')}
        ${kpi('Offene Forderungen', money(openSum), '', `${open.length} Rechnung(en)${overdue.length ? ` · <span class="neg">${overdue.length} überfällig</span>` : ''}`)}
        ${kpi('Lagerwert (EK)', money(stockValue), '', `${arts.length} Artikel · ${low.length} unter Mindestbestand`)}
      </div>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h3>Einnahmen & Ausgaben</h3><span class="muted">letzte 6 Monate, netto</span></div>${barChart(months)}</section>
        <section class="card"><div class="card-head"><h3>Niedriger Lagerbestand</h3><a href="#/articles" data-action="set-ui" data-k="artLow" data-v="1">Alle anzeigen</a></div>
          ${low.length ? `<ul class="list">${low.slice(0, 7).map((a) => {
            const s = st[a.id] || 0;
            const pct = Math.max(4, Math.min(100, (s / num(a.min)) * 100));
            return `<li class="clickable" data-action="move-in" data-id="${a.id}"><div><b>${esc(a.name)}</b><div class="bar-meter" style="margin-top:6px"><span style="width:${pct}%"></span></div></div><span class="num"><b>${fmtNum(s)}</b> <span class="muted small">/ ${fmtNum(a.min)} ${esc(a.unit || '')}</span></span></li>`;
          }).join('')}</ul>` : empty('check', 'Alle Artikel sind ausreichend vorrätig.')}
        </section>
      </div>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h3>Offene Rechnungen</h3><a href="#/documents">Zu den Belegen</a></div>
          ${open.length ? `<ul class="list">${open.slice(0, 6).map((d) => {
            const od = d.dueDate && d.dueDate < today();
            return `<li class="clickable" data-action="open-doc" data-id="${d.id}"><div><b>${esc(d.number)} · ${esc((d.contact && d.contact.name) || '—')}</b><span class="sub">fällig ${fmtDate(d.dueDate)}</span></div>${od ? '<span class="badge overdue">überfällig</span>' : ''}<span class="num"><b>${money(docTotals(d).gross)}</b></span></li>`;
          }).join('')}</ul>` : empty('check', 'Keine offenen Rechnungen.')}
        </section>
        <section class="card"><div class="card-head"><h3>Letzte Buchungen</h3><a href="#/entries">Kassenbuch</a></div>
          ${recent.length ? `<ul class="list">${recent.map((e) => `<li class="clickable" data-action="edit-entry" data-id="${e.id}"><div><b>${esc(e.description || e.category)}</b><span class="sub">${fmtDate(e.date)} · ${esc(e.category || '')} · ${esc(e.method || '')}</span></div><span class="num ${e.kind === 'income' ? 'pos' : 'neg'}"><b>${e.kind === 'income' ? '+' : '−'}${money(e.gross)}</b></span></li>`).join('')}</ul>` : empty('book', 'Noch keine Buchungen.')}
        </section>
      </div>`;
  }
  function welcomeHtml() {
    return `<div class="welcome">
      <section class="card hero">
        <h2>Willkommen bei NEXCOUNT, ${esc(S.user.name.split(' ')[0])}!</h2>
        <p>Deine Firma <b>${esc(companyName())}</b> ist eingerichtet. Alles, was du anlegst, wird automatisch mit allen Geräten deines Teams synchronisiert.</p>
        <div class="toolbar"><button class="btn" data-action="new-article">${icon('plus', 16)} Ersten Artikel anlegen</button><button class="btn ghost" data-action="demo">Demo-Daten laden</button></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>In 4 Schritten startklar</h3></div>
        <ol class="steps">
          <li><div><b>Firmendaten hinterlegen</b><div class="muted small">Adresse, Steuernummer und Bankverbindung für Rechnungen – <a href="#/settings">Einstellungen</a>.</div></div></li>
          <li><div><b>Artikel & Anfangsbestände erfassen</b><div class="muted small">Mit Einkaufs- und Verkaufspreis, Mindestbestand und Lagerort.</div></div></li>
          <li><div><b>Kunden & Lieferanten anlegen</b><div class="muted small">Unter <a href="#/contacts">Kontakte</a>.</div></div></li>
          <li><div><b>Team einladen</b><div class="muted small">Einladungscode unter Einstellungen → Team teilen.</div></div></li>
        </ol>
      </section>
    </div>`;
  }

  // =============================================================== Ansicht: Artikel
  function viewArticles() {
    const st = stockMap();
    const all_ = articles();
    const cats = [...new Set(all_.map((a) => a.category).filter(Boolean))].sort();
    const q = (UI.q.art || '').toLowerCase();
    let list = all_;
    if (q) list = list.filter((a) => [a.sku, a.name, a.category, a.location, a.ean].join(' ').toLowerCase().includes(q));
    if (UI.q.artCat) list = list.filter((a) => a.category === UI.q.artCat);
    if (UI.q.artLow === '1') list = list.filter((a) => isLow(a, st));
    const value = sum(list, (a) => Math.max(0, st[a.id] || 0) * num(a.ek));
    return `
      <div class="toolbar">
        ${searchBox('art', 'Artikel suchen (Nr., Name, EAN, Lagerort) …')}
        ${uiSelect('artCat', [['', 'Alle Kategorien'], ...cats.map((c) => [c, c])])}
        ${uiSelect('artLow', [['', 'Alle Bestände'], ['1', 'Nur unter Mindestbestand']])}
        <div class="actions"><button class="btn primary" data-action="new-article">${icon('plus', 16)} Artikel</button></div>
      </div>
      <section class="card flush">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Art.-Nr.</th><th>Bezeichnung</th><th>Kategorie</th><th class="num">Bestand</th><th class="num">EK netto</th><th class="num">VK netto</th><th class="num">Marge</th><th class="num">Lagerwert</th><th>Lagerort</th><th></th></tr></thead>
          <tbody>${list.map((a) => {
            const s = st[a.id] || 0;
            const vk = num(a.vk);
            const margin = vk > 0 ? ((vk - num(a.ek)) / vk) * 100 : null;
            return `<tr class="clickable" data-action="edit-article" data-id="${a.id}">
              <td><b>${esc(a.sku)}</b></td>
              <td>${esc(a.name)}${a.ean ? `<span class="sub">EAN ${esc(a.ean)}</span>` : ''}</td>
              <td>${esc(a.category || '—')}</td>
              <td class="num">${isLow(a, st) ? `<span class="badge low">${fmtNum(s)} ${esc(a.unit || '')}</span>` : `${fmtNum(s)} <span class="muted">${esc(a.unit || '')}</span>`}</td>
              <td class="num">${money(a.ek)}</td>
              <td class="num">${money(a.vk)}</td>
              <td class="num ${margin != null && margin < 0 ? 'neg' : ''}">${margin == null ? '—' : `${margin.toFixed(1).replace('.', ',')} %`}</td>
              <td class="num">${money(Math.max(0, s) * num(a.ek))}</td>
              <td>${esc(a.location || '—')}</td>
              <td class="actions">
                <button class="btn sm" data-action="move-in" data-id="${a.id}" title="Wareneingang">${icon('plus', 14)}</button>
                <button class="btn sm" data-action="move-out" data-id="${a.id}" title="Warenausgang">${icon('minus', 14)}</button>
              </td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="7">${list.length} Artikel</td><td class="num">${money(value)}</td><td colspan="2"></td></tr></tfoot>
        </table></div>` : empty('box', all_.length ? 'Keine Artikel für diesen Filter.' : 'Noch keine Artikel angelegt.', all_.length ? '' : `<button class="btn primary" data-action="new-article">${icon('plus', 16)} Ersten Artikel anlegen</button>`)}
      </section>`;
  }

  function openArticle(id) {
    const a = id ? get('articles', id) : null;
    const isNew = !a;
    const smallBiz = !!settings().smallBusiness;
    const d = a || { sku: nextCode('articles', 'A', 'sku'), unit: 'Stk', tax: smallBiz ? 0 : 19, ek: '', vk: '', min: '' };
    const cats = all('articles').map((x) => x.category).filter(Boolean);
    const locs = all('articles').map((x) => x.location).filter(Boolean);
    const st = stockMap();
    openModal({
      title: isNew ? 'Neuer Artikel' : `Artikel ${a.sku}`,
      body: `<div class="grid2">
          ${field('Artikelnummer', inp('sku', d.sku, 'required maxlength="40"'))}
          ${field('EAN / Barcode', inp('ean', d.ean, 'maxlength="40" inputmode="numeric"'))}
          ${field('Bezeichnung', inp('name', d.name, 'required maxlength="160"'), 'span2')}
          ${field('Kategorie', inp('category', d.category, 'list="dl-cat" maxlength="60"'))}
          ${field('Einheit', inp('unit', d.unit, 'list="dl-unit" maxlength="20"'))}
          ${field('Einkaufspreis netto (€)', numInp('ek', d.ek, 'min="0"'))}
          ${field('Verkaufspreis netto (€)', numInp('vk', d.vk, 'min="0"'))}
          ${field('USt-Satz', selectEl('tax', RATES, d.tax ?? 19))}
          ${field('Mindestbestand', numInp('min', d.min, 'min="0"'))}
          ${field('Lagerort', inp('location', d.location, 'list="dl-loc" maxlength="60" placeholder="z. B. Regal A3"'))}
          ${isNew ? field('Anfangsbestand', numInp('initial', '', 'min="0" placeholder="0"')) : field('Aktueller Bestand', `<input readonly value="${esc(`${fmtNum(st[a.id] || 0)} ${a.unit || ''}`)}">`)}
          ${field('Beschreibung / Notizen', textarea('description', d.description, 'maxlength="2000"'), 'span2')}
        </div>${datalist('dl-cat', cats)}${datalist('dl-unit', UNITS)}${datalist('dl-loc', locs)}`,
      extra: isNew ? '' : `<button type="button" class="btn danger" data-action="archive-article" data-id="${a.id}">Archivieren</button>
        <button type="button" class="btn" data-action="inventory" data-id="${a.id}">Inventur</button>`,
      onSubmit(fd) {
        const sku = fd.sku.trim();
        if (all('articles').some((x) => x.sku === sku && x.id !== (a && a.id) && !x.archived)) throw new Error(`Artikelnummer ${sku} ist bereits vergeben.`);
        const saved = put('articles', {
          ...(a || {}),
          sku, ean: fd.ean.trim(), name: fd.name.trim(), category: fd.category.trim(), unit: fd.unit.trim(),
          ek: num(fd.ek), vk: num(fd.vk), tax: num(fd.tax), min: num(fd.min), location: fd.location.trim(), description: fd.description,
        });
        if (isNew && num(fd.initial) > 0) {
          put('movements', { articleId: saved.id, qty: num(fd.initial), type: 'initial', date: today(), unitCost: saved.ek, note: 'Anfangsbestand' });
        }
        toast(isNew ? 'Artikel angelegt' : 'Artikel gespeichert', 'ok');
      },
    });
  }

  // =============================================================== Ansicht: Lager
  function articleOptions(selected, { withStock = true, placeholder = 'Artikel wählen …' } = {}) {
    const st = stockMap();
    return `<option value="">${esc(placeholder)}</option>${articles().map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.sku)} – ${esc(a.name)}${withStock ? ` (${fmtNum(st[a.id] || 0)} ${esc(a.unit || '')})` : ''}</option>`).join('')}`;
  }

  function viewStock() {
    const st = stockMap();
    const arts = articles();
    let mv = all('movements').sort(byDateDesc);
    const total = mv.length;
    if (UI.q.mvArt) mv = mv.filter((m) => m.articleId === UI.q.mvArt);
    if (UI.q.mvType) mv = mv.filter((m) => m.type === UI.q.mvType);
    const q = (UI.q.mv || '').toLowerCase();
    if (q) mv = mv.filter((m) => { const a = articleRaw(m.articleId) || {}; return [a.name, a.sku, m.note, m.createdBy].join(' ').toLowerCase().includes(q); });
    const since30 = addDays(today(), -30);
    const shown = mv.slice(0, 400);
    return `
      <div class="kpis">
        ${kpi('Lagerwert (EK)', money(sum(arts, (a) => Math.max(0, st[a.id] || 0) * num(a.ek))))}
        ${kpi('Artikel', fmtNum(arts.length), '', `${fmtNum(sum(arts, (a) => Math.max(0, st[a.id] || 0)))} Einheiten gesamt`)}
        ${kpi('Unter Mindestbestand', fmtNum(arts.filter((a) => isLow(a, st)).length), arts.some((a) => isLow(a, st)) ? 'neg' : '')}
        ${kpi('Bewegungen (30 Tage)', fmtNum(all('movements').filter((m) => (m.date || '') >= since30).length), '', `${fmtNum(total)} insgesamt`)}
      </div>
      <div class="toolbar">
        ${searchBox('mv', 'Bewegungen durchsuchen …')}
        <select id="s-mvArt" data-ui="mvArt">${articleOptions(UI.q.mvArt, { withStock: false, placeholder: 'Alle Artikel' })}</select>
        ${uiSelect('mvType', [['', 'Alle Arten'], ...Object.entries(MV_TYPES)])}
        <div class="actions">
          <button class="btn" data-action="inventory">${icon('clipboard', 16)} Inventur</button>
          <button class="btn" data-action="move-out">${icon('minus', 16)} Warenausgang</button>
          <button class="btn primary" data-action="move-in">${icon('plus', 16)} Wareneingang</button>
        </div>
      </div>
      <section class="card flush">
        ${shown.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Datum</th><th>Artikel</th><th>Art</th><th class="num">Menge</th><th class="num">Wert (EK)</th><th>Notiz / Beleg</th><th>Erfasst von</th><th></th></tr></thead>
          <tbody>${shown.map((m) => {
            const a = articleRaw(m.articleId) || { name: '(unbekannt)', sku: '' };
            const q_ = num(m.qty);
            const manual = ['initial', 'in', 'out', 'correction'].includes(m.type);
            return `<tr>
              <td>${fmtDate(m.date)}</td>
              <td><b>${esc(a.name)}</b><span class="sub">${esc(a.sku)}${a.archived ? ' · archiviert' : ''}</span></td>
              <td><span class="badge ${m.type === 'storno' ? 'cancelled' : ''}">${esc(MV_TYPES[m.type] || m.type)}</span></td>
              <td class="num ${q_ >= 0 ? 'pos' : 'neg'}"><b>${q_ > 0 ? '+' : ''}${fmtNum(q_)}</b> ${esc(a.unit || '')}</td>
              <td class="num">${money(Math.abs(q_) * num(m.unitCost))}</td>
              <td>${m.docId ? `<a href="#/documents" data-action="open-doc" data-id="${m.docId}">${esc(m.note)}</a>` : esc(m.note || '')}</td>
              <td class="muted">${esc(m.createdBy || '')}</td>
              <td class="actions">${manual && !m.reversedBy ? `<button class="btn sm ghost" data-action="storno-move" data-id="${m.id}" title="Bewegung stornieren">${icon('undo', 14)}</button>` : m.reversedBy ? '<span class="muted small">storniert</span>' : ''}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>${mv.length > shown.length ? `<p class="muted small" style="padding:12px 16px">Es werden die neuesten ${shown.length} von ${mv.length} Bewegungen angezeigt. Nutze Filter oder den CSV-Export unter Berichte.</p>` : ''}`
        : empty('layers', arts.length ? 'Keine Lagerbewegungen für diesen Filter.' : 'Lege zuerst Artikel an, um Bestände zu buchen.', arts.length ? '' : '<a class="btn primary" href="#/articles">Zu den Artikeln</a>')}
      </section>`;
  }

  function openMovement(type, articleId) {
    if (!articles().length) return toast('Bitte zuerst einen Artikel anlegen.', 'error');
    const isIn = type === 'in';
    const a0 = articleId ? get('articles', articleId) : null;
    openModal({
      title: isIn ? 'Wareneingang buchen' : 'Warenausgang buchen',
      body: `<div class="grid2">
          ${field('Artikel', `<select name="articleId" required>${articleOptions(articleId)}</select>`, 'span2')}
          ${field('Menge', numInp('qty', '', 'required min="0.001"'))}
          ${field('Datum', inp('date', today(), 'type="date" required'))}
          ${isIn ? field('Einkaufspreis netto je Einheit (€)', numInp('unitCost', a0 ? a0.ek : '', 'min="0"')) : ''}
          ${field('Notiz', inp('note', '', `maxlength="200" placeholder="${isIn ? 'z. B. Lieferschein-Nr.' : 'z. B. Eigenverbrauch, Bruch'}"`), isIn ? '' : 'span2')}
        </div>`,
      submit: 'Buchen',
      onMount(form) {
        const sel = $('[name=articleId]', form);
        sel.addEventListener('change', () => {
          const a = get('articles', sel.value);
          const uc = $('[name=unitCost]', form);
          if (a && uc) uc.value = a.ek ?? '';
        });
      },
      onSubmit(fd) {
        const a = get('articles', fd.articleId);
        if (!a) throw new Error('Bitte Artikel wählen.');
        const qty = num(fd.qty);
        if (qty <= 0) throw new Error('Menge muss größer als 0 sein.');
        const st = stockMap()[a.id] || 0;
        if (!isIn && qty > st && !confirm(`Der Bestand (${fmtNum(st)}) reicht nicht aus. Trotzdem buchen? Der Bestand wird negativ.`)) return false;
        put('movements', { articleId: a.id, qty: isIn ? qty : -qty, type, date: fd.date, unitCost: isIn ? num(fd.unitCost) : num(a.ek), note: fd.note.trim() });
        toast(`${isIn ? 'Eingang' : 'Ausgang'} gebucht: ${fmtNum(qty)} ${a.unit || ''} ${a.name}`, 'ok');
      },
    });
  }

  function openInventory(articleId) {
    if (!articles().length) return toast('Bitte zuerst einen Artikel anlegen.', 'error');
    const st = stockMap();
    openModal({
      title: 'Inventur / Bestandskorrektur',
      body: `<p class="muted">Gib den tatsächlich gezählten Bestand ein. NEXCOUNT bucht die Differenz als Inventurkorrektur.</p>
        <div class="grid2">
          ${field('Artikel', `<select name="articleId" required>${articleOptions(articleId)}</select>`, 'span2')}
          ${field('Buchbestand', '<input id="inv-current" readonly>')}
          ${field('Gezählter Bestand', numInp('counted', '', 'required min="0"'))}
          ${field('Datum', inp('date', today(), 'type="date" required'))}
          ${field('Notiz', inp('note', 'Inventur', 'maxlength="200"'))}
        </div>`,
      submit: 'Korrektur buchen',
      onMount(form) {
        const sel = $('[name=articleId]', form);
        const upd = () => { const a = get('articles', sel.value); $('#inv-current').value = a ? `${fmtNum(st[a.id] || 0)} ${a.unit || ''}` : ''; };
        sel.addEventListener('change', upd);
        upd();
      },
      onSubmit(fd) {
        const a = get('articles', fd.articleId);
        if (!a) throw new Error('Bitte Artikel wählen.');
        const diff = r3(num(fd.counted) - (stockMap()[a.id] || 0));
        if (!diff) { toast('Bestand stimmt – keine Korrektur nötig.'); return; }
        put('movements', { articleId: a.id, qty: diff, type: 'correction', date: fd.date, unitCost: num(a.ek), note: fd.note.trim() });
        toast(`Inventurdifferenz ${diff > 0 ? '+' : ''}${fmtNum(diff)} ${a.unit || ''} gebucht`, 'ok');
      },
    });
  }

  function stornoMovement(id) {
    const m = get('movements', id);
    if (!m || m.reversedBy) return;
    const a = articleRaw(m.articleId) || {};
    if (!confirm(`Bewegung „${MV_TYPES[m.type]} ${fmtNum(m.qty)} ${a.unit || ''} ${a.name || ''}“ stornieren? Es wird eine Gegenbuchung erstellt.`)) return;
    const rev = put('movements', { articleId: m.articleId, qty: -num(m.qty), type: 'storno', date: today(), unitCost: m.unitCost, note: `Storno: ${MV_TYPES[m.type]}${m.note ? ` (${m.note})` : ''}`, reverses: m.id });
    put('movements', { ...m, reversedBy: rev.id });
    toast('Bewegung storniert', 'ok');
    render();
  }

  // =============================================================== Ansicht: Belege
  function viewDocuments() {
    const kind = UI.q.docKind === 'purchase' ? 'purchase' : 'sale';
    const isSale = kind === 'sale';
    let docs = all('documents').filter((d) => d.kind === kind).sort((a, b) => byDateDesc(a, b) || String(b.number).localeCompare(String(a.number)));
    const stat = UI.q.docStatus || '';
    if (stat === 'overdue') docs = docs.filter((d) => d.status === 'open' && d.dueDate && d.dueDate < today());
    else if (stat) docs = docs.filter((d) => d.status === stat);
    const q = (UI.q.doc || '').toLowerCase();
    if (q) docs = docs.filter((d) => [d.number, d.contact && d.contact.name, d.reference, ...(d.items || []).map((i) => i.text)].join(' ').toLowerCase().includes(q));
    const allKind = all('documents').filter((d) => d.kind === kind);
    const openSum = sum(allKind.filter((d) => d.status === 'open'), (d) => docTotals(d).gross);
    return `
      <div class="toolbar">
        <div class="seg"><button data-action="set-ui" data-k="docKind" data-v="sale" class="${isSale ? 'active' : ''}">Ausgangsrechnungen</button><button data-action="set-ui" data-k="docKind" data-v="purchase" class="${isSale ? '' : 'active'}">Einkäufe</button></div>
        ${searchBox('doc', 'Nummer, Kontakt, Position …')}
        ${uiSelect('docStatus', [['', 'Alle Status'], ...Object.entries(DOC_STATUS), ...(isSale ? [['overdue', 'Überfällig']] : [])])}
        <div class="actions"><button class="btn primary" data-action="new-doc" data-kind="${kind}">${icon('plus', 16)} ${isSale ? 'Rechnung' : 'Einkauf'}</button></div>
      </div>
      <section class="card flush">
        ${docs.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nummer</th><th>Datum</th><th>${isSale ? 'Kunde' : 'Lieferant'}</th><th>Status</th>${isSale ? '<th>Fällig</th>' : ''}<th class="num">Netto</th><th class="num">Brutto</th></tr></thead>
          <tbody>${docs.map((d) => {
            const t = docTotals(d);
            const od = d.status === 'open' && d.dueDate && d.dueDate < today();
            return `<tr class="clickable" data-action="open-doc" data-id="${d.id}">
              <td><b>${esc(d.number || 'Entwurf')}</b>${d.reference ? `<span class="sub">${esc(d.reference)}</span>` : ''}</td>
              <td>${fmtDate(d.date)}</td>
              <td>${esc((d.contact && d.contact.name) || '—')}</td>
              <td><span class="badge ${od ? 'overdue' : d.status}">${od ? 'Überfällig' : DOC_STATUS[d.status]}</span></td>
              ${isSale ? `<td>${d.status === 'paid' ? `<span class="muted">bezahlt ${fmtDate(d.paidAt)}</span>` : fmtDate(d.dueDate)}</td>` : ''}
              <td class="num">${money(t.net)}</td>
              <td class="num"><b>${money(t.gross)}</b></td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="${isSale ? 5 : 4}">${docs.length} Beleg(e) · offen gesamt ${money(openSum)}</td><td class="num">${money(sum(docs, (d) => docTotals(d).net))}</td><td class="num">${money(sum(docs, (d) => docTotals(d).gross))}</td></tr></tfoot>
        </table></div>` : empty('file', allKind.length ? 'Keine Belege für diesen Filter.' : isSale ? 'Noch keine Rechnungen geschrieben.' : 'Noch keine Einkäufe erfasst.', allKind.length ? '' : `<button class="btn primary" data-action="new-doc" data-kind="${kind}">${icon('plus', 16)} ${isSale ? 'Erste Rechnung' : 'Ersten Einkauf'} erstellen</button>`)}
      </section>`;
  }

  function totalsHtml(t) {
    return `<div class="totals">
      <div><span>Summe netto</span><span>${money(t.net)}</span></div>
      ${t.rates.map((r) => `<div class="muted"><span>USt ${r.rate} % auf ${money(r.net)}</span><span>${money(r.tax)}</span></div>`).join('')}
      <div class="grand"><span>Gesamt brutto</span><span>${money(t.gross)}</span></div>
    </div>`;
  }

  function openDoc(id, kind = 'sale') {
    const existing = id ? get('documents', id) : null;
    if (id && !existing) return toast('Beleg nicht gefunden.', 'error');
    if (existing && existing.status !== 'draft') return openDocView(existing);
    const s = settings();
    const smallBiz = !!s.smallBusiness;
    const doc = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: uid(), kind, status: 'draft', date: today(),
      dueDate: kind === 'sale' ? addDays(today(), num(s.paymentDays) || 14) : '', items: [], contactId: '', reference: '', notes: '',
    };
    const isSale = doc.kind === 'sale';
    const newItem = () => ({ articleId: '', text: '', qty: 1, price: '', tax: smallBiz ? 0 : 19 });
    if (!doc.items.length) doc.items.push(newItem());
    const contacts = all('contacts').filter((c) => c.type === 'both' || c.type === (isSale ? 'customer' : 'supplier')).sort(byName);

    const row = (it, i) => `<tr data-i="${i}">
      <td class="c-art"><select data-f="articleId">${articleOptions(it.articleId, { placeholder: '— Freitext —' })}</select></td>
      <td><input data-f="text" value="${esc(it.text)}" placeholder="Beschreibung" maxlength="300"></td>
      <td class="c-qty"><input data-f="qty" type="number" step="any" class="num" value="${esc(it.qty)}"></td>
      <td class="c-price"><input data-f="price" type="number" step="any" class="num" value="${esc(it.price)}" placeholder="0,00"></td>
      <td class="c-tax"><select data-f="tax">${RATES.map(([v, l]) => `<option value="${v}" ${num(it.tax) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td class="c-total num" data-total>${money(num(it.qty) * num(it.price))}</td>
      <td><button type="button" class="icon-btn" data-rm title="Position entfernen">${icon('x', 16)}</button></td>
    </tr>`;

    const form = openModal({
      title: existing ? `${isSale ? 'Rechnung' : 'Einkauf'} bearbeiten (Entwurf)` : isSale ? 'Neue Rechnung' : 'Neuer Einkauf',
      wide: true,
      body: `<div class="grid3">
          ${field(isSale ? 'Kunde' : 'Lieferant', `<select name="contactId" ${isSale ? 'required' : ''}><option value="">${isSale ? 'Kunde wählen …' : '— ohne Lieferant —'}</option>${contacts.map((c) => `<option value="${c.id}" ${c.id === doc.contactId ? 'selected' : ''}>${esc(c.name)}${c.number ? ` (${esc(c.number)})` : ''}</option>`).join('')}</select>`)}
          ${field(isSale ? 'Rechnungsdatum' : 'Belegdatum', inp('date', doc.date, 'type="date" required'))}
          ${isSale ? field('Fällig am', inp('dueDate', doc.dueDate, 'type="date"')) : field('Lieferanten-Rechnungsnr.', inp('reference', doc.reference, 'maxlength="60"'))}
          ${isSale ? field('Referenz / Bestellnr. des Kunden', inp('reference', doc.reference, 'maxlength="60"')) : ''}
        </div>
        ${!contacts.length ? `<div class="alert info">Noch keine ${isSale ? 'Kunden' : 'Lieferanten'} vorhanden – lege sie unter <a href="#/contacts">Kontakte</a> an.</div>` : ''}
        <div class="table-wrap"><table class="items-table">
          <thead><tr><th>Artikel</th><th>Beschreibung</th><th class="num">Menge</th><th class="num">${isSale ? 'Preis' : 'EK'} netto</th><th>USt</th><th class="num">Summe</th><th></th></tr></thead>
          <tbody id="doc-items"></tbody>
        </table></div>
        <div class="toolbar"><button type="button" class="btn sm" id="add-item">${icon('plus', 14)} Position</button><span class="spacer"></span><div id="doc-totals" style="flex:1"></div></div>
        ${field(isSale ? 'Hinweis auf der Rechnung' : 'Notiz', textarea('notes', doc.notes, 'maxlength="2000" rows="2"'))}
        <p class="muted small">Beim <b>Festschreiben</b> erhält der Beleg eine fortlaufende Nummer und ${isSale ? 'Artikel werden aus dem Lager gebucht' : 'Artikel werden ins Lager eingebucht'}. Danach sind nur noch Zahlung oder Storno möglich.</p>`,
      submit: 'Entwurf speichern',
      extra: `${existing ? '<button type="button" class="btn danger" id="doc-delete">Entwurf löschen</button>' : ''}<button type="button" class="btn" id="doc-finalize">${icon('check', 16)} Festschreiben</button>`,
      onMount(f) {
        const tbody = $('#doc-items', f);
        const drawTotals = () => { $('#doc-totals', f).innerHTML = totalsHtml(calcTotals(doc.items)); };
        const draw = () => { tbody.innerHTML = doc.items.map(row).join(''); drawTotals(); };
        draw();
        tbody.addEventListener('input', (e) => {
          const tr = e.target.closest('tr');
          const fName = e.target.dataset.f;
          if (!tr || !fName) return;
          const it = doc.items[Number(tr.dataset.i)];
          if (fName === 'articleId') {
            it.articleId = e.target.value;
            const a = get('articles', it.articleId);
            if (a) {
              it.text = a.name;
              it.price = isSale ? num(a.vk) : num(a.ek);
              it.tax = smallBiz ? 0 : num(a.tax);
              it.unit = a.unit;
            }
            draw();
            return;
          }
          it[fName] = fName === 'tax' ? num(e.target.value) : e.target.value;
          $('[data-total]', tr).textContent = money(num(it.qty) * num(it.price));
          drawTotals();
        });
        tbody.addEventListener('click', (e) => {
          if (!e.target.closest('[data-rm]')) return;
          doc.items.splice(Number(e.target.closest('tr').dataset.i), 1);
          if (!doc.items.length) doc.items.push(newItem());
          draw();
        });
        $('#add-item', f).addEventListener('click', () => { doc.items.push(newItem()); draw(); $$('[data-f=text]', tbody).pop().focus(); });
        $('#doc-finalize', f).addEventListener('click', () => {
          if (!f.reportValidity()) return;
          try {
            const d = collect(f);
            if (!d.items.length) throw new Error('Bitte mindestens eine Position mit Beschreibung oder Artikel erfassen.');
            if (!confirm(`${isSale ? 'Rechnung' : 'Einkauf'} über ${money(calcTotals(d.items).gross)} festschreiben? Die Lagerbestände werden gebucht.`)) return;
            const saved = finalizeDoc(d);
            closeModal();
            render();
            toast(`${saved.number} festgeschrieben`, 'ok');
            openDocView(saved);
          } catch (err) { toast(err.message, 'error'); }
        });
        const delBtn = $('#doc-delete', f);
        if (delBtn) delBtn.addEventListener('click', () => {
          if (!confirm('Diesen Entwurf löschen?')) return;
          del('documents', doc.id);
          closeModal();
          render();
          toast('Entwurf gelöscht');
        });
      },
      onSubmit(fd, f) {
        put('documents', collect(f));
        toast('Entwurf gespeichert', 'ok');
      },
    });

    // liest Formular + Positionen in eine neue Belegkopie (Editor-Zustand bleibt unverändert)
    function collect(f) {
      const fd = Object.fromEntries(new FormData(f));
      if (isSale && !fd.contactId) throw new Error('Bitte einen Kunden wählen.');
      const c = get('contacts', fd.contactId);
      return {
        ...doc,
        contactId: fd.contactId || '',
        contact: c ? { name: c.name, contactPerson: c.contactPerson, street: c.street, zip: c.zip, city: c.city, country: c.country, vatId: c.vatId, number: c.number } : null,
        date: fd.date,
        dueDate: isSale ? fd.dueDate : '',
        reference: (fd.reference || '').trim(),
        notes: fd.notes || '',
        items: doc.items
          .filter((it) => String(it.text || '').trim() || it.articleId)
          .map((it) => ({ articleId: it.articleId || '', text: String(it.text || '').trim(), qty: num(it.qty), price: num(it.price), tax: num(it.tax), unit: it.unit || (articleRaw(it.articleId) || {}).unit || '' })),
      };
    }
    return form;
  }

  function openDocView(doc) {
    const isSale = doc.kind === 'sale';
    const t = calcTotals(doc.items);
    const od = doc.status === 'open' && doc.dueDate && doc.dueDate < today();
    openModal({
      title: `${isSale ? 'Rechnung' : 'Einkauf'} ${doc.number}`,
      wide: true,
      body: `<div class="meta">
          <div><span>Status</span><b><span class="badge ${od ? 'overdue' : doc.status}">${od ? 'Überfällig' : DOC_STATUS[doc.status]}</span></b></div>
          <div><span>${isSale ? 'Kunde' : 'Lieferant'}</span><b>${esc((doc.contact && doc.contact.name) || '—')}</b></div>
          <div><span>Datum</span><b>${fmtDate(doc.date)}</b></div>
          ${isSale ? `<div><span>Fällig</span><b>${fmtDate(doc.dueDate) || '—'}</b></div>` : ''}
          ${doc.reference ? `<div><span>Referenz</span><b>${esc(doc.reference)}</b></div>` : ''}
          ${doc.paidAt ? `<div><span>Bezahlt am</span><b>${fmtDate(doc.paidAt)}</b></div>` : ''}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Pos.</th><th>Beschreibung</th><th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">USt</th><th class="num">Summe netto</th></tr></thead>
          <tbody>${doc.items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.text)}${it.articleId ? `<span class="sub">${esc((articleRaw(it.articleId) || {}).sku || '')}</span>` : ''}</td><td class="num">${fmtNum(it.qty)} ${esc(it.unit || '')}</td><td class="num">${money(it.price)}</td><td class="num">${num(it.tax)} %</td><td class="num">${money(num(it.qty) * num(it.price))}</td></tr>`).join('')}</tbody>
        </table></div>
        ${totalsHtml(t)}
        ${doc.notes ? `<div class="alert info">${esc(doc.notes)}</div>` : ''}`,
      extra: `<button type="button" class="btn" id="dv-print">${icon('print', 16)} Drucken / PDF</button>
        <button type="button" class="btn" id="dv-copy">${icon('copy', 16)} Kopie</button>
        ${doc.status === 'open' || doc.status === 'paid' ? '<button type="button" class="btn danger" id="dv-cancel">Stornieren</button>' : ''}
        ${doc.status === 'open' ? `<button type="button" class="btn primary" id="dv-paid">${icon('check', 16)} Als bezahlt markieren</button>` : ''}`,
      onMount(f) {
        $('#dv-print', f).addEventListener('click', () => printDoc(doc));
        $('#dv-copy', f).addEventListener('click', () => {
          const copy = { kind: doc.kind, status: 'draft', date: today(), dueDate: doc.kind === 'sale' ? addDays(today(), num(settings().paymentDays) || 14) : '', contactId: doc.contactId, contact: doc.contact, items: JSON.parse(JSON.stringify(doc.items)), notes: doc.notes, reference: '' };
          const saved = put('documents', copy);
          closeModal();
          render();
          openDoc(saved.id);
        });
        const c = $('#dv-cancel', f);
        if (c) c.addEventListener('click', () => {
          if (!confirm(`${doc.number} stornieren? Lagerbewegungen werden zurückgebucht${doc.status === 'paid' ? ' und die Zahlungsbuchung entfernt' : ''}.`)) return;
          cancelDoc(doc);
          closeModal();
          render();
          toast(`${doc.number} storniert`, 'ok');
        });
        const p = $('#dv-paid', f);
        if (p) p.addEventListener('click', () => {
          openModal({
            title: `Zahlung erfassen · ${doc.number}`,
            body: `<p>Betrag: <b>${money(t.gross)}</b> – es wird automatisch eine ${isSale ? 'Einnahme' : 'Ausgabe'} im Kassenbuch erstellt.</p>
              <div class="grid2">${field('Zahlungsdatum', inp('date', today(), 'type="date" required'))}${field('Zahlungsart', selectEl('method', METHODS.map((m) => [m, m]), 'Bank'))}</div>`,
            submit: 'Zahlung buchen',
            onSubmit(fd) {
              markDocPaid(doc, fd.date, fd.method);
              toast(`${doc.number} als bezahlt gebucht`, 'ok');
            },
          });
        });
      },
    });
  }

  function printDoc(doc) {
    const s = settings();
    const t = calcTotals(doc.items);
    const c = doc.contact || {};
    const isSale = doc.kind === 'sale';
    const sender = [s.name || companyName(), s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    $('#print-root').innerHTML = `<div class="print-doc">
      <div class="p-head">
        <div>
          <div class="p-sender">${esc(sender)}</div>
          <div><b>${esc(c.name || '')}</b></div>
          ${c.contactPerson ? `<div>${esc(c.contactPerson)}</div>` : ''}
          <div>${esc(c.street || '')}</div>
          <div>${esc([c.zip, c.city].filter(Boolean).join(' '))}</div>
          ${c.country && c.country !== 'Deutschland' ? `<div>${esc(c.country)}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:800;letter-spacing:.04em">${esc(s.name || companyName())}</div>
          <div>${esc(s.street || '')}</div><div>${esc([s.zip, s.city].filter(Boolean).join(' '))}</div>
          ${s.phone ? `<div>Tel. ${esc(s.phone)}</div>` : ''}${s.email ? `<div>${esc(s.email)}</div>` : ''}${s.website ? `<div>${esc(s.website)}</div>` : ''}
        </div>
      </div>
      <h1>${isSale ? 'Rechnung' : 'Einkaufsbeleg'} ${esc(doc.number)}</h1>
      <div>${isSale ? 'Rechnungsdatum' : 'Belegdatum'}: ${fmtDate(doc.date)}${isSale && doc.dueDate ? ` · Zahlbar bis: ${fmtDate(doc.dueDate)}` : ''}${doc.reference ? ` · Referenz: ${esc(doc.reference)}` : ''}${c.number ? ` · Kunden-Nr.: ${esc(c.number)}` : ''}${c.vatId ? ` · USt-IdNr. Kunde: ${esc(c.vatId)}` : ''}</div>
      <table><thead><tr><th>Pos.</th><th>Beschreibung</th><th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">USt</th><th class="num">Gesamt</th></tr></thead>
        <tbody>${doc.items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.text)}</td><td class="num">${fmtNum(it.qty)} ${esc(it.unit || '')}</td><td class="num">${money(it.price)}</td><td class="num">${num(it.tax)} %</td><td class="num">${money(num(it.qty) * num(it.price))}</td></tr>`).join('')}</tbody></table>
      ${totalsHtml(t)}
      ${s.smallBusiness && isSale ? '<p style="margin-top:16px">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</p>' : ''}
      ${doc.notes ? `<p style="margin-top:16px;white-space:pre-wrap">${esc(doc.notes)}</p>` : ''}
      ${isSale && s.invoiceFooter ? `<p style="margin-top:16px;white-space:pre-wrap">${esc(s.invoiceFooter)}</p>` : ''}
      <div class="p-foot">
        <div><b>${esc(s.name || companyName())}</b><br>${esc(s.street || '')}<br>${esc([s.zip, s.city].filter(Boolean).join(' '))}</div>
        <div>${s.taxNumber ? `Steuernummer: ${esc(s.taxNumber)}<br>` : ''}${s.vatId ? `USt-IdNr.: ${esc(s.vatId)}<br>` : ''}${s.owner ? `Inhaber/GF: ${esc(s.owner)}` : ''}</div>
        <div>${s.bank ? `${esc(s.bank)}<br>` : ''}${s.iban ? `IBAN: ${esc(s.iban)}<br>` : ''}${s.bic ? `BIC: ${esc(s.bic)}` : ''}</div>
      </div>
    </div>`;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
  }

  // =============================================================== Ansicht: Buchungen (Kassenbuch)
  function viewEntries() {
    if (UI.q.entMonth === undefined) UI.q.entMonth = today().slice(0, 7);
    const allE = all('entries');
    let list = allE.slice().sort(byDateDesc);
    if (UI.q.entMonth) list = list.filter((e) => String(e.date || '').startsWith(UI.q.entMonth));
    if (UI.q.entKind) list = list.filter((e) => e.kind === UI.q.entKind);
    if (UI.q.entMethod) list = list.filter((e) => e.method === UI.q.entMethod);
    const q = (UI.q.ent || '').toLowerCase();
    if (q) list = list.filter((e) => [e.description, e.category, e.ref, e.method].join(' ').toLowerCase().includes(q));
    const inc = sum(list.filter((e) => e.kind === 'income'), (e) => e.gross);
    const exp = sum(list.filter((e) => e.kind === 'expense'), (e) => e.gross);
    const bal = (m) => sum(allE.filter((e) => e.method === m), (e) => (e.kind === 'income' ? 1 : -1) * num(e.gross));
    return `
      <div class="kpis">
        ${kpi('Einnahmen (brutto)', money(inc), 'pos', UI.q.entMonth ? monthLabel(UI.q.entMonth) : 'gesamter Zeitraum')}
        ${kpi('Ausgaben (brutto)', money(exp), 'neg', UI.q.entMonth ? monthLabel(UI.q.entMonth) : 'gesamter Zeitraum')}
        ${kpi('Saldo', money(inc - exp), inc - exp >= 0 ? 'pos' : 'neg', `${list.length} Buchung(en)`)}
        ${kpi('Bank / Kasse (gesamt)', `${money(bal('Bank'))}`, '', `Kasse: ${money(bal('Kasse'))}`)}
      </div>
      <div class="toolbar">
        ${searchBox('ent', 'Beschreibung, Kategorie, Beleg …')}
        <input type="month" id="s-entMonth" data-ui="entMonth" value="${esc(UI.q.entMonth)}" title="Monat (leeren für alle)">
        ${uiSelect('entKind', [['', 'Einnahmen & Ausgaben'], ['income', 'Nur Einnahmen'], ['expense', 'Nur Ausgaben']])}
        ${uiSelect('entMethod', [['', 'Alle Zahlungsarten'], ...METHODS.map((m) => [m, m])])}
        <div class="actions">
          <button class="btn" data-action="set-ui" data-k="entMonth" data-v="">Alle Monate</button>
          <button class="btn" data-action="new-entry" data-kind="expense">${icon('minus', 16)} Ausgabe</button>
          <button class="btn primary" data-action="new-entry" data-kind="income">${icon('plus', 16)} Einnahme</button>
        </div>
      </div>
      <section class="card flush">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Datum</th><th>Art</th><th>Beschreibung</th><th>Kategorie</th><th>Zahlungsart</th><th class="num">Netto</th><th class="num">USt</th><th class="num">Brutto</th></tr></thead>
          <tbody>${list.map((e) => `<tr class="clickable" data-action="edit-entry" data-id="${e.id}">
            <td>${fmtDate(e.date)}</td>
            <td><span class="badge ${e.kind}">${KINDS[e.kind]}</span></td>
            <td><b>${esc(e.description || '—')}</b>${e.ref ? `<span class="sub">Beleg ${esc(e.ref)}</span>` : ''}</td>
            <td>${esc(e.category || '')}</td>
            <td>${esc(e.method || '')}</td>
            <td class="num">${money(e.net)}</td>
            <td class="num muted">${money(e.tax)} <span class="small">(${e.rate == null ? 'gem.' : `${e.rate} %`})</span></td>
            <td class="num ${e.kind === 'income' ? 'pos' : 'neg'}"><b>${e.kind === 'income' ? '' : '−'}${money(e.gross)}</b></td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="5">Summe (Einnahmen − Ausgaben)</td>
            <td class="num">${money(sum(list, (e) => (e.kind === 'income' ? 1 : -1) * num(e.net)))}</td>
            <td class="num">${money(sum(list, (e) => (e.kind === 'income' ? 1 : -1) * num(e.tax)))}</td>
            <td class="num">${money(inc - exp)}</td></tr></tfoot>
        </table></div>` : empty('book', allE.length ? 'Keine Buchungen in diesem Zeitraum.' : 'Noch keine Buchungen. Erfasse Einnahmen und Ausgaben oder markiere Rechnungen als bezahlt.')}
      </section>`;
  }

  function openEntry(id, kind = 'income') {
    const e = id ? get('entries', id) : null;
    if (id && !e) return toast('Buchung nicht gefunden.', 'error');
    const d = e || { kind, date: today(), rate: settings().smallBusiness ? 0 : 19, method: 'Bank', category: kind === 'income' ? CAT_IN[0] : CAT_OUT[0] };
    const usedCats = all('entries').map((x) => x.category).filter(Boolean);
    const rateOpts = [...RATES, ...(d.rate == null && e ? [['mixed', 'gemischt']] : [])];
    openModal({
      title: e ? 'Buchung bearbeiten' : kind === 'income' ? 'Neue Einnahme' : 'Neue Ausgabe',
      body: `${e && e.docId ? `<div class="alert info">Diese Buchung wurde aus Beleg <b>${esc(e.ref)}</b> erzeugt.</div>` : ''}
        <div class="grid2">
          ${field('Art', selectEl('kind', Object.entries(KINDS), d.kind))}
          ${field('Datum', inp('date', d.date, 'type="date" required'))}
          ${field('Beschreibung', inp('description', d.description, 'required maxlength="200" placeholder="z. B. Büromiete November"'), 'span2')}
          ${field('Kategorie', inp('category', d.category, 'list="dl-ecat" maxlength="60" required'))}
          ${field('Zahlungsart', selectEl('method', METHODS.map((m) => [m, m]), d.method))}
          ${field('Betrag brutto (€)', numInp('gross', d.gross ?? '', 'required min="0"'))}
          ${field('USt-Satz', selectEl('rate', rateOpts, d.rate == null ? 'mixed' : d.rate))}
          ${field('Belegnummer / Referenz', inp('ref', d.ref, 'maxlength="60"'))}
          ${field('Netto / USt', '<input id="entry-split" readonly>')}
        </div>${datalist('dl-ecat', [...CAT_IN, ...CAT_OUT, ...usedCats])}`,
      extra: e ? `<button type="button" class="btn danger" id="entry-del">Löschen</button>` : '',
      onMount(f) {
        const upd = () => {
          const g = num($('[name=gross]', f).value);
          const r = $('[name=rate]', f).value;
          const sp = r === 'mixed' && e ? { net: r2(e.net * (g / (e.gross || 1))), tax: r2(e.tax * (g / (e.gross || 1))) } : splitGross(g, r);
          $('#entry-split', f).value = `${money(sp.net)} netto · ${money(sp.tax)} USt`;
        };
        f.addEventListener('input', upd);
        upd();
        const b = $('#entry-del', f);
        if (b) b.addEventListener('click', () => {
          if (!confirm(`Buchung „${e.description}“ löschen?${e.docId ? ' Der zugehörige Beleg bleibt als „bezahlt“ markiert.' : ''}`)) return;
          del('entries', e.id);
          closeModal();
          render();
          toast('Buchung gelöscht');
        });
      },
      onSubmit(fd) {
        const g = num(fd.gross);
        if (g <= 0) throw new Error('Betrag muss größer als 0 sein.');
        let sp;
        let rate;
        if (fd.rate === 'mixed' && e) {
          const k = g / (e.gross || 1);
          sp = { gross: r2(g), net: r2(e.net * k), tax: r2(g - r2(e.net * k)) };
          rate = null;
        } else {
          rate = num(fd.rate);
          sp = splitGross(g, rate);
        }
        put('entries', { ...(e || {}), kind: fd.kind, date: fd.date, description: fd.description.trim(), category: fd.category.trim(), method: fd.method, ref: fd.ref.trim(), rate, ...sp });
        toast('Buchung gespeichert', 'ok');
      },
    });
  }

  // =============================================================== Ansicht: Kontakte
  function viewContacts() {
    const allC = all('contacts').sort(byName);
    let list = allC;
    if (UI.q.cType) list = list.filter((c) => c.type === UI.q.cType || c.type === 'both');
    const q = (UI.q.c || '').toLowerCase();
    if (q) list = list.filter((c) => [c.name, c.number, c.contactPerson, c.email, c.phone, c.city].join(' ').toLowerCase().includes(q));
    const docs = all('documents').filter((d) => d.status === 'open' || d.status === 'paid');
    const volume = {};
    for (const d of docs) volume[d.contactId] = (volume[d.contactId] || 0) + docTotals(d).net;
    return `
      <div class="toolbar">
        ${searchBox('c', 'Name, Nr., E-Mail, Ort …')}
        ${uiSelect('cType', [['', 'Alle Kontakte'], ['customer', 'Kunden'], ['supplier', 'Lieferanten']])}
        <div class="actions"><button class="btn primary" data-action="new-contact">${icon('plus', 16)} Kontakt</button></div>
      </div>
      <section class="card flush">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nr.</th><th>Name</th><th>Typ</th><th>Ansprechpartner</th><th>E-Mail</th><th>Telefon</th><th>Ort</th><th class="num">Volumen netto</th></tr></thead>
          <tbody>${list.map((c) => `<tr class="clickable" data-action="edit-contact" data-id="${c.id}">
            <td class="muted">${esc(c.number || '')}</td>
            <td><b>${esc(c.name)}</b></td>
            <td><span class="badge">${CONTACT_TYPES[c.type] || ''}</span></td>
            <td>${esc(c.contactPerson || '')}</td>
            <td>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</td>
            <td>${esc(c.phone || '')}</td>
            <td>${esc([c.zip, c.city].filter(Boolean).join(' '))}</td>
            <td class="num">${money(volume[c.id] || 0)}</td></tr>`).join('')}</tbody>
        </table></div>` : empty('users', allC.length ? 'Keine Kontakte für diesen Filter.' : 'Noch keine Kunden oder Lieferanten.', allC.length ? '' : `<button class="btn primary" data-action="new-contact">${icon('plus', 16)} Ersten Kontakt anlegen</button>`)}
      </section>`;
  }

  function openContact(id) {
    const c = id ? get('contacts', id) : null;
    const d = c || { type: 'customer', country: 'Deutschland' };
    openModal({
      title: c ? c.name : 'Neuer Kontakt',
      body: `<div class="grid2">
          ${field('Typ', selectEl('type', Object.entries(CONTACT_TYPES), d.type))}
          ${field('Kunden-/Lieferantennr.', inp('number', d.number || '', 'maxlength="30" placeholder="automatisch"'))}
          ${field('Firma / Name', inp('name', d.name, 'required maxlength="160"'), 'span2')}
          ${field('Ansprechpartner', inp('contactPerson', d.contactPerson, 'maxlength="100"'))}
          ${field('E-Mail', inp('email', d.email, 'type="email" maxlength="120"'))}
          ${field('Telefon', inp('phone', d.phone, 'type="tel" maxlength="40"'))}
          ${field('USt-IdNr.', inp('vatId', d.vatId, 'maxlength="30"'))}
          ${field('Straße & Hausnr.', inp('street', d.street, 'maxlength="120"'), 'span2')}
          ${field('PLZ', inp('zip', d.zip, 'maxlength="12"'))}
          ${field('Ort', inp('city', d.city, 'maxlength="80"'))}
          ${field('Land', inp('country', d.country, 'maxlength="60"'))}
          ${field('IBAN', inp('iban', d.iban, 'maxlength="40"'))}
          ${field('Notizen', textarea('notes', d.notes, 'maxlength="2000"'), 'span2')}
        </div>`,
      extra: c ? `<button type="button" class="btn danger" id="c-del">Löschen</button>` : '',
      onMount(f) {
        const b = $('#c-del', f);
        if (b) b.addEventListener('click', () => {
          if (!confirm(`Kontakt „${c.name}“ löschen? Bestehende Belege behalten die Adressdaten.`)) return;
          del('contacts', c.id);
          closeModal();
          render();
          toast('Kontakt gelöscht');
        });
      },
      onSubmit(fd) {
        const data = { ...(c || {}) };
        for (const k of ['type', 'number', 'name', 'contactPerson', 'email', 'phone', 'vatId', 'street', 'zip', 'city', 'country', 'iban', 'notes']) data[k] = String(fd[k] || '').trim();
        if (!data.number) data.number = nextCode('contacts', data.type === 'supplier' ? 'L' : 'K', 'number');
        put('contacts', data);
        toast('Kontakt gespeichert', 'ok');
      },
    });
  }

  // =============================================================== Ansicht: Berichte
  function periodRange(year, p) {
    const end = (m) => `${year}-${pad(m)}-${pad(new Date(Number(year), m, 0).getDate())}`;
    if (p === 'year') return [`${year}-01-01`, `${year}-12-31`];
    if (p[0] === 'q') {
      const s = (Number(p[1]) - 1) * 3 + 1;
      return [`${year}-${pad(s)}-01`, end(s + 2)];
    }
    const m = Number(p.slice(1));
    return [`${year}-${pad(m)}-01`, end(m)];
  }
  function viewReports() {
    const entries = all('entries');
    const years = [...new Set([today().slice(0, 4), ...entries.map((e) => String(e.date || '').slice(0, 4))].filter(Boolean))].sort().reverse();
    if (!UI.q.repYear) UI.q.repYear = today().slice(0, 4);
    const year = UI.q.repYear;
    const period = UI.q.repPeriod || 'year';
    const [from, to] = periodRange(year, period);
    const inRange = entries.filter((e) => e.date >= from && e.date <= to);
    const inc = inRange.filter((e) => e.kind === 'income');
    const exp = inRange.filter((e) => e.kind === 'expense');
    const incNet = sum(inc, (e) => e.net);
    const expNet = sum(exp, (e) => e.net);
    const ust = sum(inc, (e) => e.tax);
    const vst = sum(exp, (e) => e.tax);
    const byCat = (arr) => {
      const m = {};
      for (const e of arr) m[e.category || 'Ohne Kategorie'] = (m[e.category || 'Ohne Kategorie'] || 0) + num(e.net);
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const catTable = (rows, total) => rows.length ? `<table><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${money(v)}</td><td class="num muted" style="width:70px">${total ? Math.round((v / total) * 100) : 0} %</td></tr>`).join('')}</tbody><tfoot><tr><td>Summe</td><td class="num">${money(total)}</td><td></td></tr></tfoot></table>` : '<p class="muted">Keine Daten im Zeitraum.</p>';
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`).map((k) => {
      const es = entries.filter((e) => String(e.date || '').startsWith(k));
      return { label: monthLabel(k).split(' ')[0], a: sum(es.filter((e) => e.kind === 'income'), (e) => e.net), b: sum(es.filter((e) => e.kind === 'expense'), (e) => e.net) };
    });
    // Lager
    const st = stockMap();
    const arts = articles();
    const stockCats = {};
    for (const a of arts) stockCats[a.category || 'Ohne Kategorie'] = (stockCats[a.category || 'Ohne Kategorie'] || 0) + Math.max(0, st[a.id] || 0) * num(a.ek);
    const stockTotal = sum(Object.values(stockCats), (v) => v);
    const top = arts.map((a) => ({ a, v: Math.max(0, st[a.id] || 0) * num(a.ek) })).sort((x, y) => y.v - x.v).slice(0, 8);
    // Offene Posten
    const openSale = all('documents').filter((d) => d.kind === 'sale' && d.status === 'open');
    const openPurch = all('documents').filter((d) => d.kind === 'purchase' && d.status === 'open');
    const periodOpts = [['year', 'Gesamtjahr'], ['q1', '1. Quartal'], ['q2', '2. Quartal'], ['q3', '3. Quartal'], ['q4', '4. Quartal'],
      ...Array.from({ length: 12 }, (_, i) => [`m${pad(i + 1)}`, new Date(2000, i, 1).toLocaleDateString('de-DE', { month: 'long' })])];
    return `
      <div class="toolbar">
        ${uiSelect('repYear', years.map((y) => [y, y]))}
        ${uiSelect('repPeriod', periodOpts)}
        <span class="muted">${fmtDate(from)} – ${fmtDate(to)}</span>
        <div class="actions">
          <button class="btn" data-action="export" data-what="entries">${icon('download', 16)} Buchungen CSV</button>
          <button class="btn" data-action="export" data-what="backup">${icon('download', 16)} Backup JSON</button>
        </div>
      </div>
      <div class="kpis">
        ${kpi('Betriebseinnahmen (netto)', money(incNet), 'pos')}
        ${kpi('Betriebsausgaben (netto)', money(expNet), 'neg')}
        ${kpi('Gewinn / Verlust', money(incNet - expNet), incNet - expNet >= 0 ? 'pos' : 'neg', 'nach EÜR-Logik (Zufluss)')}
        ${kpi('USt-Zahllast', money(ust - vst), ust - vst > 0 ? 'neg' : 'pos', `USt ${money(ust)} − Vorsteuer ${money(vst)}`)}
      </div>
      <section class="card"><div class="card-head"><h3>Monatsverlauf ${esc(year)}</h3><span class="muted">netto</span></div>${barChart(months)}</section>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h3>Einnahmen nach Kategorie</h3></div>${catTable(byCat(inc), incNet)}</section>
        <section class="card"><div class="card-head"><h3>Ausgaben nach Kategorie</h3></div>${catTable(byCat(exp), expNet)}</section>
      </div>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h3>Umsatzsteuer-Übersicht</h3><span class="muted">Hilfe für die UStVA – keine Steuerberatung</span></div>
          <table><tbody>
            ${[19, 7, 0].map((r) => { const es = inc.filter((e) => num(e.rate) === r && e.rate != null); return `<tr><td>Umsätze ${r} %</td><td class="num">${money(sum(es, (e) => e.net))}</td><td class="num">${money(sum(es, (e) => e.tax))}</td></tr>`; }).join('')}
            ${inc.some((e) => e.rate == null) ? `<tr><td>Umsätze gemischt</td><td class="num">${money(sum(inc.filter((e) => e.rate == null), (e) => e.net))}</td><td class="num">${money(sum(inc.filter((e) => e.rate == null), (e) => e.tax))}</td></tr>` : ''}
            <tr><td>Vorsteuer aus Ausgaben</td><td class="num">${money(expNet)}</td><td class="num">−${money(vst)}</td></tr>
          </tbody><tfoot><tr><td>Zahllast / Erstattung</td><td></td><td class="num">${money(ust - vst)}</td></tr></tfoot></table>
        </section>
        <section class="card"><div class="card-head"><h3>Offene Posten</h3><span class="muted">aktuell</span></div>
          <table><tbody>
            <tr><td>Forderungen (Ausgangsrechnungen)</td><td class="num">${openSale.length}</td><td class="num">${money(sum(openSale, (d) => docTotals(d).gross))}</td></tr>
            <tr><td>davon überfällig</td><td class="num">${openSale.filter((d) => d.dueDate && d.dueDate < today()).length}</td><td class="num neg">${money(sum(openSale.filter((d) => d.dueDate && d.dueDate < today()), (d) => docTotals(d).gross))}</td></tr>
            <tr><td>Verbindlichkeiten (Einkäufe)</td><td class="num">${openPurch.length}</td><td class="num">${money(sum(openPurch, (d) => docTotals(d).gross))}</td></tr>
          </tbody></table>
        </section>
      </div>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h3>Lagerwert nach Kategorie</h3><span class="muted">zu Einkaufspreisen</span></div>${catTable(Object.entries(stockCats).sort((a, b) => b[1] - a[1]), stockTotal)}</section>
        <section class="card"><div class="card-head"><h3>Wertvollste Lagerposten</h3></div>
          ${top.length ? `<table><tbody>${top.map(({ a, v }) => `<tr><td><b>${esc(a.name)}</b><span class="sub">${esc(a.sku)} · ${fmtNum(st[a.id] || 0)} ${esc(a.unit || '')}</span></td><td class="num">${money(v)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Keine Artikel.</p>'}
        </section>
      </div>
      <section class="card"><div class="card-head"><h3>Datenexport</h3><span class="muted">CSV im Excel-Format (Semikolon, UTF-8)</span></div>
        <div class="toolbar">
          <button class="btn" data-action="export" data-what="entries">${icon('download', 16)} Buchungen (Zeitraum)</button>
          <button class="btn" data-action="export" data-what="articles">${icon('download', 16)} Artikel & Bestände</button>
          <button class="btn" data-action="export" data-what="movements">${icon('download', 16)} Lagerbewegungen</button>
          <button class="btn" data-action="export" data-what="documents">${icon('download', 16)} Belege</button>
          <button class="btn" data-action="export" data-what="contacts">${icon('download', 16)} Kontakte</button>
          <button class="btn" data-action="export" data-what="backup">${icon('download', 16)} Komplett-Backup (JSON)</button>
        </div>
      </section>`;
  }

  function doExport(what) {
    const stamp = today();
    const st = stockMap();
    if (what === 'entries') {
      const year = UI.q.repYear || today().slice(0, 4);
      const [from, to] = UI.route === 'reports' ? periodRange(year, UI.q.repPeriod || 'year') : ['0000', '9999'];
      const rows = all('entries').filter((e) => e.date >= from && e.date <= to).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      downloadCsv(`nexcount-buchungen-${stamp}.csv`, ['Datum', 'Art', 'Kategorie', 'Beschreibung', 'Zahlungsart', 'Beleg', 'Netto', 'USt-Satz', 'USt', 'Brutto'],
        rows.map((e) => [fmtDate(e.date), KINDS[e.kind], e.category, e.description, e.method, e.ref, num(e.net), e.rate == null ? 'gemischt' : `${e.rate} %`, num(e.tax), num(e.gross)]));
    } else if (what === 'articles') {
      downloadCsv(`nexcount-artikel-${stamp}.csv`, ['Art.-Nr.', 'Bezeichnung', 'Kategorie', 'EAN', 'Einheit', 'Bestand', 'Mindestbestand', 'EK netto', 'VK netto', 'USt-Satz', 'Lagerwert', 'Lagerort'],
        articles().map((a) => [a.sku, a.name, a.category, a.ean, a.unit, st[a.id] || 0, num(a.min), num(a.ek), num(a.vk), `${num(a.tax)} %`, Math.max(0, st[a.id] || 0) * num(a.ek), a.location]));
    } else if (what === 'movements') {
      downloadCsv(`nexcount-lagerbewegungen-${stamp}.csv`, ['Datum', 'Art.-Nr.', 'Artikel', 'Art', 'Menge', 'Einheit', 'EK je Einheit', 'Notiz', 'Erfasst von'],
        all('movements').sort((a, b) => String(a.date).localeCompare(String(b.date))).map((m) => { const a = articleRaw(m.articleId) || {}; return [fmtDate(m.date), a.sku, a.name, MV_TYPES[m.type], num(m.qty), a.unit, num(m.unitCost), m.note, m.createdBy]; }));
    } else if (what === 'documents') {
      downloadCsv(`nexcount-belege-${stamp}.csv`, ['Nummer', 'Typ', 'Datum', 'Fällig', 'Kontakt', 'Status', 'Netto', 'USt', 'Brutto', 'Bezahlt am'],
        all('documents').sort((a, b) => String(a.date).localeCompare(String(b.date))).map((d) => { const t = calcTotals(d.items); return [d.number || 'Entwurf', d.kind === 'sale' ? 'Rechnung' : 'Einkauf', fmtDate(d.date), fmtDate(d.dueDate), d.contact && d.contact.name, DOC_STATUS[d.status], t.net, t.tax, t.gross, fmtDate(d.paidAt)]; }));
    } else if (what === 'contacts') {
      downloadCsv(`nexcount-kontakte-${stamp}.csv`, ['Nr.', 'Typ', 'Name', 'Ansprechpartner', 'E-Mail', 'Telefon', 'Straße', 'PLZ', 'Ort', 'Land', 'USt-IdNr.', 'IBAN'],
        all('contacts').sort(byName).map((c) => [c.number, CONTACT_TYPES[c.type], c.name, c.contactPerson, c.email, c.phone, c.street, c.zip, c.city, c.country, c.vatId, c.iban]));
    } else if (what === 'backup') {
      const out = { app: 'NEXCOUNT', version: 1, exportedAt: new Date().toISOString(), company: companyName(), data: {} };
      for (const c of ['articles', 'movements', 'contacts', 'documents', 'entries', 'settings']) out.data[c] = all(c);
      download(`nexcount-backup-${stamp}.json`, JSON.stringify(out, null, 2), 'application/json');
    }
    toast('Export erstellt', 'ok');
  }

  // =============================================================== Ansicht: Einstellungen
  function viewSettings() {
    const s = settings();
    const admin = S.user.role === 'admin';
    const theme = themePref();
    return `
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>Firmendaten</h3><span class="muted">erscheinen auf Rechnungen</span></div>
          <form data-form="company" class="stack">
            <div class="grid2">
              ${field('Firmenname', inp('name', s.name || companyName(), 'required maxlength="120"'), 'span2')}
              ${field('Inhaber / Geschäftsführer', inp('owner', s.owner, 'maxlength="100"'), 'span2')}
              ${field('Straße & Hausnr.', inp('street', s.street, 'maxlength="120"'), 'span2')}
              ${field('PLZ', inp('zip', s.zip, 'maxlength="12"'))}
              ${field('Ort', inp('city', s.city, 'maxlength="80"'))}
              ${field('Telefon', inp('phone', s.phone, 'maxlength="40"'))}
              ${field('E-Mail', inp('email', s.email, 'type="email" maxlength="120"'))}
              ${field('Website', inp('website', s.website, 'maxlength="120"'), 'span2')}
              ${field('Steuernummer', inp('taxNumber', s.taxNumber, 'maxlength="30"'))}
              ${field('USt-IdNr.', inp('vatId', s.vatId, 'maxlength="30"'))}
              ${field('Bank', inp('bank', s.bank, 'maxlength="80"'))}
              ${field('IBAN', inp('iban', s.iban, 'maxlength="40"'))}
              ${field('BIC', inp('bic', s.bic, 'maxlength="20"'))}
              ${field('Zahlungsziel (Tage)', numInp('paymentDays', s.paymentDays ?? 14, 'min="0" max="365"'))}
              ${field('Präfix Rechnungen', inp('invoicePrefix', s.invoicePrefix || 'RE', 'maxlength="8" pattern="[A-Za-z0-9]+"'))}
              ${field('Präfix Einkäufe', inp('purchasePrefix', s.purchasePrefix || 'EK', 'maxlength="8" pattern="[A-Za-z0-9]+"'))}
              ${field('Fußtext auf Rechnungen', textarea('invoiceFooter', s.invoiceFooter || 'Vielen Dank für Ihren Auftrag! Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer.', 'maxlength="1000" rows="2"'), 'span2')}
            </div>
            <label class="check"><input type="checkbox" name="smallBusiness" ${s.smallBusiness ? 'checked' : ''}> Kleinunternehmer nach § 19 UStG (keine Umsatzsteuer ausweisen)</label>
            <div><button class="btn primary" type="submit">Firmendaten speichern</button></div>
          </form>
        </section>
        <div class="stack" style="gap:18px;align-content:start">
          <section class="card">
            <div class="card-head"><h3>Synchronisierung</h3><button class="btn sm" data-action="sync-now">${icon('sync', 14)} Jetzt synchronisieren</button></div>
            <div class="meta">
              <div><span>Status</span><b>${S.online ? (S.syncError ? `Fehler: ${esc(S.syncError)}` : 'Online · Live-Verbindung') : 'Offline'}</b></div>
              <div><span>Letzte Synchronisierung</span><b>${S.lastSync ? fmtTime(S.lastSync) : '—'}</b></div>
              <div><span>Ausstehende Änderungen</span><b>${S.pending.length}</b></div>
              <div><span>Datenstand (Revision)</span><b>${S.seq}</b></div>
            </div>
            <p class="muted small" style="margin-top:12px">Alle Änderungen werden lokal gespeichert und automatisch mit dem Server abgeglichen. Andere Geräte erhalten Updates in Echtzeit. Bei gleichzeitiger Bearbeitung desselben Datensatzes gewinnt die neueste Änderung.</p>
            <div class="toolbar" style="margin-top:12px"><button class="btn sm" data-action="rebuild-cache">Lokalen Cache neu aufbauen</button></div>
          </section>
          <section class="card">
            <div class="card-head"><h3>Mein Konto</h3><span class="badge ${admin ? 'open' : ''}">${admin ? 'Administrator' : 'Mitarbeiter'}</span></div>
            <form data-form="profile" class="grid2" style="margin-bottom:16px">
              ${field('Name', inp('name', S.user.name, 'required maxlength="80"'))}
              ${field('E-Mail', `<input value="${esc(S.user.email)}" readonly>`)}
              <div><button class="btn sm" type="submit">Name speichern</button></div>
            </form>
            <form data-form="password" class="grid2">
              ${field('Neues Passwort', '<input name="newPassword" type="password" required minlength="8" autocomplete="new-password">')}
              ${field('Neues Passwort wiederholen', '<input name="newPassword2" type="password" required minlength="8" autocomplete="new-password">')}
              <div><button class="btn sm" type="submit">Passwort ändern</button></div>
            </form>
          </section>
          <section class="card">
            <div class="card-head"><h3>Darstellung</h3></div>
            <div class="seg">${[['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button data-action="theme" data-v="${v}" class="${theme === v ? 'active' : ''}">${l}</button>`).join('')}</div>
          </section>
        </div>
      </div>
      ${admin ? `<section class="card">
        <div class="card-head"><h3>Team & Zugänge</h3><span class="muted">${S.members.length} Benutzer</span></div>
        <div class="grid-2">
          <div class="stack">
            <p class="muted">Neue Mitarbeiter registrieren sich mit diesem Einladungscode und arbeiten sofort im selben Datenbestand.</p>
            <div class="code-box"><span class="code">${esc(S.company.inviteCode || '—')}</span>
              <button class="btn sm" data-action="invite-copy">${icon('copy', 14)} Kopieren</button>
              <button class="btn sm" data-action="invite-rotate">${icon('sync', 14)} Neuer Code</button></div>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th></th></tr></thead>
            <tbody>${S.members.slice().sort(byName).map((m) => `<tr>
              <td><b>${esc(m.name)}</b>${m.id === S.user.id ? ' <span class="muted small">(du)</span>' : ''}</td>
              <td>${esc(m.email)}</td>
              <td>${m.role === 'admin' ? 'Admin' : 'Mitarbeiter'}</td>
              <td class="actions">${m.id === S.user.id ? '' : `<button class="btn sm" data-action="member-role" data-id="${m.id}" data-role="${m.role === 'admin' ? 'member' : 'admin'}">${m.role === 'admin' ? 'Zu Mitarbeiter' : 'Zu Admin'}</button>
                <button class="btn sm danger" data-action="member-remove" data-id="${m.id}">Entfernen</button>`}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
      </section>` : ''}
      <p class="muted small" style="text-align:center">NEXCOUNT v1.0 · by Andrerer</p>`;
  }

  // =============================================================== Demo-Daten
  function seedDemo() {
    if (!confirm('Beispieldaten (Artikel, Kontakte, Buchungen, Rechnungen) anlegen? Sie werden mit deinem Team synchronisiert.')) return;
    const s = settings();
    if (!s.street) put('settings', { ...s, id: 'company', name: s.name || companyName(), street: 'Hauptstraße 12', zip: '10115', city: 'Berlin', email: 'info@example.com', taxNumber: '12/345/67890', iban: 'DE02 1203 0000 0000 2020 51', bic: 'BYLADEM1001', bank: 'Musterbank', paymentDays: 14 });
    const k1 = put('contacts', { type: 'customer', number: 'K-0001', name: 'Müller Gastro GmbH', contactPerson: 'Anna Müller', email: 'einkauf@mueller-gastro.example', phone: '030 1234567', street: 'Lindenallee 4', zip: '10117', city: 'Berlin', country: 'Deutschland' });
    const k2 = put('contacts', { type: 'customer', number: 'K-0002', name: 'Café Sonnenschein', contactPerson: 'Jonas Weber', email: 'hallo@cafe-sonnenschein.example', street: 'Marktplatz 1', zip: '14467', city: 'Potsdam', country: 'Deutschland' });
    const l1 = put('contacts', { type: 'supplier', number: 'L-0001', name: 'Rösterei Nordlicht KG', email: 'vertrieb@nordlicht.example', street: 'Hafenstraße 22', zip: '20457', city: 'Hamburg', country: 'Deutschland' });
    const mk = (sku, name, category, unit, ek, vk, tax, min, location, initial) => {
      const a = put('articles', { sku, name, category, unit, ek, vk, tax, min, location });
      put('movements', { articleId: a.id, qty: initial, type: 'initial', date: addDays(today(), -60), unitCost: ek, note: 'Anfangsbestand' });
      return a;
    };
    const a1 = mk('A-0001', 'Espressobohnen Classico 1 kg', 'Kaffee', 'Stk', 11.9, 19.9, 7, 20, 'Regal A1', 64);
    const a2 = mk('A-0002', 'Hafermilch Barista 1 l', 'Milchalternativen', 'Stk', 1.45, 2.6, 7, 48, 'Kühlraum', 40);
    const a3 = mk('A-0003', 'Coffee-to-go Becher 300 ml (50 Stk)', 'Verpackung', 'Pkt', 4.2, 8.5, 19, 15, 'Regal B2', 22);
    mk('A-0004', 'Siebträger-Reinigungstabletten', 'Zubehör', 'Pkt', 6.8, 12.9, 19, 5, 'Regal C1', 12);
    mk('A-0005', 'Milchkännchen Edelstahl 600 ml', 'Zubehör', 'Stk', 9.5, 19.0, 19, 3, 'Regal C2', 7);
    const inv1 = { id: uid(), kind: 'sale', status: 'draft', date: addDays(today(), -24), dueDate: addDays(today(), -10), contactId: k1.id, contact: { name: k1.name, contactPerson: k1.contactPerson, street: k1.street, zip: k1.zip, city: k1.city, country: k1.country, number: k1.number }, items: [{ articleId: a1.id, text: a1.name, qty: 12, price: 19.9, tax: 7, unit: 'Stk' }, { articleId: a3.id, text: a3.name, qty: 4, price: 8.5, tax: 19, unit: 'Pkt' }], notes: '' };
    const d1 = finalizeDoc(inv1);
    markDocPaid(d1, addDays(today(), -12), 'Bank');
    const inv2 = { id: uid(), kind: 'sale', status: 'draft', date: addDays(today(), -5), dueDate: addDays(today(), 9), contactId: k2.id, contact: { name: k2.name, contactPerson: k2.contactPerson, street: k2.street, zip: k2.zip, city: k2.city, country: k2.country, number: k2.number }, items: [{ articleId: a2.id, text: a2.name, qty: 24, price: 2.6, tax: 7, unit: 'Stk' }, { articleId: '', text: 'Barista-Schulung (2 Std.)', qty: 2, price: 65, tax: 19, unit: 'Std' }], notes: '' };
    finalizeDoc(inv2);
    const p1 = { id: uid(), kind: 'purchase', status: 'draft', date: addDays(today(), -30), dueDate: '', contactId: l1.id, contact: { name: l1.name, street: l1.street, zip: l1.zip, city: l1.city }, reference: 'NL-88412', items: [{ articleId: a1.id, text: a1.name, qty: 30, price: 11.9, tax: 7, unit: 'Stk' }], notes: '' };
    markDocPaid(finalizeDoc(p1), addDays(today(), -28), 'Bank');
    const ent = (daysAgo, kind, category, description, gross, rate, method) => put('entries', { date: addDays(today(), -daysAgo), kind, category, description, method, rate, ...splitGross(gross, rate) });
    ent(2, 'expense', 'Miete', 'Lagermiete', 650, 19, 'Bank');
    ent(32, 'expense', 'Miete', 'Lagermiete', 650, 19, 'Bank');
    ent(62, 'expense', 'Miete', 'Lagermiete', 650, 19, 'Bank');
    ent(92, 'expense', 'Miete', 'Lagermiete', 650, 19, 'Bank');
    ent(8, 'expense', 'Software', 'Kassensystem Lizenz', 39, 19, 'Karte');
    ent(15, 'income', 'Warenverkauf', 'Barverkauf Ladengeschäft', 486.4, 7, 'Kasse');
    ent(45, 'income', 'Warenverkauf', 'Barverkauf Ladengeschäft', 1240.5, 7, 'Kasse');
    ent(75, 'income', 'Warenverkauf', 'Barverkauf Ladengeschäft', 980, 7, 'Kasse');
    ent(105, 'income', 'Dienstleistung', 'Maschinenwartung Café Rosa', 357, 19, 'Bank');
    ent(50, 'expense', 'Marketing', 'Flyer & Plakate', 214.2, 19, 'Bank');
    ent(130, 'income', 'Warenverkauf', 'Wochenmarkt-Verkauf', 720, 7, 'Kasse');
    ent(140, 'expense', 'Fahrzeug', 'Tanken Lieferwagen', 96.5, 19, 'Karte');
    toast('Demo-Daten angelegt', 'ok');
    render();
  }

  // =============================================================== Formulare (Inline)
  const FORMS = {
    async auth(fd, f) {
      const btn = $('[type=submit]', f);
      btn.disabled = true;
      const showMsg = (text, type = 'error') => {
        const el = $('#auth-msg');
        el.textContent = text;
        el.className = `alert ${type === 'info' ? 'info' : ''}`;
        btn.disabled = false;
      };
      const email = String(fd.email || '').trim().toLowerCase();
      authEmail = email;
      try {
        if (authTab === 'forgot') {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` });
          if (error) throw error;
          return showMsg('Falls ein Konto mit dieser Adresse existiert, ist eine E-Mail mit einem Link unterwegs.', 'info');
        }
        if (authTab === 'register') {
          const meta = { name: String(fd.name || '').trim() };
          if (authMode === 'join') meta.inviteCode = String(fd.inviteCode || '').trim().toUpperCase();
          else meta.companyName = String(fd.companyName || '').trim();
          const { data, error } = await sb.auth.signUp({ email, password: fd.password, options: { data: meta, emailRedirectTo: `${location.origin}/` } });
          if (error) throw error;
          if (!data.session) {
            authTab = 'login';
            return renderAuth(`Fast geschafft! Wir haben dir eine E-Mail an ${email} geschickt. Bitte bestätige deine Adresse über den Link – danach geht es automatisch weiter.`, 'info');
          }
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password: fd.password });
          if (error) throw error;
        }
        authMsg = '';
        await loadMe();
      } catch (e) {
        showMsg(authMessage(e));
      }
    },
    async onboard(fd, f) {
      const btn = $('[type=submit]', f);
      btn.disabled = true;
      try {
        const res = authMode === 'join'
          ? await rpc('join_company', { p_code: String(fd.inviteCode || '').trim().toUpperCase(), p_name: fd.name })
          : await rpc('create_company', { p_company_name: fd.companyName, p_name: fd.name });
        setSession(res);
        toast(`Willkommen bei NEXCOUNT, ${res.user.name}!`, 'ok');
      } catch (e) {
        const el = $('#auth-msg');
        el.textContent = e.message;
        el.className = 'alert';
        btn.disabled = false;
      }
    },
    company(fd) {
      const data = { ...settings(), id: 'company' };
      for (const [k, v] of Object.entries(fd)) data[k] = typeof v === 'string' ? v.trim() : v;
      data.paymentDays = num(fd.paymentDays);
      data.smallBusiness = fd.smallBusiness === 'on';
      put('settings', data);
      if (S.user.role === 'admin' && data.name && data.name !== S.company.name) {
        rpc('update_company', { p_name: data.name }).then((me) => { S.company = me.company; render(); }).catch(() => {});
      }
      toast('Firmendaten gespeichert', 'ok');
      render();
    },
    async profile(fd) {
      const me = await rpc('update_profile', { p_name: fd.name });
      S.user = me.user;
      safeLS.set('nexcount:last', { user: me.user, company: me.company });
      toast('Name gespeichert', 'ok');
      refreshMe();
    },
    async password(fd, f) {
      if (fd.newPassword !== fd.newPassword2) throw new Error('Die Passwörter stimmen nicht überein.');
      const { error } = await sb.auth.updateUser({ password: fd.newPassword });
      if (error) throw new Error(authMessage(error));
      f.reset();
      toast('Passwort geändert', 'ok');
    },
  };

  // =============================================================== Aktionen
  const ACTIONS = {
    'toggle-menu': () => $('#shell').classList.toggle('menu-open'),
    'sync-now': () => { if (!S.online) toast('Keine Verbindung – Änderungen werden später übertragen.'); sync(); },
    logout,
    'auth-tab': (el) => {
      const email = $('.auth-panel input[name=email]');
      if (email && email.value) authEmail = email.value;
      authTab = el.dataset.tab;
      renderAuth('');
    },
    'auth-mode': (el) => {
      authMode = el.dataset.mode;
      if (authTab !== 'onboard') return renderAuth();
      // Firmen-Einrichtung: nur den Firmenteil austauschen, Name behalten
      const form = $('form[data-form=onboard]');
      const name = $('input[name=name]', form).value;
      form.innerHTML = `${field('Dein Name', `<input name="name" required maxlength="80" value="${esc(name)}">`)}${companyFields()}<button class="btn primary block" type="submit">Weiter</button>`;
    },
    'set-ui': (el) => {
      UI.q[el.dataset.k] = el.dataset.v;
      if (el.tagName === 'A' && el.getAttribute('href')) {
        const target = el.getAttribute('href');
        if (location.hash !== target) { location.hash = target; return; }
      }
      render();
    },
    theme: (el) => { try { localStorage.setItem('nexcount:theme', el.dataset.v); } catch { /* egal */ } applyTheme(); render(); },
    'new-article': () => openArticle(),
    'edit-article': (el) => openArticle(el.dataset.id),
    'archive-article': (el) => {
      const a = get('articles', el.dataset.id);
      if (!a || !confirm(`Artikel „${a.name}“ archivieren? Er verschwindet aus den Listen, die Historie bleibt erhalten.`)) return;
      put('articles', { ...a, archived: true });
      closeModal();
      render();
      toast('Artikel archiviert');
    },
    'move-in': (el) => openMovement('in', el.dataset.id),
    'move-out': (el) => openMovement('out', el.dataset.id),
    inventory: (el) => openInventory(el.dataset.id),
    'storno-move': (el) => stornoMovement(el.dataset.id),
    'new-contact': () => openContact(),
    'edit-contact': (el) => openContact(el.dataset.id),
    'new-doc': (el) => openDoc(null, el.dataset.kind),
    'open-doc': (el) => openDoc(el.dataset.id),
    'new-entry': (el) => openEntry(null, el.dataset.kind),
    'edit-entry': (el) => openEntry(el.dataset.id),
    export: (el) => doExport(el.dataset.what),
    demo: seedDemo,
    'rebuild-cache': () => {
      if (S.pending.length && !confirm(`${S.pending.length} ungesendete Änderungen werden zuerst übertragen. Fortfahren?`)) return;
      const pending = S.pending;
      S.db = {};
      S.seq = 0;
      S.pending = pending;
      for (const op of pending) col(op.collection)[op.id] = { id: op.id, data: op.data || null, deleted: !!op.deleted, updatedAt: op.updatedAt, rev: 0 };
      S.ver++;
      persistLocal();
      render();
      sync().then(() => toast('Cache neu aufgebaut', 'ok'));
    },
    'invite-copy': async () => {
      const code = S.company.inviteCode;
      try { await navigator.clipboard.writeText(code); toast('Einladungscode kopiert', 'ok'); } catch { prompt('Einladungscode:', code); }
    },
    'invite-rotate': async () => {
      if (!confirm('Neuen Einladungscode erzeugen? Der alte Code wird ungültig.')) return;
      try { const me = await rpc('rotate_invite'); S.company = me.company; S.members = me.members; render(); toast('Neuer Code erstellt', 'ok'); } catch (e) { toast(e.message, 'error'); }
    },
    'member-remove': async (el) => {
      const m = S.members.find((x) => x.id === el.dataset.id);
      if (!m || !confirm(`${m.name} (${m.email}) aus dem Team entfernen? Der Zugriff auf alle Firmendaten endet sofort. Tipp: Erzeuge danach einen neuen Einladungscode.`)) return;
      try { const me = await rpc('remove_member', { p_user: m.id }); S.members = me.members; render(); toast('Benutzer entfernt', 'ok'); } catch (e) { toast(e.message, 'error'); }
    },
    'member-role': async (el) => {
      try { const me = await rpc('set_member_role', { p_user: el.dataset.id, p_role: el.dataset.role }); S.members = me.members; render(); toast('Rolle geändert', 'ok'); } catch (e) { toast(e.message, 'error'); }
    },
  };

  // =============================================================== Globale Events
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !ACTIONS[el.dataset.action]) return;
    if (el.closest('#modal-root') && !['archive-article', 'inventory'].includes(el.dataset.action)) return;
    e.preventDefault();
    if (el.closest('#modal-root')) closeModal();
    try { ACTIONS[el.dataset.action](el, e); } catch (err) { toast(err.message, 'error'); }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.closest && el.closest('#view form[data-form]')) UI.formDirty = true;
    if (!el.dataset || !el.dataset.ui || !el.closest('#view')) return;
    UI.q[el.dataset.ui] = el.value;
    render();
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target;
    const name = f.dataset && f.dataset.form;
    if (!name || !FORMS[name]) return;
    e.preventDefault();
    UI.formDirty = false;
    try { await FORMS[name](Object.fromEntries(new FormData(f)), f); } catch (err) { toast(err.message, 'error'); }
  });
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('beforeunload', (e) => {
    if (S.user && S.pending.length && !S.online) { e.preventDefault(); e.returnValue = ''; }
  });

  // =============================================================== Start
  async function boot() {
    applyTheme();
    const r = (location.hash.match(/^#\/(\w+)/) || [])[1];
    UI.route = VIEWS[r] ? r : 'dashboard';
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (!sb) return renderSetupMissing();

    // Fehler aus E-Mail-Links (z. B. abgelaufener Bestätigungslink)
    const hashParams = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
    const linkError = hashParams.get('error_description');
    if (linkError) history.replaceState(null, '', location.pathname);

    sb.auth.onAuthStateChange((event) => {
      // keine Supabase-Aufrufe direkt im Callback (Deadlock-Gefahr) → setTimeout
      if (event === 'PASSWORD_RECOVERY') setTimeout(openNewPassword, 0);
      if (event === 'SIGNED_OUT' && S.user) setTimeout(sessionExpired, 0);
    });

    const last = safeLS.get('nexcount:last');
    if (!navigator.onLine && last && last.user && last.company) {
      setSession({ ...last, members: [] }, true);
      toast('Offline-Modus: Änderungen werden synchronisiert, sobald eine Verbindung besteht.');
      return;
    }
    let session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch { /* egal */ }
    if (!session) {
      return renderAuth(linkError ? `Der Link ist ungültig oder abgelaufen (${linkError}). Bitte erneut anfordern.` : '');
    }
    await loadMe();
  }
  boot();
})();
