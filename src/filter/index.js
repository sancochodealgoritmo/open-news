// v1.4 · S3F Filtro de desinformación (requisito del núcleo).
// Enruta cada evento: pasa · con advertencias · retenido para verificación.
// Nunca dictamina verdadero/falso. La liberación es exclusiva del humano (V11).
import { config } from "../config.js";
import { nivelAtencion } from "../signals/credibility.js";

// Regla 6.4 (determinística, versionada con RIUNE).
export function enrutar(senales = []) {
  const prioritarias = senales.filter((s) => s.nivel === "prioritaria");
  const revisar = senales.filter((s) => s.nivel === "revisar");
  if (prioritarias.length > 0 || revisar.length >= config.filtro.umbralSenalesRevisar) return "retenido";
  if (revisar.length > 0) return "con_advertencias";
  return "pasa";
}

// Aplica el filtro a un evento y produce su campo de filtro (6.5).
export function aplicarFiltro(evento, { senales = [] } = {}) {
  const ruta = enrutar(senales);
  return {
    ruta_fd: ruta,
    nivel_atencion: nivelAtencion(senales),
    senales,
    verificaciones_pendientes: senales.map((s) => ({
      accion: s.verificacion || "verificar",
      tipo_fuente: s.tipo_fuente || "documento público",
    })),
    liberacion: null,
  };
}

// Liberación humana (6.4): liberar con motivo o descartar con motivo.
export function aplicarLiberacion(filtro, { accion, motivo, persona }) {
  if (!["liberar", "descartar"].includes(accion)) throw new Error("acción inválida: liberar | descartar");
  if (!motivo) throw new Error("motivo obligatorio");
  if (!filtro || filtro.ruta_fd !== "retenido") throw new Error("solo se libera o descarta un evento retenido");
  return {
    ...filtro,
    ruta_fd: accion === "liberar" ? "con_advertencias" : filtro.ruta_fd,
    liberacion: { por: persona, motivo, accion, fecha_utc: new Date().toISOString() },
  };
}

// V11 · ¿Se permite el entregable completo?
export function puedeProducir(filtro) {
  if (!filtro || filtro.ruta_fd !== "retenido") return true;
  return Boolean(filtro.liberacion && filtro.liberacion.accion === "liberar");
}

// ¿Está pendiente en la bandeja de verificación?
export function estaEnVerificacion(filtro) {
  return filtro?.ruta_fd === "retenido" && !(filtro.liberacion?.accion === "descartar");
}
