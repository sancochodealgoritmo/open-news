// Capa de acceso al registro: MySQL primario; JSONL solo como cola/respaldo
// cuando MySQL no está disponible (ARQ-20).
import { appendFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { persistirRegistro, leerRegistros } from "../registro/mysql.js";

function ruta(relativo) {
  return path.join(config.dataDir, "processed", relativo);
}

function rutaCola(archivo) {
  return path.join(config.dataDir, "registro", `cola-${archivo}`);
}

export async function anexar(archivo, objeto) {
  const ok = await persistirRegistro(archivo, objeto);
  if (!ok) {
    // Cola en disco si MySQL no está disponible (reintento posterior).
    await mkdir(path.dirname(rutaCola(archivo)), { recursive: true });
    await appendFile(rutaCola(archivo), JSON.stringify(objeto) + "\n", "utf8");
  }
  return ok;
}

export async function leerLineas(archivo) {
  const desdeMysql = await leerRegistros(archivo);
  if (desdeMysql !== null) return desdeMysql;
  try {
    const texto = await readFile(ruta(archivo), "utf8");
    return texto
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export async function leerPorId(archivo, campo, valor) {
  const lineas = await leerLineas(archivo);
  return lineas.find((l) => l[campo] === valor) || null;
}

export function rutaProcesados(relativo) {
  return ruta(relativo);
}
