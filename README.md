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

---

## Requisitos

Se recomienda Docker Compose, así no hace falta instalar Node.js ni PostgreSQL en el equipo.

- **Windows 10/11:** Docker Desktop instalado y activo, con WSL 2 habilitado.
- **Linux/macOS:** Docker Engine o Docker Desktop con el complemento Docker Compose.
- Conexión a internet para descargar imágenes y dependencias durante la primera compilación.

## Configurar el entorno

Desde la carpeta raíz del proyecto, copia la plantilla de variables y edítala.

**Windows PowerShell:**

```powershell
if (-not (Test-Path .env)) {
  if (Test-Path .env.example) {
    Copy-Item .env.example .env
  } else {
    git show HEAD:.env.example | Set-Content -Encoding ascii .env
  }
}
notepad .env
```

**Linux/macOS:**

```bash
if [ ! -f .env ]; then
  if [ -f .env.example ]; then cp .env.example .env; else git show HEAD:.env.example > .env; fi
fi
```

Si la plantilla no existe en tu carpeta, puedes recuperarla desde el commit actual con `git show HEAD:.env.example > .env`.

Define valores diferentes para POSTGRES_PASSWORD, SECRETARY_PASSWORD y SECRETARY_TOKEN_SECRET. En PowerShell, genera tres cadenas aleatorias de 32 bytes y copia cada resultado en la variable indicada dentro de .env:

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
foreach ($name in 'POSTGRES_PASSWORD', 'SECRETARY_PASSWORD', 'SECRETARY_TOKEN_SECRET') {
  $bytes = New-Object byte[] 32
  $rng.GetBytes($bytes)
  "{0}={1}" -f $name, [Convert]::ToBase64String($bytes)
}
$rng.Dispose()
```

En Linux/macOS, ejecuta `openssl rand -base64 32` tres veces. El secreto SECRETARY_TOKEN_SECRET debe tener al menos 32 bytes. No reutilices una clave entre variables.

Completa las credenciales de SendGrid o SMTP para email, y de Twilio para WhatsApp. Sin ellas, las notificaciones quedan pendientes o fallidas; no se muestran como entregadas. En despliegues públicos, configura PUBLIC_WEB_URL con la dirección HTTPS del frontend. No compartas ni subas .env a Git.

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

## Prueba automatizada

La suite del Sprint 1 modifica la base local y lanza solicitudes concurrentes. No la ejecutes contra datos reales. Requiere SECRETARY_PASSWORD y SECRETARY_TOKEN_SECRET en .env:

```powershell
docker compose exec backend npm run test:sprint1
```

La suite puede reservar el bloque de prueba; recrea la base local antes de repetirla si necesitas los datos semilla originales.
