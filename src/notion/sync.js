// M16 · Registro en Notion (opcional; la demo no depende de Notion — ARQ-12).
// Sincroniza fichas y revisiones contra el ESQUEMA REAL de Notion (docs/ANALISIS-NOTION.md
// y docs/PLAN-MYSQL-SYNC.md). Notion es registro y presentación, nunca la capa de datos.
import { config } from "../config.js";
import { notion, consultarNotion } from "./client.js";
import { log } from "../utils/logger.js";

// --- Normalizadores de select contra las opciones reales de Notion ---
const MODALIDAD = { principal: "TVN · Principal", digital: "TVN · Digital", banca: "Banca" };
const TEMA = {
  economia: "economía",
  logistica_canal: "logística/Canal",
  turismo: "turismo",
  servicios_publicos: "servicios públicos",
  eventos_naturales: "eventos naturales",
  regulacion: "regulación",
  otros: "otros",
};
const TEMA_KEYWORDS = [
  ["economía", /econom|tasas|pib|inflaci|mercado|fiscal|financier|banca/i],
  ["logística/Canal", /canal|puerto|logístic|marítim|transporte|tránsito/i],
  ["turismo", /turis|hotel|visitante/i],
  ["servicios públicos", /agua|energ|electric|servicio/i],
  ["eventos naturales", /sismo|terremoto|lluvia|inundaci|clima|desastre/i],
  ["regulación", /ley|decreto|regul|reforma|judicial|gobierno/i],
];
const NIVEL = {
  sin_senales: "sin señales",
  revisar: "revisar",
  verificacion_prioritaria: "verificación prioritaria",
};
const ESTADO_REV = {
  nuevo: "nuevo",
  en_revision: "en revisión",
  requiere_evidencia: "requiere evidencia",
  aprobado_borrador: "aprobado como borrador",
  descartado: "descartado",
};
const ALCANCE = { "titular/metadatos": "solo titular/metadatos", completo: "completo", extracto: "extracto" };
const DECISION = {
  aprobar: "aceptación",
  descartar: "descarte",
  requiere_evidencia: "solicitud de evidencia",
  tomar: "corrección",
};
const SENAL = {
  "SC-01": "SC-01 Recirculación",
  "SC-02": "SC-02 Procedencia única replicada",
  "SC-03": "SC-03 Cifra en conflicto con dato oficial",
  "SC-04": "SC-04 Atribución ausente",
  "SC-05": "SC-05 Tono sensacionalista",
  "SC-06": "SC-06 Fuera de catálogo",
  "SC-07": "SC-07 Titular vs contenido",
  "SC-08": "SC-08 Instrucciones incrustadas",
  "SC-09": "SC-09 Hecho no hallado en fuente oficial",
  "SC-10": "SC-10 Revisión externa",
};

// Mapa nombre → user id de Notion (people). Se alimenta desde NOTION_PEOPLE
// (JSON: {"Nombre Apellido":"uuid-de-notion"}). Vacío por defecto: se omite la
// propiedad people en las páginas sincronizadas.
const USUARIOS = (() => {
  try {
    const raw = process.env.NOTION_PEOPLE;
    if (raw) return JSON.parse(raw);
  } catch {
    // Mapa inválido: se ignora y se omite la propiedad people.
  }
  return {};
})();

function normalizarTema(tema) {
  if (!tema) return "otros";
  const s = String(tema).toLowerCase().trim();
  if (TEMA[s]) return TEMA[s];
  for (const [label, re] of TEMA_KEYWORDS) if (re.test(s)) return label;
  return "otros";
}

function richTexto(texto) {
  const s = String(texto ?? "").trim();
  return s ? [{ text: { content: s } }] : [];
}

function selectDe(valor) {
  return valor ? { select: { name: valor } } : undefined;
}

function peopleDe(nombre) {
  const userId = nombre ? USUARIOS[nombre] : null;
  return userId ? { people: [{ id: userId }] } : undefined;
}

function limpiar(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

async function buscarPorTitulo(databaseId, titulo, propiedad = "Name") {
  const res = await consultarNotion(() =>
    notion.databases.query({
      database_id: databaseId,
      filter: { property: propiedad, title: { equals: titulo } },
      page_size: 1,
    })
  );
  return res.results[0] || null;
}

// Ficha → BD Fichas (propiedades según el esquema real).
export async function syncFicha(ficha) {
  const db = config.notion.databases.fichas;
  if (!db) return null;
  const titulo = ficha.id_caso;
  const existente = await buscarPorTitulo(db, titulo, "ID caso");
  const c = ficha.componentes || {};
  const senales = (ficha.senales || []).map((s) => SENAL[s.codigo]).filter(Boolean);
  const afirmaciones = (ficha.afirmaciones || []).map((a) => a.texto).join(" | ");
  const citas = (ficha.citas || [])
    .map((x) => (typeof x === "string" ? x : x.id_evidencia || x.id || ""))
    .filter(Boolean)
    .join(", ");
  const verificaciones = (ficha.verificaciones_pendientes || []).map((v) => v.accion).join("; ");

  const propiedades = limpiar({
    "ID caso": { title: [{ text: { content: titulo } }] },
    Evento: { rich_text: richTexto(ficha.id_evento) },
    Modalidad: selectDe(MODALIDAD[ficha.modalidad] || ficha.modalidad),
    Tema: selectDe(normalizarTema(ficha.tema)),
    P: { number: ficha.puntaje ?? null },
    R: { number: c.R ?? null },
    I: { number: c.I ?? null },
    U: { number: c.U ?? null },
    N: { number: c.N ?? null },
    E: { number: c.E ?? null },
    "Procedencias independientes": { number: ficha.procedencias?.length ?? null },
    "Estado de evidencia": selectDe(ficha.estado_evidencia),
    "Estado de revisión": selectDe(ESTADO_REV[ficha.estado_revision || "nuevo"] || ficha.estado_revision || "nuevo"),
    "Ruta FD": selectDe(ficha.ruta_fd || "pasa"),
    "Nivel de atención": selectDe(NIVEL[ficha.nivel_atencion] || ficha.nivel_atencion),
    "Alcance del texto": selectDe(ALCANCE[ficha.alcance_texto] || ficha.alcance_texto),
    Señales: { multi_select: senales.map((name) => ({ name })) },
    Afirmaciones: { rich_text: richTexto(afirmaciones) },
    Citas: { rich_text: richTexto(citas) },
    "IDs fuente": { rich_text: richTexto((ficha.ids_fuente || []).join(", ")) },
    "Verificaciones pendientes": { rich_text: richTexto(verificaciones) },
    "Versión de reglas": { rich_text: richTexto(ficha.version_reglas || config.rulesVersion) },
    "Liberado por": { rich_text: richTexto(ficha.liberacion?.por) },
    "Motivo de liberación": { rich_text: richTexto(ficha.liberacion?.motivo) },
  });
  const persona = peopleDe(ficha.persona_revisora);
  if (persona) propiedades["Persona revisora"] = persona;

  if (existente) {
    await consultarNotion(() => notion.pages.update({ page_id: existente.id, properties: propiedades }));
    return existente.id;
  }
  const creada = await consultarNotion(() =>
    notion.pages.create({ parent: { database_id: db }, properties: propiedades })
  );
  return creada.id;
}

// Revisión → BD Revisiones (solo anexar: siempre se crea una fila nueva).
export async function syncRevision(revision, { fichaPageId = null } = {}) {
  const db = config.notion.databases.revisiones;
  if (!db) return null;
  const propiedades = limpiar({
    Revisión: { title: [{ text: { content: `Rev-${revision.id_caso}-${Date.now()}` } }] },
    Decisión: selectDe(DECISION[revision.hacia] || revision.hacia),
    Motivo: { rich_text: richTexto(revision.detalle?.motivo) },
    "Utilidad 1–5": { number: revision.detalle?.utilidad ?? null },
    "Fecha y hora": { date: { start: new Date().toISOString() } },
  });
  const persona = peopleDe(revision.persona);
  if (persona) propiedades.Persona = persona;
  if (fichaPageId) propiedades.Ficha = { relation: [{ id: fichaPageId }] };
  const creada = await consultarNotion(() =>
    notion.pages.create({ parent: { database_id: db }, properties: propiedades })
  );
  return creada.id;
}

// Sync tolerante a fallos: la demo continúa aunque Notion no esté disponible.
export async function syncSeguro(ficha, revision) {
  try {
    const fichaPageId = await syncFicha(ficha);
    if (revision) await syncRevision(revision, { fichaPageId });
  } catch (e) {
    log.warn("Sync a Notion omitido (la demo no depende de Notion):", e.message);
  }
}
