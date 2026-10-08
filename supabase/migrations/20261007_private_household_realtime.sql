-- postgres_changes DELETE cannot enforce row RLS/filtering; it leaked primary
-- keys to outsiders and failed to invalidate filtered member subscriptions.
-- Send row-free invalidations on private, membership-authorized channels.
create policy household_broadcast_read on realtime.messages
for select to authenticated using (
  extension = 'broadcast' and
  case when realtime.topic() ~ '^household:[0-9a-fA-F-]{36}$'
    then public.is_household_member(split_part(realtime.topic(), ':', 2)::uuid)
    else false end
);
create policy household_broadcast_read_guard on realtime.messages
as restrictive for select to authenticated using (
  case when realtime.topic() like 'household:%'
    then case when realtime.topic() ~ '^household:[0-9a-fA-F-]{36}$'
      then public.is_household_member(split_part(realtime.topic(), ':', 2)::uuid)
      else false end
    else true end
);
create policy household_broadcast_no_client_send on realtime.messages
as restrictive for insert to authenticated with check (realtime.topic() not like 'household:%');

create or replace function public.notify_household_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if TG_OP = 'DELETE' then target := OLD.household_id;
  else target := NEW.household_id; end if;
  perform realtime.send(
    jsonb_build_object('household_id', target, 'table', TG_TABLE_NAME, 'operation', TG_OP),
    'change', 'household:' || target::text, true
  );
  if TG_OP = 'UPDATE' and OLD.household_id is distinct from NEW.household_id then
    perform realtime.send(
      jsonb_build_object('household_id', OLD.household_id, 'table', TG_TABLE_NAME, 'operation', TG_OP),
      'change', 'household:' || OLD.household_id::text, true
    );
  end if;
  return null;
end;
$$;
revoke all on function public.notify_household_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['recipes','planned_meals','shopping_checks','manual_shopping_items'] loop
    execute format('create trigger notify_household_change after insert or update or delete on public.%I for each row execute function public.notify_household_change()',t);
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime drop table public.%I',t);
    end if;
  end loop;
end $$;
