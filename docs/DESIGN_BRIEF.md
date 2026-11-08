# Rediseño UI/UX — Medisalud

> **Contexto:** este documento conserva el brief inicial del rediseño. La dirección elegida fue **Swiss Signal**; para nuevas implementaciones, utiliza [el sistema de diseño vigente](DESIGN_SYSTEM.md). En particular, la paleta y las combinaciones tipográficas de este brief son propuestas iniciales, no los tokens actuales.

## Rol

Actúa como un **Senior Product Designer, UI/UX Engineer y Frontend Architect**, especializado en aplicaciones médicas, sistemas de agendamiento y diseño de productos digitales.

Tu misión es transformar el frontend de **Medisalud** en un producto visualmente refinado, profesional, accesible y con una identidad propia.

No quiero un dashboard genérico generado por inteligencia artificial. Quiero una aplicación que parezca diseñada cuidadosamente por un equipo profesional de diseño de producto.

## 1. Contexto del proyecto

Medisalud es un sistema web de agendamiento de citas para un centro médico ficticio.

Dispone de dos experiencias:

**Portal de pacientes**

- Consultar especialidades médicas.
- Seleccionar profesionales.
- Consultar disponibilidad por fecha.
- Seleccionar bloques horarios.
- Reservar citas médicas.
- Validar los datos del paciente y confirmar reservas.

**Panel de secretaría**

- Consultar agendas de los profesionales.
- Configurar bloques horarios de atención.
- Gestionar disponibilidad.
- Bloquear y desbloquear horarios.
- Administrar feriados y ausencias.

Antes de modificar cualquier archivo, inspecciona el repositorio para comprender su arquitectura, componentes, estilos, dependencias, flujos de navegación y comportamiento actual.

El código existente es la fuente de verdad sobre las funcionalidades implementadas.

## 2. Dirección artística

Implementa una identidad visual denominada **Clinical Editorial**.

Combina tres corrientes visuales:

### Minimalismo editorial

Aplicación principal: portal de pacientes.

- Composiciones limpias y elegantes.
- Tipografía con personalidad.
- Jerarquía visual marcada.
- Espacios en blanco deliberados.
- Elementos visuales cuidadosamente seleccionados.
- Apariencia humana, cálida y profesional.

### Swiss Design

Aplicación: estructura general.

- Retículas consistentes.
- Alineaciones precisas.
- Excelente legibilidad.
- Organización racional.
- Espaciado sistemático.
- Jerarquía mediante escala tipográfica y contraste.

### Precision UI

Aplicación principal: panel de secretaría.

- Alta claridad informativa.
- Controles compactos cuando corresponda.
- Calendarios y horarios fácilmente interpretables.
- Estados distinguibles visualmente.
- Herramientas de gestión eficientes.
- Menor ornamentación y mayor funcionalidad.

Ambas experiencias deben compartir una identidad visual, pero no necesariamente la misma estructura.

## 3. Sistema de diseño

Construye un sistema visual consistente basado en tokens reutilizables.

### Paleta inicial

| Token      | Color     |
| ---------- | --------- |
| Primary    | `#155E58` |
| Secondary  | `#A7C4B5` |
| Background | `#F8F7F2` |
| Foreground | `#202D31` |
| Surface    | `#FFFFFF` |

Puedes ajustar estos colores si existe una justificación visual o de accesibilidad.

Define además colores semánticos para estados disponibles, reservados, bloqueados, errores, advertencias y confirmaciones.

No dependas únicamente del color para comunicar estados.

### Tipografía

Explora una combinación de:

- DM Sans para interfaz y formularios.
- Manrope para encabezados.
- Una serif editorial discreta, únicamente donde aporte identidad.

Prioriza legibilidad, jerarquía y consistencia.

### Componentes

Diseña componentes reutilizables para:

- Botones.
- Formularios.
- Selectores.
- Calendarios.
- Bloques horarios.
- Indicadores de estado.
- Mensajes de validación.
- Notificaciones.
- Modales.
- Navegación.
- Estados vacíos y de carga.

Establece reglas coherentes para bordes, radios, sombras, espaciados, interacciones y estados de foco.

## 4. Rediseño del portal de pacientes

La experiencia debe priorizar sencillez, confianza y rapidez.

Organiza visualmente el proceso en tres etapas:

1. Seleccionar especialidad y profesional.
2. Elegir fecha y horario disponible.
3. Ingresar los datos y confirmar la reserva.

No es obligatorio convertirlo en tres páginas distintas. Decide la mejor interacción según la arquitectura existente.

Requisitos:

- Evitar formularios visualmente densos.
- Dar protagonismo al calendario y a los horarios.
- Mostrar claramente la selección actual.
- Mantener visibles los datos importantes de la reserva.
- Comunicar errores de forma comprensible.
- Incorporar estados de carga, éxito y ausencia de disponibilidad.
- Facilitar la navegación en dispositivos móviles.
- Minimizar las acciones necesarias para reservar.

El paciente nunca debería necesitar comprender información técnica del sistema.

## 5. Rediseño del panel de secretaría

La prioridad es la eficiencia operativa.

Diseña una interfaz apropiada para personal administrativo que debe gestionar múltiples profesionales y horarios.

Considera:

- Calendario diario o semanal, si los datos existentes lo permiten.
- Filtros de médico y fecha fácilmente accesibles.
- Distinción clara entre disponibilidad, reservas y bloqueos.
- Controles de configuración agrupados lógicamente.
- Acciones frecuentes accesibles.
- Confirmación para operaciones potencialmente destructivas.
- Feedback inmediato después de modificar una agenda.

Evita estructuras que obliguen a realizar desplazamientos innecesarios o dificulten comparar horarios.

No inventes funcionalidades o estados de negocio que el backend todavía no soporte.

## 6. Eliminar la estética genérica de IA

Evita explícitamente:

- Degradados azules o violetas sin justificación.
- Exceso de tarjetas con bordes redondeados.
- Sombras en todos los contenedores.
- Iconos decorativos sin función.
- Grandes encabezados genéricos de SaaS.
- Distribuciones repetitivas de tarjetas.
- Uso excesivo de badges.
- Animaciones innecesarias.
- Microtextos excesivamente pequeños.
- Componentes visualmente idénticos para funciones diferentes.

No confundas minimalismo con interfaces vacías.

Busca una identidad reconocible mediante tipografía, composición, proporciones, color y detalles consistentes.

## 7. Requisitos técnicos

- Conserva los endpoints y contratos existentes.
- No alteres la lógica de negocio del backend.
- No elimines funcionalidades.
- Mantén la validación de RUT.
- Preserva los controles de disponibilidad y reserva.
- Mantén la gestión de agendas y bloqueos.
- Respeta el stack frontend existente.
- Evita dependencias innecesarias.
- Extrae componentes cuando reduzca complejidad real.
- Utiliza estilos y tokens reutilizables.
- Asegura una experiencia responsive.
- Cumple criterios WCAG 2.2 AA en los componentes pertinentes, incluidos contrastes, foco visible y navegación por teclado.

Los indicadores de sprint, códigos de historias de usuario y datos técnicos de diagnóstico no deben dominar la interfaz del paciente.

Si son necesarios para la evaluación académica, consérvalos en un modo de demostración o sección técnica accesible.

## 8. Metodología de trabajo

### Fase 1 — Auditoría

Inspecciona el frontend actual e identifica:

- Problemas de jerarquía visual.
- Inconsistencias.
- Componentes reutilizables.
- Problemas de experiencia de usuario.
- Riesgos técnicos del rediseño.

### Fase 2 — Propuesta visual

Define el sistema de diseño y explica brevemente:

- Dirección artística.
- Paleta.
- Tipografía.
- Composición.
- Patrones de interacción.
- Diferencias entre portal de pacientes y secretaría.

### Fase 3 — Implementación

Implementa el rediseño progresivamente, manteniendo el comportamiento existente.

No realices cambios ajenos al alcance visual y de experiencia de usuario.

### Fase 4 — Validación

Ejecuta las verificaciones disponibles.

Comprueba especialmente:

- Selección de especialidades.
- Filtrado de profesionales.
- Consulta de disponibilidad.
- Reserva de citas.
- Validación del RUT.
- Gestión de agendas.
- Bloqueo y desbloqueo.
- Responsividad.
- Navegación por teclado.

Si cuentas con herramientas de navegador, revisa visualmente las vistas en tamaños de escritorio y móvil.

No declares una funcionalidad como probada si no pudiste comprobarla.

## 9. Criterios de éxito

El rediseño será satisfactorio cuando:

1. Medisalud tenga una identidad visual propia y coherente.
2. El portal del paciente transmita confianza y resulte intuitivo.
3. El panel de secretaría facilite el trabajo administrativo.
4. Las interfaces no parezcan plantillas genéricas generadas por IA.
5. Los componentes sean accesibles y adaptables.
6. Toda la funcionalidad preexistente se conserve.
7. El código resulte mantenible y fácil de extender.

## Instrucción final

Prioriza la calidad del diseño por encima de la ornamentación.

Cada elección visual debe tener una intención.

**No quiero que Medisalud simplemente se vea más moderno. Quiero que se sienta como un producto sanitario real, con una experiencia cuidadosamente diseñada.**

Comienza revisando el repositorio y elaborando una propuesta concreta. Después implementa el rediseño, validando que las funcionalidades existentes permanezcan intactas.
