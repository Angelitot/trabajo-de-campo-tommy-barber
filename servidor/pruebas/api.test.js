// Pruebas de la API contra un PostgreSQL de verdad (se crea una base nueva y se borra al final).
// Uso: PRUEBAS_DB="postgres://usuario@localhost:5432/postgres" npm test
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { crearPool } from '../db.js';
import { migrar } from '../migraciones.js';
import { crearApp } from '../app.js';
import { asegurarDueno } from '../rutas/acceso.js';
import { diaSemana, momentoPY, sumarDias } from '../agenda.js';

const ADMIN = process.env.PRUEBAS_DB || 'postgres://postgres@localhost:5499/postgres';
const NOMBRE_DB = 'tb_prueba_' + process.pid;
let pool, servidor, URL_API;
const DUENO = { usuario: 'tommy', clave: 'Navaja.2026.fina' };

// Días con atención: de lunes a jueves hay pausa al mediodía; viernes y sábado, de corrido
const hoy = momentoPY().clave;
const dias = [];
for (let k = 1; dias.length < 6; k++) { const f = sumarDias(hoy, k); if (diaSemana(f) !== 0) dias.push(f); }
const lunAJue = dias.filter((f) => diaSemana(f) >= 1 && diaSemana(f) <= 4);
const domingo = (() => { for (let k = 1; ; k++) { const f = sumarDias(hoy, k); if (diaSemana(f) === 0) return f; } })();
const D1 = lunAJue[0], D2 = lunAJue[1];

async function api(metodo, ruta, cuerpo, token) {
  const r = await fetch(URL_API + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), Origin: 'https://tommy-barber.onrender.com' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  const tipo = r.headers.get('content-type') || '';
  return { estado: r.status, datos: tipo.includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers };
}
const reservar = (x) => api('POST', '/api/reservas', { servicio: 'corte', fecha: D1, min: 540, nombre: 'Derlis Ortiz', tel: '0981 111 222', dispositivo: 'celular-uno-123', ...x });

before(async () => {
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${NOMBRE_DB}`);
  await admin.end();
  const u = new URL(ADMIN); u.pathname = '/' + NOMBRE_DB;
  pool = crearPool(u.toString());
  await migrar(pool, { log: () => {} });
  await asegurarDueno(pool, DUENO.usuario, DUENO.clave, () => {});
  const app = crearApp({ pool, origenes: ['https://tommy-barber.onrender.com'], sinLimites: true });
  await new Promise((ok) => { servidor = app.listen(0, ok); });
  URL_API = 'http://127.0.0.1:' + servidor.address().port;
});

after(async () => {
  await new Promise((ok) => servidor.close(ok));
  await pool.end();
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${NOMBRE_DB} WITH (FORCE)`);
  await admin.end();
});

describe('página de los clientes', () => {
  let primero;

  test('salud y datos del sitio, sin datos de clientes', async () => {
    assert.equal((await api('GET', '/api/salud')).datos.ok, true);
    const r = await api('GET', '/api/sitio');
    assert.equal(r.estado, 200);
    assert.equal(r.datos.servicios.length, 13);
    assert.deepEqual(r.datos.barberos.map((b) => b.id), ['b1']);
    assert.deepEqual(r.datos.barberos[0].dias[1], [480, 1050]);
    assert.equal(r.datos.barberos[0].dias[0], null);
    assert.deepEqual(r.datos.ocupacion, []);
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://tommy-barber.onrender.com');
  });

  test('otra página no puede usar la API desde el navegador', async () => {
    const r = await fetch(URL_API + '/api/sitio', { headers: { Origin: 'https://otra-pagina.com' } });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  });

  test('reservar un turno', async () => {
    const r = await reservar();
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    primero = r.datos;
    assert.match(primero.turno.codigo, /^TB-[A-Z0-9]{6}$/);
    assert.equal(primero.turno.tel, '0981 111 222');
    assert.equal(primero.turno.barbero, 'b1');
    assert.equal(primero.turno.precio, 35000);
    assert.equal(primero.turno.dur, 30);
    assert.ok(primero.clave.length >= 40);
    const s = await api('GET', '/api/sitio');
    assert.deepEqual(s.datos.ocupacion, [{ fecha: D1, min: 540, dur: 30, barbero: 'b1' }]);
    assert.equal(JSON.stringify(s.datos).includes('Derlis'), false, 'el sitio no muestra nombres');
  });

  test('el mismo horario no se da dos veces', async () => {
    const r = await reservar({ nombre: 'Hugo Ayala', tel: '0982 333 444', dispositivo: 'celular-dos-123' });
    assert.equal(r.estado, 409);
    assert.equal(r.datos.error, 'ocupado');
  });

  test('un turno de 45 minutos no entra si pisa el siguiente', async () => {
    const r = await reservar({ servicio: 'shaver', min: 510, nombre: 'Hugo Ayala', tel: '0982 333 444', dispositivo: 'celular-dos-123' });
    assert.equal(r.datos.error, 'ocupado');
  });

  test('horarios que no se ofrecen', async () => {
    assert.equal((await reservar({ min: 720, nombre: 'A B', tel: '0983 000 001' })).datos.error, 'fuera-de-horario', 'mediodía cerrado');
    assert.equal((await reservar({ servicio: 'shaver', min: 660, nombre: 'A B', tel: '0983 000 001' })).datos.error, 'fuera-de-horario', 'termina después de las 11:30');
    assert.equal((await reservar({ fecha: domingo, nombre: 'A B', tel: '0983 000 001' })).datos.error, 'fuera-de-horario', 'domingo');
    assert.equal((await reservar({ fecha: sumarDias(hoy, -1), nombre: 'A B', tel: '0983 000 001' })).datos.error, 'fuera-de-horario', 'ayer');
    assert.equal((await reservar({ fecha: sumarDias(hoy, 14), nombre: 'A B', tel: '0983 000 001' })).datos.error, 'fuera-de-horario', 'más de 14 días');
    assert.equal((await reservar({ min: 545, nombre: 'A B', tel: '0983 000 001' })).datos.error, 'fuera-de-horario', 'fuera de los 30 minutos');
    assert.equal((await reservar({ nombre: 'A B', tel: '12345' })).estado, 400, 'número que no es de Paraguay');
    assert.equal((await reservar({ servicio: 'no-existe', nombre: 'A B', tel: '0983 000 001' })).datos.error, 'servicio');
  });

  test('una persona tiene un turno pendiente a la vez', async () => {
    const r = await reservar({ min: 600, nombre: '  derlis   ORTIZ ', dispositivo: 'celular-tres-123' });
    assert.equal(r.estado, 409);
    assert.equal(r.datos.error, 'persona');
    assert.deepEqual(r.datos.turno, { cliente: 'Derlis Ortiz', fecha: D1, min: 540 });
  });

  test('un papá reserva para sus hijos, hasta 4 turnos por número', async () => {
    for (const [i, n] of ['Thiago Ortiz', 'Mateo Ortiz', 'Lucas Ortiz'].entries()) {
      const r = await reservar({ min: 600 + i * 30, nombre: n, dispositivo: 'celular-papa-123' });
      assert.equal(r.estado, 201, JSON.stringify(r.datos));
    }
    const r = await reservar({ min: 810, nombre: 'Benja Ortiz', dispositivo: 'celular-papa-123' });
    assert.equal(r.datos.error, 'tope-numero');
    assert.equal(r.datos.cantidad, 4);
  });

  test('hasta 4 turnos pendientes desde un mismo celular', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await reservar({ fecha: D2, min: 480 + i * 30, nombre: 'Cliente ' + i + ' Vera', tel: '0971 000 10' + i, dispositivo: 'celular-mismo-1' });
      assert.equal(r.estado, 201, JSON.stringify(r.datos));
    }
    const r = await reservar({ fecha: D2, min: 780, nombre: 'Otro Vera', tel: '0971 000 199', dispositivo: 'celular-mismo-1' });
    assert.equal(r.datos.error, 'tope-celular');
  });

  test('ver, cambiar y cancelar con la clave', async () => {
    const t = primero.turno;
    const v = await api('POST', '/api/reservas/consultar', { items: [{ codigo: t.codigo, clave: primero.clave }, { codigo: t.codigo, clave: 'x'.repeat(43) }] });
    assert.equal(v.datos.turnos.length, 1);
    const mal = await api('POST', `/api/reservas/${t.codigo}/cancelar`, { clave: 'y'.repeat(43) });
    assert.equal(mal.estado, 404);
    const mismo = await api('POST', `/api/reservas/${t.codigo}/cambiar`, { clave: primero.clave, fecha: D1, min: 540 });
    assert.equal(mismo.datos.error, 'mismo');
    const ocupado = await api('POST', `/api/reservas/${t.codigo}/cambiar`, { clave: primero.clave, fecha: D1, min: 600 });
    assert.equal(ocupado.datos.error, 'ocupado');
    const c = await api('POST', `/api/reservas/${t.codigo}/cambiar`, { clave: primero.clave, fecha: D1, min: 840 });
    assert.equal(c.estado, 200, JSON.stringify(c.datos));
    assert.equal(c.datos.turno.min, 840);
    assert.deepEqual(c.datos.turno.antes, { fecha: D1, min: 540 });
    assert.ok(c.datos.turno.cambiadoEn > 0);
    // La hora de antes quedó libre
    assert.equal((await reservar({ nombre: 'Hugo Ayala', tel: '0982 333 444', dispositivo: 'celular-dos-123' })).estado, 201);
    const x = await api('POST', `/api/reservas/${t.codigo}/cancelar`, { clave: primero.clave });
    assert.equal(x.datos.turno.estado, 'cancelado');
    assert.equal(x.datos.turno.canceladoPor, 'cliente');
    assert.equal((await api('POST', `/api/reservas/${t.codigo}/cancelar`, { clave: primero.clave })).datos.error, 'inactivo');
  });
});

describe('panel', () => {
  let tokenDueno, tokenBarbero, datos;

  test('ingresar con usuario y contraseña', async () => {
    assert.equal((await api('GET', '/api/panel/datos')).estado, 401);
    const mal = await api('POST', '/api/acceso/ingresar', { usuario: 'tommy', clave: 'otra-cosa-1' });
    assert.equal(mal.estado, 401);
    const r = await api('POST', '/api/acceso/ingresar', { usuario: ' TOMMY ', clave: DUENO.clave });
    assert.equal(r.estado, 200);
    tokenDueno = r.datos.token;
    assert.equal(r.datos.yo.rol, 'dueno');
    assert.equal((await api('GET', '/api/acceso/yo', undefined, tokenDueno)).datos.yo.usuario, 'tommy');
  });

  test('muchos intentos fallidos frenan el ingreso', async () => {
    for (let i = 0; i < 5; i++) await api('POST', '/api/acceso/ingresar', { usuario: 'nadie', clave: 'mal-' + i + 'aaaaaa' });
    const r = await api('POST', '/api/acceso/ingresar', { usuario: 'nadie', clave: 'otra' });
    assert.equal(r.estado, 429);
  });

  test('el dueño ve todo', async () => {
    const r = await api('GET', '/api/panel/datos', undefined, tokenDueno);
    assert.equal(r.estado, 200);
    datos = r.datos;
    assert.ok(datos.turnos.length >= 9);
    assert.ok(datos.turnos.some((t) => t.cliente === 'Derlis Ortiz' && t.tel === '0981 111 222'));
    assert.equal(datos.registro.ids['t595981111222|derlis ortiz'] > 0, true);
    // Papá e hijos con el mismo número: fichas distintas
    const ids = ['thiago', 'mateo', 'lucas'].map((n) => datos.registro.ids['t595981111222|' + n + ' ortiz']);
    assert.equal(new Set(ids).size, 3);
    assert.deepEqual(datos.productos, []);
    assert.equal(datos.config.servicios.length, 13);
  });

  test('cobrar un turno y que otro celular no lo pise', async () => {
    const t = datos.turnos.find((x) => x.cliente === 'Thiago Ortiz');
    const r = await api('POST', '/api/panel/cambios', {
      turnos: { cambiados: [{ id: t.id, cambios: { estado: ['confirmado', 'atendido'], medio: ['', 'Efectivo'] } }] },
      mov: { nuevos: [{ id: 'mprueba1', fecha: t.fecha, min: t.min + 30, tipo: 'entrada', cat: 'servicio', concepto: 'Corte, Thiago Ortiz', monto: 35000, medio: 'Efectivo', turno: t.id }] }
    }, tokenDueno);
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.turnos[0].estado, 'atendido');
    assert.equal(r.datos.mov[0].turno, t.id);
    // Otro celular, con el turno como estaba antes, lo marca «no vino»: conflicto
    const otro = await api('POST', '/api/panel/cambios', { turnos: { cambiados: [{ id: t.id, cambios: { estado: ['confirmado', 'novino'] } }] } }, tokenDueno);
    assert.equal(otro.estado, 409);
    // El mismo cambio que ya está guardado no es conflicto
    const igual = await api('POST', '/api/panel/cambios', { turnos: { cambiados: [{ id: t.id, cambios: { estado: ['confirmado', 'atendido'] } }] } }, tokenDueno);
    assert.equal(igual.estado, 200);
    // No se cobra dos veces
    const dos = await api('POST', '/api/panel/cambios', { mov: { nuevos: [{ id: 'mprueba2', fecha: t.fecha, min: t.min, tipo: 'entrada', cat: 'servicio', concepto: 'x', monto: 1, medio: 'Efectivo', turno: t.id }] } }, tokenDueno);
    assert.equal(dos.estado, 409);
    // Deshacer el cobro
    const des = await api('POST', '/api/panel/cambios', {
      turnos: { cambiados: [{ id: t.id, cambios: { estado: ['atendido', 'confirmado'], medio: ['Efectivo', ''] } }] }, mov: { quitados: ['mprueba1'] }
    }, tokenDueno);
    assert.equal(des.estado, 200);
    const n = await api('GET', '/api/panel/novedades?desde=' + (Date.now() - 5000), undefined, tokenDueno);
    assert.ok(n.datos.movAnulados.includes('mprueba1'));
  });

  test('cliente sin turno: se anota en una hora libre y se puede deshacer', async () => {
    const base = { servicio: 'corte', cliente: 'Cliente sin turno', tel: '', nota: '', precio: 35000, dur: 30, estado: 'confirmado', medio: '', canceladoPor: '',
      canceladoEn: 0, recordadoEn: 0, avisadoEn: 0, creadoEn: Date.now(), orden: 0, sinTurno: false, llego: null, llamadoEn: 0, enLocal: true, antes: null,
      cambiadoEn: 0, barbero: 'b1', pospuesto: false, falso: false, ejemplo: false };
    const ocupado = await api('POST', '/api/panel/cambios', { turnos: { nuevos: [{ ...base, id: 'TB-AAAA11', codigo: 'TB-AAAA11', fecha: D2, min: 480 }] } }, tokenDueno);
    assert.equal(ocupado.estado, 409);
    assert.equal(ocupado.datos.error, 'ocupado');
    const r = await api('POST', '/api/panel/cambios', { turnos: { nuevos: [{ ...base, id: 'TB-AAAA11', codigo: 'TB-AAAA11', fecha: D2, min: 900 }] } }, tokenDueno);
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.turnos[0].enLocal, true);
    const s = await api('GET', '/api/sitio');
    assert.ok(s.datos.ocupacion.some((o) => o.fecha === D2 && o.min === 900));
    const b = await api('POST', '/api/panel/cambios', { turnos: { quitados: ['TB-AAAA11'] } }, tokenDueno);
    assert.equal(b.estado, 200);
    const n = await api('GET', '/api/panel/novedades?desde=' + (Date.now() - 5000), undefined, tokenDueno);
    assert.ok(n.datos.borrados.includes('TB-AAAA11'));
    // Un turno reservado por la web no se borra
    const web = datos.turnos.find((x) => x.cliente === 'Mateo Ortiz');
    assert.equal((await api('POST', '/api/panel/cambios', { turnos: { quitados: [web.id] } }, tokenDueno)).estado, 400);
  });

  test('«Pasar después»: se intercambian las horas de dos turnos', async () => {
    const a = datos.turnos.find((x) => x.cliente === 'Mateo Ortiz'), b = datos.turnos.find((x) => x.cliente === 'Lucas Ortiz');
    const r = await api('POST', '/api/panel/cambios', { turnos: { cambiados: [
      { id: a.id, cambios: { min: [a.min, b.min], pospuesto: [false, true] } }, { id: b.id, cambios: { min: [b.min, a.min] } }] } }, tokenDueno);
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    const m = Object.fromEntries(r.datos.turnos.map((t) => [t.cliente, t.min]));
    assert.deepEqual(m, { 'Mateo Ortiz': b.min, 'Lucas Ortiz': a.min });
  });

  test('barbero nuevo, su horario y su cuenta', async () => {
    const r = await api('POST', '/api/panel/cambios', {
      barberos: { nuevos: [{ id: 'xnuevo1', nombre: 'Barbero 2', activo: true, dias: { 1: [300, 1400], 2: [480, 1050], 3: [480, 1050], 4: [480, 1050], 6: [480, 720] } }] },
      bloqueos: { nuevos: [{ id: 'hprueba1', tipo: 'cerrado', fecha: D2, motivo: 'Trámite', barbero: 'xnuevo1' }] }
    }, tokenDueno);
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.ids.xnuevo1, 'b2');
    const b2 = r.datos.config.barberos.find((b) => b.id === 'b2');
    assert.deepEqual(b2.dias[6], [480, 720]);
    assert.deepEqual(b2.dias[1], [480, 1050], 'recortado al horario del local');
    assert.equal(r.datos.config.bloqueos[0].barbero, 'b2');
    const s = await api('GET', '/api/sitio');
    assert.equal(s.datos.barberos.length, 2);

    assert.equal((await api('POST', '/api/panel/cuentas', { barbero: 'b2', usuario: 'barbero2', clave: '1234567890' }, tokenDueno)).estado, 400, 'contraseña débil');
    assert.equal((await api('POST', '/api/panel/cuentas', { barbero: 'b2', usuario: 'barbero2', clave: 'barbero2abc1' }, tokenDueno)).estado, 400, 'lleva el usuario');
    const c = await api('POST', '/api/panel/cuentas', { barbero: 'b2', usuario: 'barbero2', clave: 'Tijera.Fina.77' }, tokenDueno);
    assert.equal(c.estado, 201, JSON.stringify(c.datos));
    const i = await api('POST', '/api/acceso/ingresar', { usuario: 'barbero2', clave: 'Tijera.Fina.77' });
    assert.equal(i.datos.yo.rol, 'barbero');
    assert.equal(i.datos.yo.barbero, 'b2');
    tokenBarbero = i.datos.token;
  });

  test('cada barbero ve y cambia solo lo suyo', async () => {
    const r = await reservar({ fecha: D1, min: 540, barbero: 'b2', nombre: 'Iván Rolón', tel: '0985 444 555', dispositivo: 'celular-ivan-1' });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.turno.barbero, 'b2');
    const d = await api('GET', '/api/panel/datos', undefined, tokenBarbero);
    assert.equal(d.estado, 200);
    assert.deepEqual(d.datos.turnos.map((t) => t.cliente), ['Iván Rolón']);
    assert.equal(d.datos.productos, undefined);
    assert.deepEqual(Object.keys(d.datos.registro.ids), ['t595985444555|ivan rolon']);
    const ajeno = datos.turnos.find((x) => x.cliente === 'Mateo Ortiz');
    assert.equal((await api('POST', '/api/panel/cambios', { turnos: { cambiados: [{ id: ajeno.id, cambios: { estado: ['confirmado', 'novino'] } }] } }, tokenBarbero)).estado, 403);
    const mio = d.datos.turnos[0];
    assert.equal((await api('POST', '/api/panel/cambios', { turnos: { cambiados: [{ id: mio.id, cambios: { precio: [35000, 1000] } }] } }, tokenBarbero)).estado, 403, 'no cambia precios');
    const cobro = await api('POST', '/api/panel/cambios', {
      turnos: { cambiados: [{ id: mio.id, cambios: { estado: ['confirmado', 'atendido'], medio: ['', 'Transferencia'] } }] },
      mov: { nuevos: [{ id: 'mbarb1', fecha: mio.fecha, min: 570, tipo: 'entrada', cat: 'servicio', concepto: 'Corte, Iván Rolón', monto: 35000, medio: 'Transferencia', turno: mio.id }] }
    }, tokenBarbero);
    assert.equal(cobro.estado, 200, JSON.stringify(cobro.datos));
    assert.equal((await api('POST', '/api/panel/cambios', { mov: { nuevos: [{ id: 'mbarb2', fecha: hoy, min: 600, tipo: 'salida', cat: 'gasto', concepto: 'x', monto: 5, medio: 'Efectivo' }] } }, tokenBarbero)).estado, 403);
    assert.equal((await api('POST', '/api/panel/cambios', { productos: { nuevos: [] } }, tokenBarbero)).estado, 403);
    assert.equal((await api('GET', '/api/panel/cuentas', undefined, tokenBarbero)).estado, 403);
    // El dueño ve el cobro del barbero
    const dd = await api('GET', '/api/panel/datos', undefined, tokenDueno);
    assert.ok(dd.datos.mov.some((m) => m.id === 'mbarb1' && m.barbero === 'b2'));
  });

  test('no se quita un barbero con turnos pendientes; al quitarlo se cierra su acceso', async () => {
    const cfg = (await api('GET', '/api/panel/datos', undefined, tokenDueno)).datos;
    const b2 = cfg.config.barberos.find((b) => b.id === 'b2');
    await reservar({ fecha: D1, min: 900, barbero: 'b2', nombre: 'Rodrigo Villalba', tel: '0976 111 000', dispositivo: 'celular-rodri-1' });
    const no = await api('POST', '/api/panel/cambios', { barberos: { cambiados: [{ ...b2, activo: false }] } }, tokenDueno);
    assert.equal(no.estado, 409);
    const t = (await api('GET', '/api/panel/datos', undefined, tokenDueno)).datos.turnos.find((x) => x.cliente === 'Rodrigo Villalba');
    const r = await api('POST', '/api/panel/cambios', {
      turnos: { cambiados: [{ id: t.id, cambios: { barbero: ['b2', 'b1'] } }] },
      barberos: { cambiados: [{ ...b2, activo: false }] }, bloqueos: { quitados: ['hprueba1'] }
    }, tokenDueno);
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.equal((await api('GET', '/api/panel/datos', undefined, tokenBarbero)).estado, 401);
    const ultimo = r.datos.config.barberos.find((b) => b.id === 'b1');
    assert.equal((await api('POST', '/api/panel/cambios', { barberos: { cambiados: [{ ...ultimo, activo: false }] } }, tokenDueno)).estado, 400, 'tiene que quedar uno');
  });

  test('servicios: precio nuevo, servicio agregado y quitado', async () => {
    const r = await api('POST', '/api/panel/cambios', { servicios: {
      cambiados: [{ id: 'corte', cambios: { precio: [35000, 40000] } }],
      nuevos: [{ id: 'nkids1', grupo: 'servicio', nombre: 'Corte para niños', incluye: '', min: 30, precio: 25000, activo: true }],
      historial: [{ ts: Date.now(), id: 'corte', nombre: 'Corte clásico y degradado', campo: 'precio', antes: 35000, despues: 40000 }]
    } }, tokenDueno);
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    const s = r.datos.config.servicios;
    assert.equal(s.find((x) => x.id === 'corte').precio, 40000);
    assert.equal(s.findIndex((x) => x.id === 'nkids1'), 7, 'va con los servicios, antes de los combos');
    assert.equal(r.datos.config.historial.at(-1).despues, 40000);
    assert.equal((await api('POST', '/api/panel/cambios', { servicios: { cambiados: [{ id: 'corte', cambios: { nombre: ['Corte clásico y degradado', 'Otro'] } }] } }, tokenDueno)).estado, 403, 'la lista del local no cambia de nombre');
    // Los turnos ya reservados mantienen su precio
    const d = await api('GET', '/api/panel/datos', undefined, tokenDueno);
    assert.ok(d.datos.turnos.filter((t) => t.servicio === 'corte').every((t) => t.precio === 35000));
    assert.equal((await reservar({ fecha: D2, min: 840, servicio: 'nkids1', nombre: 'Tobías Aquino', tel: '0961 222 333', dispositivo: 'celular-tobi-1' })).datos.turno.precio, 25000);
  });

  test('stock: cargar, vender y conflicto entre celulares', async () => {
    const r = await api('POST', '/api/panel/cambios', {
      productos: { nuevos: [{ id: 'pcera', tipo: 'venta', nombre: 'Cera mate', presentacion: 'Pote de 100 g', uni: ['pote', 'potes'], stock: 5, minimo: 2, precio: 35000 }] },
      movStock: { nuevos: [{ id: 'scera1', prodId: 'pcera', tipo: 'carga', cantidad: 5, ts: Date.now() }] }
    }, tokenDueno);
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.productos[0].stock, 5);
    assert.equal(r.datos.movStock[0].nombre, 'Cera mate');
    const venta = await api('POST', '/api/panel/cambios', { productos: { cambiados: [{ id: 'pcera', cambios: { stock: [5, 4] } }] } }, tokenDueno);
    assert.equal(venta.estado, 200);
    const otro = await api('POST', '/api/panel/cambios', { productos: { cambiados: [{ id: 'pcera', cambios: { stock: [5, 3] } }] } }, tokenDueno);
    assert.equal(otro.estado, 409);
    const baja = await api('POST', '/api/panel/cambios', { productos: { quitados: ['pcera'] }, movStock: { nuevos: [{ id: 'scera2', prodId: 'pcera', tipo: 'baja', cantidad: 0, ts: Date.now() }] } }, tokenDueno);
    assert.equal(baja.estado, 200);
    assert.deepEqual(baja.datos.productos, []);
  });

  test('clientes: cambio de número, fichas unidas, distintas y números bloqueados', async () => {
    let reg = (await api('GET', '/api/panel/datos', undefined, tokenDueno)).datos.registro;
    const hugo = reg.ids['t595982333444|hugo ayala'];
    const r = await api('POST', '/api/panel/clientes/numero', { id: hugo, tel: '0994 000 512', nombre: 'Hugo Ayala', anterior: '0982 333 444' }, tokenDueno);
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    reg = r.datos.registro;
    assert.equal(reg.fichas[hugo].tel, '595994000512');
    assert.deepEqual(reg.fichas[hugo].anteriores.map((a) => a.wa), ['595982333444']);
    assert.equal(reg.ids['t595994000512|hugo ayala'], hugo);
    // Su turno pendiente pasa al número nuevo
    const t = (await api('GET', '/api/panel/datos', undefined, tokenDueno)).datos.turnos.find((x) => x.cliente === 'Hugo Ayala');
    assert.equal(t.tel, '0994 000 512');
    // Reserva con el número viejo y solo el número: se lo reconoce
    const lucas = reg.ids['t595981111222|lucas ortiz'], mateo = reg.ids['t595981111222|mateo ortiz'];
    const u = await api('POST', '/api/panel/clientes/unir', { a: mateo, b: lucas }, tokenDueno);
    assert.equal(u.estado, 200);
    assert.equal(u.datos.queda, Math.min(mateo, lucas));
    assert.equal(u.datos.registro.ids['t595981111222|lucas ortiz'], u.datos.queda);
    assert.deepEqual(u.datos.registro.fichas[u.datos.queda].unidos, [Math.max(mateo, lucas)]);
    const derlis = reg.ids['t595981111222|derlis ortiz'], thiago = reg.ids['t595981111222|thiago ortiz'];
    const dd = await api('POST', '/api/panel/clientes/distintos', { a: thiago, b: derlis }, tokenDueno);
    assert.deepEqual(dd.datos.registro.distintos, [Math.min(thiago, derlis) + '-' + Math.max(thiago, derlis)]);
    const bl = await api('POST', '/api/panel/clientes/bloqueados', { wa: '595971000100', motivo: 'Turno falso' }, tokenDueno);
    assert.deepEqual(bl.datos.registro.bloqueados.map((b) => b.wa), ['595971000100']);
    const no = await reservar({ fecha: D2, min: 870, nombre: 'Quien Sea', tel: '0971 000 100', dispositivo: 'celular-x-0001' });
    assert.equal(no.estado, 403);
    assert.equal(no.datos.error, 'bloqueado');
    const des = await api('DELETE', '/api/panel/clientes/bloqueados/595971000100', undefined, tokenDueno);
    assert.deepEqual(des.datos.registro.bloqueados, []);
  });

  test('fotos: logo, foto del local y galería', async () => {
    const webp = 'data:image/webp;base64,' + Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]).toString('base64');
    assert.equal((await api('PUT', '/api/panel/fotos/logo', { src: 'data:image/png;base64,AAAA' }, tokenDueno)).estado, 400, 'no es una foto');
    const l = await api('PUT', '/api/panel/fotos/logo', { src: webp, w: 512, h: 512 }, tokenDueno);
    assert.equal(l.estado, 200, JSON.stringify(l.datos));
    assert.match(l.datos.fotos.logo, /\/api\/fotos\/logo-[a-f0-9]{10}\?v=/);
    const f = await fetch(l.datos.fotos.logo);
    assert.equal(f.headers.get('content-type'), 'image/webp');
    assert.equal(f.headers.get('cross-origin-resource-policy'), 'cross-origin');
    const fa = await api('PUT', '/api/panel/fotos/fachada', { src: webp, alt: 'Fachada nueva.', w: 1280, h: 960 }, tokenDueno);
    assert.equal(fa.datos.fotos.fachada.alt, 'Fachada nueva.');
    const fa2 = await api('PUT', '/api/panel/fotos/fachada', { alt: 'Otra descripción.' }, tokenDueno);
    assert.equal(fa2.datos.fotos.fachada.src, fa.datos.fotos.fachada.src);
    assert.equal(fa2.datos.fotos.fachada.alt, 'Otra descripción.');
    const g = await api('PUT', '/api/panel/fotos/galeria', { galeria: [{ tipo: 'nueva', id: 'g1', src: webp, alt: 'Degradado', w: 800, h: 1000 }, { tipo: 'original', n: 2 }] }, tokenDueno);
    assert.equal(g.estado, 200, JSON.stringify(g.datos));
    assert.deepEqual(g.datos.fotos.galeria.map((x) => x.tipo + (x.n ?? x.id)), ['nuevag1', 'original2']);
    const g2 = await api('PUT', '/api/panel/fotos/galeria', { galeria: [{ tipo: 'original', n: 2 }, { tipo: 'nueva', id: 'g1', alt: 'Degradado bajo' }] }, tokenDueno);
    assert.deepEqual(g2.datos.fotos.galeria.map((x) => x.tipo + (x.n ?? x.id)), ['original2', 'nuevag1']);
    assert.equal(g2.datos.fotos.galeria[1].alt, 'Degradado bajo');
    const vacia = await api('PUT', '/api/panel/fotos/galeria', { galeria: [] }, tokenDueno);
    assert.deepEqual(vacia.datos.fotos.galeria, [], 'galería vacía no es lo mismo que la original');
    const orig = await api('PUT', '/api/panel/fotos/galeria', { galeria: null }, tokenDueno);
    assert.equal(orig.datos.fotos.galeria, null);
    assert.equal((await api('DELETE', '/api/panel/fotos/logo', undefined, tokenDueno)).datos.fotos.logo, null);
    const s = await api('GET', '/api/sitio');
    assert.equal(s.datos.fotos.fachada.alt, 'Otra descripción.');
  });

  test('novedades: trae solo lo que cambió y avisa cuando cambia la configuración', async () => {
    const d = (await api('GET', '/api/panel/datos', undefined, tokenDueno)).datos;
    const v = d.versiones;
    const q = `?desde=${d.ahora}&config=${v.config}&registro=${v.registro}&stock=${v.stock}`;
    await new Promise((ok) => setTimeout(ok, 10));
    let n = (await api('GET', '/api/panel/novedades' + q, undefined, tokenDueno)).datos;
    assert.equal(n.config, undefined);
    assert.equal(n.registro, undefined);
    const r = await reservar({ fecha: D2, min: 870, nombre: 'Gustavo Vera', tel: '0985 777 888', dispositivo: 'celular-gus-1' });
    assert.equal(r.estado, 201);
    n = (await api('GET', '/api/panel/novedades' + q, undefined, tokenDueno)).datos;
    assert.ok(n.turnos.some((t) => t.cliente === 'Gustavo Vera'));
    assert.ok(n.clientes['t595985777888|gustavo vera'] > 0);
    await api('POST', '/api/panel/cambios', { bloqueos: { nuevos: [{ id: 'hprueba2', tipo: 'franja', fecha: D2, desde: 600, fin: 660, motivo: '' }] } }, tokenDueno);
    n = (await api('GET', '/api/panel/novedades' + q, undefined, tokenDueno)).datos;
    assert.ok(n.config.bloqueos.some((b) => b.id === 'hprueba2' && b.desde === 600 && b.fin === 660));
    // Con esa franja cerrada, la página no deja reservar a las 10:00
    assert.equal((await reservar({ fecha: D2, min: 600, nombre: 'Elías Martínez', tel: '0985 777 999', dispositivo: 'celular-eli-1' })).datos.error, 'fuera-de-horario');
  });

  test('cambiar la contraseña cierra las otras sesiones', async () => {
    const otra = (await api('POST', '/api/acceso/ingresar', DUENO)).datos.token;
    assert.equal((await api('POST', '/api/acceso/clave', { actual: DUENO.clave, nueva: 'corta1' }, tokenDueno)).estado, 400);
    const r = await api('POST', '/api/acceso/clave', { actual: DUENO.clave, nueva: 'Peine.Rojo.2027' }, tokenDueno);
    assert.equal(r.estado, 200);
    assert.equal((await api('GET', '/api/acceso/yo', undefined, otra)).estado, 401);
    assert.equal((await api('GET', '/api/acceso/yo', undefined, tokenDueno)).estado, 200);
    await api('POST', '/api/acceso/salir', undefined, tokenDueno);
    assert.equal((await api('GET', '/api/acceso/yo', undefined, tokenDueno)).estado, 401);
  });
});
