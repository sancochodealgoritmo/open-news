// v1.4 · Señales de credibilidad SC-01..SC-10 (S3F).
// Cada señal lleva nivel ("revisar" | "prioritaria") y origen ("codigo" | "ia").
// Prohibido etiquetar verdadero/falso/fake/bulo. El enrutado vive en src/filter/.
import { config } from "../config.js";
import { horasEntre } from "../utils/normalize.js";

// SC-01 · Recirculación (código).
export function senalRecirculacion(evento, umbralDias = 7) {
  if (!evento.fecha_publicacion || !evento.fecha_deteccion) return null;
  const deltaH = horasEntre(evento.fecha_deteccion, evento.fecha_publicacion);
  if (deltaH !== null && deltaH > umbralDias * 24) {
    return {
      codigo: "SC-01",
      senal: "Recirculación",
      origen: "codigo",
      nivel: "revisar",
      razon: "fecha_publicacion antigua frente a fecha_deteccion reciente",
      verificacion: "confirmar vigencia",
    };
  }
  return null;
}

// SC-02 · Procedencia única replicada (código).
export function senalProcedenciaUnica(evento) {
  if (evento.n_notas > 1 && evento.n_procedencias === 1) {
    return {
      codigo: "SC-02",
      senal: "Procedencia única replicada",
      origen: "codigo",
      nivel: "revisar",
      razon: "repetición ≠ corroboración",
      verificacion: "buscar una segunda procedencia independiente",
    };
  }
  return null;
}

// SC-03 · Cifra en conflicto con dato oficial (IA extrae, código compara).
export function senalCifraConflicto(cifra, oficial, { esCentral = false, tolerancia = 0.02 } = {}) {
  if (cifra === null || oficial === null || oficial === undefined) return null;
  const diff = Math.abs(cifra - oficial);
  const rel = Math.abs(oficial) > 0 ? diff / Math.abs(oficial) : diff;
  if (rel > tolerancia) {
    return {
      codigo: "SC-03",
      senal: "Cifra en conflicto con dato oficial",
      origen: "codigo",
      nivel: esCentral ? "prioritaria" : "revisar",
      razon: `cifra extraída ${cifra} vs dato oficial ${oficial}`,
      verificacion: "mostrar ambas versiones con cita",
    };
  }
  return null;
}

// SC-06 · Fuera de catálogo (código).
export function senalFueraDeCatalogo(evento, dominiosCatalogados = []) {
  if (evento.dominio && dominiosCatalogados.length > 0 && !dominiosCatalogados.includes(evento.dominio)) {
    return {
      codigo: "SC-06",
      senal: "Fuera de catálogo",
      origen: "codigo",
      nivel: "revisar",
      razon: `dominio ${evento.dominio} no listado en fuentes.json`,
      verificacion: "confirmar procedencia",
    };
  }
  return null;
}

// SC-08 · Instrucciones incrustadas (código + P00).
const PATRONES_INYECCION = [
  /ignora\s+(tus|las)\s+(reglas|instrucciones)/i,
  /revela\s+(tu|la)\s+(clave|contraseña|token|api)/i,
  /act[uú]a\s+como\s+si/i,
  /asigna\s+(una\s+)?prioridad\s+100/i,
  /no\s+sigas\s+las\s+instrucciones/i,
];

export function detectarInstruccionesIncrustadas(texto) {
  const s = String(texto ?? "");
  for (const re of PATRONES_INYECCION) {
    if (re.test(s)) {
      return {
        codigo: "SC-08",
        senal: "Instrucciones incrustadas",
        origen: "codigo",
        nivel: "prioritaria",
        razon: "contenido no confiable; se registra y nunca se ejecuta",
        verificacion: "la fuente es dato, nunca instrucción",
      };
    }
  }
  return null;
}

// SC-09 · Hecho atribuido a una institución sin hallarse en sus fuentes oficiales (código).
export function senalNoHalladoEnOficial({ institucionMencionada, encontrada, esCentral = false }) {
  if (institucionMencionada && !encontrada) {
    return {
      codigo: "SC-09",
      senal: "Hecho no hallado en fuente oficial",
      origen: "codigo",
      nivel: esCentral ? "prioritaria" : "revisar",
      razon: `la institución ${institucionMencionada} no tiene comunicado en las familias E/F/G`,
      verificacion: "confirmar con la fuente primaria",
    };
  }
  return null;
}

// SC-10 · Revisión externa publicada (código): el veredicto se muestra atribuido,
// nunca como etiqueta propia.
export function senalRevisionExterna({ verificador, enlace, contradiceCentral = false }) {
  return {
    codigo: "SC-10",
    senal: "Revisión externa publicada",
    origen: "codigo",
    nivel: contradiceCentral ? "prioritaria" : "revisar",
    razon: `según ${verificador}: ${enlace}`,
    verificacion: "mostrar la revisión atribuida y no copiar su veredicto",
  };
}

// Ejecuta las señales determinísticas (código) para un evento.
export function calcularSenalesDeterministicas(evento, ctx = {}) {
  const senales = [];
  const s1 = senalRecirculacion(evento);
  const s2 = senalProcedenciaUnica(evento);
  const s6 = senalFueraDeCatalogo(evento, ctx.dominiosCatalogados || []);
  const s8 = detectarInstruccionesIncrustadas((evento.titulos || []).join(" "));
  if (s1) senales.push(s1);
  if (s2) senales.push(s2);
  if (s6) senales.push(s6);
  if (s8) senales.push(s8);
  return senales;
}

// Nivel de atención (vocabulario controlado).
export function nivelAtencion(senales = []) {
  if (senales.some((s) => s.nivel === "prioritaria")) return "verificacion_prioritaria";
  if (senales.length > 0) return "revisar";
  return "sin_senales";
}

// F03 · Cero veredictos.
export function contieneTerminosProhibidos(texto, extra = []) {
  const s = String(texto ?? "").toLowerCase();
  const lista = [...config.lexicoProhibido, ...extra];
  return lista.filter((t) => s.includes(t.toLowerCase()));
}
