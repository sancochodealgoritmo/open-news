#!/usr/bin/env node
// M17 · Benchmark reproducible: ejecuta las consultas de benchmark.jsonl y calcula
// métricas con numerador/denominador y lista de fallos. Sin promedios engañosos.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../src/config.js";
import { consultar } from "../src/products/index.js";
import { log } from "../src/utils/logger.js";
import { contieneTerminosProhibidos } from "../src/signals/credibility.js";

const TIEMPOS = {};

function registrar(metrica, valores) {
  TIEMPOS[metrica] = valores;
}

function mediana(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function p95(arr) {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(0.95 * a.length))] ?? 0;
}

async function cargarCorpus() {
  try {
    const txt = await readFile(path.join(config.dataDir, "processed", "registros.json"), "utf8");
    const reg = JSON.parse(txt);
    return reg.noticias || [];
  } catch {
    return [];
  }
}

async function main() {
  const corpus = await cargarCorpus();
  let consultas = [];
  try {
    const txt = await readFile(path.join(config.dataDir, "benchmark.jsonl"), "utf8");
    consultas = txt.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    log.warn("Sin data/benchmark.jsonl: se ejecuta un conjunto mínimo de ejemplo.");
    consultas = [
      { id: "b01", tipo: "sustentada", consulta: "¿Qué cinco temas merecen revisión para la agenda de Panamá?" },
      { id: "b02", tipo: "sin_respuesta", consulta: "¿Cuál fue el desempleo mensual de Panamá en marzo de 2025?" },
    ];
  }

  const resultados = [];
  const latencias = [];
  let abstenciónCorrecta = 0;
  let abstenciónIncorrecta = 0;
  let contradicciones = 0;
  let sinVeredictos = 0;

  for (const c of consultas) {
    const t0 = Date.now();
    try {
      const r = await consultar(c.consulta, corpus, { modalidad: c.modalidad || "principal" });
      const ms = Date.now() - t0;
      latencias.push(ms);
      r.id = c.id;
      r.latencia_ms = ms;
      r.veredictos = contieneTerminosProhibidos(JSON.stringify(r));
      if (r.veredictos.length === 0) sinVeredictos++;

      if (c.tipo === "sin_respuesta" && r.abstencion) abstenciónCorrecta++;
      if (c.tipo === "sustentada" && r.abstencion) abstenciónIncorrecta++;
      if (c.tipo === "contradiccion" && !r.abstencion) contradicciones++;

      resultados.push(r);
      log.info(`[${c.id}] ${ms}ms`);
    } catch (e) {
      const ms = Date.now() - t0;
      latencias.push(ms);
      resultados.push({ id: c.id, error: e.message, latencia_ms: ms });
      log.warn(`[${c.id}] error: ${e.message}`);
    }
  }

  const sinRespuesta = consultas.filter((c) => c.tipo === "sin_respuesta").length || 1;
  const sustentadas = consultas.filter((c) => c.tipo === "sustentada").length || 1;
  const deContradiccion = consultas.filter((c) => c.tipo === "contradiccion").length || 1;

  const metricas = {
    fecha: new Date().toISOString(),
    total_consultas: consultas.length,
    cobertura_citas: { numerador: "se calcula en producción con V02", denominador: "afirmaciones emitidas" },
    abstención_correcta: { valor: abstenciónCorrecta / sinRespuesta, numerador: abstenciónCorrecta, denominador: sinRespuesta },
    abstención_incorrecta: { valor: abstenciónIncorrecta / sustentadas, numerador: abstenciónIncorrecta, denominador: sustentadas },
    contradicciones_mostradas: { valor: contradicciones / deContradiccion, numerador: contradicciones, denominador: deContradiccion },
    cero_veredictos: { valor: sinVeredictos / (resultados.length || 1), numerador: sinVeredictos, denominador: resultados.length },
    latencia_mediana_ms: mediana(latencias),
    latencia_p95_ms: p95(latencias),
    fallos: resultados.filter((r) => r.error),
  };

  const outDir = path.join(config.dataDir, "processed");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "metricas.json"), JSON.stringify(metricas, null, 2), "utf8");
  await writeFile(path.join(outDir, "ejecuciones.jsonl"), resultados.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

  log.ok(`Benchmark completado: ${resultados.length} consultas · mediana ${metricas.latencia_mediana_ms}ms · p95 ${metricas.latencia_p95_ms}ms`);
  log.info("Métricas en data/processed/metricas.json");
  registrar("benchmark", metricas);
}

main().catch((e) => {
  log.error("benchmark falló:", e.message);
  process.exit(1);
});
