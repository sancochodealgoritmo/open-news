// Caché en memoria con TTL. Usada para lecturas repetidas de indicadores y
// para el caché de salidas del modelo (M18, por versión de prompt + hash de entrada).
const almacen = new Map();

export function obtenerCache(clave) {
  const item = almacen.get(clave);
  if (!item) return null;
  if (Date.now() > item.expiraEn) {
    almacen.delete(clave);
    return null;
  }
  return item.valor;
}

export function guardarCache(clave, valor, ttlMs) {
  almacen.set(clave, { valor, expiraEn: Date.now() + ttlMs });
}

export function invalidarCache(clave) {
  almacen.delete(clave);
}

export function limpiarCache() {
  almacen.clear();
}
