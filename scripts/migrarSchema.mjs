#!/usr/bin/env node
// Aplica db/esquema.sql de forma idempotente y registra la versión del esquema.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { config } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "db", "esquema.sql");

const conn = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  multipleStatements: true,
});

const sql = await readFile(sqlPath, "utf8");
await conn.query(sql);
await conn.execute(
  "INSERT INTO esquema_version (version, aplicada_utc, notas) VALUES (?,?,?) ON DUPLICATE KEY UPDATE aplicada_utc=VALUES(aplicada_utc)",
  ["2.1", new Date().toISOString().replace("T", " ").slice(0, 19), "db:migrar"]
);

console.log("Esquema aplicado (idempotente) y versión registrada.");
await conn.end();
