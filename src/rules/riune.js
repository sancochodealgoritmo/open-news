// M09-M10 · Motor de priorización RIUNE + estado de evidencia (código, reglas versionadas).
// P = 30R + 25I + 20U + 15N + 10E (0-100, un decimal). La fecha de corte se INYECTA
// (nunca el reloj del sistema; ARQ-04). El puntaje es por EVENTO, no por nota.
import { config } from "../config.js";
import { horasEntre } from "../utils/normalize.js";

// Geo → G (componente R). Panamá explícito 1.0 · regional 0.5 · ninguna 0.
function geoAPeso(geo) {
  return config.geo[geo] ?? config.geo.ninguna;
}

// Rúbrica de impacto I: nivel 0-4 propuesto por IA con citas; el código acota.
// Sin cita válida → máximo 2/4; nivel 4 sin dato oficial citado → 3.
export function normalizarImpacto(impacto) {
  let nivel = Math.max(0, Math.min(4, Number(impacto?.nivel) || 0));
  const citado = !!impacto?.citado;
  const datoOficial = !!impacto?.datoOficialCitado;
  if (!citado) nivel = Math.min(nivel, 2);
  else if (nivel === 4 && !datoOficial) nivel = 3;
  return { nivel, normalizado: nivel / 4 };
}

// R = 0.5·G + 0.5·T  (T = peso del tema principal en la modalidad).
export function calcularRelevancia({ tema, geo }, modalidad) {
  const G = geoAPeso(geo);
  const T = config.modalidades[modalidad]?.pesosTema?.[tema] ?? 0;
  return 0.5 * G + 0.5 * T;
}

// U = máx(0.5^(Δh/h½), U_agenda). Si no hay fecha_publicacion se usa fecha_deteccion
// y se limita U ≤ 0.5 (marcando "fecha original desconocida").
export function calcularUrgencia(evento, fechaCorte, modalidad) {
  const hMedia = config.modalidades[modalidad]?.hMediaHoras ?? 72;
  const deltaH = horasEntre(fechaCorte, evento.fecha_original);
  if (deltaH === null) return 0;
  const decaimiento = Math.pow(0.5, Math.max(0, deltaH) / hMedia);
  const uAgenda = evento.hito_proximo_7dias ? 0.8 : 0;
  let u = Math.max(decaimiento, uAgenda);
  if (!evento.fecha_conocida) u = Math.min(u, 0.5);
  return Math.max(0, Math.min(1, u));
}

// N = 1 - s_máx; recirculación de un evento previo (SC-01) → N = 0.
export function calcularNovedad({ similitud_previa, es_recirculacion }) {
  if (es_recirculacion) return 0;
  return Math.max(0, Math.min(1, 1 - (similitud_previa ?? 0)));
}

// E = 0.4·mín(proc/3,1) + 0.3·vínculo oficial + 0.2·fuente primaria + 0.1·texto.
export function calcularEvidencia({ n_procedencias, vinculo_oficial, fuente_primaria, texto_disponible }) {
  const proc = Math.min((n_procedencias || 0) / 3, 1);
  return 0.4 * proc + 0.3 * (vinculo_oficial ? 1 : 0) + 0.2 * (fuente_primaria ? 1 : 0) + 0.1 * (texto_disponible ? 1 : 0);
}

export function bandaDe(puntaje) {
  if (puntaje < config.bands.medio.min) return "bajo";
  if (puntaje < config.bands.alto.min) return "medio";
  return "alto";
}

// Puntaje completo por evento. impacto = { nivel, citado, datoOficialCitado }.
export function calcularPuntaje(evento, { fechaCorte, modalidad }) {
  const R = calcularRelevancia(evento, modalidad);
  const I = normalizarImpacto(evento.impacto).normalizado;
  const U = calcularUrgencia(evento, fechaCorte, modalidad);
  const N = calcularNovedad(evento);
  const E = calcularEvidencia(evento);

  const w = config.weights;
  const P = Math.round((w.R * R + w.I * I + w.U * U + w.N * N + w.E * E) * 10) / 10;

  return {
    componentes: { R: Math.round(R * 1000) / 1000, I: Math.round(I * 1000) / 1000, U: Math.round(U * 1000) / 1000, N: Math.round(N * 1000) / 1000, E: Math.round(E * 1000) / 1000 },
    puntaje: P,
    banda: bandaDe(P),
    version: config.rulesVersion,
    impacto_nivel: normalizarImpacto(evento.impacto).nivel,
  };
}

// Desempate para la bandeja: mayor U, luego ID ascendente (P2).
export function compararBandeja(a, b) {
  if (b.puntaje !== a.puntaje) return b.puntaje - a.puntaje;
  if (b.componentes.U !== a.componentes.U) return b.componentes.U - a.componentes.U;
  return String(a.id_evento).localeCompare(String(b.id_evento));
}

// M10 · Estado de evidencia — independiente del puntaje (5.4).
// Entradas: afirmaciones (factuales), contradiccion_abierta, procedencias,
// fuente_oficial_primaria, texto_disponible, alcance_texto.
export function estadoEvidencia({
  afirmaciones = [],
  contradiccion_abierta = false,
  n_procedencias = 0,
  fuente_oficial_primaria = false,
  texto_disponible = false,
  alcance_texto = "titular/metadatos",
  ruta = "pasa",
} = {}) {
  const factuales = afirmaciones.filter((a) => a.tipo === "hecho" || a.tipo === "declaracion");
  const todasCitadas = factuales.length === 0 || factuales.every((a) => a.cita_valida);
  const centralSustentada = n_procedencias >= 2 || fuente_oficial_primaria;
  const d = texto_disponible || fuente_oficial_primaria;

  const suficiente = todasCitadas && centralSustentada && !contradiccion_abierta && d;
  if (suficiente && ruta !== "retenido") {
    return { estado: "suficiente", motivo: "afirmaciones citadas, afirmación central sustentada y sin contradicción abierta" };
  }
  if (suficiente && ruta === "retenido") {
    return { estado: "parcial", motivo: "evento retenido por el filtro: estado máximo parcial" };
  }

  const sinProcedenciaCitable = n_procedencias === 0;
  const soloMetadatosSinRespaldo = n_procedencias === 1 && alcance_texto === "titular/metadatos" && !fuente_oficial_primaria;
  const centralSinEvidencia = factuales.length > 0 && factuales.every((a) => !a.cita_valida);

  if (sinProcedenciaCitable || soloMetadatosSinRespaldo || centralSinEvidencia) {
    return { estado: "insuficiente", motivo: "sin procedencia citable o afirmación central sin evidencia" };
  }

  return { estado: "parcial", motivo: "alguna cita válida pero falla un criterio de suficiencia" };
}
