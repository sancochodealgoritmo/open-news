#!/usr/bin/env node
// S1 · Ejecuta la carga determinística: hash, esquema, cuarentena, normalización
// y reporte de calidad.
import { cargarPaquete } from "../src/core/load.js";
import { log } from "../src/utils/logger.js";
import { upsertNoticia, upsertFuente } from "../src/db/writers.js";

cargarPaquete()
  .then(async (r) => {
    log.ok(`Carga completada. Rechazados: ${r.rechazados.length}.`);
    if (r.rechazados.length > 0) log.warn("Detalle en data/processed/rechazados.csv");

    // Persistir la versión normalizada en MySQL (sistema de registro).
    try {
      for (const n of r.noticias) await upsertNoticia(n);
      for (const f of r.fuentes) await upsertFuente(f);
      log.ok(`MySQL: ${r.noticias.length} noticias normalizadas, ${r.fuentes.length} fuentes.`);
    } catch (e) {
      log.warn("Escritura a MySQL omitida:", e.message);
    }
  })
  .catch((e) => {
    log.error("load falló:", e.message);
    process.exit(1);
  });
