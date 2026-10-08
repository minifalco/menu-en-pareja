-- Requisitos de tienda: borrar la cuenta desde la app y gestionar la casa
-- (ver miembros, expulsar, salir y cambiar el código de invitación).
-- Las funciones auxiliares viven en el esquema "private", que la API no expone.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Código de invitación: 8 caracteres de un alfabeto de 32 (sin 0/O/1/I).
-- Usa bytes aleatorios de gen_random_uuid() y salta el byte 6, cuyos bits de
-- versión fijos reducirían la variedad; al byte 8 solo le fijan los 2 bits altos.
create or replace function private.new_invite_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  code text := '';
  i int;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 7, 8] loop
    code := code || substr(alphabet, get_byte(bytes, i) % 32 + 1, 1);
  end loop;
  return code;
end;
$$;

create or replace function private.rotate_invite_code(p_household uuid)
returns text language plpgsql set search_path = '' as $$
declare code text;
begin
  loop
    code := private.new_invite_code();
    begin
      update public.households set invite_code = code where id = p_household;
      return code;
    exception when unique_violation then
      -- Colisión con otra casa (muy improbable): se prueba otro código.
    end;
  end loop;
end;
$$;

-- Saca a un usuario de una casa. Si era el último miembro, la casa y todos sus
-- datos se borran; si la había creado, la casa pasa al miembro más antiguo.
create or replace function private.leave_household(p_user uuid, p_household uuid)
returns void language plpgsql set search_path = '' as $$
declare heir uuid;
begin
  perform 1 from public.households where id = p_household for update;
  delete from public.household_members where household_id = p_household and user_id = p_user;
  if not found then raise exception 'No perteneces a esta casa.'; end if;
  select m.user_id into heir from public.household_members as m
  where m.household_id = p_household order by m.joined_at, m.user_id limit 1;
  if heir is null then
    delete from public.households where id = p_household;
  else
    update public.households set created_by = heir where id = p_household and created_by = p_user;
  end if;
end;
$$;

revoke all on function private.new_invite_code() from public, anon, authenticated;
revoke all on function private.rotate_invite_code(uuid) from public, anon, authenticated;
revoke all on function private.leave_household(uuid, uuid) from public, anon, authenticated;

-- Miembros de una casa con su correo, solo para quien pertenece a ella.
create or replace function public.household_members_list(p_household uuid)
returns table (user_id uuid, email text, joined_at timestamptz, is_owner boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_household_member(p_household) then raise exception 'No perteneces a esta casa.'; end if;
  return query
    select m.user_id, u.email::text, m.joined_at, m.user_id = h.created_by
    from public.household_members as m
    join public.households as h on h.id = m.household_id
    join auth.users as u on u.id = m.user_id
    where m.household_id = p_household
    order by m.joined_at, m.user_id;
end;
$$;

create or replace function public.leave_household(p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  perform private.leave_household(auth.uid(), p_household);
end;
$$;

-- Solo quien creó la casa. El código cambia para que no pueda volver a entrar.
create or replace function public.remove_household_member(p_household uuid, p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  if not exists (select 1 from public.households where id = p_household and created_by = auth.uid()) then
    raise exception 'Solo quien creó la casa puede quitar miembros.';
  end if;
  if p_user = auth.uid() then raise exception 'Para irte de la casa usa «Salir de la casa».'; end if;
  delete from public.household_members where household_id = p_household and user_id = p_user;
  if not found then raise exception 'Esa persona ya no está en la casa.'; end if;
  return private.rotate_invite_code(p_household);
end;
$$;

create or replace function public.regenerate_invite_code(p_household uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  if not exists (select 1 from public.households where id = p_household and created_by = auth.uid()) then
    raise exception 'Solo quien creó la casa puede cambiar el código.';
  end if;
  return private.rotate_invite_code(p_household);
end;
$$;

-- Borra la cuenta de quien llama. Sale de todas sus casas (las que se quedan sin
-- miembros se borran con sus datos; las demás siguen para el resto) y elimina el
-- usuario de Auth, lo que invalida todas sus sesiones.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  houses uuid[];
  house uuid;
begin
  if uid is null then raise exception 'Debes iniciar sesión.'; end if;
  select coalesce(array_agg(m.household_id), '{}') into houses from public.household_members as m where m.user_id = uid;
  foreach house in array houses loop
    perform private.leave_household(uid, house);
  end loop;
  -- Casas antiguas creadas por esta cuenta sin ser miembro: se traspasan o, sin nadie, se borran.
  update public.households as h set created_by = (
    select m.user_id from public.household_members as m where m.household_id = h.id order by m.joined_at, m.user_id limit 1
  ) where h.created_by = uid and exists (select 1 from public.household_members as m where m.household_id = h.id);
  delete from public.households where created_by = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.household_members_list(uuid) from public, anon;
revoke all on function public.leave_household(uuid) from public, anon;
revoke all on function public.remove_household_member(uuid, uuid) from public, anon;
revoke all on function public.regenerate_invite_code(uuid) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.household_members_list(uuid) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- Avisar a la casa cuando entra o sale alguien, para que las apps se actualicen.
drop trigger if exists notify_household_change on public.household_members;
create trigger notify_household_change after insert or delete on public.household_members
for each row execute function public.notify_household_change();
