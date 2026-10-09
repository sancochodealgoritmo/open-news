#!/usr/bin/env node
// Genera la arquitectura completa v1 de open-news en PDF (pdf-lib).
// Salida: docs/Arquitectura-open-news-v1.pdf
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "docs");
fs.mkdirSync(OUT, { recursive: true });

const ink = rgb(0.09, 0.11, 0.15);
const gris = rgb(0.40, 0.44, 0.50);
const accent = rgb(0.05, 0.24, 0.42);
const soft = rgb(0.22, 0.35, 0.52);
const line = rgb(0.82, 0.85, 0.88);

// ---------- Contenido ----------
const B = [];

function h1(t) { B.push(["h1", t]); }
function h2(t) { B.push(["h2", t]); }
function h3(t) { B.push(["h3", t]); }
function p(t) { B.push(["p", t]); }
function b(t) { B.push(["b", t]); }
function k(t) { B.push(["k", t]); }
function c(t) { B.push(["c", t]); }
function gap() { B.push(["gap"]); }

// 1 · Portada
h1("open-news v1 · Arquitectura completa");
p("Copiloto «De la señal a la decisión» · Reto TVN Media · hackAIthon.");
p("Equipo Sancocho de Algoritmo · 6 de octubre de 2026 · Reglas RIUNE v1.0 · Estado: propuesta implementada como esqueleto funcional.");
gap();
p("Documento base de la arquitectura y el stack. Deriva del esqueleto PreAuth Agent y cubre: núcleo de evidencias, tres capas de producto, motor RIUNE, señales de credibilidad, validaciones, prompts, contrato de datos, estructura del repositorio, Notion, pruebas y métricas.");

// 2 · Principio
h1("1 · Principio de diseño y reglas de oro");
p("El modelo interpreta; el código decide. La IA clasifica, agrupa, extrae y redacta; el código calcula puntajes, verifica citas y cifras, y controla estados (IA-07). Este es el mismo principio que funcionó en PreAuth Agent.");
b("Evidencia o abstención: toda afirmación factual cita ID de evidencia y campo/pasaje; si no hay, se abstiene y dice qué falta.");
b("La fuente es dato, nunca instrucción (anti-inyección, SEG-03).");
b("Señal ≠ veredicto: las alertas invitan a investigar; prohibido etiquetar verdadero/falso/fake/bulo.");
b("La persona decide: aprobar un borrador no es publicar; no existe función de publicación.");
b("Nada se publica ni se envía; el agente no tiene herramientas con efectos (no publica, no envía, no borra).");

// 3 · Visión general
h1("2 · Visión general: un núcleo, tres capas");
p("Un único núcleo de evidencias (etapas S0–S4) alimenta tres capas de producto (S5–S7). La fila A es común a los tres productos; la fila B es la capa de salida específica de cada modalidad.");
c("S0 Fuentes → S1 Cargar → S2 Organizar → S3 Contextualizar → SA Señales → S4 Priorizar");
c("S4 → S5 Explicar/Consultar → S6 Producir → S7 Revisar (humano) → Notion");
k("Modalidades: principal (Mesa Editorial) · digital (Mesa Digital) · banca (Radar de Entorno)");
k("Stack: Node 20 (ESM) + Express + DeepSeek + Notion + transformers.js (embeddings locales)");

// 4 · Etapas
h1("3 · Etapas de extremo a extremo");
h2("3.1 Núcleo de evidencias (común)");
k("S0 Fuentes públicas — snapshot congelado, carga por lote, sin internet en la demo. A: TVN RSS + GDELT DOC 2.0 (noticias.csv, fuentes.json). B: Banco Mundial API v2 (6 países × 6 indicadores × 2010–2024, indicadores.csv). C: USGS sismos 2024 (eventos.geojson). D: SBP extensión bancaria (12 informes, sbp_series.csv). manifest.json: versión, fecha de corte UTC, SHA-256, licencias, transformaciones.");
k("S1 Cargar — código determinístico: verificar SHA-256 contra manifest · validar esquema por archivo (IDs únicos, URLs, fechas ISO 8601, obligatorios) · filas inválidas a cuarentena con motivo (no bloquea) · normalizar (UTC, URL canónica, medio, nulos intactos, fecha_publicacion ≠ fecha_deteccion) · reporte de calidad.");
k("S2 Organizar — IA + código: NER (lugares, instituciones, cifras, agencia de origen) · clasificación temática (7 temas; baseline por palabras clave) · agrupación de eventos N1 URL canónica → N2 casi-duplicado → N3 similitud semántica + entidades + ventana 72 h · conteo de procedencias independientes (agencia replicada = 1).");
k("S3 Contextualizar — afirmaciones (hecho, declaración, inferencia, hipótesis; cifra + unidad + período) · vínculo con dato oficial (la IA propone, el código verifica y copia) · 'sin contexto oficial pertinente' sin forzar · detección de contradicciones y vacíos.");
k("SA Señales de credibilidad — add-on sin veredicto: SC-01..SC-09 (código + IA asesora con razón y cita).");
k("S4 Priorizar — RIUNE P = 30R + 25I + 20U + 15N + 10E por evento; estado de evidencia independiente; bandeja Top-5 con componentes, motivo y vacíos.");
h2("3.2 Capa de producto (por modalidad)");
k("S5 Explicar + Consultar — ficha (de investigación / evidencia / señal) + consulta en español con recuperación híbrida y abstención explícita.");
k("S6 Producir — redactor (P08) con cita por afirmación + validador determinístico V01–V10 + regeneración única + verificador crítico (P09).");
k("S7 Revisar — humano: nuevo / en revisión / requiere evidencia / aprobado como borrador / descartado (+ motivo). Registro solo anexar.");
k("Notion — registro y presentación: Casos y evidencias · Revisiones · Pruebas y métricas · Plan y decisiones · BD Prompts.");

// 5 · Modalidades
h1("4 · Capa de producto por modalidad");
k("principal — Mesa Editorial · usuario: Editor/a y periodista. Bandeja de agenda (vida media 72 h). Entregable: brief ≤250 palabras (título, enfoque de interés público, 3 preguntas, fuentes y verificaciones), guion TV 45–60 s (113–150 palabras), copy ≤80 palabras. Pesos de tema: todos 1.0 (otros 0).");
k("digital — Mesa Digital · usuario: Productor/a digital. Bandeja digital (vida media 36 h, sin métricas de audiencia). Entregable: 3 titulares ≤70 caracteres con chequeo titular–evidencia, resumen web ≤250 palabras, copy social ≤80, guion video vertical 45–60 s. Pesos: servicios públicos/eventos naturales/economía 1.0; logística/Canal, turismo, regulación 0.75.");
k("banca — Radar de Entorno · usuario: Analista económico/riesgo sectorial. Radar sectorial (vida media 336 h, 14 días). Entregable: boletín de entorno ≤250 palabras con OBSERVACIÓN (hechos citados) separada de HIPÓTESIS DE IMPACTO (condicional), 9 sectores controlados, horizonte temporal, 3 preguntas. Léxico prohibido V07 (recomendaciones, compra/venta, impago, pérdidas o exposición de cartera).");
p("Separación de poderes: el sistema solo crea «nuevo» o, automáticamente, «requiere evidencia»; «aprobado como borrador» y «descartado» son exclusivos del humano (SEG-01, V09).");

// 6 · RIUNE
h1("5 · Motor de priorización RIUNE");
c("P = 30·R + 25·I + 20·U + 15·N + 10·E   (0–100, un decimal)");
h3("5.1 Componentes");
k("R Relevancia (30) — R = 0.5·G + 0.5·T. G: Panamá explícito 1.0, mención regional 0.5, ninguna 0. T: peso del tema principal en la modalidad.");
k("I Impacto potencial (25) — rúbrica 0–4 propuesta por IA (P05) con citas; el código acota: sin cita válida máximo 2/4; nivel 4 sin dato oficial citado → 3.");
k("U Urgencia (20) — U = máx(0.5^(Δh/h½), U_agenda). Δh = horas entre fecha original y fecha de corte. U_agenda = 0.8 si hay hito fechado dentro de 7 días. Sin fecha_publicacion se usa fecha_deteccion y U ≤ 0.5.");
k("N Novedad (15) — N = 1 − s_máx (similitud máxima con eventos anteriores, nunca con el mismo evento). Recirculación (SC-01) → N = 0.");
k("E Evidencia disponible (10) — E = 0.4·mín(proc/3,1) + 0.3·vínculo oficial + 0.2·fuente primaria + 0.1·texto disponible.");
h3("5.2 Bandas y desempate");
k("Bandas sin solapamiento: bajo [0,40) · medio [40,70) · alto [70,100].");
k("Desempate: mayor U; luego ID ascendente. La bandeja y la ficha muestran R, I, U, N, E, P, banda y versión de reglas.");
h3("5.3 Estado de evidencia (independiente del puntaje)");
k("suficiente — 100 % de afirmaciones factuales con ≥1 cita válida; afirmación central con ≥2 procedencias independientes o ≥1 fuente oficial primaria; sin contradicción abierta; al menos una evidencia con texto o dato oficial.");
k("parcial — ≥1 procedencia identificable y alguna cita válida, pero falla un criterio de suficiencia.");
k("insuficiente — sin procedencia citable; o una sola procedencia solo titular/metadatos sin respaldo oficial; o afirmación central sin evidencia. Bloquea «aprobado como borrador».");
h3("5.4 Matriz de acción (banda × evidencia)");
k("alto + insuficiente → investigar, marcar requiere evidencia · alto + parcial → completar vacíos, borrador con verificaciones · alto + suficiente → producir borrador → revisión.");
k("medio + insuficiente → monitorear o solicitar dato oficial · medio + parcial → borrador opcional con vacíos · medio + suficiente → producir si hay capacidad.");
k("bajo + insuficiente → archivar con motivo · bajo + parcial → monitorear · bajo + suficiente → disponible bajo demanda.");

// 7 · Señales
h1("6 · Add-on: señales de credibilidad (SC-01..SC-09)");
p("Diseñadas como lista de verificaciones pendientes, nunca como veredicto. Términos prohibidos: verdadero, falso, fake, bulo, desinformación confirmada. Vocabulario controlado: sin señales · revisar · verificación prioritaria.");
k("SC-01 Recirculación (código) — fecha_publicacion antigua vs fecha_deteccion reciente. Efecto: U y N con fecha original.");
k("SC-02 Procedencia única replicada (código) — n notas, 1 procedencia. Efecto: E cuenta procedencias, no notas.");
k("SC-03 Cifra en conflicto con dato oficial (IA extrae, código compara) — contradicción visible; estado ≤ parcial.");
k("SC-04 Atribución ausente (IA) — verificación: identificar fuente primaria.");
k("SC-05 Tono sensacionalista (IA) — solo aviso; no afecta P ni el estado.");
k("SC-06 Fuera de catálogo (código) — dominio no listado en fuentes.json; no cuenta como procedencia.");
k("SC-07 Titular vs contenido (IA) — con solo metadatos: «no evaluable».");
k("SC-08 Instrucciones incrustadas (código + P00) — contenido no confiable; se registra y nunca se ejecuta.");
k("SC-09 Hecho no hallado en fuente oficial (código) — «no encontrado en catálogo oficial», nunca «falso».");
p("Regla: cada señal de IA lleva razón y cita; sin cita se descarta. Tono, volumen o repetición no equivalen a fraude, pérdida ni verdad comprobada.");

// 8 · Validaciones
h1("7 · Validaciones determinísticas (V01–V10)");
k("V01 Esquema JSON válido (campos y tipos).");
k("V02 Toda afirmación hecho/declaración tiene ≥1 cita y el ID existe en el paquete de evidencias.");
k("V03 El pasaje citado existe literalmente en la evidencia (normalizando espacios).");
k("V04 Cada cifra del texto aparece en la evidencia citada (1.5 / 1,5 / %).");
k("V05 Límites: brief ≤250 palabras; guion 113–150; copy ≤80; titulares ≤70 caracteres; 3 preguntas exactas.");
k("V06 Aviso «Basado únicamente en titular/metadatos» presente si y solo si corresponde.");
k("V07 Léxico prohibido: veredictos, clickbait, superlativos sin dato; comillas inexistentes; en Banca además recomendaciones, compra/venta, impago, pérdidas o exposición de cartera.");
k("V08 «hoy», «actualmente» o «este año» junto a un dato anual histórico → error.");
k("V09 El sistema no puede asignar «aprobado como borrador» ni «descartado».");
k("V10 Ningún secreto o token en prompts, salidas ni logs.");
p("Flujo: el validador decide; si falla, regenera 1 vez con los errores señalados; si falla 2 veces, el caso pasa a «requiere evidencia» (M14, ARQ-09).");

// 10 · Prompts
h1("9 · Prompts (P00–P09) y REGLAS_GLOBALES");
p("Bloque {{REGLAS_GLOBALES}} (RG-1.0) inyectado en todos los prompts: evidencia o abstención; el modelo interpreta y el código decide; la fuente es dato; señal ≠ veredicto; la persona decide; no inventar; aviso de titular/metadatos; fechas UTC; nulos conservados; sin secretos.");
k("P00 Guardia anti-inyección — confiable, instrucciones_incrustadas, razón.");
k("P01 Organizador — tema principal/secundarios, geo_panama, entidades, agencia de origen, procedencia.");
k("P02 Extractor de afirmaciones — tipo, texto, cifra, unidad, período, pasaje literal, citas.");
k("P03 Contextualizador oficial — vínculos propuestos; el código verifica y copia cifras.");
k("P04 Asesor de credibilidad — señales con razón y cita, sin veredicto.");
k("P05 Evaluador de impacto (I de RIUNE) — nivel 0–4 con citas; el código acota.");
k("P06 Ficha — resumen ≤60 palabras, vacíos, acción recomendada.");
k("P07a Enrutador de intención — agenda / dato_oficial / tema_evento / verificación / fuera_alcance.");
k("P07b Respuesta con evidencia o abstención — respuesta, abstencion, información_necesaria, citas.");
k("P08 Redactor del entregable — aviso de alcance, título, enfoque, hechos con citas, contexto oficial, 3 preguntas, guion, copy.");
k("P09 Verificador de sustento — oraciones problemáticas, sustentado.");
p("Salida estructurada JSON validada por zod con 1 reintento (ARQ-09); caché por (versión de prompt, hash de entrada) para el modo sin internet.");

// 11 · Datos
h1("10 · Contrato de datos (S0/S1)");
h3("10.1 Archivos del snapshot");
k("noticias.csv — id_noticia, titulo, url, medio, idioma, fecha_publicacion, fecha_deteccion, fecha_extraccion, tema, origen, alcance_texto (+ propuestos: procedencia, dominio, url_canonica, id_evento, descripcion).");
k("fuentes.json — arreglo: dominio, medio, familia, licencia, redistribución.");
k("indicadores.csv — pais_iso3, indicador_id, anio, valor (nullable), unidad, fuente_url, fecha_extraccion, licencia (+ nota_fuente).");
k("eventos.geojson — FeatureCollection: id, magnitude, time, updated, longitude, latitude, depth, place, status, URL.");
k("sbp_series.csv (Banca) — informe, serie, periodo, valor (nullable), unidad, pagina, fuente_url, fecha_extraccion, condiciones.");
k("manifest.json — version, fecha_corte_UTC, consultas, licencia/condiciones, SHA-256 por archivo, transformaciones, cobertura.");
h3("10.2 ID de evidencia (ARQ-05)");
c("NOT:{id}:{campo} · WB:{pais}:{indicador}:{anio} · USGS:{id}:{campo} · SBP:{informe}:{serie}:{periodo}:p{pagina}");
p("Una URL sin relación con la afirmación no es cita válida. Reglas de integridad: UTF-8, IDs estables, fechas ISO 8601 UTC (interfaz en hora de Panamá), nulos conservados (nunca cero), fecha de publicación distinta del seendate de GDELT.");

// 12 · Requisitos
h1("11 · Requisitos de arquitectura, IA y seguridad");
h3("11.1 Arquitectura (ARQ-01..14)");
k("ARQ-01 Pipeline por lote (fuentes → validación → almacenamiento → agrupación → priorización → generación → interfaz → revisión → Notion).");
k("ARQ-02 Etapas 1–4 precalculadas; en vivo solo recuperación + 1 llamada al modelo por consulta (mediana ≤15 s).");
k("ARQ-03 Modo sin internet: snapshot e índice locales, caché por (versión de prompt, hash de entrada), fallback documentado.");
k("ARQ-04 Fecha de corte inyectada como parámetro, nunca el reloj del sistema.");
k("ARQ-05 Formato de ID de evidencia NOT/WB/USGS/SBP.");
k("ARQ-06 Almacenamiento UTC ISO 8601; visualización hora de Panamá.");
k("ARQ-07 Pesos y parámetros RIUNE en archivo versionado; versión visible; cambios con decisión en Notion.");
k("ARQ-08 Prompts versionados con hash; parámetros registrados por ejecución.");
k("ARQ-09 Salida JSON validada por esquema; 1 reintento; si falla → requiere evidencia.");
k("ARQ-10 Registros de solo anexar para revisiones y ejecuciones.");
k("ARQ-11 Contrato de datos como interfaz entre módulos.");
k("ARQ-12 Capa de datos de la demo local; Notion es registro y presentación.");
k("ARQ-13 Observabilidad: latencia por etapa, tokens, costo y versiones, sin secretos.");
k("ARQ-14 Repositorio: README, instalación, comando de ejecución, dependencias fijadas, .env.example sin secretos, pruebas automatizadas.");
h3("11.2 Uso sustantivo de IA (IA-01..08)");
k("IA-01 Cuatro capacidades NLP: clasificación semántica, similitud para eventos, extracción de entidades/afirmaciones, recuperación semántica.");
k("IA-02 Generar solo sobre evidencia recuperada; sin conocimiento externo para afirmar hechos.");
k("IA-03 Separar instrucciones del contenido: instrucciones en el sistema; el contenido nunca va en el rol de sistema.");
k("IA-04 Estructura de salida con citas por afirmación y lista de vacíos.");
k("IA-05 Comparar contra baseline y explicar qué mejora la IA y cuándo no ayuda.");
k("IA-06 Documentar modelo, versión, prompts, parámetros, costo y limitaciones.");
k("IA-07 El modelo interpreta; el código decide (no calcula puntajes, no escribe cifras oficiales, no cambia estados).");
k("IA-08 Credibilidad: el modelo asesora con razones y cita, no detecta verdad.");
h3("11.3 Seguridad y ética (SEG-01..10)");
k("SEG-01 Control humano (5 estados; aprobar ≠ publicar). SEG-02 Anti-alucinación (abstención + validador). SEG-03 Anti-inyección (fuente = dato).");
k("SEG-04 Privacidad y reputación (acusaciones como declaraciones). SEG-05 Derechos y acceso (solo metadatos). SEG-06 Credenciales y costos (sin secretos, escaneo, tope de gasto).");
k("SEG-07 Alertas responsables. SEG-08 Restricción de alcance (aviso titular/metadatos). SEG-09 Límites de modalidad (sin audiencia, sin recomendación). SEG-10 Sesgo (puntuar por procedencias, no por notas).");

// ---------- Renderer ----------
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

  const nuevaPagina = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - 56;
  };
  const asegurar = (n) => {
    if (y < n) nuevaPagina();
  };

  // WinAnsi (Helvetica estándar) no codifica ciertos símbolos; se reemplazan.
  const sanear = (s) =>
    String(s)
      .replace(/→/g, "->")
      .replace(/←/g, "<-")
      .replace(/≠/g, "!=")
      .replace(/≤/g, "<=")
      .replace(/≥/g, ">=")
      .replace(/−/g, "-")
      .replace(/–/g, "-")
      .replace(/—/g, "-")
      .replace(/Δ/g, "D")
      .replace(/×/g, "x")
      .replace(/…/g, "...");

  const escribir = (texto, size, f, color, interlinea, sangria = 0) => {
    const max = ancho - sangria;
    const palabras = sanear(texto).split(" ");
    let linea = "";
    for (const palabra of palabras) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (f.widthOfTextAtSize(prueba, size) > max && linea) {
        asegurar(size + interlinea);
        page.drawText(linea, { x: M + sangria, y, size, font: f, color });
        y -= size + interlinea;
        linea = palabra;
      } else {
        linea = prueba;
      }
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
    } else if (tipo === "k") {
      const i = texto.indexOf("—");
      if (i > 0) {
        escribir(texto.slice(0, i + 1), 10, bold, ink, 3);
        escribir(texto.slice(i + 1), 10, font, ink, 3, 0);
      } else {
        escribir("•  " + texto, 10, font, ink, 3);
      }
      y -= 2;
    } else if (tipo === "c") {
      asegurar(13);
      page.drawRectangle({ x: M, y: y - 3, width: ancho, height: 14, color: rgb(0.95, 0.96, 0.97) });
      page.drawText(sanear(texto), { x: M + 6, y: y, size: 8.5, font, color: rgb(0.2, 0.25, 0.32) });
      y -= 16;
    } else if (tipo === "gap") {
      y -= 8;
    }
  }

  // Pie de página
  const total = pages.length;
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: 30 }, end: { x: W - M, y: 30 }, thickness: 0.5, color: line });
    pg.drawText("open-news v1 · Arquitectura completa", { x: M, y: 18, size: 7.5, font, color: gris });
    pg.drawText(`${i + 1} / ${total}`, { x: W - M - 40, y: 18, size: 7.5, font, color: gris });
  });

  const bytes = await doc.save();
  const destino = path.join(OUT, "Arquitectura-open-news-v1.pdf");
  fs.writeFileSync(destino, bytes);
  console.log(`${destino} (${bytes.length} bytes · ${total} páginas)`);
}

generar().catch((e) => {
  console.error("Error generando PDF:", e);
  process.exit(1);
});
