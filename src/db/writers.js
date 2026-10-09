// Escritores (upsert) hacia MySQL. El pipeline escribe directo a la BD;
// los archivos data/ quedan como respaldo/corpus reproducible.
import { dbExecute } from "./index.js";

const iso = (d) => (d ? String(d).replace("T", " ").replace("Z", "").slice(0, 19) : null);

export async function upsertFuente(f) {
  await dbExecute(
    `INSERT INTO fuentes (medio, familia, nivel) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE familia=VALUES(familia), nivel=VALUES(nivel)`,
    [f.medio || "desconocido", f.familia || "A", f.nivel ?? null]
  );
}

export async function upsertNoticia(n) {
  await dbExecute(
    `INSERT INTO noticias (id_noticia,id_estable,titulo,url,url_canonica,medio,dominio,idioma,fecha_publicacion,fecha_deteccion,fecha_extraccion,tema,origen,alcance_texto,descripcion,procedencia,id_evento)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), url=VALUES(url), descripcion=VALUES(descripcion), fecha_extraccion=VALUES(fecha_extraccion)`,
    [n.id_noticia ?? null, n.id_estable ?? null, n.titulo ?? "", n.url ?? "", n.url_canonica ?? null,
      n.medio ?? null, n.dominio ?? null, n.idioma ?? null,
      iso(n.fecha_publicacion), iso(n.fecha_deteccion), iso(n.fecha_extraccion),
      n.tema ?? null, n.origen ?? null, n.alcance_texto ?? null, n.descripcion ?? null,
      n.procedencia ?? null, n.id_evento ?? null]
  );
}

export async function upsertSismo(feat) {
  const p = feat.properties || {};
  const coords = feat.geometry?.coordinates;
  await dbExecute(
    `INSERT INTO sismos (id,mag,place,time_ms,url,lon,lat,depth,type) VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE mag=VALUES(mag), time_ms=VALUES(time_ms)`,
    [String(feat.id || p.ids || "").slice(0, 64), p.mag ?? null, p.place || "", p.time ?? null, p.url || "",
      coords?.[0] ?? null, coords?.[1] ?? null, coords?.[2] ?? null, p.type || ""]
  );
}

export async function upsertIndicador(i) {
  await dbExecute(
    `INSERT INTO indicadores (pais_iso3,indicador_id,anio,valor,unidad,fuente_url,fecha_extraccion,licencia)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE valor=VALUES(valor), unidad=VALUES(unidad)`,
    [i.pais_iso3, i.indicador_id, Number(i.anio), i.valor ?? null, i.unidad ?? null, i.fuente_url ?? null, iso(i.fecha_extraccion), i.licencia ?? null]
  );
}

export async function registrarCaptura(c) {
  await dbExecute(
    `INSERT INTO capturas (fecha_utc,origen,http_status,bytes,sha256,items,nuevos,actualizados,rechazados,error)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [iso(new Date().toISOString()), c.origen, c.http_status ?? null, c.bytes ?? null, c.sha256 ?? null,
      c.items ?? null, c.nuevos ?? null, c.actualizados ?? null, c.rechazados ?? null, c.error ?? null]
  );
}

const j = (v) => JSON.stringify(v ?? null);

export async function upsertEvento(e) {
  await dbExecute(
    `INSERT INTO eventos (id_evento,n_notas,n_procedencias,fecha_original,fecha_publicacion,fecha_deteccion,tema,geo,contradiccion_abierta,es_recirculacion,fecha_conocida,vinculo_oficial,fuente_primaria,texto_disponible,hito_proximo_7dias,impacto_nivel,impacto_citado,miembros,titulos,medios,dominios,filtro,contexto_oficial)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE n_notas=VALUES(n_notas), n_procedencias=VALUES(n_procedencias), tema=VALUES(tema), filtro=VALUES(filtro), contexto_oficial=VALUES(contexto_oficial)`,
    [e.id_evento, e.n_notas ?? null, e.n_procedencias ?? null, iso(e.fecha_original), iso(e.fecha_publicacion), iso(e.fecha_deteccion),
      e.tema || "", e.geo || "", e.contradiccion_abierta ? 1 : 0, e.es_recirculacion ? 1 : 0, e.fecha_conocida ? 1 : 0,
      e.vinculo_oficial ? 1 : 0, e.fuente_primaria ? 1 : 0, e.texto_disponible ? 1 : 0, e.hito_proximo_7dias ? 1 : 0,
      e.impacto?.nivel ?? null, e.impacto?.citado ? 1 : 0, j(e.miembros), j(e.titulos), j(e.medios), j(e.dominios), j(e.filtro), j(e.contexto_oficial)]
  );
}

export async function upsertEventoNoticia(idEvento, idNoticia) {
  await dbExecute("INSERT IGNORE INTO evento_noticias (id_evento,id_noticia) VALUES (?,?)", [idEvento, idNoticia]);
}

export async function upsertAfirmacion(idEvento, a) {
  await dbExecute(
    "INSERT INTO afirmaciones (id_evento,tipo,texto,cifra,unidad,periodo,pasaje,cita_valida,es_central) VALUES (?,?,?,?,?,?,?,?,?)",
    [idEvento, a.tipo, a.texto, a.cifra ?? null, a.unidad ?? null, a.periodo ?? null, a.pasaje || "", a.cita_valida ? 1 : 0, a.es_central ? 1 : 0]
  );
}

export async function upsertCita(idEvento, idEvidencia, pasaje) {
  await dbExecute("INSERT INTO citas (id_evento,id_evidencia,pasaje) VALUES (?,?,?)", [idEvento, idEvidencia, pasaje || ""]);
}

export async function upsertFicha(f) {
  const c = f.componentes || {};
  await dbExecute(
    `INSERT INTO fichas (id_caso,id_evento,modalidad,tema,P,R,I,U,N,E,banda,version_reglas,estado_evidencia,estado_revision,ruta_fd,nivel_atencion,alcance_texto,corresponde_aviso,resumen,accion_recomendada,liberacion,ficha_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE P=VALUES(P), estado_revision=VALUES(estado_revision), ruta_fd=VALUES(ruta_fd), ficha_json=VALUES(ficha_json)`,
    [f.id_caso, f.id_evento ?? null, f.modalidad, f.tema || "", f.puntaje ?? null, c.R ?? null, c.I ?? null, c.U ?? null, c.N ?? null, c.E ?? null,
      f.banda || "", f.version_reglas || "", f.estado_evidencia || "", f.estado_revision || "nuevo",
      f.ruta_fd || "pasa", f.nivel_atencion || "", f.alcance_texto || "", f.corresponde_aviso ? 1 : 0,
      f.resumen || "", f.accion_recomendada || "", j(f.liberacion), j(f)]
  );
}

export async function upsertSenal(idFicha, s) {
  await dbExecute(
    "INSERT IGNORE INTO senales_ficha (id_ficha,codigo,nivel,origen,razon) VALUES (?,?,?,?,?)",
    [idFicha, s.codigo || "", s.nivel || "", s.origen || "", s.razon || ""]
  );
}
