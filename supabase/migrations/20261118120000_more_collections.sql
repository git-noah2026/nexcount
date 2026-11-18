-- =====================================================================
-- NEXCOUNT – Migration 2: weitere Datenbereiche erlauben
-- (Zeiterfassung, Mitgliedsbeiträge, Spenden und künftige Bereiche)
-- Wiederholbar. Wird per GitHub Actions (.github/workflows/supabase.yml) eingespielt.
-- =====================================================================

alter table public.records drop constraint if exists records_collection_check;
alter table public.records add constraint records_collection_check
  check (collection ~ '^[a-z][a-z_]{1,31}$');

create or replace function public.sync(p_ops jsonb default '[]'::jsonb, p_since bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cid       uuid := public.my_company_id();
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
      if jsonb_typeof(op) <> 'object' or v_col is null or v_col !~ '^[a-z][a-z_]{1,31}$'
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
