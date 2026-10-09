// M12 · Recuperación híbrida: léxica (keywords/BM25-lite) + vectorial (embeddings).
// El modo vectorial usa transformers.js (multilingüe) y cae con gracia al léxico
// si el modelo no está disponible (modo sin internet / primera ejecución; T10).
import { normalizarTexto } from "../utils/normalize.js";

let extractorPromise = null;

async function obtenerExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return pipeline("feature-extraction", "Xenova/multilingual-e5-small");
    })().catch(() => null);
  }
  return extractorPromise;
}

function tokens(texto) {
  return normalizarTexto(texto)
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñü]+/i)
    .filter((t) => t.length > 2);
}

function coseno(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Búsqueda léxica por solapamiento de tokens (baseline).
export function buscarLexico(consulta, corpus, campos = ["titulo"]) {
  const q = new Set(tokens(consulta));
  if (q.size === 0) return [];
  return corpus
    .map((doc) => {
      let aciertos = 0;
      for (const campo of campos) {
        for (const t of tokens(doc[campo] ?? "")) if (q.has(t)) aciertos++;
      }
      return { doc, score: aciertos };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// Búsqueda vectorial por similitud coseno. Devuelve null si no hay embeddings.
export async function buscarVectorial(consulta, corpus, campos = ["titulo"]) {
  const extractor = await obtenerExtractor();
  if (!extractor) return null;
  const textos = corpus.map((doc) => campos.map((c) => doc[c] ?? "").join(" "));
  const [embConsulta, ...embDocs] = await Promise.all([
    extractor(consulta, { pooling: "mean", normalize: true }),
    ...textos.map((t) => extractor(t || " ", { pooling: "mean", normalize: true })),
  ]);
  const q = Array.from(embConsulta.data);
  return corpus
    .map((doc, i) => ({ doc, score: coseno(q, Array.from(embDocs[i].data)) }))
    .sort((a, b) => b.score - a.score);
}

// Recuperación híbrida: vectorial si está disponible, léxica como base/fallback.
export async function recuperarHibrido(consulta, corpus, { campos = ["titulo"], alfa = 0.5 } = {}) {
  const lex = buscarLexico(consulta, corpus, campos);
  const maxLex = lex.length ? lex[0].score : 1;
  const normLex = new Map(lex.map((r, i) => [i, r.score / maxLex]));

  const vec = await buscarVectorial(consulta, corpus, campos);
  if (!vec) return lex.map((r) => r.doc);

  const porDoc = new Map();
  lex.forEach((r, i) => porDoc.set(r.doc, { lex: normLex.get(i) ?? 0, vec: 0 }));
  vec.forEach((r) => {
    if (!porDoc.has(r.doc)) porDoc.set(r.doc, { lex: 0, vec: 0 });
    porDoc.get(r.doc).vec = r.score;
  });

  return [...porDoc.entries()]
    .map(([doc, s]) => ({ doc, score: alfa * s.lex + (1 - alfa) * s.vec }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.doc);
}
