// Fichas de clientes: cambiar de número, unir dos fichas, marcar que son distintos y números bloqueados.
// Hace lo mismo que la página (js/app.js: cambiarNumero, unirClientes) pero en la base.
import { momentoPY, hhmm, nombreNorm, telInfo } from './agenda.js';
import { ErrorApi, invalido, subirVersion } from './datos.js';

async function ficha(c, id) {
  const cl = (await c.query('SELECT * FROM cliente WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!cl) throw new ErrorApi(404, 'no-existe', 'No existe la ficha N.º ' + id + '.');
  const anteriores = (await c.query('SELECT telefono, hasta FROM cliente_telefono_anterior WHERE cliente_id = $1 ORDER BY id', [id])).rows;
  return { cl, tel: cl.telefono_fijo && cl.telefono ? cl.telefono : '', cambioTel: cl.telefono_cambiado_en, anteriores };
}

// Junta dos fichas. Queda el N.º más antiguo; el número que queda es el último que cargó el dueño
// o, si no, el del turno más reciente. Los otros números pasan a «números anteriores».
export async function unirClientes(c, a, b) {
  const queda = Math.min(a, b), sale = Math.max(a, b);
  if (queda === sale) throw invalido('Es la misma ficha.');
  const fq = await ficha(c, queda), fs = await ficha(c, sale);
  const turnos = (await c.query(
    'SELECT telefono FROM turno WHERE cliente_id = ANY($1::int[]) AND telefono IS NOT NULL ORDER BY fecha, hora, id', [[queda, sale]])).rows;
  const nums = [fq.tel, fs.tel].concat(turnos.map((t) => t.telefono)).filter(Boolean);
  const cargado = [fq, fs].filter((f) => f.tel && f.cambioTel).sort((x, y) => y.cambioTel - x.cambioTel)[0];
  const actual = cargado ? cargado.tel : turnos.length ? turnos[turnos.length - 1].telefono : (fq.tel || fs.tel);
  const anteriores = fq.anteriores.concat(fs.anteriores).map((x) => ({ wa: x.telefono, hasta: x.hasta }));
  nums.forEach((wa) => { if (wa !== actual && !anteriores.some((x) => x.wa === wa)) anteriores.push({ wa, hasta: new Date() }); });
  const quedan = anteriores.filter((x, i) => x.wa !== actual && anteriores.findIndex((y) => y.wa === x.wa) === i);

  await c.query('UPDATE cliente_alias SET cliente_id = $1 WHERE cliente_id = $2', [queda, sale]);
  await c.query('UPDATE turno SET cliente_id = $1, actualizado_en = now() WHERE cliente_id = $2', [queda, sale]);
  await c.query('DELETE FROM cliente_telefono_anterior WHERE cliente_id = ANY($1::int[])', [[queda, sale]]);
  for (const x of quedan) await c.query('INSERT INTO cliente_telefono_anterior (cliente_id, telefono, hasta) VALUES ($1, $2, $3)', [queda, x.wa, x.hasta]);
  await c.query(
    'UPDATE cliente SET telefono = coalesce($2, telefono), telefono_fijo = $3, telefono_cambiado_en = coalesce($4, telefono_cambiado_en) WHERE id = $1',
    [queda, actual || null, !!actual, cargado ? cargado.cambioTel : null]);
  await c.query('UPDATE union_clientes SET cliente_id = $1 WHERE cliente_id = $2', [queda, sale]);
  await c.query('INSERT INTO union_clientes (cliente_id, cliente_unido_id) VALUES ($1, $2)', [queda, sale]);
  await c.query('DELETE FROM cliente WHERE id = $1', [sale]);  // sus pares «son distintos» se borran solos
  await subirVersion(c, 'registro');
  return queda;
}

// El cliente cambió de número: el anterior queda guardado y sus próximos turnos pasan al nuevo.
// nombre: el nombre con que figura en la ficha; anterior: el número que mostraba la ficha.
export async function cambiarNumero(c, id, tel, nombre, anterior) {
  const t = telInfo(tel);
  if (!t.ok) throw invalido('Escribí un celular de Paraguay, por ejemplo 0981 123 456.');
  const f = await ficha(c, id);
  const viejo = telInfo(anterior || f.tel);
  if (viejo.ok && viejo.wa !== t.wa && !f.anteriores.some((x) => x.telefono === viejo.wa)) {
    await c.query('INSERT INTO cliente_telefono_anterior (cliente_id, telefono) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, viejo.wa]);
  }
  await c.query('DELETE FROM cliente_telefono_anterior WHERE cliente_id = $1 AND telefono = $2', [id, t.wa]);
  await c.query('UPDATE cliente SET telefono = $2, telefono_fijo = true, telefono_cambiado_en = now() WHERE id = $1', [id, t.wa]);
  const h = momentoPY();
  await c.query(
    `UPDATE turno SET telefono = $2, actualizado_en = now() WHERE cliente_id = $1 AND estado = 'confirmado'
       AND (fecha > $3 OR (fecha = $3 AND hora > $4::time)) AND telefono IS DISTINCT FROM $2`, [id, t.wa, h.clave, hhmm(h.min)]);
  // Desde ahora, ese número con ese nombre es este cliente. Si ya había otra ficha así, se juntan.
  const n = nombreNorm(nombre);
  const otro = (await c.query('SELECT cliente_id FROM cliente_alias WHERE telefono = $1 AND nombre_normalizado = $2', [t.wa, n])).rows[0];
  await c.query(
    `INSERT INTO cliente_alias (telefono, nombre_normalizado, cliente_id) VALUES ($1, $2, $3)
     ON CONFLICT (telefono, nombre_normalizado) DO UPDATE SET cliente_id = EXCLUDED.cliente_id`, [t.wa, n, id]);
  await subirVersion(c, 'registro');
  if (otro && otro.cliente_id !== id) return unirClientes(c, otro.cliente_id, id);
  return id;
}

export async function marcarDistintos(c, a, b) {
  const x = Math.min(a, b), y = Math.max(a, b);
  if (x === y) throw invalido('Es la misma ficha.');
  const hay = (await c.query('SELECT count(*) AS n FROM cliente WHERE id = ANY($1::int[])', [[x, y]])).rows[0].n;
  if (hay !== 2) throw new ErrorApi(404, 'no-existe', 'Alguna de esas fichas ya no existe.');
  await c.query('INSERT INTO clientes_distintos (cliente_a, cliente_b) VALUES ($1, $2) ON CONFLICT DO NOTHING', [x, y]);
  await subirVersion(c, 'registro');
}

export async function bloquearNumero(c, wa, motivo) {
  if (!/^5959\d{8}$/.test(wa)) throw invalido('Ese número no es un celular de Paraguay.');
  await c.query('INSERT INTO numero_bloqueado (telefono, motivo) VALUES ($1, $2) ON CONFLICT DO NOTHING', [wa, String(motivo || '').slice(0, 80) || null]);
  await subirVersion(c, 'registro');
}

export async function desbloquearNumero(c, wa) {
  await c.query('DELETE FROM numero_bloqueado WHERE telefono = $1', [wa]);
  await subirVersion(c, 'registro');
}
