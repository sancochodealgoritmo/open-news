// Formatos de ID de evidencia (ARQ-05). La cita válida siempre referencia un ID
// de evidencia y su campo; una URL suelta no es cita válida.
//   NOT:{id}:{campo} · WB:{pais}:{indicador}:{anio} · USGS:{id}:{campo} ·
//   SBP:{informe}:{serie}:{periodo}:p{pagina}

export function idNoticia(id, campo) {
  return `NOT:${id}:${campo}`;
}

export function idBancoMundial(pais, indicador, anio) {
  return `WB:${pais}:${indicador}:${anio}`;
}

export function idUsgs(id, campo) {
  return `USGS:${id}:${campo}`;
}

export function idSbp(informe, serie, periodo, pagina) {
  return `SBP:${informe}:${serie}:${periodo}:p${pagina}`;
}

// v1.4 · IDs de corroboración oficial e internacional.
export function idOficial(institucion, id, campo) {
  return `OFI:${institucion}:${id}:${campo}`;
}

export function idInternacional(fuente, id, campo) {
  return `INT:${fuente}:${id}:${campo}`;
}

export function idRevision(verificador, id) {
  return `REV:${verificador}:${id}`;
}

const PREFIJOS = new Set(["NOT", "WB", "USGS", "SBP", "OFI", "INT", "REV"]);

export function esIdEvidencia(s) {
  return typeof s === "string" && PREFIJOS.has(s.split(":")[0]);
}

// Extrae todos los IDs de evidencia citados en un texto (patrón [E1] o E1=...).
export function extraerIdsCitados(texto) {
  const s = String(texto ?? "");
  const ids = [];
  const re = /\[(E\d+(?:\s*,\s*E\d+)*)\]/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    for (const parte of m[1].split(",")) {
      ids.push(parte.trim());
    }
  }
  return ids;
}
