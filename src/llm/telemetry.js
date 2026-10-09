// Observabilidad del motor IA (ARQ-F07): log JSON por llamada + cadena de
// proveedores/modelos usados. Ring buffer en memoria expuesto en /api/estado
// como `motor`. No depende del modelo: el núcleo determinístico sigue de pie.
const LIMITE = 200;
const cadena = [];
let ultimaCaida = null;
let estado = "desconocido"; // "desconocido" | "disponible" | "degradado"

export function registrarLlamada({ proveedor, modelo, intento, duracionMs, tokens, ok, error = null }) {
  const entrada = {
    ts: new Date().toISOString(),
    proveedor,
    modelo,
    intento,
    duracion_ms: Math.round(duracionMs || 0),
    tokens: tokens ?? null,
    ok: Boolean(ok),
    ...(error ? { error: String(error).slice(0, 300) } : {}),
  };
  cadena.push(entrada);
  if (cadena.length > LIMITE) cadena.shift();
  // Log JSON de una línea, consumible por PM2 y herramientas de agregación.
  console.log(JSON.stringify({ evento: "llm", ...entrada }));
  return entrada;
}

export function marcarCaida(error) {
  ultimaCaida = { ts: new Date().toISOString(), error: String(error).slice(0, 300) };
  estado = "degradado";
}

export function marcarDisponible() {
  estado = "disponible";
}

export function marcarDegradado() {
  estado = "degradado";
}

export function snapshotMotor() {
  return {
    disponible: estado === "desconocido" ? null : estado === "disponible",
    estado,
    llamadas: cadena.length,
    ultima: cadena[cadena.length - 1] || null,
    cadena: cadena.slice(-20), // últimas 20 para no inflar la respuesta de /api/estado
    ultima_caida: ultimaCaida,
  };
}
