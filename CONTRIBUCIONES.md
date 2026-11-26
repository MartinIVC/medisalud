# Evidencia de participación y trazabilidad — MediSalud

Este documento reúne **información observable del historial** sin convertir los commits en una medición de esfuerzo individual. Se propone como ayuda para la evaluación del trabajo en equipo y deberá ser revisado por las personas involucradas antes de usarlo como declaración definitiva de responsabilidades.

## Alcance documentado del Sprint 1

La versión antigua del README de `main` incluía explícitamente estos integrantes y responsabilidades para el **Sprint 1**. Posteriormente se retiró esa tabla en el commit [f683f7a](https://github.com/MartinIVC/medisalud/commit/f683f7a3c310258e1bd6a2ed1351a7d0cd1f4f82); el diff permite verificar el texto original.

| Integrante | Responsabilidad registrada para Sprint 1 | Historias registradas |
| --- | --- | --- |
| Diego Alcántara | Frontend y full-stack: disponibilidad y reserva | MED-9, MED-11 |
| Juan Ortiz | Backend, infraestructura y base de datos: entorno y concurrencia | MED-15, MED-16 |
| Martín Verdugo | Full-stack, agenda de secretaría y QA | MED-10 |

Estas son **atribuciones históricas del documento**, no una afirmación sobre quién realizó todos los cambios posteriores. El [historial de commits](https://github.com/MartinIVC/medisalud/commits/develop) permite consultar la autoría registrada de cada cambio; un commit puede representar trabajo de varias personas y la cuenta de Git no siempre identifica por sí sola a quien revisó o probó el resultado.

## Referencias de PR de la fase posterior

Los PR disponibles públicamente en este repositorio para la etapa posterior están en [Pull requests](https://github.com/MartinIVC/medisalud/pulls?q=is%3Apr+is%3Aclosed). En la auditoría documental del **19 de noviembre de 2026** se observaron los siguientes:

| PR | Asunto registrado | Clave asociada por título |
| --- | --- | --- |
| [#1](https://github.com/MartinIVC/medisalud/pull/1) | Rediseño de frontend | No indicada |
| [#2](https://github.com/MartinIVC/medisalud/pull/2) | Validación de gestión de citas | MED-20 |
| [#3](https://github.com/MartinIVC/medisalud/pull/3) | Cuentas individuales de secretaría | MED-25, según documentación técnica |
| [#4](https://github.com/MartinIVC/medisalud/pull/4) | Ajustes de agenda y avisos | No indicada |
| [#5](https://github.com/MartinIVC/medisalud/pull/5) | Desvinculación de profesionales | MED-24 |
| [#6](https://github.com/MartinIVC/medisalud/pull/6) | Auditoría de secretaría | MED-27 |

En la fecha indicada, los seis PR estaban fusionados y **no mostraban revisiones formales registradas**. No se presentan como aprobados por pares. Si se añaden descripciones después de la fusión, deben identificarse expresamente como reconstrucción retrospectiva.

## Cómo acreditar la participación en adelante

1. Registrar en Jira responsables y criterios de aceptación acordados; verificar los datos con el equipo.
2. Enlazar Jira con el PR y documentar allí la autoría del cambio y la evidencia de validación.
3. Pedir revisiones reales desde las cuentas correspondientes, dejando comentarios y aprobaciones verificables.
4. Para entregas académicas, anexar los enlaces a tickets, PR, ejecuciones de CI y commits relevantes, aclarando qué evidencia corresponde a cada persona.

**Pendiente de validación por el equipo:** distribución de responsabilidades y revisiones de los sprints posteriores al Sprint 1. Este documento no intenta deducirla a partir de la concentración de commits.
