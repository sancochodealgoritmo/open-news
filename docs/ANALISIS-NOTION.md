# Análisis: qué data va a Notion (esquema real vs data generada)

Con acceso real al esquema de las 8 bases y a la data `raw`/`processed`, este documento define el mapeo **data → Notion** y los desajustes entre el sync actual ([`sync.js`](open-news/src/notion/sync.js:1)) y el esquema real.

---

## 1. Esquema real de Notion (8 bases)

### BD Fichas
- `ID caso` (title), `Evento` (rich_text), `Titular elegido` (rich_text), `Afirmaciones` (rich_text), `Citas` (rich_text), `IDs fuente` (rich_text), `Verificaciones pendientes` (rich_text), `Versión de reglas` (rich_text), `Versión de prompt` (rich_text)
- `P` (number), `R` `I` `U` `N` `E` (number), `Procedencias independientes` (number)
- `Banda` (**formula**), `Modalidad` (select: TVN · Principal / TVN · Digital / Banca), `Tema` (select: economía / logística/Canal / turismo / servicios públicos / eventos naturales / regulación / otros), `Estado de evidencia` (select: insuficiente / parcial / suficiente), `Estado de revisión` (select: nuevo / en revisión / requiere evidencia / aprobado como borrador / descartado), `Nivel de atención` (select: sin señales / revisar / verificación prioritaria), `Alcance del texto` (select: completo / extracto / solo titular/metadatos), `Horizonte` (select: corto / medio / largo / indeterminado)
- `Señales` (multi_select: SC-01 … SC-09 con etiqueta), `Sectores` (multi_select: 9 sectores)
- `Persona revisora` (**people**), `Fecha de revisión` (date)
- `Revisiones` (relation), `Pruebas` (relation)

### BD Revisiones
- `Revisión` (title), `Ficha` (relation), `Decisión` (select: aceptación / corrección / descarte / solicitud de evidencia), `Persona` (**people**), `Fecha y hora` (date), `Motivo` (rich_text), `Correcciones (antes/después)` (rich_text), `Utilidad 1–5` (number), `Versión del borrador` (rich_text)

### BD Bitácora
- `Entrada` (title), `Tipo` (select: avance / incidente / cambio de regla / cambio de prompt / prueba / corrección), `Detalle` (rich_text), `Autor` (people), `Fecha y hora` (date), relations a Reglas/Prompts/Pruebas/Decisiones/Tareas

### BD Reglas
- `Versión` (title), `Peso R/I/U/N/E` (number), `Parámetros` (rich_text), `Motivo del cambio` (rich_text), `Impacto observado` (rich_text), `Fecha` (date), `Decisión` (relation)

### BD Prompts
- `Prompt` (title), `ID` (select: P00…P09), `Etapa` (select: S1…S7 / Transversal), `Modalidad` (select: Común / TVN · Principal / TVN · Digital / Banca), `Estado` (select: borrador / activo / retirado), `Versión` (rich_text), `Hash` (rich_text), `Parámetros` (rich_text), `Cambios vs versión anterior` (rich_text), `Pruebas` (relation)

### BD Fuentes
- `Fuente` (title), `Familia` (select: A · Noticias / B · Banco Mundial / C · USGS / D · SBP), `URL` (url), `Registros crudos/válidos/excluidos` (number), `Campos` `Transformaciones` `Consultas usadas` `Licencia/condiciones` `SHA-256` `Versión de manifest` (rich_text), `Cobertura desde/hasta` `Fecha de extracción UTC` (date), `Redistribución` (select), `Responsable` (people)

### BD Ejecuciones
- `Run` (title), `Conjunto` (select: desarrollo 40 / reservado 20), `Versión` (rich_text), `Métricas` (rich_text), `Mediana (s)` `p95 (s)` `Tokens` `Costo (USD)` (number), `Fecha` (date), `Fallos` (files)

### BD Pruebas
- `ID` (title), `Caso` `Entrada` `Resultado esperado` `Resultado observado` `Corrección aplicada` `Versión del sistema` (rich_text), `Estado` (select: pendiente / pasa / falla / corregida), `Fecha` (date), `Evidencia de ejecución` (files), relations a Fichas/Riesgos/Prompts/Tareas

---

## 2. Estructura real de la data

- **Noticia** (`data/raw/noticias.csv` → `registros.json`): `id_noticia, titulo, url, url_canonica, id_estable, medio, idioma, fecha_publicacion, fecha_deteccion, fecha_extraccion, tema, origen, alcance_texto, descripcion, procedencia, dominio, id_evento`.
- **Evento** (`data/processed/eventos.jsonl`): `id_evento, miembros, n_notas, n_procedencias, procedencias, fecha_original, fecha_publicacion, medios, dominios, titulos, tema, geo, afirmaciones, contradiccion_abierta, impacto, es_recirculacion, vinculo_oficial, fuente_primaria, texto_disponible, filtro, contexto_oficial`.
- **Ficha** (dentro de `data/processed/bandejas/{modulo}.json` → `bandeja[]` y `verificacion[]`): `id_caso, modalidad, tema, ids_fuente, procedencias, fecha_original, afirmaciones[], citas[], puntaje, componentes{R,I,U,N,E}, banda, version_reglas, estado_evidencia, senales[], alcance_texto, corresponde_aviso, ruta_fd, nivel_atencion, senales_detalle[], verificaciones_pendientes[], liberacion, resumen, vacios, accion_recomendada, id_evento`.

> Nota: `data/processed/fichas.jsonl` **no contiene fichas individuales** — contiene las 3 bandejas completas (`{bandeja, verificacion, retenidos}`). Las fichas reales están en `bandejas/*.json`.

---

## 3. Mapeo data → Notion (qué va en cada base)

### 3.1 BD Fichas — una fila por **caso trabajado** (no todo el corpus)

| Data (ficha) | Propiedad Notion | Tipo | Transformación |
|---|---|---|---|
| `id_caso` | `ID caso` | title | directo |
| `id_evento` | `Evento` | rich_text | directo |
| `titulo` (titular elegido) | `Titular elegido` | rich_text | de `titulos[0]` |
| `afirmaciones[]` | `Afirmaciones` | rich_text | serializar `texto` + `citas` |
| `citas[]` | `Citas` | rich_text | serializar IDs/pasajes |
| `ids_fuente[]` | `IDs fuente` | rich_text | join |
| `verificaciones_pendientes[]` | `Verificaciones pendientes` | rich_text | join de `accion` |
| `version_reglas` | `Versión de reglas` | rich_text | directo |
| `puntaje` | `P` | number | directo |
| `componentes.R/I/U/N/E` | `R/I/U/N/E` | number | directo |
| `procedencias` | `Procedencias independientes` | number | directo |
| `modalidad` | `Modalidad` | select | principal→TVN · Principal, digital→TVN · Digital, banca→Banca |
| `tema` | `Tema` | select | **normalizar a slug controlado** (economia→economía, logistica_canal→logística/Canal, etc.) |
| `estado_evidencia` | `Estado de evidencia` | select | directo |
| `estado_revision` | `Estado de revisión` | select | en_revision→en revisión, aprobado_borrador→aprobado como borrador, etc. |
| `nivel_atencion` | `Nivel de atención` | select | sin_senales→sin señales, verificacion_prioritaria→verificación prioritaria |
| `alcance_texto` | `Alcance del texto` | select | titular/metadatos→solo titular/metadatos |
| `senales[]` (objetos) | `Señales` | multi_select | mapear `{codigo}` → etiqueta "SC-XX …" |
| `sectores[]` / `horizonte` (solo banca) | `Sectores` / `Horizonte` | multi_select / select | directo |
| `liberacion.por` / `persona_revisora` | `Persona revisora` | **people** | resolver nombre → usuario |
| — | `Banda` | formula | **no se escribe** (calculada) |

### 3.2 BD Revisiones — una fila por acción (solo anexar)

| Data (revisión) | Propiedad Notion | Transformación |
|---|---|---|
| `id_caso` | `Ficha` (relation) | relation a la ficha |
| `hacia` | `Decisión` | aprobar→aceptación, descartar→descarte, requiere_evidencia→solicitud de evidencia, tomar→corrección |
| `persona` | `Persona` | **people** |
| `detalle.motivo` | `Motivo` | directo |
| `detalle.utilidad` | `Utilidad 1–5` | number |
| timestamp | `Fecha y hora` | date |

### 3.3 BD Fuentes — catálogo de fuentes de ingesta (manual/ops)

| Data | Propiedad Notion |
|---|---|
| `medio` | `Fuente` (title) |
| origen (TVN RSS/GDELT/WB/USGS) | `Familia` (A/B/C/D) |
| `url` | `URL` |
| conteos | `Registros crudos/válidos/excluidos` |
| manifest SHA-256 | `SHA-256`, `Versión de manifest` |
| fechas | `Cobertura desde/hasta`, `Fecha de extracción UTC` |

### 3.4 BD Reglas / Prompts / Bitácora / Ejecuciones / Pruebas

- **Reglas**: `rulesVersion` + pesos R/I/U/N/E + parámetros → fila por versión (hoy «RIUNE v1.0»).
- **Prompts**: P00–P09 con `Versión`, `Hash`, `Parámetros`, `Estado`, `Modalidad`, `Etapa` → fila por prompt versionado (hoy están embebidos en código, no en BD).
- **Bitácora**: incidentes/cambios (manual/ops) con `Tipo`, `Detalle`, `Autor`.
- **Ejecuciones**: resultados del benchmark (`Run`, métricas, latencias, tokens, costo).
- **Pruebas**: resultados de pruebas (manual/CI).

---

## 4. Desajustes entre [`sync.js`](open-news/src/notion/sync.js:1) y el esquema real

1. **`Banda`**: el sync escribe un `select`, pero en Notion es **formula** → fallará (o se ignora). No debe escribirse.
2. **`Ruta FD`** y **`Liberado por`**: el sync los escribe, pero **no existen** en el esquema FICHAS → error de propiedad desconocida.
3. **`Modalidad`**: sync envía `principal`; Notion espera `TVN · Principal`.
4. **`Tema`**: sync envía slugs (`logistica_canal`) o **texto libre de la IA**; Notion espera `economía`, `logística/Canal`, etc. Hay que normalizar.
5. **`Nivel de atención`**: sync envía `sin_senales`; Notion espera `sin señales`.
6. **`Estado de revisión`**: sync envía `aprobado_borrador`; Notion espera `aprobado como borrador`.
7. **`Señales`**: la data trae **objetos** `{codigo, razon, …}`; el sync hace `map(s => ({name: s}))` → quedaría `[object Object]`. Hay que mapear a las etiquetas SC-XX.
8. **`Persona revisora` / `Persona`**: son **people**; el sync escribe `rich_text`.
9. **`Decisión`**: sync envía `hacia` (`aprobar`/`descartar`/…); Notion espera `aceptación`/`descarte`/`solicitud de evidencia`/`corrección`.
10. **`fichas.jsonl`** contiene las bandejas completas, no fichas (bug en [`precache.js`](open-news/scripts/precache.js:28)).
11. **`tema` inconsistente**: la IA (P01) devuelve texto libre; el baseline devuelve slug. Para el `Tema` select hay que normalizar siempre.

---

## 5. Qué data NO va a Notion

- **Corpus completo** (155 noticias, 82 sismos): solo MySQL/archivos. Notion recibe **solo fichas trabajadas** (abiertas/producidas/revisadas).
- **`data/raw`** completo (noticias.csv, eventos.geojson, manifest): no se replica en Notion; solo resumen en BD Fuentes.
- **Bandejas completas** (`bandejas/*.json`): no van a Notion; solo fichas individuales.

---

## 6. Implementación propuesta

Reescribir `syncFicha`/`syncRevision` con:
1. **Normalizadores de select** (modalidad, tema, estado, nivel, alcance, decisión) contra las opciones reales.
2. **Mapeo de `senales`** objeto → etiqueta multi_select.
3. **`Persona`/`Persona revisora` como people** (requiere tabla nombre→usuario, riesgo F-14).
4. **No escribir** `Banda` (formula) ni propiedades inexistentes (`Ruta FD`, `Liberado por`).
5. **Corregir `precache.js`** para que `fichas.jsonl` sea JSONL de fichas reales.
