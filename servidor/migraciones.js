// Aplica los archivos de base-de-datos/ que falten, en orden y una sola vez cada uno.
// Si la base ya tenía las tablas (creadas a mano con 01 y 02), los marca como aplicados.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CARPETA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'base-de-datos');
const LLAVE = 727001;  // candado para que dos servidores no migren a la vez

export async function migrar(pool, { carpeta = CARPETA, log = console.log } = {}) {
  const archivos = (await readdir(carpeta)).filter((f) => /^\d{2}-.+\.sql$/.test(f)).sort();
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock($1)', [LLAVE]);
    await c.query('CREATE TABLE IF NOT EXISTS migracion (archivo varchar(80) PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())');
    const hechas = new Set((await c.query('SELECT archivo FROM migracion')).rows.map((r) => r.archivo));
    if (!hechas.size) {
      const { rows } = await c.query("SELECT to_regclass('public.turno') IS NOT NULL AS hay");
      if (rows[0].hay) {
        for (const a of ['01-esquema.sql', '02-datos-iniciales.sql']) {
          await c.query('INSERT INTO migracion (archivo) VALUES ($1) ON CONFLICT DO NOTHING', [a]);
          hechas.add(a);
        }
      }
    }
    const aplicadas = [];
    for (const a of archivos) {
      if (hechas.has(a)) continue;
      const sql = await readFile(path.join(carpeta, a), 'utf8');
      try {
        await c.query('BEGIN');
        await c.query(sql);
        await c.query('INSERT INTO migracion (archivo) VALUES ($1)', [a]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`No se pudo aplicar ${a}: ${e.message}`);
      }
      aplicadas.push(a);
      log('Base de datos: se aplicó ' + a);
    }
    return aplicadas;
  } finally {
    try { await c.query('SELECT pg_advisory_unlock($1)', [LLAVE]); } catch { /* sin conexión */ }
    c.release();
  }
}
