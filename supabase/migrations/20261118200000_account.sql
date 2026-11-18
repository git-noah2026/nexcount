-- =====================================================================
-- NEXCOUNT – Migration 3: Konto-Funktionen
-- Organisation verlassen, Organisation löschen, Konto löschen; E-Mail-Adresse in members aktuell halten.
-- Wiederholbar. Wird per GitHub Actions (.github/workflows/supabase.yml) eingespielt.
-- =====================================================================

-- me(): übernimmt eine geänderte (bestätigte) E-Mail-Adresse aus dem Login in die Mitgliederliste
create or replace function public.me() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m   public.members%rowtype;
  c   public.companies%rowtype;
  inv text;
  mem jsonb := '[]'::jsonb;
  jwt_email text := auth.jwt() ->> 'email';
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  select * into m from public.members where user_id = auth.uid();
  if not found then
    return jsonb_build_object(
      'user', jsonb_build_object('id', auth.uid(), 'email', jwt_email,
                                 'name', auth.jwt() -> 'user_metadata' ->> 'name', 'role', null),
      'company', null, 'members', '[]'::jsonb);
  end if;
  if jwt_email is not null and jwt_email <> m.email then
    update public.members set email = jwt_email where user_id = m.user_id;
    m.email := jwt_email;
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

-- Organisation verlassen (der letzte Administrator muss vorher jemand anderen zum Admin machen)
create or replace function public.leave_company() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.members%rowtype;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  select * into m from public.members where user_id = auth.uid();
  if not found then raise exception 'NO_COMPANY'; end if;
  if not exists (select 1 from public.members where company_id = m.company_id and user_id <> m.user_id) then
    raise exception 'Du bist die letzte Person in der Organisation. Lösche stattdessen die Organisation oder dein Konto.';
  end if;
  if m.role = 'admin' and not exists (select 1 from public.members where company_id = m.company_id and user_id <> m.user_id and role = 'admin') then
    raise exception 'Du bist der einzige Administrator. Mache zuerst jemand anderen zum Admin.';
  end if;
  delete from public.members where user_id = m.user_id;
  return public.me();
end $$;

-- Organisation mit allen Daten löschen (nur Admins, Bestätigung über den Namen)
create or replace function public.delete_company(p_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := public._require_admin();
  cname text;
begin
  select name into cname from public.companies where id = cid;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(cname)) then
    raise exception 'Bitte zur Bestätigung den Namen der Organisation eingeben.';
  end if;
  delete from public.companies where id = cid;  -- Mitglieder, Einladung und Datensätze per CASCADE
  return public.me();
end $$;

-- Eigenes Konto löschen. Ist man die letzte Person, wird die Organisation mitgelöscht.
create or replace function public.delete_account(p_confirm text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m   public.members%rowtype;
begin
  if uid is null then raise exception 'Nicht angemeldet.' using errcode = '28000'; end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Bitte zur Bestätigung deine E-Mail-Adresse eingeben.';
  end if;
  select * into m from public.members where user_id = uid;
  if found then
    if not exists (select 1 from public.members where company_id = m.company_id and user_id <> uid) then
      delete from public.companies where id = m.company_id;
    elsif m.role = 'admin' and not exists (select 1 from public.members where company_id = m.company_id and user_id <> uid and role = 'admin') then
      raise exception 'Du bist der einzige Administrator. Mache zuerst jemand anderen zum Admin oder lösche die Organisation.';
    end if;
  end if;
  delete from auth.users where id = uid;
end $$;

revoke execute on function public.leave_company(), public.delete_company(text), public.delete_account(text) from public, anon;
grant execute on function public.leave_company(), public.delete_company(text), public.delete_account(text) to authenticated;
