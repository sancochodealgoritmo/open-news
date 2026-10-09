#!/usr/bin/env node
// Genera la arquitectura de software v2.2 (definitiva) de open-news en PDF (pdf-lib).
// Salida: docs/Arquitectura-open-news-v2.2.pdf
// Contenido coherente con lo desplegado en producción (ver docs/ANALISIS-PDF-ARQUITECTURA-v2.2.md).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "docs");
fs.mkdirSync(OUT, { recursive: true });

const ink = rgb(0.09, 0.11, 0.15);
const gris = rgb(0.40, 0.44, 0.50);
const accent = rgb(0.04, 0.24, 0.42);
const soft = rgb(0.20, 0.34, 0.52);
const line = rgb(0.82, 0.85, 0.88);

const B = [];
const h1 = (t) => B.push(["h1", t]);
const h2 = (t) => B.push(["h2", t]);
const h3 = (t) => B.push(["h3", t]);
const p = (t) => B.push(["p", t]);
const b = (t) => B.push(["b", t]);
const kv = (t) => B.push(["kv", t]);
const c = (t) => B.push(["c", t]);
const gap = () => B.push(["gap"]);

// ==================== 1 · Portada ====================
h1("open-news v2.2 · Documento de arquitectura de software");
p("Copiloto «De la señal a la decisión» · Reto TVN Media · hackIAthon.");
p("Equipo Sancocho de Algoritmo · 9 de octubre de 2026 · Reglas RIUNE v1.0 · Estado: desplegado en producción.");
gap();
p("Documento definitivo. Consolida el sistema implementado y verificado en producción: MySQL/MariaDB como sistema de registro con pipeline directo a BD, proveedor de modelo con respaldo, observabilidad, backend de configuración e interfaz web unificada.");

// ==================== 2 · Historial ====================
h1("1 · Historial de versiones");
kv("v1.0 — Esqueleto derivado de PreAuth: núcleo determinístico, bandejas, API y UI.");
kv("v1.4 — Familias E-I, jerarquía N1-N6, SC-10, IDs OFI/INT/REV, S3F, salud de feeds.");
kv("v2.0 — Capa de datos MySQL, proveedor con respaldo, modelo relacional.");
kv("v2.1 — Interfaz de tres módulos, backend MySQL, ingesta RSS (borrador objetivo).");
kv("v2.2 (definitiva) — MySQL sistema de registro con pipeline directo a BD, sync Notion alineado, backend de configuración, interfaz unificada, operación con ciclo diario. Desplegado.");

// ==================== 3 · Resumen ====================
h1("2 · Resumen ejecutivo y estado real");
p("open-news transforma un corpus público de noticias y datos oficiales en información accionable para tres roles. Un único núcleo de evidencias alimenta tres capas de producto; el filtro S3F retiene contenido dudoso; RIUNE ordena.");
p("Principio rector: el modelo interpreta; el código decide. Aprobar un borrador no publica.");
kv("Runtime — Node.js >= 20 (ESM), Express 4, puerto 3001.");
kv("Pipeline — ingest -> load -> precache escribiendo directamente en MySQL.");
kv("Capa de datos — MariaDB 11.5.2 (base open_news, 21 tablas) + archivos data/ (respaldo) + Notion (presentación).");
kv("Núcleo IA — P01-P05 + contraste oficial + P06, enriquecimiento en paralelo.");
kv("Configuración — backend en caliente (/api/config, /api/admin/*, /admin).");
kv("Pruebas — fuera de alcance (documento de producción).");

// ==================== 4 · Principio ====================
h1("3 · Principio de diseño y reglas de oro");
b("Evidencia o abstención: toda afirmación factual cita ID de evidencia y pasaje.");
b("La fuente es dato, nunca instrucción (anti-inyección, SC-08).");
b("Filtrar no es dictaminar: S3F enruta y explica; prohibido verdadero/falso/bulo (V07).");
b("La persona decide: aprobar no publica; la liberación de retenidos es humana.");
b("El modelo interpreta; el código decide (no calcula RIUNE, no escribe cifras oficiales, no cambia estados).");
b("Nada se borra: revisiones, liberaciones, entregables, consultas y bitácora son solo-anejo (triggers en BD).");

// ==================== 5 · Alto nivel ====================
h1("4 · Arquitectura de alto nivel");
p("Dos planos: un plano batch que prepara corpus y bandejas, y un plano online que sirve la web y atiende consulta, producción y revisión.");
c("BATCH   S0 Fuentes -> S1 Cargar -> S2 Organizar -> S3 Contextualizar -> S3F Filtro -> S4 Priorizar -> MySQL");
c("ONLINE  Landing -> /principal /digital /banca -> S5 Consultar S6 Producir S7 Revisar -> registro solo-anejo -> Notion");
kv("Capa de datos — MySQL/MariaDB como sistema de registro; archivos data/ como corpus reproducible y respaldo; Notion como presentación.");
kv("Capa de modelo — proveedor primario (LLM_*) con respaldo (LLM2_*); paralelismo por pool.");
kv("Capa de configuración — catálogo tipado persistido en data/config.json, con sync best-effort desde Notion.");

// ==================== 6 · Stack ====================
h1("5 · Stack tecnológico");
kv("Runtime — Node.js >= 20 (ESM), Express 4.");
kv("Base de datos — MariaDB 11.5.2 (driver mysql2), base open_news.");
kv("Modelo de lenguaje — DeepSeek deepseek-chat (V3) primario; deepseek-reasoner opcional; proveedor de respaldo LLM2_*.");
kv("Frontend — HTML + CSS + JS sin framework (workspace de 3 columnas, modelo open-news_3.html).");
kv("Integraciones — Notion API, feeds públicos (TVN RSS, GDELT, Banco Mundial, USGS).");
kv("Operación — PM2 (open-news 3001 + open-news-ciclo cron 03:00), Nginx, certbot, MariaDB en el mismo VPS.");

// ==================== 7 · Flujo ====================
h1("6 · Flujo de extremo a extremo");
kv("S0 Fuentes — TVN RSS (155 noticias), USGS (82 sismos), Banco Mundial (540 indicadores) -> MySQL (noticias, sismos, fuentes, capturas).");
kv("S1 Cargar — validación + cuarentena + normalización -> MySQL (noticias). 0 rechazados (parser CSV corregido).");
kv("S2 Organizar — tema + agrupación de eventos (ventana 72 h).");
kv("S3 Contextualizar — afirmaciones y vínculo con dato oficial.");
kv("S3F Filtro — SC-01..SC-10 -> ruta pasa / con_advertencias / retenido.");
kv("S4 Priorizar — RIUNE y estado de evidencia.");
kv("S5 Consultar — agenda / dato oficial / tema-evento, con abstención.");
kv("S6 Producir — P08 + V01-V11 + P09.");
kv("S7 Revisar — 5 estados humanos, solo-anejo.");

// ==================== 8 · Núcleo IA ====================
h1("7 · Núcleo IA y disponibilidad del modelo");
kv("Proveedor — primario LLM_* (DeepSeek por defecto); respaldo LLM2_*; cliente perezoso por proveedor.");
kv("Cadena — primario (razonador -> base) -> secundario (razonador -> base).");
kv("Paralelismo — enriquecimiento por evento con pool de concurrencia (IA_CONCURRENCY 1-10, default 8).");
kv("Observabilidad — log JSON por llamada (proveedor, modelo, latencia, tokens) + motor.cadena en /api/estado.");
kv("Disponibilidad — motor.disponible / motor.estado (desconocido, disponible, degradado).");
p("Sobre «sin internet»: DeepSeek requiere internet; la app es online. Si el modelo o la red fallan, el sistema degrada al motor determinístico (baseline): bandejas, fichas, consulta y revisión siguen funcionando sin la capa IA. Es un fallback de resiliencia («modo degradado sin IA»), no un modo offline real.");

// ==================== 9 · Filtro ====================
h1("8 · Filtro de desinformación (S3F)");
kv("SC-01..SC-10 — nivel/origen/razón; ruta pasa / con_advertencias / retenido.");
kv("En código — SC-01, SC-02, SC-06, SC-08; SC-03/09/10 de contraste oficial; SC-04/05/07 desde la IA.");
kv("Liberación — humana con motivo; V11 bloquea el entregable completo del retenido.");

// ==================== 10 · RIUNE ====================
h1("9 · Motor de priorización RIUNE");
c("P = 30·R + 25·I + 20·U + 15·N + 10·E   (0-100)");
kv("R Relevancia (30) — R = 0.5·G + 0.5·T (geo y peso de tema).");
kv("I Impacto (25) — rúbrica 0-4 propuesta por P05 con citas.");
kv("U Urgencia (20) — decaimiento por vida media (72/36/336 h).");
kv("N Novedad (15) — recirculación -> 0.");
kv("E Evidencia (10) — procedencias + vínculo oficial + fuente primaria + texto.");
kv("Bandas — bajo [0,40) · medio [40,70) · alto [70,100]. Desempate: mayor U, luego ID.");
kv("Estado de evidencia — insuficiente / parcial / suficiente, independiente del puntaje.");

// ==================== 11 · Producto ====================
h1("10 · Capa de producto");
kv("principal · Mesa Editorial — Editor/a y periodista. Brief <=250, guion TV 45-60 s, copy <=80.");
kv("digital · Mesa Digital — Productor/a digital. 3 titulares <=70, resumen <=250, copy <=80, guion vertical.");
kv("banca · Radar de Entorno — Analista económico. Boletín <=250 (observación vs hipótesis), 9 sectores.");
kv("Revisión — 5 estados + solo anexar. El sistema solo crea nuevo o requiere_evidencia; el resto es humano.");

// ==================== 12 · Validaciones ====================
h1("11 · Validaciones determinísticas (V01-V11)");
kv("V01 Esquema JSON · V02 >=1 cita existente · V03 pasaje literal · V04 cifra en la evidencia.");
kv("V05 límites (palabras/caracteres/3 preguntas) · V06 aviso de metadatos · V07 léxico prohibido.");
kv("V08 dato anual no como hoy · V09 solo humano aprueba/descarta · V10 sin secretos · V11 retenido sin entregable.");
p("El código decide: si el validador falla, regenera 1 vez con los errores; si falla 2 veces, requiere evidencia.");

// ==================== 13 · Datos ====================
h1("12 · Capa de datos — reparto");
kv("Corpus (noticias, sismos, fuentes, indicadores, oficiales) — MySQL.");
kv("Núcleo (eventos, afirmaciones, citas, fichas, señales) — MySQL.");
kv("Registro (revisiones, verificaciones, entregables, consultas, bitácora) — MySQL solo-anejo.");
kv("Fichas trabajadas, revisiones, reglas, prompts, fuentes, ejecuciones — Notion (presentación/traza).");
kv("Corpus reproducible (manifest SHA-256) — archivos data/ (respaldo).");
p("No hay carga masiva a Notion: solo se sincronizan fichas trabajadas (perezoso).");

// ==================== 14 · MySQL ====================
h1("13 · Modelo de datos MySQL (21 tablas)");
p("MariaDB 11.5.2 es el sistema de registro. Los archivos data/ son corpus reproducible y respaldo; Notion es presentación.");
kv("Corpus — fuentes, capturas, noticias, indicadores, sismos, oficiales, sbp.");
kv("Núcleo — eventos, evento_noticias, afirmaciones, citas, fichas (PK id_caso+modalidad), senales_ficha.");
kv("Registro solo-anejo — revisiones, verificaciones, entregables, consultas, bitacora.");
kv("Operación — ejecuciones, cache_llm, esquema_version.");
h2("13.1 Integridad solo-anejo (triggers)");
p("El registro está protegido en la BD con 10 triggers BEFORE UPDATE / BEFORE DELETE (2 por tabla, idempotentes con CREATE TRIGGER IF NOT EXISTS). Cualquier UPDATE o DELETE sobre esas tablas aborta con SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar'. La aplicación solo hace INSERT; los triggers son la garantía final.");
kv("Nombres — trg_<tabla>_no_update y trg_<tabla>_no_delete para revisiones, verificaciones, entregables, consultas, bitacora.");
kv("Estado — aplicados y verificados en producción (SHOW TRIGGERS). Si MySQL no está disponible, el store degrada a cola JSONL.");

// ==================== 15 · Configuración ====================
h1("14 · Backend de configuración");
kv("Fuente de verdad — DEFAULTS en código + sobrescritos en data/config.json (fallback offline).");
kv("Sync Notion — best-effort desde bases Reglas / Prompts / Fuentes.");
kv("Catálogo — modelo, RIUNE, filtro S3F, límites, léxicos, paleta, feeds.");
kv("API — GET /api/config, GET/PUT /api/admin/config, POST /api/admin/config/sync, POST /api/admin/config/restablecer.");
kv("UI — /admin (estilo open-news_3.html): formularios por sección + tabla de feeds.");
kv("Secretos — API keys, tokens e IDs viven solo en .env; el backend los referencia, no los expone.");

// ==================== 16 · API ====================
h1("15 · Contrato de API");
c("GET  /health                              estado, uptime, entorno");
c("GET  /api/estado                          snapshot, reglas, retenidos, motor");
c("GET  /api/modulos                         principal · digital · banca");
c("GET  /api/{modulo}/bandeja                Top-N (P, banda, evidencia, ruta FD)");
c("GET  /api/{modulo}/verificacion           eventos retenidos por S3F");
c("POST /api/{modulo}/verificacion/{id}      liberar | descartar (+ motivo)");
c("GET  /api/{modulo}/ficha/{id}             ficha del caso");
c("POST /api/{modulo}/consulta               pregunta -> respuesta o abstención");
c("POST /api/{modulo}/ficha/{id}/entregable  P08 + V01-V11 + P09");
c("POST /api/{modulo}/ficha/{id}/revision    transición de estado humana");
c("GET  /api/{modulo}/ficha/{id}/exportar    borrador .md rotulado");
c("GET  /api/config                          vista pública de ajustes");
c("GET  /api/admin/config · PUT · sync · restablecer   administración");
c("GET  /api/feeds                           catálogo de feeds + última captura");
p("El navegador solo llama a /api; las claves de Notion y del modelo viven en el servidor.");

// ==================== 17 · Interfaz ====================
h1("16 · Interfaz de usuario");
p("Workspace de 3 columnas (bandeja / ficha / revisión+consulta) con pestañas Bandeja, Consulta, Entregables, Verificación e Historial. Paleta TVN (#005588 / #0B1220 / #FEC526) con color por módulo. Consume la API real.");
kv("Bandeja — filas priorizadas por RIUNE con ruta FD y estado de evidencia.");
kv("Ficha — componentes R·I·U·N·E, señales, afirmaciones con citas.");
kv("Revisión — transiciones humanas + flujo de 5 estados.");
kv("Consulta — pregunta en español con respuesta o abstención.");

// ==================== 18 · Notion ====================
h1("17 · Notion (registro y presentación)");
kv("Bases — Fichas, Revisiones, Bitácora, Reglas, Prompts, Fuentes, Ejecuciones, Pruebas.");
kv("Sync — unidireccional, idempotente y perezoso (solo fichas trabajadas).");
kv("People — mapa nombre -> user id vía NOTION_PEOPLE (JSON).");
kv("Principio — Notion es presentación y trazabilidad humana; nunca sistema de registro.");

// ==================== 19 · Despliegue ====================
h1("18 · Despliegue y operación");
kv("Hosts — sancochodev.com (hub) · open-news.sancochodev.com (3001) · preauth.sancochodev.com (3000).");
kv("Procesos — PM2 open-news (web) + open-news-ciclo (cron diario 03:00, ingest -> load -> precache).");
kv("BD — MariaDB en el mismo VPS (base open_news). Secretos en .env solo en servidor.");
kv("Salud — /health con uptime y entorno; /api/feeds con salud del catálogo.");
kv("Nginx — server blocks por subdominio; vhost default solo sancochodev.com.");

// ==================== 20 · Seguridad ====================
h1("19 · Seguridad y ética");
kv("Control humano (V09) — aprobar != publicar; liberación de retenidos humana.");
kv("Anti-alucinación (V02-V04) · Anti-inyección (SC-08) · Privacidad (solo metadatos).");
kv("Derechos (sin cuerpos/imágenes) · Credenciales en servidor (V10) · Alertas responsables (V07).");
kv("Restricción de alcance (abstención, X01 en banca).");

// ==================== 21 · Decisiones ====================
h1("20 · Decisiones de arquitectura (ADR)");
kv("D-01..D-11 — modalidad y alcance, puntaje por evento, pesos RIUNE, proveedor, señales sin veredicto, umbrales, MySQL como registro, fallback en cadena.");
kv("D-12..D-24 — ventana 30 días, snapshot, GDELT Panamá, solo es/en, contrato de precálculo, registro solo-anejo intercambiable, baseline como respaldo, puerto 3001.");
kv("v2.2 — pipeline escribe directo a MySQL; archivos solo respaldo; Notion sin carga masiva; interfaz unificada; backend de configuración sobre tablas existentes.");

// ==================== 22 · Riesgos ====================
h1("21 · Riesgos y controles");
kv("Resuelto F-01 — precálculo IA lento: paralelizado con pool (IA_CONCURRENCY).");
kv("Resuelto F-02 — caída de proveedor: respaldo LLM2_* en cadena.");
kv("Resuelto F-04 — persistencia: liberaciones y revisiones en MySQL solo-anejo.");
kv("Resuelto F-07 — observabilidad: log JSON + motor en /api/estado.");
kv("Resuelto F-09 — cola de escritura: store MySQL-primario con cola JSONL.");
kv("Pendiente menor — comparación IA vs baseline y benchmark (producción).");

// ==================== 23 · Referencias ====================
h1("22 · Referencias");
kv("Código — src/index.js, src/config/api.js, src/core/pipeline.js, src/llm/client.js, src/llm/telemetry.js.");
kv("Esquema — db/esquema.sql (21 tablas + 10 triggers).");
kv("Interfaz — public/workspace.html, public/app.js, public/admin.html.");
kv("Operación — ecosystem.config.cjs, scripts/ciclo.js.");
kv("Documentos — docs/Arquitectura-open-news-v2.2.md, docs/INVENTARIO-BD.md, docs/ANALISIS-CONFIGURACION.md.");

// ==================== Renderer ====================
async function generar() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 52;
  const ancho = W - 2 * M;
  const pages = [];
  let page = doc.addPage([W, H]);
  pages.push(page);
  let y = H - 56;

  const sanear = (s) =>
    String(s)
      .replace(/→/g, "->").replace(/←/g, "<-").replace(/≠/g, "!=")
      .replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/−/g, "-")
      .replace(/–/g, "-").replace(/—/g, "-").replace(/Δ/g, "D")
      .replace(/×/g, "x").replace(/…/g, "...").replace(/½/g, "1/2");

  const nuevaPagina = () => { page = doc.addPage([W, H]); pages.push(page); y = H - 56; };
  const asegurar = (n) => { if (y < n) nuevaPagina(); };

  const escribir = (texto, size, f, color, interlinea, sangria = 0) => {
    const max = ancho - sangria;
    const palabras = sanear(texto).split(" ");
    let linea = "";
    for (const p of palabras) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (f.widthOfTextAtSize(prueba, size) > max && linea) {
        asegurar(size + interlinea);
        page.drawText(linea, { x: M + sangria, y, size, font: f, color });
        y -= size + interlinea;
        linea = p;
      } else linea = prueba;
    }
    if (linea) {
      asegurar(size + interlinea);
      page.drawText(linea, { x: M + sangria, y, size, font: f, color });
      y -= size + interlinea;
    }
  };

  let primeraH1 = true;
  for (const [tipo, texto] of B) {
    if (tipo === "h1") {
      if (!primeraH1) nuevaPagina();
      primeraH1 = false;
      page.drawText(sanear(texto), { x: M, y, size: 15, font: bold, color: accent });
      y -= 10;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: line });
      y -= 18;
    } else if (tipo === "h2") {
      asegurar(30);
      page.drawText(sanear(texto), { x: M, y, size: 12, font: bold, color: soft });
      y -= 16;
    } else if (tipo === "h3") {
      asegurar(26);
      page.drawText(sanear(texto), { x: M, y, size: 10.5, font: bold, color: ink });
      y -= 14;
    } else if (tipo === "p") {
      escribir(texto, 10, font, ink, 4);
      y -= 6;
    } else if (tipo === "b") {
      escribir("•  " + texto, 10, font, ink, 3);
      y -= 2;
    } else if (tipo === "kv") {
      const i = texto.indexOf("—");
      if (i > 0) {
        escribir(texto.slice(0, i + 1), 10, bold, ink, 3);
        escribir(texto.slice(i + 1), 10, font, ink, 3, 0);
      } else {
        escribir("•  " + texto, 10, font, ink, 3);
      }
      y -= 2;
    } else if (tipo === "c") {
      asegurar(14);
      page.drawRectangle({ x: M, y: y - 3, width: ancho, height: 14, color: rgb(0.95, 0.96, 0.97) });
      page.drawText(sanear(texto), { x: M + 6, y, size: 8.5, font, color: rgb(0.2, 0.25, 0.32) });
      y -= 16;
    } else if (tipo === "gap") {
      y -= 8;
    }
  }

  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: 30 }, end: { x: W - M, y: 30 }, thickness: 0.5, color: line });
    pg.drawText("open-news v2.2 · Documento de arquitectura de software", { x: M, y: 18, size: 7.5, font, color: gris });
    pg.drawText(`${i + 1} / ${pages.length}`, { x: W - M - 40, y: 18, size: 7.5, font, color: gris });
  });

  const bytes = await doc.save();
  const destino = path.join(OUT, "Arquitectura-open-news-v2.2.pdf");
  fs.writeFileSync(destino, bytes);
  console.log(`${destino} (${bytes.length} bytes · ${pages.length} páginas)`);
}

generar().catch((e) => { console.error("Error generando PDF:", e); process.exit(1); });
