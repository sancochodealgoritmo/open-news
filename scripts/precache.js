#!/usr/bin/env node
// S2-S4 · Precálculo por lote: agrupa eventos, calcula RIUNE, estado de evidencia y
// construye bandejas por modalidad. Escribe fichas.jsonl, eventos.jsonl, bandejas/*.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { cargarPaquete } from "../src/core/load.js";
import { precalcular } from "../src/core/pipeline.js";
import { enriquecerEventoConIA } from "../src/core/ia.js";
import { log } from "../src/utils/logger.js";
import { upsertEvento, upsertEventoNoticia, upsertAfirmacion, upsertCita, upsertFicha, upsertSenal } from "../src/db/writers.js";

// Persistencia en MySQL del precálculo (sistema de registro).
async function persistirPrecalculoMySQL(resultado) {
  for (const e of resultado.eventos) {
    await upsertEvento(e);
    for (const m of e.miembros || []) {
      const idn = typeof m === "string" ? m : m?.id_noticia;
      if (idn) await upsertEventoNoticia(e.id_evento, idn);
    }
    for (const a of e.afirmaciones || []) {
      await upsertAfirmacion(e.id_evento, a);
      for (const c of a.citas || []) await upsertCita(e.id_evento, c, a.pasaje || "");
    }
  }
  const fichasTodas = Object.values(resultado.bandejas).flatMap((m) => [...(m.bandeja || []), ...(m.verificacion || [])]);
  for (const f of fichasTodas) {
    await upsertFicha(f);
    for (const s of f.senales_detalle || []) await upsertSenal(f.id_caso, s);
  }
  return { eventos: resultado.eventos.length, fichas: fichasTodas.length };
}

async function main() {
  const paquete = await cargarPaquete();
  const fechaCorte = paquete.manifest?.fecha_corte_UTC || new Date().toISOString();
  const dominiosCatalogados = paquete.fuentes.map((f) => f.dominio).filter(Boolean);

  log.info("Precálculo con enriquecimiento IA (P01-P05)…");
  const resultado = await precalcular(paquete, { fechaCorte, dominiosCatalogados, enriquecerIA: enriquecerEventoConIA });

  const outDir = path.join(process.cwd(), "data", "processed");
  await mkdir(path.join(outDir, "bandejas"), { recursive: true });

  for (const [modalidad, fichas] of Object.entries(resultado.bandejas)) {
    await writeFile(path.join(outDir, "bandejas", `${modalidad}.json`), JSON.stringify(fichas, null, 2), "utf8");
    log.ok(`Bandeja ${modalidad}: ${fichas.bandeja.length} en bandeja, ${fichas.verificacion.length} en verificación`);
  }

  await writeFile(path.join(outDir, "eventos.jsonl"), resultado.eventos.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  const fichasTodas = Object.values(resultado.bandejas).flatMap((m) => [...(m.bandeja || []), ...(m.verificacion || [])]);
  await writeFile(path.join(outDir, "fichas.jsonl"), fichasTodas.map((f) => JSON.stringify(f)).join("\n") + "\n", "utf8");

  const metricas = {
    fecha_corte: resultado.fechaCorte,
    version_reglas: resultado.version || "RIUNE v1.0",
    eventos: resultado.eventos.length,
    por_modalidad: Object.fromEntries(Object.entries(resultado.bandejas).map(([m, f]) => [m, f.bandeja.length])),
    aviso: "cobertura de citas, abstención y latencia se completan con `npm run bench`",
  };
  await writeFile(path.join(outDir, "metricas.json"), JSON.stringify(metricas, null, 2), "utf8");

  // Persistir en MySQL (sistema de registro). Los archivos quedan como respaldo.
  try {
    const { eventos, fichas } = await persistirPrecalculoMySQL(resultado);
    log.ok(`MySQL: ${eventos} eventos, ${fichas} fichas.`);
  } catch (e) {
    log.warn("Escritura a MySQL omitida:", e.message);
  }

  log.ok("Precálculo completado. Arranca la demo con `npm start`.");
}

main().catch((e) => {
  log.error("precache falló:", e.message);
  process.exit(1);
});
