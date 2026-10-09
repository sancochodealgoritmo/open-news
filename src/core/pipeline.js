// S2-S4 + S3F · Núcleo de evidencias precalculado por lote (ARQ-02).
// Organiza (baseline + IA opcional), aplica el filtro S3F, prioriza con RIUNE y
// construye bandejas por módulo + bandeja de verificación. Con fallback al
// baseline determinístico si la IA no está disponible (modo sin internet, T10).
import { agruparEventos } from "./events.js";
import { clasificarTema } from "./themes.js";
import { calcularSenalesDeterministicas } from "../signals/credibility.js";
import { aplicarFiltro } from "../filter/index.js";
import { calcularPuntaje, estadoEvidencia } from "../rules/riune.js";
import { construirFicha, PRODUCTOS } from "../products/index.js";
import { redactarResumenFicha } from "./ia.js";
import { config } from "../config.js";

// Geo baseline por mención (el método principal es NER/P01; esto es el baseline).
function geoDe(texto) {
  const t = String(texto ?? "").toLowerCase();
  if (t.includes("panamá") || t.includes("panama")) return "panama";
  if (/centroamérica|centroamerica|costa rica|colombia|república dominicana|méxico|mexico|guatemala/.test(t)) return "regional";
  return "ninguna";
}

function enriquecerBaseline(evento, { dominiosCatalogados = [] }) {
  const titulo = (evento.titulos || []).join(" ");
  const senales = calcularSenalesDeterministicas(evento, { dominiosCatalogados });
  const filtro = aplicarFiltro(evento, { senales });
  return {
    ...evento,
    tema: clasificarTema(titulo),
    geo: geoDe(titulo),
    afirmaciones: [],
    contradiccion_abierta: false,
    impacto: { nivel: 0, citado: false, datoOficialCitado: false },
    similitud_previa: 0,
    es_recirculacion: senales.some((s) => s.codigo === "SC-01"),
    fecha_conocida: Boolean(evento.fecha_publicacion),
    vinculo_oficial: false,
    fuente_primaria: false,
    texto_disponible: (evento.miembros || []).some((m) => m.alcance_texto === "completo" || m.alcance_texto === "extracto"),
    hito_proximo_7dias: false,
    filtro,
  };
}

function comparar(a, b) {
  if (b.puntaje !== a.puntaje) return b.puntaje - a.puntaje;
  if (b.componentes.U !== a.componentes.U) return b.componentes.U - a.componentes.U;
  return String(a.id_caso).localeCompare(String(b.id_caso));
}

function alcanceDe(evento) {
  return (evento.miembros || []).every((m) => m.alcance_texto === "titular/metadatos") ? "titular/metadatos" : "completo";
}

// Ejecuta fn sobre items con un pool de concurrencia fijo, preservando el orden.
// Cada item queda aislado: si fn lanza, se usa onError (o undefined).
async function mapConPool(items, fn, { pool = 8, onError = null } = {}) {
  const resultados = new Array(items.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (true) {
      const i = siguiente++;
      if (i >= items.length) return;
      try {
        resultados[i] = await fn(items[i], i);
      } catch (e) {
        resultados[i] = onError ? await onError(e, items[i], i) : undefined;
      }
    }
  };
  const n = Math.max(1, Math.min(pool, items.length));
  await Promise.all(Array.from({ length: n }, trabajador));
  return resultados;
}

// Precalcula eventos, bandejas por modalidad y bandeja de verificación.
// fechaCorte se inyecta (ARQ-04). `enriquecerIA` es una función async opcional
// que reemplaza el baseline por el análisis del modelo (P01-P05).
export async function precalcular(registros, { fechaCorte, dominiosCatalogados = [], enriquecerIA = null, usarP06 = true } = {}) {
  const corte = fechaCorte || new Date().toISOString();
  let eventos = agruparEventos(registros.noticias || []).map((e) => enriquecerBaseline(e, { dominiosCatalogados }));

  // Enriquecimiento IA una sola vez por evento (no por modalidad), en paralelo.
  if (enriquecerIA) {
    const ctx = { oficiales: registros.oficiales || [], indicadores: registros.indicadores || [], dominiosCatalogados };
    eventos = await mapConPool(
      eventos,
      async (ev) => {
        try { return await enriquecerIA(ev, ctx); } catch { return ev; }
      },
      { pool: config.iaConcurrency }
    );
  }

  // Resumen de ficha (P06) una sola vez por evento, en paralelo.
  const resumenes = new Map();
  if (usarP06) {
    const lista = await mapConPool(
      eventos,
      async (ev) => {
        try {
          const puntaje = calcularPuntaje(ev, { fechaCorte: corte, modalidad: "principal" });
          const estado = estadoEvidencia({
            afirmaciones: ev.afirmaciones,
            contradiccion_abierta: ev.contradiccion_abierta,
            n_procedencias: ev.n_procedencias,
            fuente_oficial_primaria: ev.fuente_primaria || ev.vinculo_oficial,
            texto_disponible: ev.texto_disponible,
            alcance_texto: alcanceDe(ev),
            ruta: ev.filtro.ruta_fd,
          });
          const fichaTmp = construirFicha(ev, { modalidad: "principal", puntaje, senales: ev.filtro.senales, estado, filtro: ev.filtro });
          return await redactarResumenFicha(fichaTmp, ev);
        } catch {
          return { resumen: "", vacios: [], accion_recomendada: "" };
        }
      },
      { pool: config.iaConcurrency }
    );
    eventos.forEach((ev, i) => resumenes.set(ev.id_evento, lista[i]));
  }

  const bandejas = {};
  for (const modalidad of Object.keys(PRODUCTOS)) {
    const bandeja = [];
    const verificacion = [];
    for (const evento of eventos) {
      const puntaje = calcularPuntaje(evento, { fechaCorte: corte, modalidad });
      const estado = estadoEvidencia({
        afirmaciones: evento.afirmaciones,
        contradiccion_abierta: evento.contradiccion_abierta,
        n_procedencias: evento.n_procedencias,
        fuente_oficial_primaria: evento.fuente_primaria || evento.vinculo_oficial,
        texto_disponible: evento.texto_disponible,
        alcance_texto: alcanceDe(evento),
        ruta: evento.filtro.ruta_fd,
      });
      const ficha = construirFicha(evento, { modalidad, puntaje, senales: evento.filtro.senales, estado, filtro: evento.filtro });
      const resumen = resumenes.get(evento.id_evento);
      if (resumen) {
        ficha.resumen = resumen.resumen;
        ficha.vacios = resumen.vacios;
        ficha.accion_recomendada = resumen.accion_recomendada;
      }
      const item = { ...ficha, id_evento: evento.id_evento };
      if (evento.filtro.ruta_fd === "retenido" && !evento.filtro.liberacion) {
        verificacion.push(item);
      } else {
        bandeja.push(item);
      }
    }
    bandeja.sort(comparar);
    verificacion.sort(comparar);
    bandejas[modalidad] = { bandeja, verificacion, retenidos: verificacion.length };
  }

  return { fechaCorte: corte, eventos, bandejas };
}
