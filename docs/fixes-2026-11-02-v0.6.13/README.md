# Fixes 2026-11-02 · v0.6.13

Pedido de Faku: Pablo y Jean no pueden gestionar ni ejecutar SQL por falta de permisos. Hace falta que un admin (Faku) pueda dar permisos, y que los datos sensibles se gestionen con F2A.

Hallazgo: el sistema no tenía F2A (solo `totp` como nombre de columna protegida). Se implementó TOTP (RFC 6238) según el estándar de la casa: secretos cifrados con AES-256-GCM, clave en archivo (`TABULA_KEY_FILE`), falla cerrado sin clave.

## Acceso

- [x] Admin da y quita por usuario `db.sql` (escribir en la consola SQL) y `db.sensitive` (editar columnas protegidas). Verificado: `access.test.ts` y navegador como admin.
- [x] Cada cambio de permiso queda en la auditoría (`access.grant`, `access.revoke`). Verificado: navegador (`access.grant` · `pablo@x:db.sql`).
- [x] F2A propio: activar con app de autenticación, confirmar con un código, restablecer por admin. Verificado: tests y navegador (activación con código real).
- [~] Pablo y Jean usan sus permisos desde su cuenta. Cubierto por tests de miembro; no probado en el navegador con sus cuentas.
- [~] Deploy: falta `TABULA_KEY_FILE` en el VPS (`~/deploy/env/tabula.env`). Sin la clave, F2A no se activa y las columnas protegidas no se editan. Los permisos de consola funcionan igual.

## Consola SQL

- [x] Escritura con permiso `db.sql` (antes solo admin). Verificado: tests.
- [x] Una sentencia que nombra una columna protegida pide `db.sensitive` y código F2A. Verificado: tests.

## Datos protegidos

- [x] Columnas protegidas (contraseña, token, hash) se editan con `db.sensitive` y código F2A, desde la fila. Verificado: navegador como admin (`db.row.update` `usuario#1234567`, sin valor en el log) y tests.
- [x] Un código F2A sirve una sola vez; el replay se rechaza. Verificado: tests.
- [x] Sin F2A activo, sin clave del server o sin permiso, la escritura se rechaza antes de tocar la base. Verificado: tests.

## Pendiente

- [ ] Códigos de respaldo para recuperar F2A sin admin. LTP: cargar como issue en el ROADMAP del producto.
- [ ] QR en la pantalla de activación (hoy: clave a mano y enlace `otpauth://`). LTP.
