// M05 · Agrupación de eventos. Una historia = un evento; repetición ≠ corroboración.
// N1 URL canónica idéntica · N2 casi-duplicado de titular (similitud de caracteres)
// · N3 similitud semántica + entidades + ventana 72 h. Baseline: URL / título exacto.
import { config } from "../config.js";
import { normalizarTexto } from "../utils/normalize.js";

function bigramas(s) {
  const t = normalizarTexto(s).toLowerCase();
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

// Similitud de caracteres por bigramas (Jaccard). Para titulares cortos.
export function similitudCaracteres(a, b) {
  const A = bigramas(a);
  const B = bigramas(b);
  if (A.size === 0 && B.size === 0) return 1;
  let interseccion = 0;
  for (const g of A) if (B.has(g)) interseccion++;
  return interseccion / (A.size + B.size - interseccion);
}

// N1: URL canónica idéntica → mismo evento.
export function agruparPorUrlCanonica(noticias) {
  const grupos = new Map();
  for (const n of noticias) {
    const clave = n.url_canonica || n.id_estable || n.url;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(n);
  }
  return [...grupos.values()];
}

// N2: casi-duplicado de titular por similitud de caracteres.
function agruparPorTitulo(grupos, umbral) {
  const salida = [];
  const usados = new Set();
  for (let i = 0; i < grupos.length; i++) {
    if (usados.has(i)) continue;
    const grupo = [...grupos[i]];
    usados.add(i);
    for (let j = i + 1; j < grupos.length; j++) {
      if (usados.has(j)) continue;
      const parecido = grupos[i].some((a) => grupos[j].some((b) => similitudCaracteres(a.titulo, b.titulo) >= umbral));
      if (parecido) {
        grupo.push(...grupos[j]);
        usados.add(j);
      }
    }
    salida.push(grupo);
  }
  return salida;
}

// Procedencias independientes: agencia replicada = 1 procedencia (CU-03, SC-02).
export function contarProcedencias(miembros) {
  const claves = new Set();
  const detalle = [];
  for (const m of miembros) {
    const clave = m.procedencia || m.medio || "desconocida";
    claves.add(clave);
  }
  for (const c of claves) {
    const medios = [...new Set(miembros.filter((m) => (m.procedencia || m.medio) === c).map((m) => m.medio))];
    detalle.push({ procedencia: c, medios });
  }
  return { n_procedencias: claves.size, detalle };
}

// Construye el evento a partir de un grupo de notas.
export function construirEvento(miembros) {
  const fechas = miembros.map((m) => m.fecha_publicacion).filter(Boolean).sort();
  const { n_procedencias, detalle } = contarProcedencias(miembros);
  return {
    id_evento: `EV-${miembros[0]?.id_estable || Math.random().toString(36).slice(2, 8)}`,
    miembros,
    n_notas: miembros.length,
    n_procedencias,
    procedencias: detalle,
    fecha_original: fechas[0] || miembros[0]?.fecha_deteccion || null,
    fecha_publicacion: fechas[0] || null,
    fecha_deteccion: miembros.map((m) => m.fecha_deteccion).filter(Boolean).sort().at(-1) || null,
    medios: [...new Set(miembros.map((m) => m.medio))],
    dominios: [...new Set(miembros.map((m) => m.dominio || null).filter(Boolean))],
    titulos: miembros.map((m) => m.titulo),
  };
}

// Agrupa notas en eventos. similitudSemantica(opcional) habilita N3.
export function agruparEventos(noticias, { similitudSemantica } = {}) {
  const umbralTitulo = config.umbralSimilitudTitulo;
  const gruposN1 = agruparPorUrlCanonica(noticias);
  const gruposN2 = agruparPorTitulo(gruposN1, umbralTitulo);

  // N3 opcional (embeddings + ventana 72 h). Sin embeddings se mantiene el baseline.
  if (typeof similitudSemantica === "function") {
    const ventana = config.ventanaEventosHoras;
    const salida = [];
    const usados = new Set();
    for (let i = 0; i < gruposN2.length; i++) {
      if (usados.has(i)) continue;
      const grupo = [...gruposN2[i]];
      usados.add(i);
      for (let j = i + 1; j < gruposN2.length; j++) {
        if (usados.has(j)) continue;
        const t1 = grupo[0].titulo;
        const t2 = gruposN2[j][0].titulo;
        const sim = similitudSemantica(t1, t2);
        const d1 = new Date(grupo[0].fecha_publicacion || grupo[0].fecha_deteccion).getTime();
        const d2 = new Date(gruposN2[j][0].fecha_publicacion || gruposN2[j][0].fecha_deteccion).getTime();
        const dentroVentana = Math.abs(d1 - d2) <= ventana * 3_600_000;
        if (sim >= config.umbralSimilitudSemantica && dentroVentana) {
          grupo.push(...gruposN2[j]);
          usados.add(j);
        }
      }
      salida.push(grupo);
    }
    return salida.map(construirEvento);
  }

  return gruposN2.map(construirEvento);
}
