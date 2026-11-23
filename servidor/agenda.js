// Reglas de la agenda: las mismas que usa la página (js/app.js), para que el servidor acepte
// exactamente los horarios que la página muestra como libres.
// Fechas como texto 'AAAA-MM-DD' y horas en minutos desde la medianoche, hora de Paraguay.

export const PASO = 30;           // los turnos empiezan cada 30 minutos
export const ANTICIPACION = 15;   // minutos mínimos entre la reserva y el turno
export const DIAS_ADELANTE = 14;  // se reserva hasta 14 días adelante

const pad = (n) => String(n).padStart(2, '0');
export function claveDe(y, mo, d) { return y + '-' + pad(mo) + '-' + pad(d); }
export function fechaDe(c) { return new Date(Date.UTC(+c.slice(0, 4), +c.slice(5, 7) - 1, +c.slice(8, 10))); }
export function sumarDias(c, n) {
  const f = new Date(fechaDe(c).getTime() + n * 86400000);
  return claveDe(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}
export function diaSemana(c) { return fechaDe(c).getUTCDay(); }
export function esFecha(c) {
  return typeof c === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c) && !isNaN(fechaDe(c)) && claveDe(fechaDe(c).getUTCFullYear(), fechaDe(c).getUTCMonth() + 1, fechaDe(c).getUTCDate()) === c;
}
export function hhmm(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
export function aMin(t) { const p = String(t || '').split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }

const formato = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
// Fecha y hora de Paraguay de un momento (por defecto, ahora)
export function momentoPY(ms) {
  const p = formato.formatToParts(new Date(ms == null ? Date.now() : ms));
  const v = (t) => p.find((q) => q.type === t).value;
  const r = { y: +v('year'), mo: +v('month'), d: +v('day'), min: (+v('hour') % 24) * 60 + (+v('minute')) };
  r.clave = claveDe(r.y, r.mo, r.d);
  return r;
}
export function empezo(t, h) { return t.fecha < h.clave || (t.fecha === h.clave && h.min >= t.min); }

export function bloques(min) { return Math.ceil(min / PASO); }

// Celular de Paraguay escrito de cualquier forma → { ok, wa: '595981123456', lindo: '0981 123 456' }
export function telInfo(t) {
  let d = String(t || '').replace(/\D/g, '');
  const vacio = d.length === 0;
  if (d.slice(0, 2) === '00') d = d.slice(2);
  if (d.slice(0, 3) === '595' && d.length >= 12) d = d.slice(3);
  if (d.charAt(0) === '0') d = d.slice(1);
  const ok = /^9\d{8}$/.test(d);
  return { ok, vacio, wa: ok ? '595' + d : '', lindo: ok ? '0' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : '' };
}
export function sinAcentos(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
// Nombre para comparar: minúsculas, sin acentos ni espacios de más. "Cliente sin turno" no cuenta como nombre.
export function nombreNorm(n) {
  const s = sinAcentos(String(n || '').trim().replace(/\s+/g, ' '));
  return s === 'cliente sin turno' || s === 'cliente' ? '' : s;
}

// La agenda de un local: su horario por día (horas) y los cambios de horario (bloqueos).
// horas: { 0..6: [[desde, hasta], …] }
// bloqueos: [{ tipo: 'cerrado' | 'franja' | 'especial', fecha, hasta, desde, fin, barbero? }]
// barbero: { id: 'b1', dias: { 0..6: [desde, hasta] | null } }
// turnos: [{ id, fecha, min, dur, estado, barbero }]
export function crearAgenda(horas, bloqueos) {
  function bloqueosDel(clave, barbero) {
    return bloqueos.filter((b) => (b.barbero || '') === (barbero || '') &&
      (b.tipo === 'cerrado' ? clave >= b.fecha && clave <= b.hasta : b.fecha === clave));
  }
  function restarFranja(tramos, desde, fin) {
    const quedan = [];
    tramos.forEach((t) => {
      if (fin <= t[0] || desde >= t[1]) { quedan.push(t); return; }
      if (desde > t[0]) quedan.push([t[0], desde]);
      if (fin < t[1]) quedan.push([fin, t[1]]);
    });
    return quedan;
  }
  // Tramos en que se atiende ese día: el horario normal con los cambios del dueño
  function horasDe(clave) {
    let tramos = (horas[diaSemana(clave)] || []).map((t) => t.slice());
    const cambios = bloqueosDel(clave);
    if (cambios.some((b) => b.tipo === 'cerrado')) return [];
    const esp = cambios.find((b) => b.tipo === 'especial');
    if (esp) tramos = [[esp.desde, esp.fin]];
    cambios.filter((b) => b.tipo === 'franja').forEach((b) => { tramos = restarFranja(tramos, b.desde, b.fin); });
    return tramos;
  }
  // Tramos de un barbero: el horario del local recortado a sus horas, menos sus cierres propios.
  // Un día con otro horario del local, atienden todos en ese horario (salvo un cierre propio).
  function horasBarbero(b, clave) {
    if (!b) return [];
    const rango = b.dias[diaSemana(clave)];
    const especial = bloqueosDel(clave).some((x) => x.tipo === 'especial');
    if (!rango && !especial) return [];
    const tramos = [];
    horasDe(clave).forEach((t) => {
      const a = especial ? t[0] : Math.max(t[0], rango[0]);
      const z = especial ? t[1] : Math.min(t[1], rango[1]);
      if (z > a) tramos.push([a, z]);
    });
    const propios = bloqueosDel(clave, b.id);
    if (propios.some((x) => x.tipo === 'cerrado')) return [];
    let r = tramos;
    propios.filter((x) => x.tipo === 'franja').forEach((x) => { r = restarFranja(r, x.desde, x.fin); });
    return r;
  }
  function ocupacionDe(lista, clave) {
    const ocup = {};
    lista.forEach((t) => {
      if (t.fecha !== clave || t.estado === 'cancelado') return;
      for (let j = 0; j < bloques(t.dur); j++) ocup[t.min + j * PASO] = true;
    });
    return ocup;
  }
  function trabajaA(b, clave, m, dur) {
    return horasBarbero(b, clave).some((tr) => m >= tr[0] && m + dur <= tr[1]);
  }
  function libreBarbero(b, clave, m, dur, ocup) {
    if (!trabajaA(b, clave, m, dur)) return false;
    for (let j = 0; j < bloques(dur); j++) if (ocup[m + j * PASO]) return false;
    return true;
  }
  // «El que esté libre»: entre los barberos libres a esa hora, el que tiene menos turnos ese día
  function elegirBarbero(cands, clave, m, dur, turnos) {
    const libres = cands.filter((b) => libreBarbero(b, clave, m, dur, ocupacionDe(turnos.filter((t) => t.barbero === b.id), clave)));
    if (!libres.length) return null;
    const cuenta = (b) => turnos.filter((t) => t.barbero === b.id && t.fecha === clave && t.estado !== 'cancelado').length;
    return libres.map((b, i) => ({ b, n: cuenta(b), i })).sort((x, y) => x.n - y.n || x.i - y.i)[0].b;
  }
  return { bloqueosDel, horasDe, horasBarbero, ocupacionDe, trabajaA, libreBarbero, elegirBarbero };
}
