# Medisalud — Gestión de citas médicas

Aplicación web académica para consultar disponibilidad, reservar horas médicas y configurar agendas desde un panel de secretaría. Combina React/Vite, Node.js/Express y PostgreSQL 16 en un entorno local con Docker Compose.

> **Esta rama contiene la implementación inicial del proyecto (Sprint 1).** Para explorar la versión funcional más actual, todavía en desarrollo, visita [`develop`](https://github.com/MartinIVC/medisalud/tree/develop). `main` no debe interpretarse como una versión final o validada para producción.

## Estado de las ramas

| Rama | Alcance |
| --- | --- |
| [`main`](https://github.com/MartinIVC/medisalud/tree/main) | Núcleo inicial: disponibilidad, agendas, reservas y comprobantes. |
| [`develop`](https://github.com/MartinIVC/medisalud/tree/develop) | Versión ampliada con acceso de secretaría, registro de médicos, fotos, gestión de cambios de citas y notificaciones en cola. |

El proyecto es una demostración académica con datos ficticios; no está conectado a una clínica real.

## Qué incluye esta rama

- Consulta de disponibilidad por especialidad, médico y fecha.
- Configuración de bloques de 15, 20 o 30 minutos.
- Bloqueo y rehabilitación de horarios por profesional o fecha.
- Reserva de citas con validación de RUT chileno mediante Módulo 11.
- Generación de un código de reserva y un comprobante de confirmación.
- Transacciones y bloqueo de filas de PostgreSQL para controlar solicitudes sobre un mismo cupo.
- Datos iniciales de demostración con cuatro especialidades y 15 médicos.

## Límites de esta versión

- El panel y las rutas administrativas de esta rama no incorporan autenticación. Ejecuta esta versión únicamente como demo local con datos ficticios.
- El Compose incluido no configura un proveedor de correo. Sin SMTP, el comprobante se registra en memoria: los indicadores de envío del prototipo no prueban que se haya entregado un email.
- Esta rama no incluye el worker de recordatorios, las fotografías, el registro de médicos ni la cancelación y reprogramación disponibles en `develop`.
- La revisión del código permite identificar el alcance, pero no certifica su funcionamiento completo. Los objetivos de latencia y concurrencia deben verificarse en el entorno de prueba; no son garantías de producción.

## Ejecutar la demo local

Necesitas Git, Docker en ejecución y Docker Compose v2. Los puertos 5173, 4000 y 5432 deben estar libres. En Windows y macOS puedes utilizar Docker Desktop; en Linux, Docker Engine con el complemento Compose.

```bash
git clone --branch main --single-branch https://github.com/MartinIVC/medisalud.git medisalud-main
cd medisalud-main
docker compose up -d --build
docker compose ps
```

| Servicio | Dirección |
| --- | --- |
| Portal de pacientes y secretaría | [http://localhost:5173](http://localhost:5173) |
| Estado de la API y conexión a la base | [http://localhost:4000/api/health](http://localhost:4000/api/health) |

El Compose define credenciales locales de demostración y crea el esquema y los datos semilla al inicializar un volumen vacío. No necesitas instalar Node.js o PostgreSQL en el equipo para usar este flujo. La interfaz de esta rama carga Tailwind desde un CDN, por lo que requiere acceso a internet.

Para revisar registros y detener los servicios conservando los datos:

```bash
docker compose logs -f backend
docker compose down
```

No ejecutes ambas ramas simultáneamente con sus configuraciones predeterminadas: comparten nombres de contenedor y puertos. Detén una antes de iniciar la otra. No reutilices una base de `develop` en esta versión inicial; al pasar de `main` a `develop`, consulta sus instrucciones de migración.

## Verificación disponible

La suite [`backend/tests/verify-sprint1.js`](backend/tests/verify-sprint1.js) comprueba datos semilla, configuración y bloqueo de agendas, validación de RUT y 40 solicitudes simultáneas sobre un mismo cupo.

**La prueba modifica agendas y crea reservas en la base configurada.** Esta rama no tiene el entorno aislado ni las protecciones de pruebas de `develop`. Ejecútala solamente en una copia local descartable, sin datos que necesites conservar:

```bash
docker compose exec -T backend npm run test:sprint1
```

El script utiliza la fecha fija `2026-11-15` y presupone cuatro especialidades y 15 médicos. Esas condiciones pueden afectar su resultado y su vigencia. Para las suites actuales y el entorno de PostgreSQL descartable, consulta el [README de `develop`](https://github.com/MartinIVC/medisalud/blob/develop/README.md#verificación-automatizada).

## Estructura

- [`frontend/`](frontend/): interfaz React, Vite y validación de RUT.
- [`backend/src/routes/`](backend/src/routes/): disponibilidad, agendas y reservas.
- [`backend/src/utils/`](backend/src/utils/): validación de RUT y comprobantes de correo.
- [`backend/tests/`](backend/tests/): verificación del Sprint 1.
- [`database/`](database/): esquema SQL y datos iniciales.
- [`docker-compose.yml`](docker-compose.yml): servicios de frontend, backend y PostgreSQL.

Los scripts SQL de inicialización se ejecutan solo al crear un volumen vacío. Detener los servicios con `docker compose down` conserva la base; añadir `-v` elimina el volumen y sus datos.
