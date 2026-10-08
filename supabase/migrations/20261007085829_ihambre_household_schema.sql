-- Menú en pareja: tabla compartida y políticas RLS.
-- Ejecutar una vez en Supabase → SQL Editor, dentro del proyecto propio.
create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  invite_code text not null unique,
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
revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

create or replace function public.create_household(p_name text, p_code text)
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  insert into public.households(name, invite_code, created_by)
  values (trim(p_name), upper(trim(p_code)), auth.uid()) returning id into new_id;
  insert into public.household_members(household_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;
revoke all on function public.create_household(text, text) from public;
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
revoke all on function public.join_household(text) from public;
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

-- Habilita sincronización casi inmediata entre ambos móviles.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recipes') then
    alter publication supabase_realtime add table public.recipes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planned_meals') then
    alter publication supabase_realtime add table public.planned_meals;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_checks') then
    alter publication supabase_realtime add table public.shopping_checks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'manual_shopping_items') then
    alter publication supabase_realtime add table public.manual_shopping_items;
  end if;
end $$;
