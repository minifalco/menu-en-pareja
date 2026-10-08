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
