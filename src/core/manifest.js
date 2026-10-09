// Manifest del snapshot (S0/S1): verificación de integridad SHA-256.
// El manifest documenta versión, fecha de corte UTC, cantidades, licencias y
// transformaciones. Solo se detiene la carga si el hash no coincide (M01).
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export function hashTexto(texto) {
  return createHash("sha256").update(texto).digest("hex");
}

export async function hashArchivo(ruta) {
  const buf = await readFile(ruta);
  return createHash("sha256").update(buf).digest("hex");
}

// Devuelve { ok, archivos: [{archivo, esperado, real, coincide}] }.
export async function verificarManifest(manifest, dataDir) {
  const archivos = manifest?.archivos || [];
  const resultados = [];
  for (const entrada of archivos) {
    const ruta = path.join(dataDir, "raw", entrada.archivo);
    let real = null;
    let coincide = false;
    let error = null;
    try {
      real = await hashArchivo(ruta);
      coincide = real === entrada.sha256;
    } catch (e) {
      error = e.message;
    }
    resultados.push({ archivo: entrada.archivo, esperado: entrada.sha256, real, coincide, error });
  }
  return {
    ok: resultados.length > 0 && resultados.every((r) => r.coincide),
    version: manifest?.version || null,
    fechaCorte: manifest?.fecha_corte_UTC || null,
    archivos: resultados,
  };
}
