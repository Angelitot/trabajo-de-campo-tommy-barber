// Paso de las filas de la base a los objetos que usa la página (y al revés).
// Los objetos tienen la misma forma que en js/app.js, así la página funciona igual con la base.
import { z } from 'zod';
import { aMin, hhmm, momentoPY, nombreNorm, sumarDias, telInfo } from './agenda.js';

export const MEDIOS = ['Efectivo', 'Transferencia', 'Billetera'];
export const ESTADOS = ['confirmado', 'atendido', 'novino', 'cancelado'];

export class ErrorApi extends Error {
  constructor(estado, codigo, mensaje, extra) { super(mensaje || codigo); this.estado = estado; this.codigo = codigo; this.extra = extra; }
}
export const conflicto = (mensaje, extra) => new ErrorApi(409, 'conflicto', mensaje, extra);
export const invalido = (mensaje) => new ErrorApi(400, 'invalido', mensaje);
export const prohibido = (mensaje) => new ErrorApi(403, 'prohibido', mensaje || 'No tenés permiso para hacer esto.');

export const ms = (d) => (d ? new Date(d).getTime() : 0);
export const fechaMs = (n) => (n ? new Date(n) : null);
export const idBarbero = (s) => { const m = /^b(\d{1,9})$/.exec(String(s || '')); return m ? +m[1] : null; };

// ---------- Validación de lo que llega ----------
export const zFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((c) => {
  const d = new Date(c + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === c;
}, 'fecha inválida');
export const zMin = z.number().int().min(0).max(1439);
export const zMs = z.number().int().min(0).max(4102444800000);
export const zRef = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const zTurno = z.object({
  id: z.string().max(10),
  codigo: z.string().regex(/^TB-[A-Z0-9]{4,6}$/),
  servicio: z.string().min(1).max(40),
  fecha: zFecha,
  min: zMin,
  cliente: z.string().trim().min(1).max(60),
  tel: z.string().max(20),
  nota: z.string().max(120),
  precio: z.number().int().positive().max(100000000),
  dur: z.number().int().min(1).max(600),
  estado: z.enum(ESTADOS),
  medio: z.enum(['', ...MEDIOS]),
  canceladoPor: z.enum(['', 'cliente', 'barberia']),
  canceladoEn: zMs, recordadoEn: zMs, avisadoEn: zMs, creadoEn: zMs,
  orden: z.number().int().min(0).max(100000),
  sinTurno: z.boolean(),
  llego: zMin.nullable(),
  llamadoEn: zMs,
  enLocal: z.boolean(),
  antes: z.object({ fecha: zFecha, min: zMin }).nullable(),
  cambiadoEn: zMs,
  barbero: z.string().regex(/^b\d{1,9}$/),
  pospuesto: z.boolean(),
  falso: z.boolean(),
  ejemplo: z.literal(false)
}).refine((t) => t.id === t.codigo, 'el id del turno es su código');

// Campos de un turno (los que se pueden cambiar desde el panel salen de esta lista)
export const CAMPOS = ['id', 'codigo', 'servicio', 'fecha', 'min', 'cliente', 'tel', 'nota', 'precio', 'dur', 'estado', 'medio', 'canceladoPor',
  'canceladoEn', 'recordadoEn', 'avisadoEn', 'creadoEn', 'orden', 'sinTurno', 'llego', 'llamadoEn', 'enLocal', 'antes', 'cambiadoEn', 'barbero',
  'pospuesto', 'falso', 'ejemplo'];

// ---------- Turnos ----------
export const COLUMNAS_TURNO = 'id, codigo, cliente_id, nombre_cliente, telefono, barbero_id, servicio_id, fecha, hora, duracion_min, precio, estado, medio_pago, nota, ' +
  'sin_turno, hora_llegada, en_local, pospuesto, falso, cancelado_por, cancelado_en, recordado_en, avisado_en, llamado_en, fecha_anterior, hora_anterior, ' +
  'cambiado_en, orden, creado_en, dispositivo';

export function filaATurno(r) {
  return {
    id: r.codigo, codigo: r.codigo, servicio: r.servicio_id, fecha: r.fecha, min: aMin(r.hora),
    cliente: r.nombre_cliente, tel: r.telefono ? telInfo(r.telefono).lindo : '', nota: r.nota || '',
    precio: r.precio, dur: r.duracion_min, estado: r.estado, medio: r.medio_pago || '',
    canceladoPor: r.cancelado_por || '', canceladoEn: ms(r.cancelado_en), recordadoEn: ms(r.recordado_en), avisadoEn: ms(r.avisado_en), creadoEn: ms(r.creado_en),
    orden: r.orden || 0, sinTurno: r.sin_turno, llego: r.hora_llegada ? aMin(r.hora_llegada) : null, llamadoEn: ms(r.llamado_en), enLocal: r.en_local,
    antes: r.fecha_anterior ? { fecha: r.fecha_anterior, min: aMin(r.hora_anterior) } : null, cambiadoEn: ms(r.cambiado_en),
    barbero: 'b' + r.barbero_id, pospuesto: r.pospuesto, falso: r.falso, ejemplo: false
  };
}

// Valores de las columnas a partir del turno de la página (ya validado)
export function turnoAColumnas(t) {
  const tel = telInfo(t.tel);
  if (t.tel && !tel.ok) throw invalido('El WhatsApp de ' + t.cliente + ' no es un celular de Paraguay.');
  return {
    codigo: t.codigo, nombre_cliente: t.cliente, telefono: tel.ok ? tel.wa : null, barbero_id: idBarbero(t.barbero), servicio_id: t.servicio,
    fecha: t.fecha, hora: hhmm(t.min), duracion_min: t.dur, precio: t.precio, estado: t.estado, medio_pago: t.medio || null, nota: t.nota || null,
    sin_turno: t.sinTurno, hora_llegada: t.llego == null ? null : hhmm(t.llego), en_local: t.enLocal, pospuesto: t.pospuesto, falso: t.falso,
    cancelado_por: t.canceladoPor || null, cancelado_en: fechaMs(t.canceladoEn), recordado_en: fechaMs(t.recordadoEn), avisado_en: fechaMs(t.avisadoEn),
    llamado_en: fechaMs(t.llamadoEn), fecha_anterior: t.antes ? t.antes.fecha : null, hora_anterior: t.antes ? hhmm(t.antes.min) : null,
    cambiado_en: fechaMs(t.cambiadoEn), orden: t.orden, creado_en: fechaMs(t.creadoEn) || new Date()
  };
}

// ---------- Horario, barberos y servicios ----------
export async function cargarHoras(c) {
  const horas = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const { rows } = await c.query('SELECT dia_semana, hora_desde, hora_hasta FROM horario_local ORDER BY dia_semana, hora_desde');
  rows.forEach((r) => horas[r.dia_semana].push([aMin(r.hora_desde), aMin(r.hora_hasta)]));
  return horas;
}
// Desde y hasta de cada día del local (el primer y el último tramo)
export function rangoDelLocal(horas, wd) { const h = horas[wd]; return h.length ? [h[0][0], h[h.length - 1][1]] : null; }

export async function cargarBarberos(c) {
  const { rows } = await c.query('SELECT id, nombre, activo, creado_en, quitado_en FROM barbero ORDER BY id');
  const hs = (await c.query('SELECT barbero_id, dia_semana, hora_desde, hora_hasta FROM horario_barbero')).rows;
  return rows.map((r) => {
    const dias = {};
    for (let wd = 0; wd < 7; wd++) dias[wd] = null;
    hs.filter((h) => h.barbero_id === r.id).forEach((h) => { dias[h.dia_semana] = [aMin(h.hora_desde), aMin(h.hora_hasta)]; });
    return { id: 'b' + r.id, nombre: r.nombre, activo: r.activo, dias, creadoEn: ms(r.creado_en), quitadoEn: ms(r.quitado_en) };
  });
}

export function filaABloqueo(r) {
  const b = { id: r.ref, tipo: r.tipo, fecha: r.fecha_desde, motivo: r.motivo || '' };
  if (r.barbero_id) b.barbero = 'b' + r.barbero_id;
  if (r.tipo === 'cerrado') b.hasta = r.fecha_hasta;
  else { b.desde = aMin(r.hora_desde); b.fin = aMin(r.hora_hasta); }
  b.creadoEn = ms(r.creado_en);
  return b;
}
// Cambios de horario que todavía no terminaron (desde: un día, por defecto hoy)
export async function cargarBloqueos(c, desde) {
  const { rows } = await c.query('SELECT * FROM cambio_horario WHERE fecha_hasta >= $1 ORDER BY fecha_desde, id', [desde || momentoPY().clave]);
  return rows.map(filaABloqueo);
}

export async function cargarServicios(c) {
  const { rows } = await c.query("SELECT * FROM servicio ORDER BY grupo = 'combo', orden, creado_en, id");
  return rows.map((r) => ({
    id: r.id, grupo: r.grupo, nombre: r.nombre, incluye: r.grupo === 'combo' ? r.incluye || '' : '', min: r.duracion_min, precio: r.precio,
    activo: r.activo, nuevo: !r.del_local, original: r.del_local ? { precio: r.precio_original, min: r.duracion_original } : null
  }));
}
export async function cargarHistorialServicios(c) {
  const { rows } = await c.query('SELECT * FROM (SELECT * FROM cambio_servicio ORDER BY id DESC LIMIT 40) x ORDER BY id');
  return rows.map((r) => r.detalle || { ts: ms(r.cambiado_en), id: r.servicio_id, nombre: r.valor_despues || '', campo: r.campo === 'duracion' ? 'min' : r.campo });
}

export async function cargarConfig(c) {
  return { barberos: await cargarBarberos(c), servicios: await cargarServicios(c), historial: await cargarHistorialServicios(c), bloqueos: await cargarBloqueos(c) };
}

// ---------- Fotos ----------
export function urlFoto(base, r) { return base + '/api/fotos/' + encodeURIComponent(r.ref) + '?v=' + ms(r.subida_en).toString(36); }

export async function cargarFotos(c, base) {
  const { rows } = await c.query('SELECT id, ref, lugar, orden, tipo_mime, archivo_original, ancho, alto, descripcion, subida_en FROM foto ORDER BY lugar, orden, id');
  const propia = (await c.query("SELECT valor FROM ajuste WHERE clave = 'galeria_propia'")).rows[0];
  const f = { version: 1, logo: null, fachada: null, galeria: null };
  const logo = rows.find((r) => r.lugar === 'logo');
  if (logo) f.logo = urlFoto(base, logo);
  const fa = rows.find((r) => r.lugar === 'fachada');
  if (fa) f.fachada = { src: urlFoto(base, fa), alt: fa.descripcion || '', w: fa.ancho || 1080, h: fa.alto || 859 };
  if (propia && propia.valor === true) {
    f.galeria = rows.filter((r) => r.lugar === 'galeria').map((r) => {
      const n = /^original-(\d+)$/.exec(r.ref);
      return n ? { tipo: 'original', n: +n[1] } : { tipo: 'nueva', id: r.ref, src: urlFoto(base, r), alt: r.descripcion || '', w: r.ancho || 800, h: r.alto || 1000 };
    });
  }
  return f;
}

// ---------- Caja y stock ----------
export function filaAMov(r) {
  const p = momentoPY(r.fecha_hora.getTime());
  const m = { id: r.ref, fecha: p.clave, min: p.min, tipo: r.tipo, cat: r.categoria, concepto: r.concepto, monto: r.monto, medio: r.medio_pago };
  if (r.turno_codigo) m.turno = r.turno_codigo;
  if (r.cantidad) m.cantidad = r.cantidad;
  if (r.barbero_id) m.barbero = 'b' + r.barbero_id;
  return m;
}
export const SQL_MOV = 'SELECT m.*, t.codigo AS turno_codigo FROM movimiento_caja m LEFT JOIN turno t ON t.id = m.turno_id';

export function filaAProducto(r) {
  return { id: r.ref, tipo: r.tipo, nombre: r.nombre, presentacion: r.presentacion || '', uni: [r.unidad, r.unidad_plural], stock: r.stock, minimo: r.minimo, precio: r.precio_venta };
}
export function filaAMovStock(r) {
  const p = momentoPY(r.fecha_hora.getTime());
  const m = { id: r.ref, prodId: r.producto_ref, nombre: r.producto_nombre, uni: [r.unidad, r.unidad_plural], tipo: r.tipo, cantidad: r.cantidad,
    ts: r.fecha_hora.getTime(), fecha: p.clave, min: p.min };
  if (r.monto != null) m.monto = r.monto;
  if (r.costo != null) m.costo = r.costo;
  if (r.stock_antes != null && r.tipo === 'ajuste') { m.antes = r.stock_antes; m.despues = r.stock_despues; }
  return m;
}
export async function cargarStock(c) {
  const hoy = momentoPY().clave;
  const productos = (await c.query('SELECT * FROM producto WHERE activo ORDER BY id')).rows.map(filaAProducto);
  const movStock = (await c.query(
    `SELECT s.*, p.ref AS producto_ref, p.nombre AS producto_nombre, p.unidad, p.unidad_plural FROM movimiento_stock s JOIN producto p ON p.id = s.producto_id
     WHERE s.fecha_hora >= ($1::date - 62)::timestamp AT TIME ZONE 'America/Asuncion' ORDER BY s.fecha_hora, s.id`, [hoy])).rows.map(filaAMovStock);
  return { productos, movStock };
}

// ---------- Clientes ----------
// Clave de un cliente como la arma la página: 't' + WhatsApp + '|' + nombre, o 'n' + nombre si no dejó número
export function claveAlias(telefono, nombreN) { return telefono ? 't' + telefono + '|' + nombreN : 'n' + nombreN; }

export async function cargarRegistro(c, { soloIds } = {}) {
  const r = { v: 1, sig: 1, ids: {}, fichas: {}, distintos: [], bloqueados: [] };
  const alias = soloIds
    ? (await c.query('SELECT telefono, nombre_normalizado, cliente_id FROM cliente_alias WHERE cliente_id = ANY($1::int[])', [soloIds])).rows
    : (await c.query('SELECT telefono, nombre_normalizado, cliente_id FROM cliente_alias')).rows;
  alias.forEach((a) => { r.ids[claveAlias(a.telefono, a.nombre_normalizado)] = a.cliente_id; });
  r.sig = ((await c.query('SELECT coalesce(max(id), 0) + 1 AS sig FROM cliente')).rows[0].sig);
  if (soloIds) return r;
  const clientes = (await c.query(
    `SELECT id, telefono, telefono_fijo, telefono_cambiado_en FROM cliente c
     WHERE telefono_fijo OR EXISTS (SELECT 1 FROM cliente_telefono_anterior a WHERE a.cliente_id = c.id)
        OR EXISTS (SELECT 1 FROM union_clientes u WHERE u.cliente_id = c.id)`)).rows;
  const anteriores = (await c.query('SELECT cliente_id, telefono, hasta FROM cliente_telefono_anterior ORDER BY id')).rows;
  const unidos = (await c.query('SELECT cliente_id, cliente_unido_id FROM union_clientes ORDER BY id')).rows;
  clientes.forEach((cl) => {
    const f = { tel: cl.telefono_fijo && cl.telefono ? cl.telefono : '', anteriores: [], unidos: [] };
    if (cl.telefono_cambiado_en) f.cambioTel = ms(cl.telefono_cambiado_en);
    anteriores.filter((a) => a.cliente_id === cl.id).forEach((a) => f.anteriores.push({ wa: a.telefono, hasta: ms(a.hasta) }));
    unidos.filter((u) => u.cliente_id === cl.id).forEach((u) => f.unidos.push(u.cliente_unido_id));
    r.fichas[cl.id] = f;
  });
  r.distintos = (await c.query('SELECT cliente_a, cliente_b FROM clientes_distintos ORDER BY marcado_en')).rows.map((d) => d.cliente_a + '-' + d.cliente_b);
  r.bloqueados = (await c.query('SELECT telefono, motivo, bloqueado_en FROM numero_bloqueado ORDER BY bloqueado_en')).rows
    .map((b) => ({ wa: b.telefono, motivo: b.motivo || '', en: ms(b.bloqueado_en) }));
  return r;
}

// El N.º de cliente de un turno, como en la página: por WhatsApp + nombre; si dejó solo el número
// y ese número es de un único cliente, es él; si no, es un cliente nuevo.
export async function resolverCliente(c, nombre, telefono) {
  const n = nombreNorm(nombre);
  const tel = telefono || null;
  if (!tel && !n) return null;
  const buscar = async () => (await c.query('SELECT cliente_id FROM cliente_alias WHERE telefono IS NOT DISTINCT FROM $1 AND nombre_normalizado = $2', [tel, n])).rows[0];
  const hay = await buscar();
  if (hay) {
    if (n) await c.query("UPDATE cliente SET nombre = $2, telefono = CASE WHEN telefono_fijo OR $3::text IS NULL THEN telefono ELSE $3 END WHERE id = $1",
      [hay.cliente_id, String(nombre).trim().slice(0, 60), tel]);
    return hay.cliente_id;
  }
  if (tel && !n) {
    const mismos = (await c.query(
      'SELECT cliente_id FROM cliente_alias WHERE telefono = $1 UNION SELECT cliente_id FROM cliente_telefono_anterior WHERE telefono = $1', [tel])).rows;
    if (mismos.length === 1) {
      await c.query('INSERT INTO cliente_alias (telefono, nombre_normalizado, cliente_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [tel, '', mismos[0].cliente_id]);
      return (await buscar()).cliente_id;
    }
  }
  const nuevo = (await c.query('INSERT INTO cliente (nombre, nombre_normalizado, telefono) VALUES ($1, $2, $3) RETURNING id',
    [n ? String(nombre).trim().slice(0, 60) : 'Cliente sin turno', n, tel])).rows[0].id;
  const ok = await c.query('INSERT INTO cliente_alias (telefono, nombre_normalizado, cliente_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING cliente_id', [tel, n, nuevo]);
  if (ok.rows.length) return nuevo;
  // Otra reserva lo creó al mismo tiempo: se usa ese
  await c.query('DELETE FROM cliente WHERE id = $1', [nuevo]);
  return (await buscar()).cliente_id;
}

// Claves de cliente (para el registro de la página) de una lista de turnos
export function clavesDeTurnos(turnos) {
  const r = new Set();
  turnos.forEach((t) => {
    const tel = telInfo(t.tel), n = nombreNorm(t.cliente);
    if (tel.ok) r.add(claveAlias(tel.wa, n)); else if (n) r.add(claveAlias(null, n));
  });
  return [...r];
}
export async function idsDeClaves(c, claves) {
  const ids = {};
  if (!claves.length) return ids;
  const { rows } = await c.query(
    `SELECT telefono, nombre_normalizado, cliente_id FROM cliente_alias
     WHERE (CASE WHEN telefono IS NULL THEN 'n' || nombre_normalizado ELSE 't' || telefono || '|' || nombre_normalizado END) = ANY($1::text[])`, [claves]);
  rows.forEach((a) => { ids[claveAlias(a.telefono, a.nombre_normalizado)] = a.cliente_id; });
  return ids;
}

export async function subirVersion(c, parte) { await c.query('UPDATE version_datos SET version = version + 1 WHERE parte = $1', [parte]); }
export async function versiones(c) {
  const v = {};
  (await c.query('SELECT parte, version FROM version_datos')).rows.forEach((r) => { v[r.parte] = r.version; });
  return v;
}

export function hoyPY() { return momentoPY().clave; }
export { sumarDias };
