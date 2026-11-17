/*
 * NEXCOUNT – Verbindung zu Supabase
 * Werte aus: Supabase-Dashboard → Project Settings → API (bzw. „Connect“).
 * Der Publishable/anon Key ist öffentlich gedacht; der Zugriff wird über
 * Row Level Security in der Datenbank geschützt (supabase/schema.sql).
 * NIEMALS den secret/service_role Key hier eintragen!
 */
window.NEXCOUNT_CONFIG = {
  supabaseUrl: 'https://DEIN-PROJEKT.supabase.co',
  supabaseKey: 'DEIN-SCHLUESSEL',
};
