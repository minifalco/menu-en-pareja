-- Menú en pareja: tabla compartida y políticas RLS.
-- Ejecutar una vez en Supabase → SQL Editor, dentro del proyecto propio.
create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{8,64}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null,
  day_date date not null,
  slot text not null check (slot in ('comida', 'cena')),
  title text not null,
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  created_at timestamptz not null default now()
);
create index if not exists planned_meals_week_idx on public.planned_meals(household_id, week_start, day_date);

create table if not exists public.shopping_checks (
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null,
  item_key text not null,
  checked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (household_id, week_start, item_key)
);

create table if not exists public.manual_shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null,
  name text not null check (length(trim(name)) between 1 and 100),
  quantity numeric,
  unit text,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists manual_shopping_week_idx on public.manual_shopping_items(household_id, week_start);

create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household and user_id = auth.uid()
  );
$$;
revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

create or replace function public.create_household(p_name text, p_code text)
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  if p_code is null or upper(trim(p_code)) !~ '^[A-Z0-9]{8,64}$' then
    raise exception 'El código debe contener entre 8 y 64 letras o números.';
  end if;
  insert into public.households(name, invite_code, created_by)
  values (trim(p_name), upper(trim(p_code)), auth.uid()) returning id into new_id;
  insert into public.household_members(household_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;
revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  select id into target_id from public.households where invite_code = upper(trim(p_code));
  if target_id is null then raise exception 'Código de casa no válido.'; end if;
  insert into public.household_members(household_id, user_id)
  values (target_id, auth.uid()) on conflict do nothing;
  return target_id;
end;
$$;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.recipes enable row level security;
alter table public.planned_meals enable row level security;
alter table public.shopping_checks enable row level security;
alter table public.manual_shopping_items enable row level security;

drop policy if exists households_read_member on public.households;
create policy households_read_member on public.households for select to authenticated using (public.is_household_member(id));
drop policy if exists households_update_owner on public.households;
create policy households_update_owner on public.households for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists members_read_same_house on public.household_members;
create policy members_read_same_house on public.household_members for select to authenticated using (public.is_household_member(household_id));

drop policy if exists recipes_member_all on public.recipes;
create policy recipes_member_all on public.recipes for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists planned_meals_member_all on public.planned_meals;
create policy planned_meals_member_all on public.planned_meals for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists shopping_checks_member_all on public.shopping_checks;
create policy shopping_checks_member_all on public.shopping_checks for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists manual_items_member_all on public.manual_shopping_items;
create policy manual_items_member_all on public.manual_shopping_items for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

-- Las invalidaciones privadas incluyen borrados sin filtrar claves primarias
-- a usuarios ajenos a la casa. No publicar estas tablas con postgres_changes.
drop policy if exists household_broadcast_read on realtime.messages;
create policy household_broadcast_read on realtime.messages
for select to authenticated using (
  extension = 'broadcast' and
  case when realtime.topic() ~ '^household:[0-9a-fA-F-]{36}$'
    then public.is_household_member(split_part(realtime.topic(), ':', 2)::uuid)
    else false end
);
drop policy if exists household_broadcast_read_guard on realtime.messages;
create policy household_broadcast_read_guard on realtime.messages
as restrictive for select to authenticated using (
  case when realtime.topic() like 'household:%'
    then case when realtime.topic() ~ '^household:[0-9a-fA-F-]{36}$'
      then public.is_household_member(split_part(realtime.topic(), ':', 2)::uuid)
      else false end
    else true end
);
drop policy if exists household_broadcast_no_client_send on realtime.messages;
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
    execute format('drop trigger if exists notify_household_change on public.%I',t);
    execute format('create trigger notify_household_change after insert or update or delete on public.%I for each row execute function public.notify_household_change()',t);
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime drop table public.%I',t);
    end if;
  end loop;
end $$;

-- Stable recipe references and atomic recipe -> menu -> shopping updates.
-- No meals, checks, manual items, recipes, or household memberships are deleted.
create unique index if not exists recipes_household_id_id_unique
  on public.recipes (household_id, id);
alter table public.planned_meals add column if not exists recipe_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.planned_meals'::regclass and conname = 'planned_meals_recipe_same_house') then
    alter table public.planned_meals add constraint planned_meals_recipe_same_house
      foreign key (household_id, recipe_id) references public.recipes (household_id, id)
      on delete set null (recipe_id);
  end if;
end $$;
create index if not exists planned_meals_recipe_idx on public.planned_meals (household_id, recipe_id);

-- Bind only unambiguous legacy titles, without changing IDs, dates or slots.
-- This also repairs stale ingredient snapshots that predate the new client.
update public.planned_meals as meal
set recipe_id = recipe.id, title = recipe.title, ingredients = recipe.ingredients
from public.recipes as recipe
where meal.recipe_id is null
  and meal.household_id = recipe.household_id and meal.title = recipe.title
  and not exists (
    select 1 from public.recipes as other
    where other.household_id = recipe.household_id and other.title = recipe.title and other.id <> recipe.id
  );

create or replace function public.bind_planned_recipe()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare candidate uuid; canonical record;
begin
  -- Older installed clients still INSERT without recipe_id.
  if new.recipe_id is null then
    select recipe.id into candidate from public.recipes as recipe
    where recipe.household_id = new.household_id and recipe.title = new.title
      and not exists (
        select 1 from public.recipes as other
        where other.household_id = recipe.household_id and other.title = recipe.title and other.id <> recipe.id
      );
    new.recipe_id := candidate;
  end if;
  if new.recipe_id is not null then
    -- The lock makes concurrent planning and recipe edits agree on the payload.
    select recipe.title, recipe.ingredients into canonical from public.recipes as recipe
    where recipe.id = new.recipe_id and recipe.household_id = new.household_id for share;
    if not found then raise exception 'La receta no pertenece a esta casa.'; end if;
    new.title := canonical.title;
    new.ingredients := canonical.ingredients;
  end if;
  return new;
end;
$$;
revoke all on function public.bind_planned_recipe() from public, anon, authenticated;
drop trigger if exists bind_planned_recipe on public.planned_meals;
create trigger bind_planned_recipe before insert or update of recipe_id, household_id, title, ingredients
on public.planned_meals for each row execute function public.bind_planned_recipe();

create or replace function public.refresh_planned_recipe()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- The recipe UPDATE and every linked meal UPDATE commit or roll back together.
  -- Existing private household notifications become visible only after commit.
  update public.planned_meals set title = new.title, ingredients = new.ingredients
  where household_id = new.household_id and recipe_id = new.id
    and (title is distinct from new.title or ingredients is distinct from new.ingredients);
  return null;
end;
$$;
revoke all on function public.refresh_planned_recipe() from public, anon, authenticated;
drop trigger if exists refresh_planned_recipe on public.recipes;
create trigger refresh_planned_recipe after update of title, ingredients on public.recipes
for each row execute function public.refresh_planned_recipe();
