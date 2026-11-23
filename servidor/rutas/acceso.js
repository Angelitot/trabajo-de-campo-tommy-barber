// Ingreso al panel con usuario y contraseña. Cada ingreso es una sesión con un token que guarda el celular.
import { Router } from 'express';
import { z } from 'zod';
import { enTransaccion } from '../db.js';
import { ErrorApi, invalido } from '../datos.js';
import { hashClave, hashDeRelleno, nuevoToken, problemaClave, sha256, usuarioValido, verificarClave } from '../seguridad.js';

export const DIAS_SESION = 30;

export function datosUsuario(u) {
  return { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, barbero: u.barbero_id ? 'b' + u.barbero_id : null };
}

async function crearSesion(c, usuarioId, agente) {
  const token = nuevoToken();
  await c.query(`INSERT INTO sesion (usuario_id, token_hash, expira_en, agente) VALUES ($1, $2, now() + interval '${DIAS_SESION} days', $3)`,
    [usuarioId, sha256(token), String(agente || '').slice(0, 200)]);
  await c.query('UPDATE usuario SET ultimo_ingreso = now() WHERE id = $1', [usuarioId]);
  return token;
}

// Revisa el token. req.yo queda con el usuario; req.esDueno dice si puede ver todo.
export function autenticar(ctx) {
  return async (req, res, next) => {
    const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.get('authorization') || '');
    if (!m) return res.status(401).json({ error: 'sin-sesion', mensaje: 'Tenés que ingresar con tu usuario y contraseña.' });
    const hash = sha256(m[1]);
    const { rows } = await ctx.pool.query(
      `SELECT s.id AS sesion_id, s.ultimo_uso, u.* FROM sesion s JOIN usuario u ON u.id = s.usuario_id
       LEFT JOIN barbero b ON b.id = u.barbero_id
       WHERE s.token_hash = $1 AND s.expira_en > now() AND u.activo AND (u.barbero_id IS NULL OR b.activo)`, [hash]);
    if (!rows.length) return res.status(401).json({ error: 'sin-sesion', mensaje: 'La sesión se cerró. Ingresá de nuevo.' });
    const u = rows[0];
    // La sesión dura 30 días desde el último uso
    if (Date.now() - new Date(u.ultimo_uso).getTime() > 3600000) {
      await ctx.pool.query(`UPDATE sesion SET ultimo_uso = now(), expira_en = now() + interval '${DIAS_SESION} days' WHERE id = $1`, [u.sesion_id]);
    }
    req.yo = datosUsuario(u);
    req.sesionId = u.sesion_id;
    req.esDueno = u.rol === 'dueno';
    next();
  };
}

export function soloDueno(req, res, next) {
  if (!req.esDueno) return res.status(403).json({ error: 'prohibido', mensaje: 'Esto lo puede hacer solo el dueño.' });
  next();
}

// Crea la cuenta del dueño al arrancar, si todavía no hay ninguna (con DUENO_USUARIO y DUENO_CLAVE)
export async function asegurarDueno(pool, usuario, clave, log = console.log) {
  const hay = (await pool.query("SELECT 1 FROM usuario WHERE rol = 'dueno' AND activo")).rows.length;
  if (hay) return false;
  if (!usuario || !clave) { log('Aviso: todavía no hay cuenta del dueño. Cargá DUENO_USUARIO y DUENO_CLAVE y reiniciá el servicio.'); return false; }
  const u = String(usuario).trim().toLowerCase();
  if (!usuarioValido(u)) { log('Aviso: DUENO_USUARIO tiene que tener de 3 a 30 letras minúsculas, números, punto o guion.'); return false; }
  const problema = problemaClave(clave, u);
  if (problema) { log('Aviso: DUENO_CLAVE no sirve. ' + problema); return false; }
  await pool.query("INSERT INTO usuario (nombre, usuario, clave_hash, rol) VALUES ('Dueño', $1, $2, 'dueno') ON CONFLICT (usuario) DO NOTHING", [u, await hashClave(clave)]);
  log('Se creó la cuenta del dueño (' + u + ').');
  return true;
}

export function rutasAcceso(ctx) {
  const r = Router();

  r.post('/ingresar', async (req, res) => {
    const d = z.object({ usuario: z.string().max(60), clave: z.string().max(200) }).parse(req.body);
    const usuario = d.usuario.trim().toLowerCase();
    const espera = ctx.freno.espera(usuario, req.ip);
    if (espera) {
      throw new ErrorApi(429, 'muchos-intentos', `Hubo muchos intentos fallidos. Esperá ${espera} ${espera === 1 ? 'minuto' : 'minutos'} y probá de nuevo.`);
    }
    const u = (await ctx.pool.query(
      `SELECT u.* FROM usuario u LEFT JOIN barbero b ON b.id = u.barbero_id WHERE u.usuario = $1 AND u.activo AND (u.barbero_id IS NULL OR b.activo)`, [usuario])).rows[0];
    const ok = await verificarClave(d.clave, u ? u.clave_hash : await hashDeRelleno());
    if (!u || !ok) {
      ctx.freno.fallo(usuario, req.ip);
      throw new ErrorApi(401, 'datos-incorrectos', 'El usuario o la contraseña no son correctos.');
    }
    ctx.freno.bien(usuario);
    const token = await crearSesion(ctx.pool, u.id, req.get('user-agent'));
    res.json({ token, yo: datosUsuario(u) });
  });

  r.post('/salir', autenticar(ctx), async (req, res) => {
    await ctx.pool.query('DELETE FROM sesion WHERE id = $1', [req.sesionId]);
    res.json({ ok: true });
  });

  r.get('/yo', autenticar(ctx), (req, res) => res.json({ yo: req.yo }));

  // Cambiar la contraseña propia. Se cierran las otras sesiones.
  r.post('/clave', autenticar(ctx), async (req, res) => {
    const d = z.object({ actual: z.string().max(200), nueva: z.string().max(200) }).parse(req.body);
    const u = (await ctx.pool.query('SELECT * FROM usuario WHERE id = $1', [req.yo.id])).rows[0];
    if (!(await verificarClave(d.actual, u.clave_hash))) throw new ErrorApi(401, 'datos-incorrectos', 'La contraseña actual no es correcta.');
    const problema = problemaClave(d.nueva, u.usuario);
    if (problema) throw invalido(problema);
    await enTransaccion(ctx.pool, async (c) => {
      await c.query('UPDATE usuario SET clave_hash = $2 WHERE id = $1', [u.id, await hashClave(d.nueva)]);
      await c.query('DELETE FROM sesion WHERE usuario_id = $1 AND id <> $2', [u.id, req.sesionId]);
    });
    res.json({ ok: true });
  });

  return r;
}
