// Datos de prueba y «empezar de cero» (solo el dueño, desde el panel).
// - cargarDatosDePrueba: arma un mes de trabajo (los últimos 30 días y las próximas dos semanas) con los
//   barberos, servicios y horario que hay cargados: clientes, turnos, cobros, ventas, compras, gastos y stock.
//   Solo usa horas libres, así no pisa turnos que ya existan.
// - empezarDeCero: borra turnos, clientes, caja y stock. Quedan barberos, cuentas, fotos, servicios y horario.
import { PASO, bloques, crearAgenda, diaSemana, hhmm, momentoPY, nombreNorm, sumarDias } from './agenda.js';
import { cargarBarberos, cargarBloqueos, cargarHoras, cargarServicios, idBarbero, invalido, subirVersion } from './datos.js';
import { nuevoCodigo } from './seguridad.js';

export const DIAS_ATRAS = 30, DIAS_ADELANTE = 14;

// Números al azar que se pueden repetir con la misma semilla (para las pruebas)
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PILA = ['Juan', 'Carlos', 'José', 'Luis', 'Miguel', 'Fernando', 'Ricardo', 'Pablo', 'Víctor', 'César', 'Hernán', 'Ariel', 'Mauricio', 'Gabriel',
  'Rubén', 'Javier', 'Adrián', 'Nelson', 'Fabián', 'Cristian', 'Ezequiel', 'Derlis', 'Matías', 'Nahuel', 'Fabrizio', 'Hugo', 'Rodrigo', 'Iván', 'Óscar',
  'Lucas', 'Elías', 'Tobías', 'Gustavo', 'Alan', 'Diego', 'Marcos', 'Enzo', 'Kevin', 'Bruno', 'Sergio', 'Ramón', 'Osvaldo', 'Pedro', 'Daniel', 'Gonzalo'];
const HIJOS = ['Thiago', 'Mateo', 'Santiago', 'Benjamín', 'Joel', 'Axel', 'Dylan', 'Lautaro', 'Bautista', 'Valentín'];
const APELLIDOS = ['González', 'Benítez', 'Martínez', 'López', 'Giménez', 'Vera', 'Duarte', 'Ramírez', 'Báez', 'Rojas', 'Acosta', 'Ortiz', 'Fernández',
  'Cabrera', 'Villalba', 'Aquino', 'Ayala', 'Cáceres', 'Romero', 'Sosa', 'Núñez', 'Franco', 'Insfrán', 'Espínola', 'Ojeda', 'Galeano', 'Paredes', 'Torres',
  'Zárate', 'Brítez', 'Florentín', 'Riquelme', 'Ortellado', 'Sanabria', 'Rolón', 'Arce'];
const PREFIJOS = ['981', '982', '983', '984', '985', '971', '972', '973', '975', '976', '961', '991', '992', '994', '995'];
const NOTAS = ['Primera vez en la barbería', 'El mismo corte de siempre', 'Degradado bien bajo', 'Viene con su hijo', 'Un poco más largo arriba', 'Llega 5 minutos tarde'];
// Cuánto se pide cada servicio (los que agregó el dueño entran con peso 3)
const PESO = { corte: 30, shaver: 12, 'combo-4': 10, 'combo-1': 8, 'marcacion-barba': 8, 'combo-3': 6, ceja: 5, afeitado: 4, 'ritual-barba': 4,
  limpieza: 3, 'combo-2': 3, 'combo-5': 3, 'combo-6': 4 };
const PRODUCTOS = [
  ['hojas', 'insumo', 'Hojas de afeitar', 'Caja de 100', 'caja', 'cajas', 0, 2, 3, 45000],
  ['talco', 'insumo', 'Talco', 'Frasco de 300 g', 'frasco', 'frascos', 0, 1, 4, 18000],
  ['alcohol', 'insumo', 'Alcohol al 70 %', 'Botella de 1 litro', 'botella', 'botellas', 0, 1, 4, 15000],
  ['cuellos', 'insumo', 'Cuellos descartables', 'Rollo de 100', 'rollo', 'rollos', 0, 2, 6, 15000],
  ['toallas', 'insumo', 'Toallas descartables', 'Paquete de 50', 'paquete', 'paquetes', 0, 2, 5, 22000],
  ['cera', 'venta', 'Cera mate', 'Pote de 100 g', 'pote', 'potes', 35000, 3, 10, 25000],
  ['pomada', 'venta', 'Pomada con brillo', 'Pote de 100 g', 'pote', 'potes', 35000, 3, 8, 25000],
  ['polvo', 'venta', 'Polvo texturizador', 'Frasco de 20 g', 'frasco', 'frascos', 40000, 3, 5, 28000],
  ['aceite', 'venta', 'Aceite para barba', 'Gotero de 30 ml', 'gotero', 'goteros', 45000, 2, 6, 30000],
  ['shampoo', 'venta', 'Shampoo para barba', 'Botella de 200 ml', 'botella', 'botellas', 38000, 2, 6, 26000]
];

const msDe = (fecha, min) => Date.parse(fecha + 'T00:00:00Z') + (min + 180) * 60000;   // hora de Paraguay
const cantTxt = (n, s, p) => n + ' ' + (n === 1 ? s : p);
const minus = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const nombreServicio = (s) => (s.grupo === 'combo' ? s.nombre + ': ' + s.incluye : s.nombre);

// Inserta muchas filas en una sola consulta
async function insertar(c, tabla, filas, columnas, extra = '') {
  if (!filas.length) return [];
  const tipos = columnas.map(([n, t]) => n + ' ' + t).join(', ');
  const nombres = columnas.map(([n]) => n).join(', ');
  const { rows } = await c.query(`INSERT INTO ${tabla} (${nombres}) SELECT ${nombres} FROM json_to_recordset($1::json) AS x(${tipos}) ${extra}`, [JSON.stringify(filas)]);
  return rows;
}

export async function cargarDatosDePrueba(c, { semilla = Date.now(), ahora = Date.now() } = {}) {
  const r = azar(semilla);
  const al = (l) => l[Math.floor(r() * l.length)];
  const entre = (a, b) => a + Math.floor(r() * (b - a + 1));
  const h = momentoPY(ahora);
  const desde = sumarDias(h.clave, -DIAS_ATRAS), hasta = sumarDias(h.clave, DIAS_ADELANTE - 1);
  const horas = await cargarHoras(c);
  const barberos = (await cargarBarberos(c)).filter((b) => b.activo);
  const bloqueos = await cargarBloqueos(c, desde);
  const servicios = (await cargarServicios(c)).filter((s) => s.activo);
  if (!barberos.length || !servicios.length) throw invalido('Para cargar datos de prueba tiene que haber al menos un barbero y un servicio.');
  const agenda = crearAgenda(horas, bloqueos);
  const pesos = servicios.map((s) => PESO[s.id] ?? 3);
  const total = pesos.reduce((a, b) => a + b, 0);
  const servicioAlAzar = () => { let x = r() * total; for (let i = 0; i < servicios.length; i++) { x -= pesos[i]; if (x < 0) return servicios[i]; } return servicios[0]; };

  // ---- Clientes: algunos fijos, papás que reservan para sus hijos, uno que cambió de número
  const usados = new Set();
  const numeros = new Set((await c.query('SELECT telefono FROM cliente_alias WHERE telefono IS NOT NULL')).rows.map((x) => x.telefono));
  const nuevoNumero = () => { let wa; do wa = '595' + al(PREFIJOS) + String(entre(0, 999999)).padStart(6, '0'); while (numeros.has(wa)); numeros.add(wa); return wa; };
  const personas = [];
  while (personas.length < 70) {
    const nombre = al(PILA) + ' ' + al(APELLIDOS);
    if (usados.has(nombre)) continue;
    usados.add(nombre);
    personas.push({ nombre, wa: r() < 0.93 ? nuevoNumero() : null, peso: personas.length < 18 ? 6 : 1 });
  }
  for (let i = 0; i < 5; i++) {   // los hijos usan el número del papá
    const papa = personas[i * 3 + 1];
    if (!papa.wa) papa.wa = nuevoNumero();
    const apellido = papa.nombre.split(' ').slice(1).join(' ');
    for (let k = 0; k < (i % 2 ? 2 : 1); k++) {
      const nombre = HIJOS[(i * 2 + k) % HIJOS.length] + ' ' + apellido;
      if (usados.has(nombre)) continue;
      usados.add(nombre);
      personas.push({ nombre, wa: papa.wa, peso: 2 });
    }
  }
  const cambio = personas[0];   // cambió de número hace tres semanas
  cambio.waViejo = cambio.wa || nuevoNumero();
  cambio.wa = nuevoNumero();
  const corteNumero = sumarDias(h.clave, -21);
  const pesoTotal = personas.reduce((a, p) => a + p.peso, 0);
  const personaAlAzar = () => { let x = r() * pesoTotal; for (const p of personas) { x -= p.peso; if (x < 0) return p; } return personas[0]; };

  // ---- Turnos: cada barbero, en sus horas, solo en las horas libres
  const existentes = (await c.query("SELECT fecha, hora, duracion_min, barbero_id FROM turno WHERE fecha BETWEEN $1 AND $2 AND estado <> 'cancelado'", [desde, hasta])).rows;
  const ocupado = {};   // 'b1|fecha' → { minuto: true }
  const marcar = (b, f, m, dur) => { const k = b + '|' + f; ocupado[k] = ocupado[k] || {}; for (let j = 0; j < bloques(dur); j++) ocupado[k][m + j * PASO] = true; };
  existentes.forEach((t) => marcar('b' + t.barbero_id, t.fecha, +t.hora.slice(0, 2) * 60 + +t.hora.slice(3, 5), t.duracion_min));
  const libre = (b, f, m, dur) => { const o = ocupado[b.id + '|' + f] || {}; for (let j = 0; j < bloques(dur); j++) if (o[m + j * PASO]) return false; return agenda.trabajaA(b, f, m, dur); };
  const turnos = [], caja = [];
  const codigos = new Set();
  let nCaja = 0;
  const ref = (p) => 'prueba-' + p + '-' + (++nCaja) + '-' + Math.floor(r() * 1e6).toString(36);
  for (let k = -DIAS_ATRAS; k < DIAS_ADELANTE; k++) {
    const f = sumarDias(h.clave, k);
    const sabado = diaSemana(f) === 6;
    const lleno = k < 0 ? (sabado ? 0.82 : 0.62) : k === 0 ? 0.68 : Math.max(0.12, 0.55 - 0.035 * k);
    for (const b of barberos) {
      for (const tr of agenda.horasBarbero(b, f)) {
        for (let m = tr[0]; m + PASO <= tr[1]; m += PASO) {
          if (r() > lleno) continue;
          let s = servicioAlAzar();
          if (!libre(b, f, m, s.min)) { s = servicios.find((x) => x.min <= PASO) || s; if (!libre(b, f, m, s.min)) continue; }
          const inicio = msDe(f, m), fin = m + s.min;
          const termino = k < 0 || (k === 0 && fin <= h.min);
          const enCurso = k === 0 && m <= h.min && h.min < fin;
          const enLocal = termino && r() < 0.12;
          const anonimo = enLocal && r() < 0.5;
          const p = anonimo ? null : personaAlAzar();
          const wa = p ? (p === cambio && f < corteNumero ? p.waViejo : p.wa) : null;
          let estado = 'confirmado', medio = null, canceladoPor = null, canceladoEn = null;
          if (termino) {
            const x = r();
            estado = enLocal || x < 0.86 ? 'atendido' : x < 0.93 ? 'novino' : 'cancelado';
          } else if (!enCurso && r() < 0.07) estado = 'cancelado';
          // Cuándo se anotó: los del local, al llegar; los de la web, unos días antes (nunca después de ahora)
          const creado = Math.min(ahora - entre(5, 600) * 60000, enLocal ? inicio - entre(0, 25) * 60000 : inicio - entre(2, 140) * 3600000);
          if (estado === 'atendido') { const x = r(); medio = x < 0.55 ? 'Efectivo' : x < 0.87 ? 'Transferencia' : 'Billetera'; }
          if (estado === 'cancelado') { canceladoPor = r() < 0.7 ? 'cliente' : 'barberia'; canceladoEn = new Date(Math.min(ahora - 60000, creado + Math.max(0, inicio - creado) * r())); }
          const recordar = Math.max(creado, inicio - entre(2, 18) * 3600000);
          let codigo;
          do codigo = nuevoCodigo(); while (codigos.has(codigo));
          codigos.add(codigo);
          const t = {
            codigo, nombre: p ? p.nombre : 'Cliente sin turno', nn: p ? nombreNorm(p.nombre) : '', telefono: wa, barbero_id: idBarbero(b.id), servicio_id: s.id,
            fecha: f, hora: hhmm(m), duracion_min: s.min, precio: s.precio, estado, medio_pago: medio, nota: !enLocal && r() < 0.08 ? al(NOTAS) : null,
            sin_turno: enLocal, hora_llegada: enLocal ? hhmm(Math.max(0, m - entre(0, 20))) : null, en_local: enLocal,
            cancelado_por: canceladoPor, cancelado_en: canceladoEn, creado_en: new Date(creado),
            recordado_en: wa && !enLocal && estado !== 'cancelado' && recordar < ahora && r() < 0.7 ? new Date(recordar) : null
          };
          turnos.push(t);
          if (estado !== 'cancelado') marcar(b.id, f, m, s.min);
          if (estado === 'atendido') {
            caja.push({ ref: ref('c'), fecha_hora: new Date(msDe(f, fin)), tipo: 'entrada', categoria: 'servicio', concepto: (nombreServicio(s) + ', ' + t.nombre).slice(0, 120),
              monto: s.precio, medio_pago: medio, turno_codigo: codigo, barbero_id: t.barbero_id, cantidad: null, stock_ref: null });
          }
        }
      }
    }
  }
  // Un turno falso de la semana pasada: se canceló y el número quedó bloqueado
  const falso = turnos.find((t) => t.estado === 'cancelado' && t.telefono && t.fecha < h.clave && !t.en_local);
  if (falso) { falso.cancelado_por = 'barberia'; falso.falso = true; }

  // ---- Clientes en la base: una ficha por persona (con sus formas de reconocerla)
  const fichas = new Map();
  turnos.forEach((t) => {
    if (!t.nn && !t.telefono) return;
    const p = personas.find((x) => x.nombre === t.nombre);
    const clave = p ? p.nombre : t.telefono + '|' + t.nn;
    if (!fichas.has(clave)) fichas.set(clave, { nombre: t.nombre, nn: t.nn, telefono: p ? p.wa : t.telefono, alias: new Set(), persona: p });
    fichas.get(clave).alias.add((t.telefono || '') + '|' + t.nn);
  });
  // Si alguna de esas formas ya es de un cliente que existe, se usa ese cliente
  const aliasExistentes = new Map((await c.query('SELECT coalesce(telefono, \'\') || \'|\' || nombre_normalizado AS k, cliente_id FROM cliente_alias')).rows.map((x) => [x.k, x.cliente_id]));
  const nuevas = [];
  for (const f of fichas.values()) {
    const ya = [...f.alias].map((a) => aliasExistentes.get(a)).find(Boolean);
    if (ya) f.id = ya; else nuevas.push(f);
  }
  const creadas = await insertar(c, 'cliente', nuevas.map((f, i) => ({ i, nombre: f.nombre, nombre_normalizado: f.nn, telefono: f.telefono,
    telefono_fijo: f.persona === cambio, telefono_cambiado_en: f.persona === cambio ? new Date(msDe(corteNumero, 600)) : null })),
  [['nombre', 'text'], ['nombre_normalizado', 'text'], ['telefono', 'text'], ['telefono_fijo', 'boolean'], ['telefono_cambiado_en', 'timestamptz']],
  'RETURNING id, nombre_normalizado, telefono');
  const idNueva = new Map(creadas.map((x) => [(x.telefono || '') + '|' + x.nombre_normalizado, x.id]));
  nuevas.forEach((f) => { f.id = idNueva.get((f.telefono || '') + '|' + f.nn); });
  const alias = [];
  for (const f of fichas.values()) {
    for (const a of f.alias) if (!aliasExistentes.has(a)) { const [tel, nn] = a.split('|'); alias.push({ telefono: tel || null, nombre_normalizado: nn, cliente_id: f.id }); }
  }
  await insertar(c, 'cliente_alias', alias, [['telefono', 'text'], ['nombre_normalizado', 'text'], ['cliente_id', 'integer']], 'ON CONFLICT DO NOTHING');
  const fCambio = [...fichas.values()].find((f) => f.persona === cambio);
  if (fCambio && fCambio.id) {
    await c.query('INSERT INTO cliente_telefono_anterior (cliente_id, telefono, hasta) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [fCambio.id, cambio.waViejo, new Date(msDe(corteNumero, 600))]);
  }
  if (falso) await c.query("INSERT INTO numero_bloqueado (telefono, motivo) VALUES ($1, 'Turno falso') ON CONFLICT DO NOTHING", [falso.telefono]);

  // ---- Turnos en la base (en tandas, para no mandar consultas enormes)
  const idDe = (t) => { if (!t.nn && !t.telefono) return null; const p = personas.find((x) => x.nombre === t.nombre); return fichas.get(p ? p.nombre : t.telefono + '|' + t.nn).id; };
  const colTurno = [['codigo', 'text'], ['cliente_id', 'integer'], ['nombre_cliente', 'text'], ['telefono', 'text'], ['barbero_id', 'integer'], ['servicio_id', 'text'],
    ['fecha', 'date'], ['hora', 'time'], ['duracion_min', 'smallint'], ['precio', 'integer'], ['estado', 'text'], ['medio_pago', 'text'], ['nota', 'text'],
    ['sin_turno', 'boolean'], ['hora_llegada', 'time'], ['en_local', 'boolean'], ['falso', 'boolean'], ['cancelado_por', 'text'], ['cancelado_en', 'timestamptz'],
    ['recordado_en', 'timestamptz'], ['creado_en', 'timestamptz']];
  for (let i = 0; i < turnos.length; i += 400) {
    await insertar(c, 'turno', turnos.slice(i, i + 400).map((t) => ({ ...t, cliente_id: idDe(t), nombre_cliente: t.nombre, falso: !!t.falso })), colTurno);
  }

  // ---- Stock: carga inicial, compras, usos y ventas
  const productos = PRODUCTOS.map(([id, tipo, nombre, presentacion, uni, plural, precio, minimo, inicial, costo]) =>
    ({ ref: 'prueba-' + id + '-' + Math.floor(r() * 1e6).toString(36), tipo, nombre, presentacion, unidad: uni, unidad_plural: plural, precio_venta: precio, minimo, stock: inicial, costo }));
  const movStock = [];
  const mover = (p, tipo, cantidad, cuando, extra = {}) => {
    const antes = p.stock;
    p.stock += tipo === 'carga' || tipo === 'compra' ? cantidad : -cantidad;
    movStock.push({ ref: ref('s'), producto_ref: p.ref, tipo, cantidad, stock_antes: antes, stock_despues: p.stock, monto: extra.monto ?? null, costo: extra.costo ?? null, fecha_hora: new Date(cuando) });
  };
  productos.forEach((p) => { const n = p.stock; p.stock = 0; mover(p, 'carga', n, msDe(desde, 470)); });
  for (let k = -DIAS_ATRAS; k <= 0; k++) {
    const f = sumarDias(h.clave, k);
    if (!agenda.horasDe(f).length) continue;
    const ultimo = k === 0 ? h.min : 1080;
    if (ultimo < 540) continue;
    const cuando = (min) => msDe(f, Math.min(ultimo - 5, min));
    // Insumos que se gastan
    productos.filter((p) => p.tipo === 'insumo' && p.stock > 0 && r() < 0.22).forEach((p) => mover(p, 'uso', 1, cuando(entre(560, 1050))));
    // Ventas en el mostrador
    for (let v = 0; v < (diaSemana(f) === 6 ? 3 : 1); v++) {
      const p = al(productos.filter((x) => x.tipo === 'venta' && x.stock > 0));
      if (!p || r() > 0.7) continue;
      const n = r() < 0.85 ? 1 : 2, x = r(), medio = x < 0.6 ? 'Efectivo' : x < 0.9 ? 'Transferencia' : 'Billetera', t = cuando(entre(560, 1050));
      if (p.stock < n) continue;
      mover(p, 'venta', n, t, { monto: n * p.precio_venta });
      caja.push({ ref: ref('c'), fecha_hora: new Date(t), tipo: 'entrada', categoria: 'producto', concepto: 'Venta: ' + cantTxt(n, p.unidad, p.unidad_plural) + ' de ' + minus(p.nombre),
        monto: n * p.precio_venta, medio_pago: medio, turno_codigo: null, barbero_id: null, cantidad: n, stock_ref: movStock[movStock.length - 1].ref });
    }
    // Compras de los lunes, si algo quedó bajo
    if (diaSemana(f) === 1) {
      productos.filter((p) => p.stock <= p.minimo && p.ref.indexOf('polvo') < 0 && p.ref.indexOf('hojas') < 0).forEach((p) => {
        const n = entre(3, 6), costo = n * p.costo, t = cuando(entre(540, 600));
        mover(p, 'compra', n, t, { costo });
        caja.push({ ref: ref('c'), fecha_hora: new Date(t), tipo: 'salida', categoria: 'compra', concepto: 'Compra: ' + cantTxt(n, p.unidad, p.unidad_plural) + ' de ' + minus(p.nombre),
          monto: costo, medio_pago: r() < 0.5 ? 'Efectivo' : 'Transferencia', turno_codigo: null, barbero_id: null, cantidad: null, stock_ref: movStock[movStock.length - 1].ref });
      });
    }
    // Gastos del local
    const gastos = [];
    if (k === -26) gastos.push(['Alquiler del local', 1200000, 'Transferencia']);
    if (k === -18) gastos.push(['Luz (ANDE)', 285000, 'Transferencia']);
    if (k === -15) gastos.push(['Internet', 150000, 'Transferencia']);
    if (k === -10 || k === -3) gastos.push(['Productos de limpieza', 45000, 'Efectivo']);
    if (diaSemana(f) === 2 || diaSemana(f) === 5) gastos.push(['Bidón de agua', 12000, 'Efectivo']);
    gastos.forEach(([concepto, monto, medio]) => caja.push({ ref: ref('c'), fecha_hora: new Date(cuando(entre(540, 620))), tipo: 'salida', categoria: 'gasto', concepto, monto,
      medio_pago: medio, turno_codigo: null, barbero_id: null, cantidad: null, stock_ref: null }));
  }
  await insertar(c, 'producto', productos.map((p) => ({ ...p })), [['ref', 'text'], ['tipo', 'text'], ['nombre', 'text'], ['presentacion', 'text'], ['unidad', 'text'],
    ['unidad_plural', 'text'], ['stock', 'integer'], ['minimo', 'integer'], ['precio_venta', 'integer']]);
  await c.query(
    `INSERT INTO movimiento_stock (ref, producto_id, tipo, cantidad, stock_antes, stock_despues, monto, costo, fecha_hora)
     SELECT x.ref, p.id, x.tipo, x.cantidad, x.stock_antes, x.stock_despues, x.monto, x.costo, x.fecha_hora
     FROM json_to_recordset($1::json) AS x(ref text, producto_ref text, tipo text, cantidad integer, stock_antes integer, stock_despues integer, monto integer, costo integer, fecha_hora timestamptz)
     JOIN producto p ON p.ref = x.producto_ref`, [JSON.stringify(movStock)]);
  for (let i = 0; i < caja.length; i += 500) {
    await c.query(
      `INSERT INTO movimiento_caja (ref, fecha_hora, tipo, categoria, concepto, monto, medio_pago, turno_id, barbero_id, cantidad, movimiento_stock_id)
       SELECT x.ref, x.fecha_hora, x.tipo, x.categoria, x.concepto, x.monto, x.medio_pago, t.id, x.barbero_id, x.cantidad, s.id
       FROM json_to_recordset($1::json) AS x(ref text, fecha_hora timestamptz, tipo text, categoria text, concepto text, monto integer, medio_pago text,
         turno_codigo text, barbero_id integer, cantidad integer, stock_ref text)
       LEFT JOIN turno t ON t.codigo = x.turno_codigo LEFT JOIN movimiento_stock s ON s.ref = x.stock_ref`, [JSON.stringify(caja.slice(i, i + 500))]);
  }
  for (const parte of ['datos', 'registro', 'stock']) await subirVersion(c, parte);
  return { turnos: turnos.length, clientes: fichas.size, caja: caja.length, productos: productos.length, desde, hasta };
}

// Borra turnos, clientes, caja y stock. Quedan barberos, cuentas, fotos, servicios y horario.
export async function empezarDeCero(c) {
  await c.query(`TRUNCATE movimiento_caja, movimiento_stock, producto, turno, turno_borrado, union_clientes, clientes_distintos,
    cliente_telefono_anterior, cliente_alias, numero_bloqueado, cliente RESTART IDENTITY`);
  for (const parte of ['datos', 'registro', 'stock']) await subirVersion(c, parte);
}

