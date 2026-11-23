// Lo que usa la página de los clientes: datos del sitio, fotos, reservar, ver, cambiar y cancelar turnos.
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { enTransaccion } from '../db.js';
import { ANTICIPACION, DIAS_ADELANTE, PASO, aMin, crearAgenda, empezo, hhmm, momentoPY, nombreNorm, sumarDias, telInfo } from '../agenda.js';
import {
  COLUMNAS_TURNO, ErrorApi, cargarBarberos, cargarBloqueos, cargarFotos, cargarHoras, cargarServicios, conflicto, filaATurno, idBarbero, invalido,
  resolverCliente, zFecha, zMin
} from '../datos.js';
import { nuevoCodigo, nuevoToken, sha256 } from '../seguridad.js';

export const MAX_POR_NUMERO = 4, MAX_POR_CELULAR = 4;

const zClave = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);
const zCodigo = z.string().regex(/^TB-[A-Z0-9]{4,6}$/);
const zReserva = z.object({
  servicio: z.string().min(1).max(40),
  fecha: zFecha,
  min: zMin,
  barbero: z.string().max(12).default(''),
  nombre: z.string().trim().min(2).max(60),
  tel: z.string().max(20),
  nota: z.string().trim().max(120).default(''),
  dispositivo: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/).optional()
});

// Candado por día: dos reservas para el mismo día se revisan de a una
export async function bloquearDia(c, fecha) { await c.query('SELECT pg_advisory_xact_lock(727002, hashtext($1))', [fecha]); }

// Todo lo que hace falta para saber qué horas están libres un día
export async function agendaDelDia(c, fecha, sinTurno) {
  const horas = await cargarHoras(c);
  const barberos = await cargarBarberos(c);
  const bloqueos = await cargarBloqueos(c, fecha);
  const { rows } = await c.query("SELECT codigo, fecha, hora, duracion_min, estado, barbero_id FROM turno WHERE fecha = $1 AND estado <> 'cancelado' AND codigo <> $2",
    [fecha, sinTurno || '']);
  const turnos = rows.map((r) => ({ id: r.codigo, fecha: r.fecha, min: aMin(r.hora), dur: r.duracion_min, estado: r.estado, barbero: 'b' + r.barbero_id }));
  return { agenda: crearAgenda(horas, bloqueos), barberos, turnos };
}

// El barbero que toma ese horario (como lo ofrece la página), o un error si el horario no se puede dar
export function barberoParaHorario({ agenda, barberos, turnos }, { fecha, m, dur, barbero, ahora }) {
  const h = ahora || momentoPY();
  const ultimo = sumarDias(h.clave, DIAS_ADELANTE - 1);
  if (fecha < h.clave || fecha > ultimo) throw conflicto('Ese día no se puede reservar.', { error: 'fuera-de-horario' });
  if (fecha === h.clave && m < h.min + ANTICIPACION) throw conflicto('Ese horario ya pasó o está por empezar. Elegí otro.', { error: 'fuera-de-horario' });
  let cands = barberos.filter((b) => b.activo);
  if (barbero) {
    const b = barberos.find((x) => x.id === barbero && x.activo);
    if (!b) throw conflicto('Ese barbero ya no atiende. Elegí otro.', { error: 'barbero' });
    cands = [b];
  }
  const enTramo = agenda.horasDe(fecha).some((tr) => m >= tr[0] && m + dur <= tr[1] && (m - tr[0]) % PASO === 0);
  if (!enTramo || !cands.some((b) => agenda.trabajaA(b, fecha, m, dur))) throw conflicto('Ese horario no está disponible.', { error: 'fuera-de-horario' });
  const elegido = agenda.elegirBarbero(cands, fecha, m, dur, turnos);
  if (!elegido) throw conflicto('Alguien reservó ese horario recién. Elegí otro.', { error: 'ocupado' });
  return elegido;
}

export function rutasPublicas(ctx) {
  const r = Router();
  const base = (req) => ctx.base || req.protocol + '://' + req.get('host');
  const limite = (limit, ventana) => ctx.sinLimites ? (req, res, next) => next() : rateLimit({
    windowMs: ventana, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'muchos-pedidos', mensaje: 'Hiciste muchos pedidos seguidos. Esperá unos minutos y probá de nuevo.' })
  });
  const limiteReservas = limite(12, 15 * 60000);
  const limiteConsultas = limite(120, 15 * 60000);

  // Servicios, barberos, cambios de horario, fotos y horarios ocupados de los próximos 14 días (sin datos de los clientes)
  r.get('/sitio', async (req, res) => {
    const c = ctx.pool;
    const h = momentoPY();
    const { rows } = await c.query(
      "SELECT fecha, hora, duracion_min, barbero_id FROM turno WHERE fecha BETWEEN $1 AND $2 AND estado <> 'cancelado' ORDER BY fecha, hora",
      [h.clave, sumarDias(h.clave, DIAS_ADELANTE)]);
    res.json({
      ahora: Date.now(),
      servicios: (await cargarServicios(c)).map(({ original, ...s }) => s),
      barberos: (await cargarBarberos(c)).map(({ id, nombre, activo, dias }) => ({ id, nombre, activo, dias })),
      bloqueos: (await cargarBloqueos(c)).map(({ creadoEn, ...b }) => b),
      fotos: await cargarFotos(c, base(req)),
      ocupacion: rows.map((t) => ({ fecha: t.fecha, min: aMin(t.hora), dur: t.duracion_min, barbero: 'b' + t.barbero_id }))
    });
  });

  // Una foto del sitio. La dirección lleva la versión, así el navegador la guarda mucho tiempo.
  r.get('/fotos/:ref', async (req, res) => {
    const { rows } = await ctx.pool.query('SELECT archivo, tipo_mime FROM foto WHERE ref = $1 AND archivo IS NOT NULL', [String(req.params.ref).slice(0, 40)]);
    if (!rows.length) return res.status(404).json({ error: 'no-existe', mensaje: 'No existe esa foto.' });
    res.set('Content-Type', rows[0].tipo_mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(rows[0].archivo);
  });

  // Reservar un turno
  r.post('/reservas', limiteReservas, async (req, res) => {
    const d = zReserva.parse(req.body);
    const tel = telInfo(d.tel);
    if (!tel.ok) throw invalido('Escribí un celular de Paraguay con el 09 adelante, por ejemplo 0981 123 456.');
    const resultado = await enTransaccion(ctx.pool, async (c) => {
      await bloquearDia(c, d.fecha);
      const h = momentoPY();
      const serv = (await c.query('SELECT id, nombre, precio, duracion_min FROM servicio WHERE id = $1 AND activo', [d.servicio])).rows[0];
      if (!serv) throw conflicto('Ese servicio ya no se ofrece. Elegí otro.', { error: 'servicio' });
      if ((await c.query('SELECT 1 FROM numero_bloqueado WHERE telefono = $1', [tel.wa])).rows.length) {
        throw new ErrorApi(403, 'bloqueado', 'Este número no puede reservar por la web.');
      }
      // Tope contra turnos falsos: una persona tiene un turno pendiente a la vez; un número, hasta 4; un celular, hasta 4
      const pendientes = (await c.query(
        `SELECT nombre_cliente, fecha, hora, telefono, dispositivo FROM turno
         WHERE estado = 'confirmado' AND (telefono = $1 OR ($2::text IS NOT NULL AND dispositivo = $2))
           AND (fecha > $3 OR (fecha = $3 AND hora > $4::time))`, [tel.wa, d.dispositivo || null, h.clave, hhmm(h.min)])).rows;
      const mismoNumero = pendientes.filter((t) => t.telefono === tel.wa);
      const n = nombreNorm(d.nombre);
      const persona = n && mismoNumero.find((t) => nombreNorm(t.nombre_cliente) === n);
      if (persona) throw conflicto('Ya hay un turno a nombre de esa persona.', { error: 'persona', turno: { cliente: persona.nombre_cliente, fecha: persona.fecha, min: aMin(persona.hora) } });
      if (mismoNumero.length >= MAX_POR_NUMERO) throw conflicto('Con este WhatsApp ya hay muchos turnos pendientes.', { error: 'tope-numero', cantidad: mismoNumero.length });
      const delCelular = d.dispositivo ? pendientes.filter((t) => t.dispositivo === d.dispositivo).length : 0;
      if (delCelular >= MAX_POR_CELULAR) throw conflicto('Desde este celular ya hay muchos turnos pendientes.', { error: 'tope-celular', cantidad: delCelular });

      const dia = await agendaDelDia(c, d.fecha);
      const b = barberoParaHorario(dia, { fecha: d.fecha, m: d.min, dur: serv.duracion_min, barbero: d.barbero, ahora: h });
      const clienteId = await resolverCliente(c, d.nombre, tel.wa);
      const clave = nuevoToken();
      for (let intento = 0; intento < 5; intento++) {
        const codigo = nuevoCodigo();
        if ((await c.query('SELECT 1 FROM turno WHERE codigo = $1', [codigo])).rows.length) continue;
        const { rows } = await c.query(
          `INSERT INTO turno (codigo, cliente_id, nombre_cliente, telefono, barbero_id, servicio_id, fecha, hora, duracion_min, precio, nota, dispositivo, clave_cliente)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING ${COLUMNAS_TURNO}`,
          [codigo, clienteId, d.nombre, tel.wa, idBarbero(b.id), serv.id, d.fecha, hhmm(d.min), serv.duracion_min, serv.precio, d.nota || null, d.dispositivo || null, sha256(clave)]);
        return { turno: filaATurno(rows[0]), clave };
      }
      throw new Error('No se pudo generar un código de turno');
    });
    res.status(201).json(resultado);
  });

  // Los turnos que reservó este celular (cada uno con su clave)
  r.post('/reservas/consultar', limiteConsultas, async (req, res) => {
    const { items } = z.object({ items: z.array(z.object({ codigo: zCodigo, clave: zClave })).max(100) }).parse(req.body);
    if (!items.length) return res.json({ turnos: [] });
    const { rows } = await ctx.pool.query(
      `SELECT ${COLUMNAS_TURNO} FROM turno WHERE (codigo, clave_cliente) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
      [items.map((i) => i.codigo), items.map((i) => sha256(i.clave))]);
    res.json({ turnos: rows.map(filaATurno) });
  });

  async function turnoConClave(c, codigo, clave) {
    const { rows } = await c.query(`SELECT ${COLUMNAS_TURNO} FROM turno WHERE codigo = $1 AND clave_cliente = $2 FOR UPDATE`, [codigo, sha256(clave)]);
    if (!rows.length) throw new ErrorApi(404, 'no-existe', 'No encontramos ese turno.');
    const t = filaATurno(rows[0]);
    if (t.estado !== 'confirmado') throw conflicto('Este turno ya no está activo.', { error: 'inactivo' });
    if (empezo(t, momentoPY())) throw conflicto('Este turno ya empezó y no se puede cambiar ni cancelar.', { error: 'empezo' });
    return t;
  }

  r.post('/reservas/:codigo/cancelar', limiteConsultas, async (req, res) => {
    const codigo = zCodigo.parse(req.params.codigo);
    const { clave } = z.object({ clave: zClave }).parse(req.body);
    const turno = await enTransaccion(ctx.pool, async (c) => {
      await turnoConClave(c, codigo, clave);
      const { rows } = await c.query(
        `UPDATE turno SET estado = 'cancelado', cancelado_por = 'cliente', cancelado_en = now(), actualizado_en = now() WHERE codigo = $1 RETURNING ${COLUMNAS_TURNO}`, [codigo]);
      return filaATurno(rows[0]);
    });
    res.json({ turno });
  });

  r.post('/reservas/:codigo/cambiar', limiteReservas, async (req, res) => {
    const codigo = zCodigo.parse(req.params.codigo);
    const d = z.object({ clave: zClave, fecha: zFecha, min: zMin, barbero: z.string().max(12).default('') }).parse(req.body);
    const turno = await enTransaccion(ctx.pool, async (c) => {
      const antes = await turnoConClave(c, codigo, d.clave);
      for (const f of [antes.fecha, d.fecha].sort()) await bloquearDia(c, f);
      if (antes.fecha === d.fecha && antes.min === d.min) throw conflicto('Es el mismo horario que ya tenés.', { error: 'mismo' });
      const dia = await agendaDelDia(c, d.fecha, codigo);
      const b = barberoParaHorario(dia, { fecha: d.fecha, m: d.min, dur: antes.dur, barbero: d.barbero });
      const { rows } = await c.query(
        `UPDATE turno SET fecha_anterior = fecha, hora_anterior = hora, fecha = $2, hora = $3, barbero_id = $4, cambiado_en = now(), recordado_en = NULL,
           actualizado_en = now() WHERE codigo = $1 RETURNING ${COLUMNAS_TURNO}`, [codigo, d.fecha, hhmm(d.min), idBarbero(b.id)]);
      return filaATurno(rows[0]);
    });
    res.json({ turno });
  });

  return r;
}
