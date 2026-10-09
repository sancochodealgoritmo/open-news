// Capa de producto (S5-S7): ficha + consulta + producción + validación.
// Un núcleo de evidencias, tres capas de salida. El redactor (P08) propone; el
// validador (V01-V10) decide; si falla dos veces → "requiere evidencia".
import { config } from "../config.js";
import { generarEstructurado } from "../llm/schema.js";
import { mensajes, esquemaSalida, buildEvidencias } from "../prompts/index.js";
import { validarBorrador } from "./validators.js";
import { recuperarHibrido } from "../search/hybrid.js";
import { estadoEvidencia } from "../rules/riune.js";

export const PRODUCTOS = {
  principal: {
    nombre: "Mesa Editorial",
    limites: config.limites,
    lexicoExtra: [],
  },
  digital: {
    nombre: "Mesa Digital",
    limites: config.limites,
    lexicoExtra: [],
  },
  banca: {
    nombre: "Radar de Entorno",
    limites: config.limites,
    lexicoExtra: config.lexicoBanca,
  },
};

export function esModalidad(m) {
  return Object.hasOwn(PRODUCTOS, m);
}

// Paquete de evidencias con IDs para un evento (entrada exclusiva del redactor).
export function construirEvidenciasDeEvento(evento) {
  const evidencias = [];
  (evento.miembros || []).forEach((m, i) => {
    const id = `E${i + 1}`;
    evidencias.push({
      id,
      ref: `NOT:${m.id_estable || m.id_noticia}:titulo`,
      pasaje: m.titulo || "",
      texto: m.descripcion || "",
      alcance: m.alcance_texto || "completo",
    });
  });
  (evento.contexto_oficial || []).forEach((c, j) => {
    evidencias.push({
      id: `E${(evento.miembros || []).length + j + 1}`,
      ref: c.ref,
      pasaje: `${c.indicador_id || c.indicador || c.dato_oficial_id} ${c.pais || ""} ${c.anio || ""}: ${c.valor ?? ""} ${c.unidad || ""}`,
      texto: "",
      alcance: "dato_oficial",
    });
  });
  return evidencias;
}

// Ficha estructurada (código) + resumen neutral (P06 opcional).
export function construirFicha(evento, { modalidad, puntaje, senales = [], estado, filtro = null }) {
  const todasCitas = construirEvidenciasDeEvento(evento);
  const correspondeAviso = todasCitas.length > 0 && todasCitas.every((e) => e.alcance === "titular/metadatos");
  return {
    id_caso: evento.id_evento,
    modalidad,
    tema: evento.tema,
    ids_fuente: (evento.miembros || []).map((m) => m.id_estable || m.id_noticia),
    procedencias: evento.n_procedencias,
    fecha_original: evento.fecha_original,
    afirmaciones: evento.afirmaciones || [],
    citas: todasCitas,
    puntaje: puntaje.puntaje,
    componentes: puntaje.componentes,
    banda: puntaje.banda,
    version_reglas: puntaje.version,
    estado_evidencia: estado.estado,
    senales: senales.map((s) => s.codigo),
    alcance_texto: correspondeAviso ? "titular/metadatos" : "completo",
    corresponde_aviso: correspondeAviso,
    // v1.4 · Campo de filtro S3F (6.5).
    ruta_fd: filtro?.ruta_fd || "pasa",
    nivel_atencion: filtro?.nivel_atencion || "sin_senales",
    senales_detalle: filtro?.senales || [],
    verificaciones_pendientes: filtro?.verificaciones_pendientes || [],
    liberacion: filtro?.liberacion || null,
  };
}

// Produce el borrador (P08) y lo valida (V01-V10). Regenera 1 vez; si falla 2 veces
// lanza { requiereEvidencia: true } (el caso pasa a "requiere evidencia").
export async function producirBorrador({ ficha, evidencias, modalidad, filtro = null }) {
  const producto = PRODUCTOS[modalidad];
  const ctx = { ficha, evidencias };
  const schema = esquemaSalida("P08");

  // El código decide los límites (V05): recorta título, enfoque, copy y fija las
  // 3 preguntas exactas, sin depender de que el modelo cuente palabras.
  const normalizarBorrador = (borrador) => {
    const b = { ...borrador };
    const recortar = (t, max) => String(t ?? "").trim().split(/\s+/).filter(Boolean).slice(0, max).join(" ");
    b.titulo_propuesto = recortar(b.titulo_propuesto, 12);
    b.enfoque = recortar(b.enfoque, 40);
    if (b.copy) b.copy = recortar(b.copy, producto.limites.copyPalabras);
    b.preguntas = Array.isArray(b.preguntas) ? b.preguntas.slice(0, producto.limites.preguntas) : [];
    while (b.preguntas.length < producto.limites.preguntas) b.preguntas.push("¿Qué falta verificar?");
    // V06 · El código decide el aviso de alcance (no el modelo).
    b.aviso_alcance = Boolean(ficha.corresponde_aviso);
    // V03 · El código copia el pasaje literal de la primera cita de cada hecho.
    const mapa = new Map(evidencias.map((e) => [e.id, e]));
    b.hechos = (b.hechos || []).map((h) => {
      const cita = h?.citas?.[0];
      const ev = cita ? mapa.get(cita) : null;
      return ev ? { ...h, pasaje: ev.pasaje || "" } : h;
    });
    return b;
  };

  const intentar = () =>
    generarEstructurado(mensajes("P08", ctx, modalidad), schema, {
      versionPrompt: `P08-${modalidad}-v0.1`,
      hashEntrada: JSON.stringify({ ficha: ficha.id_caso, modalidad }),
    });

  let borrador = normalizarBorrador(await intentar());
  let resultado = validarBorrador(borrador, {
    evidencias,
    limites: producto.limites,
    lexicoExtra: producto.lexicoExtra,
    correspondeAviso: ficha.corresponde_aviso,
    modalidad,
    filtro,
  });

  if (!resultado.paso) {
    borrador = { ...borrador, errores_señalados: resultado.errores };
    borrador = normalizarBorrador(await intentar());
    resultado = validarBorrador(borrador, {
      evidencias,
      limites: producto.limites,
      lexicoExtra: producto.lexicoExtra,
      correspondeAviso: ficha.corresponde_aviso,
      modalidad,
      filtro,
    });
  }

  if (!resultado.paso) {
    throw Object.assign(new Error(`Validador falló 2 veces: ${resultado.errores.join("; ")}`), { requiereEvidencia: true, errores: resultado.errores });
  }

  // M14 · Verificador crítico (P09) como segunda línea; no reemplaza a la persona.
  let verificacion = null;
  try {
    verificacion = await generarEstructurado(
      mensajes("P09", { borrador, evidencias }, modalidad),
      esquemaSalida("P09"),
      { versionPrompt: `P09-${modalidad}-v0.1`, hashEntrada: JSON.stringify(borrador) }
    );
  } catch {
    verificacion = null;
  }

  return { borrador, validacion: resultado, verificacion };
}

// S5 · Consulta en español con abstención (M12 + P07a + P07b).
export async function consultar(consulta, corpus, { modalidad = "principal", evidenciasDe = () => [] } = {}) {
  const ruta = await generarEstructurado(mensajes("P07a", { consulta }, modalidad), esquemaSalida("P07a"), {
    versionPrompt: `P07a-${modalidad}-v0.1`,
    hashEntrada: consulta,
  });

  if (ruta.intencion === "agenda") {
    return { intencion: "agenda", mensaje: "La bandeja se calcula por código (RIUNE); no se recalcula con el LLM." };
  }

  const recuperados = await recuperarHibrido(consulta, corpus, { campos: ["titulo"] });
  const relevantes = recuperados.slice(0, 5).map(evidenciasDe).flat();

  if (relevantes.length === 0) {
    return {
      intencion: ruta.intencion,
      abstencion: true,
      respuesta: null,
      informacion_necesaria: ["más registros en el corpus o una fuente primaria para esta consulta"],
    };
  }

  const resp = await generarEstructurado(
    mensajes("P07b", { consulta, evidencias: relevantes }, modalidad),
    esquemaSalida("P07b"),
    { versionPrompt: `P07b-${modalidad}-v0.1`, hashEntrada: consulta }
  );
  return { intencion: ruta.intencion, ...resp, evidencias: relevantes };
}

export { estadoEvidencia };
