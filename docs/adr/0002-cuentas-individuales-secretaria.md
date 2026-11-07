# ADR-0002: Cuentas individuales y sesiones revocables de secretaría

- **Estado:** Aceptado
- **Fecha:** 2026-11-07
- **Historias:** MED-25 y MED-26

## Contexto

La contraseña compartida no permite identificar a quien gestiona el panel ni revocar la sesión de una persona sin afectar a las demás. La auditoría de acciones corresponde a MED-27 y necesita una identidad validada por el servidor.

## Decisión propuesta

- Registrar cuentas individuales en PostgreSQL, con nombre de usuario único, contraseña derivada mediante `scrypt` con sal aleatoria y estado activo. El hash conserva los parámetros necesarios para su verificación.
- Emitir tokens aleatorios opacos y almacenar únicamente su huella SHA-256 y vencimiento en la tabla de sesiones. Cada petición protegida comprueba que la sesión siga vigente y que la cuenta esté activa. Cerrar sesión revoca el token; desactivar una cuenta o restablecer su contraseña revoca sus sesiones.
- Limitar intentos de acceso por cuenta en ventanas persistentes, con respuesta genérica tanto para credenciales inválidas como para bloqueo temporal. No se aplica un límite por dirección: el proxy compartido no permite distinguir de forma fiable a los clientes sin configuración adicional.
- Limitar a cuatro las autenticaciones simultáneas por proceso, rechazando temporalmente las que excedan ese cupo para evitar saturar el cálculo de contraseñas con usuarios distintos. El cupo se libera incluso si falla una consulta o el cálculo.
- Provisionar y administrar cuentas mediante un comando administrativo ejecutado dentro del entorno del backend. No hay autorregistro público, contraseñas por defecto ni credenciales en los argumentos de la línea de comandos.
- Eliminar la autenticación por contraseña compartida. Las sesiones anteriores dejan de ser válidas; el procedimiento de transición crea una cuenta individual antes de retirar la configuración antigua.
- Mantener una migración para bases existentes y el esquema inicial equivalente para instalaciones nuevas, sin modificar ni eliminar migraciones anteriores.

## Consecuencias

- La autenticación de rutas administrativas depende de PostgreSQL y recibe un identificador de cuenta fiable para la futura auditoría.
- El despliegue debe aplicar la migración y provisionar una primera cuenta antes de poner el nuevo backend en servicio. Las sesiones anteriores se invalidan durante la transición.
- Se necesitan pruebas de autenticación, revocación, bloqueo de intentos y provisión, además de las pruebas de regresión de las rutas administrativas.
- Esta decisión no implementa la bitácora de acciones de MED-27 y conserva el orden de bloqueo de médicos y agendas documentado en ADR-0001.

## Referencias

- `backend/src/middleware/auth.js`
- `backend/src/db/transaction.js`
- `API_CONTRACT.md`
- [OWASP: almacenamiento de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
