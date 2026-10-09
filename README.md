# open-news v2.2 · Copiloto «De la señal a la decisión»

HackAIthon · Reto TVN Media · Equipo Sancocho de Algoritmo · **desplegado en producción**.

Un **núcleo de evidencias** (con filtro de desinformación obligatorio **S3F**) alimenta
tres capas de producto, cada una en su ruta web: `/principal`, `/digital`, `/banca`.
**MariaDB/MySQL es el sistema de registro**; el pipeline escribe directamente en BD y los
archivos `data/` quedan como corpus reproducible y respaldo.

| Módulo | Usuario | Entregable (S6) | Vida media |
|---|---|---|---|
| `principal` · Mesa Editorial | Editor/a y periodista | Brief ≤250 · guion TV 45–60 s · copy ≤80 | 72 h |
| `digital` · Mesa Digital | Productor/a digital | 3 titulares ≤70 · resumen ≤250 · copy ≤80 · guion vertical | 36 h |
| `banca` · Radar de Entorno | Analista económico / riesgo | Boletín ≤250 (observación vs hipótesis) · 9 sectores | 14 días |

## Principio de diseño

**El modelo interpreta; el código decide.** La IA clasifica, agrupa, extrae y redacta;
el código calcula RIUNE, filtra desinformación, verifica citas y cifras, y controla estados.
Aprobar un borrador no es publicar. **Nada se borra**: el registro es solo-anejo (append-only).

## Arquitectura resumida

- **Plano batch**: `ingest → load → precache` escribiendo **directo en MySQL** (corpus → núcleo).
- **Plano online**: API Express → web (`/principal` `/digital` `/banca`) → registro solo-anejo (MySQL) → Notion (presentación).
- **Proveedor de modelo con respaldo**: `LLM_*` (primario, DeepSeek por defecto) → `LLM2_*` (secundario); enriquecimiento IA **paralelizado** (`IA_CONCURRENCY`, default 8).
- **Observabilidad**: log JSON por llamada + `motor` (estado `disponible`/`degradado`, cadena de llamadas) en `/api/estado`.
- **Backend de configuración en caliente**: `/api/config`, `/api/admin/config` (GET/PUT), `/api/admin/config/sync`, `/api/admin/config/restablecer` + UI `/admin`.

## Pipeline

`S0 Fuentes` (RSS + USGS + GDELT + Banco Mundial) → `S1 Cargar` (validación + cuarentena) →
`S2 Organizar` (tema + eventos, ventana 72 h) → `S3 Contextualizar` (afirmaciones + vínculo oficial) →
**`S3F Filtro`** (SC-01..SC-10 → `pasa` / `con advertencias` / `retenido`) → `S4 Priorizar` (RIUNE) →
`S5 Consultar` → `S6 Producir` (validador V01–V11) → `S7 Revisar` (humano, 5 estados).

Puntaje: `P = 30R + 25I + 20U + 15N + 10E` (0–100). Jerarquía de fuentes **N1–N6**;
familias de corroboración **E–I** que solo contrastan, nunca entran en la bandeja.

## Estructura

```
src/
  config.js · config/defaults.js · config/api.js   reglas, proveedor, backend de configuración
  db/       index.js · writers.js                  conexión mysql2 + upserts
  registro/ mysql.js                                registro solo-anejo en MySQL
  store/    index.js                                MySQL primario, JSONL solo como cola/respaldo
  core/     load.js · manifest.js · events.js · themes.js · pipeline.js · ia.js
  filter/   index.js · confiabilidad.js             S3F: enrutado, liberación, N1-N6
  rules/    riune.js                                RIUNE + estado de evidencia
  signals/  credibility.js                          SC-01..SC-10 (sin veredicto)
  llm/      client.js · schema.js · telemetry.js    proveedor + respaldo, JSON validado, observabilidad
  prompts/  index.js · reglasGlobales.js            P00-P09 + RG-1.0
  products/ index.js · validators.js                capas de producto + V01-V11
  review/   stateMachine.js                         5 estados + solo anexar
  search/   hybrid.js                               recuperación léxica + vectorial
  notion/   client.js · sync.js                     presentación (unidireccional, perezoso)
  index.js                                          servidor Express + API por módulo
scripts/  ingest · load · precache · ciclo · migrarSchema · migrarMySQL · testDeepSeek · scanSecrets · seedDemo · generarArquitecturaV2
public/   landing + workspace /principal /digital /banca + admin /admin
data/     raw/ · processed/ · registro/ (respaldo y cola; no se versiona)
db/       esquema.sql (21 tablas + 10 triggers solo-anejo)
ecosystem.config.cjs                               PM2: open-news + open-news-ciclo (cron 03:00)
```

## Capa de datos

- **MariaDB 11.5.2** (driver `mysql2`), base `open_news`, **21 tablas**: corpus (`fuentes`,
  `capturas`, `noticias`, `indicadores`, `sismos`, `oficiales`, `sbp`), núcleo (`eventos`,
  `evento_noticias`, `afirmaciones`, `citas`, `fichas`, `senales_ficha`), registro
  (`revisiones`, `verificaciones`, `entregables`, `consultas`, `bitacora`) y operación
  (`ejecuciones`, `cache_llm`, `esquema_version`).
- **Registro solo-anejo**: 10 triggers `BEFORE UPDATE`/`BEFORE DELETE` (2 por tabla) abortan
  con `SIGNAL SQLSTATE '45000'`.
- **Notion**: presentación y trazabilidad humana (8 bases), sincronización unidireccional y
  perezosa. Mapa de personas vía `NOTION_PEOPLE`.

## API

`GET /health` · `GET /api/estado` · `GET /api/modulos` · `GET /api/{modulo}/bandeja` ·
`GET /api/{modulo}/verificacion` · `POST /api/{modulo}/verificacion/{id}` (liberar | descartar) ·
`GET /api/{modulo}/ficha/{id}` · `POST /api/{modulo}/consulta` ·
`POST /api/{modulo}/ficha/{id}/entregable` · `POST /api/{modulo}/ficha/{id}/revision` ·
`GET /api/{modulo}/ficha/{id}/exportar` ·
`GET /api/config` · `GET/PUT /api/admin/config` · `POST /api/admin/config/sync` ·
`POST /api/admin/config/restablecer` · `GET /api/feeds`.

## Configuración

Secretos en `.env` (solo servidor; nunca se versiona):

- `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `LLM_MODEL_REASONER` (primario) y
  `LLM2_*` (respaldo). `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL` siguen siendo alias válidos.
- `IA_CONCURRENCY` (pool de enriquecimiento IA).
- `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`.
- `NOTION_TOKEN` y `NOTION_DB_*`; `NOTION_PEOPLE` (mapa nombre → user id).
- `TVN_RSS_URL`, `PORT`, `MODO_OFFLINE`.

Los ajustes no secretos (pesos RIUNE, umbrales, límites, léxicos, paleta, catálogo de 20
feeds) se editan desde `/admin` y se persisten en `data/config.json`.

## Ejecución (desarrollo)

```bash
npm install
cp .env.example .env        # completa los secretos
npm run db:migrar           # aplica db/esquema.sql (idempotente)
npm run ingest && npm run load && npm run precache   # escribe directo en MySQL
npm start                   # servidor Express (PORT; producción usa 3001)
```

Atajos: `npm run demo` (corpus sintético), `npm run ciclo` (ingest→load→precache),
`npm run scan` (escaneo de secretos), `npm run check:deepseek`.

## Modo degradado sin IA

DeepSeek requiere internet; la app es online. Si el proveedor o la red fallan, el sistema
**degrada al motor determinístico** (baseline): bandejas, fichas, consulta y revisión siguen
funcionando sin la capa IA. La disponibilidad se expone en `/api/estado` (`motor.estado`).

## Despliegue en producción

| Host | Contenido | Proceso / puerto |
|---|---|---|
| `https://sancochodev.com` | Hub con enlaces a las dos apps | nginx + PHP-FPM |
| `https://open-news.sancochodev.com` | Landing + `/principal` `/digital` `/banca` + `/admin` | PM2 `open-news` · 3001 |

- MariaDB corre en el mismo VPS (base `open_news`); secretos solo en `.env`.
- `ecosystem.config.cjs` declara `open-news` (web) y `open-news-ciclo` (ciclo diario 03:00).
- Salud: `/health` y `/api/feeds` (catálogo de 20 feeds + última captura).

## Licencia

MIT
