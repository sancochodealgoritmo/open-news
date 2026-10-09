# Análisis previo · PDF de arquitectura coherente con producción (open-news v2.2)

Documento de análisis para regenerar el PDF de arquitectura de forma que refleje
**exactamente lo que pasó a producción** en la iteración del 9 de octubre de 2026
(los 15 pasos de implementación del backend ya desplegados y verificados).

## 1 · Objetivo

Regenerar el PDF de arquitectura a partir de [`generarArquitecturaV2.js`](open-news/scripts/generarArquitecturaV2.js:1),
corrigiendo el contenido hardcodeado (hoy etiquetado **v2.0**) para que sea
**v2.2 · definitiva** y coherente con el sistema real que corre en producción.

## 2 · Estado real en producción (verificado)

| Área | Hecho verificado |
|---|---|
| Runtime | Node.js ≥ 20 (ESM), Express 4, puerto **3001** (PM2 `open-news`) |
| BD | **MariaDB 11.5.2** (base `open_news`), `mysql2` |
| Tablas | **21** (las 20 del esquema + `sbp` recién añadida) |
| Pipeline | `ingest → load → precache` escribiendo **directo en MySQL** |
| Registro | Solo-anejo con **10 triggers** `BEFORE UPDATE/DELETE` (documentado en ARQ v2.2 §13.1) |
| Store | MySQL primario; JSONL solo como cola/respaldo |
| Núcleo IA | P01–P05 + P06, **paralelizado** (`mapConPool`, `IA_CONCURRENCY` 1–10, default 8) |
| Proveedor | **`LLM_*` primario → `LLM2_*` secundario** (DeepSeek por defecto; `DEEPSEEK_*` como alias) |
| Observabilidad | [`telemetry.js`](open-news/src/llm/telemetry.js:1): log JSON por llamada + `motor` en `/api/estado` |
| Disponibilidad | `motor.disponible` / `motor.estado` (desconocido/disponible/degradado) |
| Config backend | [`api.js`](open-news/src/config/api.js:1): `/api/config`, `/api/admin/config` (GET/PUT), `/api/admin/config/sync`, `/api/admin/config/restablecer` + UI `/admin` |
| Feeds | Catálogo de **20 feeds** + `/api/feeds` (salud + última captura) |
| Interfaz | [`workspace.html`](open-news/public/workspace.html:1) replica `open-news_3.html` contra la API real |
| People Notion | Mapa nombre→user vía `NOTION_PEOPLE` |
| Operación | [`ecosystem.config.cjs`](open-news/ecosystem.config.cjs:1) (`open-news` + `open-news-ciclo` cron 03:00) |
| SBP | Tabla `sbp` creada en MySQL (idempotente) |

## 3 · Discrepancias del PDF actual (v2.0) frente a producción

| # | Tema | PDF v2.0 actual | Producción v2.2 (corregir a) |
|---|---|---|---|
| 1 | Versión | «v2.0 · referencia para implementación» | **v2.2 · definitiva, desplegada** |
| 2 | BD | «MySQL 8» | **MariaDB 11.5.2** |
| 3 | Puerto | «127.0.0.1:3000» | **3001** |
| 4 | Nº tablas | 13 tablas listadas (incompleto) | **21 tablas** (incluye `capturas`, `sismos`, `evento_noticias`, `consultas`, `entregables`, `verificaciones`, `cache_llm`, `esquema_version`, `sbp`) |
| 5 | Env de modelo | `LLM_PROVIDER · LLM_MODEL · LLM_BASE_URL · LLM_API_KEY · EMBED_MODEL` | **`LLM_*` (primario) + `LLM2_*` (secundario) + `IA_CONCURRENCY`**; `DEEPSEEK_*` alias |
| 6 | Modo sin red | «modo offline» | **modo degradado sin IA** (DeepSeek requiere internet; fallback determinístico) |
| 7 | Enriquecimiento IA | «secuencial» (implícito) | **paralelo (pool 5–10)** |
| 8 | Observabilidad | «M18 parcial» (riesgo) | **implementada**: log JSON + `motor.cadena` en `/api/estado` |
| 9 | Configuración | no existe | **backend de configuración** (`/api/config`, `/api/admin/*`, `/admin`) sobre tablas existentes |
| 10 | Registro | sin triggers | **10 triggers solo-anejo** |
| 11 | Feeds | «captura diaria» genérico | **catálogo de 20 feeds** + `/api/feeds` |
| 12 | Roadmap | «Fase 1/2/3 pendiente» | **implementado** (listar lo completado) |
| 13 | Pipeline | «→ data/ (MySQL)» ambiguo | **pipeline escribe directo en MySQL; `data/` solo respaldo** |
| 14 | Autenticación | «código de equipo WEB-04» | **omitida** (DEMO_CODE fuera de alcance en esta iteración) |
| 15 | Pruebas | benchmark 60 consultas | **fuera de alcance (producción)** |

## 4 · Contenido definitivo que debe tener el PDF v2.2

1. **Portada** — v2.2 definitiva, fecha, equipo, «desplegado en producción».
2. **Historial** — v1.0 → v1.4 → v2.0 → v2.1 → **v2.2 (MySQL sistema de registro, pipeline directo a BD, backend de configuración, interfaz unificada)**.
3. **Resumen ejecutivo y estado real** — tabla de estado (todo desplegado).
4. **Principio de diseño y reglas de oro** — incluida «nada se borra» (solo-anejo).
5. **Arquitectura de alto nivel** — plano batch (ingesta → MySQL corpus → precálculo → MySQL núcleo) y plano online (API → web → registro solo-anejo → Notion).
6. **Stack** — Node ≥20, Express 4, **MariaDB 11.5.2** + `mysql2`, DeepSeek V3/R1 + fallback LLM2, Notion API, PM2/Nginx.
7. **Flujo extremo a extremo** — S0–S7 con destinos MySQL reales.
8. **Núcleo IA y disponibilidad** — proveedor primario/secundario, paralelismo, **modo degradado sin IA**, `motor` en `/api/estado`.
9. **Filtro S3F** — SC-01..SC-10, rutas, liberación humana.
10. **RIUNE** — fórmula y bandas.
11. **Capa de producto** — principal/digital/banca.
12. **Validaciones V01–V11**.
13. **Capa de datos** — reparto MySQL/Notion/archivos.
14. **Modelo de datos MySQL** — **21 tablas** + §13.1 triggers solo-anejo (10).
15. **Backend de configuración** — catálogo, `/api/config`, `/api/admin/*`, UI `/admin`.
16. **Contrato de API** — endpoints reales + `/api/config`, `/api/admin/*`, `/api/feeds`.
17. **Interfaz de usuario** — workspace 3 columnas (modelo `open-news_3.html` con API real).
18. **Notion** — 8 bases, sync unidireccional, `NOTION_PEOPLE`.
19. **Despliegue y operación** — hosts, PM2 `open-news` + `open-news-ciclo` (cron 03:00), MariaDB, secretos en `.env`.
20. **Seguridad y ética**.
21. **Decisiones (ADR)** — D-01…D-24 + decisiones v2.2.
22. **Riesgos y controles** — resueltos F-01/F-02/F-04/F-07/F-09; pendientes reales.
23. **Referencias**.

## 5 · Plan de ejecución

1. Reescribir el bloque de contenido (líneas 19–265) de [`generarArquitecturaV2.js`](open-news/scripts/generarArquitecturaV2.js:19)
   con el contenido v2.2 de la sección 4, actualizando portada/pie a **v2.2** y la salida a `Arquitectura-open-news-v2.2.pdf`.
2. Ejecutar `node scripts/generarArquitecturaV2.js` y verificar que genera el PDF con el número de páginas y bytes esperados.
3. (Opcional, coherencia total) Sincronizar el texto del PDF con [`Arquitectura-open-news-v2.2.md`](open-news/docs/Arquitectura-open-news-v2.2.md:1), que ya documenta los triggers (§13.1).

> **Nota de modo**: en modo Arquitecto solo se pueden editar archivos `.md`. La
> reescritura de [`generarArquitecturaV2.js`](open-news/scripts/generarArquitecturaV2.js:1)
> (`.js`) y la ejecución del generador requieren cambiar a modo **Code**.
