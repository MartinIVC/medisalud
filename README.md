# Sistema Medisalud — Gestión de Citas Médicas y Recordatorios en Tiempo Real (`MED`)

Plataforma web modular desarrollada para el **Centro Médico Medisalud** (15 profesionales médicos especialistas distribuidos en *Medicina General, Pediatría, Traumatología y Dermatología*), orientada a reducir el tiempo medio de agendamiento a menos de 60 segundos y erradicar el *overbooking* mediante control transaccional en PostgreSQL.

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

---

## Ejecución del Entorno Staging con Docker Compose

```bash
# 1. Levantar PostgreSQL 16, Backend API (Node.js/Express) y Frontend (React/Vite/Tailwind)
docker compose up -d --build

# 2. Ejecutar suite de verificación del Sprint 1 (Latencia < 2s, Validación RUT y 40 usuarios concurrentes)
docker exec medisalud-backend npm run test:sprint1
```

### Configuración local actualizada

1. Copiar `.env.example` a `.env` y cambiar las claves antes de iniciar los servicios. La contraseña de secretaría y el secreto de firma son obligatorios para usar el panel; las credenciales de proveedores habilitan envíos reales.
2. En una base PostgreSQL existente, respaldar primero y ejecutar `database/migrations/20261028_sprint2.sql`. La migración agrega la cola de notificaciones, respuestas de asistencia, historial de origen e integridad contra horarios solapados. Si existen intervalos históricos superpuestos, corregirlos antes de agregar la restricción.
3. Para una base nueva, el esquema actualizado se aplica desde `database/01_init.sql`.

El correo de confirmación se guarda en PostgreSQL dentro de la transacción de reserva. El worker reintenta los envíos cada 30 segundos. Sin SendGrid o SMTP configurado, los mensajes quedan pendientes/fallidos y nunca se presentan como entregados. WhatsApp requiere las credenciales de Twilio. El estado `ACEPTADO` representa aceptación del proveedor; la entrega final requiere integrar sus callbacks.

El panel de secretaría y los endpoints administrativos requieren sesión. El login se configura mediante `SECRETARY_PASSWORD` y `SECRETARY_TOKEN_SECRET`. Las sesiones vencen en ocho horas.

## Trabajo Sprint 2 incorporado

- **MED-12 / RF-04:** formulario de reserva rápida presencial o telefónica protegido por sesión; conserva la validación RUT y el control concurrente común.
- **MED-13 / RF-05:** recordatorios persistentes 24 horas antes en correo y WhatsApp, acciones con token de un solo uso para confirmar o cancelar, y reintentos del worker.
- **MED-18 / RNF-03:** configuración para SendGrid/SMTP y estados de notificación persistidos. La validación DNS SPF/DKIM/DMARC y la medición de >95 % requieren dominio, proveedor y cuentas reales; siguen pendientes de evidencia externa.

La actualización del calendario de secretaría se consulta cada dos segundos. La sincronización en tiempo real entre navegadores todavía no usa WebSockets y puede tardar hasta ese intervalo.

* **Portal Web (Paciente y Panel Secretaría):** `http://localhost:5173`
* **API Healthcheck (`MED-15`):** `http://localhost:4000/api/health`
