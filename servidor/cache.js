// Lo que se pide seguido y cambia poco, guardado en la memoria del servidor (hay un solo servidor).
// - recordar(): para lo que cambia con cualquier reserva o cambio del panel (los horarios ocupados).
//   Cada pedido que guarda algo lo descarta (invalidar), así nunca se muestra algo viejo.
// - config(): servicios, barberos, horario y fotos. Va atado al número de versión de la base,
//   que sube cada vez que el dueño cambia algo de eso: si la versión es la misma, sirve lo guardado.
import { cargarBarberos, cargarBloqueos, cargarFotos, cargarHistorialServicios, cargarHoras, cargarServicios, hoyPY } from './datos.js';

let generacion = 0;
const recordados = new Map();   // clave → { promesa, hasta }

export function invalidar() { generacion++; recordados.clear(); }

export function recordar(clave, calcular, dura = 30000) {
  const x = recordados.get(clave);
  if (x && x.hasta > Date.now()) return x.promesa;
  const gen = generacion;
  const promesa = Promise.resolve().then(calcular);
  recordados.set(clave, { promesa, hasta: Date.now() + dura });
  promesa.catch(() => { if (recordados.get(clave)?.promesa === promesa) recordados.delete(clave); });
  // Si mientras se armaba algo se guardó, no queda para el próximo pedido
  promesa.then(() => { if (gen !== generacion && recordados.get(clave)?.promesa === promesa) recordados.delete(clave); }, () => {});
  return promesa;
}

let configGuardada = null;   // { clave, promesa }
// pool: para leer la base. version: la versión «config» de la base. base: dirección pública de la API (para las fotos).
export function config(pool, version, base) {
  const clave = version + '|' + hoyPY() + '|' + (base || '');
  if (configGuardada && configGuardada.clave === clave) return configGuardada.promesa;
  const promesa = (async () => {
    const [horas, barberos, servicios, historial, bloqueos, fotos] = await Promise.all([
      cargarHoras(pool), cargarBarberos(pool), cargarServicios(pool), cargarHistorialServicios(pool), cargarBloqueos(pool), cargarFotos(pool, base || '')
    ]);
    return { version, horas, barberos, servicios, historial, bloqueos, fotos };
  })();
  configGuardada = { clave, promesa };
  promesa.catch(() => { if (configGuardada?.promesa === promesa) configGuardada = null; });
  return promesa;
}

export async function versionConfig(c) {
  return (await c.query("SELECT version FROM version_datos WHERE parte = 'config'")).rows[0].version;
}
