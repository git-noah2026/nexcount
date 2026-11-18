-- =====================================================================
-- NEXCOUNT – Supabase-Schema (Postgres)
-- Wird bei jedem Push auf main per GitHub Actions eingespielt (.github/workflows/supabase.yml).
-- Wiederholbar: kann auch auf einer bereits eingerichteten Datenbank laufen.
-- =====================================================================

-- ---------------------------------------------------------------- Tabellen
create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  seq        bigint not null default 0,        -- fortlaufende Revision für die Synchronisierung
  created_at timestamptz not null default now()
);

create table if not exists public.company_invites (
  company_id uuid primary key references public.companies(id) on delete cascade,
  code       text not null unique
);

create table if not exists public.members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  email      text not null,
  role       text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);
create index if not exists members_company_idx on public.members(company_id);

-- Alle Geschäftsdaten (Artikel, Bewegungen, Kontakte, Belege, Buchungen, Einstellungen)
create table if not exists public.records (
  company_id uuid not null references public.companies(id) on delete cascade,
  collection text not null check (collection in ('articles','movements','contacts','documents','entries','settings')),
  id         text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data       jsonb,                             -- NULL bei gelöschten Datensätzen
  deleted    boolean not null default false,
  updated_at bigint not null,                   -- Client-Zeitstempel (ms) für Last-Write-Wins
  updated_by uuid,
  rev        bigint not null,
  primary key (company_id, collection, id)
);
create index if not exists records_rev_idx on public.records(company_id, rev);

-- ---------------------------------------------------------------- Hilfsfunktionen
create or replace function public.my_company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select company_id from public.members where user_id = auth.uid()
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.members where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------- Row Level Security
alter table public.companies       enable row level security;
alter table public.company_invites enable row level security;
alter table public.members         enable row level security;
alter table public.records         enable row level security;

drop policy if exists "Eigene Firma lesen" on public.companies;
create policy "Eigene Firma lesen" on public.companies
  for select to authenticated using (id = public.my_company_id());

drop policy if exists "Einladungscode nur für Admins" on public.company_invites;
create policy "Einladungscode nur für Admins" on public.company_invites
  for select to authenticated using (company_id = public.my_company_id() and public.my_role() = 'admin');

drop policy if exists "Eigenes Profil, Admins sehen das Team" on public.members;
create policy "Eigenes Profil, Admins sehen das Team" on public.members
  for select to authenticated using (user_id = auth.uid() or (company_id = public.my_company_id() and public.my_role() = 'admin'));

drop policy if exists "Daten der eigenen Firma lesen" on public.records;
create policy "Daten der eigenen Firma lesen" on public.records
  for select to authenticated using (company_id = public.my_company_id());

-- Schreiben ausschließlich über die Funktionen unten
revoke all on public.companies, public.company_invites, public.members, public.records from anon;
revoke insert, update, delete, truncate on public.companies, public.company_invites, public.members, public.records from authenticated;

-- ---------------------------------------------------------------- Profil & Firma
create or replace function public.me() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m   public.members%rowtype;
  c   public.companies%rowtype;
  inv text;
  mem jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  select * into m from public.members where user_id = auth.uid();
  if not found then
    return jsonb_build_object(
      'user', jsonb_build_object('id', auth.uid(), 'email', auth.jwt() ->> 'email',
                                 'name', auth.jwt() -> 'user_metadata' ->> 'name', 'role', null),
      'company', null, 'members', '[]'::jsonb);
  end if;
  select * into c from public.companies where id = m.company_id;
  if m.role = 'admin' then
    select code into inv from public.company_invites where company_id = c.id;
    select coalesce(jsonb_agg(jsonb_build_object('id', x.user_id, 'name', x.name, 'email', x.email, 'role', x.role) order by x.name), '[]'::jsonb)
      into mem from public.members x where x.company_id = c.id;
  end if;
  return jsonb_build_object(
    'user', jsonb_build_object('id', m.user_id, 'name', m.name, 'email', m.email, 'role', m.role),
    'company', jsonb_build_object('id', c.id, 'name', c.name, 'seq', c.seq)
               || case when inv is not null then jsonb_build_object('inviteCode', inv) else '{}'::jsonb end,
    'members', mem);
end $$;

create or replace function public._new_invite_code() returns text
language sql volatile set search_path = '' as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
$$;

create or replace function public._display_name(p_name text) returns text
language sql stable set search_path = '' as $$
  select left(btrim(coalesce(nullif(btrim(p_name), ''),
                             nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
                             split_part(auth.jwt() ->> 'email', '@', 1))), 80)
$$;

create or replace function public.create_company(p_company_name text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'Du gehörst bereits zu einer Firma.'; end if;
  p_company_name := btrim(coalesce(p_company_name, ''));
  if p_company_name = '' or char_length(p_company_name) > 120 then raise exception 'Bitte gib einen gültigen Firmennamen an.'; end if;
  insert into public.companies (name) values (p_company_name) returning id into cid;
  insert into public.company_invites (company_id, code) values (cid, public._new_invite_code());
  insert into public.members (user_id, company_id, name, email, role)
    values (auth.uid(), cid, public._display_name(p_name), coalesce(auth.jwt() ->> 'email', ''), 'admin');
  return public.me();
end $$;

create or replace function public.join_company(p_code text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'Du gehörst bereits zu einer Firma.'; end if;
  select company_id into cid from public.company_invites where code = upper(btrim(coalesce(p_code, '')));
  if cid is null then raise exception 'Einladungscode ist ungültig.'; end if;
  insert into public.members (user_id, company_id, name, email, role)
    values (auth.uid(), cid, public._display_name(p_name), coalesce(auth.jwt() ->> 'email', ''), 'member');
  return public.me();
end $$;

create or replace function public.update_profile(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  p_name := left(btrim(coalesce(p_name, '')), 80);
  if p_name = '' then raise exception 'Name darf nicht leer sein.'; end if;
  update public.members set name = p_name where user_id = auth.uid();
  if not found then raise exception 'NO_COMPANY'; end if;
  return public.me();
end $$;

create or replace function public._require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid;
begin
  select company_id into cid from public.members where user_id = auth.uid() and role = 'admin';
  if cid is null then raise exception 'Nur für Administratoren.' using errcode = '42501'; end if;
  return cid;
end $$;

create or replace function public.update_company(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid := public._require_admin();
begin
  p_name := btrim(coalesce(p_name, ''));
  if p_name = '' or char_length(p_name) > 120 then raise exception 'Bitte gib einen gültigen Firmennamen an.'; end if;
  update public.companies set name = p_name where id = cid;
  return public.me();
end $$;

create or replace function public.rotate_invite() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid := public._require_admin();
begin
  update public.company_invites set code = public._new_invite_code() where company_id = cid;
  return public.me();
end $$;

create or replace function public.set_member_role(p_user uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid := public._require_admin();
begin
  if p_role not in ('admin', 'member') then raise exception 'Ungültige Rolle.'; end if;
  if p_user = auth.uid() then raise exception 'Du kannst deine eigene Rolle nicht ändern.'; end if;
  update public.members set role = p_role where user_id = p_user and company_id = cid;
  if not found then raise exception 'Benutzer nicht gefunden.'; end if;
  return public.me();
end $$;

create or replace function public.remove_member(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid := public._require_admin();
begin
  if p_user = auth.uid() then raise exception 'Du kannst dich nicht selbst entfernen.'; end if;
  delete from public.members where user_id = p_user and company_id = cid;
  if not found then raise exception 'Benutzer nicht gefunden.'; end if;
  return public.me();
end $$;

-- ---------------------------------------------------------------- Synchronisierung
-- Schreibt Änderungen (Last-Write-Wins je Datensatz) in einer Transaktion und liefert
-- alle Änderungen seit p_since zurück. Revisionen werden je Firma lückenlos vergeben.
create or replace function public.sync(p_ops jsonb default '[]'::jsonb, p_since bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cid       uuid := public.my_company_id();
  allowed   text[] := array['articles','movements','contacts','documents','entries','settings'];
  now_ms    bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  page      int := 1000;
  v_seq     bigint;
  start_seq bigint;
  op        jsonb;
  v_col     text;
  v_id      text;
  v_del     boolean;
  v_ts      bigint;
  v_data    jsonb;
  cnt       int;
  last_rev  bigint;
  results   jsonb := '[]'::jsonb;
  conflicts jsonb := '[]'::jsonb;
  changes   jsonb;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  if cid is null then raise exception 'NO_COMPANY'; end if;
  p_ops := coalesce(p_ops, '[]'::jsonb);
  if jsonb_typeof(p_ops) <> 'array' then raise exception 'Ungültige Anfrage.'; end if;
  if jsonb_array_length(p_ops) > 500 then raise exception 'Maximal 500 Änderungen pro Anfrage.'; end if;
  p_since := greatest(coalesce(p_since, 0), 0);

  if jsonb_array_length(p_ops) > 0 then
    -- Sperre auf die Firma: gleichzeitige Schreibvorgänge werden geordnet
    select seq into v_seq from public.companies where id = cid for update;
    start_seq := v_seq;
    for op in select value from jsonb_array_elements(p_ops) loop
      v_col := op ->> 'collection';
      v_id  := op ->> 'id';
      if jsonb_typeof(op) <> 'object' or v_col is null or not (v_col = any (allowed))
         or v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,64}$' then
        results := results || jsonb_build_array(jsonb_build_object('id', op -> 'id', 'ok', false, 'error', 'Ungültige Operation'));
        continue;
      end if;
      v_del := coalesce(op -> 'deleted' = 'true'::jsonb, false);
      v_ts  := case when jsonb_typeof(op -> 'updatedAt') = 'number'
                    then least(greatest(floor((op ->> 'updatedAt')::numeric), 1), now_ms + 300000)::bigint
                    else now_ms end;
      if v_del then
        v_data := null;
      else
        if jsonb_typeof(op -> 'data') is distinct from 'object' then
          results := results || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false, 'error', 'Daten fehlen'));
          continue;
        end if;
        v_data := (op -> 'data') || jsonb_build_object('id', v_id);
        if octet_length(v_data::text) > 262144 then
          results := results || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false, 'error', 'Datensatz zu groß'));
          continue;
        end if;
      end if;

      v_seq := v_seq + 1;
      insert into public.records as r (company_id, collection, id, data, deleted, updated_at, updated_by, rev)
        values (cid, v_col, v_id, v_data, v_del, v_ts, auth.uid(), v_seq)
        on conflict (company_id, collection, id) do update
          set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at,
              updated_by = excluded.updated_by, rev = excluded.rev
          where excluded.updated_at >= r.updated_at;
      get diagnostics cnt = row_count;

      if cnt > 0 then
        results := results || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', true, 'rev', v_seq));
      else
        -- Konflikt: Serverversion ist neuer → an den Client zurückgeben
        v_seq := v_seq - 1;
        results := results || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false, 'conflict', true));
        conflicts := conflicts || coalesce((
          select jsonb_agg(jsonb_build_object('collection', x.collection, 'id', x.id, 'data', x.data, 'deleted', x.deleted, 'updatedAt', x.updated_at, 'rev', x.rev))
            from public.records x
           where x.company_id = cid and x.collection = v_col and x.id = v_id and x.rev <= p_since), '[]'::jsonb);
      end if;
    end loop;
    if v_seq <> start_seq then
      update public.companies set seq = v_seq where id = cid;   -- löst das Live-Signal (Realtime) aus
    end if;
  else
    select seq into v_seq from public.companies where id = cid;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('collection', x.collection, 'id', x.id, 'data', x.data, 'deleted', x.deleted,
                                               'updatedAt', x.updated_at, 'rev', x.rev) order by x.rev), '[]'::jsonb),
         count(*), max(x.rev)
    into changes, cnt, last_rev
    from (select * from public.records where company_id = cid and rev > p_since order by rev limit page) x;

  return jsonb_build_object(
    'seq', case when cnt >= page then last_rev else v_seq end,
    'more', cnt >= page,
    'results', results,
    'changes', changes || conflicts);
end $$;

-- ---------------------------------------------------------------- Rechte auf Funktionen
revoke execute on function public.my_company_id(), public.my_role(), public.me(), public._new_invite_code(),
  public._display_name(text), public.create_company(text, text), public.join_company(text, text),
  public.update_profile(text), public._require_admin(), public.update_company(text), public.rotate_invite(),
  public.set_member_role(uuid, text), public.remove_member(uuid), public.sync(jsonb, bigint)
  from public, anon;

grant execute on function public.my_company_id(), public.my_role(), public.me(),
  public.create_company(text, text), public.join_company(text, text), public.update_profile(text),
  public.update_company(text), public.rotate_invite(), public.set_member_role(uuid, text),
  public.remove_member(uuid), public.sync(jsonb, bigint)
  to authenticated;

-- ---------------------------------------------------------------- Live-Updates (Supabase Realtime)
-- Jede Synchronisierung erhöht companies.seq → alle Geräte der Firma erhalten ein UPDATE-Ereignis.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'companies') then
    alter publication supabase_realtime add table public.companies;
  end if;
end $$;
