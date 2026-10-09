// Salida estructurada JSON validada por esquema (zod) con 1 reintento (ARQ-09).
// Si falla dos veces → { requiereEvidencia: true } (el tema pasa a "requiere evidencia").
// Caché por (versión de prompt, hash de entrada) para el modo sin internet (ARQ-03, M18).
import { createHash } from "node:crypto";
import { completar, safeJsonParse } from "./client.js";
import { obtenerCache, guardarCache } from "../utils/cache.js";
import { config } from "../config.js";

function claveCache(versionPrompt, hashEntrada) {
  return `llm:${versionPrompt}:${hashEntrada}`;
}

// messages: [{role, content}]. schema: objeto zod.
export async function generarEstructurado(messages, schema, { versionPrompt = "p00-v0.1", hashEntrada = "", modelo = config.llm.primario.modelo } = {}) {
  const hash = hashEntrada || createHash("sha256").update(JSON.stringify(messages)).digest("hex").slice(0, 16);
  const clave = claveCache(versionPrompt, hash);

  const enCache = obtenerCache(clave);
  if (enCache !== null) return enCache;

  const parse = schema.safeParse.bind(schema);

  let texto = await completar(messages, { modelo });
  let datos = safeJsonParse(texto);
  let resultado = datos === null ? null : parse(datos);

  if (!resultado?.success) {
    // 1 reintento con los errores señalados (ARQ-09). Se incluye el borrador
    // anterior para que el modelo pueda corregirlo (no solo ver los errores).
    const errores = resultado?.error?.issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || "JSON inválido";
    if (datos) messages.push({ role: "assistant", content: JSON.stringify(datos) });
    messages.push({ role: "user", content: `Tu salida anterior no pasó la validación. Corrige y devuelve solo JSON. Errores: ${errores}` });
    texto = await completar(messages, { modelo });
    datos = safeJsonParse(texto);
    resultado = datos === null ? null : parse(datos);
  }

  if (!resultado?.success) {
    throw Object.assign(new Error("Esquema de salida no válido tras 1 reintento"), { requiereEvidencia: true });
  }

  guardarCache(clave, resultado.data, config.cacheTtlMs);
  return resultado.data;
}
