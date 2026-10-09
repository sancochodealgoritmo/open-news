#!/usr/bin/env node
// SEG-06 · Escaneo de secretos antes de entregar. Detecta tokens, claves y patrones
// sensibles en el repositorio (excluye node_modules, .git, .cache y data/raw).
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { log } from "../src/utils/logger.js";

const EXCLUIDOS = new Set(["node_modules", ".git", ".cache", "logs", "raw"]);
const PATRONES = [
  { nombre: "DeepSeek/OpenAI key", re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { nombre: "Notion token", re: /\b(ntn|secret)_[A-Za-z0-9]{16,}\b/g },
  { nombre: "Generic API key", re: /\b(api[_-]?key|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}/gi },
];

async function* recorrer(dir) {
  for (const nombre of await readdir(dir)) {
    if (EXCLUIDOS.has(nombre)) continue;
    const ruta = path.join(dir, nombre);
    const info = await stat(ruta);
    if (info.isDirectory()) yield* recorrer(ruta);
    else if (/\.(js|cjs|mjs|json|md|html|css|txt|yml|yaml|env(\.example)?)$/.test(nombre)) yield ruta;
  }
}

async function main() {
  const raiz = process.cwd();
  const hallazgos = [];
  for await (const ruta of recorrer(raiz)) {
    const contenido = await readFile(ruta, "utf8");
    for (const p of PATRONES) {
      const m = contenido.match(p.re);
      if (m) hallazgos.push(`${ruta}: ${p.nombre} (${m.length})`);
    }
  }
  if (hallazgos.length > 0) {
    log.error("Secretos detectados:");
    for (const h of hallazgos) log.error(" -", h);
    process.exit(1);
  }
  log.ok("Sin secretos detectados en el repositorio.");
}

main().catch((e) => {
  log.error("scan falló:", e.message);
  process.exit(1);
});
