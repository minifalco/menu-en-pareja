-- Regression: anon could call the SECURITY DEFINER membership helper;
-- create_household accepted empty invitations, permitting empty-code joins.
-- Explicit grants exist independently of PUBLIC on Supabase projects.
revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text) to authenticated;

-- NOT VALID preserves any legacy rows without altering user data while
-- enforcing the invariant on all subsequent inserts/updates.
alter table public.households add constraint households_invite_code_format
  check (invite_code ~ '^[A-Z0-9]{8,64}$') not valid;

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
