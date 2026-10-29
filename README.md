# Sistema Medisalud — Gestión de Citas Médicas y Recordatorios en Tiempo Real (`MED`)

Aplicación web académica para consultar disponibilidad y reservar horas médicas, con un panel de secretaría para configurar agendas y registrar citas presenciales o telefónicas. Usa React/Vite, Node.js/Express y PostgreSQL 16. El entorno de este README es para desarrollo y demostración.

---

## Equipo de Desarrollo (Equipo Astro — Ingeniería de Software I)

* **Diego Alcántara (`[DP]`)** — Frontend & Full-Stack Developer (`MED-9`, `MED-11`)
* **Juan Ortiz (`[JC]`)** — Backend, Infraestructura & Database Lead (`MED-15`, `MED-16`)
* **Martín Verdugo (`[MC]`)** — Full-Stack, Gestión de Agendas & QA (`MED-10`)

---

## Alcance Implementado — Sprint 1 (*"Núcleo de agendamiento y disponibilidad"*)

| Clave JIRA | Requisito / HU | Descripción | Responsable |
| :--- | :--- | :--- | :--- |
| **`MED-15`** | `RNF-02` | Configuración de ambiente Staging (Docker) y base de datos relacional PostgreSQL (`especialidades`, `medicos`, `agendas`, `citas_medicas` + índices). | Juan Ortiz (`[JC]`) |
| **`MED-9`** | `RF-01` (`HU01`) | Consulta pública de disponibilidad de horas médicas por especialidad, profesional y fecha en `< 2,0 s` (`CU-01`: `A-01`, `A-02`). | Diego Alcántara (`[DP]`) |
| **`MED-10`** | `RF-03` (`HU02`) | Configuración de bloques horarios (15, 20 y 30 minutos) y bloqueo de feriados/licencias médicas para secretarias. | Martín Verdugo (`[MC]`) |
| **`MED-16`** | `RNF-01` (`Riesgo R01`) | Implementación de bloqueo pesimista a nivel de fila (`SELECT ... FOR UPDATE`) en PostgreSQL garantizando `0 %` de sobreventa (*overbooking*) y `p95 <= 2,0 s`. | Juan Ortiz (`[JC]`) |
| **`MED-11`** | `RF-02` (`HU03`) | Reserva de cita web con validación algorítmica de RUT chileno (Módulo 11), confirmación con código único + correo (`A-05`) y manejo de rechazos (`A-06`) (`CU-02`). | Diego Alcántara (`[DP]`) |

## Sprint 2 incorporado

| Clave JIRA | Función | Estado |
| --- | --- | --- |
| **`MED-12` / `RF-04`** | Registro rápido de citas presenciales o telefónicas desde el panel de secretaría. | Implementado; reutiliza validación RUT y control de concurrencia. |
| **`MED-13` / `RF-05`** | Programación de recordatorios por email y WhatsApp 24 horas antes, con acciones para confirmar o cancelar. | Cola y worker implementados; requiere credenciales de proveedores para envíos reales. |
| **`MED-18` / `RNF-03`** | Configuración de proveedor y estado persistente de notificaciones. | Preparado; SPF/DKIM/DMARC y la medición real de entrega >95 % siguen pendientes de dominio/proveedor. |

El proveedor puede aceptar un mensaje sin confirmar su entrega final. El proyecto todavía no procesa callbacks de entrega. El panel actualiza su calendario cada dos segundos.

### Registro de médicos (Sprint 3)

Secretaría puede crear médicos activos desde el panel. Cada registro valida el RUT chileno y su unicidad independientemente de puntos y guion. El alta no crea horarios: estos se configuran después desde «Configurar horarios». La cantidad de 15 médicos corresponde a los datos semilla de demostración, no a un límite del sistema.

---

## Requisitos

Para levantar Medisalud en tu propio equipo, necesitas Docker instalado y en ejecución, junto con Docker Compose v2. Así no hace falta instalar Node.js ni PostgreSQL localmente. Cada integrante que ejecute el proyecto por separado necesita Docker en su computador. Si usarán una instancia compartida ya desplegada, basta con acceder a su URL y no necesitan Docker local.

- **Windows 10/11:** Docker Desktop instalado y activo, con WSL 2 habilitado.
- **Linux:** Docker Engine y el complemento Docker Compose v2; el usuario debe tener permiso para acceder al daemon.
- **macOS:** Docker Desktop instalado y activo.
- Conexión a internet para descargar imágenes y dependencias durante la primera compilación.

Comprueba que Docker y Compose estén disponibles:

```bash
docker --version
docker compose version
docker info
```

En Linux, si recibes `permission denied` al acceder a `/var/run/docker.sock`, vuelve a ejecutar los comandos de Docker con `sudo` o solicita al administrador permisos para usar Docker. En Windows y macOS, inicia Docker Desktop antes de ejecutar Compose.

## Configurar el entorno

Docker Compose puede iniciar el proyecto sin un archivo de configuración: usa valores locales predeterminados para PostgreSQL y la URL del frontend. Para entrar al panel de secretaría necesitas configurar `SECRETARY_PASSWORD` y `SECRETARY_TOKEN_SECRET`; sin estas variables, esa función no está disponible. Para la demo local, crea un archivo `.env` en la carpeta raíz.

**Windows PowerShell:** este comando genera un secreto aleatorio de 32 bytes y crea el archivo con credenciales de desarrollo local:

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$tokenSecret = [Convert]::ToBase64String($bytes)
$rng.Dispose()

@(
  'POSTGRES_USER=medisalud',
  'POSTGRES_PASSWORD=medisalud_secret_2026',
  'POSTGRES_DB=medisalud_db',
  'SECRETARY_PASSWORD=MedisaludLocal2026!',
  "SECRETARY_TOKEN_SECRET=$tokenSecret",
  'PUBLIC_WEB_URL=http://localhost:5173'
) | Set-Content -Encoding ascii .env
```

**Linux/macOS:** crea el mismo archivo desde la raíz; reemplaza el valor de `SECRETARY_TOKEN_SECRET` por la salida de `openssl rand -base64 32`.

```bash
TOKEN_SECRET="$(openssl rand -base64 32)"
cat > .env <<EOF
POSTGRES_USER=medisalud
POSTGRES_PASSWORD=medisalud_secret_2026
POSTGRES_DB=medisalud_db
SECRETARY_PASSWORD=MedisaludLocal2026!
SECRETARY_TOKEN_SECRET=$TOKEN_SECRET
PUBLIC_WEB_URL=http://localhost:5173
EOF
unset TOKEN_SECRET
```

La contraseña indicada es solo para la demo local: usa credenciales propias fuera de tu equipo. El archivo `.env` está excluido de Git; no lo compartas ni lo subas al repositorio.

Las credenciales de SendGrid o SMTP (email) y Twilio (WhatsApp) son opcionales para ejecutar la aplicación. Sin ellas, el sistema no podrá enviar notificaciones reales. Para despliegues públicos, configura `PUBLIC_WEB_URL` con la dirección HTTPS del frontend.

## Ejecutar en Windows

1. Instala y abre Docker Desktop. Si te pide habilitar WSL 2, sigue sus instrucciones y reinicia el equipo.
2. Abre PowerShell en la raíz del proyecto. Desde el Explorador puedes abrir la carpeta, escribir `powershell` en la barra de dirección y pulsar Enter.
3. Comprueba Docker:

```powershell
docker --version
docker compose version
docker info
```

4. Configura el archivo .env siguiendo la sección anterior.
5. Construye e inicia PostgreSQL, backend y frontend:

```powershell
docker compose up -d --build
```

6. Revisa el estado de los servicios y los registros del backend:

```powershell
docker compose ps
docker compose logs -f backend
```

7. Abre el portal en [http://localhost:5173](http://localhost:5173) y comprueba la API en [http://localhost:4000/api/health](http://localhost:4000/api/health).

El paciente puede consultar y reservar sin iniciar sesión. El panel de secretaría solicita la contraseña configurada en SECRETARY_PASSWORD; la sesión vence en ocho horas.

Para detener los contenedores conservando la base de datos:

```powershell
docker compose down
```

`docker compose down -v` también elimina el volumen y todos los datos locales. Úsalo solo cuando quieras reiniciar la base desde cero.

## Ejecutar en Linux o macOS

Desde la raíz del proyecto, configura .env y ejecuta:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Si tu usuario de Linux no tiene acceso al daemon, antepón `sudo` a esos comandos; por ejemplo, `sudo docker compose up -d --build`.

Usa las mismas direcciones locales indicadas arriba. Para detener los servicios sin borrar la base, ejecuta `docker compose down`.

## Base de datos y migraciones

En una base nueva, Docker ejecuta los scripts SQL iniciales al crear el volumen por primera vez. No vuelve a ejecutar esos scripts sobre un volumen existente.

Para una base previa, haz un respaldo y corrige cualquier horario superpuesto antes de aplicar la migración del Sprint 2. En PowerShell:

```powershell
Get-Content -Raw .\database\migrations\20261028_sprint2.sql |
  docker compose exec -T db psql -U medisalud -d medisalud_db
```

En Linux/macOS:

```bash
docker compose exec -T db psql -U medisalud -d medisalud_db < database/migrations/20261028_sprint2.sql
```

Si cambiaste POSTGRES_USER o POSTGRES_DB en .env, reemplaza los valores del comando. No ejecutes la migración contra producción sin revisar y respaldar la base.

La migración de RUT normalizado protege también las instalaciones con volumen existente. Antes de aplicarla, revisa y respalda la base. Si detecta dos registros que representan el mismo RUT, se detiene e informa los IDs para resolver la colisión manualmente; no modifica esos registros. En PowerShell:

```powershell
Get-Content -Raw .\database\migrations\20261028_medicos_rut_normalizado.sql |
  docker compose exec -T db psql -U medisalud -d medisalud_db
```

En Linux/macOS:

```bash
docker compose exec -T db psql -U medisalud -d medisalud_db < database/migrations/20261028_medicos_rut_normalizado.sql
```

Para instalaciones que aún no tienen las columnas de toma de notificaciones o la respuesta de idempotencia, aplica después las migraciones `20261028_notifications_leases.sql` y `20261028_idempotency_response.sql`, en ese orden. La base nueva ya incluye esos campos en `database/01_init.sql`.

PowerShell:

```powershell
Get-Content -Raw .\database\migrations\20261028_notifications_leases.sql |
  docker compose exec -T db psql -U medisalud -d medisalud_db
Get-Content -Raw .\database\migrations\20261028_idempotency_response.sql |
  docker compose exec -T db psql -U medisalud -d medisalud_db
```

Linux/macOS:

```bash
docker compose exec -T db psql -U medisalud -d medisalud_db < database/migrations/20261028_notifications_leases.sql
docker compose exec -T db psql -U medisalud -d medisalud_db < database/migrations/20261028_idempotency_response.sql
```

## Verificación automatizada

Para ejecutar las comprobaciones de calidad localmente necesitas Node.js 22.13.0 o posterior, mientras sea menor que la versión 27. Instala dependencias desde los tres lockfiles y ejecuta el conjunto habitual:

```bash
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npm run check
```

`npm run check` ejecuta ESLint, verifica el formato con Prettier, corre las pruebas unitarias de backend y frontend, revisa la sintaxis del arranque del backend y crea el build de Vite con Tailwind incluido. El navegador ya no descarga estilos desde un CDN.

Las pruebas de aceptación Sprint 1 y Sprint 3 modifican datos y solo aceptan una base local cuyo nombre termina en `_test`, declarada explícitamente mediante `TEST_DATABASE_URL` y `TEST_API_URL`. Usa el Compose aislado, que mantiene PostgreSQL en memoria y no lee ni modifica la base normal del proyecto:

```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d --build
docker compose -f docker-compose.test.yml exec -T backend-test npm run test:sprint1
docker compose -f docker-compose.test.yml exec -T backend-test npm run test:sprint3
docker compose -f docker-compose.test.yml down -v
```

Para repetir la aceptación desde una base vacía, ejecuta `down -v` antes de volver a `up`. El servicio de prueba no tiene credenciales de proveedores: valida la cola local, pero no entrega correos ni mensajes reales. CI ejecuta las mismas suites sobre PostgreSQL 16 descartable.

El contrato de errores HTTP y la representación aceptada para RUT están descritos en [API_CONTRACT.md](API_CONTRACT.md).
