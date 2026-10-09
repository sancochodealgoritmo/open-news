# Inventario de base de datos (MySQL + Notion + backend)

Inventario completo de qué se guarda dónde: mapeo de los archivos `raw`/`processed` a tablas, enumeración de todas las tablas MySQL y bases Notion, y las tablas del backend de configuración (propuesto).

---

## 1. Mapeo archivos → tablas MySQL

### 1.1 `data/raw/`

| Archivo | Contenido | Campos | Destino MySQL |
|---|---|---|---|
| `noticias.csv` | 155 noticias TVN | `id_noticia`, `titulo`, `url`, `medio`, `idioma`, `fecha_publicacion`, `fecha_deteccion`, `fecha_extraccion`, `tema`, `origen`, `alcance_texto`, `descripcion` (derivados: `url_canonica`, `id_estable`) | `noticias` |
| `eventos.geojson` | 82 sismos USGS | `feature.id`, `properties.mag/place/time/url/type`, `geometry.coordinates[lon,lat,depth]` | `sismos` |
| `fuentes.json` | 1 fuente | `medio`, `dominio`, `familia`, `licencia`, `redistribucion` | `fuentes` |
| `manifest.json` | corte + SHA-256 | `version`, `fecha_corte_UTC`, `archivos[{archivo, sha256}]` | `capturas` (hash/metadata) |
| `indicadores.csv` | vacío (Banco Mundial, timeout) | `pais_iso3`, `indicador_id`, `anio`, `valor`, `unidad`, `fuente_url`, `fecha_extraccion`, `licencia` | `indicadores` |
| `verificacion_oficial.csv` | vacío (familias E/F/G/I) | `id_oficial`, `familia`, `nivel`, `institucion`, `titulo`, `url`, `fecha_publicacion`, `fecha_captura`, `tema`, `tipo` | `oficiales` |
| `sbp_series.csv` | vacío (manual) | `informe`, `serie`, `periodo`, `valor`, `unidad`, `pagina`, `fuente_url`, `fecha_extraccion`, `condiciones` | (sin tabla aún — pendiente) |

### 1.2 `data/processed/`

| Archivo | Contenido | Destino MySQL |
|---|---|---|
| `registros.json` | noticias normalizadas + fuentes + eventos (sismos) | `noticias`, `fuentes`, `sismos` |
| `rechazados.csv` | `archivo`, `fila`, `motivo` (cuarentena) | `capturas.rechazados` / log |
| `reporte_calidad.json` | conteos por archivo | `capturas` (metadata) |
| `eventos.jsonl` | 153 eventos enriquecidos (`id_evento`, `miembros`, `afirmaciones`, …) | `eventos`, `evento_noticias`, `afirmaciones`, `citas` |
| `fichas.jsonl` | fichas individuales | `fichas`, `senales_ficha` |
| `bandejas/{principal,digital,banca}.json` | `{bandeja, verificacion, retenidos}` | `fichas` (bandeja + verificación), `senales_ficha` |
| `metricas.json` | `fecha_corte`, `version_reglas`, `eventos`, `por_modalidad` | `ejecuciones` (metadata) |

---

## 2. Tablas MySQL (base `open_news`, 20 tablas)

### 2.1 Corpus

| Tabla | Columnas |
|---|---|
| `fuentes` | `id`, `medio`, `familia`, `nivel`, `url_feed`, `tipo_acceso`, `estado_feed`, `licencia`, `cobertura_desde`, `cobertura_hasta`, `sha256`, `captura_utc` |
| `capturas` | `id`, `fecha_utc`, `origen`, `http_status`, `bytes`, `sha256`, `items`, `nuevos`, `actualizados`, `rechazados`, `error` |
| `noticias` | `id_noticia` (PK), `id_estable`, `titulo`, `url`, `url_canonica`, `medio`, `dominio`, `idioma`, `fecha_publicacion`, `fecha_deteccion`, `fecha_extraccion`, `tema`, `origen`, `alcance_texto`, `descripcion`, `procedencia`, `id_evento`, `snapshot_hash` |
| `indicadores` | `pais_iso3`, `indicador_id`, `anio`, `valor`, `unidad`, `fuente_url`, `fecha_extraccion`, `licencia` (PK: país+indicador+año) |
| `sismos` | `id` (PK), `mag`, `place`, `time_ms`, `url`, `lon`, `lat`, `depth`, `type` |
| `oficiales` | `id_oficial` (PK), `id_fuente`, `familia`, `nivel`, `institucion`, `titulo`, `url`, `fecha_publicacion`, `fecha_captura`, `tema`, `tipo` |

### 2.2 Núcleo

| Tabla | Columnas |
|---|---|
| `eventos` | `id_evento` (PK), `n_notas`, `n_procedencias`, `fecha_original`, `fecha_publicacion`, `fecha_deteccion`, `tema`, `geo`, `contradiccion_abierta`, `es_recirculacion`, `fecha_conocida`, `vinculo_oficial`, `fuente_primaria`, `texto_disponible`, `hito_proximo_7dias`, `impacto_nivel`, `impacto_citado`, `miembros` (JSON), `titulos` (JSON), `medios` (JSON), `dominios` (JSON), `filtro` (JSON), `contexto_oficial` (JSON) |
| `evento_noticias` | `id_evento`, `id_noticia` (PK compuesta) |
| `afirmaciones` | `id`, `id_evento`, `tipo`, `texto`, `cifra`, `unidad`, `periodo`, `pasaje`, `cita_valida`, `es_central` |
| `citas` | `id`, `id_evento`, `id_evidencia`, `pasaje` |
| `fichas` | `id_caso`, `id_evento`, `modalidad`, `tema`, `P`, `R`, `I`, `U`, `N`, `E`, `banda`, `version_reglas`, `estado_evidencia`, `estado_revision`, `ruta_fd`, `nivel_atencion`, `alcance_texto`, `corresponde_aviso`, `resumen`, `accion_recomendada`, `liberacion` (JSON), `ficha_json` (JSON) — **PK `(id_caso, modalidad)`** |
| `senales_ficha` | `id`, `id_ficha`, `codigo`, `nivel`, `origen`, `razon` — UNIQUE `(id_ficha, codigo)` |

### 2.3 Registro (solo-anejo)

| Tabla | Columnas |
|---|---|
| `revisiones` | `id`, `id_caso`, `hacia`, `persona`, `utilidad`, `motivo`, `ts`, `datos` (JSON) |
| `verificaciones` | `id`, `id_caso`, `accion`, `persona`, `motivo`, `ts`, `datos` (JSON) |
| `entregables` | `id`, `id_caso`, `modalidad`, `origen`, `ts`, `datos` (JSON) |
| `consultas` | `id`, `id_caso`, `modalidad`, `pregunta`, `intencion`, `ts`, `datos` (JSON) |
| `bitacora` | `id`, `tipo`, `detalle`, `autor`, `ts`, `datos` (JSON) |

### 2.4 Operación

| Tabla | Columnas |
|---|---|
| `ejecuciones` | `id`, `run`, `conjunto`, `version`, `mediana_s`, `p95_s`, `tokens`, `costo_usd`, `fecha`, `metricas` (JSON) |
| `cache_llm` | `clave` (PK), `version_prompt`, `modelo`, `entrada_hash`, `salida`, `ts` |
| `esquema_version` | `version` (PK), `aplicada_utc`, `notas` |

---

## 3. Bases de Notion (8 + 1 propuesta)

### 3.1 BD Fichas (una fila por caso trabajado)

`ID caso` (title) · `Evento` · `Titular elegido` · `Afirmaciones` · `Citas` · `IDs fuente` · `Verificaciones pendientes` · `Versión de reglas` · `Versión de prompt` · `P` `R` `I` `U` `N` `E` (number) · `Procedencias independientes` (number) · `Banda` (formula) · `Modalidad` (select) · `Tema` (select) · `Estado de evidencia` (select) · `Estado de revisión` (select) · `Nivel de atención` (select) · `Alcance del texto` (select) · `Horizonte` (select) · `Señales` (multi_select, SC-01…SC-10) · `Sectores` (multi_select) · `Persona revisora` (people) · `Fecha de revisión` (date) · `Revisiones` (relation) · `Pruebas` (relation) · `Ruta FD` (select, añadido) · `Liberado por` (rich_text, añadido) · `Motivo de liberación` (rich_text, añadido).

### 3.2 BD Revisiones (solo-anejo)

`Revisión` (title) · `Ficha` (relation) · `Decisión` (select) · `Persona` (people) · `Fecha y hora` (date) · `Motivo` · `Correcciones (antes/después)` · `Utilidad 1–5` (number) · `Versión del borrador`.

### 3.3 BD Bitácora

`Entrada` (title) · `Tipo` (select) · `Detalle` · `Autor` (people) · `Fecha y hora` (date) · relations a Reglas/Prompts/Pruebas/Decisiones/Tareas.

### 3.4 BD Reglas

`Versión` (title) · `Peso R/I/U/N/E` (number) · `Parámetros` · `Motivo del cambio` · `Impacto observado` · `Fecha` (date) · `Decisión` (relation).

### 3.5 BD Prompts

`Prompt` (title) · `ID` (select P00…P09) · `Etapa` (select) · `Modalidad` (select) · `Estado` (select) · `Versión` · `Hash` · `Parámetros` · `Cambios vs versión anterior` · `Pruebas` (relation).

### 3.6 BD Fuentes

`Fuente` (title) · `Familia` (select) · `URL` (url) · `Registros crudos/válidos/excluidos` (number) · `Campos` · `Transformaciones` · `Consultas usadas` · `Licencia/condiciones` · `SHA-256` · `Versión de manifest` · `Cobertura desde/hasta` (date) · `Fecha de extracción UTC` (date) · `Redistribución` (select) · `Responsable` (people).

### 3.7 BD Ejecuciones

`Run` (title) · `Conjunto` (select) · `Versión` · `Métricas` · `Mediana (s)` · `p95 (s)` · `Tokens` (number) · `Costo (USD)` (number) · `Fecha` (date) · `Fallos` (files).

### 3.8 BD Pruebas

`ID` (title) · `Caso` · `Entrada` · `Resultado esperado` · `Resultado observado` · `Corrección aplicada` · `Versión del sistema` · `Estado` (select) · `Fecha` (date) · `Evidencia de ejecución` (files) · relations a Tareas/Fichas/Riesgos/Prompts.

---

## 4. Backend de configuración (propuesto)

| Elemento | Campos / forma |
|---|---|
| Notion «open-news · Configuración» (nueva base) | `Clave` (title) · `Valor` (rich_text/JSON) · `Tipo` (select: string/number/boolean/json) · `Descripción` · `Versión` · `Actualizada` (date) |
| `data/config.json` (fallback offline) | `{ clave: valor }` + metadatos de versión |
| `.env` (secretos, no en Notion) | `DEEPSEEK_API_KEY`, `NOTION_TOKEN`, `DB_PASSWORD`, `DEMO_CODE`, `SESSION_SECRET` |
| MySQL `configuracion` (opcional, si se prefiere SQL) | `clave` (PK) · `valor` (JSON) · `tipo` · `version` · `actualizada_utc` |

Regla: Notion «Configuración» es la fuente de verdad editable por humanos; `data/config.json` es el fallback; `.env` guarda secretos; la API `/api/admin/config` y la UI `/admin` leen/aplican en caliente.
