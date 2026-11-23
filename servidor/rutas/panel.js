// El panel: datos (el dueño ve todo; cada barbero, lo suyo), novedades, cambios, fotos, clientes y cuentas.
import { Router } from 'express';
import { z } from 'zod';
import { enTransaccion } from '../db.js';
import { aplicarCambios } from '../cambios.js';
import { bloquearNumero, cambiarNumero, desbloquearNumero, marcarDistintos, unirClientes } from '../clientes.js';
import {
  COLUMNAS_TURNO, ErrorApi, SQL_MOV, cargarFotos, cargarRegistro, cargarStock, clavesDeTurnos, conflicto, filaAMov, filaATurno, hoyPY,
  idBarbero, idsDeClaves, invalido, subirVersion, sumarDias, versiones, zRef
} from '../datos.js';
import { hashClave, problemaClave, usuarioValido } from '../seguridad.js';
import { config } from '../cache.js';
import { cargarDatosDePrueba, empezarDeCero } from '../prueba.js';
import { datosUsuario, soloDueno } from './acceso.js';

export const DIAS_PANEL = 200;   // turnos y caja hacia atrás (los reportes llegan a 6 meses)

export function rutasPanel(ctx) {
  const r = Router();
  const base = (req) => ctx.base || req.protocol + '://' + req.get('host');
  const ahoraDb = async (c) => (await c.query('SELECT now() AS t')).rows[0].t.getTime();

  // Turnos y movimientos de caja que ve este usuario
  function filtroBarbero(req, col, args) {
    if (req.esDueno) return '';
    args.push(idBarbero(req.yo.barbero));
    return ` AND ${col} = $${args.length}`;
  }
  async function registroPara(c, req, turnos) {
    if (req.esDueno) return cargarRegistro(c);
    const r = { v: 1, sig: 1, ids: await idsDeClaves(c, clavesDeTurnos(turnos)), fichas: {}, distintos: [], bloqueados: [] };
    return r;
  }

  // Configuración del panel: sale de lo guardado en memoria si la versión de la base es la misma
  async function configPanel(version, req) {
    const cfg = await config(ctx.pool, version, base(req));
    return { config: { barberos: cfg.barberos, servicios: cfg.servicios, historial: cfg.historial, bloqueos: cfg.bloqueos }, fotos: cfg.fotos };
  }
  // La hora de la base y las versiones, en una sola consulta (la hora se toma antes de leer lo demás)
  async function ahoraYVersiones() {
    const r = (await ctx.pool.query("SELECT now() AS t, json_object_agg(parte, version) AS v FROM version_datos")).rows[0];
    return { ahora: r.t.getTime(), versiones: r.v };
  }

  r.get('/datos', async (req, res) => {
    const c = ctx.pool;
    const { ahora, versiones: v } = await ahoraYVersiones();
    const desde = sumarDias(hoyPY(), -DIAS_PANEL);
    const at = [desde], am = [desde];
    // Las consultas van todas a la vez
    const [turnos, mov, cfg, stock] = await Promise.all([
      c.query(`SELECT ${COLUMNAS_TURNO} FROM turno WHERE fecha >= $1${filtroBarbero(req, 'barbero_id', at)} ORDER BY fecha, hora, id`, at).then((x) => x.rows.map(filaATurno)),
      c.query(`${SQL_MOV} WHERE m.anulado_en IS NULL AND m.fecha_hora >= ($1::date)::timestamp AT TIME ZONE 'America/Asuncion'${filtroBarbero(req, 'm.barbero_id', am)} ORDER BY m.fecha_hora, m.id`, am).then((x) => x.rows.map(filaAMov)),
      configPanel(v.config, req),
      req.esDueno ? cargarStock(c) : null
    ]);
    const datos = { ahora, yo: req.yo, versiones: v, config: cfg.config, fotos: cfg.fotos, turnos, mov, registro: await registroPara(c, req, turnos) };
    if (stock) Object.assign(datos, stock);
    res.json(datos);
  });

  // Lo que cambió desde la última vez (otros celulares, reservas de la página)
  r.get('/novedades', async (req, res) => {
    const q = z.object({ desde: z.coerce.number().int().min(0), config: z.coerce.number().int().optional(), registro: z.coerce.number().int().optional(), stock: z.coerce.number().int().optional() }).parse(req.query);
    const c = ctx.pool;
    const { ahora, versiones: v } = await ahoraYVersiones();
    // Se pide un minuto de más por si una transacción terminó tarde
    const desde = new Date(Math.max(0, q.desde - 60000));
    const at = [desde], am = [desde];
    const [turnos, fuera, borrados, movs, cfg, registro, stock] = await Promise.all([
      c.query(`SELECT ${COLUMNAS_TURNO} FROM turno WHERE actualizado_en > $1${filtroBarbero(req, 'barbero_id', at)} ORDER BY fecha, hora, id`, at).then((x) => x.rows.map(filaATurno)),
      req.esDueno ? [] : c.query('SELECT codigo FROM turno WHERE actualizado_en > $1 AND barbero_id <> $2', [desde, idBarbero(req.yo.barbero)]).then((x) => x.rows.map((y) => y.codigo)),
      c.query('SELECT codigo FROM turno_borrado WHERE borrado_en > $1', [desde]).then((x) => x.rows.map((y) => y.codigo)),
      c.query(`${SQL_MOV} WHERE m.actualizado_en > $1${filtroBarbero(req, 'm.barbero_id', am)}`, am).then((x) => x.rows),
      q.config !== v.config ? configPanel(v.config, req) : null,
      req.esDueno && q.registro !== v.registro ? cargarRegistro(c) : null,
      req.esDueno && q.stock !== v.stock ? cargarStock(c) : null
    ]);
    const r2 = { ahora, versiones: v, turnos, fuera, borrados, mov: [], movAnulados: [] };
    movs.forEach((m) => { if (m.anulado_en) r2.movAnulados.push(m.ref); else r2.mov.push(filaAMov(m)); });
    if (cfg) { r2.config = cfg.config; r2.fotos = cfg.fotos; }
    if (registro) r2.registro = registro; else r2.clientes = await idsDeClaves(c, clavesDeTurnos(turnos));
    if (stock) Object.assign(r2, stock);
    res.json(r2);
  });

  // Cambios hechos en el panel
  r.post('/cambios', async (req, res) => {
    const out = await enTransaccion(ctx.pool, (c) => aplicarCambios(c, req.yo, req.body));
    const extra = {};
    await (async () => {
      const c = ctx.pool;
      extra.versiones = await versiones(c);
      if (out.partes.includes('config')) extra.config = (await configPanel(extra.versiones.config, req)).config;
      if (out.partes.includes('stock') && req.esDueno) Object.assign(extra, await cargarStock(c));
      extra.clientes = await idsDeClaves(c, clavesDeTurnos(out.turnos));
    })();
    res.json({ ok: true, ids: out.ids, turnos: out.turnos, mov: out.mov, ...extra });
  });

  // ---------- Fotos (solo el dueño) ----------
  const FIRMAS = { 'image/webp': (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
    'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'image/png': (b) => b.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) };
  function imagen(src) {
    const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(src || ''));
    if (!m) throw invalido('Esa foto no se pudo leer. Probá con una foto JPG o PNG.');
    const buf = Buffer.from(m[2], 'base64');
    if (!FIRMAS[m[1]](buf)) throw invalido('Ese archivo no es una foto.');
    if (buf.length > 1500000) throw invalido('La foto es demasiado grande.');
    return { buf, mime: m[1] };
  }
  const zLado = z.number().int().min(1).max(4000);
  const zAlt = z.string().trim().max(160).default('');
  async function responderFotos(req, res) { res.json({ fotos: await cargarFotos(ctx.pool, base(req)) }); }

  r.put('/fotos/logo', soloDueno, async (req, res) => {
    const d = z.object({ src: z.string(), w: zLado.optional(), h: zLado.optional() }).parse(req.body);
    const im = imagen(d.src);
    await enTransaccion(ctx.pool, async (c) => {
      await c.query("DELETE FROM foto WHERE lugar = 'logo'");
      await c.query("INSERT INTO foto (ref, lugar, archivo, tipo_mime, ancho, alto) VALUES ('logo-' || substr(md5(random()::text), 1, 10), 'logo', $1, $2, $3, $4)",
        [im.buf, im.mime, d.w || null, d.h || null]);
      await subirVersion(c, 'config');
    });
    await responderFotos(req, res);
  });

  r.put('/fotos/fachada', soloDueno, async (req, res) => {
    const d = z.object({ src: z.string().optional(), alt: zAlt, w: zLado.optional(), h: zLado.optional() }).parse(req.body);
    await enTransaccion(ctx.pool, async (c) => {
      const hay = (await c.query("SELECT id FROM foto WHERE lugar = 'fachada' FOR UPDATE")).rows[0];
      if (d.src) {
        const im = imagen(d.src);
        await c.query("DELETE FROM foto WHERE lugar = 'fachada'");
        await c.query("INSERT INTO foto (ref, lugar, archivo, tipo_mime, ancho, alto, descripcion) VALUES ('fachada-' || substr(md5(random()::text), 1, 10), 'fachada', $1, $2, $3, $4, $5)",
          [im.buf, im.mime, d.w || null, d.h || null, d.alt || null]);
      } else if (hay) {
        await c.query('UPDATE foto SET descripcion = $2 WHERE id = $1', [hay.id, d.alt || null]);
      } else throw invalido('Falta la foto.');
      await subirVersion(c, 'config');
    });
    await responderFotos(req, res);
  });

  r.delete('/fotos/:lugar', soloDueno, async (req, res) => {
    const lugar = z.enum(['logo', 'fachada']).parse(req.params.lugar);
    await enTransaccion(ctx.pool, async (c) => {
      await c.query('DELETE FROM foto WHERE lugar = $1', [lugar]);
      await subirVersion(c, 'config');
    });
    await responderFotos(req, res);
  });

  // La galería completa, en orden. null: volver a las fotos originales de la página.
  const zItem = z.union([
    z.object({ tipo: z.literal('original'), n: z.number().int().min(0).max(9) }),
    z.object({ tipo: z.literal('nueva'), id: zRef, src: z.string().optional(), alt: zAlt, w: zLado.optional(), h: zLado.optional() })
  ]);
  r.put('/fotos/galeria', soloDueno, async (req, res) => {
    const { galeria } = z.object({ galeria: z.array(zItem).max(8).nullable() }).parse(req.body);
    await enTransaccion(ctx.pool, async (c) => {
      const antes = new Map((await c.query("SELECT id, ref FROM foto WHERE lugar = 'galeria' FOR UPDATE")).rows.map((x) => [x.ref, x.id]));
      const items = (galeria || []).map((x) => ({ ...x, ref: x.tipo === 'original' ? 'original-' + x.n : x.id }));
      if (new Set(items.map((x) => x.ref)).size !== items.length) throw invalido('Hay una foto repetida.');
      const quedan = new Set(items.map((x) => x.ref));
      for (const [ref, id] of antes) if (!quedan.has(ref)) await c.query('DELETE FROM foto WHERE id = $1', [id]);
      for (const [i, x] of items.entries()) {
        const existe = antes.get(x.ref);
        if (x.tipo === 'original') {
          if (existe) await c.query('UPDATE foto SET orden = $2 WHERE id = $1', [existe, i + 1]);
          else await c.query("INSERT INTO foto (ref, lugar, orden, archivo_original) VALUES ($1, 'galeria', $2, $3)", [x.ref, i + 1, 'img/galeria/corte-' + (x.n + 1) + '.jpg']);
          continue;
        }
        if (x.src) {
          const im = imagen(x.src);
          if (existe) await c.query('DELETE FROM foto WHERE id = $1', [existe]);
          else if ((await c.query('SELECT 1 FROM foto WHERE ref = $1', [x.ref])).rows.length) throw conflicto('Esa foto ya existe.');
          await c.query("INSERT INTO foto (ref, lugar, orden, archivo, tipo_mime, ancho, alto, descripcion) VALUES ($1, 'galeria', $2, $3, $4, $5, $6, $7)",
            [x.ref, i + 1, im.buf, im.mime, x.w || null, x.h || null, x.alt || null]);
        } else if (existe) {
          await c.query('UPDATE foto SET orden = $2, descripcion = $3 WHERE id = $1', [existe, i + 1, x.alt || null]);
        } else throw conflicto('Esa foto ya no está. Volvé a subirla.');
      }
      await c.query("INSERT INTO ajuste (clave, valor) VALUES ('galeria_propia', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()",
        [JSON.stringify(galeria !== null)]);
      await subirVersion(c, 'config');
    });
    await responderFotos(req, res);
  });

  // ---------- Clientes (solo el dueño) ----------
  const zId = z.number().int().positive();
  const responderRegistro = async (res, extra) => res.json({ ...(extra || {}), registro: await cargarRegistro(ctx.pool), versiones: await versiones(ctx.pool) });
  r.post('/clientes/numero', soloDueno, async (req, res) => {
    const d = z.object({ id: zId, tel: z.string().max(20), nombre: z.string().max(60), anterior: z.string().max(20).default('') }).parse(req.body);
    const queda = await enTransaccion(ctx.pool, (c) => cambiarNumero(c, d.id, d.tel, d.nombre, d.anterior));
    await responderRegistro(res, { queda });
  });
  r.post('/clientes/unir', soloDueno, async (req, res) => {
    const d = z.object({ a: zId, b: zId }).parse(req.body);
    const queda = await enTransaccion(ctx.pool, (c) => unirClientes(c, d.a, d.b));
    await responderRegistro(res, { queda });
  });
  r.post('/clientes/distintos', soloDueno, async (req, res) => {
    const d = z.object({ a: zId, b: zId }).parse(req.body);
    await enTransaccion(ctx.pool, (c) => marcarDistintos(c, d.a, d.b));
    await responderRegistro(res);
  });
  r.post('/clientes/bloqueados', soloDueno, async (req, res) => {
    const d = z.object({ wa: z.string().regex(/^5959\d{8}$/), motivo: z.string().max(200).default('') }).parse(req.body);
    await enTransaccion(ctx.pool, (c) => bloquearNumero(c, d.wa, d.motivo));
    await responderRegistro(res);
  });
  r.delete('/clientes/bloqueados/:wa', soloDueno, async (req, res) => {
    const wa = z.string().regex(/^5959\d{8}$/).parse(req.params.wa);
    await enTransaccion(ctx.pool, (c) => desbloquearNumero(c, wa));
    await responderRegistro(res);
  });

  // ---------- Datos de prueba y empezar de cero (solo el dueño) ----------
  r.post('/prueba', soloDueno, async (req, res) => {
    const resumen = await enTransaccion(ctx.pool, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(727003)');   // de a uno
      return cargarDatosDePrueba(c);
    });
    res.json({ ok: true, resumen });
  });
  r.post('/empezar-de-cero', soloDueno, async (req, res) => {
    z.object({ confirmar: z.literal('BORRAR') }).parse(req.body);
    await enTransaccion(ctx.pool, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(727003)');
      await empezarDeCero(c);
    });
    res.json({ ok: true });
  });

  // ---------- Cuentas de los barberos (solo el dueño) ----------
  async function cuentas() {
    const { rows } = await ctx.pool.query('SELECT u.*, b.nombre AS barbero_nombre FROM usuario u LEFT JOIN barbero b ON b.id = u.barbero_id ORDER BY u.id');
    return rows.map((u) => ({ ...datosUsuario(u), activo: u.activo, ultimoIngreso: u.ultimo_ingreso ? u.ultimo_ingreso.getTime() : 0 }));
  }
  r.get('/cuentas', soloDueno, async (req, res) => res.json({ cuentas: await cuentas() }));

  r.post('/cuentas', soloDueno, async (req, res) => {
    const d = z.object({ barbero: z.string().max(12), usuario: z.string().max(60), clave: z.string().max(200) }).parse(req.body);
    const usuario = d.usuario.trim().toLowerCase();
    if (!usuarioValido(usuario)) throw invalido('El usuario tiene que tener de 3 a 30 letras minúsculas, números, punto o guion (sin espacios).');
    const problema = problemaClave(d.clave, usuario);
    if (problema) throw invalido(problema);
    const b = (await ctx.pool.query('SELECT id, nombre FROM barbero WHERE id = $1 AND activo', [idBarbero(d.barbero)])).rows[0];
    if (!b) throw invalido('Ese barbero no existe.');
    const hash = await hashClave(d.clave);
    await enTransaccion(ctx.pool, async (c) => {
      if ((await c.query('SELECT 1 FROM usuario WHERE barbero_id = $1 AND activo', [b.id])).rows.length) throw conflicto(b.nombre + ' ya tiene una cuenta.');
      if ((await c.query('SELECT 1 FROM usuario WHERE usuario = $1', [usuario])).rows.length) throw conflicto('Ese usuario ya existe. Elegí otro.');
      await c.query("INSERT INTO usuario (nombre, usuario, clave_hash, rol, barbero_id) VALUES ($1, $2, $3, 'barbero', $4)", [b.nombre, usuario, hash, b.id]);
    });
    res.status(201).json({ cuentas: await cuentas() });
  });

  // Nueva contraseña o quitarle el acceso. Se cierran sus sesiones abiertas.
  r.put('/cuentas/:id', soloDueno, async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = z.object({ clave: z.string().max(200).optional(), activo: z.literal(false).optional() }).parse(req.body);
    const u = (await ctx.pool.query("SELECT * FROM usuario WHERE id = $1 AND rol = 'barbero'", [id])).rows[0];
    if (!u) throw new ErrorApi(404, 'no-existe', 'No existe esa cuenta.');
    let hash = null;
    if (d.clave != null) {
      const problema = problemaClave(d.clave, u.usuario);
      if (problema) throw invalido(problema);
      hash = await hashClave(d.clave);
    }
    await enTransaccion(ctx.pool, async (c) => {
      if (hash) await c.query('UPDATE usuario SET clave_hash = $2 WHERE id = $1', [id, hash]);
      if (d.activo === false) await c.query('UPDATE usuario SET activo = false WHERE id = $1', [id]);
      await c.query('DELETE FROM sesion WHERE usuario_id = $1', [id]);
    });
    res.json({ cuentas: await cuentas() });
  });

  return r;
}
