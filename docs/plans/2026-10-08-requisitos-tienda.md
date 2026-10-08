# Plan: requisitos para publicar en App Store y Google Play

- Estado: Hecho en código y staging · pendiente de pasos del dueño (abajo)
- Rama: requisitos-tienda (sale de `expo-router`)

## Objetivo
Cubrir lo que las tiendas exigen o revisan antes de aceptar una app con cuentas de usuario, y separar pruebas de producción.

## Pasos
- [x] **Supabase de pruebas** `ihambre-staging` (`abhoavkbxjbslnvviuhi`, gratis, Irlanda) con el mismo esquema que producción.
- [x] **Migraciones como única fuente de verdad:** `supabase/migrations/` reconstruido con los mismos nombres y versiones que constan en producción (el primero, recuperado del historial de git). Retirado `schema.sql`, que ya no coincidía exactamente.
- [x] **Migración `20261008190000_account_and_household_management`** (solo en staging): ver miembros, quitar miembro (cambia el código), cambiar código, salir de la casa (si eras el último se borra con sus datos; si la creaste, pasa al miembro más antiguo) y borrar la cuenta (sale de todas las casas y borra el usuario de Auth). Códigos generados en el servidor con aleatoriedad criptográfica. Avisos realtime cuando entra o sale alguien.
- [x] **Prueba SQL** `supabase/tests/account_household.sql` en staging: permisos, RLS, traspaso, borrados; se deshace sola.
- [x] **App:** pantallas `Gestionar casa` y `Cuenta y privacidad`, accesos en el menú de cuenta y en la pantalla de casa, recuperar contraseña con código en el login, cambiar contraseña, enlaces a la política de privacidad. Código de invitación con `expo-crypto` en vez de `Math.random()`.
- [x] **Tests de navegador** nuevos (`e2e/account-management.spec.ts`, 5) y comprobación de que fallan si se rompe lo que prueban.
- [x] **Prueba real contra staging** en el navegador: login, ver miembros, quitar miembro (código rotado), borrar cuenta (casa borrada). Cuentas de prueba eliminadas después.
- [x] **Política de privacidad** `auth-site/privacidad.html` con sección `#borrar-cuenta` (Google Play pide un enlace web para borrar la cuenta).
- [x] **Plantilla de correo** para recuperar contraseña (`auth-site/email/recovery.html`).
- [x] **Entornos:** `.env` → staging, `.env.production` → producción. Exportación con `--clear` (la caché de Metro podía publicar el Supabase equivocado).

## Lo que tienes que hacer tú
1. **Aplicar la migración en producción.** Sin ella, las pantallas nuevas dan error con vuestras cuentas reales. Es aditiva: no toca datos existentes y las versiones antiguas de la app siguen funcionando. Pídeselo a un agente ("aplica la migración 20261008190000 en producción") o pégala en el SQL Editor de producción.
2. **Plantilla "Reset password"** en Supabase → Authentication → Emails → Templates, en producción y en staging: asunto `auth-site/email/recovery-subject.txt`, cuerpo `auth-site/email/recovery.html`. Sin ella, el correo trae un enlace en vez del código y la recuperación desde la app no funciona.
3. **Rellenar la política de privacidad:** nombre del responsable y correo de contacto (marcados entre corchetes) y publicarla en la raíz de la rama `gh-pages` (ver README → Web).
4. **DNS en Porkbun (correos en spam):** `_dmarc.ihambre.top` no tiene un registro DMARC real; responde la página de aparcamiento de Porkbun (registro comodín). Añadir un TXT `_dmarc` con `v=DMARC1; p=none; rua=mailto:<tu correo>` y revisar en Resend que SPF y DKIM del dominio estén verificados.
5. **Recompilar el APK** cuando juntes las ramas: Expo Router añade módulos nativos y el APK actual no los tiene.
6. **Decidir si el repositorio pasa a privado** antes de vender la app (GitHub Pages en repositorio privado requiere plan de pago).

## Fuera de alcance (pendiente)
- Protección contra contraseñas filtradas de Supabase: solo en el plan Pro.
- Los scripts `scripts/verify-*` de Hermes apuntan a producción y se niegan a correr con el `.env` de staging: adaptarlos a staging o retirarlos.
- Si a alguien lo quitan de la casa con la app cerrada, lo verá al abrirla; con la app abierta, lo detecta por realtime.
- Modelo de cobro y publicación (paso 5).
