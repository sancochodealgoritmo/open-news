#!/usr/bin/env node
// Migra data/processed y data/raw → MySQL (base open_news). Idempotente (trunca y recarga).
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "open_news",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "open_news",
});

const iso = (d) => (d ? String(d).replace("T", " ").replace("Z", "").slice(0, 19) : null);
const j = (v) => JSON.stringify(v ?? null);
const nn = (v) => (v === undefined ? null : v);

async function truncar() {
  const tablas = [
    "senales_ficha", "fichas", "citas", "afirmaciones", "evento_noticias", "eventos",
    "sismos", "noticias", "fuentes", "indicadores", "oficiales", "capturas",
  ];
  for (const t of tablas) await conn.query(`TRUNCATE TABLE ${t}`);
}

async function migrar() {
  await truncar();
  const reg = JSON.parse(await readFile(path.join(dataDir, "processed/registros.json"), "utf8"));

  for (const f of reg.fuentes || []) {
    await conn.execute(
      "INSERT INTO fuentes (medio, familia, nivel) VALUES (?,?,?)",
      [f.medio || "desconocido", f.familia || "A", nn(f.nivel)]
    );
  }
  console.log("fuentes OK:", (reg.fuentes || []).length);

  for (const n of reg.noticias || []) {
    await conn.execute(
      `INSERT INTO noticias (id_noticia,id_estable,titulo,url,url_canonica,medio,dominio,idioma,fecha_publicacion,fecha_deteccion,fecha_extraccion,tema,origen,alcance_texto,descripcion,procedencia,id_evento)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [n.id_noticia, n.id_estable, n.titulo, n.url, n.url_canonica, n.medio, n.dominio, n.idioma,
        iso(n.fecha_publicacion), iso(n.fecha_deteccion), iso(n.fecha_extraccion), n.tema, n.origen,
        n.alcance_texto, nn(n.descripcion), nn(n.procedencia), nn(n.id_evento)]
    );
  }
  console.log("noticias OK:", (reg.noticias || []).length);

  for (const feat of reg.eventos || []) {
    const p = feat.properties || {};
    const coords = feat.geometry?.coordinates;
    const lon = coords?.[0] ?? null;
    const lat = coords?.[1] ?? null;
    const depth = coords?.[2] ?? null;
    await conn.execute(
      "INSERT INTO sismos (id,mag,place,time_ms,url,lon,lat,depth,type) VALUES (?,?,?,?,?,?,?,?,?)",
      [String(feat.id || p.ids || "").slice(0, 64), nn(p.mag), p.place || "", nn(p.time), p.url || "", lon, lat, depth, p.type || ""]
    );
  }
  console.log("sismos OK:", (reg.eventos || []).length);

  const eventos = (await readFile(path.join(dataDir, "processed/eventos.jsonl"), "utf8"))
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const e of eventos) {
    await conn.execute(
      `INSERT INTO eventos (id_evento,n_notas,n_procedencias,fecha_original,fecha_publicacion,fecha_deteccion,tema,geo,contradiccion_abierta,es_recirculacion,fecha_conocida,vinculo_oficial,fuente_primaria,texto_disponible,hito_proximo_7dias,impacto_nivel,impacto_citado,miembros,titulos,medios,dominios,filtro,contexto_oficial)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [e.id_evento, nn(e.n_notas), nn(e.n_procedencias), iso(e.fecha_original), iso(e.fecha_publicacion), iso(e.fecha_deteccion),
        e.tema || "", e.geo || "", e.contradiccion_abierta ? 1 : 0, e.es_recirculacion ? 1 : 0, e.fecha_conocida ? 1 : 0,
        e.vinculo_oficial ? 1 : 0, e.fuente_primaria ? 1 : 0, e.texto_disponible ? 1 : 0, e.hito_proximo_7dias ? 1 : 0,
        nn(e.impacto?.nivel), e.impacto?.citado ? 1 : 0, j(e.miembros), j(e.titulos), j(e.medios), j(e.dominios), j(e.filtro), j(e.contexto_oficial)]
    );
    for (const m of e.miembros || []) {
      const idn = typeof m === "string" ? m : m?.id_noticia;
      if (idn) await conn.execute("INSERT INTO evento_noticias (id_evento,id_noticia) VALUES (?,?)", [e.id_evento, idn]);
    }
    for (const a of e.afirmaciones || []) {
      await conn.execute(
        "INSERT INTO afirmaciones (id_evento,tipo,texto,cifra,unidad,periodo,pasaje,cita_valida,es_central) VALUES (?,?,?,?,?,?,?,?,?)",
        [e.id_evento, a.tipo, a.texto, nn(a.cifra), nn(a.unidad), nn(a.periodo), a.pasaje || "", a.cita_valida ? 1 : 0, a.es_central ? 1 : 0]
      );
      for (const c of a.citas || []) {
        await conn.execute("INSERT INTO citas (id_evento,id_evidencia,pasaje) VALUES (?,?,?)", [e.id_evento, c, a.pasaje || ""]);
      }
    }
  }
  console.log("eventos OK:", eventos.length);

  let nFichas = 0;
  for (const mod of ["principal", "digital", "banca"]) {
    const b = JSON.parse(await readFile(path.join(dataDir, `processed/bandejas/${mod}.json`), "utf8"));
    const todas = [...(b.bandeja || []), ...(b.verificacion || [])];
    for (const f of todas) {
      const c = f.componentes || {};
      await conn.execute(
        `INSERT INTO fichas (id_caso,id_evento,modalidad,tema,P,R,I,U,N,E,banda,version_reglas,estado_evidencia,estado_revision,ruta_fd,nivel_atencion,alcance_texto,corresponde_aviso,resumen,accion_recomendada,liberacion,ficha_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [f.id_caso, nn(f.id_evento), f.modalidad, f.tema || "", nn(f.puntaje), nn(c.R), nn(c.I), nn(c.U), nn(c.N), nn(c.E),
          f.banda || "", f.version_reglas || "", f.estado_evidencia || "", f.estado_revision || "nuevo",
          f.ruta_fd || "pasa", f.nivel_atencion || "", f.alcance_texto || "", f.corresponde_aviso ? 1 : 0,
          f.resumen || "", f.accion_recomendada || "", j(f.liberacion), j(f)]
      );
      for (const s of f.senales_detalle || []) {
        await conn.execute(
          "INSERT IGNORE INTO senales_ficha (id_ficha,codigo,nivel,origen,razon) VALUES (?,?,?,?,?)",
          [f.id_caso, s.codigo || "", s.nivel || "", s.origen || "", s.razon || ""]
        );
      }
      nFichas++;
    }
  }
  console.log("fichas OK:", nFichas);

  const [rows] = await conn.query(
    `SELECT
      (SELECT COUNT(*) FROM noticias) AS noticias,
      (SELECT COUNT(*) FROM sismos) AS sismos,
      (SELECT COUNT(*) FROM fuentes) AS fuentes,
      (SELECT COUNT(*) FROM eventos) AS eventos,
      (SELECT COUNT(*) FROM evento_noticias) AS evento_noticias,
      (SELECT COUNT(*) FROM afirmaciones) AS afirmaciones,
      (SELECT COUNT(*) FROM citas) AS citas,
      (SELECT COUNT(*) FROM fichas) AS fichas,
      (SELECT COUNT(*) FROM senales_ficha) AS senales_ficha`
  );
  console.log("Conteos por tabla:", JSON.stringify(rows));
  await conn.end();
}

migrar().catch((e) => {
  console.error("Migración falló:", e.message);
  process.exit(1);
});
