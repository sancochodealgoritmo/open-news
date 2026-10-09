# Análisis detallado final · Backend open-news (implementado y pendiente)

Estado al 9 de octubre de 2026. Documento guía para terminar el backend: qué existe, qué falta y los pasos por cada pendiente.

---

## 1 · Backend implementado (estado actual)

### 1.1 Servidor Express y API

[`src/index.js`](open-news/src/index.js:1) sirve landing + `/principal` `/digital` `/banca` y la API por módulo:

`GET /health` · `/api/estado` · `/api/modulos` · `/api/{modulo}/bandeja` · `/verificacion` · `/ficha/{id}` · `/consulta` · `/ficha/{id}/entregable` · `/ficha/{id}/revision` · `/verificacion/{id}` · `/ficha/{id}/exportar` · `/api/revisiones/{id}` · `/api/metricas`.

**Carga de datos**: lee bandejas de `data/processed/bandejas/*.json` y las guarda en memoria al arrancar ([`index.js`](open-news/src/index.js:54)).

### 1.2 Pipeline (batch)

- `ingest` ([`scripts/ingest.js`](open-news/scripts/ingest.js:1)): TVN RSS + GDELT + Banco Mundial + USGS → **archivos** `data/raw/*`.
- `load` ([`scripts/load.js`](open-news/scripts/load.js:1)): valida/normaliza → **archivos** `data/processed/registros.json`, `rechazados.csv`, `reporte_calidad.json`.
- `precache` ([`scripts/precache.js`](open-news/scripts/precache.js:1)): S2–S4 + S3F con IA → **archivos** `bandejas/*.json`, `eventos.jsonl`, `fichas.jsonl`, `metricas.json`.

### 1.3 Núcleo IA

P01–P05 + contraste oficial + P06 en [`core/ia.js`](open-news/src/core/ia.js:99); modelo DeepSeek V3/R1 en [`llm/client.js`](open-news/src/llm/client.js:1); JSON validado con 1 reintento en [`llm/schema.js`](open-news/src/llm/schema.js:1). Enriquecimiento **secuencial**.

### 1.4 Núcleo determinístico

S3F (SC-01..SC-10) en [`signals/credibility.js`](open-news/src/signals/credibility.js:1) y [`filter/index.js`](open-news/src/filter/index.js:1); RIUNE en [`rules/riune.js`](open-news/src/rules/riune.js:1); V01–V11 en [`products/validators.js`](open-news/src/products/validators.js:1); productos en [`products/index.js`](open-news/src/products/index.js:1).

### 1.5 Sync Notion

[`notion/sync.js`](open-news/src/notion/sync.js:1) reescrito contra el esquema real (normalizadores, people, señales→etiqueta, `Ruta FD`/`Liberado por`/`Motivo de liberación`/`SC-10`). Pereza (solo fichas trabajadas).

### 1.6 Capa de datos

- **MySQL**: base `open_news` (MariaDB 11.5.2) con 20 tablas ([`db/esquema.sql`](open-news/db/esquema.sql:1)) y la corrida real cargada (atajo puntual).
- **Archivos** `data/`: corpus reproducible (manifest SHA-256) + respaldo.
- **Store JSONL** ([`store/index.js`](open-news/src/store/index.js:1)): revisiones/entregables/consultas/bitácora en JSONL (aún no en MySQL).

---

## 2 · Lo que falta (backend)

### 2.1 Pipeline escribiendo en MySQL (prioridad alta)

**Hoy**: `ingest`/`load`/`precache` escriben archivos. **Objetivo**: escribir/leer MySQL.

Pasos:
1. Crear [`src/db/index.js`](open-news/src/db/index.js:1): conexión `mysql2/promise` con `DB_*` del `.env` (ya configurado), con fallback a JSONL si MySQL no responde.
2. Adaptar `ingest`: insertar en `noticias`, `sismos`, `fuentes`, `capturas` (con SHA-256 y conteos).
3. Adaptar `load`: validar y hacer upsert en `noticias`; cuarentena en `capturas.rechazados`.
4. Adaptar `precache`: leer corpus de MySQL y escribir `eventos`, `evento_noticias`, `afirmaciones`, `citas`, `fichas`, `senales_ficha` (reutilizar la lógica de [`migrarMySQL.mjs`](open-news/scripts/migrarMySQL.mjs:1) como referencia de mapeo).
5. Añadir `db:migrar` (ejecutar `db/esquema.sql` idempotente) y `esquema_version`.

### 2.2 Servidor web leyendo de MySQL

**Hoy**: [`index.js`](open-news/src/index.js:54) lee bandejas de archivos. **Objetivo**: cargar bandejas/fichas desde MySQL al arrancar y refrescar al terminar el precache.

Pasos: reemplazar la carga de archivos por consultas a `fichas`/`eventos` (o leer el JSON de precálculo si se mantiene como caché); exponer en `/api/estado` la salud de MySQL.

### 2.3 Registro solo-anejo en MySQL

**Hoy**: revisiones/verificaciones/entregables/consultas/bitácora van a JSONL. **Objetivo**: escribirlos en las tablas de registro con disparadores solo-anejo.

Pasos: crear `src/registro/mysql.js` con la misma interfaz que el store JSONL (persistencia intercambiable); añadir triggers `BEFORE UPDATE`/`DELETE` que devuelvan error; escribir en segundo plano y en orden; cola en disco si MySQL falla (F-04/F-09).

### 2.4 Cola de escritura a MySQL

Si MySQL no responde: guardar en `data/registro/cola-mysql.jsonl` y reintentar cada 30 s y al arrancar; `/api/estado → persistencia` muestra tipo, pendientes y último error.

### 2.5 Backend de configuración (datos en tablas ya existentes)

**Objetivo**: editar RSS, prompts, modelo, pesos, léxicos y umbrales en caliente.

Dónde se guarda (tablas que **ya existen**; no se crean nuevas):
- **RSS / fuentes** → Notion `Fuentes` + MySQL `fuentes` y `capturas`.
- **Prompts** → Notion `Prompts` (ID, Versión, Hash, Parámetros, Estado).
- **Reglas / pesos / umbrales / léxicos** → Notion `Reglas` (Versión, Pesos, Parámetros) + `src/config/defaults.js` como base.
- **Modelo / proveedor** → `.env` (secretos) + Notion `Reglas`/`Prompts` según aplique.
- **Caché / ejecuciones / cambios** → MySQL `cache_llm`, `ejecuciones`, `bitacora`, `esquema_version`.

Pasos:
1. [`src/config/api.js`](open-news/src/config/api.js:1): `GET /api/config`, `GET/PUT /api/admin/config`, `POST /api/admin/config/sync`, `POST /api/admin/config/restablecer`, `POST /api/admin/ingest`.
2. `aplicarAjustes()` fusionando sobre `DEFAULTS`; invalidar caché LLM por versión de prompt.
3. UI `/admin` con secciones (Fuentes, Modelo, Prompts, Reglas, Filtro, Léxicos, Límites, Paleta) que editan esas bases/tablas.
4. `data/config.json` como fallback offline.

### 2.6 Proveedor de modelo con respaldo

Cadena: caché → primario (`LLM_*`) → respaldo (`LLM2_*`) → motor de referencia. Sustituir el hardcodeo `deepseek-chat` por paso en [`core/ia.js`](open-news/src/core/ia.js:108) por la config. Env: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM2_*`, `EMBED_MODEL`.

### 2.7 Observabilidad (F-07)

Log JSON por llamada al modelo (ts, etapa, versión, origen, modelo, ms, tokens, intento, ok/error) y resumen en `/api/estado → motor.cadena` (llamadas, desde caché, errores, tokens, mediana, p95).

### 2.8 Paralelizar el enriquecimiento IA (F-01)

Hoy secuencial (153 eventos × 6 llamadas ≈ 64 min). Cambiar el bucle de [`core/pipeline.js`](open-news/src/core/pipeline.js:64) a concurrencia limitada (5–10) con `Promise` pool.

### 2.9 Modo offline explícito

Sustituir `MODO_OFFLINE=auto` (solo informativo) por un estado derivado (`deepseek_configurado`, `notion_configurado`, `embeddings_disponibles`) o por `OFFLINE=1` (solo caché) + baseline.

### 2.10 People en Notion

Mapa `nombre → notion_user_id` en configuración; omitir la propiedad people si no hay mapeo (ya implementado en [`sync.js`](open-news/src/notion/sync.js:1)).

### 2.11 Interfaz web (replicar `open-news_3.html`)

Rehacer `public/` con la UX del modelo [`open-news_3.html`](open-news/docs/open-news_3.html:1) (paleta, 3 columnas, pestañas, ficha, entregables, revisión, consulta, verificación), usando la API real.

### 2.12 Ciclo diario PM2

`scripts/ciclo-diario.sh` = ingesta + precálculo; PM2 `open-news-ciclo` a las 05:47 UTC; el servidor recarga el precálculo al cambiar el archivo/BD sin reiniciar.

### 2.13 Catálogo de 20 feeds + salud de feeds

`config/feeds.json` (A1 TVN, H1 La Prensa, E01–E15 gobierno, F01, G01–G02); estado `fuentes.estado_feed` (verificada/con_anomalias/caído tras 3 fallos); una fila por captura.

### 2.14 Tabla SBP

`sbp_series.csv` es manual y no tiene tabla; añadir `sbp` (informe, serie, periodo, valor, unidad, pagina, fuente_url, fecha_extraccion, condiciones) o decidir descartarla.

---

## 3 · Resumen de pendientes ordenados

| # | Pendiente | Archivos clave | Dependencias |
|---|---|---|---|
| 1 | Pipeline → MySQL | `src/db/`, `scripts/ingest|load|precache` | `DB_*` (ya) |
| 2 | Servidor lee de MySQL | `src/index.js` | 1 |
| 3 | Registro solo-anejo MySQL | `src/registro/` | 1 |
| 4 | Cola de escritura | `src/registro/` | 3 |
| 5 | Backend de configuración | `src/config/api.js`, Notion `Reglas`/`Prompts`/`Fuentes` | — |
| 6 | Proveedor con respaldo | `src/llm/`, `LLM_*` | 5 |
| 7 | Observabilidad | `src/llm/`, `/api/estado` | 6 |
| 8 | Paralelizar IA | `src/core/pipeline.js` | — |
| 9 | Modo offline explícito | `src/config.js` | — |
| 10 | People Notion | `sync.js` | 5 |
| 11 | Interfaz web | `public/` | 1–4 |
| 12 | Ciclo diario | `scripts/`, PM2 | 1 |
| 13 | 20 feeds + salud | `config/feeds.json`, `ingest` | 1 |
| 14 | Tabla SBP | `db/esquema.sql` | — |

---

## 4 · Referencias

- Arquitectura: [`Arquitectura-open-news-v2.2-borrador.md`](open-news/docs/Arquitectura-open-news-v2.2-borrador.md:1)
- Inventario de BD: [`INVENTARIO-BD.md`](open-news/docs/INVENTARIO-BD.md:1)
- Configuración: [`ANALISIS-CONFIGURACION.md`](open-news/docs/ANALISIS-CONFIGURACION.md:1) · Notion: [`ANALISIS-NOTION.md`](open-news/docs/ANALISIS-NOTION.md:1) · MySQL/sync: [`PLAN-MYSQL-SYNC.md`](open-news/docs/PLAN-MYSQL-SYNC.md:1)
- Modelo de interfaz: [`open-news_3.html`](open-news/docs/open-news_3.html:1)
