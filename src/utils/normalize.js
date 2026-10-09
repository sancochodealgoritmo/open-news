// Normalización determinística (M02): texto NFC, números, fechas ISO 8601 UTC,
// URLs canónicas y visualización en hora de Panamá (ARQ-06).
import { createHash } from "node:crypto";

export function normalizarTexto(t) {
  return String(t ?? "").normalize("NFC").trim();
}

// "1.5" / "1,5" / "12 %" / "12%" → número. Devuelve null si no es numérico.
export function normalizarNumero(t) {
  if (t === null || t === undefined) return null;
  const s = String(t).trim().replace(/\s*%\s*$/, "").replace(/,/g, ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Conserva nulos: nunca convierte ausencias en cero (T01).
export function normalizarNullable(t) {
  if (t === null || t === undefined || String(t).trim() === "") return null;
  return normalizarTexto(t);
}

// Fecha a ISO 8601 UTC. Devuelve null si no es válida (va a cuarentena).
export function fechaUTC(t) {
  if (t === null || t === undefined || String(t).trim() === "") return null;
  const d = new Date(String(t));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// URL canónica: sin parámetros de rastreo, fragmento ni barra final (M02).
const PARAMETROS_RASTREO = /^(utm_|fbclid|gclid|mc_|ref$)/i;

export function urlCanonica(raw) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return null;
  }
  for (const k of [...u.searchParams.keys()]) {
    if (PARAMETROS_RASTREO.test(k)) u.searchParams.delete(k);
  }
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  let out = u.toString();
  if (out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

// ID estable de una noticia = hash de la URL canónica (M02).
export function idEstable(url) {
  const canonica = urlCanonica(url);
  if (!canonica) return null;
  return createHash("sha256").update(canonica).digest("hex").slice(0, 16);
}

// Horas entre dos fechas ISO (positivo si "a" es posterior a "b").
export function horasEntre(aIso, bIso) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (a - b) / 3_600_000;
}

// Hora de Panamá (UTC-5, sin DST) para la interfaz (ARQ-06).
export function horaPanama(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}
