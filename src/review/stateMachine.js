// M15 · Revisión humana: máquina de 5 estados + registro de solo anexar (SEG-01, ARQ-10).
// El sistema solo crea "nuevo" o, automáticamente, "requiere_evidencia".
// "aprobado_borrador" y "descartado" solo por humano. Aprobar ≠ publicar.
import { config } from "../config.js";
import { anexar, leerLineas } from "../store/index.js";

const E = config.revisionEstados;

// Transiciones permitidas (desde → hacia) con quién y condición.
const TRANSICIONES = {
  "": { nuevo: { quien: "sistema" }, requiere_evidencia: { quien: "sistema" } },
  nuevo: { en_revision: { quien: "persona" }, requiere_evidencia: { quien: "sistema" } },
  en_revision: {
    requiere_evidencia: { quien: "persona" },
    aprobado_borrador: { quien: "persona" },
    descartado: { quien: "persona" },
  },
  requiere_evidencia: { en_revision: { quien: "persona" } },
  aprobado_borrador: {},
  descartado: {},
};

export function puedeTransicionar(desde, hacia) {
  return Boolean(TRANSICIONES[desde || ""]?.[hacia]);
}

export function quienTransicion(desde, hacia) {
  return TRANSICIONES[desde || ""]?.[hacia]?.quien || null;
}

// Valida y registra una transición. Devuelve { ok, error?, revision? }.
export function aplicarTransicion({ id_caso, desde, hacia, persona, detalle = {}, forzarSistema = false }) {
  if (!puedeTransicionar(desde, hacia)) {
    return { ok: false, error: `transición inválida: ${desde || "(inicio)"} → ${hacia}` };
  }
  const quien = quienTransicion(desde, hacia);

  // Guardas de seguridad: aprobar/descartar solo por humano (V09).
  if ((hacia === "aprobado_borrador" || hacia === "descartado") && !persona && !forzarSistema) {
    return { ok: false, error: `solo una persona puede asignar ${hacia}` };
  }
  // Aprobar exige evidencia ≠ insuficiente.
  if (hacia === "aprobado_borrador" && detalle.estado_evidencia === "insuficiente") {
    return { ok: false, error: "no se puede aprobar con evidencia insuficiente" };
  }
  // Descartar exige motivo obligatorio.
  if (hacia === "descartado" && !detalle.motivo) {
    return { ok: false, error: "descartar exige un motivo obligatorio" };
  }

  const revision = {
    id_caso,
    desde: desde || null,
    hacia,
    quien,
    persona: persona || null,
    fecha: new Date().toISOString(),
    detalle,
  };

  // Solo anexar: se persiste al escribir (el caller decide cuándo guardar).
  return { ok: true, revision };
}

export async function guardarRevision(revision) {
  await anexar("revisiones.jsonl", revision);
  return revision;
}

export async function historialRevisiones(idCaso) {
  const lineas = await leerLineas("revisiones.jsonl");
  return lineas.filter((r) => r.id_caso === idCaso);
}
