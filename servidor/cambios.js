// Cambios que manda el panel: barberos, servicios, horario, stock, turnos, caja.
// Todo entra junto en una transacción: si algo no se puede, no se guarda nada.
// En los cambios de un turno o un producto llega, por cada campo, [cómo estaba, cómo queda]:
// si otro celular ya lo cambió a otra cosa, es un conflicto y el panel vuelve a cargar los datos.
import { z } from 'zod';
import { PASO, aMin, crearAgenda, hhmm, momentoPY } from './agenda.js';
import {
  CAMPOS, COLUMNAS_TURNO, MEDIOS, SQL_MOV, cargarBarberos, cargarBloqueos, cargarHoras, conflicto, filaAMov, filaAProducto, filaATurno, idBarbero,
  invalido, prohibido, rangoDelLocal, resolverCliente, subirVersion, turnoAColumnas, zFecha, zMin, zMs, zRef, zTurno
} from './datos.js';
import { bloquearDia } from './rutas/publico.js';

const zCambios = z.record(z.string(), z.tuple([z.unknown(), z.unknown()]));
const zCambiado = z.object({ id: z.string().max(40), cambios: zCambios });
const zDias = z.record(z.string(), z.tuple([zMin, zMin]).nullable());
const zBarbero = z.object({ id: zRef, nombre: z.string().trim().min(2).max(40), activo: z.boolean(), dias: zDias });
const zServicio = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/), grupo: z.enum(['servicio', 'combo']), nombre: z.string().trim().min(2).max(40), incluye: z.string().trim().max(60),
  min: z.number().int().min(5).max(240), precio: z.number().int().positive().max(100000000), activo: z.boolean()
});
const zHistorial = z.object({ ts: zMs, id: z.string().max(40), campo: z.enum(['precio', 'min', 'nombre', 'nuevo', 'oculto', 'vuelve']), nombre: z.string().max(40) }).passthrough();
const zBloqueo = z.object({
  id: zRef, tipo: z.enum(['cerrado', 'franja', 'especial']), fecha: zFecha, hasta: zFecha.optional(), desde: zMin.nullable().optional(), fin: zMin.nullable().optional(),
  motivo: z.string().trim().max(60).default(''), barbero: z.string().max(12).optional(), creadoEn: zMs.optional()
});
const zProducto = z.object({
  id: zRef, tipo: z.enum(['insumo', 'venta']), nombre: z.string().trim().min(2).max(60), presentacion: z.string().trim().max(60),
  uni: z.tuple([z.string().min(1).max(15), z.string().min(1).max(15)]), stock: z.number().int().min(0).max(1000000),
  minimo: z.number().int().min(0).max(1000000), precio: z.number().int().min(0).max(100000000)
});
const zMov = z.object({
  id: zRef, fecha: zFecha, min: zMin, tipo: z.enum(['entrada', 'salida']), cat: z.enum(['servicio', 'producto', 'compra', 'gasto', 'otro']),
  concepto: z.string().trim().min(1).max(120), monto: z.number().int().positive().max(1000000000), medio: z.enum(MEDIOS),
  turno: z.string().max(10).optional(), cantidad: z.number().int().positive().max(100000).optional()
});
const zMovStock = z.object({
  id: zRef, prodId: zRef, tipo: z.enum(['carga', 'compra', 'uso', 'venta', 'ajuste', 'baja']), cantidad: z.number().int().min(0).max(1000000), ts: zMs,
  monto: z.number().int().min(0).optional(), costo: z.number().int().min(0).optional(), antes: z.number().int().min(0).optional(), despues: z.number().int().min(0).optional()
});
const lista = (x, max = 500) => z.array(x).max(max).default([]);
export const zPaquete = z.object({
  barberos: z.object({ nuevos: lista(zBarbero, 20), cambiados: lista(zBarbero, 50) }).optional(),
  servicios: z.object({ nuevos: lista(zServicio, 50), cambiados: lista(zCambiado, 100), historial: lista(zHistorial, 100) }).optional(),
  bloqueos: z.object({ nuevos: lista(zBloqueo, 50), quitados: lista(zRef, 200) }).optional(),
  productos: z.object({ nuevos: lista(zProducto, 50), cambiados: lista(zCambiado, 200), quitados: lista(zRef, 200) }).optional(),
  turnos: z.object({ nuevos: lista(z.unknown(), 100), cambiados: lista(zCambiado, 500), quitados: lista(z.string().max(10), 100) }).optional(),
  mov: z.object({ nuevos: lista(zMov, 500), quitados: lista(zRef, 200) }).optional(),
  movStock: z.object({ nuevos: lista(zMovStock, 500) }).optional()
});

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Aplica los cambios campo por campo sobre lo que hay guardado
function aplicar(actual, cambios, permitidos, que) {
  const nuevo = { ...actual };
  for (const [campo, [antes, despues]] of Object.entries(cambios)) {
    if (!permitidos.includes(campo)) throw prohibido('No se puede cambiar ' + campo + ' de ' + que + '.');
    if (!igual(actual[campo], antes) && !igual(actual[campo], despues)) {
      throw conflicto('Otro celular cambió ' + que + ' al mismo tiempo.', { error: 'cambio-simultaneo', que });
    }
    nuevo[campo] = despues;
  }
  return nuevo;
}

const CAMPOS_DUENO = CAMPOS.filter((c) => !['id', 'codigo', 'creadoEn', 'ejemplo'].includes(c));
// Lo que puede cambiar un barbero en sus turnos: cobrar, no vino, cancelar, posponer y los avisos
const CAMPOS_BARBERO = ['estado', 'medio', 'canceladoPor', 'canceladoEn', 'recordadoEn', 'avisadoEn', 'llamadoEn', 'min', 'orden', 'pospuesto'];
const CAMPOS_PRODUCTO = ['nombre', 'presentacion', 'uni', 'stock', 'minimo', 'precio'];
const CAMPOS_SERVICIO = ['nombre', 'grupo', 'incluye', 'min', 'precio', 'activo'];

const msDe = (fecha, min) => new Date(Date.parse(fecha + 'T00:00:00Z') + (min + 180) * 60000);

// yo: el usuario del panel ({ rol, barbero }). Devuelve lo que quedó guardado.
export async function aplicarCambios(c, yo, paquete) {
  const p = zPaquete.parse(paquete);
  const dueno = yo.rol === 'dueno';
  const miBarbero = yo.barbero;
  const ids = {};  // barberos nuevos: id que le dio el panel → id de la base
  const mapaBarbero = (id) => ids[id] || id;
  const partes = new Set();
  const tocados = new Set();  // códigos de turnos guardados
  const movNuevos = [];
  const hoy = momentoPY().clave;
  if (!dueno && (p.barberos || p.servicios || p.bloqueos || p.productos || p.movStock)) throw prohibido('Esto lo puede hacer solo el dueño.');

  // ---- Barberos
  const quitados = [];
  if (p.barberos && (p.barberos.nuevos.length || p.barberos.cambiados.length)) {
    const horas = await cargarHoras(c);
    const existentes = new Map((await c.query('SELECT id, activo FROM barbero FOR UPDATE')).rows.map((r) => [r.id, r]));
    const diasDe = (dias) => {
      const r = [];
      for (let wd = 0; wd < 7; wd++) {
        const x = dias[wd], local = rangoDelLocal(horas, wd);
        if (!x || !local) continue;
        const a = Math.max(x[0], local[0]), b = Math.min(x[1], local[1]);
        if (b > a) r.push([wd, a, b]);
      }
      return r;
    };
    const guardarDias = async (id, dias) => {
      await c.query('DELETE FROM horario_barbero WHERE barbero_id = $1', [id]);
      for (const [wd, a, b] of diasDe(dias)) await c.query('INSERT INTO horario_barbero VALUES ($1, $2, $3, $4)', [id, wd, hhmm(a), hhmm(b)]);
    };
    for (const b of p.barberos.nuevos) {
      if (idBarbero(b.id) && existentes.has(idBarbero(b.id))) throw conflicto('Ese barbero ya existe.');
      const id = (await c.query('INSERT INTO barbero (nombre) VALUES ($1) RETURNING id', [b.nombre])).rows[0].id;
      ids[b.id] = 'b' + id;
      await guardarDias(id, b.dias);
    }
    for (const b of p.barberos.cambiados) {
      const id = idBarbero(b.id);
      const antes = id && existentes.get(id);
      if (!antes) throw conflicto('Ese barbero ya no existe.');
      if (!b.activo && antes.activo) {
        if ((await c.query("SELECT 1 FROM usuario WHERE barbero_id = $1 AND rol = 'dueno' AND activo", [id])).rows.length) throw invalido('No se puede quitar al dueño.');
        quitados.push(id);
      }
      if (b.activo && !antes.activo) throw invalido('Un barbero quitado no vuelve: agregalo de nuevo.');
      await c.query('UPDATE barbero SET nombre = $2, activo = $3, quitado_en = CASE WHEN $3 THEN NULL ELSE coalesce(quitado_en, now()) END WHERE id = $1', [id, b.nombre, b.activo]);
      await guardarDias(id, b.dias);
    }
    partes.add('config');
  }

  // ---- Servicios
  if (p.servicios) {
    const s = p.servicios;
    for (const n of s.nuevos) {
      if (n.grupo === 'combo' && n.incluye.length < 3) throw invalido('Falta qué incluye el combo.');
      await c.query(
        `INSERT INTO servicio (id, grupo, nombre, incluye, precio, duracion_min, activo, orden)
         VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT coalesce(max(orden), 0) + 1 FROM servicio))`,
        [n.id, n.grupo, n.nombre, n.grupo === 'combo' ? n.incluye : null, n.precio, n.min, n.activo]);
    }
    for (const x of s.cambiados) {
      const r = (await c.query('SELECT * FROM servicio WHERE id = $1 FOR UPDATE', [x.id])).rows[0];
      if (!r) throw conflicto('Ese servicio ya no existe.');
      const actual = { nombre: r.nombre, grupo: r.grupo, incluye: r.grupo === 'combo' ? r.incluye || '' : '', min: r.duracion_min, precio: r.precio, activo: r.activo };
      const permitidos = r.del_local ? ['min', 'precio', 'activo'] : CAMPOS_SERVICIO;
      const n = zServicio.parse({ id: x.id, ...aplicar(actual, x.cambios, permitidos, 'el servicio ' + r.nombre) });
      if (n.grupo === 'combo' && n.incluye.length < 3) throw invalido('Falta qué incluye el combo.');
      await c.query('UPDATE servicio SET nombre = $2, grupo = $3, incluye = $4, duracion_min = $5, precio = $6, activo = $7 WHERE id = $1',
        [x.id, n.nombre, n.grupo, n.grupo === 'combo' ? n.incluye : null, n.min, n.precio, n.activo]);
    }
    for (const hh of s.historial) {
      if (!(await c.query('SELECT 1 FROM servicio WHERE id = $1', [hh.id])).rows.length) continue;
      const texto = (v) => (v == null ? null : String(v).slice(0, 60));
      const detalle = JSON.stringify(hh);
      if (detalle.length > 600) throw invalido('Cambio de servicio demasiado largo.');
      await c.query('INSERT INTO cambio_servicio (servicio_id, campo, valor_antes, valor_despues, cambiado_en, detalle) VALUES ($1, $2, $3, $4, $5, $6)',
        [hh.id, hh.campo === 'min' ? 'duracion' : hh.campo, texto(hh.antesTxt ?? hh.antes), texto(hh.campo === 'nombre' ? hh.nombre : hh.despues), new Date(hh.ts || Date.now()), detalle]);
    }
    if (s.nuevos.length || s.cambiados.length || s.historial.length) partes.add('config');
  }

  // ---- Cambios de horario
  if (p.bloqueos) {
    for (const b of p.bloqueos.nuevos) {
      if (b.fecha < hoy) throw invalido('La fecha ya pasó.');
      const barbero = b.barbero ? idBarbero(mapaBarbero(b.barbero)) : null;
      if (b.barbero && !barbero) throw invalido('Ese barbero no existe.');
      if (b.tipo === 'especial' && barbero) throw invalido('«Otro horario» es para todo el local.');
      if (b.tipo === 'cerrado') {
        const hasta = b.hasta && b.hasta > b.fecha ? b.hasta : b.fecha;
        await c.query('INSERT INTO cambio_horario (ref, tipo, fecha_desde, fecha_hasta, motivo, barbero_id, creado_en) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [b.id, b.tipo, b.fecha, hasta, b.motivo || null, barbero, b.creadoEn ? new Date(b.creadoEn) : new Date()]);
      } else {
        if (b.desde == null || b.fin == null || b.fin <= b.desde) throw invalido('La hora final tiene que ser después de la inicial.');
        await c.query('INSERT INTO cambio_horario (ref, tipo, fecha_desde, fecha_hasta, hora_desde, hora_hasta, motivo, barbero_id, creado_en) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8)',
          [b.id, b.tipo, b.fecha, hhmm(b.desde), hhmm(b.fin), b.motivo || null, barbero, b.creadoEn ? new Date(b.creadoEn) : new Date()]);
      }
    }
    if (p.bloqueos.quitados.length) await c.query('DELETE FROM cambio_horario WHERE ref = ANY($1::text[])', [p.bloqueos.quitados]);
    if (p.bloqueos.nuevos.length || p.bloqueos.quitados.length) partes.add('config');
  }

  // ---- Productos
  if (p.productos) {
    const q = p.productos;
    for (const n of q.nuevos) {
      if (n.tipo === 'venta' && !(n.precio > 0)) throw invalido('Falta el precio de venta.');
      await c.query('INSERT INTO producto (ref, tipo, nombre, presentacion, unidad, unidad_plural, stock, minimo, precio_venta) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [n.id, n.tipo, n.nombre, n.presentacion || null, n.uni[0], n.uni[1], n.stock, n.minimo, n.tipo === 'venta' ? n.precio : 0]);
    }
    for (const x of q.cambiados) {
      const r = (await c.query('SELECT * FROM producto WHERE ref = $1 AND activo FOR UPDATE', [x.id])).rows[0];
      if (!r) throw conflicto('Ese producto ya no está en el stock.', { error: 'cambio-simultaneo' });
      const n = zProducto.parse(aplicar(filaAProducto(r), x.cambios, CAMPOS_PRODUCTO, r.nombre));
      await c.query('UPDATE producto SET nombre = $2, presentacion = $3, unidad = $4, unidad_plural = $5, stock = $6, minimo = $7, precio_venta = $8, actualizado_en = now() WHERE ref = $1',
        [x.id, n.nombre, n.presentacion || null, n.uni[0], n.uni[1], n.stock, n.minimo, r.tipo === 'venta' ? n.precio : 0]);
    }
    if (q.quitados.length) await c.query('UPDATE producto SET activo = false, dado_de_baja_en = now(), actualizado_en = now() WHERE ref = ANY($1::text[]) AND activo', [q.quitados]);
    if (q.nuevos.length || q.cambiados.length || q.quitados.length) partes.add('stock');
  }

  // ---- Turnos
  if (p.turnos && (p.turnos.nuevos.length || p.turnos.cambiados.length || p.turnos.quitados.length)) {
    // Para poder intercambiar las horas de dos turnos («Pasar después»)
    await c.query('SET CONSTRAINTS un_turno_por_hora DEFERRED');
    const nuevos = p.turnos.nuevos.map((t) => {
      const x = zTurno.parse(t);
      x.barbero = mapaBarbero(x.barbero);
      return x;
    });
    // Días que se tocan: se bloquean en orden, igual que las reservas de la página
    const filas = new Map();
    for (const x of p.turnos.cambiados) {
      const r = (await c.query(`SELECT ${COLUMNAS_TURNO} FROM turno WHERE codigo = $1 FOR UPDATE`, [x.id])).rows[0];
      if (!r) throw conflicto('Ese turno ya no existe.', { error: 'cambio-simultaneo' });
      filas.set(x.id, r);
    }
    const dias = new Set(nuevos.map((t) => t.fecha));
    p.turnos.cambiados.forEach((x) => { if (x.cambios.fecha) dias.add(String(x.cambios.fecha[1])); });
    for (const f of [...dias].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) await bloquearDia(c, f);

    const barberos = await cargarBarberos(c);
    const existeBarbero = (id, activo) => barberos.some((b) => b.id === id && (!activo || b.activo));
    const existeServicio = async (id) => (await c.query('SELECT 1 FROM servicio WHERE id = $1', [id])).rows.length > 0;

    for (const x of p.turnos.cambiados) {
      const r = filas.get(x.id);
      const actual = filaATurno(r);
      if (!dueno && actual.barbero !== miBarbero) throw prohibido('Ese turno es de otro barbero.');
      const cambios = { ...x.cambios };
      if (cambios.barbero) cambios.barbero = [cambios.barbero[0], mapaBarbero(cambios.barbero[1])];
      const n = zTurno.parse(aplicar(actual, cambios, dueno ? CAMPOS_DUENO : CAMPOS_BARBERO, 'el turno de ' + actual.cliente));
      if (n.barbero !== actual.barbero && !existeBarbero(n.barbero, true)) throw invalido('Ese barbero ya no atiende.');
      if (n.servicio !== actual.servicio && !(await existeServicio(n.servicio))) throw invalido('Ese servicio no existe.');
      if (!dueno && n.estado === 'cancelado' && n.canceladoPor !== 'barberia') throw prohibido();
      const col = turnoAColumnas(n);
      if (n.cliente !== actual.cliente || n.tel !== actual.tel) col.cliente_id = await resolverCliente(c, n.cliente, col.telefono);
      else col.cliente_id = r.cliente_id;
      const nombres = Object.keys(col);
      await c.query(`UPDATE turno SET ${nombres.map((k, i) => k + ' = $' + (i + 2)).join(', ')}, actualizado_en = now() WHERE codigo = $1`,
        [x.id, ...nombres.map((k) => col[k])]);
      tocados.add(x.id);
    }

    if (nuevos.length) {
      const horas = await cargarHoras(c);
      for (const t of nuevos) {
        if (!t.enLocal) throw invalido('Desde el panel solo se anotan turnos del local.');
        if (!dueno && t.barbero !== miBarbero) throw prohibido('Solo podés anotar clientes para vos.');
        if (!existeBarbero(t.barbero, true)) throw invalido('Ese barbero ya no atiende.');
        if (!(await c.query('SELECT 1 FROM servicio WHERE id = $1 AND activo', [t.servicio])).rows.length) throw conflicto('Ese servicio ya no se ofrece.');
        // La hora tiene que estar libre para ese barbero (los turnos cobrados o que no vinieron dejan su hora libre)
        const ocupados = (await c.query("SELECT fecha, hora, duracion_min, barbero_id FROM turno WHERE fecha = $1 AND barbero_id = $2 AND estado = 'confirmado'",
          [t.fecha, idBarbero(t.barbero)])).rows.map((r) => ({ fecha: r.fecha, min: aMin(r.hora), dur: r.duracion_min, estado: 'confirmado', barbero: t.barbero }));
        const agenda = crearAgenda(horas, await cargarBloqueos(c, t.fecha));
        const b = barberos.find((x) => x.id === t.barbero);
        if (t.min % PASO !== 0 || !agenda.libreBarbero(b, t.fecha, t.min, t.dur, agenda.ocupacionDe(ocupados, t.fecha))) {
          throw conflicto('Las ' + hhmm(t.min) + ' ya no está libre para ' + b.nombre + '. Elegí otra hora.', { error: 'ocupado' });
        }
        const col = turnoAColumnas(t);
        col.cliente_id = await resolverCliente(c, t.cliente, col.telefono);
        const nombres = Object.keys(col);
        await c.query(`INSERT INTO turno (${nombres.join(', ')}) VALUES (${nombres.map((k, i) => '$' + (i + 1)).join(', ')})`, nombres.map((k) => col[k]));
        tocados.add(t.codigo);
      }
    }

    for (const codigo of p.turnos.quitados) {
      const r = (await c.query('SELECT id, en_local, barbero_id, estado FROM turno WHERE codigo = $1 FOR UPDATE', [codigo])).rows[0];
      if (!r) continue;
      if (!r.en_local) throw invalido('Solo se puede borrar un cliente anotado en el local.');
      if (!dueno && 'b' + r.barbero_id !== miBarbero) throw prohibido('Ese turno es de otro barbero.');
      if ((await c.query('SELECT 1 FROM movimiento_caja WHERE turno_id = $1 AND anulado_en IS NULL', [r.id])).rows.length) throw conflicto('Ese turno ya se cobró.');
      await c.query('UPDATE movimiento_caja SET turno_id = NULL WHERE turno_id = $1', [r.id]);
      await c.query('DELETE FROM turno WHERE id = $1', [r.id]);
      await c.query('INSERT INTO turno_borrado (codigo, barbero_id) VALUES ($1, $2)', [codigo, r.barbero_id]);
      tocados.delete(codigo);
    }
    await c.query('SET CONSTRAINTS un_turno_por_hora IMMEDIATE');
  }

  // ---- Caja
  if (p.mov) {
    for (const m of p.mov.nuevos) {
      let turnoId = null, barbero = null;
      if (m.turno) {
        const t = (await c.query('SELECT id, barbero_id FROM turno WHERE codigo = $1', [m.turno])).rows[0];
        if (!t) throw conflicto('Ese turno ya no existe.');
        turnoId = t.id; barbero = t.barbero_id;
      }
      if (!dueno && (m.cat !== 'servicio' || !m.turno || 'b' + barbero !== miBarbero)) throw prohibido('Solo podés cobrar tus turnos.');
      const { rows } = await c.query(
        `INSERT INTO movimiento_caja (ref, fecha_hora, tipo, categoria, concepto, monto, medio_pago, turno_id, barbero_id, cantidad)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [m.id, msDe(m.fecha, m.min), m.tipo, m.cat, m.concepto, m.monto, m.medio, turnoId, barbero, m.cantidad || null]);
      movNuevos.push(rows[0].id);
    }
    for (const ref of p.mov.quitados) {
      const m = (await c.query('SELECT id, categoria, barbero_id, anulado_en FROM movimiento_caja WHERE ref = $1 FOR UPDATE', [ref])).rows[0];
      if (!m || m.anulado_en) continue;
      if (!dueno && (m.categoria !== 'servicio' || 'b' + m.barbero_id !== miBarbero)) throw prohibido('Solo podés deshacer tus cobros.');
      await c.query('UPDATE movimiento_caja SET anulado_en = now(), actualizado_en = now() WHERE id = $1', [m.id]);
    }
  }

  // ---- Movimientos de stock
  if (p.movStock && p.movStock.nuevos.length) {
    for (const m of p.movStock.nuevos) {
      const pr = (await c.query('SELECT id FROM producto WHERE ref = $1', [m.prodId])).rows[0];
      if (!pr) throw conflicto('Ese producto ya no existe.');
      await c.query('INSERT INTO movimiento_stock (ref, producto_id, tipo, cantidad, stock_antes, stock_despues, monto, costo, fecha_hora) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [m.id, pr.id, m.tipo, m.cantidad, m.antes ?? null, m.despues ?? null, m.monto ?? null, m.costo ?? null, new Date(m.ts || Date.now())]);
    }
    partes.add('stock');
  }

  // ---- Lo que tiene que quedar bien al final
  if (partes.has('config')) {
    if (!(await c.query('SELECT 1 FROM barbero WHERE activo')).rows.length) throw invalido('Tiene que quedar al menos un barbero.');
    if (!(await c.query('SELECT 1 FROM servicio WHERE activo')).rows.length) throw invalido('Tiene que quedar al menos un servicio para reservar.');
    const h = momentoPY();
    for (const id of quitados) {
      const pend = (await c.query(
        "SELECT count(*) AS n FROM turno WHERE barbero_id = $1 AND estado = 'confirmado' AND (fecha > $2 OR (fecha = $2 AND hora > $3::time))", [id, h.clave, hhmm(h.min)])).rows[0].n;
      if (pend) throw conflicto('Ese barbero todavía tiene turnos pendientes: pasalos a otro barbero o cancelalos.');
      // Su acceso al panel se cierra
      await c.query("UPDATE usuario SET activo = false WHERE barbero_id = $1 AND rol = 'barbero'", [id]);
      await c.query("DELETE FROM sesion WHERE usuario_id IN (SELECT id FROM usuario WHERE barbero_id = $1 AND rol = 'barbero')", [id]);
    }
  }
  for (const parte of partes) await subirVersion(c, parte);

  const turnos = tocados.size
    ? (await c.query(`SELECT ${COLUMNAS_TURNO} FROM turno WHERE codigo = ANY($1::text[])`, [[...tocados]])).rows.map(filaATurno) : [];
  const mov = movNuevos.length ? (await c.query(SQL_MOV + ' WHERE m.id = ANY($1::bigint[])', [movNuevos])).rows.map(filaAMov) : [];
  return { ids, turnos, mov, partes: [...partes] };
}
