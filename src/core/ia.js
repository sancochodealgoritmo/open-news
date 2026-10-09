// M03-M07 + M11 · Enriquecimiento IA del núcleo: organiza (P01), extrae
// afirmaciones (P02), contextualiza (P03), asesora credibilidad (P04), evalúa
// impacto (P05) y redacta el resumen de ficha (P06). Cada paso es resiliente:
// si el modelo no está disponible (offline), el evento conserva el baseline.
import { generarEstructurado } from "../llm/schema.js";
import { mensajes, esquemaSalida, buildEvidencias } from "../prompts/index.js";
import { construirEvidenciasDeEvento } from "../products/index.js";
import { clasificarTema } from "./themes.js";
import {
  senalCifraConflicto,
  senalNoHalladoEnOficial,
  senalRevisionExterna,
} from "../signals/credibility.js";
import { aplicarFiltro } from "../filter/index.js";
import { FUENTES_CORROBORACION } from "../filter/confiabilidad.js";
import { idBancoMundial } from "../utils/ids.js";

async function paso(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// Alias cortos para detectar menciones institucionales en el titular (SC-09).
const ALIAS_INSTITUCION = {
  ACP: "Autoridad del Canal de Panamá (ACP)",
  MEF: "Ministerio de Economía y Finanzas (MEF)",
  SINAPROC: "Sistema Nacional de Protección Civil (SINAPROC)",
  MINSA: "Ministerio de Salud (MINSA)",
  ASEP: "Autoridad Nacional de los Servicios Públicos (ASEP)",
  ATP: "Autoridad de Turismo de Panamá (ATP)",
  AMP: "Autoridad Marítima de Panamá (AMP)",
  INEC: "INEC (Contraloría)",
  Contraloría: "Contraloría General de la República",
};

// Tema → indicador del Banco Mundial para contrastar cifras (SC-03).
const TEMA_INDICADOR = {
  economia: "FP.CPI.TOTL.ZG", // inflación
};

function indicadorParaTema(tema, indicadores) {
  const id = TEMA_INDICADOR[tema];
  if (!id) return null;
  const fila = indicadores.find((i) => i.pais_iso3 === "PAN" && i.indicador_id === id);
  return fila?.valor ?? null;
}

function contextoOficialParaTema(tema, indicadores) {
  const id = TEMA_INDICADOR[tema];
  if (!id) return null;
  const fila = indicadores.find((i) => i.pais_iso3 === "PAN" && i.indicador_id === id);
  if (!fila) return null;
  return {
    indicador_id: fila.indicador_id,
    pais: fila.pais_iso3,
    anio: fila.anio,
    valor: fila.valor,
    unidad: fila.unidad,
    ref: idBancoMundial(fila.pais_iso3, fila.indicador_id, fila.anio),
  };
}

// Señales de contraste oficial (paso 2 del filtro): SC-03, SC-09, SC-10.
function contrastarOficial(evento, afirmaciones, ctx) {
  const titulo = (evento.titulos || []).join(" ");
  const oficiales = ctx.oficiales || [];
  const senales = [];

  // SC-09: institución mencionada sin comunicado en las familias E/F/G.
  for (const [alias, nombre] of Object.entries(ALIAS_INSTITUCION)) {
    if (!titulo.toLowerCase().includes(alias.toLowerCase())) continue;
    const encontrada = oficiales.some((o) => o.institucion === nombre);
    const central = afirmaciones.some((a) => a.es_central);
    const s = senalNoHalladoEnOficial({ institucionMencionada: nombre, encontrada, esCentral: central });
    if (s) senales.push(s);
  }

  // SC-03: cifra de la afirmación central vs indicador oficial del tema.
  const central = afirmaciones.find((a) => a.es_central);
  const oficial = indicadorParaTema(evento.tema, ctx.indicadores || []);
  if (central && central.cifra !== null && oficial !== null) {
    const s = senalCifraConflicto(central.cifra, oficial, { esCentral: true });
    if (s) senales.push(s);
  }

  // SC-10: revisión externa publicada (familia I).
  const revision = oficiales.find((o) => o.familia === "I");
  if (revision) {
    senales.push(senalRevisionExterna({ verificador: revision.institucion, enlace: revision.url, contradiceCentral: false }));
  }

  return senales;
}

// Enriquecimiento completo de un evento (P01-P05 + contraste + filtro S3F).
export async function enriquecerEventoConIA(evento, ctx = {}) {
  const evidencias = construirEvidenciasDeEvento(evento);
  const titulo = (evento.titulos || []).join(" ");
  const baseSeñales = evento.filtro?.senales || [];

  // P01 · Organizador (tema, geo, procedencia).
  const p01 = await paso(() =>
    generarEstructurado(mensajes("P01", { registro: { titulo, url: evento.miembros?.[0]?.url } }, "principal"), esquemaSalida("P01"), {
      versionPrompt: "P01-v0.1",
      hashEntrada: `P01:${titulo}`,
    })
  );

  const tema = p01?.tema_principal || clasificarTema(titulo);
  const geo = p01?.geo_panama === "explicita" ? "panama" : p01?.geo_panama === "regional" ? "regional" : "ninguna";

  // P02 · Afirmaciones verificables.
  const p02 = await paso(() =>
    generarEstructurado(mensajes("P02", { evidencias }, "principal"), esquemaSalida("P02"), {
      versionPrompt: "P02-v0.1",
      hashEntrada: `P02:${evento.id_evento}`,
    })
  );
  const afirmaciones = (p02?.afirmaciones || []).map((a, i) => ({
    tipo: a.tipo,
    texto: a.texto,
    cifra: a.cifra ?? null,
    unidad: a.unidad ?? null,
    periodo: a.periodo ?? null,
    pasaje: a.pasaje ?? "",
    citas: (a.citas || []).length > 0 ? a.citas : [evidencias[0]?.id].filter(Boolean),
    cita_valida: (a.citas || []).length > 0 || Boolean(evidencias[0]?.id),
    es_central: Boolean(a.afirmacion_central) || i === 0,
  }));

  // Contexto oficial: el código copia la cifra; la IA solo propone (M07).
  const contexto = contextoOficialParaTema(tema, ctx.indicadores || []);

  // P03 · Contextualizador (contradicciones).
  const p03 = await paso(() =>
    generarEstructurado(mensajes("P03", { afirmaciones, indicadores: ctx.indicadores || [] }, "principal"), esquemaSalida("P03"), {
      versionPrompt: "P03-v0.1",
      hashEntrada: `P03:${evento.id_evento}`,
    })
  );
  const contradiccionAbierta = (p03?.vinculos || []).some((v) => v.relacion === "contrasta");

  // P04 · Asesor de credibilidad (SC-04/05/07, IA con razón y cita).
  const p04 = await paso(() =>
    generarEstructurado(mensajes("P04", { afirmaciones }, "principal"), esquemaSalida("P04"), {
      versionPrompt: "P04-v0.1",
      hashEntrada: `P04:${evento.id_evento}`,
    })
  );
  const senalesIA = (p04?.senales || []).map((s) => ({ ...s, origen: "ia" }));

  // P05 · Impacto (componente I de RIUNE).
  const p05 = await paso(() =>
    generarEstructurado(mensajes("P05", { evento: { id_evento: evento.id_evento, tema, geo, afirmaciones }, evidencias }, "principal"), esquemaSalida("P05"), {
      versionPrompt: "P05-v0.1",
      hashEntrada: `P05:${evento.id_evento}`,
    })
  );
  const impacto = {
    nivel: p05?.nivel ?? 0,
    citado: (p05?.citas || []).length > 0,
    datoOficialCitado: Boolean(contexto),
  };

  const senalesContraste = contrastarOficial(evento, afirmaciones, ctx);
  const senales = [...baseSeñales, ...senalesIA, ...senalesContraste];
  const filtro = aplicarFiltro(evento, { senales });

  return {
    ...evento,
    tema,
    geo,
    afirmaciones,
    contexto_oficial: contexto ? [contexto] : [],
    vinculo_oficial: Boolean(contexto),
    contradiccion_abierta: contradiccionAbierta,
    impacto,
    filtro,
  };
}

// M11 · Resumen neutral de la ficha (P06).
export async function redactarResumenFicha(ficha, evento) {
  const res = await paso(() =>
    generarEstructurado(mensajes("P06", { evento: { id_caso: ficha.id_caso, tema: ficha.tema, puntaje: ficha.puntaje, banda: ficha.banda, estado_evidencia: ficha.estado_evidencia, ruta_fd: ficha.ruta_fd, senales: ficha.senales } }, ficha.modalidad), esquemaSalida("P06"), {
      versionPrompt: "P06-v0.1",
      hashEntrada: `P06:${ficha.id_caso}`,
    })
  );
  return res || { resumen: "", vacios: [], accion_recomendada: "" };
}

export { FUENTES_CORROBORACION };
