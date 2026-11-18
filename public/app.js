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
  const DOC_STATUS = { draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', cancelled: 'Storniert', accepted: 'Angenommen', rejected: 'Abgelehnt' };
  const statusLabel = (d) => (d.kind === 'quote' && d.status === 'open' ? 'Versendet' : DOC_STATUS[d.status] || d.status);
  const DOC_KINDS = {
    sale: { label: 'Rechnung', plural: 'Rechnungen', prefixKey: 'invoicePrefix', prefix: 'RE', module: 'invoices', contact: 'customer', icon: 'file' },
    quote: { label: 'Angebot', plural: 'Angebote', prefixKey: 'quotePrefix', prefix: 'AN', module: 'quotes', contact: 'customer', icon: 'send' },
    purchase: { label: 'Einkauf', plural: 'Einkäufe', prefixKey: 'purchasePrefix', prefix: 'EK', module: 'purchases', contact: 'supplier', icon: 'cart' },
  };
  // Funktionen, die jede Organisation nach Bedarf ein- und ausschalten kann (Kassenbuch ist immer aktiv)
  const MODULES = {
    invoices: { label: 'Rechnungen', icon: 'file', desc: 'Rechnungen schreiben, als PDF drucken, Zahlungseingänge automatisch ins Kassenbuch buchen.', requires: ['contacts'] },
    quotes: { label: 'Angebote', icon: 'send', desc: 'Angebote erstellen und mit einem Klick in eine Rechnung umwandeln.', requires: ['invoices'] },
    purchases: { label: 'Einkäufe', icon: 'cart', desc: 'Eingangsrechnungen von Lieferanten erfassen.', requires: ['contacts'] },
    time: { label: 'Zeiterfassung', icon: 'clock', desc: 'Arbeitszeiten je Kunde und Projekt erfassen und mit einem Klick abrechnen.', requires: ['invoices'] },
    contacts: { label: 'Kunden & Lieferanten', icon: 'users', desc: 'Adressbuch mit Umsatzübersicht je Kontakt.' },
    catalog: { label: 'Produkte & Leistungen', icon: 'tag', desc: 'Deine Preisliste – Positionen mit einem Klick in Rechnungen und Angebote übernehmen.' },
    members: { label: 'Mitgliederverwaltung', icon: 'heart', desc: 'Mitglieder mit Nummer, Status, Eintritt, Beitragsgruppe und Bankverbindung.' },
    dues: { label: 'Mitgliedsbeiträge', icon: 'repeat', desc: 'Beitragsläufe je Jahr, Halbjahr, Quartal oder Monat – Zahlungen landen im Kassenbuch.', requires: ['members'] },
    donations: { label: 'Spenden', icon: 'gift', desc: 'Spenden erfassen und Zuwendungsbestätigungen nach amtlichem Muster drucken.' },
    inventory: { label: 'NEXCOUNT Lager', icon: 'layers', desc: 'Eigenständiges Lagersystem mit eigenem Bereich – auf Wunsch mit der Buchhaltung verknüpft.' },
    reports: { label: 'Berichte & Export', icon: 'chart', desc: 'Gewinnermittlung, Umsatzsteuer bzw. Kassenbericht, CSV- und Backup-Export.' },
  };
  const ALL_MODULES = Object.keys(MODULES);
  // bisheriger Stand für Firmen ohne gespeicherte Auswahl
  const LEGACY_MODULES = ['invoices', 'quotes', 'purchases', 'contacts', 'catalog', 'inventory', 'reports'];

  // Organisationsarten – bestimmen Vorschläge für Funktionen, Begriffe, Kategorien und Ansichten
  const ORG_TYPES = {
    sole: { label: 'Einzelunternehmer & Freiberufler', short: 'Selbstständig', icon: 'user',
      desc: 'Du arbeitest allein: Rechnungen schreiben, Zeiten und Ausgaben erfassen, Steuer im Blick.',
      modules: ['invoices', 'quotes', 'contacts', 'catalog', 'time', 'reports'],
      legal: ['Einzelunternehmen', 'Freiberufler', 'Kleingewerbe'] },
    service: { label: 'Dienstleistungsunternehmen', short: 'Dienstleister', icon: 'briefcase',
      desc: 'Agentur, Beratung, Handwerksservice: Zeiten erfassen, Angebote und Rechnungen schreiben.',
      modules: ['invoices', 'quotes', 'purchases', 'contacts', 'catalog', 'time', 'reports'],
      legal: ['GmbH', 'UG (haftungsbeschränkt)', 'GbR', 'PartG', 'Einzelunternehmen', 'OHG / KG'] },
    small: { label: 'Kleinunternehmen & Handel', short: 'Kleinunternehmen', icon: 'cart',
      desc: 'Laden, Werkstatt oder Handel: Verkauf und Einkauf – das Lager kannst du dazuschalten.',
      modules: ['invoices', 'quotes', 'purchases', 'contacts', 'catalog', 'reports'],
      legal: ['Einzelunternehmen', 'e. K.', 'GbR', 'GmbH', 'UG (haftungsbeschränkt)', 'OHG / KG'] },
    club: { label: 'Verein', short: 'Verein', icon: 'heart',
      desc: 'Mitglieder, Beiträge, Spenden mit Zuwendungsbestätigung und Kassenbericht für die Versammlung.',
      modules: ['members', 'dues', 'donations', 'contacts', 'reports'],
      legal: ['Eingetragener Verein (e. V.)', 'Nicht eingetragener Verein', 'Gemeinnützige GmbH', 'Stiftung'] },
  };
  const PRESETS = {
    ...Object.fromEntries(Object.entries(ORG_TYPES).map(([k, t]) => [k, { label: t.label, icon: t.icon, desc: t.desc, modules: t.modules }])),
    simple: { label: 'Nur Kassenbuch', icon: 'book', desc: 'Einnahmen und Ausgaben erfassen – mehr nicht.', modules: ['reports'] },
    all: { label: 'Alles', icon: 'dashboard', desc: 'Alle Funktionen einschalten.', modules: ALL_MODULES },
  };
  // Buchungsbereiche (Sphären) gemeinnütziger Vereine
  const SPHERES = { ideell: 'Ideeller Bereich', vermoegen: 'Vermögensverwaltung', zweck: 'Zweckbetrieb', wirtschaft: 'Wirtschaftl. Geschäftsbetrieb' };
  const CATS = {
    business: {
      income: ['Warenverkauf', 'Dienstleistung', 'Provision', 'Zinserträge', 'Sonstige Einnahmen'],
      expense: ['Wareneinkauf', 'Miete', 'Personal', 'Büromaterial', 'Software', 'Fahrzeug', 'Reisekosten', 'Marketing', 'Versicherung', 'Telefon/Internet', 'Bankgebühren', 'Sonstige Ausgaben'],
    },
    service: {
      income: ['Honorare', 'Dienstleistung', 'Beratung', 'Lizenzen', 'Sonstige Einnahmen'],
      expense: ['Fremdleistungen', 'Software', 'Büro & Miete', 'Reisekosten', 'Fortbildung', 'Telefon/Internet', 'Versicherung', 'Marketing', 'Fahrzeug', 'Bankgebühren', 'Sonstige Ausgaben'],
    },
    club: {
      income: ['Mitgliedsbeiträge', 'Spenden', 'Zuschüsse', 'Veranstaltungen', 'Bewirtung & Verkauf', 'Zinserträge', 'Sonstige Einnahmen'],
      expense: ['Übungsleiter', 'Hallen- & Platzmiete', 'Material & Ausstattung', 'Veranstaltungen', 'Verbandsbeiträge', 'Versicherung', 'Bürobedarf & Porto', 'Fahrtkosten', 'Bankgebühren', 'Sonstige Ausgaben'],
    },
  };
  const INTERVALS = { year: ['jährlich', 1], half: ['halbjährlich', 2], quarter: ['vierteljährlich', 4], month: ['monatlich', 12] };
  const MEMBER_STATUS = { active: 'Aktiv', passive: 'Passiv / Fördernd', left: 'Ausgetreten' };
  const ART_TYPES = { product: 'Produkt (Ware)', service: 'Leistung (Dienstleistung)' };
  const KINDS = { income: 'Einnahme', expense: 'Ausgabe' };
  const CONTACT_TYPES = { customer: 'Kunde', supplier: 'Lieferant', both: 'Kunde & Lieferant' };
  const METHODS = ['Bank', 'Kasse', 'Karte', 'PayPal', 'Sonstige'];
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
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    wallet: '<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    trendUp: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    trendDown: '<path d="M23 18l-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/>',
    sparkle: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    repeat: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    gift: '<path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    play: '<path d="M6 4l14 8-14 8V4z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 1V2l-1 1-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
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

  // Basisadresse der App (funktioniert auch unter einem Unterpfad wie /nexcount/)
  const appBase = () => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
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
  // Module: ohne gespeicherte Auswahl ist alles aktiv (bestehende Firmen bleiben unverändert)
  const modulesOn = () => { const m = settings().modules; return m && typeof m === 'object' ? m : null; };
  const orgType = () => (ORG_TYPES[settings().orgType] ? settings().orgType : null);
  const isClub = () => orgType() === 'club';
  const modsFromList = (list) => Object.fromEntries(ALL_MODULES.map((k) => [k, list.includes(k)]));
  const allModulesOn = () => modsFromList(ALL_MODULES);
  // ohne gespeicherte Auswahl: Vorschlag der Organisationsart bzw. bisheriger Umfang
  const defaultModules = () => modsFromList(orgType() ? ORG_TYPES[orgType()].modules : LEGACY_MODULES);
  const currentModules = () => modulesOn() || defaultModules();
  const mod = (name) => !!currentModules()[name];
  // Lager-Verknüpfung: Belege buchen Bestände, Lagerartikel erscheinen in der Preisliste
  const stockLinked = () => mod('inventory') && settings().inventoryLink !== false;
  const catsFor = (kind) => {
    const t = orgType();
    const set = t === 'club' ? CATS.club : t === 'service' || t === 'sole' ? CATS.service : CATS.business;
    return kind === 'income' ? set.income : set.expense;
  };
  const docKindsOn = () => Object.keys(DOC_KINDS).filter((k) => mod(DOC_KINDS[k].module));
  // Abhängigkeiten auflösen: Einschalten zieht Voraussetzungen mit, Ausschalten nimmt Abhängige mit
  function toggleModule(mods, key, on) {
    const out = { ...mods, [key]: on };
    if (on) {
      const stack = [key];
      while (stack.length) {
        for (const r of MODULES[stack.pop()].requires || []) if (!out[r]) { out[r] = true; stack.push(r); }
      }
    } else {
      let changed = true;
      while (changed) {
        changed = false;
        for (const [k, def] of Object.entries(MODULES)) {
          if (out[k] && (def.requires || []).some((r) => !out[r])) { out[k] = false; changed = true; }
        }
      }
    }
    return out;
  }
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
    const firstSync = !S.lastSync; // erster Abgleich: Ansicht danach immer aktualisieren („Daten werden geladen“)
    try {
      const ops = [];
      let bytes = 0;
      const now = Date.now();
      for (const o of S.pending) {
        if (o.retryAt && o.retryAt > now) continue; // vom Server abgelehnt – später erneut versuchen
        const size = JSON.stringify(o).length;
        if (ops.length && (ops.length >= SYNC_BATCH || bytes + size > SYNC_BYTES)) break;
        ops.push(o);
        bytes += size;
      }
      const res = await rpc('sync', { p_ops: ops.map(({ retryAt, tries, ...o }) => o), p_since: S.seq });
      const sent = new Map(ops.map((o) => [`${o.collection}:${o.id}`, o.updatedAt]));
      // Abgelehnte Änderungen (z. B. neuer Datenbereich, den die Datenbank noch nicht kennt) nicht verwerfen
      const rejected = ops.filter((o, i) => { const r = (res.results || [])[i]; return r && !r.ok && !r.conflict; });
      S.pending = S.pending.filter((o) => sent.get(`${o.collection}:${o.id}`) !== o.updatedAt);
      for (const o of rejected) {
        if (S.pending.some((p) => p.collection === o.collection && p.id === o.id)) continue;
        const tries = (o.tries || 0) + 1;
        S.pending.push({ ...o, tries, retryAt: Date.now() + Math.min(30 * 60000, 60000 * tries) });
      }
      S.rejected = S.pending.filter((o) => o.retryAt).length;
      const stillPending = new Set(S.pending.map((o) => `${o.collection}:${o.id}`));
      for (const ch of res.changes || []) {
        if (stillPending.has(`${ch.collection}:${ch.id}`)) continue;
        const local = col(ch.collection)[ch.id];
        if (!local || local.updatedAt !== ch.updatedAt || !!local.deleted !== !!ch.deleted) changedView = true;
        col(ch.collection)[ch.id] = { id: ch.id, data: ch.data, deleted: ch.deleted, updatedAt: ch.updatedAt, rev: ch.rev };
      }
      if (rejected.length) console.warn('Sync: vom Server abgelehnt, wird später erneut versucht', rejected.map((o) => `${o.collection}:${o.id}`));
      S.seq = res.seq;
      S.online = true;
      S.syncError = '';
      S.lastSync = Date.now();
      if (changedView) S.ver++;
      // weitere Pakete: noch ungesendete Änderungen oder weitere Seiten vom Server
      if (res.more || S.pending.some((o) => !o.retryAt || o.retryAt <= Date.now())) S.syncAgain = true;
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
    if (changedView || (firstSync && S.lastSync && S.user)) render({ fromSync: true });
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
    const clearMeta = () => sb.auth.updateUser({ data: { companyName: null, inviteCode: null, orgType: null, legalForm: null, smallBusiness: null, nonProfit: null } }).catch(() => {});
    if (meta.companyName || meta.inviteCode) {
      try {
        if (meta.inviteCode) {
          setSession(await rpc('join_company', { p_code: meta.inviteCode, p_name: name }));
        } else {
          await createOrganisation({ companyName: meta.companyName, name, orgType: meta.orgType, legalForm: meta.legalForm, smallBusiness: !!meta.smallBusiness, nonProfit: meta.nonProfit !== false });
        }
        await clearMeta();
        toast(`Willkommen bei NEXCOUNT, ${S.user.name}!`, 'ok');
        return;
      } catch (e) {
        await clearMeta();
        return renderOnboarding(me, e.message);
      }
    }
    renderOnboarding(me, '');
  }

  // Organisation anlegen und Grundeinstellungen (Art, Rechtsform, Steuerstatus, Funktionen) speichern
  async function createOrganisation({ companyName: cname, name, orgType: t, legalForm, smallBusiness, nonProfit }) {
    const res = await rpc('create_company', { p_company_name: cname, p_name: name });
    setSession(res);
    const type = ORG_TYPES[t] ? t : 'small';
    put('settings', {
      id: 'company', name: cname, orgType: type, legalForm: legalForm || ORG_TYPES[type].legal[0],
      smallBusiness: !!smallBusiness, nonProfit: type === 'club' ? nonProfit !== false : false,
      modules: modsFromList(ORG_TYPES[type].modules), inventoryLink: true, setupDone: false,
    });
    UI.setup = null;
    render();
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
  const kpi = (label, value, tone = '', sub = '', ic = '') =>
    `<div class="kpi">${ic ? `<span class="kpi-ic ${tone}">${icon(ic, 18)}</span>` : ''}<span class="label">${esc(label)}</span><span class="value ${tone}">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
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
  // Bestand wird nur für Produkte geführt – und nur, wenn NEXCOUNT Lager aktiv ist
  const tracksStock = (a) => mod('inventory') && !!a && a.type !== 'service';
  // Belege buchen Bestände nur, wenn das Lager mit der Buchhaltung verknüpft ist
  const bookStock = (a) => stockLinked() && tracksStock(a);
  const isLate = (d) => d.status === 'open' && d.kind !== 'purchase' && !!d.dueDate && d.dueDate < today();

  function nextDocNumber(kind, date) {
    const K = DOC_KINDS[kind];
    const prefix = String(settings()[K.prefixKey] || K.prefix).replace(/[^A-Za-z0-9]/g, '') || K.prefix;
    const year = String(date || today()).slice(0, 4);
    const re = new RegExp('^' + prefix + '-' + year + '-(\\d+)$');
    let max = 0;
    for (const d of all('documents')) {
      const m = d.kind === kind && re.exec(d.number || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
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
    if (doc.kind !== 'quote') {
      for (const it of doc.items) {
        const art = it.articleId ? articleRaw(it.articleId) : null;
        if (!art || !num(it.qty)) continue;
        if (bookStock(art)) {
          const mv = put('movements', {
            articleId: it.articleId,
            qty: doc.kind === 'sale' ? -num(it.qty) : num(it.qty),
            type: doc.kind,
            date: doc.date,
            unitCost: doc.kind === 'purchase' ? num(it.price) : num(art.ek),
            docId: doc.id,
            note: doc.number,
          });
          doc.movementIds.push(mv.id);
        }
        if (doc.kind === 'purchase' && num(it.price) > 0 && num(art.ek) !== num(it.price)) {
          put('articles', { ...art, ek: num(it.price) }); // letzter Einkaufspreis
        }
      }
    }
    return put('documents', doc);
  }
  function markDocPaid(doc, date, method) {
    const t = calcTotals(doc.items);
    const sale = doc.kind === 'sale';
    const rate = t.rates.length === 1 ? t.rates[0].rate : null;
    const hasGoods = doc.items.some((it) => { const a = articleRaw(it.articleId); return a && a.type !== 'service'; });
    const entry = put('entries', {
      date,
      kind: sale ? 'income' : 'expense',
      category: sale ? (hasGoods ? 'Warenverkauf' : 'Dienstleistung') : 'Wareneinkauf',
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
  // Angebot → Rechnungsentwurf (Positionen, Kunde und Texte werden übernommen)
  function convertQuote(q) {
    const s = settings();
    const inv = put('documents', {
      kind: 'sale', status: 'draft', date: today(), dueDate: addDays(today(), num(s.paymentDays) || 14),
      contactId: q.contactId, contact: q.contact, items: JSON.parse(JSON.stringify(q.items)),
      notes: '', reference: q.reference || q.number, fromQuote: q.id, fromQuoteNumber: q.number,
    });
    put('documents', { ...q, status: 'accepted', acceptedAt: today(), invoiceId: inv.id });
    return inv;
  }
  function splitGross(gross, rate) {
    const g = r2(gross);
    const net = r2(g / (1 + num(rate) / 100));
    return { gross: g, net, tax: r2(g - net) };
  }

  // =============================================================== Shell & Rendering
  // Zwei Bereiche: Buchhaltung und – als eigenes System – NEXCOUNT Lager
  const SPACES = {
    books: { label: 'Buchhaltung', icon: 'book', home: 'dashboard' },
    stock: { label: 'Lager', icon: 'layers', home: 'stockhome' },
  };
  const todayLong = () => new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const VIEWS = {
    dashboard: { space: 'books', title: 'Übersicht', short: 'Start', icon: 'dashboard', group: 'start', render: viewDashboard, sub: todayLong },
    members: { space: 'books', title: 'Mitglieder', short: 'Mitglieder', icon: 'heart', group: 'club', when: () => mod('members'), render: viewMembers, sub: 'Mitgliederverwaltung' },
    dues: { space: 'books', title: 'Beiträge', short: 'Beiträge', icon: 'repeat', group: 'club', when: () => mod('dues'), render: viewDues, sub: 'Beitragsläufe und Zahlungseingänge' },
    donations: { space: 'books', title: 'Spenden', short: 'Spenden', icon: 'gift', group: 'club', when: () => mod('donations'), render: viewDonations, sub: 'Spenden und Zuwendungsbestätigungen' },
    documents: { space: 'books', title: () => { const k = docKindsOn(); return k.length === 1 ? DOC_KINDS[k[0]].plural : 'Belege'; }, short: 'Belege', icon: 'file', group: 'sales',
      when: () => docKindsOn().length > 0, render: viewDocuments,
      sub: () => { const p = docKindsOn().map((k) => DOC_KINDS[k].plural); return p.length > 1 ? `${p.slice(0, -1).join(', ')} & ${p[p.length - 1]}` : 'Schreiben, drucken, Zahlungen verbuchen'; } },
    time: { space: 'books', title: 'Zeiterfassung', short: 'Zeiten', icon: 'clock', group: 'sales', when: () => mod('time'), render: viewTime, sub: 'Arbeitszeiten erfassen und abrechnen' },
    contacts: { space: 'books', title: () => (isClub() ? 'Kontakte' : 'Kunden & Lieferanten'), short: 'Kontakte', icon: 'users', group: 'sales', when: () => mod('contacts'), render: viewContacts,
      sub: () => (isClub() ? 'Spender, Partner und Lieferanten' : 'Adressbuch mit Umsätzen') },
    articles: { space: 'books', title: 'Produkte & Leistungen', short: 'Preisliste', icon: 'tag', group: 'sales', when: () => mod('catalog'), render: viewArticles, sub: 'Deine Preisliste für Rechnungen und Angebote' },
    entries: { space: 'books', title: 'Kassenbuch', short: 'Kasse', icon: 'book', group: 'money', render: viewEntries, sub: 'Alle Einnahmen und Ausgaben' },
    reports: { space: 'books', title: () => (isClub() ? 'Kassenbericht' : 'Berichte'), short: 'Berichte', icon: 'chart', group: 'money', when: () => mod('reports'), render: viewReports,
      sub: () => (isClub() ? 'Einnahmen und Ausgaben nach Bereichen, Exporte' : 'Gewinn, Umsatzsteuer und Exporte') },
    stockhome: { space: 'stock', title: 'Lager-Übersicht', short: 'Übersicht', icon: 'dashboard', group: 'stock', when: () => mod('inventory'), render: viewStockHome,
      sub: () => (stockLinked() ? 'Mit der Buchhaltung verknüpft' : 'Eigenständig – nicht mit Belegen verknüpft') },
    stockitems: { space: 'stock', title: 'Lagerartikel', short: 'Artikel', icon: 'tag', group: 'stock', when: () => mod('inventory'), render: viewStockItems, sub: 'Bestände, Mindestmengen und Lagerorte' },
    stock: { space: 'stock', title: 'Bewegungen', short: 'Bewegungen', icon: 'sync', group: 'stock', when: () => mod('inventory'), render: viewStock, sub: 'Wareneingang, -ausgang, Inventur und Storno' },
    settings: { space: '*', title: 'Einstellungen', short: 'Einstellungen', icon: 'settings', group: 'system', render: viewSettings, sub: 'Organisation, Funktionen, Team und Konto' },
  };
  const GROUPS = { start: '', club: () => 'Verein', sales: () => (isClub() ? 'Kontakte & Belege' : 'Verkauf & Kunden'), money: () => 'Finanzen', stock: () => 'NEXCOUNT Lager', system: '' };
  const tv = (v, k) => (typeof v[k] === 'function' ? v[k]() : v[k]);
  const viewOn = (k) => !!VIEWS[k] && (!VIEWS[k].when || VIEWS[k].when());
  const inSpace = (k) => VIEWS[k].space === '*' || VIEWS[k].space === UI.space;
  if (!UI.space) UI.space = 'books';

  // Einträge für „+ Neu“ und Schnellaktionen – je nach Bereich, Organisationsart und Funktionen
  function quickItems() {
    if (UI.space === 'stock') {
      return [['move-in', '', 'plus', 'Wareneingang'], ['move-out', '', 'minus', 'Warenausgang'], ['inventory', '', 'clipboard', 'Inventur'], ['new-stock-item', '', 'tag', 'Lagerartikel']];
    }
    const items = [];
    if (mod('members')) items.push(['new-member', '', 'heart', 'Mitglied']);
    if (mod('donations')) items.push(['new-donation', '', 'gift', 'Spende']);
    if (mod('dues')) items.push(['dues-run', '', 'repeat', 'Beitragslauf']);
    if (mod('time')) items.push(['new-time', '', 'clock', 'Zeit erfassen']);
    if (mod('invoices')) items.push(['new-doc', 'sale', 'file', 'Rechnung']);
    if (mod('quotes')) items.push(['new-doc', 'quote', 'send', 'Angebot']);
    items.push(['new-entry', 'income', 'trendUp', 'Einnahme'], ['new-entry', 'expense', 'trendDown', 'Ausgabe']);
    if (mod('purchases')) items.push(['new-doc', 'purchase', 'cart', 'Einkauf']);
    if (mod('catalog')) items.push(['new-article', '', 'tag', 'Produkt / Leistung']);
    if (mod('contacts')) items.push(['new-contact', '', 'users', 'Kontakt']);
    return items;
  }
  const quickBtn = ([action, kind, ic, label], cls = '') =>
    `<button type="button" class="${cls}" data-action="${action}" ${kind ? `data-kind="${kind}"` : ''}>${icon(ic, 18)}<span>${esc(label)}</span></button>`;

  function shellHtml() {
    return `<div id="shell" class="shell">
      <aside class="sidebar">
        <a class="brand" href="#/dashboard"><img src="icon.svg" alt=""><div><div class="brand-name">NEXCOUNT</div><div class="brand-sub" id="brand-sub">by Andrerer</div></div></a>
        <div id="space-switch"></div>
        <nav class="nav" id="nav"></nav>
        <div class="sidebar-foot"><div class="avatar" id="me-avatar"></div><div class="who"><b id="me-name"></b><span id="me-company"></span></div>
          <button class="icon-btn" data-action="logout" title="Abmelden" aria-label="Abmelden">${icon('logout')}</button></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" data-action="toggle-menu" aria-label="Menü">${icon('menu')}</button>
          <div class="titles"><h1 id="page-title"></h1><p id="page-sub" class="page-sub"></p></div>
          <div class="top-actions">
            <div class="quick-wrap">
              <button class="btn primary" data-action="quick-new" type="button" aria-haspopup="menu">${icon('plus', 16)}<span class="hide-sm">Neu</span></button>
              <div class="menu" id="quick-menu" role="menu"></div>
            </div>
            <button id="sync-status" class="sync" data-action="sync-now" type="button"></button>
          </div>
        </header>
        <main id="view" class="view"></main>
      </div>
      <nav class="bottom-nav" id="bottom-nav"></nav>
    </div>`;
  }

  function renderNav() {
    const st = stockMap();
    const counts = {
      stockitems: mod('inventory') ? stockArticles().filter((a) => isLow(a, st)).length : 0,
      documents: mod('invoices') ? all('documents').filter((d) => d.kind === 'sale' && isLate(d)).length : 0,
      dues: mod('dues') ? all('dues').filter((d) => d.status === 'open' && d.dueDate && d.dueDate < today()).length : 0,
    };
    counts.stockhome = counts.stockitems;
    const sw = $('#space-switch');
    sw.innerHTML = mod('inventory')
      ? `<div class="space-switch" role="tablist">${Object.entries(SPACES).map(([k, s]) => `<button type="button" role="tab" data-action="space" data-v="${k}" class="${UI.space === k ? 'active' : ''}">${icon(s.icon, 16)}<span>${s.label}</span>${k === 'stock' && counts.stockitems ? `<i class="dot-badge static"></i>` : ''}</button>`).join('')}</div>`
      : '';
    $('#brand-sub').textContent = UI.space === 'stock' ? 'Lager · by Andrerer' : 'by Andrerer';
    document.body.dataset.space = UI.space;
    let html = '';
    let lastGroup = null;
    for (const [k, v] of Object.entries(VIEWS)) {
      if (!viewOn(k) || !inSpace(k)) continue;
      if (v.group !== lastGroup) {
        const label = typeof GROUPS[v.group] === 'function' ? GROUPS[v.group]() : GROUPS[v.group];
        if (label) html += `<div class="nav-label">${esc(label)}</div>`;
        else if (lastGroup) html += '<div class="nav-sep"></div>';
        lastGroup = v.group;
      }
      html += `<a href="#/${k}" class="${k === UI.route ? 'active' : ''}">${icon(v.icon)}<span>${esc(tv(v, 'title'))}</span>${counts[k] && k !== 'stockhome' ? `<span class="count">${counts[k]}</span>` : ''}</a>`;
    }
    $('#nav').innerHTML = html;
    const pref = UI.space === 'stock' ? ['stockhome', 'stockitems', 'stock'] : ['dashboard', 'members', 'documents', 'time', 'dues', 'entries', 'donations', 'contacts', 'articles'];
    const main = pref.filter(viewOn).slice(0, 4);
    $('#bottom-nav').innerHTML = main.map((k) => `<a href="#/${k}" class="${k === UI.route ? 'active' : ''}">${icon(VIEWS[k].icon, 20)}<span>${esc(VIEWS[k].short)}</span>${counts[k] ? '<i class="dot-badge"></i>' : ''}</a>`).join('')
      + `<button type="button" data-action="toggle-menu" class="${!main.includes(UI.route) ? 'active' : ''}">${icon('more', 20)}<span>Mehr</span></button>`;
  }

  function render({ fromSync = false } = {}) {
    if (!S.user) return renderAuth();
    // ungespeicherte Eingaben in Seitenformularen nicht durch Live-Updates überschreiben
    if (fromSync && (UI.formDirty || UI.setupTyping) && $('#shell')) return renderStatus();
    if (!$('#shell')) $('#app').innerHTML = shellHtml();
    if (!viewOn(UI.route)) UI.route = 'dashboard';
    const view = VIEWS[UI.route];
    if (view.space !== '*') UI.space = view.space;
    if (UI.space === 'stock' && !mod('inventory')) UI.space = 'books';
    renderNav();
    $('#me-avatar').textContent = initials(S.user.name);
    $('#me-name').textContent = S.user.name;
    $('#me-company').textContent = companyName();
    const title = tv(view, 'title');
    $('#page-title').textContent = title;
    $('#page-sub').textContent = tv(view, 'sub') || '';
    document.title = `${title} · NEXCOUNT`;
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
    const waiting = S.pending.filter((o) => o.retryAt).length;
    let cls;
    let text;
    if (S.syncing) { cls = 'busy'; text = 'Synchronisiere …'; }
    else if (!S.online) { cls = 'off'; text = n ? `Offline · ${n} ausstehend` : 'Offline'; }
    else if (S.syncError) { cls = 'err'; text = 'Sync-Fehler'; }
    else if (waiting) { cls = 'off'; text = `${waiting} wartet auf Server`; }
    else if (n) { cls = 'busy'; text = `${n} ausstehend`; }
    else { cls = 'ok'; text = S.lastSync ? `Synchronisiert · ${new Date(S.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Verbunden'; }
    el.className = `sync ${cls}`;
    el.innerHTML = `<span class="dot"></span><span class="sync-text">${esc(text)}</span>`;
    el.title = S.syncError || (waiting ? 'Einige Änderungen nimmt der Server noch nicht an (Datenbank-Update ausstehend). Sie bleiben gespeichert und werden automatisch erneut gesendet.'
      : S.online ? 'Jetzt synchronisieren' : 'Keine Verbindung – Änderungen werden lokal gespeichert');
  }

  function closeMenus() {
    const m = $('#quick-menu');
    if (m) m.classList.remove('open');
    const shell = $('#shell');
    if (shell) shell.classList.remove('menu-open');
  }

  function onRoute() {
    const r = (location.hash.match(/^#\/(\w+)/) || [])[1];
    UI.route = VIEWS[r] ? r : 'dashboard';
    UI.formDirty = false;
    closeMenus();
    if (S.user) {
      render();
      window.scrollTo(0, 0);
      if (UI.route === 'settings') refreshMe();
    }
  }

  // =============================================================== Anmeldung & Registrierung
  let authTab = 'login'; // login | register | forgot | onboard
  let authMsg = '';
  let authMsgType = 'error';
  let authEmail = '';
  // Registrierung in Schritten: 1 Art · 2 Organisation · 3 Konto (bei Einladung: Code + Konto)
  const REG = { step: 1, mode: 'new', orgType: '', companyName: '', legalForm: '', smallBusiness: false, nonProfit: true, name: '', inviteCode: '' };
  const rf = (key, label, attrs = '') => field(label, `<input data-reg="${key}" name="${key}" value="${esc(REG[key] ?? '')}" ${attrs}>`);

  function regStepper() {
    const steps = REG.mode === 'join' ? ['Einladung', 'Konto'] : ['Art', 'Organisation', 'Konto'];
    const cur = REG.mode === 'join' ? (REG.step >= 3 ? 2 : 1) : REG.step;
    return `<ol class="stepper small">${steps.map((l, i) => `<li class="${cur === i + 1 ? 'active' : cur > i + 1 ? 'done' : ''}"><span>${cur > i + 1 ? icon('check', 12) : i + 1}</span>${l}</li>`).join('')}</ol>`;
  }
  function typeCards(action) {
    return `<div class="type-grid auth-types">${Object.entries(ORG_TYPES).map(([k, t]) => `<button type="button" class="type-card ${REG.orgType === k ? 'active' : ''}" data-action="${action}" data-type="${k}">
      <span class="preset-ic">${icon(t.icon, 20)}</span><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></button>`).join('')}</div>`;
  }
  function orgFields() {
    const T = ORG_TYPES[REG.orgType] || ORG_TYPES.small;
    const club = REG.orgType === 'club';
    return `${rf('companyName', club ? 'Name des Vereins' : 'Name der Firma / deines Unternehmens', 'required maxlength="120" autocomplete="organization"')}
      ${field('Rechtsform', `<select data-reg="legalForm" name="legalForm">${T.legal.map((l) => `<option ${REG.legalForm === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
      ${club ? `<label class="check"><input type="checkbox" data-reg="nonProfit" ${REG.nonProfit ? 'checked' : ''}> Gemeinnützig anerkannt (Spendenbescheinigungen)</label>` : ''}
      <label class="check"><input type="checkbox" data-reg="smallBusiness" ${REG.smallBusiness ? 'checked' : ''}> Kleinunternehmerregelung (§ 19 UStG)</label>`;
  }

  function renderAuth(msg, type) {
    if (msg !== undefined) { authMsg = msg; authMsgType = type || (/^Deine Sitzung/.test(msg) ? 'info' : 'error'); }
    const reg = authTab === 'register';
    const forgot = authTab === 'forgot';
    const msgBox = `<div id="auth-msg" class="alert ${authMsgType === 'info' ? 'info' : ''} ${authMsg ? '' : 'hidden'}">${esc(authMsg)}</div>`;
    const tabs = forgot ? '' : `<div class="seg full"><button type="button" data-action="auth-tab" data-tab="login" class="${reg ? '' : 'active'}">Anmelden</button><button type="button" data-action="auth-tab" data-tab="register" class="${reg ? 'active' : ''}">Registrieren</button></div>`;
    let inner;
    if (reg && REG.mode === 'new' && REG.step === 1) {
      inner = `<div class="stack" style="gap:6px"><h1>Wofür nutzt du NEXCOUNT?</h1><p class="muted">Wir richten NEXCOUNT passend für dich ein – mit den Funktionen, die du wirklich brauchst.</p></div>
        ${tabs}${regStepper()}${msgBox}
        ${typeCards('reg-type')}
        <button type="button" class="link-btn" data-action="reg-join">${icon('users', 16)} Ich wurde eingeladen und habe einen Einladungscode</button>`;
    } else if (reg && REG.mode === 'new' && REG.step === 2) {
      const T = ORG_TYPES[REG.orgType];
      inner = `<div class="stack" style="gap:6px"><h1>${REG.orgType === 'club' ? 'Dein Verein' : 'Deine Organisation'}</h1><p class="muted"><span class="badge info">${icon(T.icon, 12)} ${esc(T.label)}</span></p></div>
        ${tabs}${regStepper()}${msgBox}
        <form data-form="reg-org" class="stack">${orgFields()}
          <div class="row-actions"><button type="button" class="btn ghost" data-action="reg-back">${icon('arrowLeft', 16)} Zurück</button><button class="btn primary" type="submit">Weiter ${icon('arrowRight', 16)}</button></div>
        </form>`;
    } else if (reg) {
      const join = REG.mode === 'join';
      inner = `<div class="stack" style="gap:6px"><h1>${join ? 'Team beitreten' : 'Dein Zugang'}</h1><p class="muted">${join ? 'Den Einladungscode bekommst du von einem Administrator deiner Organisation.' : `Für <b>${esc(REG.companyName)}</b> – du wirst Administrator und kannst später weitere Personen einladen.`}</p></div>
        ${tabs}${regStepper()}${msgBox}
        <form data-form="auth" class="stack">
          ${join ? rf('inviteCode', 'Einladungscode', 'required maxlength="20" style="text-transform:uppercase;letter-spacing:.12em" placeholder="z. B. 8F3A21C09B"') : ''}
          ${rf('name', 'Dein Name', 'required maxlength="80" autocomplete="name"')}
          ${field('E-Mail', `<input name="email" type="email" required maxlength="120" autocomplete="email" value="${esc(authEmail)}">`)}
          <div class="grid2">${field('Passwort', '<input name="password" type="password" required minlength="8" autocomplete="new-password">')}${field('Wiederholen', '<input name="password2" type="password" required minlength="8" autocomplete="new-password">')}</div>
          <div class="row-actions"><button type="button" class="btn ghost" data-action="reg-back">${icon('arrowLeft', 16)} Zurück</button><button class="btn primary" type="submit">Konto erstellen</button></div>
        </form>
        <p class="muted small">Mindestens 8 Zeichen. Nach der Registrierung bekommst du eine E-Mail zur Bestätigung.</p>`;
    } else {
      inner = `<div class="stack" style="gap:6px"><h1>${forgot ? 'Passwort zurücksetzen' : 'Willkommen zurück'}</h1>
          <p class="muted">${forgot ? 'Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.' : 'Melde dich an, um deine Buchhaltung und dein Lager zu verwalten.'}</p></div>
        ${tabs}${msgBox}
        <form data-form="auth" class="stack">
          ${field('E-Mail', `<input name="email" type="email" required maxlength="120" autocomplete="email" value="${esc(authEmail)}">`)}
          ${forgot ? '' : field('Passwort', '<input name="password" type="password" required autocomplete="current-password">')}
          <button class="btn primary block" type="submit">${forgot ? 'Link senden' : 'Anmelden'}</button>
        </form>
        <p class="muted small">${forgot ? '<a href="#" data-action="auth-tab" data-tab="login">Zurück zur Anmeldung</a>' : '<a href="#" data-action="auth-tab" data-tab="forgot">Passwort vergessen?</a>'}</p>`;
    }
    authShell(inner);
  }

  // Angemeldet, aber noch keiner Organisation zugeordnet
  let onboardMe = null;
  function renderOnboarding(me, msg) {
    authTab = 'onboard';
    if (me) onboardMe = me;
    me = onboardMe || { user: {} };
    if (!REG.name) REG.name = (me.user && me.user.name) || '';
    const join = REG.mode === 'join';
    authShell(`
        <div class="stack" style="gap:6px"><h1>${join ? 'Team beitreten' : 'Organisation einrichten'}</h1>
          <p class="muted">Angemeldet als <b>${esc((me.user && me.user.email) || '')}</b>.</p></div>
        <div class="seg full"><button type="button" data-action="onb-mode" data-mode="new" class="${join ? '' : 'active'}">Neu anlegen</button><button type="button" data-action="onb-mode" data-mode="join" class="${join ? 'active' : ''}">Einladungscode</button></div>
        <div id="auth-msg" class="alert ${msg ? '' : 'hidden'}">${esc(msg || '')}</div>
        <form data-form="onboard" class="stack">
          ${rf('name', 'Dein Name', 'required maxlength="80"')}
          ${join ? rf('inviteCode', 'Einladungscode', 'required maxlength="20" style="text-transform:uppercase;letter-spacing:.12em"')
            : `${typeCards('onb-type')}${REG.orgType ? orgFields() : '<p class="muted small">Wähle oben die Art deiner Organisation.</p>'}`}
          <button class="btn primary block" type="submit" ${!join && !REG.orgType ? 'disabled' : ''}>Weiter</button>
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
        <div class="brand-logo"><img class="logo-light" src="logo.svg" alt="NEXCOUNT by Andrerer"><img class="logo-dark" src="logo-dark.svg" alt="NEXCOUNT by Andrerer"></div>
        ${inner}
      </div>
      <div class="auth-hero">
        <span class="hero-eyebrow">NEXCOUNT by Andrerer</span>
        <h2>Das Buchhaltungs- und Lagersystem für die Kleinen.</h2>
        <p>Für Selbstständige, Dienstleister, Kleinunternehmen und Vereine – jeweils mit den Funktionen, die wirklich gebraucht werden. Das Lager ist ein eigenes System, das du bei Bedarf dazuschaltest und verknüpfst.</p>
        <ul>
          <li>${icon('briefcase', 20)}<div><b>Unternehmen & Selbstständige</b><span>Angebote, Rechnungen, Zeiterfassung, Kassenbuch und Steuerübersicht.</span></div></li>
          <li>${icon('heart', 20)}<div><b>Vereine</b><span>Mitglieder, Beitragsläufe, Spenden mit Zuwendungsbestätigung, Kassenbericht.</span></div></li>
          <li>${icon('layers', 20)}<div><b>NEXCOUNT Lager</b><span>Eigenes System für Bestände – eigenständig oder mit der Buchhaltung verknüpft.</span></div></li>
          <li>${icon('zap', 20)}<div><b>Live, offline & im Team</b><span>Alle Geräte synchron, Einladungscode für Mitarbeiter und Vorstand.</span></div></li>
        </ul>
      </div>
    </div>`;
    const first = $('.auth-panel form input:not([type=hidden]):not([type=checkbox])');
    if (first && !first.value && window.innerWidth > 600) first.focus();
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

  // =============================================================== Ansicht: Übersicht & Einrichtung
  const DATA_COLLECTIONS = ['articles', 'entries', 'documents', 'contacts', 'movements', 'times', 'dues', 'donations'];
  const hasBusinessData = () => DATA_COLLECTIONS.some((c) => all(c).length > 0);
  const needsSetup = () => UI.forceSetup || (!settings().setupDone && S.lastSync > 0 && !hasBusinessData());
  const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend'; };
  const firstName = () => esc(String(S.user.name || '').split(' ')[0]);

  // Funktionen mit Schaltern – empfohlene zuerst, NEXCOUNT Lager als eigenes System mit Verknüpfung
  function moduleList(mods, scope, readOnly = false, linkOn = true, recommended = null) {
    const row = (k, def, on, fixed, extraCls = '') => {
      const needs = (def.requires || []).map((r) => MODULES[r].label);
      return `<label class="module ${on ? 'on' : ''} ${readOnly || fixed ? 'ro' : ''} ${extraCls}">
        <span class="module-ic">${icon(def.icon, 18)}</span>
        <span class="module-txt"><b>${esc(def.label)}</b><small>${esc(def.desc)}${needs.length ? ` <em>Benötigt: ${esc(needs.join(', '))}</em>` : ''}</small></span>
        <input type="checkbox" class="switch" ${fixed ? '' : `data-module="${k}" data-scope="${scope}"`} ${on ? 'checked' : ''} ${readOnly || fixed ? 'disabled' : ''} aria-label="${esc(def.label)}">
      </label>`;
    };
    const rec = recommended || [];
    const keys = ALL_MODULES.filter((k) => k !== 'inventory');
    const first = rec.length ? keys.filter((k) => rec.includes(k)) : keys;
    const rest = rec.length ? keys.filter((k) => !rec.includes(k)) : [];
    const lager = `<div class="system-card ${mods.inventory ? 'on' : ''}">
        ${row('inventory', MODULES.inventory, !!mods.inventory, false, 'system')}
        ${mods.inventory ? `<label class="module sub ${linkOn ? 'on' : ''} ${readOnly ? 'ro' : ''}">
          <span class="module-ic">${icon('link', 18)}</span>
          <span class="module-txt"><b>Mit der Buchhaltung verknüpfen</b><small>${linkOn ? 'Rechnungen buchen Ware ab, Einkäufe buchen zu, Lagerartikel stehen in der Preisliste.' : 'Das Lager läuft eigenständig – Belege verändern keine Bestände (z. B. für Material, Inventar, Ausleihe).'}</small></span>
          <input type="checkbox" class="switch" data-link data-scope="${scope}" ${linkOn ? 'checked' : ''} ${readOnly ? 'disabled' : ''} aria-label="Lager verknüpfen">
        </label>` : ''}
      </div>`;
    return `<div class="module-list">
      ${row('entries', { label: 'Kassenbuch', icon: 'book', desc: 'Einnahmen und Ausgaben – das Herz deiner Buchhaltung. Immer aktiv.' }, true, true)}
      ${first.map((k) => row(k, MODULES[k], !!mods[k], false)).join('')}
      ${rest.length ? `<div class="list-divider">Weitere Funktionen</div>${rest.map((k) => row(k, MODULES[k], !!mods[k], false)).join('')}` : ''}
      <div class="list-divider">Eigenes System</div>
      ${lager}
    </div>`;
  }

  // ---------- Einrichtungsassistent (nach der Registrierung oder unter Einstellungen erneut)
  function setupState() {
    if (UI.setup) return UI.setup;
    const s = settings();
    const t = orgType();
    UI.setup = {
      step: t ? 2 : 1,
      orgType: t || '',
      legalForm: s.legalForm || (t ? ORG_TYPES[t].legal[0] : ''),
      smallBusiness: !!s.smallBusiness, nonProfit: s.nonProfit ?? (t === 'club'),
      street: s.street || '', zip: s.zip || '', city: s.city || '',
      taxNumber: s.taxNumber || '', vatId: s.vatId || '', taxOffice: s.taxOffice || '',
      exemptionDate: s.exemptionDate || '', purposes: s.purposes || '', register: s.register || '',
      hourlyRate: s.hourlyRate ?? '',
      modules: { ...currentModules() },
      inventoryLink: s.inventoryLink !== false,
    };
    return UI.setup;
  }
  const sf = (key, label, attrs = '', cls = '') => {
    const st = UI.setup;
    return field(label, `<input data-setup-field="${key}" value="${esc(st[key] ?? '')}" ${attrs}>`, cls);
  };

  function setupHtml() {
    const st = setupState();
    const T = ORG_TYPES[st.orgType];
    const steps = ['Art', 'Angaben', 'Funktionen'];
    const stepper = `<ol class="stepper">${steps.map((l, i) => `<li class="${st.step === i + 1 ? 'active' : st.step > i + 1 ? 'done' : ''}"><span>${st.step > i + 1 ? icon('check', 14) : i + 1}</span>${l}</li>`).join('')}</ol>`;
    let body = '';
    if (st.step === 1) {
      body = `<div class="setup-head"><h2>Was beschreibt deine Organisation am besten?</h2>
          <p class="muted">Davon hängen Vorschläge für Funktionen, Begriffe und Kategorien ab. Du kannst später alles ändern.</p></div>
        <div class="type-grid">${Object.entries(ORG_TYPES).map(([k, t]) => `<button type="button" class="type-card ${st.orgType === k ? 'active' : ''}" data-action="setup-type" data-type="${k}">
          <span class="preset-ic">${icon(t.icon, 22)}</span><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></button>`).join('')}</div>`;
    } else if (st.step === 2) {
      const club = st.orgType === 'club';
      body = `<div class="setup-head"><h2>Angaben zu ${esc(companyName() || 'deiner Organisation')}</h2>
          <p class="muted">Erscheinen auf Rechnungen${club ? ', Spendenbescheinigungen' : ''} und Berichten. Alles optional – du kannst es später ergänzen.</p></div>
        <div class="setup-form">
          <div class="grid2">
            ${field('Rechtsform', `<select data-setup-field="legalForm">${T.legal.map((l) => `<option ${st.legalForm === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
            ${club ? sf('register', 'Registergericht & Nr.', 'placeholder="z. B. AG Musterstadt VR 1234"') : sf('vatId', 'USt-IdNr.', 'placeholder="DE…"')}
            ${sf('street', 'Straße & Hausnr.', 'autocomplete="street-address"', 'span2')}
            ${sf('zip', 'PLZ', 'inputmode="numeric"')}
            ${sf('city', 'Ort')}
            ${sf('taxNumber', 'Steuernummer')}
            ${!club && st.orgType !== 'small' ? sf('hourlyRate', 'Standard-Stundensatz netto (€)', 'type="number" step="any" min="0"') : '<div></div>'}
          </div>
          <div class="check-cards">
            ${club ? `<label class="check-card ${st.nonProfit ? 'on' : ''}"><input type="checkbox" data-setup-field="nonProfit" ${st.nonProfit ? 'checked' : ''}>
              <span><b>Gemeinnützig anerkannt</b><small>Spenden mit Zuwendungsbestätigung, Buchungen nach Bereichen (ideell, Vermögensverwaltung, Zweckbetrieb, wirtschaftlich).</small></span></label>` : ''}
            <label class="check-card ${st.smallBusiness ? 'on' : ''}"><input type="checkbox" data-setup-field="smallBusiness" ${st.smallBusiness ? 'checked' : ''}>
              <span><b>Kleinunternehmerregelung (§ 19 UStG)</b><small>Keine Umsatzsteuer auf Rechnungen und Angeboten${club ? ' – trifft auf die meisten Vereine zu' : ''}.</small></span></label>
          </div>
          ${club && st.nonProfit ? `<div class="grid2">
            ${sf('taxOffice', 'Finanzamt', 'placeholder="z. B. Finanzamt Musterstadt"')}
            ${sf('exemptionDate', 'Freistellungsbescheid vom', 'type="date"')}
            ${sf('purposes', 'Steuerbegünstigte Zwecke', 'placeholder="z. B. Förderung des Sports"', 'span2')}
          </div>` : ''}
        </div>`;
    } else {
      body = `<div class="setup-head"><h2>Welche Funktionen brauchst du?</h2>
          <p class="muted">Für <b>${esc(T.label)}</b> haben wir passende Funktionen vorgeschlagen. Das Lager ist ein eigenes System – schalte es nur ein, wenn du Bestände führen willst.</p></div>
        ${moduleList(st.modules, 'setup', false, st.inventoryLink, T.modules)}`;
    }
    const next = st.step === 1
      ? `<button class="btn primary" data-action="setup-next" ${st.orgType ? '' : 'disabled'}>Weiter ${icon('arrowRight', 16)}</button>`
      : st.step === 2 ? `<button class="btn primary" data-action="setup-next">Weiter ${icon('arrowRight', 16)}</button>`
        : `<button class="btn primary" data-action="setup-finish">Los geht's ${icon('arrowRight', 16)}</button>`;
    return `<section class="card setup">
      <div class="setup-top"><span class="eyebrow">${icon('sparkle', 14)} Einrichtung</span>${stepper}</div>
      ${body}
      <div class="setup-foot">
        ${st.step > 1 ? `<button class="btn ghost" data-action="setup-back">${icon('arrowLeft', 16)} Zurück</button>` : ''}
        ${UI.forceSetup ? '<button class="btn ghost" data-action="setup-cancel">Abbrechen</button>' : ''}
        <span class="spacer"></span>${next}
      </div>
    </section>`;
  }

  function welcomeHtml() {
    const admin = S.user.role === 'admin';
    const club = isClub();
    const steps = [
      [club ? 'Vereinsdaten hinterlegen' : 'Firmendaten hinterlegen', club ? 'Anschrift, Finanzamt und Freistellungsbescheid.' : 'Adresse, Steuernummer und Bankverbindung für deine Belege.', '#/settings', 'org'],
      mod('members') && ['Mitglieder erfassen', 'Mit Beitrag und Intervall – dann erledigt der Beitragslauf den Rest.', '#/members'],
      mod('catalog') && ['Produkte & Leistungen anlegen', 'Mit Preisen – dann sind Rechnungspositionen ein Klick.', '#/articles'],
      mod('contacts') && !club && ['Kunden anlegen', 'Unter Kunden & Lieferanten.', '#/contacts'],
      mod('time') && ['Erste Zeit erfassen', 'Mit Kunde und Projekt – später mit einem Klick abrechnen.', '#/time'],
      mod('inventory') && ['Lager einrichten', 'Im Bereich „Lager“ Artikel mit Anfangsbestand anlegen.', '#/stockitems'],
      ['Team einladen', 'Einladungscode unter Einstellungen → Team teilen.', '#/settings', 'team'],
    ].filter(Boolean);
    return `<div class="welcome">
      <section class="hero-card">
        <span class="eyebrow">${icon('sparkle', 14)} ${esc(companyName())}${orgType() ? ` · ${esc(ORG_TYPES[orgType()].short)}` : ''}</span>
        <h2>${greeting()}, ${firstName()}!</h2>
        <p>Alles ist eingerichtet. Womit möchtest du anfangen?</p>
        <div class="quick-actions">${quickItems().slice(0, 6).map((q) => quickBtn(q, 'qa')).join('')}</div>
        <div class="toolbar">${admin ? `<button class="btn ghost light" data-action="demo">${icon('sparkle', 16)} Mit Beispieldaten ausprobieren</button>` : ''}
          <a class="btn ghost light" href="#/settings" data-action="set-ui" data-k="setTab" data-v="features">${icon('sliders', 16)} Funktionen anpassen</a></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>In ${steps.length} Schritten startklar</h3></div>
        <ol class="steps">${steps.map(([t, d, href, tab]) => `<li><div><b>${t}</b><div class="muted small">${d} ${tab ? `<a href="${href}" data-action="set-ui" data-k="setTab" data-v="${tab}">Öffnen</a>` : `<a href="${href}">Öffnen</a>`}</div></div></li>`).join('')}</ol>
      </section>
    </div>`;
  }

  const listPanel = (title, link, items, emptyIc, emptyText) => `<section class="card"><div class="card-head"><h3>${title}</h3>${link}</div>
    ${items.length ? `<ul class="list">${items.join('')}</ul>` : empty(emptyIc, emptyText)}</section>`;
  const entryLi = (e) => `<li class="clickable" data-action="edit-entry" data-id="${e.id}"><div><b>${esc(e.description || e.category)}</b><span class="sub">${fmtDate(e.date)} · ${esc(e.category || '')} · ${esc(e.method || '')}</span></div><span class="num ${e.kind === 'income' ? 'pos' : 'neg'}"><b>${e.kind === 'income' ? '+' : '−'}${money(e.gross)}</b></span></li>`;

  function viewDashboard() {
    if (!S.lastSync && S.online && !hasBusinessData()) return `<div class="card loading-card">${icon('sync', 22)}<span>Daten werden geladen …</span></div>`;
    if (needsSetup()) return S.user.role === 'admin' ? setupHtml() : welcomeHtml();
    if (!hasBusinessData()) return welcomeHtml();

    const entries = all('entries');
    const year = today().slice(0, 4);
    const ym = today().slice(0, 7);
    const monthName = new Date().toLocaleDateString('de-DE', { month: 'long' });
    const months = lastMonths(6).map((k) => {
      const es = entries.filter((e) => String(e.date || '').startsWith(k));
      return { label: monthLabel(k), a: sum(es.filter((e) => e.kind === 'income'), (e) => e.net), b: sum(es.filter((e) => e.kind === 'expense'), (e) => e.net) };
    });
    const chart = `<section class="card"><div class="card-head"><h3>Einnahmen & Ausgaben</h3><span class="muted">letzte 6 Monate${isClub() ? '' : ', netto'}</span></div>${barChart(months)}</section>`;
    const recent = entries.slice().sort(byDateDesc).slice(0, 6).map(entryLi);
    const kpis = [];
    const panels = [chart];
    let note = 'Alles im grünen Bereich.';

    // Lager als eigenes System: kurzer Hinweis mit Sprung in den Lager-Bereich
    const st = stockMap();
    const low = mod('inventory') ? stockArticles().filter((a) => isLow(a, st)) : [];
    const stockTeaser = mod('inventory') ? `<section class="system-teaser">${icon('layers', 22)}<div><b>NEXCOUNT Lager</b>
      <span>${low.length ? `<span class="neg">${low.length} ${low.length === 1 ? 'Artikel' : 'Artikel'} unter Mindestbestand</span> · ` : ''}Lagerwert ${money(sum(stockArticles(), (a) => Math.max(0, st[a.id] || 0) * num(a.ek)))} · ${stockLinked() ? 'verknüpft' : 'eigenständig'}</span></div>
      <button class="btn sm" data-action="space" data-v="stock">Zum Lager ${icon('arrowRight', 14)}</button></section>` : '';

    if (isClub()) {
      const yE = entries.filter((e) => String(e.date || '').startsWith(year));
      const inc = sum(yE.filter((e) => e.kind === 'income'), (e) => e.gross);
      const exp = sum(yE.filter((e) => e.kind === 'expense'), (e) => e.gross);
      const cash = sum(entries, (e) => (e.kind === 'income' ? 1 : -1) * num(e.gross));
      kpis.push(kpi('Kassenstand', money(cash), cash >= 0 ? 'pos' : 'neg', 'alle Konten & Kassen', 'wallet'));
      kpis.push(kpi(`Einnahmen ${year}`, money(inc), 'pos', 'brutto', 'trendUp'), kpi(`Ausgaben ${year}`, money(exp), 'neg', 'brutto', 'trendDown'));
      if (mod('members')) {
        const ms = members();
        const active = ms.filter((m) => m.status !== 'left');
        kpis.push(kpi('Mitglieder', fmtNum(active.length), '', `${ms.filter((m) => m.status === 'active').length} aktiv · ${ms.filter((m) => m.status === 'passive').length} passiv`, 'heart'));
      }
      if (mod('dues')) {
        const openDues = all('dues').filter((d) => d.status === 'open');
        const late = openDues.filter((d) => d.dueDate && d.dueDate < today());
        kpis.push(kpi('Offene Beiträge', money(sum(openDues, (d) => d.amount)), late.length ? 'neg' : '', `${openDues.length} offen${late.length ? ` · ${late.length} überfällig` : ''}`, 'repeat'));
        if (late.length) note = `${late.length} ${late.length === 1 ? 'Beitrag ist' : 'Beiträge sind'} überfällig.`;
        panels.push(listPanel('Offene Beiträge', '<a href="#/dues">Alle anzeigen</a>',
          openDues.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 6).map((d) => `<li><div><b>${esc(d.memberName)}</b><span class="sub">${esc(d.periodLabel)} · fällig ${fmtDate(d.dueDate)}</span></div>${d.dueDate < today() ? '<span class="badge overdue">überfällig</span>' : ''}<span class="num"><b>${money(d.amount)}</b></span><button class="btn sm" data-action="due-paid" data-id="${d.id}" title="Als bezahlt buchen">${icon('check', 14)}</button></li>`),
          'check', 'Keine offenen Beiträge.'));
      }
      if (mod('donations')) {
        const ds = all('donations');
        const yd = ds.filter((d) => String(d.date || '').startsWith(year));
        kpis.push(kpi(`Spenden ${year}`, money(sum(yd, (d) => d.amount)), 'pos', `${yd.length} Spende(n)`, 'gift'));
        panels.push(listPanel('Letzte Spenden', '<a href="#/donations">Alle anzeigen</a>',
          ds.sort(byDateDesc).slice(0, 6).map((d) => `<li class="clickable" data-action="edit-donation" data-id="${d.id}"><div><b>${esc(d.donorName || 'Anonym')}</b><span class="sub">${fmtDate(d.date)} · ${d.kind === 'goods' ? 'Sachspende' : 'Geldspende'}${d.receiptNo ? ` · ${esc(d.receiptNo)}` : ''}</span></div><span class="num pos"><b>${money(d.amount)}</b></span></li>`),
          'gift', 'Noch keine Spenden erfasst.'));
      }
    } else {
      const docs = all('documents');
      const mE = entries.filter((e) => String(e.date || '').startsWith(ym));
      const inc = sum(mE.filter((e) => e.kind === 'income'), (e) => e.net);
      const exp = sum(mE.filter((e) => e.kind === 'expense'), (e) => e.net);
      kpis.push(kpi('Einnahmen', money(inc), 'pos', `${monthName} · netto`, 'trendUp'), kpi('Ausgaben', money(exp), 'neg', `${monthName} · netto`, 'trendDown'),
        kpi('Ergebnis', money(inc - exp), inc - exp >= 0 ? 'pos' : 'neg', monthName, 'wallet'));
      if (mod('invoices')) {
        const open = docs.filter((d) => d.kind === 'sale' && d.status === 'open').sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
        const overdue = open.filter(isLate);
        kpis.push(kpi('Offene Rechnungen', money(sum(open, (d) => docTotals(d).gross)), '', `${open.length} offen${overdue.length ? ` · <span class="neg">${overdue.length} überfällig</span>` : ''}`, 'file'));
        if (overdue.length) note = `${overdue.length} ${overdue.length === 1 ? 'Rechnung ist' : 'Rechnungen sind'} überfällig.`;
        else if (open.length) note = `${open.length} ${open.length === 1 ? 'Rechnung wartet' : 'Rechnungen warten'} auf Zahlung.`;
        panels.push(listPanel('Offene Rechnungen', '<a href="#/documents" data-action="set-ui" data-k="docKind" data-v="sale">Alle anzeigen</a>',
          open.slice(0, 6).map((d) => `<li class="clickable" data-action="open-doc" data-id="${d.id}"><div><b>${esc(d.number)} · ${esc((d.contact && d.contact.name) || '—')}</b><span class="sub">fällig ${fmtDate(d.dueDate)}</span></div>${isLate(d) ? '<span class="badge overdue">überfällig</span>' : ''}<span class="num"><b>${money(docTotals(d).gross)}</b></span></li>`),
          'check', 'Keine offenen Rechnungen.'));
      }
      if (mod('time')) {
        const ts = all('times');
        const mT = ts.filter((t) => String(t.date || '').startsWith(ym));
        const ub = unbilledTimes();
        kpis.push(kpi('Stunden', fmtHours(sum(mT, (t) => t.minutes)), '', `${monthName} · ${money(sum(ub, timeValue))} nicht abgerechnet`, 'clock'));
        const byC = {};
        for (const t of ub) (byC[t.contactId || ''] = byC[t.contactId || ''] || []).push(t);
        panels.push(listPanel('Nicht abgerechnete Zeiten', '<a href="#/time">Zeiterfassung</a>',
          Object.entries(byC).sort((a, b) => sum(b[1], timeValue) - sum(a[1], timeValue)).slice(0, 6).map(([cid, list]) => `<li><div><b>${esc((list[0].contactName) || 'Ohne Kunde')}</b><span class="sub">${list.length} Einträge · ${fmtHours(sum(list, (t) => t.minutes))}</span></div><span class="num"><b>${money(sum(list, timeValue))}</b></span>${cid ? `<button class="btn sm" data-action="bill-times" data-id="${cid}">${icon('file', 14)} Abrechnen</button>` : ''}</li>`),
          'check', 'Alle Zeiten sind abgerechnet.'));
      }
      if (mod('quotes')) {
        const quotes = docs.filter((d) => d.kind === 'quote' && d.status === 'open').sort(byDateDesc);
        kpis.push(kpi('Offene Angebote', money(sum(quotes, (d) => docTotals(d).gross)), '', `${quotes.length} versendet`, 'send'));
        panels.push(listPanel('Offene Angebote', '<a href="#/documents" data-action="set-ui" data-k="docKind" data-v="quote">Alle anzeigen</a>',
          quotes.slice(0, 6).map((d) => `<li class="clickable" data-action="open-doc" data-id="${d.id}"><div><b>${esc(d.number)} · ${esc((d.contact && d.contact.name) || '—')}</b><span class="sub">gültig bis ${fmtDate(d.dueDate) || '—'}</span></div>${isLate(d) ? '<span class="badge overdue">abgelaufen</span>' : ''}<span class="num"><b>${money(docTotals(d).gross)}</b></span></li>`),
          'send', 'Keine offenen Angebote.'));
      }
    }
    if (low.length && note === 'Alles im grünen Bereich.') note = `Im Lager ${low.length === 1 ? 'liegt 1 Artikel' : `liegen ${low.length} Artikel`} unter dem Mindestbestand.`;
    panels.push(listPanel('Letzte Buchungen', '<a href="#/entries">Kassenbuch</a>', recent, 'book', 'Noch keine Buchungen.'));

    const tip = !orgType() && S.user.role === 'admin'
      ? `<section class="tip-card">${icon('sliders', 20)}<div><b>Neu: NEXCOUNT passt sich deiner Organisation an</b><span>Verein, Dienstleister, Einzelunternehmer oder Kleinunternehmen – mit passenden Funktionen und dem Lager als eigenem System.</span></div><button class="btn sm" data-action="reopen-setup">Einrichten</button></section>`
      : '';
    return `
      <section class="hero-card">
        <div class="hero-text"><span class="eyebrow">${esc(companyName())}${orgType() ? ` · ${esc(ORG_TYPES[orgType()].short)}` : ''}</span><h2>${greeting()}, ${firstName()}!</h2><p>${note}</p></div>
        <div class="quick-actions">${quickItems().slice(0, 4).map((q) => quickBtn(q, 'qa')).join('')}</div>
      </section>
      ${tip}
      <div class="kpis">${kpis.join('')}</div>
      ${stockTeaser}
      <div class="grid-2 panels">${panels.join('')}</div>`;
  }

  // =============================================================== Ansicht: Produkte & Leistungen (Preisliste)
  // Lagerartikel = Produkte; in der Preisliste stehen nur Artikel, die verkauft werden (sellable)
  const stockArticles = () => articles().filter((a) => a.type !== 'service');
  const catalogArticles = () => articles().filter((a) => a.sellable !== false);
  function articleOptions(selected, { withStock = true, placeholder = 'Artikel wählen …', productsOnly = false } = {}) {
    const st = stockMap();
    const list = productsOnly ? stockArticles() : catalogArticles();
    return `<option value="">${esc(placeholder)}</option>${list.map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.sku)} – ${esc(a.name)}${withStock && (productsOnly ? tracksStock(a) : bookStock(a)) ? ` (${fmtNum(st[a.id] || 0)} ${esc(a.unit || '')})` : ''}</option>`).join('')}`;
  }
  const marginOf = (a) => { const vk = num(a.vk); return vk > 0 && num(a.ek) > 0 ? ((vk - num(a.ek)) / vk) * 100 : null; };
  const marginCell = (a) => { const m = marginOf(a); return `<td class="num ${m != null && m < 0 ? 'neg' : ''}">${m == null ? '—' : `${m.toFixed(1).replace('.', ',')} %`}</td>`; };

  function viewArticles() {
    const st = stockMap();
    const all_ = catalogArticles();
    const linked = stockLinked();
    const cats = [...new Set(all_.map((a) => a.category).filter(Boolean))].sort();
    const q = (UI.q.art || '').toLowerCase();
    let list = all_;
    if (q) list = list.filter((a) => [a.sku, a.name, a.category, a.ean].join(' ').toLowerCase().includes(q));
    if (UI.q.artCat) list = list.filter((a) => a.category === UI.q.artCat);
    if (UI.q.artType) list = list.filter((a) => (a.type || 'product') === UI.q.artType);
    const typeBadge = (a) => (a.type === 'service' ? '<span class="badge info">Leistung</span>' : '');
    return `
      <div class="toolbar">
        ${searchBox('art', 'Produkte und Leistungen suchen …')}
        ${uiSelect('artType', [['', 'Produkte & Leistungen'], ['product', 'Nur Produkte'], ['service', 'Nur Leistungen']])}
        ${cats.length ? uiSelect('artCat', [['', 'Alle Kategorien'], ...cats.map((c) => [c, c])]) : ''}
        <div class="actions">
          <button class="btn" data-action="new-article" data-kind="service">${icon('briefcase', 16)} Leistung</button>
          <button class="btn primary" data-action="new-article" data-kind="product">${icon('plus', 16)} Produkt</button>
        </div>
      </div>
      ${mod('inventory') ? `<div class="hint-bar">${icon(linked ? 'link' : 'layers', 16)}<span>${linked ? 'Verknüpft mit NEXCOUNT Lager: Produkte zeigen ihren Bestand, Rechnungen buchen ab.' : 'NEXCOUNT Lager läuft eigenständig – Lagerartikel erscheinen nur hier, wenn sie als „verkäuflich“ markiert sind.'}</span><button class="btn sm ghost" data-action="space" data-v="stock">Zum Lager</button></div>` : ''}
      <section class="card flush">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kategorie</th><th>Einheit</th><th class="num">Preis netto</th><th class="num">USt</th><th class="num">Marge</th>${linked ? '<th class="num">Bestand</th>' : ''}</tr></thead>
          <tbody>${list.map((a) => `<tr class="clickable" data-action="edit-article" data-id="${a.id}">
            <td class="muted">${esc(a.sku)}</td><td><b>${esc(a.name)}</b> ${typeBadge(a)}${a.description ? `<span class="sub">${esc(a.description.slice(0, 80))}</span>` : ''}</td>
            <td>${esc(a.category || '—')}</td><td>${esc(a.unit || '')}</td><td class="num"><b>${money(a.vk)}</b></td><td class="num muted">${num(a.tax)} %</td>${marginCell(a)}
            ${linked ? `<td class="num">${bookStock(a) ? (isLow(a, st) ? `<span class="badge low">${fmtNum(st[a.id] || 0)}</span>` : fmtNum(st[a.id] || 0)) : '<span class="muted">—</span>'}</td>` : ''}</tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="${linked ? 8 : 7}">${list.length} Einträge</td></tr></tfoot>
        </table></div>`
        : empty('tag', all_.length ? 'Nichts gefunden für diesen Filter.' : 'Noch nichts angelegt. Lege deine Produkte und Leistungen mit Preisen an – dann sind Rechnungspositionen nur noch ein Klick.',
          all_.length ? '' : `<div class="toolbar"><button class="btn" data-action="new-article" data-kind="service">${icon('briefcase', 16)} Leistung anlegen</button><button class="btn primary" data-action="new-article" data-kind="product">${icon('plus', 16)} Produkt anlegen</button></div>`)}
      </section>`;
  }

  // Ein Formular für Preisliste und Lager. ctx = 'books' (Preisliste) oder 'stock' (Lagerartikel)
  function openArticle(id, presetType, ctx = UI.space === 'stock' ? 'stock' : 'books') {
    const a = id ? get('articles', id) : null;
    const isNew = !a;
    const inv = mod('inventory');
    const linked = stockLinked();
    const inStock = ctx === 'stock';
    const smallBiz = !!settings().smallBusiness;
    const type0 = inStock ? 'product' : (a && a.type) || (presetType === 'service' || presetType === 'product' ? presetType : 'service');
    const d = a || { sku: nextCode('articles', inStock ? 'L' : 'A', 'sku'), unit: type0 === 'service' ? 'Std' : 'Stk', tax: smallBiz ? 0 : 19, ek: '', vk: '', min: '', sellable: inStock ? linked && mod('catalog') : true };
    const cats = all('articles').map((x) => x.category).filter(Boolean);
    const locs = all('articles').map((x) => x.location).filter(Boolean);
    const st = stockMap();
    const showStock = inv && (inStock || linked);
    const stockFields = showStock ? `
          <div class="form-section span2 only-product">${icon('layers', 14)} NEXCOUNT Lager</div>
          ${field('EAN / Barcode', inp('ean', d.ean, 'maxlength="40" inputmode="numeric"'), 'only-product')}
          ${field('Lagerort', inp('location', d.location, 'list="dl-loc" maxlength="60" placeholder="z. B. Regal A3"'), 'only-product')}
          ${field('Mindestbestand', numInp('min', d.min, 'min="0"'), 'only-product')}
          ${isNew ? field('Anfangsbestand', numInp('initial', '', 'min="0" placeholder="0"'), 'only-product')
            : field('Aktueller Bestand', `<input readonly value="${esc(`${fmtNum(st[a.id] || 0)} ${a.unit || ''}`)}">`, 'only-product')}` : '';
    const sellToggle = inStock && mod('catalog')
      ? `<label class="check span2"><input type="checkbox" name="sellable" ${d.sellable !== false ? 'checked' : ''}> Auch in der Preisliste der Buchhaltung anbieten (verkäuflich)</label>` : '';
    openModal({
      title: isNew ? (inStock ? 'Neuer Lagerartikel' : type0 === 'service' ? 'Neue Leistung' : 'Neues Produkt') : a.name,
      body: `<div class="grid2">
          ${inStock ? '<input type="hidden" name="type" value="product">' : field('Art', selectEl('type', Object.entries(ART_TYPES), type0))}
          ${field('Nummer', inp('sku', d.sku, 'required maxlength="40"'))}
          ${field('Bezeichnung', inp('name', d.name, 'required maxlength="160"'), inStock ? '' : 'span2')}
          ${field('Kategorie', inp('category', d.category, 'list="dl-cat" maxlength="60"'))}
          ${field('Einheit', inp('unit', d.unit, 'list="dl-unit" maxlength="20"'))}
          ${!inStock || mod('catalog') ? field('Verkaufspreis netto (€)', numInp('vk', d.vk, 'min="0"')) : ''}
          ${!inStock || mod('catalog') ? field('USt-Satz', selectEl('tax', RATES, d.tax ?? 19)) : ''}
          ${field(inv ? 'Einkaufspreis / Wert netto (€)' : 'Eigene Kosten netto (€, optional)', numInp('ek', d.ek, 'min="0"'))}
          ${!inStock || mod('catalog') ? '<div class="field"><span>Marge</span><input id="art-margin" readonly></div>' : ''}
          ${sellToggle}
          ${stockFields}
          ${field('Beschreibung (erscheint nicht auf Belegen)', textarea('description', d.description, 'maxlength="2000" rows="2"'), 'span2')}
        </div>${datalist('dl-cat', cats)}${datalist('dl-unit', UNITS)}${datalist('dl-loc', locs)}`,
      extra: isNew ? '' : `<button type="button" class="btn danger" data-action="archive-article" data-id="${a.id}">Archivieren</button>
        ${tracksStock(a) ? `<button type="button" class="btn" data-action="inventory" data-id="${a.id}">Inventur</button>` : ''}`,
      onMount(form) {
        const typeSel = $('select[name=type]', form);
        const unit = $('[name=unit]', form);
        const syncType = () => {
          const svc = typeSel && typeSel.value === 'service';
          $$('.only-product', form).forEach((el) => el.classList.toggle('hidden', svc));
        };
        if (typeSel) typeSel.addEventListener('change', () => {
          if (typeSel.value === 'service' && unit.value === 'Stk') unit.value = 'Std';
          if (typeSel.value === 'product' && unit.value === 'Std') unit.value = 'Stk';
          syncType();
        });
        const margin = () => {
          const el = $('#art-margin', form);
          if (!el) return;
          const vk = num(($('[name=vk]', form) || {}).value);
          const ek = num($('[name=ek]', form).value);
          el.value = vk > 0 && ek > 0 ? `${money(vk - ek)} (${(((vk - ek) / vk) * 100).toFixed(1).replace('.', ',')} %)` : '—';
        };
        form.addEventListener('input', margin);
        syncType();
        margin();
      },
      onSubmit(fd) {
        const sku = fd.sku.trim();
        if (all('articles').some((x) => x.sku === sku && x.id !== (a && a.id) && !x.archived)) throw new Error(`Nummer ${sku} ist bereits vergeben.`);
        const data = {
          ...(a || {}),
          type: fd.type === 'service' ? 'service' : 'product',
          sku, name: fd.name.trim(), category: fd.category.trim(), unit: fd.unit.trim(),
          ek: num(fd.ek), description: fd.description,
        };
        if ('vk' in fd) Object.assign(data, { vk: num(fd.vk), tax: num(fd.tax) });
        if (inStock) data.sellable = mod('catalog') ? fd.sellable === 'on' : false;
        else if (isNew) data.sellable = true;
        if (showStock && data.type === 'product') Object.assign(data, { ean: (fd.ean || '').trim(), min: num(fd.min), location: (fd.location || '').trim() });
        const saved = put('articles', data);
        if (isNew && tracksStock(saved) && num(fd.initial) > 0) {
          put('movements', { articleId: saved.id, qty: num(fd.initial), type: 'initial', date: today(), unitCost: saved.ek, note: 'Anfangsbestand' });
        }
        toast(isNew ? `${inStock ? 'Lagerartikel' : saved.type === 'service' ? 'Leistung' : 'Produkt'} angelegt` : 'Gespeichert', 'ok');
      },
    });
  }

  // =============================================================== NEXCOUNT Lager (eigenes System)
  function viewStockHome() {
    const st = stockMap();
    const arts = stockArticles();
    const low = arts.filter((a) => isLow(a, st));
    const mv = all('movements').sort(byDateDesc);
    const since30 = addDays(today(), -30);
    const value = sum(arts, (a) => Math.max(0, st[a.id] || 0) * num(a.ek));
    const linked = stockLinked();
    return `
      <section class="hero-card stock-hero">
        <div class="hero-text"><span class="eyebrow">${icon('layers', 14)} NEXCOUNT Lager</span><h2>${low.length ? `${low.length} ${low.length === 1 ? 'Artikel braucht' : 'Artikel brauchen'} Nachschub` : 'Lager im grünen Bereich'}</h2>
          <p>${arts.length} Lagerartikel · Lagerwert ${money(value)}</p></div>
        <div class="quick-actions">${quickItems().map((q) => quickBtn(q, 'qa')).join('')}</div>
      </section>
      <section class="link-card ${linked ? 'on' : ''}">
        <span class="module-ic">${icon(linked ? 'link' : 'layers', 18)}</span>
        <div><b>${linked ? 'Mit der Buchhaltung verknüpft' : 'Eigenständiges Lager'}</b>
          <span>${linked ? 'Festgeschriebene Rechnungen buchen Ware ab, Einkäufe buchen zu, verkäufliche Lagerartikel stehen in der Preisliste.' : 'Bestände änderst du nur hier im Lager – Rechnungen und Einkäufe der Buchhaltung bleiben unberührt.'}</span></div>
        ${S.user.role === 'admin' ? `<label class="switch-label"><input type="checkbox" class="switch" data-link data-scope="settings" ${linked ? 'checked' : ''} aria-label="Mit Buchhaltung verknüpfen"><span>${linked ? 'Verknüpft' : 'Getrennt'}</span></label>` : ''}
      </section>
      <div class="kpis">
        ${kpi('Lagerwert', money(value), '', 'zu Einkaufspreisen', 'wallet')}
        ${kpi('Lagerartikel', fmtNum(arts.length), '', `${fmtNum(sum(arts, (a) => Math.max(0, st[a.id] || 0)))} Einheiten`, 'tag')}
        ${kpi('Unter Mindestbestand', fmtNum(low.length), low.length ? 'neg' : '', 'nachbestellen', 'alert')}
        ${kpi('Bewegungen', fmtNum(mv.filter((m) => (m.date || '') >= since30).length), '', 'letzte 30 Tage', 'sync')}
      </div>
      <div class="grid-2 panels">
        ${listPanel('Nachbestellen', '<a href="#/stockitems" data-action="set-ui" data-k="artLow" data-v="1">Alle anzeigen</a>',
          low.slice(0, 8).map((a) => {
            const s = st[a.id] || 0;
            const pct = Math.max(4, Math.min(100, (s / num(a.min)) * 100));
            return `<li class="clickable" data-action="move-in" data-id="${a.id}"><div><b>${esc(a.name)}</b><div class="bar-meter" style="margin-top:6px"><span style="width:${pct}%"></span></div></div><span class="num"><b>${fmtNum(s)}</b> <span class="muted small">/ ${fmtNum(a.min)} ${esc(a.unit || '')}</span></span></li>`;
          }), 'check', 'Alle Artikel sind ausreichend vorrätig.')}
        ${listPanel('Letzte Bewegungen', '<a href="#/stock">Alle anzeigen</a>',
          mv.slice(0, 8).map((m) => { const a = articleRaw(m.articleId) || {}; const q = num(m.qty); return `<li><div><b>${esc(a.name || '(unbekannt)')}</b><span class="sub">${fmtDate(m.date)} · ${esc(MV_TYPES[m.type] || m.type)}${m.note ? ` · ${esc(m.note)}` : ''}</span></div><span class="num ${q >= 0 ? 'pos' : 'neg'}"><b>${q > 0 ? '+' : ''}${fmtNum(q)}</b> <span class="muted small">${esc(a.unit || '')}</span></span></li>`; }),
          'layers', 'Noch keine Bewegungen.')}
      </div>`;
  }

  function viewStockItems() {
    const st = stockMap();
    const all_ = stockArticles();
    const cats = [...new Set(all_.map((a) => a.category).filter(Boolean))].sort();
    const locs = [...new Set(all_.map((a) => a.location).filter(Boolean))].sort();
    const q = (UI.q.sart || '').toLowerCase();
    let list = all_;
    if (q) list = list.filter((a) => [a.sku, a.name, a.category, a.location, a.ean].join(' ').toLowerCase().includes(q));
    if (UI.q.sartCat) list = list.filter((a) => a.category === UI.q.sartCat);
    if (UI.q.sartLoc) list = list.filter((a) => a.location === UI.q.sartLoc);
    if (UI.q.artLow === '1') list = list.filter((a) => isLow(a, st));
    const value = sum(list, (a) => Math.max(0, st[a.id] || 0) * num(a.ek));
    return `
      <div class="toolbar">
        ${searchBox('sart', 'Suchen (Nr., Name, EAN, Lagerort) …')}
        ${cats.length ? uiSelect('sartCat', [['', 'Alle Kategorien'], ...cats.map((c) => [c, c])]) : ''}
        ${locs.length ? uiSelect('sartLoc', [['', 'Alle Lagerorte'], ...locs.map((c) => [c, c])]) : ''}
        ${uiSelect('artLow', [['', 'Alle Bestände'], ['1', 'Unter Mindestbestand']])}
        <div class="actions">
          <button class="btn" data-action="export" data-what="articles">${icon('download', 16)} Inventurliste</button>
          <button class="btn primary" data-action="new-stock-item">${icon('plus', 16)} Lagerartikel</button>
        </div>
      </div>
      <section class="card flush">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kategorie</th><th>Lagerort</th><th class="num">Bestand</th><th class="num">Mindest</th><th class="num">Wert/Einheit</th><th class="num">Lagerwert</th><th></th></tr></thead>
          <tbody>${list.map((a) => {
            const s = st[a.id] || 0;
            return `<tr class="clickable" data-action="edit-article" data-id="${a.id}">
              <td class="muted">${esc(a.sku)}</td>
              <td><b>${esc(a.name)}</b>${a.sellable !== false && mod('catalog') ? ' <span class="badge info">verkäuflich</span>' : ''}${a.ean ? `<span class="sub">EAN ${esc(a.ean)}</span>` : ''}</td>
              <td>${esc(a.category || '—')}</td>
              <td>${esc(a.location || '—')}</td>
              <td class="num">${isLow(a, st) ? `<span class="badge low">${fmtNum(s)} ${esc(a.unit || '')}</span>` : `<b>${fmtNum(s)}</b> <span class="muted">${esc(a.unit || '')}</span>`}</td>
              <td class="num muted">${num(a.min) ? fmtNum(a.min) : '—'}</td>
              <td class="num">${money(a.ek)}</td>
              <td class="num">${money(Math.max(0, s) * num(a.ek))}</td>
              <td class="actions"><button class="btn sm" data-action="move-in" data-id="${a.id}" title="Wareneingang">${icon('plus', 14)}</button>
                <button class="btn sm" data-action="move-out" data-id="${a.id}" title="Warenausgang">${icon('minus', 14)}</button></td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="7">${list.length} Lagerartikel</td><td class="num">${money(value)}</td><td></td></tr></tfoot>
        </table></div>`
        : empty('layers', all_.length ? 'Nichts gefunden für diesen Filter.' : 'Noch keine Lagerartikel. Lege Artikel mit Anfangsbestand, Mindestmenge und Lagerort an.',
          all_.length ? '' : `<button class="btn primary" data-action="new-stock-item">${icon('plus', 16)} Ersten Lagerartikel anlegen</button>`)}
      </section>`;
  }

  function viewStock() {
    const arts = stockArticles();
    let mv = all('movements').sort(byDateDesc);
    if (UI.q.mvArt) mv = mv.filter((m) => m.articleId === UI.q.mvArt);
    if (UI.q.mvType) mv = mv.filter((m) => m.type === UI.q.mvType);
    const q = (UI.q.mv || '').toLowerCase();
    if (q) mv = mv.filter((m) => { const a = articleRaw(m.articleId) || {}; return [a.name, a.sku, m.note, m.createdBy].join(' ').toLowerCase().includes(q); });
    const shown = mv.slice(0, 400);
    return `
      <div class="toolbar">
        ${searchBox('mv', 'Bewegungen durchsuchen …')}
        <select id="s-mvArt" data-ui="mvArt">${articleOptions(UI.q.mvArt, { withStock: false, placeholder: 'Alle Artikel', productsOnly: true })}</select>
        ${uiSelect('mvType', [['', 'Alle Arten'], ...Object.entries(MV_TYPES)])}
        <div class="actions">
          <button class="btn" data-action="inventory">${icon('clipboard', 16)} Inventur</button>
          <button class="btn" data-action="move-out">${icon('minus', 16)} Ausgang</button>
          <button class="btn primary" data-action="move-in">${icon('plus', 16)} Eingang</button>
        </div>
      </div>
      <section class="card flush">
        ${shown.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Datum</th><th>Artikel</th><th>Art</th><th class="num">Menge</th><th class="num">Wert</th><th>Notiz / Beleg</th><th>Erfasst von</th><th></th></tr></thead>
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
        </table></div>${mv.length > shown.length ? `<p class="muted small" style="padding:12px 16px">Die neuesten ${shown.length} von ${mv.length} Bewegungen. Nutze Filter oder den CSV-Export.</p>` : ''}`
        : empty('layers', arts.length ? 'Keine Bewegungen für diesen Filter.' : 'Lege zuerst Lagerartikel an.', arts.length ? '' : '<a class="btn primary" href="#/stockitems">Zu den Lagerartikeln</a>')}
      </section>`;
  }

  function openMovement(type, articleId) {
    if (!stockArticles().length) return toast('Bitte zuerst einen Lagerartikel anlegen.', 'error');
    const isIn = type === 'in';
    const a0 = articleId ? get('articles', articleId) : null;
    openModal({
      title: isIn ? 'Wareneingang buchen' : 'Warenausgang buchen',
      body: `<div class="grid2">
          ${field('Artikel', `<select name="articleId" required>${articleOptions(articleId, { productsOnly: true })}</select>`, 'span2')}
          ${field('Menge', numInp('qty', '', 'required min="0.001"'))}
          ${field('Datum', inp('date', today(), 'type="date" required'))}
          ${isIn ? field('Einkaufspreis / Wert je Einheit (€)', numInp('unitCost', a0 ? a0.ek : '', 'min="0"')) : ''}
          ${field('Notiz', inp('note', '', `maxlength="200" placeholder="${isIn ? 'z. B. Lieferschein-Nr.' : 'z. B. Verbrauch, Ausleihe, Bruch'}"`), isIn ? '' : 'span2')}
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
    if (!stockArticles().length) return toast('Bitte zuerst einen Lagerartikel anlegen.', 'error');
    const st = stockMap();
    openModal({
      title: 'Inventur / Bestandskorrektur',
      body: `<p class="muted">Gib den tatsächlich gezählten Bestand ein. NEXCOUNT bucht die Differenz als Inventurkorrektur.</p>
        <div class="grid2">
          ${field('Artikel', `<select name="articleId" required>${articleOptions(articleId, { productsOnly: true })}</select>`, 'span2')}
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

  // =============================================================== Ansicht: Belege (Rechnungen, Angebote, Einkäufe)
  function docBadge(d) {
    if (isLate(d)) return `<span class="badge overdue">${d.kind === 'quote' ? 'Abgelaufen' : 'Überfällig'}</span>`;
    return `<span class="badge ${d.status}">${esc(statusLabel(d))}</span>`;
  }

  function viewDocuments() {
    const kinds = docKindsOn();
    const kind = kinds.includes(UI.q.docKind) ? UI.q.docKind : kinds[0];
    const K = DOC_KINDS[kind];
    const customer = K.contact === 'customer';
    let docs = all('documents').filter((d) => d.kind === kind).sort((a, b) => byDateDesc(a, b) || String(b.number).localeCompare(String(a.number)));
    const allKind = docs;
    const stat = UI.q.docStatus || '';
    if (stat === 'late') docs = docs.filter(isLate);
    else if (stat) docs = docs.filter((d) => d.status === stat);
    const q = (UI.q.doc || '').toLowerCase();
    if (q) docs = docs.filter((d) => [d.number, d.contact && d.contact.name, d.reference, ...(d.items || []).map((i) => i.text)].join(' ').toLowerCase().includes(q));
    const statusOpts = {
      sale: [['draft', 'Entwurf'], ['open', 'Offen'], ['late', 'Überfällig'], ['paid', 'Bezahlt'], ['cancelled', 'Storniert']],
      quote: [['draft', 'Entwurf'], ['open', 'Versendet'], ['late', 'Abgelaufen'], ['accepted', 'Angenommen'], ['rejected', 'Abgelehnt']],
      purchase: [['draft', 'Entwurf'], ['open', 'Offen'], ['paid', 'Bezahlt'], ['cancelled', 'Storniert']],
    }[kind];
    const openSum = sum(allKind.filter((d) => d.status === 'open'), (d) => docTotals(d).gross);
    const dueHead = kind === 'sale' ? 'Fällig' : kind === 'quote' ? 'Gültig bis' : '';
    return `
      ${kinds.length > 1 ? `<div class="seg tabs-seg">${kinds.map((k) => `<button data-action="set-ui" data-k="docKind" data-v="${k}" class="${k === kind ? 'active' : ''}">${icon(DOC_KINDS[k].icon, 16)} ${DOC_KINDS[k].plural}</button>`).join('')}</div>` : ''}
      <div class="toolbar">
        ${searchBox('doc', 'Nummer, Kontakt, Position …')}
        ${uiSelect('docStatus', [['', 'Alle Status'], ...statusOpts])}
        <div class="actions"><button class="btn primary" data-action="new-doc" data-kind="${kind}">${icon('plus', 16)} ${K.label}</button></div>
      </div>
      <section class="card flush">
        ${docs.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nummer</th><th>Datum</th><th>${customer ? 'Kunde' : 'Lieferant'}</th><th>Status</th>${dueHead ? `<th>${dueHead}</th>` : ''}<th class="num">Netto</th><th class="num">Brutto</th></tr></thead>
          <tbody>${docs.map((d) => {
            const t = docTotals(d);
            const dueCell = kind === 'sale' && d.status === 'paid' ? `<span class="muted">bezahlt ${fmtDate(d.paidAt)}</span>` : fmtDate(d.dueDate);
            return `<tr class="clickable" data-action="open-doc" data-id="${d.id}">
              <td><b>${esc(d.number || 'Entwurf')}</b>${d.reference ? `<span class="sub">${esc(d.reference)}</span>` : ''}</td>
              <td>${fmtDate(d.date)}</td>
              <td>${esc((d.contact && d.contact.name) || '—')}</td>
              <td>${docBadge(d)}</td>
              ${dueHead ? `<td>${dueCell}</td>` : ''}
              <td class="num">${money(t.net)}</td>
              <td class="num"><b>${money(t.gross)}</b></td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="${dueHead ? 5 : 4}">${docs.length} ${docs.length === 1 ? K.label : K.plural} · offen gesamt ${money(openSum)}</td><td class="num">${money(sum(docs, (d) => docTotals(d).net))}</td><td class="num">${money(sum(docs, (d) => docTotals(d).gross))}</td></tr></tfoot>
        </table></div>`
        : empty(K.icon, allKind.length ? 'Nichts gefunden für diesen Filter.' : { sale: 'Noch keine Rechnungen geschrieben.', quote: 'Noch keine Angebote erstellt.', purchase: 'Noch keine Einkäufe erfasst.' }[kind],
          allKind.length ? '' : `<button class="btn primary" data-action="new-doc" data-kind="${kind}">${icon('plus', 16)} ${K.label} erstellen</button>`)}
      </section>`;
  }

  function totalsHtml(t) {
    return `<div class="totals">
      <div><span>Summe netto</span><span>${money(t.net)}</span></div>
      ${t.rates.map((r) => `<div class="muted"><span>USt ${r.rate} % auf ${money(r.net)}</span><span>${money(r.tax)}</span></div>`).join('')}
      <div class="grand"><span>Gesamt brutto</span><span>${money(t.gross)}</span></div>
    </div>`;
  }

  function openDoc(id, kindArg = 'sale') {
    const existing = id ? get('documents', id) : null;
    if (id && !existing) return toast('Beleg nicht gefunden.', 'error');
    if (existing && existing.status !== 'draft') return openDocView(existing);
    const s = settings();
    const smallBiz = !!s.smallBusiness;
    const kind = existing ? existing.kind : (DOC_KINDS[kindArg] ? kindArg : 'sale');
    const K = DOC_KINDS[kind];
    const customer = K.contact === 'customer';
    const isQuote = kind === 'quote';
    const days = isQuote ? num(s.quoteDays) || 30 : num(s.paymentDays) || 14;
    const doc = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: uid(), kind, status: 'draft', date: today(),
      dueDate: kind === 'purchase' ? '' : addDays(today(), days), items: [], contactId: '', reference: '', notes: '',
    };
    const useCatalog = mod('catalog') && articles().length > 0;
    const newItem = () => ({ articleId: '', text: '', qty: 1, price: '', tax: smallBiz ? 0 : 19 });
    if (!doc.items.length) doc.items.push(newItem());
    const contacts = all('contacts').filter((c) => c.type === 'both' || c.type === K.contact).sort(byName);

    const row = (it, i) => `<tr data-i="${i}">
      ${useCatalog ? `<td class="c-art"><select data-f="articleId" aria-label="Artikel">${articleOptions(it.articleId, { placeholder: '— Freitext —' })}</select></td>` : ''}
      <td><input data-f="text" value="${esc(it.text)}" placeholder="Beschreibung" maxlength="300" aria-label="Beschreibung"></td>
      <td class="c-qty"><input data-f="qty" type="number" step="any" class="num" value="${esc(it.qty)}" aria-label="Menge"></td>
      <td class="c-price"><input data-f="price" type="number" step="any" class="num" value="${esc(it.price)}" placeholder="0,00" aria-label="Preis"></td>
      <td class="c-tax"><select data-f="tax" aria-label="USt">${RATES.map(([v, l]) => `<option value="${v}" ${num(it.tax) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td class="c-total num" data-total>${money(num(it.qty) * num(it.price))}</td>
      <td><button type="button" class="icon-btn" data-rm title="Position entfernen">${icon('x', 16)}</button></td>
    </tr>`;

    const labels = {
      sale: { date: 'Rechnungsdatum', due: 'Fällig am', ref: 'Referenz / Bestellnr. des Kunden', notes: 'Hinweis auf der Rechnung' },
      quote: { date: 'Angebotsdatum', due: 'Gültig bis', ref: 'Betreff / Projekt', notes: 'Text auf dem Angebot' },
      purchase: { date: 'Belegdatum', due: '', ref: 'Rechnungsnr. des Lieferanten', notes: 'Notiz' },
    }[kind];
    const hint = isQuote
      ? 'Mit <b>Fertigstellen</b> erhält das Angebot eine Nummer und kann gedruckt werden. Nimmt der Kunde an, wandelst du es mit einem Klick in eine Rechnung um.'
      : `Beim <b>Festschreiben</b> erhält der Beleg eine fortlaufende Nummer${mod('inventory') ? (kind === 'sale' ? ' und Produkte werden aus dem Lager gebucht' : ' und Produkte werden ins Lager eingebucht') : ''}. Danach sind nur noch Zahlung oder Storno möglich.`;

    openModal({
      title: existing ? `${K.label} bearbeiten (Entwurf)` : `Neue${kind === 'sale' ? '' : 's'} ${K.label}`.replace('Neues Rechnung', 'Neue Rechnung').replace('Neues Einkauf', 'Neuer Einkauf'),
      wide: true,
      body: `<div class="grid3">
          ${field(customer ? 'Kunde' : 'Lieferant', `<select name="contactId" ${customer ? 'required' : ''}><option value="">${customer ? 'Kunde wählen …' : '— ohne Lieferant —'}</option>${contacts.map((c) => `<option value="${c.id}" ${c.id === doc.contactId ? 'selected' : ''}>${esc(c.name)}${c.number ? ` (${esc(c.number)})` : ''}</option>`).join('')}</select>`)}
          ${field(labels.date, inp('date', doc.date, 'type="date" required'))}
          ${labels.due ? field(labels.due, inp('dueDate', doc.dueDate, 'type="date"')) : field(labels.ref, inp('reference', doc.reference, 'maxlength="60"'))}
          ${labels.due ? field(labels.ref, inp('reference', doc.reference, 'maxlength="80"')) : ''}
        </div>
        ${!contacts.length && customer ? '<div class="alert info">Noch keine Kunden vorhanden – lege sie zuerst unter <a href="#/contacts">Kontakte</a> an.</div>' : ''}
        <div class="table-wrap"><table class="items-table">
          <thead><tr>${useCatalog ? `<th>${mod('inventory') ? 'Artikel' : 'Produkt / Leistung'}</th>` : ''}<th>Beschreibung</th><th class="num">Menge</th><th class="num">${kind === 'purchase' ? 'EK' : 'Preis'} netto</th><th>USt</th><th class="num">Summe</th><th></th></tr></thead>
          <tbody id="doc-items"></tbody>
        </table></div>
        <div class="toolbar"><button type="button" class="btn sm" id="add-item">${icon('plus', 14)} Position</button><span class="spacer"></span><div id="doc-totals" style="flex:1"></div></div>
        ${field(labels.notes, textarea('notes', doc.notes, 'maxlength="2000" rows="2"'))}
        <p class="muted small">${hint}</p>`,
      submit: 'Entwurf speichern',
      extra: `${existing ? '<button type="button" class="btn danger" id="doc-delete">Entwurf löschen</button>' : ''}<button type="button" class="btn" id="doc-finalize">${icon('check', 16)} ${isQuote ? 'Fertigstellen' : 'Festschreiben'}</button>`,
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
              it.price = kind === 'purchase' ? num(a.ek) : num(a.vk);
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
            if (!d.items.length) throw new Error('Bitte mindestens eine Position mit Beschreibung erfassen.');
            const msg = isQuote ? `Angebot über ${money(calcTotals(d.items).gross)} fertigstellen?`
              : `${K.label} über ${money(calcTotals(d.items).gross)} festschreiben?${mod('inventory') ? ' Die Lagerbestände werden gebucht.' : ''}`;
            if (!confirm(msg)) return;
            const saved = finalizeDoc(d);
            closeModal();
            render();
            toast(`${saved.number} ${isQuote ? 'fertiggestellt' : 'festgeschrieben'}`, 'ok');
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
      if (customer && !fd.contactId) throw new Error('Bitte einen Kunden wählen.');
      const c = get('contacts', fd.contactId);
      return {
        ...doc,
        contactId: fd.contactId || '',
        contact: c ? { name: c.name, contactPerson: c.contactPerson, street: c.street, zip: c.zip, city: c.city, country: c.country, vatId: c.vatId, number: c.number } : null,
        date: fd.date,
        dueDate: kind === 'purchase' ? '' : fd.dueDate,
        reference: (fd.reference || '').trim(),
        notes: fd.notes || '',
        items: doc.items
          .filter((it) => String(it.text || '').trim() || it.articleId)
          .map((it) => ({ articleId: it.articleId || '', text: String(it.text || '').trim(), qty: num(it.qty), price: num(it.price), tax: num(it.tax), unit: it.unit || (articleRaw(it.articleId) || {}).unit || '' })),
      };
    }
  }

  function openDocView(doc) {
    const K = DOC_KINDS[doc.kind] || DOC_KINDS.sale;
    const customer = K.contact === 'customer';
    const t = calcTotals(doc.items);
    const late = isLate(doc);
    const linked = doc.invoiceId ? get('documents', doc.invoiceId) : null;
    const btn = (id, ic, label, cls = '') => `<button type="button" class="btn ${cls}" id="${id}">${icon(ic, 16)} ${label}</button>`;
    let actions = btn('dv-print', 'print', 'Drucken / PDF') + btn('dv-copy', 'copy', 'Kopie');
    if (doc.kind === 'sale' && late) actions += btn('dv-remind', 'bell', 'Zahlungserinnerung');
    if (doc.kind === 'quote') {
      if (doc.status === 'open') actions += btn('dv-reject', 'x', 'Abgelehnt', 'danger');
      if (doc.status === 'open' && mod('invoices')) actions += btn('dv-convert', 'file', 'In Rechnung umwandeln', 'primary');
      if (linked) actions += btn('dv-linked', 'file', `Rechnung ${esc(linked.number || '(Entwurf)')} öffnen`);
    } else {
      if (doc.status === 'open' || doc.status === 'paid') actions += btn('dv-cancel', 'undo', 'Stornieren', 'danger');
      if (doc.status === 'open') actions += btn('dv-paid', 'check', 'Als bezahlt markieren', 'primary');
    }
    openModal({
      title: `${K.label} ${doc.number}`,
      wide: true,
      body: `<div class="meta">
          <div><span>Status</span><b>${docBadge(doc)}</b></div>
          <div><span>${customer ? 'Kunde' : 'Lieferant'}</span><b>${esc((doc.contact && doc.contact.name) || '—')}</b></div>
          <div><span>Datum</span><b>${fmtDate(doc.date)}</b></div>
          ${doc.kind !== 'purchase' ? `<div><span>${doc.kind === 'quote' ? 'Gültig bis' : 'Fällig'}</span><b>${fmtDate(doc.dueDate) || '—'}</b></div>` : ''}
          ${doc.reference ? `<div><span>Referenz</span><b>${esc(doc.reference)}</b></div>` : ''}
          ${doc.paidAt ? `<div><span>Bezahlt am</span><b>${fmtDate(doc.paidAt)}</b></div>` : ''}
          ${doc.fromQuoteNumber ? `<div><span>Aus Angebot</span><b>${esc(doc.fromQuoteNumber)}</b></div>` : ''}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Pos.</th><th>Beschreibung</th><th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">USt</th><th class="num">Summe netto</th></tr></thead>
          <tbody>${doc.items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.text)}${it.articleId ? `<span class="sub">${esc((articleRaw(it.articleId) || {}).sku || '')}</span>` : ''}</td><td class="num">${fmtNum(it.qty)} ${esc(it.unit || '')}</td><td class="num">${money(it.price)}</td><td class="num">${num(it.tax)} %</td><td class="num">${money(num(it.qty) * num(it.price))}</td></tr>`).join('')}</tbody>
        </table></div>
        ${totalsHtml(t)}
        ${doc.notes ? `<div class="alert info">${esc(doc.notes)}</div>` : ''}`,
      extra: actions,
      onMount(f) {
        const on = (id, fn) => { const el = $(`#${id}`, f); if (el) el.addEventListener('click', fn); };
        on('dv-print', () => printDoc(doc));
        on('dv-remind', () => printDoc(doc, { reminder: true }));
        on('dv-copy', () => {
          const s = settings();
          const days = doc.kind === 'quote' ? num(s.quoteDays) || 30 : num(s.paymentDays) || 14;
          const saved = put('documents', { kind: doc.kind, status: 'draft', date: today(), dueDate: doc.kind === 'purchase' ? '' : addDays(today(), days), contactId: doc.contactId, contact: doc.contact, items: JSON.parse(JSON.stringify(doc.items)), notes: doc.notes, reference: '' });
          closeModal();
          render();
          openDoc(saved.id);
        });
        on('dv-convert', () => {
          const inv = convertQuote(doc);
          closeModal();
          render();
          toast(`Rechnungsentwurf aus ${doc.number} erstellt`, 'ok');
          openDoc(inv.id);
        });
        on('dv-linked', () => { closeModal(); openDoc(linked.id); });
        on('dv-reject', () => {
          if (!confirm(`${doc.number} als abgelehnt markieren?`)) return;
          put('documents', { ...doc, status: 'rejected', rejectedAt: today() });
          closeModal();
          render();
          toast(`${doc.number} als abgelehnt markiert`);
        });
        on('dv-cancel', () => {
          if (!confirm(`${doc.number} stornieren?${(doc.movementIds || []).length ? ' Lagerbewegungen werden zurückgebucht.' : ''}${doc.status === 'paid' ? ' Die Zahlungsbuchung wird entfernt.' : ''}`)) return;
          cancelDoc(doc);
          closeModal();
          render();
          toast(`${doc.number} storniert`, 'ok');
        });
        on('dv-paid', () => {
          openModal({
            title: `Zahlung erfassen · ${doc.number}`,
            body: `<p>Betrag: <b>${money(t.gross)}</b> – es wird automatisch eine ${doc.kind === 'sale' ? 'Einnahme' : 'Ausgabe'} im Kassenbuch erstellt.</p>
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

  function printDoc(doc, { reminder = false } = {}) {
    const s = settings();
    const t = calcTotals(doc.items);
    const c = doc.contact || {};
    const customer = doc.kind !== 'purchase';
    const title = reminder ? 'Zahlungserinnerung' : { sale: 'Rechnung', quote: 'Angebot', purchase: 'Einkaufsbeleg' }[doc.kind] || 'Beleg';
    const firm = s.name || companyName();
    const sender = [firm, s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    const dateLabel = { sale: 'Rechnungsdatum', quote: 'Angebotsdatum', purchase: 'Belegdatum' }[doc.kind];
    const meta = reminder
      ? [`Datum: ${fmtDate(today())}`, `Rechnung ${esc(doc.number)} vom ${fmtDate(doc.date)}`, `fällig seit ${fmtDate(doc.dueDate)}`]
      : [`${dateLabel}: ${fmtDate(doc.date)}`,
        doc.kind === 'sale' && doc.dueDate ? `Zahlbar bis: ${fmtDate(doc.dueDate)}` : '',
        doc.kind === 'quote' && doc.dueDate ? `Gültig bis: ${fmtDate(doc.dueDate)}` : '',
        doc.reference ? `${doc.kind === 'quote' ? 'Betreff' : 'Referenz'}: ${esc(doc.reference)}` : ''];
    if (c.number) meta.push(`Kunden-Nr.: ${esc(c.number)}`);
    if (c.vatId) meta.push(`USt-IdNr. Kunde: ${esc(c.vatId)}`);
    const reminderText = reminder ? `<p style="margin-top:18px">Sehr geehrte Damen und Herren,</p>
      <p>sicher ist es Ihrer Aufmerksamkeit entgangen: Unsere Rechnung <b>${esc(doc.number)}</b> vom ${fmtDate(doc.date)} über <b>${money(t.gross)}</b> war am ${fmtDate(doc.dueDate)} fällig.
      Bitte überweisen Sie den offenen Betrag bis zum <b>${fmtDate(addDays(today(), 7))}</b>. Sollten Sie bereits bezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.</p>` : '';
    const footerText = reminder ? '' : doc.kind === 'quote' ? (s.quoteFooter || 'Wir freuen uns auf Ihren Auftrag.') : doc.kind === 'sale' ? (s.invoiceFooter || '') : '';
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
          <div class="p-firm">${esc(firm)}</div>
          <div>${esc(s.street || '')}</div><div>${esc([s.zip, s.city].filter(Boolean).join(' '))}</div>
          ${s.phone ? `<div>Tel. ${esc(s.phone)}</div>` : ''}${s.email ? `<div>${esc(s.email)}</div>` : ''}${s.website ? `<div>${esc(s.website)}</div>` : ''}
        </div>
      </div>
      <h1>${title}${reminder ? '' : ` ${esc(doc.number)}`}</h1>
      <div class="p-meta">${meta.filter(Boolean).join(' · ')}</div>
      ${reminderText}
      <table><thead><tr><th>Pos.</th><th>Beschreibung</th><th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">USt</th><th class="num">Gesamt</th></tr></thead>
        <tbody>${doc.items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.text)}</td><td class="num">${fmtNum(it.qty)} ${esc(it.unit || '')}</td><td class="num">${money(it.price)}</td><td class="num">${num(it.tax)} %</td><td class="num">${money(num(it.qty) * num(it.price))}</td></tr>`).join('')}</tbody></table>
      ${totalsHtml(t)}
      ${s.smallBusiness && customer ? '<p style="margin-top:16px">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</p>' : ''}
      ${doc.notes && !reminder ? `<p style="margin-top:16px;white-space:pre-wrap">${esc(doc.notes)}</p>` : ''}
      ${footerText ? `<p style="margin-top:16px;white-space:pre-wrap">${esc(footerText)}</p>` : ''}
      <div class="p-foot">
        <div><b>${esc(firm)}</b><br>${esc(s.street || '')}<br>${esc([s.zip, s.city].filter(Boolean).join(' '))}</div>
        <div>${s.taxNumber ? `Steuernummer: ${esc(s.taxNumber)}<br>` : ''}${s.vatId ? `USt-IdNr.: ${esc(s.vatId)}<br>` : ''}${s.owner ? `Inhaber/GF: ${esc(s.owner)}` : ''}</div>
        <div>${s.bank ? `${esc(s.bank)}<br>` : ''}${s.iban ? `IBAN: ${esc(s.iban)}<br>` : ''}${s.bic ? `BIC: ${esc(s.bic)}` : ''}</div>
      </div>
    </div>`;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
  }

  // =============================================================== Ansicht: Zeiterfassung (Dienstleister & Freiberufler)
  const fmtHours = (min) => { const m = Math.max(0, Math.round(num(min))); return `${Math.floor(m / 60)}:${pad(m % 60)} h`; };
  const parseDuration = (s) => {
    const v = String(s || '').trim();
    if (/^\d+:\d{1,2}$/.test(v)) { const [h, m] = v.split(':').map(Number); return h * 60 + m; }
    return Math.round(num(v) * 60);
  };
  const timeValue = (t) => (t.billable === false ? 0 : r2((num(t.minutes) / 60) * num(t.rate)));
  const isBilled = (t) => !!t.billedDocId && !!get('documents', t.billedDocId);
  const unbilledTimes = () => all('times').filter((t) => t.billable !== false && !isBilled(t));
  const customers = () => all('contacts').filter((c) => c.type === 'customer' || c.type === 'both').sort(byName);
  const timerState = () => safeLS.get('nexcount:timer');

  function viewTime() {
    if (UI.q.tMonth === undefined) UI.q.tMonth = today().slice(0, 7);
    const allT = all('times');
    let list = allT.slice().sort(byDateDesc);
    if (UI.q.tMonth) list = list.filter((t) => String(t.date || '').startsWith(UI.q.tMonth));
    if (UI.q.tContact) list = list.filter((t) => t.contactId === UI.q.tContact);
    if (UI.q.tStatus === 'open') list = list.filter((t) => t.billable !== false && !isBilled(t));
    if (UI.q.tStatus === 'billed') list = list.filter(isBilled);
    const q = (UI.q.t || '').toLowerCase();
    if (q) list = list.filter((t) => [t.contactName, t.project, t.description].join(' ').toLowerCase().includes(q));
    const ub = unbilledTimes();
    const byC = {};
    for (const t of ub) if (t.contactId) (byC[t.contactId] = byC[t.contactId] || []).push(t);
    const timer = timerState();
    const minutes = sum(list, (t) => t.minutes);
    return `
      ${timer ? `<section class="timer-card">${icon('clock', 20)}<div><b>Timer läuft</b><span data-timer-since="${timer.start}">${fmtHours((Date.now() - timer.start) / 60000)}</span></div><button class="btn primary" data-action="timer-stop">${icon('stop', 16)} Stoppen & erfassen</button></section>` : ''}
      <div class="kpis">
        ${kpi('Erfasst', fmtHours(minutes), '', UI.q.tMonth ? monthLabel(UI.q.tMonth) : 'gesamt', 'clock')}
        ${kpi('Abrechenbar', money(sum(list.filter((t) => t.billable !== false), timeValue)), '', `${fmtHours(sum(list.filter((t) => t.billable !== false), (t) => t.minutes))} im Zeitraum`, 'wallet')}
        ${kpi('Noch nicht abgerechnet', money(sum(ub, timeValue)), ub.length ? 'neg' : 'pos', `${fmtHours(sum(ub, (t) => t.minutes))} insgesamt`, 'file')}
        ${kpi('Ø Stundensatz', money(minutes ? sum(list, (t) => (num(t.minutes) / 60) * num(t.rate)) / (minutes / 60) : 0), '', 'im Zeitraum', 'trendUp')}
      </div>
      ${Object.keys(byC).length ? `<section class="card"><div class="card-head"><h3>Bereit zur Abrechnung</h3><span class="muted">je Kunde, alle Zeiträume</span></div>
        <div class="bill-grid">${Object.entries(byC).map(([cid, ts]) => `<div class="bill-item"><div><b>${esc(ts[0].contactName || '—')}</b><span class="muted small">${ts.length} Einträge · ${fmtHours(sum(ts, (t) => t.minutes))}</span></div><b class="num">${money(sum(ts, timeValue))}</b><button class="btn sm primary" data-action="bill-times" data-id="${cid}">${icon('file', 14)} Abrechnen</button></div>`).join('')}</div></section>` : ''}
      <div class="toolbar">
        ${searchBox('t', 'Kunde, Projekt, Tätigkeit …')}
        <input type="month" id="s-tMonth" data-ui="tMonth" value="${esc(UI.q.tMonth)}" title="Monat (leeren für alle)">
        <select id="s-tContact" data-ui="tContact"><option value="">Alle Kunden</option>${customers().map((c) => `<option value="${c.id}" ${UI.q.tContact === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        ${uiSelect('tStatus', [['', 'Alle'], ['open', 'Nicht abgerechnet'], ['billed', 'Abgerechnet']])}
        <div class="actions">
          ${timer ? '' : `<button class="btn" data-action="timer-start">${icon('play', 16)} Timer</button>`}
          <button class="btn primary" data-action="new-time">${icon('plus', 16)} Zeit erfassen</button>
        </div>
      </div>
      <section class="card flush">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Datum</th><th>Kunde</th><th>Projekt / Tätigkeit</th><th class="num">Dauer</th><th class="num">Satz</th><th class="num">Betrag</th><th>Status</th></tr></thead>
          <tbody>${list.map((t) => {
            const billedDoc = isBilled(t) ? get('documents', t.billedDocId) : null;
            return `<tr class="clickable" data-action="edit-time" data-id="${t.id}">
              <td>${fmtDate(t.date)}</td><td>${esc(t.contactName || '—')}</td>
              <td>${t.project ? `<b>${esc(t.project)}</b>` : ''}<span class="${t.project ? 'sub' : ''}">${esc(t.description || '')}</span></td>
              <td class="num"><b>${fmtHours(t.minutes)}</b></td><td class="num muted">${t.billable === false ? '—' : money(t.rate)}</td>
              <td class="num">${t.billable === false ? '—' : money(timeValue(t))}</td>
              <td>${t.billable === false ? '<span class="badge">intern</span>' : billedDoc ? `<span class="badge paid">${esc(billedDoc.number || 'Entwurf')}</span>` : '<span class="badge open">offen</span>'}</td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="3">${list.length} Einträge</td><td class="num">${fmtHours(minutes)}</td><td></td><td class="num">${money(sum(list, timeValue))}</td><td></td></tr></tfoot>
        </table></div>`
        : empty('clock', allT.length ? 'Keine Zeiten für diesen Filter.' : 'Noch keine Zeiten erfasst. Starte den Timer oder trage Zeiten nachträglich ein.',
          allT.length ? '' : `<div class="toolbar"><button class="btn" data-action="timer-start">${icon('play', 16)} Timer starten</button><button class="btn primary" data-action="new-time">${icon('plus', 16)} Zeit erfassen</button></div>`)}
      </section>`;
  }

  function openTime(id, preset = {}) {
    const t = id ? get('times', id) : null;
    const billed = t && isBilled(t);
    const d = t || { date: today(), rate: settings().hourlyRate || '', billable: true, ...preset };
    const projects = [...new Set(all('times').map((x) => x.project).filter(Boolean))];
    const cs = customers();
    openModal({
      title: t ? 'Zeiteintrag' : 'Zeit erfassen',
      body: `${billed ? `<div class="alert info">Bereits abgerechnet mit ${esc(get('documents', t.billedDocId).number || 'Rechnungsentwurf')}. Änderungen wirken sich nicht auf die Rechnung aus.</div>` : ''}
        <div class="grid2">
          ${field('Datum', inp('date', d.date, 'type="date" required'))}
          ${field('Dauer', inp('duration', d.minutes ? fmtHours(d.minutes).replace(' h', '') : (preset.duration || ''), 'required placeholder="1:30 oder 1,5" inputmode="decimal"'))}
          ${field('Kunde', `<select name="contactId"><option value="">— ohne Kunde —</option>${cs.map((c) => `<option value="${c.id}" ${c.id === d.contactId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
          ${field('Projekt', inp('project', d.project, 'list="dl-proj" maxlength="80" placeholder="optional"'))}
          ${field('Tätigkeit', inp('description', d.description, 'required maxlength="200" placeholder="z. B. Konzept, Beratung, Montage"'), 'span2')}
          ${field('Stundensatz netto (€)', numInp('rate', d.rate, 'min="0"'))}
          <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="billable" ${d.billable !== false ? 'checked' : ''}> Abrechenbar</label>
        </div>${datalist('dl-proj', projects)}
        ${!cs.length ? '<p class="muted small">Tipp: Lege Kunden unter „Kunden & Lieferanten“ an, um Zeiten direkt abzurechnen.</p>' : ''}`,
      extra: t && !billed ? '<button type="button" class="btn danger" id="time-del">Löschen</button>' : '',
      onMount(f) {
        const b = $('#time-del', f);
        if (b) b.addEventListener('click', () => { if (!confirm('Zeiteintrag löschen?')) return; del('times', t.id); closeModal(); render(); toast('Gelöscht'); });
      },
      onSubmit(fd) {
        const minutes = parseDuration(fd.duration);
        if (minutes <= 0) throw new Error('Bitte eine Dauer angeben, z. B. 1:30 oder 1,5.');
        const c = get('contacts', fd.contactId);
        put('times', { ...(t || {}), date: fd.date, minutes, contactId: fd.contactId || '', contactName: c ? c.name : '', project: fd.project.trim(), description: fd.description.trim(), rate: num(fd.rate), billable: fd.billable === 'on' });
        toast(`${fmtHours(minutes)} erfasst`, 'ok');
      },
    });
  }

  // Alle offenen, abrechenbaren Zeiten eines Kunden → Rechnungsentwurf
  function billTimes(contactId) {
    const list = unbilledTimes().filter((t) => t.contactId === contactId).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!list.length) return toast('Keine offenen Zeiten für diesen Kunden.');
    const c = get('contacts', contactId) || {};
    const s = settings();
    if (!confirm(`${list.length} Zeiteinträge (${fmtHours(sum(list, (t) => t.minutes))}, ${money(sum(list, timeValue))} netto) für ${c.name || 'den Kunden'} in einen Rechnungsentwurf übernehmen?`)) return;
    const inv = put('documents', {
      kind: 'sale', status: 'draft', date: today(), dueDate: addDays(today(), num(s.paymentDays) || 14),
      contactId, contact: { name: c.name, contactPerson: c.contactPerson, street: c.street, zip: c.zip, city: c.city, country: c.country, vatId: c.vatId, number: c.number },
      items: list.map((t) => ({ articleId: '', text: `${fmtDate(t.date)} – ${t.project ? `${t.project}: ` : ''}${t.description}`, qty: r2(num(t.minutes) / 60), price: num(t.rate), tax: s.smallBusiness ? 0 : 19, unit: 'Std' })),
      notes: '', reference: '',
    });
    for (const t of list) put('times', { ...t, billedDocId: inv.id });
    render();
    toast('Rechnungsentwurf erstellt', 'ok');
    openDoc(inv.id);
  }

  // =============================================================== Ansicht: Verein – Mitglieder
  const members = () => all('contacts').filter((c) => c.type === 'member').sort(byName);
  const yearlyFee = (m) => num(m.fee) * ((INTERVALS[m.feeInterval] || INTERVALS.year)[1]);

  function viewMembers() {
    const all_ = members();
    let list = all_;
    const stat = UI.q.mStatus ?? 'current';
    if (stat === 'current') list = list.filter((m) => m.status !== 'left');
    else if (stat) list = list.filter((m) => m.status === stat);
    if (UI.q.mGroup) list = list.filter((m) => m.feeGroup === UI.q.mGroup);
    const q = (UI.q.m || '').toLowerCase();
    if (q) list = list.filter((m) => [m.name, m.number, m.email, m.city, m.feeGroup].join(' ').toLowerCase().includes(q));
    const groups = [...new Set(all_.map((m) => m.feeGroup).filter(Boolean))].sort();
    const year = today().slice(0, 4);
    const openByMember = {};
    for (const d of all('dues')) if (d.status === 'open') openByMember[d.memberId] = (openByMember[d.memberId] || 0) + num(d.amount);
    const current = all_.filter((m) => m.status !== 'left');
    return `
      <div class="kpis">
        ${kpi('Mitglieder', fmtNum(current.length), '', `${all_.filter((m) => m.status === 'active').length} aktiv · ${all_.filter((m) => m.status === 'passive').length} passiv`, 'heart')}
        ${kpi(`Eintritte ${year}`, fmtNum(all_.filter((m) => String(m.joinedAt || '').startsWith(year)).length), 'pos', `${all_.filter((m) => String(m.leftAt || '').startsWith(year)).length} Austritte`, 'trendUp')}
        ${kpi('Beitragssoll pro Jahr', money(sum(current, yearlyFee)), '', 'aktive und passive Mitglieder', 'repeat')}
        ${kpi('Offene Beiträge', money(sum(Object.values(openByMember), (v) => v)), Object.keys(openByMember).length ? 'neg' : '', `${Object.keys(openByMember).length} Mitglieder`, 'alert')}
      </div>
      <div class="toolbar">
        ${searchBox('m', 'Name, Nr., E-Mail, Ort …')}
        ${uiSelect('mStatus', [['current', 'Aktuelle Mitglieder'], ['active', 'Nur aktive'], ['passive', 'Nur passive'], ['left', 'Ausgetretene'], ['', 'Alle']])}
        ${groups.length ? uiSelect('mGroup', [['', 'Alle Beitragsgruppen'], ...groups.map((g) => [g, g])]) : ''}
        <div class="actions">
          <button class="btn" data-action="export" data-what="members">${icon('download', 16)} Liste</button>
          <button class="btn primary" data-action="new-member">${icon('plus', 16)} Mitglied</button>
        </div>
      </div>
      <section class="card flush">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nr.</th><th>Name</th><th>Status</th><th>Eintritt</th><th>Beitrag</th><th>Kontakt</th><th class="num">Offen</th></tr></thead>
          <tbody>${list.map((m) => `<tr class="clickable" data-action="edit-member" data-id="${m.id}">
            <td class="muted">${esc(m.number || '')}</td>
            <td><b>${esc(m.name)}</b>${m.feeGroup ? `<span class="sub">${esc(m.feeGroup)}</span>` : ''}</td>
            <td><span class="badge ${m.status === 'active' ? 'paid' : m.status === 'left' ? 'cancelled' : 'info'}">${MEMBER_STATUS[m.status] || '—'}</span></td>
            <td>${fmtDate(m.joinedAt)}</td>
            <td>${num(m.fee) ? `${money(m.fee)} <span class="muted small">${(INTERVALS[m.feeInterval] || INTERVALS.year)[0]}</span>` : '<span class="muted">beitragsfrei</span>'}</td>
            <td>${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : esc(m.phone || '')}</td>
            <td class="num ${openByMember[m.id] ? 'neg' : 'muted'}">${openByMember[m.id] ? money(openByMember[m.id]) : '—'}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="7">${list.length} Mitglieder · Beitragssoll ${money(sum(list.filter((m) => m.status !== 'left'), yearlyFee))} pro Jahr</td></tr></tfoot>
        </table></div>`
        : empty('heart', all_.length ? 'Keine Mitglieder für diesen Filter.' : 'Noch keine Mitglieder erfasst.', all_.length ? '' : `<button class="btn primary" data-action="new-member">${icon('plus', 16)} Erstes Mitglied anlegen</button>`)}
      </section>`;
  }

  function openMember(id) {
    const m = id ? get('contacts', id) : null;
    const d = m || { status: 'active', joinedAt: today(), feeInterval: 'year', fee: '', country: 'Deutschland' };
    const groups = [...new Set(members().map((x) => x.feeGroup).filter(Boolean)), 'Erwachsene', 'Jugendliche', 'Familie', 'Fördermitglied', 'Ehrenmitglied'];
    openModal({
      title: m ? m.name : 'Neues Mitglied',
      wide: true,
      body: `<div class="grid3">
          ${field('Name (Nachname, Vorname)', inp('name', d.name, 'required maxlength="160"'), 'span2')}
          ${field('Mitgliedsnummer', inp('number', d.number || '', 'maxlength="30" placeholder="automatisch"'))}
          ${field('Status', selectEl('status', Object.entries(MEMBER_STATUS), d.status))}
          ${field('Eintritt', inp('joinedAt', d.joinedAt, 'type="date"'))}
          ${field('Austritt', inp('leftAt', d.leftAt, 'type="date"'))}
          ${field('Geburtsdatum', inp('birthday', d.birthday, 'type="date"'))}
          ${field('E-Mail', inp('email', d.email, 'type="email" maxlength="120"'))}
          ${field('Telefon', inp('phone', d.phone, 'type="tel" maxlength="40"'))}
          ${field('Straße & Hausnr.', inp('street', d.street, 'maxlength="120"'), 'span2')}
          ${field('PLZ', inp('zip', d.zip, 'maxlength="12"'))}
          ${field('Ort', inp('city', d.city, 'maxlength="80"'), 'span2')}
        </div>
        <div class="form-section">${icon('repeat', 14)} Beitrag & Bankverbindung</div>
        <div class="grid3">
          ${field('Beitragsgruppe', inp('feeGroup', d.feeGroup, 'list="dl-groups" maxlength="40"'))}
          ${field('Beitrag (€)', numInp('fee', d.fee, 'min="0"'))}
          ${field('Zahlweise', selectEl('feeInterval', Object.entries(INTERVALS).map(([k, v]) => [k, v[0]]), d.feeInterval || 'year'))}
          ${field('IBAN', inp('iban', d.iban, 'maxlength="40"'))}
          ${field('SEPA-Mandatsreferenz', inp('mandateRef', d.mandateRef, 'maxlength="40"'))}
          ${field('Mandat erteilt am', inp('mandateDate', d.mandateDate, 'type="date"'))}
          ${field('Notizen', textarea('notes', d.notes, 'maxlength="2000" rows="2"'), 'span3')}
        </div>${datalist('dl-groups', groups)}`,
      extra: m ? '<button type="button" class="btn danger" id="m-del">Löschen</button>' : '',
      onMount(f) {
        const b = $('#m-del', f);
        if (b) b.addEventListener('click', () => {
          if (!confirm(`${m.name} endgültig löschen? Tipp: Für ehemalige Mitglieder besser den Status „Ausgetreten“ setzen.`)) return;
          del('contacts', m.id); closeModal(); render(); toast('Mitglied gelöscht');
        });
        const st = $('[name=status]', f);
        const left = $('[name=leftAt]', f);
        st.addEventListener('change', () => { if (st.value === 'left' && !left.value) left.value = today(); });
      },
      onSubmit(fd) {
        const data = { ...(m || {}), type: 'member' };
        for (const k of ['name', 'number', 'status', 'joinedAt', 'leftAt', 'birthday', 'email', 'phone', 'street', 'zip', 'city', 'feeGroup', 'feeInterval', 'iban', 'mandateRef', 'mandateDate', 'notes']) data[k] = String(fd[k] || '').trim();
        data.fee = num(fd.fee);
        if (!data.number) data.number = nextCode('contacts', 'M', 'number');
        put('contacts', data);
        toast(m ? 'Gespeichert' : 'Mitglied angelegt', 'ok');
      },
    });
  }

  // =============================================================== Ansicht: Verein – Beiträge
  function periodsFor(year, interval) {
    const y = String(year);
    if (interval === 'month') return Array.from({ length: 12 }, (_, i) => [`${y}-${pad(i + 1)}`, new Date(Number(y), i, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), `${y}-${pad(i + 1)}-01`, `${y}-${pad(i + 1)}-${pad(new Date(Number(y), i + 1, 0).getDate())}`]);
    if (interval === 'quarter') return [1, 2, 3, 4].map((q) => [`${y}-Q${q}`, `${q}. Quartal ${y}`, `${y}-${pad((q - 1) * 3 + 1)}-01`, `${y}-${pad(q * 3)}-${pad(new Date(Number(y), q * 3, 0).getDate())}`]);
    if (interval === 'half') return [[`${y}-H1`, `1. Halbjahr ${y}`, `${y}-01-01`, `${y}-06-30`], [`${y}-H2`, `2. Halbjahr ${y}`, `${y}-07-01`, `${y}-12-31`]];
    return [[y, `Jahresbeitrag ${y}`, `${y}-01-01`, `${y}-12-31`]];
  }
  // Beiträge, die ein Beitragslauf erzeugen würde (ohne bereits vorhandene)
  function duesPreview(year, dueDay) {
    const existing = new Set(all('dues').map((d) => `${d.memberId}|${d.period}`));
    const out = [];
    for (const m of members()) {
      if (m.status === 'left' && !m.leftAt) continue;
      if (!num(m.fee)) continue;
      for (const [period, label, start, end] of periodsFor(year, m.feeInterval || 'year')) {
        if (existing.has(`${m.id}|${period}`)) continue;
        if (m.joinedAt && m.joinedAt > end) continue;
        if (m.leftAt && m.leftAt < start) continue;
        out.push({ memberId: m.id, memberName: m.name, memberNo: m.number, period, periodLabel: label, amount: num(m.fee), status: 'open', dueDate: addDays(start, Math.max(0, num(dueDay) - 1)) });
      }
    }
    return out;
  }

  function viewDues() {
    const all_ = all('dues');
    const years = [...new Set([today().slice(0, 4), ...all_.map((d) => String(d.period).slice(0, 4))])].sort().reverse();
    if (!UI.q.dYear) UI.q.dYear = today().slice(0, 4);
    let list = all_.filter((d) => String(d.period).startsWith(UI.q.dYear));
    const yearList = list;
    if (UI.q.dStatus === 'late') list = list.filter((d) => d.status === 'open' && d.dueDate < today());
    else if (UI.q.dStatus) list = list.filter((d) => d.status === UI.q.dStatus);
    const q = (UI.q.d || '').toLowerCase();
    if (q) list = list.filter((d) => [d.memberName, d.memberNo, d.periodLabel].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || String(a.memberName).localeCompare(String(b.memberName), 'de'));
    const soll = sum(yearList.filter((d) => d.status !== 'waived'), (d) => d.amount);
    const paid = sum(yearList.filter((d) => d.status === 'paid'), (d) => d.amount);
    const openL = list.filter((d) => d.status === 'open');
    return `
      <div class="kpis">
        ${kpi(`Beitragssoll ${UI.q.dYear}`, money(soll), '', `${yearList.length} Beiträge`, 'repeat')}
        ${kpi('Bezahlt', money(paid), 'pos', soll ? `${Math.round((paid / soll) * 100)} % eingegangen` : '—', 'check')}
        ${kpi('Offen', money(soll - paid), soll - paid > 0 ? 'neg' : '', `${yearList.filter((d) => d.status === 'open').length} offen · ${yearList.filter((d) => d.status === 'open' && d.dueDate < today()).length} überfällig`, 'alert')}
      </div>
      <div class="toolbar">
        ${searchBox('d', 'Mitglied, Nr., Zeitraum …')}
        ${uiSelect('dYear', years.map((y) => [y, y]))}
        ${uiSelect('dStatus', [['', 'Alle Status'], ['open', 'Offen'], ['late', 'Überfällig'], ['paid', 'Bezahlt'], ['waived', 'Erlassen']])}
        <div class="actions">
          ${openL.length ? `<button class="btn" data-action="dues-pay-all">${icon('check', 16)} ${openL.length} als bezahlt</button>` : ''}
          <button class="btn primary" data-action="dues-run">${icon('repeat', 16)} Beitragslauf</button>
        </div>
      </div>
      <section class="card flush">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Mitglied</th><th>Zeitraum</th><th>Fällig</th><th class="num">Betrag</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.map((d) => {
            const late = d.status === 'open' && d.dueDate < today();
            return `<tr><td><b>${esc(d.memberName)}</b><span class="sub">${esc(d.memberNo || '')}</span></td><td>${esc(d.periodLabel)}</td><td>${fmtDate(d.dueDate)}</td>
              <td class="num"><b>${money(d.amount)}</b></td>
              <td>${d.status === 'paid' ? `<span class="badge paid">bezahlt ${fmtDate(d.paidAt)}</span>` : d.status === 'waived' ? '<span class="badge cancelled">erlassen</span>' : late ? '<span class="badge overdue">überfällig</span>' : '<span class="badge open">offen</span>'}</td>
              <td class="actions">${d.status === 'open' ? `<button class="btn sm" data-action="due-paid" data-id="${d.id}">${icon('check', 14)} Bezahlt</button> <button class="btn sm ghost" data-action="due-waive" data-id="${d.id}" title="Beitrag erlassen">${icon('x', 14)}</button>`
                : `<button class="btn sm ghost" data-action="due-reopen" data-id="${d.id}" title="Zurück auf offen">${icon('undo', 14)}</button>`}</td></tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="3">${list.length} Beiträge</td><td class="num">${money(sum(list, (d) => d.amount))}</td><td colspan="2"></td></tr></tfoot>
        </table></div>`
        : empty('repeat', all_.length ? 'Keine Beiträge für diesen Filter.' : members().length ? 'Noch keine Beiträge. Starte einen Beitragslauf – NEXCOUNT erzeugt die Beiträge je Mitglied nach Betrag und Zahlweise.' : 'Lege zuerst Mitglieder mit Beitrag an.',
          all_.length ? '' : members().length ? `<button class="btn primary" data-action="dues-run">${icon('repeat', 16)} Beitragslauf starten</button>` : `<a class="btn primary" href="#/members">Zu den Mitgliedern</a>`)}
      </section>`;
  }

  function openDuesRun() {
    if (!members().some((m) => num(m.fee) > 0)) return toast('Keine Mitglieder mit Beitrag vorhanden.', 'error');
    const y = Number(today().slice(0, 4));
    openModal({
      title: 'Beitragslauf',
      body: `<p class="muted">Erzeugt für jedes Mitglied die Beiträge des Jahres nach Betrag und Zahlweise. Bereits vorhandene Beiträge werden übersprungen, Ein- und Austrittsdaten berücksichtigt.</p>
        <div class="grid2">${field('Jahr', selectEl('year', [y - 1, y, y + 1].map((v) => [v, v]), y))}${field('Fällig am … Tag des Zeitraums', numInp('day', 15, 'min="1" max="28"'))}</div>
        <div class="summary-box" id="run-preview"></div>`,
      submit: 'Beiträge erzeugen',
      onMount(f) {
        const upd = () => {
          const p = duesPreview($('[name=year]', f).value, $('[name=day]', f).value);
          $('#run-preview', f).innerHTML = p.length ? `<b>${p.length} Beiträge · ${money(sum(p, (d) => d.amount))}</b><span class="muted small">${[...new Set(p.map((d) => d.memberName))].length} Mitglieder · erster fällig ${fmtDate(p.map((d) => d.dueDate).sort()[0])}</span>` : '<b>Nichts zu tun</b><span class="muted small">Für dieses Jahr sind alle Beiträge bereits erzeugt.</span>';
        };
        f.addEventListener('input', upd);
        upd();
      },
      onSubmit(fd) {
        const p = duesPreview(fd.year, fd.day);
        if (!p.length) { toast('Keine neuen Beiträge.'); return; }
        for (const d of p) put('dues', d);
        UI.q.dYear = String(fd.year);
        toast(`${p.length} Beiträge erzeugt`, 'ok');
      },
    });
  }

  function markDuePaid(due, date, method) {
    const entry = put('entries', {
      date, kind: 'income', category: 'Mitgliedsbeiträge', sphere: 'ideell',
      description: `Beitrag ${due.periodLabel} · ${due.memberName}`, net: r2(due.amount), tax: 0, gross: r2(due.amount), rate: 0,
      method, ref: due.memberNo || '', dueId: due.id,
    });
    put('dues', { ...due, status: 'paid', paidAt: date, method, entryId: entry.id });
  }
  function openDuePaid(ids) {
    const list = ids.map((id) => get('dues', id)).filter((d) => d && d.status === 'open');
    if (!list.length) return;
    openModal({
      title: list.length === 1 ? `Beitrag bezahlt · ${list[0].memberName}` : `${list.length} Beiträge als bezahlt buchen`,
      body: `<p>${list.length === 1 ? `${esc(list[0].periodLabel)}: <b>${money(list[0].amount)}</b>` : `Summe: <b>${money(sum(list, (d) => d.amount))}</b>`} – wird als Einnahme „Mitgliedsbeiträge“ (ideeller Bereich) ins Kassenbuch gebucht.</p>
        <div class="grid2">${field('Zahlungsdatum', inp('date', today(), 'type="date" required'))}${field('Zahlungsart', selectEl('method', [['Lastschrift', 'Lastschrift'], ...METHODS.map((m) => [m, m])], 'Lastschrift'))}</div>`,
      submit: 'Buchen',
      onSubmit(fd) {
        for (const d of list) markDuePaid(d, fd.date, fd.method);
        toast(list.length === 1 ? 'Beitrag gebucht' : `${list.length} Beiträge gebucht`, 'ok');
      },
    });
  }

  // =============================================================== Ansicht: Verein – Spenden & Zuwendungsbestätigungen
  const DON_KINDS = { money: 'Geldspende', goods: 'Sachspende' };
  function viewDonations() {
    const all_ = all('donations');
    const years = [...new Set([today().slice(0, 4), ...all_.map((d) => String(d.date).slice(0, 4))])].sort().reverse();
    if (!UI.q.donYear) UI.q.donYear = today().slice(0, 4);
    let list = all_.filter((d) => String(d.date).startsWith(UI.q.donYear)).sort(byDateDesc);
    const yearList = list;
    if (UI.q.donStatus === 'noreceipt') list = list.filter((d) => !d.receiptNo);
    const q = (UI.q.don || '').toLowerCase();
    if (q) list = list.filter((d) => [d.donorName, d.receiptNo, d.note, d.goodsDesc].join(' ').toLowerCase().includes(q));
    const missing = !settings().taxOffice || !settings().exemptionDate || !settings().purposes;
    return `
      ${missing && settings().nonProfit !== false ? `<div class="hint-bar warn">${icon('alert', 16)}<span>Für Zuwendungsbestätigungen fehlen Angaben zum Freistellungsbescheid (Finanzamt, Datum, Zwecke).</span><a class="btn sm ghost" href="#/settings" data-action="set-ui" data-k="setTab" data-v="org">Ergänzen</a></div>` : ''}
      <div class="kpis">
        ${kpi(`Spenden ${UI.q.donYear}`, money(sum(yearList, (d) => d.amount)), 'pos', `${yearList.length} Spenden`, 'gift')}
        ${kpi('Spender', fmtNum(new Set(yearList.map((d) => d.donorId || d.donorName)).size), '', 'im Jahr', 'users')}
        ${kpi('Sachspenden', money(sum(yearList.filter((d) => d.kind === 'goods'), (d) => d.amount)), '', `${yearList.filter((d) => d.kind === 'goods').length} Stück`, 'gift')}
        ${kpi('Ohne Bestätigung', fmtNum(yearList.filter((d) => !d.receiptNo && d.amount > 0).length), yearList.some((d) => !d.receiptNo) ? 'neg' : 'pos', 'Zuwendungsbestätigung offen', 'receipt')}
      </div>
      <div class="toolbar">
        ${searchBox('don', 'Spender, Bestätigungs-Nr. …')}
        ${uiSelect('donYear', years.map((y) => [y, y]))}
        ${uiSelect('donStatus', [['', 'Alle'], ['noreceipt', 'Ohne Bestätigung']])}
        <div class="actions"><button class="btn primary" data-action="new-donation">${icon('plus', 16)} Spende</button></div>
      </div>
      <section class="card flush">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Datum</th><th>Spender</th><th>Art</th><th class="num">Betrag</th><th>Bestätigung</th><th></th></tr></thead>
          <tbody>${list.map((d) => `<tr class="clickable" data-action="edit-donation" data-id="${d.id}">
            <td>${fmtDate(d.date)}</td><td><b>${esc(d.donorName || 'Anonym')}</b>${d.donorCity ? `<span class="sub">${esc(d.donorCity)}</span>` : ''}</td>
            <td><span class="badge ${d.kind === 'goods' ? 'warn' : 'paid'}">${DON_KINDS[d.kind] || 'Geldspende'}</span>${d.waiver ? ' <span class="badge">Aufwandsspende</span>' : ''}</td>
            <td class="num"><b>${money(d.amount)}</b></td>
            <td>${d.receiptNo ? `${esc(d.receiptNo)} <span class="muted small">${fmtDate(d.receiptDate)}</span>` : '<span class="muted">—</span>'}</td>
            <td class="actions"><button class="btn sm" data-action="print-receipt" data-id="${d.id}">${icon('print', 14)} Bestätigung</button></td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3">${list.length} Spenden</td><td class="num">${money(sum(list, (d) => d.amount))}</td><td colspan="2"></td></tr></tfoot>
        </table></div>`
        : empty('gift', all_.length ? 'Keine Spenden für diesen Filter.' : 'Noch keine Spenden erfasst.', all_.length ? '' : `<button class="btn primary" data-action="new-donation">${icon('plus', 16)} Erste Spende erfassen</button>`)}
      </section>`;
  }

  function openDonation(id) {
    const d0 = id ? get('donations', id) : null;
    const d = d0 || { date: today(), kind: 'money', method: 'Bank' };
    const donors = [...members().filter((m) => m.status !== 'left'), ...all('contacts').filter((c) => c.type !== 'member').sort(byName)];
    openModal({
      title: d0 ? `Spende · ${d0.donorName || 'Anonym'}` : 'Neue Spende',
      body: `${d0 && d0.receiptNo ? `<div class="alert info">Zuwendungsbestätigung ${esc(d0.receiptNo)} wurde am ${fmtDate(d0.receiptDate)} erstellt. Änderungen erfordern ggf. eine neue Bestätigung.</div>` : ''}
        <div class="grid2">
          ${field('Spender aus Mitgliedern / Kontakten', `<select name="donorId"><option value="">— neuer Spender / freie Eingabe —</option>${donors.map((c) => `<option value="${c.id}" ${c.id === d.donorId ? 'selected' : ''}>${esc(c.name)}${c.type === 'member' ? ' (Mitglied)' : ''}</option>`).join('')}</select>`, 'span2')}
          ${field('Name des Spenders', inp('donorName', d.donorName, 'required maxlength="160"'), 'span2')}
          ${field('Straße & Hausnr.', inp('donorStreet', d.donorStreet, 'maxlength="120"'), 'span2')}
          ${field('PLZ', inp('donorZip', d.donorZip, 'maxlength="12"'))}
          ${field('Ort', inp('donorCity', d.donorCity, 'maxlength="80"'))}
          ${field('Datum der Zuwendung', inp('date', d.date, 'type="date" required'))}
          ${field('Art', selectEl('kind', Object.entries(DON_KINDS), d.kind))}
          ${field('Betrag / Wert (€)', numInp('amount', d.amount ?? '', 'required min="0.01"'))}
          ${field('Eingang über', selectEl('method', METHODS.map((m) => [m, m]), d.method || 'Bank'), 'only-money')}
          ${field('Beschreibung der Sachspende', inp('goodsDesc', d.goodsDesc, 'maxlength="200" placeholder="z. B. 10 Trainingsbälle, neuwertig"'), 'span2 only-goods')}
          ${field('Grundlage der Wertermittlung', inp('goodsBasis', d.goodsBasis, 'maxlength="200" placeholder="z. B. Rechnung vom …"'), 'span2 only-goods')}
          <label class="check span2 only-money"><input type="checkbox" name="waiver" ${d.waiver ? 'checked' : ''}> Verzicht auf Erstattung von Aufwendungen (Aufwandsspende)</label>
          ${field('Notiz (intern)', inp('note', d.note, 'maxlength="200"'), 'span2')}
        </div>`,
      extra: d0 ? `<button type="button" class="btn danger" id="don-del">Löschen</button><button type="button" class="btn" id="don-print">${icon('print', 16)} Zuwendungsbestätigung</button>` : '',
      onMount(f) {
        const kindSel = $('[name=kind]', f);
        const syncKind = () => {
          const goods = kindSel.value === 'goods';
          $$('.only-goods', f).forEach((el) => el.classList.toggle('hidden', !goods));
          $$('.only-money', f).forEach((el) => el.classList.toggle('hidden', goods));
        };
        kindSel.addEventListener('change', syncKind);
        syncKind();
        $('[name=donorId]', f).addEventListener('change', (e) => {
          const c = get('contacts', e.target.value);
          if (!c) return;
          $('[name=donorName]', f).value = c.name || '';
          $('[name=donorStreet]', f).value = c.street || '';
          $('[name=donorZip]', f).value = c.zip || '';
          $('[name=donorCity]', f).value = c.city || '';
        });
        const delBtn = $('#don-del', f);
        if (delBtn) delBtn.addEventListener('click', () => {
          if (!confirm('Spende löschen? Die zugehörige Buchung im Kassenbuch wird ebenfalls entfernt.')) return;
          if (d0.entryId && get('entries', d0.entryId)) del('entries', d0.entryId);
          del('donations', d0.id); closeModal(); render(); toast('Spende gelöscht');
        });
        const pr = $('#don-print', f);
        if (pr) pr.addEventListener('click', () => printDonationReceipt(get('donations', d0.id)));
      },
      onSubmit(fd) {
        const amount = num(fd.amount);
        if (amount <= 0) throw new Error('Bitte einen Betrag angeben.');
        const goods = fd.kind === 'goods';
        const data = {
          ...(d0 || {}), donorId: fd.donorId || '', donorName: fd.donorName.trim(), donorStreet: fd.donorStreet.trim(), donorZip: fd.donorZip.trim(), donorCity: fd.donorCity.trim(),
          date: fd.date, kind: goods ? 'goods' : 'money', amount: r2(amount), method: goods ? '' : fd.method,
          goodsDesc: goods ? fd.goodsDesc.trim() : '', goodsBasis: goods ? fd.goodsBasis.trim() : '', waiver: !goods && fd.waiver === 'on', note: fd.note.trim(),
        };
        const saved = put('donations', data);
        // Geldspenden landen im Kassenbuch (Sachspenden sind kein Zahlungseingang)
        if (!goods) {
          const old = data.entryId ? get('entries', data.entryId) : null;
          const entry = put('entries', { ...(old || {}), date: data.date, kind: 'income', category: 'Spenden', sphere: 'ideell', description: `Spende · ${data.donorName || 'Anonym'}`, net: data.amount, tax: 0, gross: data.amount, rate: 0, method: data.method, ref: data.receiptNo || '', donationId: saved.id });
          if (data.entryId !== entry.id) put('donations', { ...saved, entryId: entry.id });
        } else if (data.entryId && get('entries', data.entryId)) {
          del('entries', data.entryId);
          put('donations', { ...saved, entryId: null });
        }
        toast(d0 ? 'Spende gespeichert' : 'Spende erfasst', 'ok');
      },
    });
  }

  // Betrag in Worten (für Zuwendungsbestätigungen)
  function inWords(value) {
    const ones = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
    const tens = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
    const lead = (n) => (n === 1 ? 'ein' : words(n));
    function words(n) {
      if (n < 20) return ones[n];
      if (n < 100) { const u = n % 10; return (u ? `${u === 1 ? 'ein' : ones[u]}und` : '') + tens[Math.floor(n / 10)]; }
      if (n < 1000) { const r = n % 100; return `${lead(Math.floor(n / 100))}hundert${r ? words(r) : ''}`; }
      if (n < 1e6) { const r = n % 1000; return `${lead(Math.floor(n / 1000))}tausend${r ? words(r) : ''}`; }
      const mio = Math.floor(n / 1e6); const r = n % 1e6;
      return `${mio === 1 ? 'eine Million' : `${words(mio)} Millionen`}${r ? ` ${words(r)}` : ''}`;
    }
    const euros = Math.floor(r2(value));
    const cents = Math.round((r2(value) - euros) * 100);
    return `${words(euros)} Euro${cents ? ` und ${words(cents)} Cent` : ''}`;
  }

  function printDonationReceipt(d) {
    if (!d) return;
    const s = settings();
    if (!d.receiptNo) {
      const y = String(d.date).slice(0, 4);
      let max = 0;
      for (const x of all('donations')) { const m = /^ZB-(\d{4})-(\d+)$/.exec(x.receiptNo || ''); if (m && m[1] === y) max = Math.max(max, Number(m[2])); }
      d = put('donations', { ...d, receiptNo: `ZB-${y}-${String(max + 1).padStart(4, '0')}`, receiptDate: today() });
      if (d.entryId && get('entries', d.entryId)) put('entries', { ...get('entries', d.entryId), ref: d.receiptNo });
      render();
    }
    const org = s.name || companyName();
    const goods = d.kind === 'goods';
    const box = (on) => `<span class="p-box">${on ? '✕' : ''}</span>`;
    $('#print-root').innerHTML = `<div class="print-doc receipt">
      <div class="p-sender">${esc([org, s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</div>
      <h2>Bestätigung über ${goods ? 'Sachzuwendungen' : 'Geldzuwendungen'}</h2>
      <p class="p-small">im Sinne des § 10b des Einkommensteuergesetzes an eine der in § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes bezeichneten Körperschaften, Personenvereinigungen oder Vermögensmassen</p>
      <div class="p-field"><span>Name und Anschrift des Zuwendenden</span><b>${esc(d.donorName || '')}</b><br>${esc(d.donorStreet || '')}<br>${esc([d.donorZip, d.donorCity].filter(Boolean).join(' '))}</div>
      <table class="p-grid"><tr>
        <td><span>${goods ? 'Wert der Zuwendung' : 'Betrag der Zuwendung'} – in Ziffern –</span><b>${money(d.amount)}</b></td>
        <td><span>– in Buchstaben –</span><b>${esc(inWords(d.amount))}</b></td>
        <td><span>Tag der Zuwendung</span><b>${fmtDate(d.date)}</b></td></tr></table>
      ${goods ? `<div class="p-field"><span>Genaue Bezeichnung der Sachzuwendung mit Alter, Zustand, Kaufpreis usw.</span><b>${esc(d.goodsDesc || '')}</b></div>
        <p>${box(false)} Die Sachzuwendung stammt nach den Angaben des Zuwendenden aus dem Privatvermögen.</p>
        <p>Geeignete Unterlagen, die zur Wertermittlung gedient haben, liegen vor: ${esc(d.goodsBasis || '—')}</p>`
        : `<p>Es handelt sich um den Verzicht auf Erstattung von Aufwendungen: Ja ${box(d.waiver)} Nein ${box(!d.waiver)}</p>`}
      <p>${box(true)} Wir sind wegen Förderung <b>${esc(s.purposes || '…')}</b> nach dem Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid des Finanzamtes <b>${esc(s.taxOffice || '…')}</b>, StNr. <b>${esc(s.taxNumber || '…')}</b>, vom <b>${fmtDate(s.exemptionDate) || '…'}</b> nach § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes von der Körperschaftsteuer und nach § 3 Nr. 6 des Gewerbesteuergesetzes von der Gewerbesteuer befreit.</p>
      <p>Es wird bestätigt, dass die Zuwendung nur zur Förderung <b>${esc(s.purposes || '…')}</b> verwendet wird.</p>
      <div class="p-sign"><div>${esc(s.city || '')}, ${fmtDate(d.receiptDate || today())}</div><div class="p-line">(Ort, Datum und Unterschrift des Zuwendungsempfängers)</div></div>
      <p class="p-small"><b>Hinweis:</b> Wer vorsätzlich oder grob fahrlässig eine unrichtige Zuwendungsbestätigung erstellt oder veranlasst, dass Zuwendungen nicht zu den in der Zuwendungsbestätigung angegebenen steuerbegünstigten Zwecken verwendet werden, haftet für die entgangene Steuer (§ 10b Abs. 4 EStG, § 9 Abs. 3 KStG, § 9 Nr. 5 GewStG).
      Diese Bestätigung wird nicht als Nachweis für die steuerliche Berücksichtigung der Zuwendung anerkannt, wenn das Datum des Freistellungsbescheides länger als 5 Jahre bzw. das Datum der Feststellung der Einhaltung der satzungsmäßigen Voraussetzungen nach § 60a Abs. 1 AO länger als 3 Jahre seit Ausstellung des Bescheides zurückliegt (§ 63 Abs. 5 AO).</p>
      <p class="p-small">Bestätigung Nr. ${esc(d.receiptNo)} · erstellt mit NEXCOUNT</p>
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
            <td><b>${esc(e.description || '—')}</b>${e.ref || (isClub() && e.sphere) ? `<span class="sub">${e.ref ? `Beleg ${esc(e.ref)}` : ''}${e.ref && isClub() && e.sphere ? ' · ' : ''}${isClub() && e.sphere ? esc(SPHERES[e.sphere] || '') : ''}</span>` : ''}</td>
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
    const club = isClub();
    const d = e || { kind, date: today(), rate: settings().smallBusiness || club ? 0 : 19, method: 'Bank', category: catsFor(kind)[0], sphere: 'ideell' };
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
          ${club ? field('Bereich (Sphäre)', selectEl('sphere', Object.entries(SPHERES), d.sphere || 'ideell'), 'span2') : ''}
        </div>${datalist('dl-ecat', [...catsFor('income'), ...catsFor('expense'), ...usedCats])}`,
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
        put('entries', { ...(e || {}), kind: fd.kind, date: fd.date, description: fd.description.trim(), category: fd.category.trim(), method: fd.method, ref: fd.ref.trim(), rate, ...sp, ...(club ? { sphere: fd.sphere } : {}) });
        toast('Buchung gespeichert', 'ok');
      },
    });
  }

  // =============================================================== Ansicht: Kontakte
  function viewContacts() {
    const allC = all('contacts').filter((c) => c.type !== 'member').sort(byName);
    let list = allC;
    if (UI.q.cType) list = list.filter((c) => c.type === UI.q.cType || c.type === 'both');
    const q = (UI.q.c || '').toLowerCase();
    if (q) list = list.filter((c) => [c.name, c.number, c.contactPerson, c.email, c.phone, c.city].join(' ').toLowerCase().includes(q));
    const docs = all('documents').filter((d) => d.kind !== 'quote' && (d.status === 'open' || d.status === 'paid'));
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
    const arts = stockArticles();
    // Verein: Kassenbericht nach Bereichen (Sphären)
    const club = isClub();
    const smallBiz = !!settings().smallBusiness;
    const opening = sum(entries.filter((e) => e.date < from), (e) => (e.kind === 'income' ? 1 : -1) * num(e.gross));
    const incG = sum(inc, (e) => e.gross);
    const expG = sum(exp, (e) => e.gross);
    const sphereRows = Object.entries(SPHERES).map(([k, label]) => {
      const i = sum(inc.filter((e) => (e.sphere || 'ideell') === k), (e) => e.gross);
      const x = sum(exp.filter((e) => (e.sphere || 'ideell') === k), (e) => e.gross);
      return { k, label, i, x };
    });
    const wgb = sphereRows.find((r) => r.k === 'wirtschaft');
    const clubReport = club ? `<div class="grid-2">
        <section class="card"><div class="card-head"><h3>Kassenbericht</h3><button class="btn sm ghost" data-action="print-page">${icon('print', 14)} Drucken</button></div>
          <table><tbody>
            <tr><td>Anfangsbestand ${fmtDate(from)}</td><td class="num">${money(opening)}</td></tr>
            <tr><td>+ Einnahmen</td><td class="num pos">${money(incG)}</td></tr>
            <tr><td>− Ausgaben</td><td class="num neg">${money(expG)}</td></tr>
          </tbody><tfoot><tr><td>Endbestand ${fmtDate(to)}</td><td class="num">${money(opening + incG - expG)}</td></tr></tfoot></table>
        </section>
        <section class="card"><div class="card-head"><h3>Nach Bereichen (Sphären)</h3><span class="muted">brutto</span></div>
          <table><thead><tr><th>Bereich</th><th class="num">Einnahmen</th><th class="num">Ausgaben</th><th class="num">Ergebnis</th></tr></thead>
          <tbody>${sphereRows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${money(r.i)}</td><td class="num">${money(r.x)}</td><td class="num ${r.i - r.x < 0 ? 'neg' : ''}">${money(r.i - r.x)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Gesamt</td><td class="num">${money(incG)}</td><td class="num">${money(expG)}</td><td class="num">${money(incG - expG)}</td></tr></tfoot></table>
          <p class="muted small" style="margin-top:10px">Wirtschaftlicher Geschäftsbetrieb: ${money(wgb.i)} Einnahmen im Zeitraum. Bleiben die Einnahmen daraus im Jahr unter der Besteuerungsgrenze von 45.000 € (§ 64 Abs. 3 AO, Stand 2025), fallen keine Körperschaft- und Gewerbesteuer an. Keine Steuerberatung.</p>
        </section>
      </div>` : '';
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
        ${club ? `${kpi('Einnahmen', money(incG), 'pos', 'brutto', 'trendUp')}${kpi('Ausgaben', money(expG), 'neg', 'brutto', 'trendDown')}
          ${kpi('Überschuss / Fehlbetrag', money(incG - expG), incG - expG >= 0 ? 'pos' : 'neg', 'im Zeitraum', 'wallet')}${kpi('Kassenstand', money(opening + incG - expG), '', `zum ${fmtDate(to)}`, 'book')}`
        : `${kpi('Betriebseinnahmen (netto)', money(incNet), 'pos', '', 'trendUp')}
        ${kpi('Betriebsausgaben (netto)', money(expNet), 'neg', '', 'trendDown')}
        ${kpi('Gewinn / Verlust', money(incNet - expNet), incNet - expNet >= 0 ? 'pos' : 'neg', 'nach EÜR-Logik (Zufluss)', 'wallet')}
        ${smallBiz ? kpi('Umsatzsteuer', 'entfällt', '', 'Kleinunternehmerregelung § 19 UStG', 'shield') : kpi('USt-Zahllast', money(ust - vst), ust - vst > 0 ? 'neg' : 'pos', `USt ${money(ust)} − Vorsteuer ${money(vst)}`, 'file')}`}
      </div>
      ${clubReport}
      <section class="card"><div class="card-head"><h3>Monatsverlauf ${esc(year)}</h3><span class="muted">netto</span></div>${barChart(months)}</section>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h3>Einnahmen nach Kategorie</h3></div>${catTable(byCat(inc), incNet)}</section>
        <section class="card"><div class="card-head"><h3>Ausgaben nach Kategorie</h3></div>${catTable(byCat(exp), expNet)}</section>
      </div>
      <div class="grid-2">
        ${smallBiz ? '' : `<section class="card"><div class="card-head"><h3>Umsatzsteuer-Übersicht</h3><span class="muted">Hilfe für die UStVA – keine Steuerberatung</span></div>
          <table><tbody>
            ${[19, 7, 0].map((r) => { const es = inc.filter((e) => num(e.rate) === r && e.rate != null); return `<tr><td>Umsätze ${r} %</td><td class="num">${money(sum(es, (e) => e.net))}</td><td class="num">${money(sum(es, (e) => e.tax))}</td></tr>`; }).join('')}
            ${inc.some((e) => e.rate == null) ? `<tr><td>Umsätze gemischt</td><td class="num">${money(sum(inc.filter((e) => e.rate == null), (e) => e.net))}</td><td class="num">${money(sum(inc.filter((e) => e.rate == null), (e) => e.tax))}</td></tr>` : ''}
            <tr><td>Vorsteuer aus Ausgaben</td><td class="num">${money(expNet)}</td><td class="num">−${money(vst)}</td></tr>
          </tbody><tfoot><tr><td>Zahllast / Erstattung</td><td></td><td class="num">${money(ust - vst)}</td></tr></tfoot></table>
        </section>`}
        ${mod('invoices') || mod('purchases') ? `<section class="card"><div class="card-head"><h3>Offene Posten</h3><span class="muted">aktuell</span></div>
          <table><tbody>
            ${mod('invoices') ? `<tr><td>Forderungen (Rechnungen)</td><td class="num">${openSale.length}</td><td class="num">${money(sum(openSale, (d) => docTotals(d).gross))}</td></tr>
            <tr><td>davon überfällig</td><td class="num">${openSale.filter(isLate).length}</td><td class="num neg">${money(sum(openSale.filter(isLate), (d) => docTotals(d).gross))}</td></tr>` : ''}
            ${mod('purchases') ? `<tr><td>Verbindlichkeiten (Einkäufe)</td><td class="num">${openPurch.length}</td><td class="num">${money(sum(openPurch, (d) => docTotals(d).gross))}</td></tr>` : ''}
          </tbody></table>
        </section>` : ''}
      </div>
      ${mod('inventory') ? `<div class="grid-2">
        <section class="card"><div class="card-head"><h3>Lagerwert nach Kategorie</h3><span class="muted">zu Einkaufspreisen</span></div>${catTable(Object.entries(stockCats).sort((a, b) => b[1] - a[1]), stockTotal)}</section>
        <section class="card"><div class="card-head"><h3>Wertvollste Lagerposten</h3></div>
          ${top.length ? `<table><tbody>${top.map(({ a, v }) => `<tr><td><b>${esc(a.name)}</b><span class="sub">${esc(a.sku)} · ${fmtNum(st[a.id] || 0)} ${esc(a.unit || '')}</span></td><td class="num">${money(v)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Keine Artikel.</p>'}
        </section>
      </div>` : ''}
      <section class="card"><div class="card-head"><h3>Datenexport</h3><span class="muted">CSV im Excel-Format (Semikolon, UTF-8)</span></div>
        <div class="toolbar">
          <button class="btn" data-action="export" data-what="entries">${icon('download', 16)} Buchungen (Zeitraum)</button>
          ${mod('catalog') ? `<button class="btn" data-action="export" data-what="articles">${icon('download', 16)} ${mod('inventory') ? 'Artikel & Bestände' : 'Produkte & Leistungen'}</button>` : ''}
          ${mod('inventory') ? `<button class="btn" data-action="export" data-what="movements">${icon('download', 16)} Lagerbewegungen</button>` : ''}
          ${docKindsOn().length ? `<button class="btn" data-action="export" data-what="documents">${icon('download', 16)} Belege</button>` : ''}
          ${mod('contacts') ? `<button class="btn" data-action="export" data-what="contacts">${icon('download', 16)} Kontakte</button>` : ''}
          ${mod('members') ? `<button class="btn" data-action="export" data-what="members">${icon('download', 16)} Mitglieder</button>` : ''}
          ${mod('dues') ? `<button class="btn" data-action="export" data-what="dues">${icon('download', 16)} Beiträge</button>` : ''}
          ${mod('donations') ? `<button class="btn" data-action="export" data-what="donations">${icon('download', 16)} Spenden</button>` : ''}
          ${mod('time') ? `<button class="btn" data-action="export" data-what="times">${icon('download', 16)} Zeiten</button>` : ''}
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
      downloadCsv(`nexcount-buchungen-${stamp}.csv`, ['Datum', 'Art', 'Kategorie', 'Beschreibung', 'Zahlungsart', 'Beleg', 'Netto', 'USt-Satz', 'USt', 'Brutto', ...(isClub() ? ['Bereich'] : [])],
        rows.map((e) => [fmtDate(e.date), KINDS[e.kind], e.category, e.description, e.method, e.ref, num(e.net), e.rate == null ? 'gemischt' : `${e.rate} %`, num(e.tax), num(e.gross), ...(isClub() ? [SPHERES[e.sphere || 'ideell']] : [])]));
    } else if (what === 'articles') {
      const list = UI.space === 'stock' ? stockArticles() : articles();
      downloadCsv(`nexcount-${UI.space === 'stock' ? 'inventurliste' : 'artikel'}-${stamp}.csv`, ['Art.-Nr.', 'Bezeichnung', 'Art', 'Kategorie', 'EAN', 'Einheit', 'Bestand', 'Gezählt', 'Mindestbestand', 'EK netto', 'VK netto', 'USt-Satz', 'Lagerwert', 'Lagerort'],
        list.map((a) => [a.sku, a.name, a.type === 'service' ? 'Leistung' : 'Produkt', a.category, a.ean, a.unit, tracksStock(a) ? st[a.id] || 0 : '', '', num(a.min), num(a.ek), num(a.vk), `${num(a.tax)} %`, tracksStock(a) ? Math.max(0, st[a.id] || 0) * num(a.ek) : '', a.location]));
    } else if (what === 'members') {
      downloadCsv(`nexcount-mitglieder-${stamp}.csv`, ['Nr.', 'Name', 'Status', 'Eintritt', 'Austritt', 'Geburtsdatum', 'Beitragsgruppe', 'Beitrag', 'Zahlweise', 'E-Mail', 'Telefon', 'Straße', 'PLZ', 'Ort', 'IBAN', 'Mandatsreferenz', 'Mandat vom'],
        members().map((m) => [m.number, m.name, MEMBER_STATUS[m.status], fmtDate(m.joinedAt), fmtDate(m.leftAt), fmtDate(m.birthday), m.feeGroup, num(m.fee), (INTERVALS[m.feeInterval] || INTERVALS.year)[0], m.email, m.phone, m.street, m.zip, m.city, m.iban, m.mandateRef, fmtDate(m.mandateDate)]));
    } else if (what === 'dues') {
      downloadCsv(`nexcount-beitraege-${stamp}.csv`, ['Mitglied', 'Nr.', 'Zeitraum', 'Fällig', 'Betrag', 'Status', 'Bezahlt am', 'Zahlungsart'],
        all('dues').sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).map((d) => [d.memberName, d.memberNo, d.periodLabel, fmtDate(d.dueDate), num(d.amount), { open: 'offen', paid: 'bezahlt', waived: 'erlassen' }[d.status], fmtDate(d.paidAt), d.method]));
    } else if (what === 'donations') {
      downloadCsv(`nexcount-spenden-${stamp}.csv`, ['Datum', 'Spender', 'Straße', 'PLZ', 'Ort', 'Art', 'Betrag', 'Aufwandsspende', 'Bestätigung', 'Bestätigt am'],
        all('donations').sort((a, b) => String(a.date).localeCompare(String(b.date))).map((d) => [fmtDate(d.date), d.donorName, d.donorStreet, d.donorZip, d.donorCity, DON_KINDS[d.kind], num(d.amount), d.waiver ? 'ja' : 'nein', d.receiptNo, fmtDate(d.receiptDate)]));
    } else if (what === 'times') {
      downloadCsv(`nexcount-zeiten-${stamp}.csv`, ['Datum', 'Kunde', 'Projekt', 'Tätigkeit', 'Stunden', 'Stundensatz', 'Betrag', 'Abrechenbar', 'Rechnung'],
        all('times').sort((a, b) => String(a.date).localeCompare(String(b.date))).map((t) => [fmtDate(t.date), t.contactName, t.project, t.description, r2(num(t.minutes) / 60), num(t.rate), timeValue(t), t.billable === false ? 'nein' : 'ja', isBilled(t) ? (get('documents', t.billedDocId).number || 'Entwurf') : '']));
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
      for (const c of ['articles', 'movements', 'contacts', 'documents', 'entries', 'times', 'dues', 'donations', 'settings']) out.data[c] = all(c);
      download(`nexcount-backup-${stamp}.json`, JSON.stringify(out, null, 2), 'application/json');
    }
    toast('Export erstellt', 'ok');
  }

  // =============================================================== Ansicht: Einstellungen
  const SET_TABS = [['org', 'Organisation', 'building'], ['features', 'Funktionen', 'sliders'], ['docs', 'Belege', 'file'], ['team', 'Team', 'users'], ['account', 'Mein Konto', 'shield'], ['system', 'Darstellung & Sync', 'settings']];

  function viewSettings() {
    const tabs_ = SET_TABS.filter(([k]) => k !== 'docs' || docKindsOn().length);
    const tab = tabs_.some(([k]) => k === UI.q.setTab) ? UI.q.setTab : 'org';
    const tabs = `<div class="tabs" role="tablist">${tabs_.map(([k, l, ic]) => `<button role="tab" data-action="set-ui" data-k="setTab" data-v="${k}" class="${tab === k ? 'active' : ''}">${icon(ic, 16)}<span>${l}</span></button>`).join('')}</div>`;
    const body = { org: settingsOrg, features: settingsFeatures, docs: settingsDocs, team: settingsTeam, account: settingsAccount, system: settingsSystem }[tab]();
    return `${tabs}${body}<p class="muted small center">NEXCOUNT by Andrerer · Das Buchhaltungs- und Lagersystem für die Kleinen</p>`;
  }

  function settingsOrg() {
    const s = settings();
    const t = orgType() || 'small';
    const club = t === 'club';
    const admin = S.user.role === 'admin';
    return `<form data-form="company" class="stack">
      <section class="card">
        <div class="card-head"><h3>Art der Organisation</h3><span class="muted">bestimmt Vorschläge, Begriffe und Ansichten</span></div>
        <div class="type-grid compact">${Object.entries(ORG_TYPES).map(([k, ty]) => `<label class="type-card ${t === k && orgType() ? 'active' : ''}">
          <input type="radio" name="orgType" value="${k}" ${t === k && orgType() ? 'checked' : ''} ${admin ? '' : 'disabled'}>
          <span class="preset-ic">${icon(ty.icon, 20)}</span><b>${esc(ty.label)}</b><small>${esc(ty.desc)}</small></label>`).join('')}</div>
        ${admin ? '<div class="toolbar" style="margin-top:12px"><button type="button" class="btn sm ghost" data-action="reopen-setup">' + icon('sparkle', 14) + ' Einrichtungsassistent erneut öffnen</button></div>' : ''}
      </section>
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>${club ? 'Vereinsdaten' : 'Firmendaten'}</h3><span class="muted">erscheinen auf Belegen</span></div>
          <div class="grid2">
            ${field(club ? 'Name des Vereins' : 'Firmenname', inp('name', s.name || companyName(), 'required maxlength="120"'), 'span2')}
            ${field('Rechtsform', `<select name="legalForm">${ORG_TYPES[t].legal.map((l) => `<option ${s.legalForm === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
            ${field(club ? 'Vorstand / Vertretung' : 'Inhaber / Geschäftsführer', inp('owner', s.owner, 'maxlength="100"'))}
            ${field('Straße & Hausnr.', inp('street', s.street, 'maxlength="120"'), 'span2')}
            ${field('PLZ', inp('zip', s.zip, 'maxlength="12"'))}
            ${field('Ort', inp('city', s.city, 'maxlength="80"'))}
            ${field('Telefon', inp('phone', s.phone, 'maxlength="40"'))}
            ${field('E-Mail', inp('email', s.email, 'type="email" maxlength="120"'))}
            ${field('Website', inp('website', s.website, 'maxlength="120"'), 'span2')}
            ${club ? field('Registergericht & Nr.', inp('register', s.register, 'maxlength="80" placeholder="z. B. AG Musterstadt VR 1234"'), 'span2') : ''}
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h3>Steuern & Bank</h3></div>
          <div class="grid2">
            ${field('Steuernummer', inp('taxNumber', s.taxNumber, 'maxlength="30"'))}
            ${club ? field('Finanzamt', inp('taxOffice', s.taxOffice, 'maxlength="80"')) : field('USt-IdNr.', inp('vatId', s.vatId, 'maxlength="30"'))}
            ${field('Bank', inp('bank', s.bank, 'maxlength="80"'), 'span2')}
            ${field('IBAN', inp('iban', s.iban, 'maxlength="40"'))}
            ${field('BIC', inp('bic', s.bic, 'maxlength="20"'))}
            ${!club ? field('Standard-Stundensatz netto (€)', numInp('hourlyRate', s.hourlyRate ?? '', 'min="0"')) : ''}
          </div>
          <label class="check" style="margin-top:14px"><input type="checkbox" name="smallBusiness" ${s.smallBusiness ? 'checked' : ''}> Kleinunternehmer nach § 19 UStG (keine Umsatzsteuer ausweisen)</label>
          ${club ? `<label class="check" style="margin-top:10px"><input type="checkbox" name="nonProfit" ${s.nonProfit !== false ? 'checked' : ''}> Gemeinnützig anerkannt</label>` : ''}
        </section>
      </div>
      ${club ? `<section class="card">
        <div class="card-head"><h3>Freistellungsbescheid</h3><span class="muted">für Zuwendungsbestätigungen</span></div>
        <div class="grid3">
          ${field('Freistellungsbescheid vom', inp('exemptionDate', s.exemptionDate, 'type="date"'))}
          ${field('Steuerbegünstigte Zwecke', inp('purposes', s.purposes, 'maxlength="200" placeholder="z. B. des Sports und der Jugendhilfe"'), 'span2')}
        </div>
        <p class="muted small" style="margin-top:10px">Der Bescheid darf bei Ausstellung höchstens 5 Jahre alt sein. Die Vorlage folgt dem amtlichen Muster – bitte vor der ersten Verwendung mit dem aktuellen Muster des Bundesfinanzministeriums abgleichen.</p>
      </section>` : ''}
      <div><button class="btn primary" type="submit">${icon('check', 16)} Speichern</button></div>
    </form>`;
  }

  function settingsFeatures() {
    const admin = S.user.role === 'admin';
    const mods = currentModules();
    const t = orgType();
    return `<div class="grid-2 wide-left">
      <section class="card">
        <div class="card-head"><h3>Funktionen</h3><span class="muted">Schalte ein, was du brauchst</span></div>
        ${admin ? '' : '<div class="alert info" style="margin-bottom:12px">Nur Administratoren können Funktionen ändern.</div>'}
        ${moduleList(mods, 'settings', !admin, settings().inventoryLink !== false, t ? ORG_TYPES[t].modules : null)}
        <p class="muted small" style="margin-top:12px">Ausgeschaltete Bereiche werden nur ausgeblendet – vorhandene Daten bleiben erhalten. Die Auswahl gilt für das ganze Team.</p>
      </section>
      <section class="card">
        <div class="card-head"><h3>Vorlagen</h3></div>
        <p class="muted small" style="margin-bottom:12px">Mit einem Klick auf eine passende Kombination umstellen (das Lager bleibt, wie es ist):</p>
        <div class="preset-list">${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="preset row" data-action="apply-preset" data-preset="${k}" ${admin ? '' : 'disabled'}>
          <span class="preset-ic">${icon(p.icon, 18)}</span><span><b>${esc(p.label)}</b><small>${esc(p.desc)}</small></span></button>`).join('')}</div>
      </section>
    </div>`;
  }

  function settingsDocs() {
    const s = settings();
    return `<form data-form="company" class="stack">
      <section class="card">
        <div class="card-head"><h3>Belege</h3><span class="muted">Nummernkreise, Fristen und Texte</span></div>
        <div class="grid3">
          ${mod('invoices') ? field('Präfix Rechnungen', inp('invoicePrefix', s.invoicePrefix || 'RE', 'maxlength="8" pattern="[A-Za-z0-9]+"')) : ''}
          ${mod('invoices') ? field('Zahlungsziel (Tage)', numInp('paymentDays', s.paymentDays ?? 14, 'min="0" max="365"')) : ''}
          ${mod('quotes') ? field('Präfix Angebote', inp('quotePrefix', s.quotePrefix || 'AN', 'maxlength="8" pattern="[A-Za-z0-9]+"')) : ''}
          ${mod('quotes') ? field('Angebote gültig (Tage)', numInp('quoteDays', s.quoteDays ?? 30, 'min="1" max="365"')) : ''}
          ${mod('purchases') ? field('Präfix Einkäufe', inp('purchasePrefix', s.purchasePrefix || 'EK', 'maxlength="8" pattern="[A-Za-z0-9]+"')) : ''}
        </div>
        <div class="grid2" style="margin-top:12px">
          ${mod('invoices') ? field('Schlusstext auf Rechnungen', textarea('invoiceFooter', s.invoiceFooter ?? 'Vielen Dank für Ihren Auftrag! Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer.', 'maxlength="1000" rows="3"')) : ''}
          ${mod('quotes') ? field('Schlusstext auf Angeboten', textarea('quoteFooter', s.quoteFooter ?? 'Wir freuen uns auf Ihren Auftrag.', 'maxlength="1000" rows="3"')) : ''}
        </div>
      </section>
      <div><button class="btn primary" type="submit">${icon('check', 16)} Speichern</button></div>
    </form>`;
  }

  function settingsTeam() {
    if (S.user.role !== 'admin') {
      return `<section class="card"><div class="card-head"><h3>Team</h3></div>
        <p class="muted">Du bist als <b>Mitarbeiter</b> in <b>${esc(companyName())}</b>. Das Team und die Einladungen verwaltet ein Administrator.</p></section>`;
    }
    return `<div class="grid-2 wide-right">
      <section class="card">
        <div class="card-head"><h3>Einladen</h3></div>
        <p class="muted small" style="margin-bottom:12px">Neue ${isClub() ? 'Vorstands- und Teammitglieder' : 'Mitarbeiter'} registrieren sich mit diesem Code („Ich wurde eingeladen“) und arbeiten sofort im selben Datenbestand.</p>
        <div class="code-box"><span class="code">${esc(S.company.inviteCode || '—')}</span></div>
        <div class="toolbar" style="margin-top:12px">
          <button class="btn sm" data-action="invite-copy">${icon('copy', 14)} Kopieren</button>
          <button class="btn sm" data-action="invite-rotate">${icon('sync', 14)} Neuer Code</button>
        </div>
      </section>
      <section class="card flush">
        <div class="card-head"><h3>Benutzer</h3><span class="muted">${S.members.length} Zugänge</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th></th></tr></thead>
          <tbody>${S.members.slice().sort(byName).map((m) => `<tr>
            <td><div class="person"><span class="avatar sm">${esc(initials(m.name))}</span><b>${esc(m.name)}</b>${m.id === S.user.id ? ' <span class="muted small">(du)</span>' : ''}</div></td>
            <td>${esc(m.email)}</td>
            <td><span class="badge ${m.role === 'admin' ? 'info' : ''}">${m.role === 'admin' ? 'Admin' : 'Mitarbeiter'}</span></td>
            <td class="actions">${m.id === S.user.id ? '' : `<button class="btn sm" data-action="member-role" data-id="${m.id}" data-role="${m.role === 'admin' ? 'member' : 'admin'}">${m.role === 'admin' ? 'Zu Mitarbeiter' : 'Zu Admin'}</button>
              <button class="btn sm danger" data-action="member-remove" data-id="${m.id}">Entfernen</button>`}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>
    </div>`;
  }

  function settingsAccount() {
    const admin = S.user.role === 'admin';
    return `<div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>Profil</h3><span class="badge ${admin ? 'info' : ''}">${admin ? 'Administrator' : 'Mitarbeiter'}</span></div>
        <form data-form="profile" class="stack">
          ${field('Name', inp('name', S.user.name, 'required maxlength="80"'))}
          ${field('E-Mail', `<input value="${esc(S.user.email)}" readonly>`)}
          <div><button class="btn" type="submit">Name speichern</button></div>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><h3>Passwort ändern</h3></div>
        <form data-form="password" class="stack">
          ${field('Neues Passwort', '<input name="newPassword" type="password" required minlength="8" autocomplete="new-password">')}
          ${field('Neues Passwort wiederholen', '<input name="newPassword2" type="password" required minlength="8" autocomplete="new-password">')}
          <div><button class="btn" type="submit">Passwort ändern</button></div>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><h3>Abmelden</h3></div>
        <p class="muted small" style="margin-bottom:12px">Beim Abmelden werden die lokal gespeicherten Daten auf diesem Gerät gelöscht.</p>
        <button class="btn danger" data-action="logout">${icon('logout', 16)} Abmelden</button>
      </section>
    </div>`;
  }

  function settingsSystem() {
    const theme = themePref();
    const waiting = S.pending.filter((o) => o.retryAt).length;
    return `<div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>Darstellung</h3></div>
        <div class="seg">${[['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button data-action="theme" data-v="${v}" class="${theme === v ? 'active' : ''}">${l}</button>`).join('')}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Synchronisierung</h3><button class="btn sm" data-action="sync-now">${icon('sync', 14)} Jetzt synchronisieren</button></div>
        <div class="meta">
          <div><span>Status</span><b>${S.online ? (S.syncError ? `Fehler: ${esc(S.syncError)}` : 'Online · Live-Verbindung') : 'Offline'}</b></div>
          <div><span>Letzte Synchronisierung</span><b>${S.lastSync ? fmtTime(S.lastSync) : '—'}</b></div>
          <div><span>Ausstehende Änderungen</span><b>${S.pending.length}${waiting ? ` (${waiting} warten auf Server)` : ''}</b></div>
          <div><span>Datenstand</span><b>Rev. ${S.seq}</b></div>
        </div>
        ${waiting ? '<div class="alert warn" style="margin-top:12px">Einige Änderungen nimmt der Server noch nicht an – vermutlich steht ein Datenbank-Update aus. Sie bleiben auf diesem Gerät gespeichert und werden automatisch erneut gesendet.</div>' : ''}
        <p class="muted small" style="margin-top:12px">Änderungen werden sofort lokal gespeichert und automatisch abgeglichen – auch nach einer Offline-Phase. Andere Geräte sehen sie in Echtzeit.</p>
        <div class="toolbar" style="margin-top:12px"><button class="btn sm" data-action="rebuild-cache">Lokalen Cache neu aufbauen</button></div>
      </section>
      ${S.user.role === 'admin' ? `<section class="card">
        <div class="card-head"><h3>Beispieldaten</h3></div>
        <p class="muted small" style="margin-bottom:12px">Legt passende Beispieldaten für deine Organisationsart an – praktisch zum Ausprobieren.</p>
        <button class="btn" data-action="demo">${icon('sparkle', 16)} Beispieldaten laden</button>
      </section>` : ''}
    </div>`;
  }

  // =============================================================== Demo-Daten
  // Beispieldaten für Vereine: Mitglieder, Beiträge, Spenden, Buchungen nach Bereichen, Vereinslager
  function seedClubDemo() {
    if (!confirm('Beispieldaten für einen Verein (Mitglieder, Beiträge, Spenden, Buchungen) anlegen? Sie werden mit deinem Team synchronisiert.')) return;
    const s = settings();
    put('settings', {
      ...s, id: 'company', setupDone: true, modules: currentModules(),
      ...(s.street ? {} : { street: 'Sportplatzweg 3', zip: '79098', city: 'Freiburg', taxOffice: 'Finanzamt Freiburg-Stadt', taxNumber: '06469/12345', exemptionDate: addDays(today(), -400), purposes: 'des Sports', register: 'AG Freiburg VR 4711', nonProfit: true, smallBusiness: true }),
    });
    const people = [
      ['Bauer, Lena', 'active', 'Erwachsene', 60, 'year', -900], ['Schmidt, Tom', 'active', 'Erwachsene', 60, 'year', -700], ['Yilmaz, Elif', 'active', 'Jugendliche', 30, 'year', -300],
      ['Novak, Jan', 'active', 'Erwachsene', 5, 'month', -200], ['Weber, Familie', 'active', 'Familie', 90, 'half', -1200], ['Fischer, Paul', 'passive', 'Fördermitglied', 24, 'year', -1500],
      ['Krüger, Mia', 'active', 'Jugendliche', 30, 'year', -40], ['Hoffmann, Gerd', 'left', 'Erwachsene', 60, 'year', -2000],
    ];
    const ms = people.map(([name, status, feeGroup, fee, feeInterval, joined], i) => put('contacts', {
      type: 'member', number: `M-${String(i + 1).padStart(4, '0')}`, name, status, feeGroup, fee, feeInterval, joinedAt: addDays(today(), joined),
      leftAt: status === 'left' ? addDays(today(), -60) : '', email: `${name.split(',')[0].toLowerCase().replace(/[^a-z]/g, '')}@beispiel.de`, street: 'Musterstraße 1', zip: '79098', city: 'Freiburg',
    }));
    const year = today().slice(0, 4);
    for (const d of duesPreview(year, 15)) {
      const due = put('dues', d);
      if (d.dueDate < addDays(today(), -30) && Math.random() > 0.25) markDuePaid(due, addDays(d.dueDate, 3), 'Lastschrift');
    }
    const sponsor = mod('contacts') ? put('contacts', { type: 'customer', number: 'K-0001', name: 'Autohaus Sonnenberg GmbH', street: 'Industriestraße 8', zip: '79110', city: 'Freiburg', country: 'Deutschland' }) : null;
    const don = (daysAgo, name, amount, extra = {}) => {
      const d = put('donations', { date: addDays(today(), -daysAgo), donorName: name, donorStreet: 'Musterstraße 1', donorZip: '79098', donorCity: 'Freiburg', kind: 'money', amount, method: 'Bank', ...extra });
      if (d.kind === 'money') {
        const e = put('entries', { date: d.date, kind: 'income', category: 'Spenden', sphere: 'ideell', description: `Spende · ${name}`, net: amount, tax: 0, gross: amount, rate: 0, method: 'Bank', donationId: d.id });
        put('donations', { ...d, entryId: e.id });
      }
    };
    don(20, ms[0].name, 100, { donorId: ms[0].id });
    don(45, sponsor ? sponsor.name : 'Autohaus Sonnenberg GmbH', 500, { donorId: sponsor ? sponsor.id : '', donorStreet: 'Industriestraße 8', donorZip: '79110' });
    don(80, ms[3].name, 50, { donorId: ms[3].id, waiver: true });
    don(10, 'Sporthaus Lange', 240, { kind: 'goods', goodsDesc: '12 Trainingsleibchen, neu', goodsBasis: 'Rechnung vom Händler' });
    const ent = (daysAgo, kind, category, description, gross, sphere, method = 'Bank') => put('entries', { date: addDays(today(), -daysAgo), kind, category, description, method, rate: 0, net: gross, tax: 0, gross, sphere });
    ent(5, 'expense', 'Hallen- & Platzmiete', 'Hallenmiete Oktober', 320, 'ideell');
    ent(35, 'expense', 'Hallen- & Platzmiete', 'Hallenmiete September', 320, 'ideell');
    ent(12, 'expense', 'Übungsleiter', 'Übungsleiterpauschale Q3', 450, 'ideell');
    ent(40, 'expense', 'Verbandsbeiträge', 'Landessportbund Jahresbeitrag', 180, 'ideell');
    ent(25, 'income', 'Zuschüsse', 'Zuschuss Stadt Jugendarbeit', 800, 'ideell');
    ent(60, 'income', 'Bewirtung & Verkauf', 'Sommerfest Getränkeverkauf', 1260, 'wirtschaft', 'Kasse');
    ent(60, 'expense', 'Veranstaltungen', 'Sommerfest Einkauf Getränke', 540, 'wirtschaft', 'Kasse');
    ent(90, 'income', 'Veranstaltungen', 'Startgelder Vereinsturnier', 380, 'zweck', 'Kasse');
    ent(30, 'income', 'Zinserträge', 'Zinsen Tagesgeld', 12.4, 'vermoegen');
    if (mod('inventory')) {
      const item = (sku, name, unit, ek, min, location, initial) => {
        const a = put('articles', { type: 'product', sku, name, category: 'Vereinsinventar', unit, ek, min, location, sellable: false });
        put('movements', { articleId: a.id, qty: initial, type: 'initial', date: addDays(today(), -90), unitCost: ek, note: 'Anfangsbestand' });
      };
      item('L-0001', 'Trainingsbälle Größe 5', 'Stk', 25, 10, 'Geräteraum', 14);
      item('L-0002', 'Hütchen-Set (40 Stk)', 'Set', 18, 2, 'Geräteraum', 3);
      item('L-0003', 'Getränkekisten Wasser', 'Kiste', 6, 8, 'Vereinsheim', 5);
    }
    toast('Beispieldaten angelegt', 'ok');
    render();
  }

  function seedDemo() {
    if (isClub()) return seedClubDemo();
    if (!confirm('Beispieldaten (Kunden, Produkte, Leistungen, Belege, Buchungen) anlegen? Sie werden mit deinem Team synchronisiert.')) return;
    const s = settings();
    const demoFirm = s.street ? {} : { name: s.name || companyName(), street: 'Hauptstraße 12', zip: '10115', city: 'Berlin', email: 'info@example.com', taxNumber: '12/345/67890', iban: 'DE02 1203 0000 0000 2020 51', bic: 'BYLADEM1001', bank: 'Musterbank', paymentDays: 14 };
    put('settings', { ...s, ...demoFirm, id: 'company', setupDone: true, modules: currentModules() });
    const k1 = put('contacts', { type: 'customer', number: 'K-0001', name: 'Müller Gastro GmbH', contactPerson: 'Anna Müller', email: 'einkauf@mueller-gastro.example', phone: '030 1234567', street: 'Lindenallee 4', zip: '10117', city: 'Berlin', country: 'Deutschland' });
    const k2 = put('contacts', { type: 'customer', number: 'K-0002', name: 'Café Sonnenschein', contactPerson: 'Jonas Weber', email: 'hallo@cafe-sonnenschein.example', street: 'Marktplatz 1', zip: '14467', city: 'Potsdam', country: 'Deutschland' });
    const l1 = put('contacts', { type: 'supplier', number: 'L-0001', name: 'Rösterei Nordlicht KG', email: 'vertrieb@nordlicht.example', street: 'Hafenstraße 22', zip: '20457', city: 'Hamburg', country: 'Deutschland' });
    const mk = (sku, name, category, unit, ek, vk, tax, min, location, initial) => {
      const a = put('articles', { type: 'product', sku, name, category, unit, ek, vk, tax, min, location });
      put('movements', { articleId: a.id, qty: initial, type: 'initial', date: addDays(today(), -60), unitCost: ek, note: 'Anfangsbestand' });
      return a;
    };
    const a1 = mk('A-0001', 'Espressobohnen Classico 1 kg', 'Kaffee', 'Stk', 11.9, 19.9, 7, 20, 'Regal A1', 64);
    const a2 = mk('A-0002', 'Hafermilch Barista 1 l', 'Milchalternativen', 'Stk', 1.45, 2.6, 7, 48, 'Kühlraum', 40);
    const a3 = mk('A-0003', 'Coffee-to-go Becher 300 ml (50 Stk)', 'Verpackung', 'Pkt', 4.2, 8.5, 19, 15, 'Regal B2', 22);
    mk('A-0004', 'Siebträger-Reinigungstabletten', 'Zubehör', 'Pkt', 6.8, 12.9, 19, 5, 'Regal C1', 12);
    mk('A-0005', 'Milchkännchen Edelstahl 600 ml', 'Zubehör', 'Stk', 9.5, 19.0, 19, 3, 'Regal C2', 7);
    const sv1 = put('articles', { type: 'service', sku: 'L-0001', name: 'Barista-Schulung', category: 'Schulung', unit: 'Std', ek: 0, vk: 65, tax: 19 });
    const sv2 = put('articles', { type: 'service', sku: 'L-0002', name: 'Wartung Siebträgermaschine', category: 'Service', unit: 'Std', ek: 0, vk: 79, tax: 19 });
    const inv1 = { id: uid(), kind: 'sale', status: 'draft', date: addDays(today(), -24), dueDate: addDays(today(), -10), contactId: k1.id, contact: { name: k1.name, contactPerson: k1.contactPerson, street: k1.street, zip: k1.zip, city: k1.city, country: k1.country, number: k1.number }, items: [{ articleId: a1.id, text: a1.name, qty: 12, price: 19.9, tax: 7, unit: 'Stk' }, { articleId: a3.id, text: a3.name, qty: 4, price: 8.5, tax: 19, unit: 'Pkt' }], notes: '' };
    const d1 = finalizeDoc(inv1);
    markDocPaid(d1, addDays(today(), -12), 'Bank');
    const inv2 = { id: uid(), kind: 'sale', status: 'draft', date: addDays(today(), -5), dueDate: addDays(today(), 9), contactId: k2.id, contact: { name: k2.name, contactPerson: k2.contactPerson, street: k2.street, zip: k2.zip, city: k2.city, country: k2.country, number: k2.number }, items: [{ articleId: a2.id, text: a2.name, qty: 24, price: 2.6, tax: 7, unit: 'Stk' }, { articleId: sv1.id, text: sv1.name, qty: 2, price: 65, tax: 19, unit: 'Std' }], notes: '' };
    finalizeDoc(inv2);
    finalizeDoc({ id: uid(), kind: 'quote', status: 'draft', date: addDays(today(), -3), dueDate: addDays(today(), 27), contactId: k1.id, contact: inv1.contact, reference: 'Jahreswartung 2027', items: [{ articleId: sv2.id, text: `${sv2.name} (4 Termine)`, qty: 8, price: 79, tax: 19, unit: 'Std' }, { articleId: a1.id, text: a1.name, qty: 24, price: 18.9, tax: 7, unit: 'Stk' }], notes: '' });
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
    if (mod('time')) {
      const tm = (daysAgo, c, project, description, minutes) => put('times', { date: addDays(today(), -daysAgo), contactId: c.id, contactName: c.name, project, description, minutes, rate: num(s.hourlyRate) || 75, billable: true });
      tm(1, k1, 'Kaffeebar-Umbau', 'Aufmaß und Planung vor Ort', 150);
      tm(2, k1, 'Kaffeebar-Umbau', 'Montage Siebträgermaschine', 240);
      tm(3, k2, 'Wartungsvertrag', 'Entkalkung und Dichtungen getauscht', 90);
      tm(6, k2, 'Wartungsvertrag', 'Telefonische Beratung', 30);
    }
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
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appBase() });
          if (error) throw error;
          return showMsg('Falls ein Konto mit dieser Adresse existiert, ist eine E-Mail mit einem Link unterwegs.', 'info');
        }
        if (authTab === 'register') {
          if (fd.password !== fd.password2) throw new Error('Die Passwörter stimmen nicht überein.');
          const meta = { name: String(fd.name || '').trim() };
          if (REG.mode === 'join') meta.inviteCode = String(fd.inviteCode || '').trim().toUpperCase();
          else Object.assign(meta, { companyName: REG.companyName.trim(), orgType: REG.orgType, legalForm: REG.legalForm, smallBusiness: !!REG.smallBusiness, nonProfit: !!REG.nonProfit });
          const { data, error } = await sb.auth.signUp({ email, password: fd.password, options: { data: meta, emailRedirectTo: appBase() } });
          if (error) throw error;
          if (!data.session) {
            authTab = 'login';
            Object.assign(REG, { step: 1, mode: 'new' });
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
    // Registrierung Schritt 2 (Organisation) → Schritt 3 (Konto)
    'reg-org'() {
      if (!REG.companyName.trim()) throw new Error('Bitte gib einen Namen an.');
      REG.step = 3;
      renderAuth('');
    },
    async onboard(fd, f) {
      const btn = $('[type=submit]', f);
      btn.disabled = true;
      try {
        if (REG.mode === 'join') {
          setSession(await rpc('join_company', { p_code: String(fd.inviteCode || '').trim().toUpperCase(), p_name: fd.name }));
        } else {
          if (!REG.companyName.trim()) throw new Error('Bitte gib einen Namen an.');
          await createOrganisation({ ...REG, name: fd.name });
        }
        toast(`Willkommen bei NEXCOUNT, ${S.user.name}!`, 'ok');
      } catch (e) {
        const el = $('#auth-msg');
        el.textContent = e.message;
        el.className = 'alert';
        btn.disabled = false;
      }
    },
    company(fd, f) {
      const before = settings();
      const data = { ...before, id: 'company' };
      for (const [k, v] of Object.entries(fd)) data[k] = typeof v === 'string' ? v.trim() : v;
      if ('paymentDays' in fd) data.paymentDays = num(fd.paymentDays);
      if ('quoteDays' in fd) data.quoteDays = num(fd.quoteDays);
      if ('hourlyRate' in fd) data.hourlyRate = num(fd.hourlyRate);
      // Checkboxen nur auswerten, wenn sie in diesem Formular vorkommen
      if (f.elements.smallBusiness) data.smallBusiness = fd.smallBusiness === 'on';
      if (f.elements.nonProfit) data.nonProfit = fd.nonProfit === 'on';
      if (fd.orgType && fd.orgType !== before.orgType) {
        const T = ORG_TYPES[fd.orgType];
        if (!T.legal.includes(data.legalForm)) data.legalForm = T.legal[0];
        if (confirm(`Organisationsart „${T.label}“: Sollen auch die dafür vorgeschlagenen Funktionen übernommen werden? (Das Lager bleibt, wie es ist. Daten gehen nicht verloren.)`)) {
          data.modules = { ...modsFromList(T.modules), inventory: mod('inventory') };
        }
        if (fd.orgType === 'club' && before.nonProfit === undefined) data.nonProfit = true;
      }
      put('settings', data);
      if (S.user.role === 'admin' && data.name && data.name !== S.company.name) {
        rpc('update_company', { p_name: data.name }).then((me) => { S.company = me.company; render(); }).catch(() => {});
      }
      toast('Gespeichert', 'ok');
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
    // ---------- Registrierung in Schritten
    'reg-type': (el) => {
      const t = el.dataset.type;
      if (REG.orgType !== t) Object.assign(REG, { orgType: t, legalForm: ORG_TYPES[t].legal[0], nonProfit: t === 'club' });
      REG.mode = 'new';
      REG.step = 2;
      renderAuth('');
    },
    'reg-join': () => { Object.assign(REG, { mode: 'join', step: 3 }); renderAuth(''); },
    'reg-back': () => {
      if (REG.mode === 'join') Object.assign(REG, { mode: 'new', step: 1 });
      else REG.step = Math.max(1, REG.step - 1);
      renderAuth('');
    },
    'onb-type': (el) => {
      const t = el.dataset.type;
      if (REG.orgType !== t) Object.assign(REG, { orgType: t, legalForm: ORG_TYPES[t].legal[0], nonProfit: t === 'club' });
      renderOnboarding(null, '');
    },
    'onb-mode': (el) => { REG.mode = el.dataset.mode; renderOnboarding(null, ''); },
    // ---------- Einrichtungsassistent
    'setup-type': (el) => {
      const st = setupState();
      const t = el.dataset.type;
      if (st.orgType !== t) {
        Object.assign(st, { orgType: t, legalForm: ORG_TYPES[t].legal[0], nonProfit: t === 'club', modules: { ...modsFromList(ORG_TYPES[t].modules), inventory: !!st.modules.inventory } });
      }
      render();
    },
    'setup-next': () => { const st = setupState(); if (st.step === 1 && !st.orgType) return; st.step = Math.min(3, st.step + 1); UI.setupTyping = false; render(); window.scrollTo(0, 0); },
    'setup-back': () => { const st = setupState(); st.step = Math.max(1, st.step - 1); UI.setupTyping = false; render(); },
    'setup-cancel': () => { UI.setup = null; UI.forceSetup = false; UI.setupTyping = false; render(); },
    'setup-finish': () => {
      const st = setupState();
      const s = settings();
      const keys = ['orgType', 'legalForm', 'smallBusiness', 'nonProfit', 'street', 'zip', 'city', 'taxNumber', 'vatId', 'taxOffice', 'exemptionDate', 'purposes', 'register', 'inventoryLink'];
      const data = { ...s, id: 'company', name: s.name || companyName(), modules: st.modules, setupDone: true };
      for (const k of keys) data[k] = typeof st[k] === 'string' ? st[k].trim() : st[k];
      if (st.hourlyRate !== '' && st.hourlyRate != null) data.hourlyRate = num(st.hourlyRate);
      if (data.orgType === 'club') data.nonProfit = !!st.nonProfit;
      put('settings', data);
      UI.setup = null;
      UI.forceSetup = false;
      UI.setupTyping = false;
      toast('Eingerichtet – viel Erfolg mit NEXCOUNT!', 'ok');
      location.hash = '#/dashboard';
      render();
    },
    'reopen-setup': () => { UI.setup = null; setupState().step = 1; UI.forceSetup = true; location.hash = '#/dashboard'; render(); window.scrollTo(0, 0); },
    // ---------- Bereiche
    space: (el) => {
      UI.space = el.dataset.v;
      const home = SPACES[UI.space].home;
      if (location.hash !== `#/${home}`) location.hash = `#/${home}`;
      else render();
    },
    'new-stock-item': () => openArticle(null, 'product', 'stock'),
    'print-page': () => window.print(),
    // ---------- Verein
    'new-member': () => openMember(),
    'edit-member': (el) => openMember(el.dataset.id),
    'dues-run': () => openDuesRun(),
    'due-paid': (el) => openDuePaid([el.dataset.id]),
    'dues-pay-all': () => {
      const ids = $$('#view [data-action="due-paid"]').map((b) => b.dataset.id);
      openDuePaid(ids);
    },
    'due-waive': (el) => {
      const d = get('dues', el.dataset.id);
      if (!d || !confirm(`Beitrag ${d.periodLabel} von ${d.memberName} (${money(d.amount)}) erlassen?`)) return;
      put('dues', { ...d, status: 'waived' });
      render();
    },
    'due-reopen': (el) => {
      const d = get('dues', el.dataset.id);
      if (!d || !confirm(`Beitrag wieder auf „offen“ setzen?${d.entryId ? ' Die Buchung im Kassenbuch wird entfernt.' : ''}`)) return;
      if (d.entryId && get('entries', d.entryId)) del('entries', d.entryId);
      put('dues', { ...d, status: 'open', paidAt: null, entryId: null });
      render();
    },
    'new-donation': () => openDonation(),
    'edit-donation': (el) => openDonation(el.dataset.id),
    'print-receipt': (el) => printDonationReceipt(get('donations', el.dataset.id)),
    // ---------- Zeiterfassung
    'new-time': () => openTime(),
    'edit-time': (el) => openTime(el.dataset.id),
    'bill-times': (el) => billTimes(el.dataset.id),
    'timer-start': () => { safeLS.set('nexcount:timer', { start: Date.now() }); toast('Timer läuft'); render(); },
    'timer-stop': () => {
      const t = timerState();
      if (!t) return;
      safeLS.del('nexcount:timer');
      const minutes = Math.max(1, Math.round((Date.now() - t.start) / 60000));
      openTime(null, { minutes, date: today() });
      render();
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
    'new-article': (el) => openArticle(null, el.dataset.kind, 'books'),
    'quick-new': () => {
      const m = $('#quick-menu');
      if (m.classList.contains('open')) return m.classList.remove('open');
      m.innerHTML = `<div class="menu-label">Neu anlegen</div>${quickItems().map((q) => quickBtn(q, 'menu-item')).join('')}`;
      m.classList.add('open');
    },
    'apply-preset': (el) => {
      const p = PRESETS[el.dataset.preset];
      if (!confirm(`Vorlage „${p.label}“ übernehmen? Nicht enthaltene Bereiche werden ausgeblendet – ihre Daten bleiben erhalten.`)) return;
      const keepStock = el.dataset.preset === 'all' ? true : mod('inventory');
      put('settings', { ...settings(), id: 'company', setupDone: true, modules: { ...modsFromList(p.modules), inventory: keepStock } });
      toast(`Vorlage „${p.label}“ aktiv`, 'ok');
      render();
    },
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
    // offene Menüs schließen, wenn außerhalb geklickt wird
    const qm = $('#quick-menu');
    if (qm && qm.classList.contains('open') && !e.target.closest('.quick-wrap')) qm.classList.remove('open');
    const shell = $('#shell');
    if (shell && shell.classList.contains('menu-open') && !e.target.closest('.sidebar') && !(el && el.dataset.action === 'toggle-menu')) {
      shell.classList.remove('menu-open');
      if (!el) return;
    }
    if (!el || !ACTIONS[el.dataset.action]) return;
    if (el.closest('#modal-root') && !['archive-article', 'inventory'].includes(el.dataset.action)) return;
    e.preventDefault();
    if (el.closest('#modal-root')) closeModal();
    if (el.closest('#quick-menu')) qm.classList.remove('open');
    try { ACTIONS[el.dataset.action](el, e); } catch (err) { toast(err.message, 'error'); }
  });
  // Funktionen ein-/ausschalten (Einrichtung und Einstellungen)
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset) return;
    // Registrierung: Auswahlfelder und Häkchen merken
    if (el.dataset.reg) {
      REG[el.dataset.reg] = el.type === 'checkbox' ? el.checked : el.value;
      return;
    }
    // Einrichtungsassistent: Häkchen ändern die Ansicht (z. B. Felder für Gemeinnützigkeit)
    if (el.dataset.setupField && UI.setup) {
      UI.setup[el.dataset.setupField] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'checkbox') { UI.setupTyping = false; render(); }
      return;
    }
    // Lager mit der Buchhaltung verknüpfen / trennen
    if (el.hasAttribute('data-link')) {
      if (el.dataset.scope === 'setup') { UI.setup.inventoryLink = el.checked; render(); return; }
      put('settings', { ...settings(), id: 'company', inventoryLink: el.checked });
      toast(el.checked ? 'Lager mit der Buchhaltung verknüpft – Belege buchen ab jetzt Bestände.' : 'Lager getrennt – es läuft jetzt eigenständig.', 'ok');
      render();
      return;
    }
    const key = el.dataset.module;
    if (!key) return;
    const before = el.dataset.scope === 'setup' ? UI.setup.modules : (currentModules());
    const next = toggleModule(before, key, el.checked);
    const also = ALL_MODULES.filter((k) => k !== key && !!before[k] !== !!next[k]).map((k) => MODULES[k].label);
    if (el.dataset.scope === 'setup') {
      UI.setup.modules = next;
      UI.setup.preset = '';
    } else {
      put('settings', { ...settings(), id: 'company', setupDone: true, modules: next });
      toast(`${MODULES[key].label} ${el.checked ? 'aktiviert' : 'ausgeblendet'}${also.length ? ` – ebenso ${also.join(', ')}` : ''}`, 'ok');
    }
    if (also.length && el.dataset.scope === 'setup') toast(`Automatisch ${el.checked ? 'aktiviert' : 'ausgeschaltet'}: ${also.join(', ')}`);
    render();
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.closest && el.closest('#view form[data-form]')) UI.formDirty = true;
    if (el.dataset && el.dataset.reg && el.type !== 'checkbox') { REG[el.dataset.reg] = el.value; return; }
    if (el.dataset && el.dataset.setupField && el.type !== 'checkbox' && UI.setup) { UI.setup[el.dataset.setupField] = el.value; UI.setupTyping = true; return; }
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
  // laufenden Timer der Zeiterfassung sekundengenau anzeigen
  setInterval(() => {
    for (const el of $$('[data-timer-since]')) {
      const s = Math.floor((Date.now() - Number(el.dataset.timerSince)) / 1000);
      el.textContent = `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    }
  }, 1000);
  window.addEventListener('beforeunload', (e) => {
    if (S.user && S.pending.length && !S.online) { e.preventDefault(); e.returnValue = ''; }
  });

  // =============================================================== Start
  async function boot() {
    applyTheme();
    const r = (location.hash.match(/^#\/(\w+)/) || [])[1];
    UI.route = VIEWS[r] ? r : 'dashboard';
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
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
