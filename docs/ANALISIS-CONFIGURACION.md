# open-news · Análisis de configuración hardcodeada y backend de configuración

Documento de análisis para actualizar la arquitectura (v2.x). Responde dos
preguntas: (1) para qué sirve `MODO_OFFLINE=auto` y (2) qué está hardcodeado y
cómo exponerlo en un backend de configuración.

---

## 1. ¿Para qué sirve `MODO_OFFLINE=auto`?

- Se lee en [`config.js`](open-news/src/config.js:63): `modoOffline: process.env.MODO_OFFLINE || "auto"`.
- Hoy **solo se expone** en [`GET /api/estado`](open-news/src/index.js:96) como `modo_offline`. No existe ninguna rama de código que cambie el comportamiento según `"offline"` / `"online"`.
- El comportamiento sin internet es **automático e incondicional** (por eso el valor `auto`):
  - Cliente DeepSeek **perezoso** ([`llm/client.js`](open-news/src/llm/client.js:10)): solo exige la clave cuando se invoca el modelo; sin clave, el núcleo determinístico sigue funcionando.
  - Búsqueda híbrida con **fallback léxico** si embeddings no disponibles ([`search/hybrid.js`](open-news/src/search/hybrid.js:1)).
  - Enriquecimiento IA con **fallback al baseline** si el modelo falla ([`core/pipeline.js`](open-news/src/core/pipeline.js:64)).
  - Salidas del modelo **cacheadas** por (versión de prompt, hash de entrada).

**Conclusión:** `auto` = «detecta automáticamente», y es el único modo efectivamente implementado. Los valores `offline`/`online` no están cableados. Recomendación: o bien implementar los modos explícitos (forzar offline para omitir DeepSeek/Notion), o sustituir la variable por un **estado derivado** que el servidor calcule y reporte (p. ej., `deepseek_configurado`, `notion_configurado`, `embeddings_disponibles`).

---

## 2. Inventario de configuración hardcodeada

### 2.1 Modelo LLM (DeepSeek)

| Parámetro | Dónde está | Observación |
|---|---|---|
| `modelo: "deepseek-chat"` | [`defaults.js`](open-news/src/config/defaults.js:145) | V3 |
| `modeloRazonador: "deepseek-reasoner"` | [`defaults.js`](open-news/src/config/defaults.js:146) | R1 |
| `temperatura: 0.1`, `maxTokens: 2000` | [`defaults.js`](open-news/src/config/defaults.js:147) | generación |
| **`modelo: "deepseek-chat"` por paso** | [`core/ia.js`](open-news/src/core/ia.js:108) (P01), `:121` (P02), `:144` (P03), `:154` (P04), `:164` (P05), `:196` (P06) | **Hardcodeado por prompt**, anula el default de config |
| `baseURL` y `apiKey` | [`config.js`](open-news/src/config.js:31) | ya vienen de `.env` |

### 2.2 Prompts (P00–P09 + RG-1.0)

- Texto de sistema y plantillas de usuario **embebidos en código**: `SISTEMAS` y `USUARIOS` en [`prompts/index.js`](open-news/src/prompts/index.js:19), reglas globales en [`prompts/reglasGlobales.js`](open-news/src/prompts/reglasGlobales.js:1).
- Los esquemas Zod (`ESQUEMAS`) son validación de código y deben permanecer versionados (ARQ-09), pero el **texto de los prompts** es candidato a configuración.

### 2.3 Reglas y puntuación (RIUNE)

- Pesos `P = 30R + 25I + 20U + 15N + 10E` ([`defaults.js`](open-news/src/config/defaults.js:8)).
- Bandas bajo/medio/alto ([`defaults.js`](open-news/src/config/defaults.js:11)).
- Modalidades: `hMediaHoras`, `tamanioBandeja`, `pesosTema` ([`defaults.js`](open-news/src/config/defaults.js:18)).
- `temas`, `sectores`, `geo` ([`defaults.js`](open-news/src/config/defaults.js:64)).
- Umbrales de agrupación, similitud y abstención ([`defaults.js`](open-news/src/config/defaults.js:91)).

### 2.4 Filtro S3F y confiabilidad

- `umbralSenalesRevisar: 3`, señales prioritarias `SC-03/08/09/10` ([`defaults.js`](open-news/src/config/defaults.js:152)).
- Jerarquía `N1–N6` ([`defaults.js`](open-news/src/config/defaults.js:159)).
- Reglas de señales SC-01..SC-10 en [`signals/credibility.js`](open-news/src/signals/credibility.js:1) — son **determinísticas**, candidatas a umbrales configurables pero con código fijo.

### 2.5 Léxicos y avisos

- `lexicoProhibido` y `lexicoBanca` ([`defaults.js`](open-news/src/config/defaults.js:105)).
- Avisos literales V06 ([`defaults.js`](open-news/src/config/defaults.js:122)).

### 2.6 Límites de entregables

- `limites` (palabras, segundos, caracteres, preguntas) ([`defaults.js`](open-news/src/config/defaults.js:126)). El código los aplica de forma determinística ([`products/index.js`](open-news/src/products/index.js:97)).

### 2.7 Fuentes de ingesta (S0)

- **TVN RSS**: variable `TVN_RSS_URL` (ok), pero la URL de sugerencia `https://www.tvn-2.com/rss.xml` está **hardcodeada y obsoleta** (devuelve 404; la válida es `https://www.tvn-2.com/rss/`) en [`ingest.js`](open-news/scripts/ingest.js:144).
- **GDELT**: query `"Panama"` y `maxrecords=250` hardcodeados ([`ingest.js`](open-news/scripts/ingest.js:68)).
- **Banco Mundial**: `WB_PAISES` y `WB_INDICADORES` hardcodeados ([`ingest.js`](open-news/scripts/ingest.js:16)).
- **USGS**: URL con fechas/coordenadas hardcodeadas ([`ingest.js`](open-news/scripts/ingest.js:112)).
- **SBP** es manual (sin extractor).

### 2.8 Operativos

- `cacheTtlMs`, `rateLimitNotion`, `timeouts` ([`defaults.js`](open-news/src/config/defaults.js:139)).

### 2.9 Paleta / UI

- Paleta TVN y colores por módulo ([`defaults.js`](open-news/src/config/defaults.js:162)).

### 2.10 Notion

- IDs de bases vienen de `.env` ([`config.js`](open-news/src/config.js:17)), pero la **lista de 8 bases** y su mapeo está fija en código.

---

## 3. Qué es configurable vs. qué permanece en código

| Categoría | ¿Configurable? | Justificación |
|---|---|---|
| URLs de fuentes (RSS, GDELT, WB, USGS) y sus parámetros | **Sí** | Cambian por operación |
| Modelo, temperatura, maxTokens, proveedor | **Sí** | Estrategia de proveedor (v2) |
| Texto de prompts P00–P09 y RG-1.0 | **Sí (versionado)** | Ajuste de calidad sin redeploy |
| Pesos RIUNE, bandas, umbrales, modalidades, límites | **Sí (versionado)** | Ajuste editorial |
| Léxicos prohibidos y avisos | **Sí** | Cumplimiento/redacción |
| Paleta UI | **Sí** | Branding |
| Esquemas Zod y validadores V01–V11 | **No** | Son la decisión de código (el modelo propone, el código decide) |
| Reglas determinísticas SC-01..SC-10, RIUNE, estados | **No** | Núcleo determinístico auditable |
| IDs de bases Notion | **Sí (secreto)** | Ya en `.env`; migrar a backend con cifrado |

---

## 4. Diseño propuesto del backend de configuración

Sigue el patrón ya probado en PreAuth: [`config/ajustes.js`](hackiathon-preauth/src/config/ajustes.js:1) mantiene **ajustes en caliente** persistidos en Notion (base «PreAuth · Configuración») con lectura, aplicación, guardado y sincronización.

### 4.1 Persistencia

1. **Fuente de verdad**: base Notion «open-news · Configuración» (nueva, 1 fila por clave, con `clave`, `valor`, `tipo`, `descripcion`, `version`). Permite editar desde Notion o desde la UI propia.
2. **Caché local**: archivo `data/config.json` (o `data/processed/config.json`) como fallback offline y para arranque sin red.
3. **Secrets** (DeepSeek key, Notion token, IDs): NO se guardan en texto plano en Notion; quedan en `.env` y el backend solo los referencia.

### 4.2 API de configuración (módulo nuevo `src/config/api.js`)

- `GET /api/config` → vista pública de ajustes no sensibles.
- `GET /api/admin/config` → vista completa (requiere acceso).
- `PUT /api/admin/config` → guardar uno o varios ajustes (validados por tipo).
- `POST /api/admin/config/sync` → re-sincronizar desde Notion.
- `POST /api/admin/config/restablecer` → volver a `DEFAULTS`.
- `POST /api/admin/ingest` → disparar ingesta real con las fuentes configuradas.

### 4.3 UI de administración

- Nueva pantalla `/admin` en open-news (o pestaña en workspace) con formularios por sección: Fuentes, Modelo, Prompts (editor con versionado), Reglas/RIUNE, Filtro, Léxicos, Límites, Paleta.
- Muestra `DEFAULTS` como referencia y resalta los valores sobrescritos.

### 4.4 Aplicación en caliente

- `aplicarAjustes(ajustes)` fusiona sobre `DEFAULTS` en `config`; las lecturas por petición usan el objeto en memoria.
- Los prompts y umbrales afectan al **siguiente** precache/consulta; el precache es un lote, así que tras un cambio se sugiere re-ejecutar `precache`.
- La clave del caché de salidas LLM ya incluye versión de prompt (M18), lo que invalida automáticamente salidas antiguas al cambiar prompts.

### 4.5 Seguridad y versionado

- Cualquier cambio de reglas/pesos/prompts incrementa `rulesVersion` (hoy «RIUNE v1.0») y queda registrado en la bitácora Notion (ARQ-07).
- Acceso admin protegido (pendiente de autenticación — riesgo F-05 ya documentado en v2).

---

## 5. Impacto en la arquitectura

- **Nuevo plano de configuración** entre la capa de datos y la de producto: `ConfigStore` (Notion + JSON + memoria).
- **Nuevos endpoints** `/api/config` y `/api/admin/*`.
- **Nueva UI de administración** (reutiliza paleta y workspace).
- Los scripts CLI (`ingest`, `precache`) leen la misma fuente de configuración, de modo que producción y batch comparten parámetros.

## 7 · Cotejo con «Arquitectura-open-news-v2.1.pdf» (borrador)

El PDF v2.1 es un **borrador** (no fuente de verdad). La fuente de verdad es el código actual del repositorio. Este cotejo marca las diferencias y lo que implican para el backend de configuración.

### 7.1 Qué describe el borrador que NO está en el código actual

| Tema | Borrador v2.1 | Código actual (fuente de verdad) |
|---|---|---|
| Base de datos | MySQL 8/MariaDB implementado (esquema 2.0.1, `db:migrar`, `precalculo:mysql`, disparadores solo-anejo) | **Sin MySQL**: solo archivos `data/` + Notion opcional |
| Env del modelo | `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM2_*`, `EMBED_MODEL` | `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` |
| Modo sin internet | `OFFLINE=1` (solo caché) | `MODO_OFFLINE=auto` (solo reportado en `/api/estado`) |
| Configuración | `config/reglas.json`, `config/feeds.json` (20 feeds), `config/medios_alias.json` | `src/config/defaults.js` + `.env` |
| Prompts | Archivos `prompts/` versionados (RG-1.0, P07b-1.0, P08-*-1.0, P09-1.0) | `src/prompts/index.js` + `reglasGlobales.js` (texto embebido) |
| Estructura | `src/servicio.js`, `src/motor/`, `src/modelo/proveedor.js`, `src/validar/`, `src/registro/`, `src/db/`, `src/ingesta/`, `deploy/`, `test/` (44 pruebas) | `src/core/`, `src/llm/`, `src/products/`, `src/notion/`, `src/filter/`, `src/signals/`, `scripts/`, `tests/` |
| Scripts | `precalculo`, `db:migrar`, `ingesta:rss`, `ingesta:snapshot`, `precalculo:mysql`, `ciclo` | `demo`, `ingest`, `load`, `precache`, `bench`, `test`, `scan` |
| Volumen de corpus | 945 noticias, 824 eventos | ingesta real del 8 oct: 155 noticias, 82 eventos |

### 7.2 Qué tiene el código actual que el borrador no menciona

- `MODO_OFFLINE=auto` (variable real) frente al `OFFLINE=1` del borrador.
- Enrutador de consulta P07a y esquemas P00–P06 completos en `src/prompts/index.js`.
- Módulo Notion `src/notion/` (sync M16) y capa `src/store/` JSONL.
- Enriquecimiento IA P01–P05 + P06 **cableado** en `precache` (esto sí está implementado y ejecutándose en el servidor).

### 7.3 Reconciliación con la petición de «backend de configuración»

El borrador v2.1 **ya avanza parte** de la solución al mover parámetros a `config/*.json` y variables de entorno, pero **no define una interfaz de administración en tiempo de ejecución** para editar RSS, prompts, modelo, pesos, léxicos y umbrales sin tocar archivos. Ese es el hueco que cubre la sección 4 de este análisis:

- `config/feeds.json` (borrador) → tabla/UI de **fuentes RSS** editables (URL, familia, nivel, activo).
- `config/reglas.json` (borrador) → tabla/UI de **reglas y umbrales RIUNE/S3F**.
- `prompts/` versionados (borrador) → **editor de prompts** con versionado y caché invalidada.
- `LLM_*` (borrador) → **configuración de proveedor/modelo** (primario + respaldo) editable.

Por lo tanto, el backend de configuración propuesto **complementa** el borrador v2.1: persiste los mismos conceptos pero los hace editables en caliente (Notion «open-news · Configuración» + `data/config.json` + API `/api/admin/config` + UI), en lugar de archivos estáticos que exigen redeploy.

## 8 · Reparto de la data generada (MySQL · Notion · offline/manual)

### 8.1 Mapa de archivos generados (8 oct 2026, producción)

| Archivo | Contenido | Destino |
|---|---|---|
| `data/raw/noticias.csv` | 155 noticias TVN (corpus) | MySQL `noticias` |
| `data/raw/eventos.geojson` | 82 sismos USGS | MySQL `sismos` |
| `data/raw/fuentes.json` | 1 fuente (catálogo) | MySQL `fuentes` |
| `data/raw/manifest.json` | corte + SHA-256 | MySQL `capturas` (hash) + metadata |
| `data/processed/registros.json` | registros normalizados S1 | intermedio → corpus MySQL |
| `data/processed/rechazados.csv` | 98 rechazadas (cuarentena) | log/cuarentena MySQL |
| `data/processed/eventos.jsonl` | 153 eventos enriquecidos | MySQL `eventos` / `evento_noticias` |
| `data/processed/fichas.jsonl` | fichas por modalidad | MySQL `fichas` / `senales_ficha` |
| `data/processed/bandejas/*.json` | vistas Top-5 + verificación | derivado (se recalcula desde MySQL) |
| `data/processed/metricas.json` | métricas del precálculo | MySQL `ejecuciones` + Notion Ejecuciones |

### 8.2 Qué va a MySQL (sistema de registro operativo)

- **Corpus**: `fuentes`, `capturas`, `noticias`, `indicadores` (Banco Mundial, hoy vacío por timeout), `sismos`, `oficiales` (familias E/F/G, hoy sin feeds).
- **Núcleo**: `eventos`, `evento_noticias`, `afirmaciones`, `citas`, `fichas`, `senales_ficha`.
- **Registro solo-anejo**: `revisiones`, `verificaciones`, `entregables`, `consultas`, `bitacora`.
- **Operación**: `ejecuciones`, `cache_llm`, `esquema_version`.

Regla: **todo lo que el servidor necesita para reconstruir bandejas y fichas** va a MySQL; los archivos `data/` quedan como corpus reproducible (manifest SHA-256) y respaldo sin base (JSONL).

### 8.3 Qué va a Notion (presentación y trazabilidad humana)

- **Fichas trabajadas** (no todo el corpus): solo las que alguien abrió, produjo o revisó.
- **Revisiones** (solo-anejo), **Bitácora**, **Reglas** y **Prompts** (config), **Fuentes** (diccionario), **Ejecuciones** (benchmark), **Pruebas** y **Riesgos**.
- Notion **no es** sistema de registro; es presentación + decisión humana. La sincronización es de un solo sentido (MySQL/JSONL → Notion), idempotente por ID (M16/#15).

### 8.4 Proceso offline: distinguir lo manual de lo automático

Hoy se llama «offline» a dos cosas distintas:

1. **Demo sintética (manual)** — `npm run demo` (`seedDemo.js`): datos sintéticos (`NOTICIAS`, `FUENTES`, `INDICADORES`, `OFICIALES`) + corpus de estrés (10 eventos). Es un **proceso manual** (lo dispara una persona) con **datos sintéticos separados**, nunca mezclados con el corpus real; debe rotularse «DATOS SINTÉTICOS».
2. **Fallback sin red (automático)** — cuando el servidor no tiene internet o el modelo falla: el motor de referencia (baseline determinístico) reemplaza a la IA sobre la **misma data real**. Esto sí es automático y no debe confundirse con la demo.

Recomendación (separar explícitamente):
- «modo demo/manual» = `seedDemo` (sintético, manual, solo desarrollo/demostración).
- «modo degradado/sin red» = fallback automático con data real (baseline + caché LLM).
- El corpus de estrés (10 eventos sintéticos) pertenece **solo** a la demo manual, nunca al MySQL de producción.

## 6. Referencias

- [`config.js`](open-news/src/config.js:63) · [`config/defaults.js`](open-news/src/config/defaults.js:1)
- [`prompts/index.js`](open-news/src/prompts/index.js:19) · [`prompts/reglasGlobales.js`](open-news/src/prompts/reglasGlobales.js:1)
- [`core/ia.js`](open-news/src/core/ia.js:108) (modelo por paso) · [`llm/client.js`](open-news/src/llm/client.js:1)
- [`scripts/ingest.js`](open-news/scripts/ingest.js:16) (fuentes) · [`index.js`](open-news/src/index.js:96) (`/api/estado`)
- Patrón PreAuth: [`hackiathon-preauth/src/config/ajustes.js`](hackiathon-preauth/src/config/ajustes.js:1)
