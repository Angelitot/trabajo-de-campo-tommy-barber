// Arranque de la API: prepara la base, crea la cuenta del dueño si falta y empieza a atender.
//
// Variables de entorno:
//   DATABASE_URL   dirección de la base de datos (obligatoria)
//   DATABASE_CA    certificado de la base, para revisar que la conexión sea con ella (opcional)
//   DUENO_USUARIO  usuario del dueño (solo hace falta la primera vez)
//   DUENO_CLAVE    contraseña del dueño (solo la primera vez; después se cambia desde el panel)
//   SITIO_URL      dirección de la página, la única que puede usar la API (puede ir más de una, separadas por coma)
//   PORT           puerto (Render lo pone solo)
import { crearPool } from './db.js';
import { migrar } from './migraciones.js';
import { crearApp } from './app.js';
import { asegurarDueno } from './rutas/acceso.js';

const env = process.env;
const pool = crearPool(env.DATABASE_URL, { ca: env.DATABASE_CA });

async function arrancar() {
  await migrar(pool);
  await asegurarDueno(pool, env.DUENO_USUARIO, env.DUENO_CLAVE);
  // Sesiones vencidas: se borran al arrancar y una vez por día
  const limpiar = () => pool.query('DELETE FROM sesion WHERE expira_en < now()').catch((e) => console.error('Limpieza de sesiones:', e.message));
  limpiar();
  setInterval(limpiar, 24 * 3600000).unref();

  const app = crearApp({
    pool,
    origenes: String(env.SITIO_URL || '').split(',').map((s) => s.trim()).filter(Boolean),
    base: (env.API_URL || env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '') || null,
    origenesLocales: env.ORIGENES_LOCALES === '1'
  });
  const puerto = +env.PORT || 3000;
  const servidor = app.listen(puerto, () => console.log('API de Tommy Barber escuchando en el puerto ' + puerto));
  const cerrar = () => { servidor.close(() => pool.end().finally(() => process.exit(0))); setTimeout(() => process.exit(0), 10000).unref(); };
  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
}

arrancar().catch((e) => {
  console.error('No se pudo arrancar:', e.message);
  process.exit(1);
});
