#!/usr/bin/env node
// Prueba rápida de conectividad con DeepSeek: llama al modelo configurado (R1 con
// fallback a V3) y a V3 directo, e imprime latencia y un fragmento de respuesta.
import { completar } from "../src/llm/client.js";
import { log } from "../src/utils/logger.js";

const mensajes = [
  { role: "system", content: "Responde en español, en una sola frase, únicamente con la respuesta." },
  { role: "user", content: "Di exactamente: DeepSeek funciona." },
];

async function main() {
  const t0 = Date.now();
  try {
    const r = await completar(mensajes);
    log.ok(`Ruta por defecto (R1→V3): ${Date.now() - t0}ms → ${String(r).trim().slice(0, 120)}`);
  } catch (e) {
    log.error(`Ruta por defecto: ${e.message}`);
  }

  const t1 = Date.now();
  try {
    const r = await completar(mensajes, { modelo: "deepseek-chat" });
    log.ok(`deepseek-chat (V3): ${Date.now() - t1}ms → ${String(r).trim().slice(0, 120)}`);
  } catch (e) {
    log.error(`deepseek-chat: ${e.message}`);
  }
}

main().catch((e) => {
  log.error("testDeepSeek falló:", e.message);
  process.exit(1);
});
