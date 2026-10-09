// S1 · CARGAR — código determinístico (M01-M02).
// Verifica integridad SHA-256, valida esquema por archivo, manda filas inválidas a
// cuarentena (sin bloquear la carga), normaliza y emite reporte de calidad.
// Reglas clave: nunca rellenar nulos con 0; solo se detiene si el hash no coincide.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { verificarManifest } from "./manifest.js";
import {
  normalizarTexto,
  normalizarNullable,
  normalizarNumero,
  fechaUTC,
  urlCanonica,
  idEstable,
} from "../utils/normalize.js";
import { log } from "../utils/logger.js";

// ---------- Utilidades de archivos ----------

export function partirLineaCsv(linea) {
  const celdas = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (c === "," && !entreComillas) {
      celdas.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  celdas.push(actual);
  return celdas.map((s) => s.trim());
}

// Separa el CSV en filas lógicas respetando comillas: un salto de línea dentro de
// un campo entre comillas NO parte la fila (descripción multi-línea del RSS).
function partirFilas(texto) {
  const filas = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      if (entreComillas && texto[i + 1] === '"') {
        actual += '""';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
      actual += c;
    } else if (c === "\n" && !entreComillas) {
      filas.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  if (actual.trim() !== "") filas.push(actual);
  return filas;
}

export function parsearCsv(texto) {
  const limpio = String(texto ?? "").replace(/\r\n?/g, "\n");
  const lineas = partirFilas(limpio).filter((l) => l.trim() !== "");
  if (lineas.length === 0) return { encabezados: [], filas: [] };
  const encabezados = partirLineaCsv(lineas[0]);
  const filas = [];
  for (const linea of lineas.slice(1)) {
    const celdas = partirLineaCsv(linea);
    const fila = {};
    encabezados.forEach((h, i) => {
      fila[h] = celdas[i] ?? "";
    });
    filas.push(fila);
  }
  return { encabezados, filas };
}

async function leer(ruta) {
  try {
    return await readFile(ruta, "utf8");
  } catch {
    return null;
  }
}

function esIsoFecha(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(new Date(s).getTime());
}

function esUrl(s) {
  try {
    const u = new URL(String(s));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const ALCANCE_VALIDO = new Set(["completo", "extracto", "titular/metadatos"]);

// ---------- Validación por archivo (devuelve {valido, motivo}) ----------

export function validarNoticia(fila, indice) {
  const obligatorios = ["id_noticia", "titulo", "url", "medio", "idioma", "fecha_publicacion", "fecha_deteccion", "fecha_extraccion", "tema", "origen", "alcance_texto"];
  for (const campo of obligatorios) {
    if (!fila[campo] || String(fila[campo]).trim() === "") {
      return { valido: false, motivo: `fila ${indice}: falta ${campo}` };
    }
  }
  if (!esUrl(fila.url)) return { valido: false, motivo: `fila ${indice}: URL mal formada` };
  for (const campo of ["fecha_publicacion", "fecha_deteccion", "fecha_extraccion"]) {
    if (!esIsoFecha(fila[campo])) return { valido: false, motivo: `fila ${indice}: ${campo} no es ISO 8601` };
  }
  if (!ALCANCE_VALIDO.has(String(fila.alcance_texto).trim())) {
    return { valido: false, motivo: `fila ${indice}: alcance_texto inválido (${fila.alcance_texto})` };
  }
  return { valido: true };
}

export function validarIndicador(fila, indice) {
  const obligatorios = ["pais_iso3", "indicador_id", "anio", "unidad", "fuente_url", "fecha_extraccion", "licencia"];
  for (const campo of obligatorios) {
    if (!fila[campo] || String(fila[campo]).trim() === "") {
      return { valido: false, motivo: `fila ${indice}: falta ${campo}` };
    }
  }
  if (!/^[A-Z]{3}$/.test(String(fila.pais_iso3).trim())) {
    return { valido: false, motivo: `fila ${indice}: pais_iso3 inválido (${fila.pais_iso3})` };
  }
  const anio = Number(fila.anio);
  if (!Number.isInteger(anio)) return { valido: false, motivo: `fila ${indice}: anio inválido` };
  if (!esIsoFecha(fila.fecha_extraccion)) return { valido: false, motivo: `fila ${indice}: fecha_extraccion no ISO` };
  return { valido: true };
}

export function validarSbp(fila, indice) {
  const obligatorios = ["informe", "serie", "periodo", "unidad", "pagina", "fuente_url", "fecha_extraccion", "condiciones"];
  for (const campo of obligatorios) {
    if (!fila[campo] || String(fila[campo]).trim() === "") {
      return { valido: false, motivo: `fila ${indice}: falta ${campo}` };
    }
  }
  if (!esIsoFecha(fila.fecha_extraccion)) return { valido: false, motivo: `fila ${indice}: fecha_extraccion no ISO` };
  return { valido: true };
}

// ---------- Normalización (M02) ----------

export function normalizarNoticia(fila) {
  const urlCanonicaVal = urlCanonica(fila.url);
  return {
    id_noticia: normalizarTexto(fila.id_noticia),
    titulo: normalizarTexto(fila.titulo),
    url: normalizarTexto(fila.url),
    url_canonica: urlCanonicaVal,
    id_estable: idEstable(fila.url),
    medio: normalizarTexto(fila.medio),
    idioma: normalizarTexto(fila.idioma),
    fecha_publicacion: fechaUTC(fila.fecha_publicacion),
    fecha_deteccion: fechaUTC(fila.fecha_deteccion),
    fecha_extraccion: fechaUTC(fila.fecha_extraccion),
    tema: normalizarTexto(fila.tema),
    origen: normalizarTexto(fila.origen),
    alcance_texto: normalizarTexto(fila.alcance_texto),
    descripcion: normalizarNullable(fila.descripcion),
    procedencia: normalizarNullable(fila.procedencia),
    dominio: normalizarNullable(fila.dominio),
    id_evento: normalizarNullable(fila.id_evento),
  };
}

export function normalizarIndicador(fila) {
  return {
    pais_iso3: String(fila.pais_iso3).trim().toUpperCase(),
    indicador_id: normalizarTexto(fila.indicador_id),
    anio: Number(fila.anio),
    valor: normalizarNumero(fila.valor), // null se conserva (nunca 0)
    unidad: normalizarTexto(fila.unidad),
    fuente_url: normalizarTexto(fila.fuente_url),
    fecha_extraccion: fechaUTC(fila.fecha_extraccion),
    licencia: normalizarTexto(fila.licencia),
    nota_fuente: normalizarNullable(fila.nota_fuente),
  };
}

// v1.4 · verificacion_oficial.csv (familias E, F, G, I): solo contrastan.
export function validarOficial(fila, indice) {
  const obligatorios = ["id_oficial", "familia", "nivel", "institucion", "titulo", "url", "fecha_publicacion", "fecha_captura", "tema", "tipo"];
  for (const campo of obligatorios) {
    if (!fila[campo] || String(fila[campo]).trim() === "") {
      return { valido: false, motivo: `fila ${indice}: falta ${campo}` };
    }
  }
  if (!/^N[1-6]$/.test(String(fila.nivel).trim())) return { valido: false, motivo: `fila ${indice}: nivel inválido (${fila.nivel})` };
  if (!esUrl(fila.url)) return { valido: false, motivo: `fila ${indice}: URL mal formada` };
  for (const campo of ["fecha_publicacion", "fecha_captura"]) {
    if (!esIsoFecha(fila[campo])) return { valido: false, motivo: `fila ${indice}: ${campo} no es ISO 8601` };
  }
  return { valido: true };
}

export function normalizarOficial(fila) {
  return {
    id_oficial: normalizarTexto(fila.id_oficial),
    familia: normalizarTexto(fila.familia),
    nivel: normalizarTexto(fila.nivel),
    institucion: normalizarTexto(fila.institucion),
    titulo: normalizarTexto(fila.titulo),
    url: normalizarTexto(fila.url),
    fecha_publicacion: fechaUTC(fila.fecha_publicacion),
    fecha_en_texto: fechaUTC(normalizarNullable(fila.fecha_en_texto)),
    fecha_captura: fechaUTC(fila.fecha_captura),
    tema: normalizarTexto(fila.tema),
    tipo: normalizarTexto(fila.tipo),
    descripcion: normalizarNullable(fila.descripcion),
    licencia: normalizarTexto(fila.licencia),
  };
}

// ---------- Orquestador ----------

export async function cargarPaquete(dataDir = config.dataDir) {
  const rawDir = path.join(dataDir, "raw");
  const outDir = path.join(dataDir, "processed");
  await mkdir(outDir, { recursive: true });

  const manifestRaw = await leer(path.join(rawDir, "manifest.json"));
  const manifest = manifestRaw ? JSON.parse(manifestRaw) : null;

  // 1) Integridad SHA-256: detiene la carga si algún archivo no coincide (M01).
  let verificacion = { ok: true, archivos: [] };
  if (manifest) {
    verificacion = await verificarManifest(manifest, dataDir);
    if (!verificacion.ok) {
      const fallos = verificacion.archivos.filter((a) => !a.coincide).map((a) => a.archivo).join(", ");
      throw new Error(`SHA-256 no coincide con manifest: ${fallos}`);
    }
  } else {
    log.warn("Sin manifest.json en raw/: se salta la verificación de integridad.");
  }

  // 2) Lectura y validación por archivo.
  const noticiasCsv = await leer(path.join(rawDir, "noticias.csv"));
  const indicadoresCsv = await leer(path.join(rawDir, "indicadores.csv"));
  const sbpCsv = await leer(path.join(rawDir, "sbp_series.csv"));
  const fuentesJson = await leer(path.join(rawDir, "fuentes.json"));
  const eventosJson = await leer(path.join(rawDir, "eventos.geojson"));
  const oficialCsv = await leer(path.join(rawDir, "verificacion_oficial.csv"));

  const rechazados = [];
  const reporte = {};

  const noticias = { validas: [], nulos: 0 };
  if (noticiasCsv !== null) {
    const { filas } = parsearCsv(noticiasCsv);
    reporte.noticias = { total: filas.length, validas: 0, rechazadas: 0, nulos: 0 };
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const v = validarNoticia(fila, i + 2);
      if (!v.valido) {
        rechazados.push({ archivo: "noticias.csv", fila: i + 2, motivo: v.motivo });
        reporte.noticias.rechazadas++;
        continue;
      }
      const n = normalizarNoticia(fila);
      const nulosFila = Object.values(n).filter((x) => x === null || x === "").length;
      reporte.noticias.nulos += nulosFila;
      noticias.validas.push(n);
      reporte.noticias.validas++;
    }
  }

  const indicadores = { validas: [] };
  if (indicadoresCsv !== null) {
    const { filas } = parsearCsv(indicadoresCsv);
    reporte.indicadores = { total: filas.length, validas: 0, rechazadas: 0, nulos: 0 };
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const v = validarIndicador(fila, i + 2);
      if (!v.valido) {
        rechazados.push({ archivo: "indicadores.csv", fila: i + 2, motivo: v.motivo });
        reporte.indicadores.rechazadas++;
        continue;
      }
      const n = normalizarIndicador(fila);
      if (n.valor === null) reporte.indicadores.nulos++;
      indicadores.validas.push(n);
      reporte.indicadores.validas++;
    }
  }

  const sbp = { validas: [] };
  if (sbpCsv !== null) {
    const { filas } = parsearCsv(sbpCsv);
    reporte.sbp = { total: filas.length, validas: 0, rechazadas: 0 };
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const v = validarSbp(fila, i + 2);
      if (!v.valido) {
        rechazados.push({ archivo: "sbp_series.csv", fila: i + 2, motivo: v.motivo });
        reporte.sbp.rechazadas++;
        continue;
      }
      sbp.validas.push({
        informe: normalizarTexto(fila.informe),
        serie: normalizarTexto(fila.serie),
        periodo: normalizarTexto(fila.periodo),
        valor: normalizarNumero(fila.valor),
        unidad: normalizarTexto(fila.unidad),
        pagina: normalizarTexto(fila.pagina),
        fuente_url: normalizarTexto(fila.fuente_url),
        fecha_extraccion: fechaUTC(fila.fecha_extraccion),
        condiciones: normalizarTexto(fila.condiciones),
      });
      reporte.sbp.validas++;
    }
  }

  let fuentes = [];
  if (fuentesJson !== null) {
    try {
      fuentes = JSON.parse(fuentesJson);
      if (!Array.isArray(fuentes)) throw new Error("fuentes.json debe ser un arreglo");
      reporte.fuentes = { total: fuentes.length };
    } catch (e) {
      rechazados.push({ archivo: "fuentes.json", fila: 1, motivo: e.message });
    }
  }

  const oficiales = { validas: [] };
  if (oficialCsv !== null) {
    const { filas } = parsearCsv(oficialCsv);
    reporte.oficiales = { total: filas.length, validas: 0, rechazadas: 0 };
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const v = validarOficial(fila, i + 2);
      if (!v.valido) {
        rechazados.push({ archivo: "verificacion_oficial.csv", fila: i + 2, motivo: v.motivo });
        reporte.oficiales.rechazadas++;
        continue;
      }
      oficiales.validas.push(normalizarOficial(fila));
      reporte.oficiales.validas++;
    }
  }

  let eventos = [];
  if (eventosJson !== null) {
    try {
      const geojson = JSON.parse(eventosJson);
      eventos = geojson?.features || [];
      reporte.eventos = { total: eventos.length };
    } catch (e) {
      rechazados.push({ archivo: "eventos.geojson", fila: 1, motivo: e.message });
    }
  }

  // 3) Persistir salidas versionadas (processed/).
  await writeFile(path.join(outDir, "registros.json"), JSON.stringify({ noticias: noticias.validas, indicadores: indicadores.validas, sbp: sbp.validas, fuentes, eventos, oficiales: oficiales.validas }, null, 2), "utf8");
  await writeFile(
    path.join(outDir, "rechazados.csv"),
    "archivo,fila,motivo\n" + rechazados.map((r) => `${r.archivo},${r.fila},"${r.motivo.replace(/"/g, '""')}"`).join("\n"),
    "utf8"
  );
  await writeFile(path.join(outDir, "reporte_calidad.json"), JSON.stringify(reporte, null, 2), "utf8");

  log.ok(`Cargado: ${noticias.validas.length} noticias, ${indicadores.validas.length} indicadores, ${sbp.validas.length} series SBP, ${fuentes.length} fuentes, ${eventos.length} eventos`);
  log.info(`Cuarentena: ${rechazados.length} filas rechazadas con motivo`);

  return {
    manifest,
    verificacion,
    noticias: noticias.validas,
    indicadores: indicadores.validas,
    sbp: sbp.validas,
    fuentes,
    eventos,
    oficiales: oficiales.validas,
    rechazados,
    reporte,
  };
}
