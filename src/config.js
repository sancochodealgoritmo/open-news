import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "./config/defaults.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuración central. Las credenciales provienen del entorno (.env); los
// parámetros operativos vienen de DEFAULTS (única fuente de verdad).
export const config = {
  env: process.env.NODE_ENV || "production",
  port: Number(process.env.PORT) || 3000,

  // Capa de datos local: raw/ (snapshot), processed/ (salidas versionadas).
  dataDir: process.env.DATA_DIR || path.join(__dirname, "..", "data"),

  notion: {
    token: process.env.NOTION_TOKEN,
    databases: {
      fichas: process.env.NOTION_DB_FICHAS,
      revisiones: process.env.NOTION_DB_REVISIONES,
      bitacora: process.env.NOTION_DB_BITACORA,
      reglas: process.env.NOTION_DB_REGLAS,
      prompts: process.env.NOTION_DB_PROMPTS,
      fuentes: process.env.NOTION_DB_FUENTES,
      ejecuciones: process.env.NOTION_DB_EJECUCIONES,
      pruebas: process.env.NOTION_DB_PRUEBAS,
    },
  },

  // Proveedor de modelo con respaldo: LLM_* (primario) → LLM2_* (secundario).
  // Compatibilidad: DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL actúan como alias del primario.
  llm: {
    primario: {
      apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      modelo: process.env.LLM_MODEL || DEFAULTS.deepseek.modelo,
      modeloRazonador: process.env.LLM_MODEL_REASONER || DEFAULTS.deepseek.modeloRazonador,
      temperatura: Number(process.env.LLM_TEMPERATURE) || DEFAULTS.deepseek.temperatura,
      maxTokens: Number(process.env.LLM_MAX_TOKENS) || DEFAULTS.deepseek.maxTokens,
    },
    secundario: {
      apiKey: process.env.LLM2_API_KEY || "",
      baseURL: process.env.LLM2_BASE_URL || "",
      modelo: process.env.LLM2_MODEL || "",
      modeloRazonador: process.env.LLM2_MODEL_REASONER || "",
      temperatura: Number(process.env.LLM2_TEMPERATURE) || DEFAULTS.deepseek.temperatura,
      maxTokens: Number(process.env.LLM2_MAX_TOKENS) || DEFAULTS.deepseek.maxTokens,
    },
  },

  // Paralelismo del enriquecimiento IA (pool de concurrencia, 1-10).
  iaConcurrency: Math.min(10, Math.max(1, Number(process.env.IA_CONCURRENCY) || 8)),

  // MySQL / MariaDB (sistema de registro operativo).
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "open_news",
    password: process.env.DB_PASSWORD || "",
    name: process.env.DB_NAME || "open_news",
  },

  // Reglas y parámetros operativos (por defecto, versionados).
  rulesVersion: DEFAULTS.rulesVersion,
  weights: { ...DEFAULTS.weights },
  bands: DEFAULTS.bands,
  modalidades: DEFAULTS.modalidades,
  temas: DEFAULTS.temas,
  sectores: DEFAULTS.sectores,
  geo: DEFAULTS.geo,
  ventanaEventosHoras: DEFAULTS.ventanaEventosHoras,
  umbralSimilitudTitulo: DEFAULTS.umbralSimilitudTitulo,
  umbralSimilitudSemantica: DEFAULTS.umbralSimilitudSemantica,
  umbralAbstencion: DEFAULTS.umbralAbstencion,
  evidenciaEstados: DEFAULTS.evidenciaEstados,
  revisionEstados: DEFAULTS.revisionEstados,
  lexicoProhibido: DEFAULTS.lexicoProhibido,
  lexicoBanca: DEFAULTS.lexicoBanca,
  avisoTitularMetadatos: DEFAULTS.avisoTitularMetadatos,
  avisoBorrador: DEFAULTS.avisoBorrador,
  limites: { ...DEFAULTS.limites },
  cacheTtlMs: DEFAULTS.cacheTtlMs,
  rateLimitNotion: { ...DEFAULTS.rateLimitNotion },
  timeouts: { ...DEFAULTS.timeouts },

  // v1.4 · Snapshot, fecha de corte y modo sin internet.
  snapshotDir: process.env.SNAPSHOT_DIR || path.join(__dirname, "..", "data", "snapshot"),
  fechaCorte: process.env.FECHA_CORTE_UTC || null,
  modoOffline: process.env.MODO_OFFLINE || "auto",

  // v1.4 · Filtro de desinformación y confiabilidad.
  rutasFiltro: DEFAULTS.rutasFiltro,
  filtro: { ...DEFAULTS.filtro },
  nivelesConfiabilidad: DEFAULTS.nivelesConfiabilidad,
  paleta: DEFAULTS.paleta,
};
