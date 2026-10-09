// Persistencia de registro (solo-anejo) en MySQL, espejo del store JSONL.
// Si MySQL no está disponible, devuelve false (la fila queda en JSONL como cola).
import { dbDisponible, dbExecute, dbQuery } from "../db/index.js";

const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);

const TABLA = {
  "revisiones.jsonl": "revisiones",
  "verificacion.jsonl": "verificaciones",
  "entregables.jsonl": "entregables",
  "consultas.jsonl": "consultas",
  "bitacora.jsonl": "bitacora",
};

// Lee registros desde MySQL. Devuelve null si MySQL no está disponible o el
// archivo no corresponde a una tabla (para que el store caiga al respaldo).
export async function leerRegistros(archivo) {
  const tabla = TABLA[archivo];
  if (!tabla || !(await dbDisponible())) return null;
  try {
    const filas = await dbQuery(`SELECT datos FROM ${tabla} ORDER BY id`, []);
    return filas.map((f) => (typeof f.datos === "string" ? JSON.parse(f.datos) : f.datos));
  } catch {
    return null;
  }
}

export async function persistirRegistro(archivo, o) {
  if (!(await dbDisponible())) return false;
  try {
    if (archivo === "revisiones.jsonl") {
      await dbExecute(
        "INSERT INTO revisiones (id_caso,hacia,persona,utilidad,motivo,ts,datos) VALUES (?,?,?,?,?,?,?)",
        [o.id_caso ?? null, o.hacia ?? null, o.persona ?? null, o.utilidad ?? null, o.motivo ?? null, ts(), JSON.stringify(o)]
      );
    } else if (archivo === "verificacion.jsonl") {
      await dbExecute(
        "INSERT INTO verificaciones (id_caso,accion,persona,motivo,ts,datos) VALUES (?,?,?,?,?,?)",
        [o.id_caso ?? null, o.accion ?? null, o.persona ?? null, o.motivo ?? null, ts(), JSON.stringify(o)]
      );
    } else if (archivo === "entregables.jsonl") {
      await dbExecute(
        "INSERT INTO entregables (id_caso,modalidad,origen,ts,datos) VALUES (?,?,?,?,?)",
        [o.id_caso ?? null, o.modalidad ?? null, o.origen ?? null, ts(), JSON.stringify(o)]
      );
    } else if (archivo === "consultas.jsonl") {
      await dbExecute(
        "INSERT INTO consultas (id_caso,modalidad,pregunta,intencion,ts,datos) VALUES (?,?,?,?,?,?)",
        [o.id_caso ?? null, o.modalidad ?? null, o.pregunta ?? null, o.intencion ?? null, ts(), JSON.stringify(o)]
      );
    } else if (archivo === "bitacora.jsonl") {
      await dbExecute(
        "INSERT INTO bitacora (tipo,detalle,autor,ts,datos) VALUES (?,?,?,?,?)",
        [o.tipo ?? null, o.detalle ?? null, o.autor ?? null, ts(), JSON.stringify(o)]
      );
    }
    return true;
  } catch {
    return false;
  }
}
