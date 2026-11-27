// Conexión a PostgreSQL.
import pg from 'pg';

// Las fechas (date) quedan como texto 'AAAA-MM-DD': no se convierten a la zona horaria del servidor
pg.types.setTypeParser(1082, (v) => v);
// Los conteos y los id bigserial entran en un número de JavaScript
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

// url: la dirección de la base (DATABASE_URL). ca: el certificado de la base (DATABASE_CA), si se tiene.
export function crearPool(url, { ca, max = 4 } = {}) {
  if (!url) throw new Error('Falta DATABASE_URL');
  const u = new URL(url);
  const modo = u.searchParams.get('sslmode');
  u.searchParams.delete('sslmode');
  const local = ['localhost', '127.0.0.1', '::1', ''].includes(u.hostname) || u.searchParams.has('host');
  let ssl = false;
  if (modo !== 'disable' && !local) {
    if (ca) ssl = { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true };
    else {
      ssl = { rejectUnauthorized: false };
      console.warn('Aviso: la conexión a la base va cifrada, pero sin revisar su certificado (falta DATABASE_CA).');
    }
  }
  // La base tiene 1 GB de memoria y cada conexión abierta la va ocupando de a poco.
  // - Pocas conexiones (4 alcanzan: las consultas son cortas).
  // - Las que no se usan se cierran a los 5 minutos.
  // - Ninguna vive más de 15 minutos: el panel consulta cada 15 s y, sin este límite,
  //   la misma conexión quedaba abierta para siempre y la memoria de la base crecía hasta llenarse.
  // - Sin JIT: para consultas tan chicas no acelera nada y gasta mucha memoria.
  const pool = new pg.Pool({
    connectionString: u.toString(), ssl, max,
    idleTimeoutMillis: 300000, maxLifetimeSeconds: 900, connectionTimeoutMillis: 15000, keepAlive: true,
    options: '-c jit=off',
  });
  pool.on('error', (e) => console.error('Error de la base (conexión en espera):', e.message));
  return pool;
}

// Corre fn(cliente) dentro de una transacción; si algo falla, se deshace todo
export async function enTransaccion(pool, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* la conexión ya se cortó */ }
    throw e;
  } finally {
    c.release();
  }
}
