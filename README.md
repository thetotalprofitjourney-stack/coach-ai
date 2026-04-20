# Documentación del proyecto Coach AI

Este documento es el índice de toda la documentación que Claude Code necesita para desarrollar el proyecto. Todos los archivos deben estar presentes en el repositorio antes de iniciar el desarrollo, en la carpeta `/docs/` o equivalente.

## Documentos obligatorios

### 1. `proyecto-completo.md`
Documento maestro del proyecto. Contiene flujo de usuario, arquitectura, modelo de datos, especificaciones técnicas y alcance del MVP. **Es la referencia principal.** Todos los demás documentos son anexos operativos que este documento referencia.

### 2. `prompt-fase2.md`
Prompt completo y validado del coach de Fase 2. Debe cargarse íntegro como `system` en las llamadas a la API de Anthropic para el coach principal. Ya validado en el piloto con dos sesiones reales (Daniel y Elena) y produce el comportamiento deseado.

### 3. Los seis hand-offs de prueba
Fixtures de test para validar la Fase 2 antes de que exista la Fase 1. Cada uno representa un perfil distinto que estresa el rol del coach en un eje diferente:

- `handoff-01-daniel.md` — autónomo potencial con autoengaño sobre preparación (perfil D-C alto).
- `handoff-02-carmen.md` — relevo generacional con favoritismo familiar no admitido (perfil S dominante).
- `handoff-03-elena.md` — ama de casa planteándose cambio vital (perfil I-S con baja autoexpresión).
- `handoff-04-javier.md` — directivo ambicioso con coste familiar negado (perfil D-C puro).
- `handoff-05-lucia.md` — joven con parálisis por análisis (perfil C dominante).
- `handoff-06-tomas.md` — oferta internacional con consenso familiar asumido (perfil I-D).

Estos seis hand-offs deben usarse como fixtures en el paso 5 del orden de construcción para validar que el coach de Fase 2 funciona antes de construir la Fase 1.

### 4. `banco-items-disc.json`
Banco fijo de 16 ítems DISC contextualizados (8 profesionales y 8 personales/familiares), con sus cuatro opciones cada uno mapeadas a los factores D, I, S, C. **Los mismos 16 ítems se usan en todas las sesiones de todos los usuarios, sin variación.** La comparabilidad del DISC depende de esta estabilidad. El fichero se integra como recurso estático en el código de la Fase 1.

## Documentos que se generarán durante el desarrollo

Estos no existen todavía. Deben producirse en las fases tempranas del proyecto y añadirse a la documentación:

### 5. `prompt-fase1-administracion.md` (tarea del paso 7)
Prompt del agente conversacional que administra el DISC en Fase 1. La especificación está en la sección 5.1.2 del documento maestro; debe materializarse como archivo.

### 6. `prompt-fase1-sintesis.md` (tarea del paso 7)
Prompt del agente que produce el hand-off estructurado tras el DISC. La especificación está en la sección 5.1.3 del documento maestro; debe materializarse como archivo.

### 7. `prompt-ia-auxiliar.md` (tarea del paso 5)
Prompt de la IA auxiliar que corre en paralelo durante la Fase 2 actualizando el resumen estructurado y detectando hipótesis exploradas. La especificación está en la sección 5.5 del documento maestro.

## Orden de lectura recomendado para Claude Code

1. Leer `proyecto-completo.md` completo para entender visión, flujo y arquitectura.
2. Leer `prompt-fase2.md` para entender el rol del coach principal.
3. Leer uno o dos hand-offs (`handoff-01-daniel.md` y `handoff-03-elena.md` son los más reveladores) para entender la estructura del contrato de entrada de la Fase 2.
4. Arrancar el desarrollo por el paso 1 del orden sugerido en la sección 7.1 del documento maestro.
