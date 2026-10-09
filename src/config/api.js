// Backend de configuración en caliente (ARQ-15 · docs/ANALISIS-CONFIGURACION.md).
// Catálogo tipado sobre DEFAULTS, persistencia local en data/config.json (fallback
// offline) y sincronización best-effort desde Notion (Reglas/Prompts/Fuentes).
// Los secretos (API keys, tokens, IDs) siguen viviendo solo en .env.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { DEFAULTS } from "./defaults.js";
import { notion, consultarNotion } from "../notion/client.js";
import { log } from "../utils/logger.js";

// ---------- Catálogo editable (clave pública → ruta en `config`) ----------
const CATALOGO = [
  // Modelo / proveedor (no secretos).
  { clave: "modelo_primario", ruta: "llm.primario.modelo", tipo: "string", seccion: "Modelo", descripcion: "Modelo base del proveedor primario" },
  { clave: "razonador_primario", ruta: "llm.primario.modeloRazonador", tipo: "string", seccion: "Modelo", descripcion: "Modelo razonador del proveedor primario" },
  { clave: "temperatura", ruta: "llm.primario.temperatura", tipo: "number", seccion: "Modelo", descripcion: "Temperatura de generación" },
  { clave: "max_tokens", ruta: "llm.primario.maxTokens", tipo: "number", seccion: "Modelo", descripcion: "Máximo de tokens por respuesta" },
  { clave: "modelo_secundario", ruta: "llm.secundario.modelo", tipo: "string", seccion: "Modelo", descripcion: "Modelo del proveedor de respaldo (LLM2)" },
  { clave: "base_secundario", ruta: "llm.secundario.baseURL", tipo: "string", seccion: "Modelo", descripcion: "Base URL del proveedor de respaldo" },
  { clave: "razonador_secundario", ruta: "llm.secundario.modeloRazonador", tipo: "string", seccion: "Modelo", descripcion: "Modelo razonador del proveedor de respaldo" },

  // RIUNE.
  { clave: "peso_R", ruta: "weights.R", tipo: "number", seccion: "RIUNE", descripcion: "Peso de Relevancia" },
  { clave: "peso_I", ruta: "weights.I", tipo: "number", seccion: "RIUNE", descripcion: "Peso de Impacto" },
  { clave: "peso_U", ruta: "weights.U", tipo: "number", seccion: "RIUNE", descripcion: "Peso de Urgencia" },
  { clave: "peso_N", ruta: "weights.N", tipo: "number", seccion: "RIUNE", descripcion: "Peso de Novedad" },
  { clave: "peso_E", ruta: "weights.E", tipo: "number", seccion: "RIUNE", descripcion: "Peso de Evidencia" },
  { clave: "umbral_similitud_titulo", ruta: "umbralSimilitudTitulo", tipo: "number", seccion: "RIUNE", descripcion: "Umbral de casi-duplicado (caracteres)" },
  { clave: "umbral_similitud_semantica", ruta: "umbralSimilitudSemantica", tipo: "number", seccion: "RIUNE", descripcion: "Umbral de similitud semántica" },
  { clave: "umbral_abstencion", ruta: "umbralAbstencion", tipo: "number", seccion: "RIUNE", descripcion: "Umbral de abstención en consulta" },
  { clave: "ventana_eventos_horas", ruta: "ventanaEventosHoras", tipo: "number", seccion: "RIUNE", descripcion: "Ventana de agrupación de eventos (horas)" },

  // Filtro S3F.
  { clave: "umbral_senales_revisar", ruta: "filtro.umbralSenalesRevisar", tipo: "number", seccion: "Filtro S3F", descripcion: "Señales 'revisar' para retener" },
  { clave: "senales_prioritarias", ruta: "filtro.prioritarias", tipo: "json", seccion: "Filtro S3F", descripcion: "Señales prioritarias (array)" },

  // Límites de entregables.
  { clave: "lim_brief_palabras", ruta: "limites.briefPalabras", tipo: "number", seccion: "Límites", descripcion: "Brief (palabras)" },
  { clave: "lim_resumen_palabras", ruta: "limites.resumenPalabras", tipo: "number", seccion: "Límites", descripcion: "Resumen (palabras)" },
  { clave: "lim_copy_palabras", ruta: "limites.copyPalabras", tipo: "number", seccion: "Límites", descripcion: "Copy (palabras)" },
  { clave: "lim_titular_caracteres", ruta: "limites.titularCaracteres", tipo: "number", seccion: "Límites", descripcion: "Titular (caracteres)" },
  { clave: "lim_preguntas", ruta: "limites.preguntas", tipo: "number", seccion: "Límites", descripcion: "Preguntas por agenda" },

  // Léxicos.
  { clave: "lexico_prohibido", ruta: "lexicoProhibido", tipo: "json", seccion: "Léxicos", descripcion: "Términos prohibidos (array)" },
  { clave: "lexico_banca", ruta: "lexicoBanca", tipo: "json", seccion: "Léxicos", descripcion: "Términos prohibidos en Banca (array)" },

  // Paleta.
  { clave: "paleta_primario", ruta: "paleta.primario", tipo: "string", seccion: "Paleta", descripcion: "Color primario (hex)" },
  { clave: "paleta_aviso", ruta: "paleta.aviso", tipo: "string", seccion: "Paleta", descripcion: "Color de aviso (hex)" },
];

const CATALOGO_MAP = Object.fromEntries(CATALOGO.map((c) => [c.clave, c]));

// ---------- Helpers de ruta ----------
function getPath(obj, ruta) {
  return ruta.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function setPath(obj, ruta, valor) {
  const partes = ruta.split(".");
  const ultimo = partes.pop();
  const destino = partes.reduce((acc, k) => {
    if (acc[k] == null || typeof acc[k] !== "object") acc[k] = {};
    return acc[k];
  }, obj);
  destino[ultimo] = valor;
}

function normalizarValor(campo, valor) {
  if (campo.tipo === "number") {
    const n = Number(valor);
    if (Number.isNaN(n)) throw new Error(`${campo.clave}: valor numérico requerido`);
    return n;
  }
  if (campo.tipo === "json") {
    if (typeof valor === "string") return JSON.parse(valor);
    return valor;
  }
  return String(valor);
}

// ---------- Persistencia local ----------
const configPath = () => path.join(config.dataDir, "config.json");
const TVN_FEED = process.env.TVN_RSS_URL || "https://www.tvn-2.com/rss/";
// Catálogo inicial de 20 feeds (RSS noticias + fuentes oficiales). La salud de
// cada feed se valida en /api/feeds y se ajusta desde /admin.
const FEEDS_DEFAULT = [
  { medio: "TVN", familia: "B", nivel: "N1", url_feed: TVN_FEED, activo: true },
  { medio: "La Prensa", familia: "B", nivel: "N1", url_feed: "https://www.prensa.com/feed/", activo: true },
  { medio: "La Estrella de Panamá", familia: "B", nivel: "N1", url_feed: "https://www.laestrella.com.pa/feed/", activo: true },
  { medio: "Telemetro", familia: "B", nivel: "N1", url_feed: "https://www.telemetro.com/feed/", activo: true },
  { medio: "Metro Libre", familia: "B", nivel: "N2", url_feed: "https://www.metrolibre.com/feed/", activo: true },
  { medio: "El Siglo", familia: "B", nivel: "N2", url_feed: "https://elsiglo.com.pa/feed/", activo: true },
  { medio: "ANPanamá", familia: "B", nivel: "N2", url_feed: "https://www.anpanama.com/feed/", activo: true },
  { medio: "Crítica", familia: "B", nivel: "N3", url_feed: "https://www.critica.com.pa/feed/", activo: true },
  { medio: "Foco Panamá", familia: "B", nivel: "N2", url_feed: "https://focopanama.com/feed/", activo: true },
  { medio: "Mi Diario", familia: "B", nivel: "N2", url_feed: "https://www.midiario.com/feed/", activo: true },
  { medio: "Panamá América", familia: "B", nivel: "N2", url_feed: "https://www.panamaamerica.com.pa/feed/", activo: true },
  { medio: "BBC Mundo", familia: "E", nivel: "N2", url_feed: "https://feeds.bbci.co.uk/mundo/rss.xml", activo: true },
  { medio: "CNN en Español", familia: "E", nivel: "N2", url_feed: "https://cnnespanol.cnn.com/feed/", activo: true },
  { medio: "El País América", familia: "E", nivel: "N2", url_feed: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada", activo: true },
  { medio: "France24 Español", familia: "E", nivel: "N2", url_feed: "https://www.france24.com/es/rss", activo: true },
  { medio: "DW Español", familia: "E", nivel: "N2", url_feed: "https://rss.dw.com/rdf/rss-es-all", activo: true },
  { medio: "USGS Sismos", familia: "F", nivel: "N1", url_feed: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", activo: true },
  { medio: "Banco Mundial", familia: "F", nivel: "N1", url_feed: "https://api.worldbank.org/v2/country/PAN/indicator", activo: true },
  { medio: "GDELT Panamá", familia: "F", nivel: "N2", url_feed: "https://api.gdeltproject.org/api/v2/doc/doc?query=Panama&format=json", activo: true },
  { medio: "EFE América", familia: "E", nivel: "N2", url_feed: "https://www.efe.com/efe/america/rss", activo: false },
];

let store = { version: 0, sobrescritos: {}, feeds: FEEDS_DEFAULT };

async function leerStore() {
  try {
    const data = JSON.parse(await readFile(configPath(), "utf8"));
    store = {
      version: Number(data.version) || 0,
      sobrescritos: data.sobrescritos || {},
      feeds: Array.isArray(data.feeds) ? data.feeds : FEEDS_DEFAULT,
    };
  } catch {
    store = { version: 0, sobrescritos: {}, feeds: FEEDS_DEFAULT };
  }
  return store;
}

async function persistirStore() {
  await mkdir(path.dirname(configPath()), { recursive: true });
  await writeFile(configPath(), JSON.stringify({ ...store, actualizado: new Date().toISOString() }, null, 2), "utf8");
}

// Aplica los sobrescritos al objeto `config` en memoria.
function aplicarSobrescritos(sobrescritos) {
  for (const [clave, valor] of Object.entries(sobrescritos)) {
    const campo = CATALOGO_MAP[clave];
    if (!campo) continue;
    try {
      setPath(config, campo.ruta, normalizarValor(campo, valor));
    } catch (e) {
      log.warn(`Config: no se aplicó "${clave}":`, e.message);
    }
  }
}

export async function inicializarConfig() {
  await leerStore();
  aplicarSobrescritos(store.sobrescritos);
  return store;
}

// ---------- Vistas ----------
function valoresActuales() {
  const out = {};
  for (const campo of CATALOGO) {
    try { out[campo.clave] = getPath(config, campo.ruta); } catch { out[campo.clave] = null; }
  }
  return out;
}

export function catalogoSaneado() {
  return CATALOGO.map(({ clave, tipo, seccion, descripcion }) => ({ clave, tipo, seccion, descripcion }));
}

export function estadoConfig() {
  return {
    version: store.version,
    sobrescritos: store.sobrescritos,
    actuales: valoresActuales(),
    feeds: store.feeds,
    catalogo: catalogoSaneado(),
  };
}

// Vista pública (sin secretos ni catálogo interno).
export function configPublica() {
  return {
    version: store.version,
    sobrescritos: store.sobrescritos,
    actuales: valoresActuales(),
    feeds: store.feeds.filter((f) => f.activo !== false).map((f) => ({ medio: f.medio, familia: f.familia, nivel: f.nivel, url_feed: f.url_feed })),
  };
}

// ---------- Mutaciones ----------
export async function guardarAjustes({ ajustes = {}, feeds = null } = {}) {
  const aplicados = {};
  for (const [clave, valor] of Object.entries(ajustes)) {
    const campo = CATALOGO_MAP[clave];
    if (!campo) throw new Error(`Clave desconocida: ${clave}`);
    const normalizado = normalizarValor(campo, valor);
    aplicados[clave] = normalizado;
  }
  // Aplica primero en memoria; si algo falla al persistir, revierte no es crítico
  // porque el siguiente arranque relee el archivo.
  aplicarSobrescritos(aplicados);
  store.sobrescritos = { ...store.sobrescritos, ...aplicados };
  if (feeds !== null) {
    if (!Array.isArray(feeds)) throw new Error("feeds debe ser un array");
    store.feeds = feeds;
  }
  store.version += 1;
  await persistirStore();
  return { ok: true, version: store.version, aplicados: Object.keys(aplicados), feeds: store.feeds };
}

export async function restablecerConfig() {
  store = { version: store.version + 1, sobrescritos: {}, feeds: FEEDS_DEFAULT };
  // Reaplica los valores por defecto desde DEFAULTS en el objeto config.
  config.weights = { ...DEFAULTS.weights };
  config.bands = DEFAULTS.bands;
  config.modalidades = DEFAULTS.modalidades;
  config.temas = DEFAULTS.temas;
  config.sectores = DEFAULTS.sectores;
  config.geo = DEFAULTS.geo;
  config.ventanaEventosHoras = DEFAULTS.ventanaEventosHoras;
  config.umbralSimilitudTitulo = DEFAULTS.umbralSimilitudTitulo;
  config.umbralSimilitudSemantica = DEFAULTS.umbralSimilitudSemantica;
  config.umbralAbstencion = DEFAULTS.umbralAbstencion;
  config.lexicoProhibido = DEFAULTS.lexicoProhibido;
  config.lexicoBanca = DEFAULTS.lexicoBanca;
  config.limites = { ...DEFAULTS.limites };
  config.filtro = { ...DEFAULTS.filtro };
  config.paleta = { ...DEFAULTS.paleta };
  config.llm.primario = { ...config.llm.primario, modelo: DEFAULTS.deepseek.modelo, modeloRazonador: DEFAULTS.deepseek.modeloRazonador, temperatura: DEFAULTS.deepseek.temperatura, maxTokens: DEFAULTS.deepseek.maxTokens };
  await persistirStore();
  return { ok: true, version: store.version };
}

// ---------- Sincronización best-effort desde Notion ----------
function leerPropiedades(page) {
  const fila = { id: page.id };
  for (const [nombre, v] of Object.entries(page.properties || {})) {
    if (v.type === "title") fila[nombre] = v.title?.map((t) => t.plain_text).join("");
    else if (v.type === "rich_text") fila[nombre] = v.rich_text?.map((t) => t.plain_text).join("");
    else if (v.type === "number") fila[nombre] = v.number;
    else if (v.type === "select") fila[nombre] = v.select?.name ?? null;
    else if (v.type === "multi_select") fila[nombre] = v.multi_select?.map((s) => s.name) ?? [];
    else if (v.type === "checkbox") fila[nombre] = v.checkbox;
    else if (v.type === "url") fila[nombre] = v.url ?? null;
    else if (v.type === "date") fila[nombre] = v.date?.start ?? null;
  }
  return fila;
}

async function leerBase(databaseId) {
  const res = await consultarNotion(() => notion.databases.query({ database_id: databaseId, page_size: 100 }));
  return res.results.map(leerPropiedades);
}

export async function sincronizarNotion() {
  const resultado = { reglas: null, prompts: null, fuentes: null, errores: [] };
  const tareas = [
    ["reglas", config.notion.databases.reglas],
    ["prompts", config.notion.databases.prompts],
    ["fuentes", config.notion.databases.fuentes],
  ];
  for (const [clave, dbId] of tareas) {
    if (!dbId) continue;
    try {
      resultado[clave] = await leerBase(dbId);
    } catch (e) {
      resultado.errores.push(`${clave}: ${e.message}`);
      log.warn(`Config: sincronizar Notion ${clave} omitida:`, e.message);
    }
  }
  return resultado;
}
