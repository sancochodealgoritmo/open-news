# open-news v1.4 · Copiloto «De la señal a la decisión»

HackAIthon · Reto TVN Media · Equipo Sancocho de Algoritmo.

Un **núcleo de evidencias** (con filtro de desinformación obligatorio **S3F**) alimenta
tres capas de producto, cada una en su ruta web: `/principal`, `/digital`, `/banca`.

| Módulo | Usuario | Entregable (S6) | Vida media |
|---|---|---|---|
| `principal` · Mesa Editorial | Editor/a y periodista | Brief ≤250 · guion TV 45–60 s · copy ≤80 | 72 h |
| `digital` · Mesa Digital | Productor/a digital | 3 titulares ≤70 · resumen ≤250 · copy ≤80 · guion vertical | 36 h |
| `banca` · Radar de Entorno | Analista económico / riesgo | Boletín ≤250 (observación vs hipótesis) · 9 sectores | 14 días |

## Principio de diseño

**El modelo interpreta; el código decide.** La IA clasifica, agrupa, extrae y redacta;
el código calcula RIUNE, filtra desinformación, verifica citas y cifras, y controla estados.

## Pipeline

`S0 Fuentes` (snapshot + `manifest.json` SHA-256) → `S1 Cargar` → `S2 Organizar` →
`S3 Contextualizar` → **`S3F Filtro de desinformación`** (SC-01..SC-10 → rutas
`pasa` / `con advertencias` / `retenido para verificación`) → `S4 Priorizar` RIUNE →
`S5 Explicar/Consultar` → `S6 Producir` (validador V01–V11) → `S7 Revisar` (humano, 5 estados) →
Notion (registro y presentación).

Puntaje: `P = 30R + 25I + 20U + 15N + 10E` (0–100). Jerarquía de fuentes **N1–N6**;
familias de corroboración **E–I** (gobierno nacional, local, internacional, medios,
verificadores) que solo contrastan, nunca entran en la bandeja.

## Estructura

```
src/
  config.js · config/defaults.js     reglas RIUNE, filtro, paleta
  core/   load.js · manifest.js · events.js · themes.js · pipeline.js
  filter/ index.js · confiabilidad.js   S3F: enrutado, liberación, N1-N6
  rules/  riune.js                   RIUNE + estado de evidencia
  signals/ credibility.js            SC-01..SC-10 (sin veredicto)
  llm/    client.js · schema.js      DeepSeek + JSON validado (1 reintento)
  prompts/ index.js · reglasGlobales.js   P00-P09 + RG-1.0
  products/ index.js · validators.js      capas de producto + V01-V11
  review/ stateMachine.js            5 estados + solo anexar
  search/ hybrid.js                  recuperación léxica + vectorial
  notion/ client.js · sync.js        registro opcional (M16)
  store/  index.js                   JSONL versionado (ARQ-12)
  index.js                           servidor Express + API por módulo
scripts/  ingest · load · precache · benchmark · scanSecrets · seedDemo · generarArquitectura
tests/    T01-T10 + X + F + S3F
public/   landing + espacios /principal /digital /banca
data/     raw/ · processed/ · snapshot (corpus versionado)
```

## API por módulo

`GET /api/estado` · `GET /api/modulos` · `GET /api/{modulo}/bandeja` ·
`POST /api/{modulo}/consulta` · `GET /api/{modulo}/ficha/{id}` ·
`POST /api/{modulo}/ficha/{id}/entregable` · `POST /api/{modulo}/ficha/{id}/revision` ·
`GET /api/{modulo}/verificacion` · `POST /api/{modulo}/verificacion/{id}` (liberar | descartar) ·
`GET /api/{modulo}/ficha/{id}/exportar`.

## Ejecución

```bash
npm install
cp .env.example .env        # IDs de Notion v1.4 (sección 9.4) + DeepSeek (opcional para demo)
npm run demo                # snapshot sintético offline + bandejas (incluye caso retenido SC-08)
npm start                   # landing en http://127.0.0.1:3000 · /principal /digital /banca
npm test                    # T01-T10 + X + F + S3F
npm run scan                # escaneo de secretos
```

Con datos reales: `npm run ingest` (define `TVN_RSS_URL`) → `npm run load` → `npm run precache`.

## Modo sin internet (T10)

`npm run demo` deja las bandejas en `data/processed/bandejas/`; el servidor las sirve
sin red. El cliente DeepSeek es perezoso (el núcleo determinístico funciona sin clave),
los embeddings caen a búsqueda léxica y las salidas del modelo se cachean por
(versión de prompt, hash de entrada).

## Despliegue en producción

| Host | Contenido | Proceso / puerto |
|---|---|---|
| `https://sancochodev.com` | Hub con enlaces a las dos apps (`/var/www/html`) | nginx + PHP-FPM |
| `https://open-news.sancochodev.com` | Landing open-news + `/principal` `/digital` `/banca` | PM2 `open-news` · 3001 |
| `https://preauth.sancochodev.com` | Landing PreAuth + app en `/preauth` · admin en `/admin` | PM2 `preauth-agent` · 3000 |

Producción corre con la **demo sintética** (`npm run demo -- --baseline`) sobre archivos
locales `data/` (raw/processed + manifest SHA-256). Notion queda como registro opcional (M16).

### MySQL v2 — pospuesto

La capa de datos MySQL 8 descrita en `docs/Arquitectura-open-news-v2.pdf` (sección 13,
«Modelo de datos MySQL v2») **no está implementada ni creada en el servidor**. Queda
documentada y pospuesta; el sistema de registro operativo actual sigue siendo `data/`
(archivos versionados) + Notion como presentación.

## Licencia

MIT
