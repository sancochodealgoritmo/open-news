# Análisis final para la arquitectura open-news v2.1 (actualizada)

Documento base para regenerar el documento de arquitectura v2.1. Consolida el estado real del sistema (fuente de verdad), el reparto de la data, la configuración, el cotejo con el borrador v2.1, los bugs corregidos y las decisiones que debe recoger la nueva versión.

---

## 1. Estado real del sistema (fuente de verdad)

Lo que **existe en el código y en producción** hoy (8 oct 2026):

| Tema | Realidad | Dónde |
|---|---|---|
| Runtime | Node.js >= 20 (ESM), Express 4 | [`package.json`](open-news/package.json:1) |
| Estructura | `src/core/`, `src/llm/`, `src/products/`, `src/notion/`, `src/filter/`, `src/signals/`, `src/rules/`, `src/search/`, `src/store/`, `src/prompts/`, `src/config/`, `scripts/`, `public/`, `tests/` | [`src/`](open-news/src/index.js:1) |
| Capa de datos | Archivos `data/raw` + `data/processed` + Notion opcional (M16). Esquema MySQL definido en [`db/esquema.sql`](open-news/db/esquema.sql:1) (aún no desplegado en el servidor). | [`config.js`](open-news/src/config.js:14), [`store/index.js`](open-news/src/store/index.js:1) |
| Prompts | P00–P09 + RG-1.0 **embebidos en código** (no archivos versionados). | [`prompts/index.js`](open-news/src/prompts/index.js:19), [`prompts/reglasGlobales.js`](open-news/src/prompts/reglasGlobales.js:1) |
| Modelo | DeepSeek `deepseek-chat` (V3) + `deepseek-reasoner` (R1) fallback; **modelo hardcodeado por paso**. | [`defaults.js`](open-news/src/config/defaults.js:143), [`core/ia.js`](open-news/src/core/ia.js:108) |
| Configuración | `src/config/defaults.js` + `.env` (`DEEPSEEK_API_KEY`, `NOTION_*`, `TVN_RSS_URL`, `MODO_OFFLINE`). Sin backend de configuración. | [`config.js`](open-news/src/config.js:1), [`defaults.js`](open-news/src/config/defaults.js:1) |
| Núcleo IA | P01–P05 + contraste oficial + P06 **cableados** en precache; enriquecimiento **secuencial**. | [`core/ia.js`](open-news/src/core/ia.js:99), [`core/pipeline.js`](open-news/src/core/pipeline.js:56) |
| Validaciones | V01–V11 en código. | [`products/validators.js`](open-news/src/products/validators.js:1) |
| Filtro S3F | SC-01..SC-10, rutas pasa/con_advertencias/retenido, liberación humana. | [`signals/credibility.js`](open-news/src/signals/credibility.js:1), [`filter/index.js`](open-news/src/filter/index.js:1) |
| Pruebas | 20/20 en `node --test` (T01–T10 + X + F + S3F). | [`tests/`](open-news/tests/) |

---

## 2. Despliegue en producción (real)

| Host | Contenido | Proceso / puerto |
|---|---|---|
| `https://sancochodev.com` | Hub con enlaces a las apps (`/var/www/html`) | nginx + PHP-FPM |
| `https://open-news.sancochodev.com` | Landing + `/principal` `/digital` `/banca` | PM2 `open-news` · 3001 |
| `https://preauth.sancochodev.com` | Landing + app `/preauth` + admin `/admin` | PM2 `preauth-agent` · 3000 |

- Nginx: server blocks independientes por subdominio; el vhost default de Webdock quedó solo con `sancochodev.com` (respaldo en `/etc/nginx/sites-available/webdock.bak`).
- Pipeline real ejecutado: `ingest` (TVN RSS 155 noticias + USGS 82 eventos; GDELT y Banco Mundial dieron timeout desde el VPS) → `load` (0 rechazados) → `precache` IA (153 eventos → **150 en bandeja + 3 retenidos** por modalidad).
- Ciclo: por ahora manual (`npm run ingest` → `load` → `precache`); el ciclo diario PM2 (`open-news-ciclo`, 05:47 UTC) descrito en el borrador **no está implementado**.

---

## 3. Reparto de la data (MySQL · Notion · offline/manual)

### 3.1 Mapa de archivos generados

| Archivo | Contenido | Destino |
|---|---|---|
| `data/raw/noticias.csv` | 155 noticias TVN | MySQL `noticias` |
| `data/raw/eventos.geojson` | 82 sismos USGS | MySQL `sismos` |
| `data/raw/fuentes.json` | 1 fuente | MySQL `fuentes` |
| `data/raw/manifest.json` | corte + SHA-256 | MySQL `capturas` + metadata |
| `data/processed/registros.json` | normalizado S1 | intermedio → corpus MySQL |
| `data/processed/rechazados.csv` | cuarentena | log MySQL |
| `data/processed/eventos.jsonl` | 153 eventos enriquecidos | MySQL `eventos`/`evento_noticias` |
| `data/processed/fichas.jsonl` | fichas | MySQL `fichas`/`senales_ficha` |
| `data/processed/bandejas/*.json` | vistas Top-5 + verificación | derivado (se recalcula desde MySQL) |
| `data/processed/metricas.json` | métricas | MySQL `ejecuciones` + Notion |

### 3.2 MySQL (sistema de registro operativo)

- **Corpus**: `fuentes`, `capturas`, `noticias`, `indicadores`, `sismos`, `oficiales`.
- **Núcleo**: `eventos`, `evento_noticias`, `afirmaciones`, `citas`, `fichas`, `senales_ficha`.
- **Registro solo-anejo**: `revisiones`, `verificaciones`, `entregables`, `consultas`, `bitacora`.
- **Operación**: `ejecuciones`, `cache_llm`, `esquema_version`.
- Regla: todo lo que el servidor necesita para reconstruir bandejas/fichas va a MySQL; `data/` queda como corpus reproducible (manifest SHA-256) y respaldo JSONL.

### 3.3 Notion (presentación y trazabilidad humana)

- Fichas trabajadas, revisiones (solo-anejo), bitácora, reglas, prompts, fuentes, ejecuciones, pruebas, riesgos.
- No es sistema de registro; sincronización unidireccional e idempotente (M16/#15).

### 3.4 Offline: manual vs automático

- **Demo sintética (manual)**: `npm run demo` (`seedDemo.js`) + corpus de estrés (10 eventos). Datos sintéticos separados, rotulados «DATOS SINTÉTICOS». Proceso manual.
- **Fallback sin red (automático)**: motor de referencia (baseline) + caché LLM sobre la **data real**. Automático.
- El corpus de estrés pertenece solo a la demo manual, nunca al MySQL de producción.

---

## 4. Configuración hardcodeada y backend de configuración

### 4.1 Inventario

- **Modelo**: `modelo`, `modeloRazonador`, `temperatura`, `maxTokens` en [`defaults.js`](open-news/src/config/defaults.js:144) y `modelo:"deepseek-chat"` hardcodeado por paso en [`core/ia.js`](open-news/src/core/ia.js:108).
- **Prompts**: `SISTEMAS`/`USUARIOS`/`ESQUEMAS` en [`prompts/index.js`](open-news/src/prompts/index.js:19) y [`reglasGlobales.js`](open-news/src/prompts/reglasGlobales.js:1).
- **Reglas**: pesos RIUNE, bandas, modalidades, temas, sectores, geo, umbrales, estados, léxicos, avisos, límites, paleta → [`defaults.js`](open-news/src/config/defaults.js:8).
- **Filtro S3F**: `umbralSenalesRevisar`, prioritarias, N1–N6 → [`defaults.js`](open-news/src/config/defaults.js:151).
- **Fuentes de ingesta**: `TVN_RSS_URL` (env; sugerencia hardcodeada y obsoleta en [`ingest.js`](open-news/scripts/ingest.js:144)), GDELT query "Panama"/250, WB países+indicadores, USGS URL → [`ingest.js`](open-news/scripts/ingest.js:16).
- **Operativos**: `cacheTtlMs`, `rateLimitNotion`, `timeouts` → [`defaults.js`](open-news/src/config/defaults.js:139).
- **`MODO_OFFLINE=auto`**: solo se reporta en [`/api/estado`](open-news/src/index.js:96); no hay ramas por modo. El fallback offline es automático.

### 4.2 Backend de configuración propuesto

Sigue el patrón PreAuth [`ajustes.js`](hackiathon-preauth/src/config/ajustes.js:1):

- **Persistencia**: Notion «open-news · Configuración» (1 fila por clave) + `data/config.json` (fallback) + `.env` para secretos.
- **API**: `GET /api/config`, `GET/PUT /api/admin/config`, `POST /api/admin/config/sync`, `POST /api/admin/config/restablecer`, `POST /api/admin/ingest`.
- **UI**: `/admin` con secciones Fuentes, Modelo, Prompts (versionado), Reglas/RIUNE, Filtro, Léxicos, Límites, Paleta.
- **Aplicación en caliente**: fusión sobre `DEFAULTS`; prompts/umbrales afectan al siguiente precache/consulta; el caché LLM se invalida por versión de prompt.

---

## 5. Cotejo con el borrador v2.1 (no fuente de verdad)

El borrador `Arquitectura-open-news-v2.1.pdf` describe una arquitectura objetivo que **aún no está en el código**:

| Tema | Borrador v2.1 | Código actual |
|---|---|---|
| Base de datos | MySQL 2.0.1 implementado (`db:migrar`, `precalculo:mysql`, disparadores) | Sin MySQL (pospuesto) |
| Env de modelo | `LLM_PROVIDER`/`LLM_MODEL`/`LLM2_*`/`EMBED_MODEL` | `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL` |
| Offline | `OFFLINE=1` | `MODO_OFFLINE=auto` |
| Config | `config/reglas.json`, `feeds.json` (20 feeds), `medios_alias.json` | `src/config/defaults.js` + `.env` |
| Prompts | Archivos `prompts/` versionados | embebidos en código |
| Estructura | `src/servicio.js`, `src/motor/`, `src/modelo/`, `src/validar/`, `src/registro/`, `src/db/`, `src/ingesta/`, `deploy/`, 44 pruebas | `src/core/`, `src/llm/`, etc., 20 pruebas |
| Scripts | `precalculo`, `db:migrar`, `ingesta:rss`, `ingesta:snapshot`, `precalculo:mysql`, `ciclo` | `demo`, `ingest`, `load`, `precache`, `bench`, `test`, `scan` |
| Volumen corpus | 945 noticias, 824 eventos | 155 noticias, 153 eventos (ingesta real) |

**Conclusión**: el borrador ya externaliza parte de la config (archivos/env), pero **no define la UI/API de administración en caliente** que se requiere. El backend de configuración propuesto complementa al borrador.

---

## 6. Bugs corregidos en esta iteración

1. **Parser CSV** ([`parsearCsv()`](open-news/src/core/load.js:45)): partía filas por `\n` sin respetar comillas → 98 falsos rechazos por descripciones multi-línea del RSS. Corregido con estado de comillas.
2. **Ingesta** ([`ingest.js`](open-news/scripts/ingest.js:36)): colapso de espacios/saltos al extraer título/descripción.
3. **Log de precache** ([`precache.js`](open-news/scripts/precache.js:24)): usaba `fichas.length` sobre un objeto → «undefined fichas» y `por_modalidad` vacío. Corregido a `fichas.bandeja.length`/`fichas.verificacion.length`.

---

## 7. Decisiones y pendientes que debe recoger v2.1

1. **Paralelizar el enriquecimiento IA** (F-01): hoy secuencial (153 eventos × 6 llamadas ≈ 64 min). Concurrencia limitada 5–10.
2. **Modo offline**: sustituir `MODO_OFFLINE=auto` (solo informativo) por un estado derivado (`deepseek_configurado`, `notion_configurado`, `embeddings_disponibles`) o por modos explícitos.
3. **MySQL**: habilitar como sistema de registro (esquema, `db:migrar`, `precalculo:mysql`) cuando se decida; hoy pospuesto.
4. **Proveedor con respaldo**: cadena caché → DeepSeek → respaldo OpenAI-compatible → baseline (env `LLM_*`/`LLM2_*`).
5. **Backend de configuración**: Notion «Configuración» + JSON + API + UI (sección 4).
6. **Seguridad de acceso**: `DEMO_CODE` + cookie firmada (WEB-04) — hoy sin autenticación en el servidor real.
7. **Observabilidad**: log JSON por llamada al modelo + resumen en `/api/estado` (F-07) — hoy no implementado.
8. **Catálogo de 20 feeds RSS** (`config/feeds.json`) + salud de feeds — hoy solo 1 feed TVN.
9. **Ciclo diario PM2** (`open-news-ciclo` 05:47 UTC) — hoy manual.

---

## 8. Estructura propuesta del documento v2.1 actualizado

1. Historial de versiones (v1.0 → v2.1)
2. Resumen ejecutivo y estado real
3. Principio de diseño y reglas de oro
4. Arquitectura de alto nivel (batch / online)
5. Stack tecnológico
6. Flujo de extremo a extremo (S0–S7 + S3F)
7. Filtro de desinformación (S3F, SC-01..SC-10)
8. Capa de producto (principal / digital / banca)
9. Motor RIUNE (pesos, bandas, estado de evidencia)
10. Validaciones V01–V11
11. Prompts y estrategia de modelo (con backend de configuración)
12. Contrato de datos y fuentes (feeds, jerarquía N1–N6, IDs)
13. Modelo de datos MySQL (pospuesto, con esquema objetivo)
14. Contrato de API (incluye `/api/config`, `/api/admin/*`)
15. Notion (registro y presentación)
16. Usuarios y casos de uso (+ flujo web)
17. Interfaz web
18. Backend: ingesta y ciclo diario
19. Registro, persistencia y modo sin internet (offline manual vs automático)
20. Despliegue y operación (hub + subdominios, PM2, Nginx)
21. Seguridad y ética
22. Evaluación y métricas
23. Decisiones de arquitectura (ADR)
24. Riesgos y controles
25. Roadmap
26. Repositorio y comandos

---

## 9. Referencias clave

- [`config.js`](open-news/src/config.js:1) · [`defaults.js`](open-news/src/config/defaults.js:1)
- [`core/load.js`](open-news/src/core/load.js:21) (parser CSV) · [`core/pipeline.js`](open-news/src/core/pipeline.js:56) · [`core/ia.js`](open-news/src/core/ia.js:99)
- [`prompts/index.js`](open-news/src/prompts/index.js:19) · [`llm/client.js`](open-news/src/llm/client.js:1) · [`llm/schema.js`](open-news/src/llm/schema.js:1)
- [`scripts/ingest.js`](open-news/scripts/ingest.js:16) · [`scripts/precache.js`](open-news/scripts/precache.js:1)
- [`notion/sync.js`](open-news/src/notion/sync.js:1) · [`store/index.js`](open-news/src/store/index.js:1)
- Análisis previo: [`docs/ANALISIS-CONFIGURACION.md`](open-news/docs/ANALISIS-CONFIGURACION.md:1)
- Patrón PreAuth: [`hackiathon-preauth/src/config/ajustes.js`](hackiathon-preauth/src/config/ajustes.js:1)
