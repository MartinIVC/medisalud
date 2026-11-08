# Sistema de diseño — Medisalud

Esta guía reúne las decisiones de **Swiss Signal**, la dirección visual elegida para el rediseño de Medisalud. Úsala al crear o modificar interfaces para pacientes y secretaría. El [brief original](DESIGN_BRIEF.md) conserva el contexto y los objetivos iniciales; sus propuestas de paleta y tipografía fueron sustituidas por las de este documento.

La guía describe la dirección y los patrones existentes en `develop`, no una auditoría de conformidad ni una lista de funcionalidades nuevas. Antes de implementar, revisa el código vigente: los tokens están en [`frontend/src/index.css`](../frontend/src/index.css), y los componentes compartidos en [`frontend/src/components/ui/index.jsx`](../frontend/src/components/ui/index.jsx).

## Principios visuales

- **Claridad editorial:** jerarquiza con tamaño, peso y espacio en blanco. El paciente debe comprender qué hacer y qué ocurrirá después.
- **Estructura Swiss:** utiliza retículas, alineaciones consistentes y separadores discretos; evita contenedores que no aporten información o función.
- **Precisión operativa:** en secretaría prioriza la lectura rápida de horarios, personas, estados y acciones, manteniendo una densidad mayor que en el portal de pacientes.
- **Identidad compartida:** ambas experiencias utilizan los mismos tokens y componentes básicos, con composiciones adaptadas a sus tareas.
- **Sobriedad:** evita degradados, sombras decorativas, tarjetas redundantes, iconos sin función y animaciones innecesarias. Reserva las sombras de elevación para elementos superpuestos, como diálogos.

## Tokens visuales

Los valores CSS son la fuente técnica de referencia. Reutiliza las variables existentes en lugar de introducir colores o medidas equivalentes para cada pantalla.

| Uso                                 | Variable CSS       | Valor     |
| ----------------------------------- | ------------------ | --------- |
| Acción principal                    | `--primary`        | `#214BC0` |
| Acción principal al pasar el cursor | `--primary-hover`  | `#183B9B` |
| Texto principal                     | `--foreground`     | `#172332` |
| Texto secundario                    | `--muted`          | `#4E5B69` |
| Fondo                               | `--background`     | `#FFFFFF` |
| Superficie secundaria               | `--surface`        | `#EDF1F9` |
| Separadores                         | `--border`         | `#C9D2DC` |
| Bordes de controles                 | `--control-border` | `#7D8B9E` |
| Foco visible                        | `--focus`          | `#A44D00` |

### Colores de estado

| Significado             | Variable principal | Valor     | Superficie, cuando corresponda               |
| ----------------------- | ------------------ | --------- | -------------------------------------------- |
| Disponible o éxito      | `--available`      | `#155E58` | `--available-surface`: `#EDF6F2`             |
| Reservado               | `--reserved`       | `#344C79` | Según el contexto; no añadir un estado nuevo |
| Bloqueado o advertencia | `--blocked`        | `#805000` | `--blocked-surface`: `#FFF4D6`               |
| Error                   | `--error`          | `#A1323B` | `--error-surface`: `#FCEDEF`                 |

Los estados se comunican con texto y, cuando corresponda, un símbolo además del color. No cambies el significado de los estados existentes ni inventes estados de negocio por motivos visuales.

### Tipografía, espaciado y forma

- Usa **Manrope** como familia principal, con pesos de 400 a 700 y alternativas sans serif del sistema. No se necesita una segunda familia para distinguir las experiencias.
- Conserva una jerarquía clara entre título, subtítulo, contenido y etiquetas. Los horarios y otras cifras que deban alinearse utilizan `font-variant-numeric: tabular-nums` o la clase `.numeric`.
- La escala base de espaciado es **4, 8, 12, 16, 24, 32 y 48 px**, disponible como variables `--space-*`. Ajusta la densidad según la tarea manteniendo alineaciones coherentes.
- El radio habitual es **2 px** (`--radius`). Usa bordes y separadores para organizar contenido; evita convertir cada sección en una tarjeta.

## Componentes e interacciones

Parte de los componentes existentes y amplíalos solo cuando haya una necesidad compartida real:

| Necesidad         | Referencia               | Regla de uso                                                                                                                                                                             |
| ----------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acciones          | `Button`                 | Usa `primary` para la acción principal, `secondary` para acciones de apoyo, `danger` para acciones destructivas y `text` cuando corresponda. El texto debe describir la acción.          |
| Formularios       | `Field`, `PatientFields` | Mantén etiquetas visibles, ayudas breves y errores asociados al campo. Conserva la validación de RUT y teléfono.                                                                         |
| Mensajes          | `Alert`, `EmptyState`    | Explica qué ocurrió y cuál es el siguiente paso; distingue error, carga, vacío y éxito.                                                                                                  |
| Estados de agenda | `StatusIndicator`        | Combina el nombre del estado con su símbolo y color semántico.                                                                                                                           |
| Ventanas          | `Dialog`                 | Proporciona título y cierre accesibles, permite Escape cuando la operación lo permita y devuelve el foco al control de origen. El contenido debe poder desplazarse sin ocultar acciones. |
| Detalle de cita   | `AppointmentDetails`     | Reutiliza el resumen de profesional, especialidad, fecha y lugar donde se requiera revisar la cita.                                                                                      |

Para nuevas interacciones, contempla los estados normal, hover, foco, deshabilitado, carga y error cuando apliquen. La acción principal debe ser reconocible sin que todas las acciones reciban el mismo énfasis.

## Portal de pacientes

El objetivo es facilitar una reserva sin exigir conocimientos técnicos:

1. Ofrece filtros de especialidad y profesional, incluida la consulta sin filtro específico.
2. Da protagonismo a la fecha y a los horarios disponibles. Consulta automáticamente al cambiar filtros y muestra carga, error con reintento o ausencia de horas según corresponda.
3. Al seleccionar una hora, abre el diálogo de datos. Si se cierra, muestra junto al grupo elegido una franja breve con profesional, fecha, hora y **«Completar reserva»** para reabrirlo conservando el borrador.
4. Separa la entrada de datos de la revisión y confirmación. El paciente debe entender que la hora se reserva al confirmar; conserva el comprobante, su código y las opciones de copia e impresión.

Al cambiar especialidad, profesional o fecha, invalida la hora anterior. Si una reserva entra en conflicto, orienta al paciente para continuar sin perder sus datos. Presenta mensajes breves: no muestres cálculos internos ni detalles técnicos innecesarios.

En escritorio, organiza el contexto del profesional a la izquierda y la disponibilidad a la derecha. En espacios reducidos, apila ambas áreas y mantén las acciones en el flujo de la página.

## Panel de secretaría

La agenda diaria es la vista de trabajo principal. Mantén los filtros de profesional y fecha accesibles y presenta los horarios en filas fáciles de comparar, con paciente o detalle y estado. La fila seleccionada despliega sus acciones en contexto; no obligues a recorrer paneles ajenos a la tarea.

Agrupa la configuración y los formularios relacionados en diálogos accesibles. Las acciones destructivas deben explicar horario, profesional y alcance antes de confirmar. Preserva el contexto seleccionado y los formularios abiertos durante las actualizaciones de datos.

Evita añadir un dashboard independiente, estados o métricas sin una necesidad operativa y datos que los respalden. Las nuevas funciones administrativas deben seguir los contratos y reglas existentes.

## Accesibilidad y adaptación

Estos son **criterios para diseñar y verificar cada cambio**, no una afirmación de que toda la aplicación ya haya sido auditada:

- Busca conformidad con **WCAG 2.2 AA**: comprueba contraste de texto y controles, foco visible, uso mediante teclado y que la información no dependa solo del color.
- Mantén etiquetas asociadas a sus campos, mensajes de error vinculados al control y anuncios apropiados para cambios de estado. Los diálogos deben tener nombre accesible y gestionar entrada y retorno del foco.
- Como objetivo de producto, utiliza áreas táctiles de al menos **44 × 44 px** y texto de **16 px en campos móviles**. Comprueba también ampliación de texto y ausencia de recortes.
- El diseño cambia a una composición apilada por debajo de **1024 px**; por debajo de **640 px** simplifica formularios, agenda y navegación. Hay ajustes adicionales por debajo de **375 px**. Consulta las media queries vigentes antes de añadir puntos de corte.
- Revisa en **320, 390, 768, 1024 y 1440 px**, además de teclado, Escape, estados de carga/error y contenido largo. Evita desbordamientos horizontales y acciones inaccesibles.
- Respeta `prefers-reduced-motion` y conserva la presentación imprimible del comprobante.

## Lista de comprobación para cambios futuros

1. Identifica la tarea del usuario y reutiliza los tokens y componentes existentes.
2. Comprueba las diferencias de densidad entre paciente y secretaría y los estados de la interacción.
3. Verifica teclado, foco, contraste, etiquetas, mensajes, móvil y escritorio en las vistas afectadas.
4. Conserva los contratos, la validación y la lógica de negocio; coordina cualquier cambio funcional por separado.
5. Ejecuta las verificaciones del proyecto y registra qué se probó realmente. Si cambias una decisión visual compartida, actualiza esta guía junto con el código.
