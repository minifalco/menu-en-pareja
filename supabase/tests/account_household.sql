-- Prueba de borrar cuenta y gestión de la casa, con RLS y usuarios simulados.
-- Ejecutar SOLO en staging (SQL Editor o MCP execute_sql). Todo se deshace al final:
-- termina con el error 'TODAS LAS PRUEBAS OK' (o con el nombre de la que falle).
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  h uuid; h2 uuid; code1 text; code2 text; n int; failed boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'prueba-a@ihambre.invalid', 'authenticated', 'authenticated'),
    (b, 'prueba-b@ihambre.invalid', 'authenticated', 'authenticated'),
    (c, 'prueba-c@ihambre.invalid', 'authenticated', 'authenticated');

  -- A crea la casa y B se une.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  h := public.create_household('Casa de prueba', 'PRUEBA23');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert public.join_household('prueba23') = h, 'B se une con el código';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.recipes (household_id, title) values (h, 'Lentejas');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert (select count(*) from public.recipes where household_id = h) = 1, 'B ve la receta de la casa';

  -- Miembros: visibles para la casa, no para C.
  select count(*) into n from public.household_members_list(h);
  assert n = 2, 'household_members_list devuelve 2 miembros';
  assert (select bool_and(email like 'prueba-%') from public.household_members_list(h)), 'los miembros llevan su correo';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  failed := false;
  begin perform public.household_members_list(h); exception when others then failed := true; end;
  assert failed, 'C (ajena) no puede ver los miembros';

  -- Cambiar código: solo quien creó la casa.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  failed := false;
  begin perform public.regenerate_invite_code(h); exception when others then failed := true; end;
  assert failed, 'B (no creadora) no puede cambiar el código';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  code1 := public.regenerate_invite_code(h);
  assert code1 ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$', 'código nuevo con 8 caracteres del alfabeto';
  assert code1 <> 'PRUEBA23', 'el código cambia';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  failed := false;
  begin perform public.join_household('PRUEBA23'); exception when others then failed := true; end;
  assert failed, 'el código antiguo deja de valer';

  -- Expulsar: solo la creadora; el código cambia y B no puede volver con el anterior.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  failed := false;
  begin perform public.remove_household_member(h, a); exception when others then failed := true; end;
  assert failed, 'B no puede expulsar a A';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  failed := false;
  begin perform public.remove_household_member(h, a); exception when others then failed := true; end;
  assert failed, 'A no puede expulsarse a sí misma';
  code2 := public.remove_household_member(h, b);
  assert code2 <> code1, 'expulsar cambia el código';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert not public.is_household_member(h), 'B ya no es miembro';
  assert (select count(*) from public.recipes where household_id = h) = 0, 'B no ve datos de la casa';
  failed := false;
  begin perform public.join_household(code1); exception when others then failed := true; end;
  assert failed, 'B no puede volver con el código anterior';

  -- B vuelve con el código nuevo; A sale y la casa pasa a B.
  assert public.join_household(code2) = h, 'B vuelve con el código nuevo';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.leave_household(h);
  assert not public.is_household_member(h), 'A ya no es miembro tras salir';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert (select bool_and(is_owner) from public.household_members_list(h) where user_id = b), 'la casa pasa a B';
  assert (select count(*) from public.recipes where household_id = h) = 1, 'la receta sigue para B';

  -- B borra su cuenta siendo el último miembro: la casa y sus datos desaparecen.
  perform public.delete_my_account();
  execute 'reset role';
  assert not exists (select 1 from auth.users where id = b), 'el usuario B se borra de Auth';
  assert not exists (select 1 from public.households where id = h), 'la casa sin miembros se borra';
  assert not exists (select 1 from public.recipes where household_id = h), 'sus recetas se borran';

  -- A crea otra casa con C; A borra su cuenta: la casa y la receta siguen para C.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  h2 := public.create_household('Casa compartida', 'OTRA2345');
  insert into public.recipes (household_id, title) values (h2, 'Tortilla');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.join_household('OTRA2345');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.delete_my_account();
  execute 'reset role';
  assert not exists (select 1 from auth.users where id = a), 'el usuario A se borra de Auth';
  assert (select created_by from public.households where id = h2) = c, 'la casa compartida pasa a C';
  assert (select count(*) from public.recipes where household_id = h2) = 1, 'los datos de C se conservan';

  -- Sin sesión (anon) no se puede llamar a nada; las funciones privadas no son accesibles.
  execute 'set local role anon';
  failed := false;
  begin perform public.delete_my_account(); exception when others then failed := true; end;
  assert failed, 'anon no puede borrar cuentas';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  failed := false;
  begin perform private.new_invite_code(); exception when others then failed := true; end;
  assert failed, 'el esquema private no es accesible';
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
