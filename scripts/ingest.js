#!/usr/bin/env node
// S0 · Extractores + snapshot (fuera de línea). Descarga TVN RSS, GDELT DOC 2.0,
// Banco Mundial API v2 y USGS; escribe noticias.csv, fuentes.json,
// indicadores.csv, eventos.geojson y manifest.json con SHA-256. SBP es manual.
import { writeFile, mkdir, readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { log } from "../src/utils/logger.js";
import { urlCanonica, idEstable, normalizarTexto } from "../src/utils/normalize.js";
import { upsertFuente, upsertNoticia, upsertSismo, upsertIndicador, registrarCaptura } from "../src/db/writers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(config.dataDir, "raw");

const WB_PAISES = ["PAN", "CRI", "COL", "DOM", "MEX", "GTM"];
const WB_INDICADORES = {
  "NY.GDP.MKTP.KD.ZG": "PIB crecimiento (% anual)",
  "FP.CPI.TOTL.ZG": "Inflación (% anual)",
  "SL.UEM.TOTL.ZS": "Desempleo (% de la PEA)",
  "SP.POP.TOTL": "Población total",
  "IT.NET.USER.ZS": "Uso de internet (% de la población)",
  "NE.EXP.GNFS.ZS": "Exportaciones (% del PIB)",
};

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

function extraerItemsRss(xml) {
  const items = [];
  const bloques = String(xml).split(/<item[^>]*>/i).slice(1);
  for (const b of bloques) {
    const campo = (tag) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
    };
    const titulo = campo("title");
    const link = campo("link");
    if (!titulo || !link) continue;
    items.push({ titulo, url: link, fecha_publicacion: campo("pubDate"), descripcion: campo("description") });
  }
  return items;
}

async function ingestarRss(url, medio = "TVN") {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const xml = await res.text();
  return extraerItemsRss(xml).map((it) => ({
    id_noticia: idEstable(it.url) || it.url,
    titulo: it.titulo,
    url: it.url,
    url_canonica: urlCanonica(it.url),
    medio,
    idioma: "es",
    fecha_publicacion: it.fecha_publicacion ? new Date(it.fecha_publicacion).toISOString() : "",
    fecha_deteccion: new Date().toISOString(),
    fecha_extraccion: new Date().toISOString(),
    tema: "otros",
    origen: "TVN RSS",
    alcance_texto: "titular/metadatos",
    descripcion: it.descripcion,
  }));
}

async function ingestarGdelt(query = "Panama") {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=250`;
  const data = await fetchJson(url);
  const arts = data?.articles || [];
  return arts.map((a) => ({
    id_noticia: idEstable(a.url) || a.url,
    titulo: normalizarTexto(a.title),
    url: a.url,
    url_canonica: urlCanonica(a.url),
    medio: a.domain || "desconocido",
    idioma: a.language || "es",
    fecha_publicacion: a.seendate ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}T00:00:00Z` : "",
    fecha_deteccion: a.seendate ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}T00:00:00Z` : "",
    fecha_extraccion: new Date().toISOString(),
    tema: "otros",
    origen: "GDELT DOC 2.0",
    alcance_texto: "titular/metadatos",
    descripcion: "",
  }));
}

async function ingestarBancoMundial() {
  const filas = [];
  for (const [indicador, unidad] of Object.entries(WB_INDICADORES)) {
    const url = `https://api.worldbank.org/v2/country/${WB_PAISES.join(";")}/indicator/${indicador}?date=2010:2024&format=json&per_page=10000`;
    const data = await fetchJson(url);
    const paginas = data?.[1] || [];
    for (const r of paginas) {
      filas.push({
        pais_iso3: r.country?.id || r.countryiso3code,
        indicador_id: indicador,
        anio: r.date,
        valor: r.value === null || r.value === undefined ? "" : String(r.value),
        unidad,
        fuente_url: url,
        fecha_extraccion: new Date().toISOString(),
        licencia: "CC BY 4.0",
      });
    }
  }
  return filas;
}

async function ingestarUsgs() {
  const url = "https://earthquake.usgs.gov/fdsnws/event/1/query.geojson?starttime=2024-01-01&endtime=2024-12-31&minlatitude=5&maxlatitude=12&minlongitude=-86&maxlongitude=-76&minmagnitude=3";
  return fetchJson(url);
}

function aCsv(encabezados, filas) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [encabezados.join(","), ...filas.map((f) => encabezados.map((c) => esc(f[c] ?? "")).join(","))].join("\n");
}

async function existe(ruta) {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

// Persistencia en MySQL (sistema de registro). Los archivos quedan como respaldo.
async function persistirMySQL({ unicas, fuentes, eventos, indicadores }) {
  for (const f of fuentes) await upsertFuente(f);
  for (const n of unicas) await upsertNoticia(n);
  const sismos = eventos?.features || [];
  for (const feat of sismos) await upsertSismo(feat);
  for (const i of indicadores) await upsertIndicador(i);
  await registrarCaptura({ origen: "ingest", items: unicas.length, nuevos: unicas.length, actualizados: 0, rechazados: 0 });
  log.ok(`MySQL: ${unicas.length} noticias, ${sismos.length} sismos, ${fuentes.length} fuentes, ${indicadores.length} indicadores.`);
}

async function main() {
  await mkdir(rawDir, { recursive: true });
  const noticias = [];

  const rssUrl = process.env.TVN_RSS_URL;
  if (rssUrl) {
    try {
      const items = await ingestarRss(rssUrl);
      noticias.push(...items);
      log.ok(`TVN RSS: ${items.length} noticias`);
    } catch (e) {
      log.warn("TVN RSS omitido:", e.message);
    }
  } else {
    log.warn("TVN_RSS_URL no definido: se omite el RSS (usa TVN_RSS_URL=https://www.tvn-2.com/rss.xml).");
  }

  try {
    const gdelt = await ingestarGdelt();
    noticias.push(...gdelt);
    log.ok(`GDELT: ${gdelt.length} noticias`);
  } catch (e) {
    log.warn("GDELT omitido:", e.message);
  }

  // Dedup por URL canónica.
  const vistos = new Set();
  const unicas = noticias.filter((n) => {
    const k = n.url_canonica || n.url;
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  let indicadores = [];
  try {
    indicadores = await ingestarBancoMundial();
    log.ok(`Banco Mundial: ${indicadores.length} filas`);
  } catch (e) {
    log.warn("Banco Mundial omitido:", e.message);
  }

  let eventos = { type: "FeatureCollection", features: [] };
  try {
    eventos = await ingestarUsgs();
    log.ok(`USGS: ${eventos.features?.length || 0} eventos`);
  } catch (e) {
    log.warn("USGS omitido:", e.message);
  }

  const fuentes = [...new Set(unicas.map((n) => n.medio || "desconocido"))].map((medio) => ({
    medio,
    dominio: "",
    familia: "A",
    licencia: "solo metadatos",
    redistribucion: "solo metadatos",
  }));

  const archivos = {};
  if (unicas.length > 0) {
    archivos["noticias.csv"] = aCsv(["id_noticia", "titulo", "url", "medio", "idioma", "fecha_publicacion", "fecha_deteccion", "fecha_extraccion", "tema", "origen", "alcance_texto", "descripcion"], unicas);
  }
  archivos["fuentes.json"] = JSON.stringify(fuentes, null, 2);
  if (indicadores.length > 0) {
    archivos["indicadores.csv"] = aCsv(["pais_iso3", "indicador_id", "anio", "valor", "unidad", "fuente_url", "fecha_extraccion", "licencia"], indicadores);
  }
  archivos["eventos.geojson"] = JSON.stringify(eventos, null, 2);

  const manifest = {
    version: "Panamá · Señales y Evidencias v1",
    fecha_corte_UTC: new Date().toISOString(),
    licencia_condiciones: "Noticias: solo metadatos. Banco Mundial: CC BY 4.0. USGS: dominio público.",
    archivos: [],
  };

  for (const [nombre, contenido] of Object.entries(archivos)) {
    await writeFile(path.join(rawDir, nombre), contenido, "utf8");
    manifest.archivos.push({
      archivo: nombre,
      cantidad: nombre === "noticias.csv" ? unicas.length : nombre === "indicadores.csv" ? indicadores.length : 1,
      sha256: createHash("sha256").update(contenido).digest("hex"),
    });
  }

  // SBP es una extensión manual: se incluye si el usuario ya dejó el CSV en raw/.
  if (await existe(path.join(rawDir, "sbp_series.csv"))) {
    const buf = await readFile(path.join(rawDir, "sbp_series.csv"));
    manifest.archivos.push({ archivo: "sbp_series.csv", cantidad: 12, sha256: createHash("sha256").update(buf).digest("hex") });
  }

  await writeFile(path.join(rawDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  log.ok(`Snapshot guardado en ${rawDir} (${unicas.length} noticias únicas).`);

  // Persistir en MySQL (sistema de registro). Los archivos quedan como respaldo.
  try {
    await persistirMySQL({ unicas, fuentes, eventos, indicadores });
  } catch (e) {
    log.warn("Escritura a MySQL omitida:", e.message);
  }

  log.info("Ejecuta `npm run load` y luego `npm run precache`.");
}

main().catch((e) => {
  log.error("ingest falló:", e.message);
  process.exit(1);
});
