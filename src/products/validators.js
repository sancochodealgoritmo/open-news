// M14 · Validador determinístico V01-V10. Ningún borrador llega a revisión con
// citas o cifras sin sustento. Si falla: regenerar 1 vez; si vuelve a fallar:
// estado "requiere evidencia" (SEG-02, ARQ-09).
import { config } from "../config.js";
import { extraerIdsCitados } from "../utils/ids.js";

// Normaliza un número para comparación textual (1.5 / 1,5 / 12%).
function normalizarNumeroTexto(s) {
  return String(s ?? "").replace(/\s/g, "").replace(/,/g, ".").replace(/\.$/, "");
}

function cifrasEn(texto) {
  const s = String(texto ?? "");
  const re = /-?\d+(?:[.,]\d+)?%?/g;
  return (s.match(re) || []).map(normalizarNumeroTexto);
}

function normalizarEspacios(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Verifica que cada [E#] citado exista en el paquete de evidencias (V02).
function citasValidas(citas, mapaEvidencias) {
  const faltantes = [];
  for (const c of citas || []) {
    if (!mapaEvidencias.has(c)) faltantes.push(c);
  }
  return { ok: faltantes.length === 0, faltantes };
}

export function validarBorrador(borrador, { evidencias = [], limites = config.limites, lexicoExtra = [], correspondeAviso = false, modalidad = "principal", filtro = null } = {}) {
  const errores = [];
  const mapa = new Map(evidencias.map((e) => [e.id, e]));

  // V01 · Esquema: campos y tipos básicos.
  if (!borrador || typeof borrador !== "object") return { paso: false, errores: ["V01: salida no es objeto JSON"] };
  if (!Array.isArray(borrador.hechos)) errores.push("V01: falta hechos[]");

  // V02 · Toda afirmación de tipo hecho/declaración tiene ≥1 cita y el ID existe.
  for (const h of borrador.hechos || []) {
    if (h.tipo === "hecho" || h.tipo === "declaracion") {
      if (!h.citas || h.citas.length === 0) {
        errores.push(`V02: afirmación sin cita: ${String(h.texto).slice(0, 60)}`);
        continue;
      }
      const { ok, faltantes } = citasValidas(h.citas, mapa);
      if (!ok) errores.push(`V02: citas inexistentes ${faltantes.join(", ")}`);
    }
  }

  // V03 · El pasaje citado existe literalmente en al menos una de las evidencias
  // citadas (una afirmación puede apoyarse en varias evidencias con textos distintos).
  for (const h of borrador.hechos || []) {
    if (!h.pasaje || !h.citas || h.citas.length === 0) continue;
    const pasajeNorm = normalizarEspacios(h.pasaje);
    const hallado = h.citas.some((c) => {
      const ev = mapa.get(c);
      if (!ev) return false;
      const textoEv = normalizarEspacios((ev.pasaje || "") + " " + (ev.texto || ""));
      return textoEv.includes(pasajeNorm);
    });
    if (!hallado) errores.push("V03: pasaje no hallado literalmente en las evidencias citadas");
  }

  // V04 · Cada cifra del texto aparece en la evidencia citada.
  for (const h of borrador.hechos || []) {
    const cifras = cifrasEn(h.texto);
    if (cifras.length === 0) continue;
    const textosCitados = (h.citas || []).map((c) => mapa.get(c)).filter(Boolean).map((ev) => normalizarNumeroTexto((ev.pasaje || "") + " " + (ev.texto || ""))).join(" ");
    for (const cifra of cifras) {
      if (!textosCitados.includes(cifra)) errores.push(`V04: cifra ${cifra} no aparece en la evidencia citada`);
    }
  }

  // V05 · Límites por modalidad.
  const contarPalabras = (t) => String(t ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (borrador.titulo_propuesto && contarPalabras(borrador.titulo_propuesto) > 12) errores.push("V05: título propuesto > 12 palabras");
  if (borrador.enfoque && contarPalabras(borrador.enfoque) > 40) errores.push("V05: enfoque demasiado largo");
  if (borrador.copy && contarPalabras(borrador.copy) > limites.copyPalabras) errores.push(`V05: copy > ${limites.copyPalabras} palabras`);
  if (borrador.guion) {
    const p = contarPalabras(borrador.guion.map((g) => g.texto).join(" "));
    if (p < limites.guionPalabrasMin || p > limites.guionPalabrasMax) errores.push(`V05: guion ${p} palabras (fuera de ${limites.guionPalabrasMin}-${limites.guionPalabrasMax})`);
  }
  if (Array.isArray(borrador.preguntas) && borrador.preguntas.length !== limites.preguntas) errores.push(`V05: debe haber ${limites.preguntas} preguntas exactas`);

  // V06 · Aviso "Basado únicamente en titular/metadatos" presente si y solo si corresponde.
  const aviso = config.avisoTitularMetadatos;
  const textoCompleto = JSON.stringify(borrador);
  const tieneAviso = textoCompleto.includes(aviso) || borrador.aviso_alcance === true;
  if (correspondeAviso && !tieneAviso) errores.push("V06: falta el aviso literal de titular/metadatos");
  if (!correspondeAviso && borrador.aviso_alcance === true) errores.push("V06: aviso de titular/metadatos sin corresponder");

  // V07 · Léxico prohibido.
  const prohibidos = [...config.lexicoProhibido, ...lexicoExtra];
  for (const t of prohibidos) {
    if (textoCompleto.toLowerCase().includes(t.toLowerCase())) errores.push(`V07: léxico prohibido "${t}"`);
  }

  // V08 · "hoy/actualmente/este año" junto a un dato anual histórico.
  if (/hoy|actualmente|este año/i.test(textoCompleto) && borrador.contexto_oficial) {
    errores.push("V08: dato anual histórico presentado como actual");
  }

  // V09 · El sistema no puede asignar aprobado/descartado (se valida en la máquina de estados).
  if (["aprobado_borrador", "descartado"].includes(borrador.estado_revision)) {
    errores.push("V09: el sistema no puede asignar aprobado/descartado");
  }

  // V10 · Sin secretos ni tokens en la salida.
  if (/sk-[A-Za-z0-9]{8,}|secret_[A-Za-z0-9]{8,}|ntn_[A-Za-z0-9]{8,}/.test(textoCompleto)) {
    errores.push("V10: posible secreto o token en la salida");
  }

  // V11 · Sin entregable completo para un evento retenido sin liberación humana.
  const retenidoSinLiberar = filtro?.ruta_fd === "retenido" && !(filtro?.liberacion?.accion === "liberar");
  const esEntregableCompleto = Boolean(borrador.guion || borrador.copy || borrador.titulares);
  if (retenidoSinLiberar && esEntregableCompleto) {
    errores.push("V11: entregable completo bloqueado para evento retenido sin liberación");
  }

  return { paso: errores.length === 0, errores };
}
