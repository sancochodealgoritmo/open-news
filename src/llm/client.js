// Adaptador de proveedor con respaldo: LLM_* (primario) → LLM2_* (secundario).
// Dentro de cada proveedor, el modelo razonador (si está configurado) cae al
// modelo base. El núcleo determinístico no depende del modelo (modo degradado).
import OpenAI from "openai";
import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { registrarLlamada, marcarCaida, marcarDisponible, marcarDegradado } from "./telemetry.js";

// Instanciación perezosa por proveedor (clave: baseURL). Solo se exige la API key
// cuando se llama al modelo (producción/consulta).
const clientes = new Map();

function clienteDe(prov) {
  if (!prov.apiKey) return null;
  if (!clientes.has(prov.baseURL)) {
    clientes.set(prov.baseURL, new OpenAI({ apiKey: prov.apiKey, baseURL: prov.baseURL }));
  }
  return clientes.get(prov.baseURL);
}

async function llamar(prov, { nombre, intento }, modelo, messages, temperatura, maxTokens) {
  const client = clienteDe(prov);
  if (!client) {
    const e = new Error("Proveedor sin API key configurada");
    registrarLlamada({ proveedor: nombre, modelo, intento, ok: false, error: e.message });
    throw e;
  }
  const inicio = Date.now();
  try {
    const res = await client.chat.completions.create({
      model: modelo,
      messages,
      temperature: temperatura,
      max_tokens: maxTokens,
    });
    const content = res.choices?.[0]?.message?.content ?? "";
    if (!String(content).trim()) throw new Error(`Modelo ${modelo} devolvió contenido vacío`);
    registrarLlamada({ proveedor: nombre, modelo, intento, duracionMs: Date.now() - inicio, tokens: res.usage?.total_tokens ?? null, ok: true });
    return content;
  } catch (e) {
    registrarLlamada({ proveedor: nombre, modelo, intento, duracionMs: Date.now() - inicio, ok: false, error: e.message });
    throw e;
  }
}

// Devuelve el texto de la respuesta con respaldo en cadena:
// primario (razonador → base) → secundario (razonador → base).
export async function completar(
  messages,
  { modelo = null, temperatura = null, maxTokens = null } = {}
) {
  const p = config.llm.primario;
  const s = config.llm.secundario;
  const temp = temperatura ?? p.temperatura;
  const max = maxTokens ?? p.maxTokens;

  const primarioModelos = modelo
    ? [modelo]
    : (p.modeloRazonador && p.modeloRazonador !== p.modelo ? [p.modeloRazonador, p.modelo] : [p.modelo]);

  let ultimoError = null;
  for (let i = 0; i < primarioModelos.length; i++) {
    const m = primarioModelos[i];
    try {
      const resultado = await llamar(p, { nombre: "primario", intento: i + 1 }, m, messages, temp, max);
      marcarDisponible();
      return resultado;
    } catch (e) {
      ultimoError = e;
      log.warn(`Proveedor primario (${m}) falló:`, e.message);
    }
  }

  if (s.apiKey && s.baseURL) {
    const secundarioModelos = [];
    if (s.modeloRazonador && s.modeloRazonador !== (s.modelo || p.modelo)) secundarioModelos.push(s.modeloRazonador);
    secundarioModelos.push(s.modelo || p.modelo);
    for (let j = 0; j < secundarioModelos.length; j++) {
      const m = secundarioModelos[j];
      try {
        log.info(`Usando proveedor secundario (${m})…`);
        const resultado = await llamar(s, { nombre: "secundario", intento: j + 1 }, m, messages, temp, max);
        marcarDegradado();
        return resultado;
      } catch (e) {
        ultimoError = e;
        log.warn(`Proveedor secundario (${m}) falló:`, e.message);
      }
    }
  }

  marcarCaida(ultimoError || new Error("Sin proveedor de modelo configurado"));
  throw ultimoError || new Error("Sin proveedor de modelo configurado");
}

// Extrae el primer objeto JSON del texto, tolerando vallas de código, prosa
// alrededor y texto sobrante después del cierre (escaneo balanceado de llaves).
export function safeJsonParse(texto) {
  let s = String(texto ?? "");
  s = s.replace(/```[a-zA-Z]*/g, "");
  const inicio = s.indexOf("{");
  if (inicio === -1) return null;

  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = inicio; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        const slice = s.slice(inicio, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          // Tolerancia a JSON casi-válido del modelo: comas finales y caracteres
          // de control sueltos.
          const limpio = slice
            .replace(/,\s*([}\]])/g, "$1")
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");
          try {
            return JSON.parse(limpio);
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}
