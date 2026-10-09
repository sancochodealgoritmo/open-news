#!/usr/bin/env node
// Ciclo diario: ingest → load → precache. Orquestación para PM2 (open-news-ciclo).
// Cada paso escribe directamente en MySQL (sistema de registro); los archivos
// data/ quedan como respaldo. No se ejecuta en el arranque del servidor.
import { execFileSync } from "node:child_process";
import { log } from "../src/utils/logger.js";

const PASOS = [
  ["ingest", "scripts/ingest.js"],
  ["load", "scripts/load.js"],
  ["precache", "scripts/precache.js"],
];

const inicio = Date.now();
for (const [nombre, script] of PASOS) {
  log.info(`Ciclo · ${nombre}…`);
  try {
    execFileSync("node", [script], { cwd: process.cwd(), stdio: "inherit" });
  } catch (e) {
    log.error(`Ciclo falló en ${nombre}:`, e.message || e.status);
    process.exit(1);
  }
}
log.ok(`Ciclo completado en ${Math.round((Date.now() - inicio) / 1000)}s.`);
