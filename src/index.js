// open-news v1.4 · Copiloto «De la señal a la decisión» — TVN Media.
// Servidor Express: landing + espacios por módulo (/principal, /digital, /banca),
// API por módulo, filtro S3F (bandeja de verificación) y revisión humana.
// La capa de datos de la demo es LOCAL (ARQ-12); Notion es registro y presentación.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { config } from "./config.js";
import { log } from "./utils/logger.js";
import { leerLineas } from "./store/index.js";
import { dbQuery, dbDisponible } from "./db/index.js";
import { consultar, producirBorrador, esModalidad, construirEvidenciasDeEvento, PRODUCTOS } from "./products/index.js";
import { aplicarTransicion, guardarRevision, historialRevisiones } from "./review/stateMachine.js";
import { aplicarLiberacion, puedeProducir } from "./filter/index.js";
import { syncSeguro } from "./notion/sync.js";
import { snapshotMotor } from "./llm/telemetry.js";
import {
  inicializarConfig,
  estadoConfig,
  configPublica,
  guardarAjustes,
  restablecerConfig,
  sincronizarNotion,
} from "./config/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));

const estado = {
  bandejas: {}, // { principal: { bandeja, verificacion, retenidos }, ... }
  fichas: new Map(),
  eventos: new Map(),
  corpus: [],
  metricas: {},
};

const MODULOS = Object.fromEntries(
  Object.entries(PRODUCTOS).map(([slug, p]) => [slug, { slug, nombre: p.nombre, color: config.paleta.modulos[slug] || config.paleta.primario }])
);

function filtroDeFicha(f) {
  return {
    ruta_fd: f.ruta_fd || "pasa",
    nivel_atencion: f.nivel_atencion || "sin_senales",
    senales: f.senales_detalle || [],
    verificaciones_pendientes: f.verificaciones_pendientes || [],
    liberacion: f.liberacion || null,
  };
}

function aplicarFiltroAFicha(f, filtro) {
  f.ruta_fd = filtro.ruta_fd;
  f.nivel_atencion = filtro.nivel_atencion;
  f.senales_detalle = filtro.senales;
  f.verificaciones_pendientes = filtro.verificaciones_pendientes;
  f.liberacion = filtro.liberacion;
}

// Carga bandejas y eventos desde MySQL (sistema de registro). Devuelve false
// si no hay datos o la BD no está disponible (para caer al respaldo de archivos).
async function cargarPrecacheMySQL() {
  if (!(await dbDisponible())) return false;
  try {
    const filas = await dbQuery("SELECT modalidad, ficha_json, ruta_fd FROM fichas");
    if (!filas.length) return false;
    const por = {};
    for (const fila of filas) {
      let ficha;
      try { ficha = JSON.parse(fila.ficha_json); } catch { continue; }
      if (!por[fila.modalidad]) por[fila.modalidad] = { bandeja: [], verificacion: [], retenidos: 0 };
      const mod = por[fila.modalidad];
      if (fila.ruta_fd === "retenido" && !ficha.liberacion) mod.verificacion.push(ficha);
      else mod.bandeja.push(ficha);
    }
    const cmp = (a, b) =>
      (b.puntaje - a.puntaje) ||
      ((b.componentes?.U ?? 0) - (a.componentes?.U ?? 0)) ||
      String(a.id_caso).localeCompare(String(b.id_caso));
    for (const slug of Object.keys(PRODUCTOS)) {
      const mod = por[slug] || { bandeja: [], verificacion: [], retenidos: 0 };
      mod.bandeja.sort(cmp);
      mod.verificacion.sort(cmp);
      mod.retenidos = mod.verificacion.length;
      estado.bandejas[slug] = mod;
      for (const f of [...mod.bandeja, ...mod.verificacion]) estado.fichas.set(f.id_caso, f);
    }
    const eventos = await dbQuery("SELECT * FROM eventos");
    for (const e of eventos) {
      const ev = {
        ...e,
        impacto: { nivel: e.impacto_nivel, citado: Boolean(e.impacto_citado) },
        miembros: JSON.parse(e.miembros || "null") || [],
        titulos: JSON.parse(e.titulos || "null") || [],
        medios: JSON.parse(e.medios || "null") || [],
        dominios: JSON.parse(e.dominios || "null") || [],
        filtro: JSON.parse(e.filtro || "null") || {},
        contexto_oficial: JSON.parse(e.contexto_oficial || "null") || [],
      };
      estado.eventos.set(ev.id_evento, ev);
      estado.corpus.push(...(ev.miembros || []));
    }
    return true;
  } catch {
    return false;
  }
}

async function cargarPrecache() {
  if (await cargarPrecacheMySQL()) {
    log.info("Datos cargados desde MySQL.");
    try { estado.metricas = JSON.parse(await readFile(path.join(config.dataDir, "processed", "metricas.json"), "utf8")); } catch { /* sin métricas */ }
    return;
  }
  const base = path.join(config.dataDir, "processed");
  for (const slug of Object.keys(PRODUCTOS)) {
    try {
      const txt = await readFile(path.join(base, "bandejas", `${slug}.json`), "utf8");
      const data = JSON.parse(txt);
      const mod = Array.isArray(data) ? { bandeja: data, verificacion: [], retenidos: 0 } : data;
      estado.bandejas[slug] = mod;
      for (const f of [...(mod.bandeja || []), ...(mod.verificacion || [])]) estado.fichas.set(f.id_caso, f);
    } catch {
      estado.bandejas[slug] = { bandeja: [], verificacion: [], retenidos: 0 };
    }
  }
  try {
    const eventos = await leerLineas("eventos.jsonl");
    for (const e of eventos) {
      estado.eventos.set(e.id_evento, e);
      estado.corpus.push(...(e.miembros || []));
    }
  } catch { /* sin eventos */ }
  try {
    estado.metricas = JSON.parse(await readFile(path.join(base, "metricas.json"), "utf8"));
  } catch { /* sin métricas */ }
}

function fichaDe(id) {
  return estado.fichas.get(id) || estado.eventos.get(id) || null;
}

function rutaModulo(req, res, next) {
  const m = req.params.modulo;
  if (!esModalidad(m)) return res.status(404).json({ error: "módulo no encontrado" });
  req.modulo = m;
  next();
}

// ---------- Estado y módulos ----------

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), env: config.env, ts: new Date().toISOString() });
});

app.get("/api/estado", (req, res) => {
  res.json({
    snapshot: estado.metricas.fecha_corte || config.fechaCorte || null,
    version_reglas: config.rulesVersion,
    modo_offline: config.modoOffline,
    modulos: Object.values(MODULOS),
    retenidos: Object.fromEntries(Object.entries(estado.bandejas).map(([m, b]) => [m, b.retenidos || 0])),
    motor: snapshotMotor(),
  });
});

app.get("/api/modulos", (req, res) => res.json(Object.values(MODULOS)));

// ---------- API por módulo ----------

app.get("/api/:modulo/bandeja", rutaModulo, (req, res) => {
  const mod = estado.bandejas[req.modulo] || { bandeja: [], verificacion: [], retenidos: 0 };
  const top = Number(req.query.top) || config.modalidades[req.modulo].tamanioBandeja;
  res.json({ modulo: req.modulo, version: config.rulesVersion, total: mod.bandeja.length, retenidos: mod.retenidos || 0, bandeja: mod.bandeja.slice(0, top) });
});

app.get("/api/:modulo/verificacion", rutaModulo, (req, res) => {
  const mod = estado.bandejas[req.modulo] || { verificacion: [] };
  res.json({ modulo: req.modulo, eventos: mod.verificacion || [] });
});

app.post("/api/:modulo/verificacion/:id", rutaModulo, async (req, res) => {
  try {
    const ficha = fichaDe(req.params.id);
    if (!ficha) return res.status(404).json({ error: "ficha no encontrada" });
    const filtro = filtroDeFicha(ficha);
    const nuevo = aplicarLiberacion(filtro, { accion: req.body.accion, motivo: req.body.motivo, persona: req.body.persona });
    aplicarFiltroAFicha(ficha, nuevo);
    // Reencauza el evento entre bandeja y verificación en memoria.
    const mod = estado.bandejas[req.modulo] || { bandeja: [], verificacion: [] };
    mod.verificacion = (mod.verificacion || []).filter((x) => x.id_caso !== ficha.id_caso);
    if (nuevo.ruta_fd !== "retenido" && req.body.accion === "liberar") mod.bandeja.push(ficha);
    mod.retenidos = mod.verificacion.length;
    // Solo anexar: la liberación/descarte queda registrada en local y en Notion.
    const revision = { id_caso: ficha.id_caso, desde: null, hacia: req.body.accion === "liberar" ? "liberación FD" : "descarte FD", quien: "persona", persona: req.body.persona, detalle: { motivo: req.body.motivo } };
    await guardarRevision(revision);
    syncSeguro(ficha, revision).catch(() => {});
    res.json({ ok: true, filtro: nuevo });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/:modulo/ficha/:id", rutaModulo, (req, res) => {
  const ficha = fichaDe(req.params.id);
  if (!ficha) return res.status(404).json({ error: "ficha no encontrada" });
  res.json(ficha);
});

app.post("/api/:modulo/consulta", rutaModulo, async (req, res) => {
  try {
    const respuesta = await consultar(req.body.consulta, estado.corpus, {
      modalidad: req.modulo,
      evidenciasDe: (() => {
        let n = 0;
        return (m) => [{ id: `E${++n}`, ref: `NOT:${m.id_estable}:titulo`, pasaje: m.titulo, texto: m.descripcion || "", alcance: m.alcance_texto }];
      })(),
    });
    res.json(respuesta);
  } catch (e) {
    res.status(500).json({ error: e.message, requiereEvidencia: e.requiereEvidencia || false });
  }
});

app.post("/api/:modulo/ficha/:id/entregable", rutaModulo, async (req, res) => {
  try {
    const ficha = fichaDe(req.params.id);
    if (!ficha) return res.status(404).json({ error: "ficha no encontrada" });
    const filtro = filtroDeFicha(ficha);
    if (!puedeProducir(filtro)) {
      return res.status(409).json({ error: "evento retenido por el filtro: requiere liberación humana (V11)", requiereEvidencia: true });
    }
    const evento = estado.eventos.get(ficha.id_caso);
    const evidencias = evento ? construirEvidenciasDeEvento(evento) : ficha.citas;
    const { borrador, validacion, verificacion } = await producirBorrador({ ficha, evidencias, modalidad: req.modulo, filtro });
    ficha.borrador = borrador; // para el export
    res.json({ ok: true, borrador, validacion, verificacion });
  } catch (e) {
    res.status(400).json({ error: e.message, requiereEvidencia: e.requiereEvidencia || false });
  }
});

app.post("/api/:modulo/ficha/:id/revision", rutaModulo, async (req, res) => {
  try {
    const ficha = fichaDe(req.params.id);
    if (!ficha) return res.status(404).json({ error: "ficha no encontrada" });
    const desde = ficha.estado_revision || "nuevo";
    const resultado = aplicarTransicion({
      id_caso: ficha.id_caso,
      desde,
      hacia: req.body.hacia,
      persona: req.body.persona,
      detalle: { ...(req.body.detalle || {}), estado_evidencia: ficha.estado_evidencia },
    });
    if (!resultado.ok) return res.status(400).json({ error: resultado.error });
    await guardarRevision(resultado.revision);
    ficha.estado_revision = resultado.revision.hacia;
    syncSeguro(ficha, resultado.revision).catch(() => {});
    res.json({ ok: true, revision: resultado.revision });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/:modulo/ficha/:id/exportar", rutaModulo, (req, res) => {
  const ficha = fichaDe(req.params.id);
  if (!ficha) return res.status(404).json({ error: "ficha no encontrada" });
  const borrador = ficha.borrador ? `\n\n${JSON.stringify(ficha.borrador, null, 2)}` : "";
  const md = [
    `# ${ficha.id_caso} · ${ficha.tema}`,
    `Ruta del filtro: ${ficha.ruta_fd} · Evidencia: ${ficha.estado_evidencia} · RIUNE ${ficha.version_reglas}: P=${ficha.puntaje} (${ficha.banda})`,
    `Borrador — sujeto a revisión${borrador}`,
  ].join("\n\n");
  res.set("Content-Type", "text/markdown");
  res.set("Content-Disposition", `attachment; filename="${ficha.id_caso}.md"`);
  res.send(md);
});

app.get("/api/revisiones/:id", async (req, res) => {
  res.json(await historialRevisiones(req.params.id));
});

app.get("/api/metricas", (req, res) => res.json(estado.metricas));

// ---------- Backend de configuración (ARQ-15) ----------

app.get("/api/config", (req, res) => res.json(configPublica()));

// Salud del catálogo de feeds (paso 15).
app.get("/api/feeds", async (req, res) => {
  let ultima_captura = null;
  try {
    const filas = await dbQuery("SELECT fecha_utc, origen, http_status, items, nuevos, actualizados, rechazados, error FROM capturas ORDER BY id DESC LIMIT 1");
    ultima_captura = filas[0] || null;
  } catch { /* sin BD */ }
  res.json({ feeds: configPublica().feeds, ultima_captura });
});

app.get("/api/admin/config", (req, res) => {
  res.json({ ...estadoConfig(), notion: null });
});

app.put("/api/admin/config", async (req, res) => {
  try {
    res.json(await guardarAjustes(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/admin/config/restablecer", async (req, res) => {
  try {
    res.json(await restablecerConfig());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/config/sync", async (req, res) => {
  try {
    res.json(await sincronizarNotion());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Landing y espacios por módulo ----------

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "admin.html")));
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
for (const slug of Object.keys(PRODUCTOS)) {
  app.get(`/${slug}`, (req, res) => res.sendFile(path.join(__dirname, "..", "public", "workspace.html")));
}

cargarPrecache().then(async () => {
  await inicializarConfig().catch((e) => log.warn("Config: arranque con DEFAULTS:", e.message));
  app.listen(config.port, "127.0.0.1", () => {
    log.ok(`open-news v1.4 escuchando en http://127.0.0.1:${config.port}`);
    log.info(`Módulos: ${Object.keys(estado.bandejas).join(", ") || "ninguno (ejecuta npm run demo)"}`);
  });
});

process.on("unhandledRejection", (e) => log.error("UnhandledRejection:", e));
process.on("uncaughtException", (e) => log.error("UncaughtException:", e));
