// Capa de acceso a MySQL/MariaDB (sistema de registro operativo).
// Si DB_* no está configurado o la conexión falla, las operaciones lanzan
// error y el sistema degrada a JSONL (persistencia intercambiable).
import mysql from "mysql2/promise";
import { config } from "../config.js";

let pool = null;

async function getDb() {
  if (pool) return pool;
  try {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      waitForConnections: true,
      connectionLimit: 10,
      decimalNumbers: true,
    });
    await pool.query("SELECT 1");
    return pool;
  } catch {
    pool = null;
    return null;
  }
}

export async function dbQuery(sql, params = []) {
  const db = await getDb();
  if (!db) throw new Error("MySQL no disponible");
  const [rows] = await db.query(sql, params);
  return rows;
}

export async function dbExecute(sql, params = []) {
  const db = await getDb();
  if (!db) throw new Error("MySQL no disponible");
  const [res] = await db.execute(sql, params);
  return res;
}

export async function dbDisponible() {
  return Boolean(await getDb());
}
