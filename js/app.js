/* Tommy Barber: sitio para clientes, reserva de turnos, Mis turnos y panel del dueño.
   Los datos del local están al principio (SERVICIOS, HORAS, PIN_DUENO).
   No hay servidor: los turnos, la caja y el stock se guardan en el navegador (localStorage).
   Los avisos por WhatsApp abren WhatsApp con el mensaje listo (wa.me): el dueño solo toca Enviar.
   El dueño cambia precios y duraciones desde el panel (sección Precios). */
(function () {
  'use strict';

  /* ===================== Datos del local ===================== */
  var NEGOCIO = 'Tommy Barber';
  var DIRECCION = 'Constitución esquina, Quiindy';
  var MAPS = 'https://maps.app.goo.gl/TG3mWFFuAyfFZYSr5';
  var PIN_DUENO = '2121';

  // Lista oficial de precios del local, vigente desde noviembre de 2026.
  // Las duraciones (min) son estimadas: hay que confirmarlas con el dueño.
  var SERVICIOS = [
    { id: 'corte', grupo: 'servicio', nombre: 'Corte clásico y degradado', min: 30, precio: 35000 },
    { id: 'shaver', grupo: 'servicio', nombre: 'Degradado con shaver', min: 45, precio: 40000 },
    { id: 'marcacion-barba', grupo: 'servicio', nombre: 'Marcación de barba', min: 15, precio: 20000 },
    { id: 'afeitado', grupo: 'servicio', nombre: 'Afeitado de barba', min: 20, precio: 25000 },
    { id: 'ceja', grupo: 'servicio', nombre: 'Perfilado de ceja', min: 10, precio: 10000 },
    { id: 'ritual-barba', grupo: 'servicio', nombre: 'Ritual de barba', min: 30, precio: 30000 },
    { id: 'limpieza', grupo: 'servicio', nombre: 'Limpieza de cutis', min: 30, precio: 40000 },
    { id: 'combo-1', grupo: 'combo', nombre: 'Combo 1', incluye: 'Corte + Barba + Ceja', min: 60, precio: 60000 },
    { id: 'combo-2', grupo: 'combo', nombre: 'Combo 2', incluye: 'Corte + Barba + Ceja + Limpieza', min: 90, precio: 90000 },
    { id: 'combo-3', grupo: 'combo', nombre: 'Combo 3', incluye: 'Corte + Ceja', min: 40, precio: 40000 },
    { id: 'combo-4', grupo: 'combo', nombre: 'Combo 4', incluye: 'Corte + Barba', min: 45, precio: 50000 },
    { id: 'combo-5', grupo: 'combo', nombre: 'Combo 5', incluye: 'Corte + Limpieza', min: 60, precio: 60000 },
    { id: 'combo-6', grupo: 'combo', nombre: 'Combo 6', incluye: 'Corte shaver + Ceja + Barba', min: 75, precio: 65000 }
  ];
  var SERV = {};
  SERVICIOS.forEach(function (s) { SERV[s.id] = s; });

  // La lista del local tal como viene, para poder volver a ella desde el panel
  var OFICIAL = {};
  SERVICIOS.forEach(function (s) { OFICIAL[s.id] = { precio: s.precio, min: s.min }; });
  var DURACIONES = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 90, 105, 120];

  // Horario de atención en minutos desde la medianoche (del contestador automático):
  // 480 = 08:00, 690 = 11:30, 780 = 13:00 y 1050 = 17:30.
  var HORAS = {
    0: [],
    1: [[480, 690], [780, 1050]],
    2: [[480, 690], [780, 1050]],
    3: [[480, 690], [780, 1050]],
    4: [[480, 690], [780, 1050]],
    5: [[480, 1050]],
    6: [[480, 1050]]
  };
  var PASO = 30;           // los turnos empiezan cada 30 minutos
  var ANTICIPACION = 15;   // minutos mínimos entre la reserva y el turno
  var DIAS_ADELANTE = 14;  // se reserva hasta 14 días adelante

  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MEDIOS = ['Efectivo', 'Transferencia', 'Billetera'];
  var NOMBRE_MEDIO = { Efectivo: 'Efectivo', Transferencia: 'Transferencia', Billetera: 'Billetera electrónica' };
  var COMO_PAGO = { Efectivo: 'en efectivo', Transferencia: 'por transferencia', Billetera: 'con billetera electrónica', Varios: 'con varios medios' };
  var CATEGORIAS = { servicio: 'Servicio', producto: 'Venta de producto', compra: 'Compra de stock', gasto: 'Gasto', otro: 'Otro ingreso' };
  var UNIDADES = [
    ['unidad', 'unidades'], ['caja', 'cajas'], ['frasco', 'frascos'], ['pote', 'potes'], ['botella', 'botellas'],
    ['gotero', 'goteros'], ['rollo', 'rollos'], ['paquete', 'paquetes'], ['sobre', 'sobres'], ['tubo', 'tubos'],
    ['bidón', 'bidones'], ['litro', 'litros']
  ];

  var CLAVE_RESERVAS = 'tommybarber-reservas';
  var CLAVE_PANEL = 'tommybarber-panel';
  var VERSION_DATOS = 2;
  var CLAVE_PRECIOS = 'tommybarber-precios';

  // Precios y duraciones que el dueño cambió desde el panel (se guardan en el navegador)
  function cargarPrecios() {
    var g = leerJSON(CLAVE_PRECIOS, null);
    var cambios = g && g.cambios && typeof g.cambios === 'object' ? g.cambios : {};
    SERVICIOS.forEach(function (s) {
      var o = OFICIAL[s.id];
      var c = cambios[s.id];
      s.precio = c && entero(c.precio) > 0 ? entero(c.precio) : o.precio;
      s.min = c && DURACIONES.indexOf(+c.min) >= 0 ? +c.min : o.min;
    });
    return { historial: g && Array.isArray(g.historial) ? g.historial.slice(-40) : [] };
  }
  function guardarPrecios() {
    var cambios = {};
    SERVICIOS.forEach(function (s) {
      if (s.precio !== OFICIAL[s.id].precio || s.min !== OFICIAL[s.id].min) cambios[s.id] = { precio: s.precio, min: s.min };
    });
    guardarJSON(CLAVE_PRECIOS, { version: 1, cambios: cambios, historial: PRECIOS.historial.slice(-40) });
  }
  var PRECIOS = cargarPrecios();

  /* ===================== Utilidades ===================== */
  function pad(n) { return String(n).padStart(2, '0'); }
  function hhmm(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function aMin(t) { var p = String(t || '').split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function miles(n) { return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function gs(n) { return 'Gs. ' + miles(n); }
  function cap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }
  function minus(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : ''; }
  function durTxt(m) {
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    var r = m % 60;
    return r ? h + ' h ' + r + ' min' : (h === 1 ? '1 hora' : h + ' horas');
  }
  function nombreServicio(s) { return s.grupo === 'combo' ? s.nombre + ': ' + s.incluye : s.nombre; }
  function servicioEnFrase(s) { return s.grupo === 'combo' ? s.nombre + ' (' + s.incluye.toLowerCase() + ')' : minus(s.nombre); }
  function claveDe(y, mo, d) { return y + '-' + pad(mo) + '-' + pad(d); }
  function fechaDe(c) { return new Date(Date.UTC(+c.slice(0, 4), +c.slice(5, 7) - 1, +c.slice(8, 10))); }
  function sumarDias(c, n) {
    var f = new Date(fechaDe(c).getTime() + n * 86400000);
    return claveDe(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  function diasEntre(a, b) { return Math.round((fechaDe(b) - fechaDe(a)) / 86400000); }
  function diaSemana(c) { return fechaDe(c).getUTCDay(); }
  function suma(arr) { return arr.reduce(function (a, m) { return a + m.monto; }, 0); }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function cantTxt(n, uni) { return n + ' ' + (n === 1 ? uni[0] : uni[1]); }
  function listaY(arr) { return arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1]; }
  function abrev(n) {
    if (n <= 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',').replace(',0', '') + ' M';
    return Math.round(n / 1000) + ' mil';
  }
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hashTxt(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  function rng(semilla) {
    var x = (semilla >>> 0) || 123456789;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }
  function primerNombre(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function unidadDe(singular) { return UNIDADES.find(function (u) { return u[0] === singular; }) || UNIDADES[0]; }
  function porFechaHora(a, b) { return a.fecha === b.fecha ? a.min - b.min : (a.fecha < b.fecha ? -1 : 1); }
  function leerJSON(clave, defecto) {
    try { var v = JSON.parse(localStorage.getItem(clave)); return v == null ? defecto : v; } catch (e) { return defecto; }
  }
  function guardarJSON(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento: los cambios duran hasta recargar */ }
  }

  /* ===================== Fechas de Paraguay ===================== */
  // Fecha y hora de Paraguay, aunque el dispositivo esté en otra zona horaria
  function momentoPY(ms) {
    var f = new Date(ms == null ? Date.now() : ms);
    var r = { y: f.getFullYear(), mo: f.getMonth() + 1, d: f.getDate(), wd: f.getDay(), min: f.getHours() * 60 + f.getMinutes() };
    try {
      var p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(f);
      var v = function (t) { var x = p.find(function (q) { return q.type === t; }); return x ? x.value : ''; };
      var mapa = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      if (v('year') && (v('weekday') in mapa)) {
        r = { y: +v('year'), mo: +v('month'), d: +v('day'), wd: mapa[v('weekday')], min: (+v('hour') % 24) * 60 + (+v('minute')) };
      }
    } catch (e) { /* sin zona horaria: queda la hora del dispositivo */ }
    r.clave = claveDe(r.y, r.mo, r.d);
    return r;
  }
  function ahoraPY() { return momentoPY(); }
  // Paraguay usa UTC−3 todo el año: de día y hora local a milisegundos
  function msDe(clave, min) { return fechaDe(clave).getTime() + (min + 180) * 60000; }

  // "hoy a las 14:32", "ayer a las 10:15", "el lunes 26 a las 10:15"
  function cuandoFue(ms) {
    var m = momentoPY(ms);
    var d = diasEntre(m.clave, ahoraPY().clave);
    return (d === 0 ? 'hoy' : d === 1 ? 'ayer' : 'el ' + DIAS[m.wd] + ' ' + m.d) + ' a las ' + hhmm(m.min);
  }
  // "Hoy, 14:32", "Ayer, 10:15", "Lun 26, 10:15"
  function cuandoCorto(ms) {
    var m = momentoPY(ms);
    var d = diasEntre(m.clave, ahoraPY().clave);
    return (d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : DIAS_C[m.wd] + ' ' + m.d) + ', ' + hhmm(m.min);
  }
  // "hoy a las 16:00", "mañana miércoles 28 a las 08:00", "el jueves 29 de octubre a las 08:00".
  // Con conDe: "de hoy…", "de mañana…", "del jueves…".
  function cuandoTurno(fecha, min, conDe) {
    var d = diasEntre(ahoraPY().clave, fecha);
    var f = fechaDe(fecha);
    var nombre = DIAS[f.getUTCDay()] + ' ' + f.getUTCDate();
    var base;
    if (d === 0) base = (conDe ? 'de ' : '') + 'hoy';
    else if (d === 1) base = (conDe ? 'de ' : '') + 'mañana ' + nombre;
    else base = (conDe ? 'del ' : 'el ') + nombre + ' de ' + MESES[f.getUTCMonth()];
    return base + ' a las ' + hhmm(min);
  }
  // "Hoy, martes 27", "Mañana, miércoles 28", "Jueves 29 de octubre"
  function diaTitulo(clave) {
    var d = diasEntre(ahoraPY().clave, clave);
    var f = fechaDe(clave);
    var base = DIAS[f.getUTCDay()] + ' ' + f.getUTCDate();
    if (d === 0) return 'Hoy, ' + base;
    if (d === 1) return 'Mañana, ' + base;
    return cap(base) + ' de ' + MESES[f.getUTCMonth()];
  }
  function diaLargo(clave) {
    var f = fechaDe(clave);
    return DIAS[f.getUTCDay()] + ' ' + f.getUTCDate() + ' de ' + MESES[f.getUTCMonth()];
  }

  function estadoLocal(h) {
    var tramos = HORAS[h.wd];
    var actual = tramos.find(function (t) { return h.min >= t[0] && h.min < t[1]; });
    if (actual) {
      var i = tramos.indexOf(actual);
      return {
        abierto: true,
        titulo: 'Abierto ahora',
        detalle: i < tramos.length - 1
          ? 'Hasta las ' + hhmm(actual[1]) + '. A la tarde volvemos a las ' + hhmm(tramos[i + 1][0]) + '.'
          : 'Hoy atendemos hasta las ' + hhmm(actual[1]) + '.',
        corto: 'Local abierto, hasta las ' + hhmm(actual[1])
      };
    }
    var sig = tramos.find(function (t) { return h.min < t[0]; });
    if (sig && tramos.indexOf(sig) > 0) {
      return { abierto: false, titulo: 'Volvemos a las ' + hhmm(sig[0]), detalle: 'Cerramos al mediodía. Podés reservar igual para la tarde.', corto: 'Cerrado al mediodía, vuelve a las ' + hhmm(sig[0]) };
    }
    if (sig) {
      return { abierto: false, titulo: 'Cerrado ahora', detalle: 'Abrimos hoy a las ' + hhmm(sig[0]) + '.', corto: 'Abre hoy a las ' + hhmm(sig[0]) };
    }
    var k = 1;
    while (k < 8 && HORAS[(h.wd + k) % 7].length === 0) k++;
    var nd = (h.wd + k) % 7;
    var cuando = k === 1 ? 'mañana' : 'el ' + DIAS[nd];
    return { abierto: false, titulo: 'Cerrado ahora', detalle: 'Abrimos ' + cuando + ' a las ' + hhmm(HORAS[nd][0][0]) + '.', corto: 'Cerrado, abre ' + cuando + ' a las ' + hhmm(HORAS[nd][0][0]) };
  }

  /* ===================== WhatsApp ===================== */
  // Lee un celular de Paraguay escrito de cualquier forma ("0981 123 456", "+595 981…")
  // y lo devuelve listo para wa.me (595981123456) y para mostrar (0981 123 456).
  function telInfo(t) {
    var d = String(t || '').replace(/\D/g, '');
    var vacio = d.length === 0;
    if (d.slice(0, 2) === '00') d = d.slice(2);
    if (d.slice(0, 3) === '595' && d.length >= 12) d = d.slice(3);
    if (d.charAt(0) === '0') d = d.slice(1);
    var ok = /^9\d{8}$/.test(d);
    return { ok: ok, vacio: vacio, wa: ok ? '595' + d : '', lindo: ok ? '0' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : '' };
  }
  var ES_ANDROID = /Android/i.test(navigator.userAgent || '');
  function waLink(wa, texto) { return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(texto); }
  // En Android abre la app de WhatsApp directo y, si no está instalada, va a wa.me.
  function waAppLink(wa, texto) {
    return 'intent://send/?phone=' + wa + '&text=' + encodeURIComponent(texto) +
      '#Intent;scheme=whatsapp;S.browser_fallback_url=' + encodeURIComponent(waLink(wa, texto)) + ';end';
  }
  function atributosWa(wa, texto) {
    return ES_ANDROID
      ? 'href="' + esc(waAppLink(wa, texto)) + '"'
      : 'href="' + esc(waLink(wa, texto)) + '" target="_blank" rel="noopener"';
  }
  function msjRecordatorio(t) {
    return 'Hola ' + primerNombre(t.cliente) + ', te recordamos tu turno de ' + servicioEnFrase(SERV[t.servicio]) + ' en ' + NEGOCIO + ': ' +
      cuandoTurno(t.fecha, t.min, false) + '. Te esperamos en ' + DIRECCION + '. Si no podés venir, avisanos por acá. ¡Gracias!';
  }
  function msjCancelacion(t) {
    return 'Hola ' + primerNombre(t.cliente) + ', te escribimos de ' + NEGOCIO + ': tuvimos que cancelar tu turno ' +
      cuandoTurno(t.fecha, t.min, true) + '. ¿Te queda bien otro horario?';
  }

  /* ===================== Turnos ===================== */
  // Un turno tiene la misma forma venga de la web o de los datos de ejemplo.
  function normalizarTurno(r) {
    if (!r || !r.fecha || !SERV[r.servicio]) return null;
    var min = r.min != null ? +r.min : aMin(r.hora);
    if (isNaN(min)) return null;
    var codigo = String(r.codigo || r.id || '');
    if (!codigo) return null;
    return {
      id: String(r.id || codigo), codigo: codigo, servicio: r.servicio, fecha: String(r.fecha), min: min,
      cliente: String(r.cliente || 'Cliente'), tel: String(r.tel || ''), nota: String(r.nota || ''),
      // Precio y duración con que se reservó: no cambian si después el dueño cambia la lista
      precio: +r.precio > 0 ? +r.precio : SERV[r.servicio].precio,
      dur: +r.dur > 0 ? +r.dur : SERV[r.servicio].min,
      estado: ['confirmado', 'atendido', 'novino', 'cancelado'].indexOf(r.estado) >= 0 ? r.estado : 'confirmado',
      medio: r.medio || '', canceladoPor: r.canceladoPor || '', canceladoEn: +r.canceladoEn || 0,
      recordadoEn: +r.recordadoEn || 0, avisadoEn: +r.avisadoEn || 0, creadoEn: +r.creadoEn || 0,
      ejemplo: !!r.ejemplo
    };
  }

  // Turnos reservados desde este navegador (la "base" del prototipo)
  function cargarReservas() {
    var desde = sumarDias(ahoraPY().clave, -30);
    var l = leerJSON(CLAVE_RESERVAS, []);
    return (Array.isArray(l) ? l : []).map(normalizarTurno).filter(function (t) { return t && t.fecha >= desde; });
  }
  function guardarReservas() { guardarJSON(CLAVE_RESERVAS, misReservas.slice(-100)); }
  var misReservas = cargarReservas();

  function bloques(min) { return Math.ceil(min / PASO); }
  function ocupacionDe(lista, clave) {
    var ocup = {};
    lista.forEach(function (t) {
      if (t.fecha !== clave || t.estado === 'cancelado') return;
      for (var j = 0; j < bloques(t.dur); j++) ocup[t.min + j * PASO] = true;
    });
    return ocup;
  }
  // El turno entra en un tramo del horario y no pisa otro turno
  function horarioLibre(wd, m, dur, ocup) {
    var entra = HORAS[wd].some(function (tr) { return m >= tr[0] && m + dur <= tr[1]; });
    if (!entra) return false;
    for (var j = 0; j < bloques(dur); j++) if (ocup[m + j * PASO]) return false;
    return true;
  }
  function empezo(t, h) { return t.fecha < h.clave || (t.fecha === h.clave && h.min >= t.min); }
  function estadoVisible(t, h) { return t.estado === 'confirmado' && empezo(t, h) ? 'silla' : t.estado; }

  /* ===================== Datos del panel (de ejemplo, se guardan en el navegador) ===================== */
  var NOMBRES = ['Derlis Ortiz', 'Matías Benítez', 'Nahuel Cáceres', 'Fabrizio Giménez', 'Hugo Ayala', 'Rodrigo Villalba', 'Iván Rolón',
    'Óscar Duarte', 'Lucas Brítez', 'Elías Martínez', 'Tobías Aquino', 'Junior Ramírez', 'Gustavo Vera', 'Alan Núñez', 'Diego Sanabria',
    'Marcos Florentín', 'Enzo Galeano', 'Kevin Riquelme', 'Bruno Ortellado', 'Sergio Arce'];
  var PREFIJOS_EJ = ['0981', '0982', '0971', '0961', '0985', '0976'];
  // [hora, cliente, servicio, 'novino' si no vino]
  var PLANTILLA_SEMANA = [
    [480, 0, 'corte'], [510, 1, 'shaver'], [570, 2, 'combo-4'], [630, 3, 'marcacion-barba', 'novino'], [660, 4, 'corte'],
    [780, 5, 'combo-1'], [840, 6, 'ceja'], [870, 7, 'combo-6'], [960, 8, 'limpieza'], [1020, 9, 'ritual-barba']
  ];
  var PLANTILLA_FINDE = [
    [480, 10, 'corte'], [510, 0, 'shaver'], [570, 11, 'combo-2'], [660, 1, 'corte'], [690, 4, 'marcacion-barba', 'novino'],
    [720, 2, 'combo-4'], [780, 5, 'corte'], [810, 6, 'ceja'], [840, 7, 'combo-1'], [900, 8, 'shaver'], [960, 9, 'afeitado'], [990, 12, 'combo-3']
  ];
  var POPULARES = ['corte', 'corte', 'corte', 'shaver', 'shaver', 'combo-4', 'combo-4', 'combo-1', 'marcacion-barba', 'ceja',
    'combo-3', 'ritual-barba', 'limpieza', 'combo-6', 'afeitado', 'combo-2', 'combo-5'];
  var MEDIOS_EJ = ['Efectivo', 'Efectivo', 'Transferencia', 'Efectivo', 'Billetera', 'Efectivo', 'Transferencia'];

  function telEjemplo(i) { return PREFIJOS_EJ[i % PREFIJOS_EJ.length] + ' 000 ' + (100 + (i * 37) % 900); }
  function turnoEjemplo(clave, min, ni, servicio) {
    return normalizarTurno({
      id: 'E' + clave.replace(/-/g, '') + '-' + min, codigo: 'TB-' + (1000 + hashTxt(clave + '|' + min) % 9000),
      servicio: servicio, fecha: clave, min: min, cliente: NOMBRES[ni], tel: telEjemplo(ni),
      creadoEn: msDe(sumarDias(clave, -2), 600 + ni * 7), ejemplo: true
    });
  }
  function nuevoMov(d, obj) { obj.id = 'm' + (d.nId++); d.mov.push(obj); return obj; }
  function nuevoMovStock(d, p, tipo, cantidad, ts, extra) {
    var m = momentoPY(ts);
    var r = Object.assign({ id: 's' + (d.nId++), prodId: p.id, nombre: p.nombre, uni: p.uni.slice(), tipo: tipo, cantidad: cantidad, ts: ts, fecha: m.clave, min: m.min }, extra || {});
    d.movStock.push(r);
    return r;
  }
  function productosEjemplo() {
    return [
      { id: 'hojas', tipo: 'insumo', nombre: 'Hojas de afeitar', presentacion: 'Caja de 100', uni: ['caja', 'cajas'], stock: 1, minimo: 2, precio: 0 },
      { id: 'talco', tipo: 'insumo', nombre: 'Talco', presentacion: 'Frasco de 300 g', uni: ['frasco', 'frascos'], stock: 3, minimo: 1, precio: 0 },
      { id: 'alcohol', tipo: 'insumo', nombre: 'Alcohol al 70 %', presentacion: 'Botella de 1 litro', uni: ['botella', 'botellas'], stock: 2, minimo: 1, precio: 0 },
      { id: 'cuellos', tipo: 'insumo', nombre: 'Cuellos descartables', presentacion: 'Rollo de 100', uni: ['rollo', 'rollos'], stock: 4, minimo: 2, precio: 0 },
      { id: 'toallas', tipo: 'insumo', nombre: 'Toallas descartables', presentacion: 'Paquete de 50', uni: ['paquete', 'paquetes'], stock: 3, minimo: 2, precio: 0 },
      { id: 'cera', tipo: 'venta', nombre: 'Cera mate', presentacion: 'Pote de 100 g', uni: ['pote', 'potes'], stock: 8, minimo: 3, precio: 35000 },
      { id: 'pomada', tipo: 'venta', nombre: 'Pomada con brillo', presentacion: 'Pote de 100 g', uni: ['pote', 'potes'], stock: 5, minimo: 3, precio: 35000 },
      { id: 'polvo', tipo: 'venta', nombre: 'Polvo texturizador', presentacion: 'Frasco de 20 g', uni: ['frasco', 'frascos'], stock: 2, minimo: 3, precio: 40000 },
      { id: 'aceite', tipo: 'venta', nombre: 'Aceite para barba', presentacion: 'Gotero de 30 ml', uni: ['gotero', 'goteros'], stock: 4, minimo: 2, precio: 45000 },
      { id: 'shampoo', tipo: 'venta', nombre: 'Shampoo para barba', presentacion: 'Botella de 200 ml', uni: ['botella', 'botellas'], stock: 6, minimo: 2, precio: 38000 },
      { id: 'gel', tipo: 'venta', nombre: 'Gel de fijación fuerte', presentacion: 'Pote de 250 g', uni: ['pote', 'potes'], stock: 10, minimo: 4, precio: 18000 }
    ];
  }

  // Días anteriores sin movimientos: un resumen de ejemplo por día, siempre el mismo para cada fecha
  function completarHistorial(d, h) {
    var conMov = {};
    d.mov.forEach(function (m) { conMov[m.fecha] = true; });
    for (var k = 40; k >= 1; k--) {
      var clave = sumarDias(h.clave, -k);
      var wd = diaSemana(clave);
      if (wd === 0 || conMov[clave]) continue;
      var r = rng(hashTxt(clave));
      var turnos = (wd >= 5 ? 11 : 8) + Math.floor(r() * 5);
      var ticket = 35000 + Math.floor(r() * 4) * 5000;
      nuevoMov(d, { fecha: clave, min: 1050, tipo: 'entrada', cat: 'servicio', concepto: 'Servicios del día', monto: turnos * ticket, medio: 'Varios', turnos: turnos });
      var vendidos = Math.floor(r() * 4);
      if (vendidos > 0) {
        nuevoMov(d, { fecha: clave, min: 1050, tipo: 'entrada', cat: 'producto', concepto: 'Productos vendidos', monto: vendidos * (30000 + Math.floor(r() * 4) * 5000), medio: 'Varios', cantidad: vendidos });
      }
      var dm = fechaDe(clave).getUTCDate();
      var g = null;
      if (dm === 5) g = ['compra', 'Mercadería: ceras y pomadas', 420000, 'Transferencia'];
      else if (dm === 8) g = ['gasto', 'ANDE (luz)', 185000, 'Transferencia'];
      else if (dm === 12) g = ['gasto', 'Internet', 140000, 'Transferencia'];
      else if (r() < 0.25) g = r() < 0.5 ? ['gasto', 'Bidón de agua', 12000, 'Efectivo'] : ['compra', 'Talco y alcohol', 32000, 'Efectivo'];
      if (g) nuevoMov(d, { fecha: clave, min: 1000, tipo: 'salida', cat: g[0], concepto: g[1], monto: g[2], medio: g[3] });
    }
  }

  // Turnos de ejemplo de hoy y de los próximos tres días con atención, sin pisar los reservados de verdad
  function turnosDeEjemplo(d, h) {
    var hechos = [];
    var ahora = Date.now();
    function libre(clave, wd, m, dur) { return horarioLibre(wd, m, dur, ocupacionDe(misReservas.concat(hechos), clave)); }

    var plantilla = h.wd === 0 ? [] : (h.wd >= 5 ? PLANTILLA_FINDE : PLANTILLA_SEMANA);
    plantilla.forEach(function (p, i) {
      var s = SERV[p[2]];
      if (!libre(h.clave, h.wd, p[0], s.min)) return;
      var t = turnoEjemplo(h.clave, p[0], p[1], s.id);
      var fin = p[0] + s.min;
      if (p[3] === 'novino' && fin <= h.min) {
        t.estado = 'novino';
      } else if (fin <= h.min) {
        t.estado = 'atendido';
        t.medio = MEDIOS_EJ[i % MEDIOS_EJ.length];
        nuevoMov(d, { fecha: h.clave, min: fin, tipo: 'entrada', cat: 'servicio', concepto: nombreServicio(s) + ', ' + t.cliente, monto: t.precio, medio: t.medio, turno: t.id });
      }
      if (i % 2 === 0) t.recordadoEn = msDe(sumarDias(h.clave, -1), 1080 + i * 3);
      hechos.push(t);
    });

    // Gastos y ventas de ejemplo de hoy, si ya pasó la hora
    if (h.wd !== 0) {
      if (h.min >= 520) nuevoMov(d, { fecha: h.clave, min: 520, tipo: 'salida', cat: 'gasto', concepto: 'Bidón de agua', monto: 12000, medio: 'Efectivo' });
      [[605, 'cera', 'Efectivo'], [920, 'aceite', 'Transferencia']].forEach(function (v) {
        if (h.min < v[0]) return;
        var p = d.productos.find(function (x) { return x.id === v[1]; });
        if (!p) return;
        nuevoMov(d, { fecha: h.clave, min: v[0], tipo: 'entrada', cat: 'producto', concepto: 'Venta: 1 ' + p.uni[0] + ' de ' + minus(p.nombre), monto: p.precio, medio: v[2], cantidad: 1 });
        nuevoMovStock(d, p, 'venta', 1, msDe(h.clave, v[0]), { monto: p.precio });
      });
    }

    var abiertos = 0;
    for (var k = 1; k <= 7 && abiertos < 3; k++) {
      var clave = sumarDias(h.clave, k);
      var wd = diaSemana(clave);
      if (!HORAS[wd].length) continue;
      abiertos++;
      var r = rng(hashTxt('ejemplo|' + clave));
      var usados = {};
      var prob = abiertos === 1 ? 0.3 : 0.22;
      HORAS[wd].forEach(function (tr) {
        for (var m = tr[0]; m < tr[1]; m += PASO) {
          if (r() > prob) continue;
          var sid = POPULARES[Math.floor(r() * POPULARES.length)];
          if (!libre(clave, wd, m, SERV[sid].min)) continue;
          var ni = Math.floor(r() * NOMBRES.length);
          for (var intento = 0; usados[ni] && intento < NOMBRES.length; intento++) ni = (ni + 1) % NOMBRES.length;
          usados[ni] = true;
          var t = turnoEjemplo(clave, m, ni, sid);
          if (abiertos === 1 && r() < 0.2) t.recordadoEn = ahora - 40 * 60000;
          hechos.push(t);
        }
      });
      if (abiertos === 2) {
        var primero = hechos.find(function (t) { return t.fecha === clave; });
        if (primero) { primero.estado = 'cancelado'; primero.canceladoPor = 'cliente'; primero.canceladoEn = ahora - 3 * 3600000; }
      }
    }
    d.turnos = hechos;
  }

  function stockDeEjemplo(d, h) {
    var p = {};
    d.productos.forEach(function (x) { p[x.id] = x; });
    var c3 = sumarDias(h.clave, -3);
    var c2 = sumarDias(h.clave, -2);
    var c1 = sumarDias(h.clave, -1);
    nuevoMovStock(d, p.cera, 'compra', 6, msDe(c3, 560), { costo: 150000 });
    nuevoMov(d, { fecha: c3, min: 560, tipo: 'salida', cat: 'compra', concepto: 'Compra: 6 potes de cera mate', monto: 150000, medio: 'Transferencia' });
    nuevoMovStock(d, p.cuellos, 'compra', 2, msDe(c2, 550), { costo: 30000 });
    nuevoMov(d, { fecha: c2, min: 550, tipo: 'salida', cat: 'compra', concepto: 'Compra: 2 rollos de cuellos descartables', monto: 30000, medio: 'Efectivo' });
    nuevoMovStock(d, p.hojas, 'uso', 1, msDe(c1, 1060));
    nuevoMovStock(d, p.talco, 'uso', 1, msDe(c1, 1065));
  }

  function datosNuevos(h) {
    var d = { version: VERSION_DATOS, fecha: h.clave, turnos: [], mov: [], productos: productosEjemplo(), movStock: [], nId: 1 };
    completarHistorial(d, h);
    turnosDeEjemplo(d, h);
    stockDeEjemplo(d, h);
    return d;
  }

  function cargarDatos() {
    var h = ahoraPY();
    var d = leerJSON(CLAVE_PANEL, null);
    var valido = d && d.version === VERSION_DATOS && Array.isArray(d.turnos) && Array.isArray(d.mov) &&
      Array.isArray(d.productos) && Array.isArray(d.movStock) && typeof d.nId === 'number';
    if (!valido) return datosNuevos(h);
    d.turnos = d.turnos.map(normalizarTurno).filter(Boolean);
    if (d.fecha !== h.clave) {
      // Día nuevo: turnos de ejemplo nuevos y días sin movimientos completados. La caja y el stock siguen.
      completarHistorial(d, h);
      turnosDeEjemplo(d, h);
      d.fecha = h.clave;
    }
    var limite = sumarDias(h.clave, -62);
    d.mov = d.mov.filter(function (m) { return m.fecha >= limite; });
    d.movStock = d.movStock.filter(function (m) { return m.fecha >= limite; });
    return d;
  }
  var D = cargarDatos();
  function guardarDatos() { guardarJSON(CLAVE_PANEL, D); }
  guardarDatos();

  function todosLosTurnos() { return D.turnos.concat(misReservas); }
  function buscarTurno(id) {
    return D.turnos.find(function (t) { return t.id === id; }) || misReservas.find(function (t) { return t.id === id; }) || null;
  }
  function guardarTurno(t) { if (D.turnos.indexOf(t) >= 0) guardarDatos(); else guardarReservas(); }
  function ocupacion(clave) { return ocupacionDe(todosLosTurnos(), clave); }
  function proximosMios() {
    var h = ahoraPY();
    return misReservas.filter(function (t) { return t.estado === 'confirmado' && !empezo(t, h); }).sort(porFechaHora);
  }

  /* ===================== Sitio ===================== */
  function renderEstadoHero() {
    var e = estadoLocal(ahoraPY());
    document.getElementById('estado-titulo').textContent = e.titulo;
    document.getElementById('estado-detalle').textContent = e.detalle;
    document.getElementById('poste-tubo').classList.toggle('gira', e.abierto);
    document.getElementById('poste-globo').classList.toggle('prendido', e.abierto);
  }

  function renderHeroTurno() {
    var el = document.getElementById('hero-turno');
    var p = proximosMios();
    if (!p.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = 'Tenés turno ' + esc(cuandoTurno(p[0].fecha, p[0].min, false)) + '. <a href="#mis-turnos" data-mis-turnos>Ver mis turnos</a>';
  }

  function renderPrecios() {
    function fila(s) {
      var desc = s.grupo === 'combo' ? s.incluye + '. ' + durTxt(s.min) + ' aprox.' : durTxt(s.min) + ' aprox.';
      return '<div class="precio-fila">' +
        '<div class="precio-linea"><span class="precio-nombre">' + s.nombre + '</span><span class="precio-puntos" aria-hidden="true"></span><span class="precio-valor">' + gs(s.precio) + '</span></div>' +
        '<a class="btn btn-linea" href="#reservar" data-reservar="' + s.id + '" aria-label="Reservar ' + esc(nombreServicio(s)) + '">Reservar</a>' +
        '<p class="precio-desc">' + desc + '</p>' +
      '</div>';
    }
    document.getElementById('lista-precios').innerHTML =
      '<h3 class="precios-grupo">Servicios</h3><div class="precios">' + SERVICIOS.filter(function (s) { return s.grupo === 'servicio'; }).map(fila).join('') + '</div>' +
      '<h3 class="precios-grupo">Combos</h3><div class="precios">' + SERVICIOS.filter(function (s) { return s.grupo === 'combo'; }).map(fila).join('') + '</div>';
  }

  function renderHorarios() {
    var h = ahoraPY();
    var filaHoy = h.wd === 0 ? 2 : (h.wd >= 5 ? 1 : 0);
    var filas = [['Lunes a jueves', '08:00 a 11:30 y 13:00 a 17:30'], ['Viernes y sábado', '08:00 a 17:30, de corrido'], ['Domingo', 'Cerrado']];
    document.getElementById('lista-horarios').innerHTML = filas.map(function (f, i) {
      return '<div class="horario-fila' + (i === filaHoy ? ' hoy' : '') + '">' +
        '<p class="horario-dias">' + f[0] + (i === filaHoy ? '<span class="horario-hoy">hoy</span>' : '') + '</p>' +
        '<p class="horario-horas">' + f[1] + '</p></div>';
    }).join('');
  }

  /* ===================== Reserva y Mis turnos ===================== */
  var R = { modo: 'reservar', paso: 1, servicio: null, diaIdx: null, hora: null, nombre: '', tel: '', nota: '', ultimo: null, cancelando: null, aviso: '' };

  function modeloReserva() {
    var h = ahoraPY();
    var serv = SERV[R.servicio] || null;
    var dur = serv ? serv.min : PASO;
    var lista = [];
    for (var k = 0; k < DIAS_ADELANTE; k++) {
      var clave = sumarDias(h.clave, k);
      var f = fechaDe(clave);
      var wd = f.getUTCDay();
      var ocup = ocupacion(clave);
      var slots = [];
      HORAS[wd].forEach(function (tr) {
        for (var m = tr[0]; m + dur <= tr[1]; m += PASO) {
          if (k === 0 && m < h.min + ANTICIPACION) continue;
          slots.push({ m: m, libre: horarioLibre(wd, m, dur, ocup) });
        }
      });
      lista.push({ k: k, wd: wd, clave: clave, d: f.getUTCDate(), mo: f.getUTCMonth(), slots: slots, libres: slots.filter(function (s) { return s.libre; }).length, cerrado: HORAS[wd].length === 0 });
    }
    var diaIdx = R.diaIdx;
    if (diaIdx == null || !lista[diaIdx] || lista[diaIdx].libres === 0) {
      var primero = lista.find(function (x) { return x.libres > 0; });
      diaIdx = primero ? primero.k : 0;
    }
    var dia = lista[diaIdx];
    var horaSel = R.hora != null && dia.slots.some(function (s) { return s.m === R.hora && s.libre; }) ? R.hora : null;
    var paso = R.paso;
    if (paso > 1 && paso < 4 && !serv) paso = 1;
    var nivel = !serv ? 1 : (horaSel == null ? 2 : 3);
    var tel = telInfo(R.tel);
    var nombreOk = R.nombre.trim().length >= 2;
    var resumen = '';
    var btnTxt = '';
    var puede = false;
    if (paso === 1) {
      resumen = serv ? nombreServicio(serv) + ', ' + gs(serv.precio) + ', ' + durTxt(serv.min) : 'Elegí un servicio o combo para seguir.';
      btnTxt = 'Elegir día y hora';
      puede = !!serv;
    } else if (paso === 2) {
      resumen = serv.nombre + (horaSel != null ? ', ' + DIAS[dia.wd] + ' ' + dia.d + ' a las ' + hhmm(horaSel) : '. Elegí un horario libre.');
      btnTxt = 'Seguir con mis datos';
      puede = horaSel != null;
    } else if (paso === 3) {
      if (horaSel == null) resumen = 'Ese horario ya no está libre. Volvé al paso 2 y elegí otro.';
      else if (!nombreOk) resumen = 'Falta tu nombre.';
      else if (!tel.ok) resumen = 'Falta tu número de WhatsApp.';
      else resumen = serv.nombre + ', ' + DIAS[dia.wd] + ' ' + dia.d + ' a las ' + hhmm(horaSel);
      btnTxt = 'Confirmar turno';
      puede = nombreOk && tel.ok && horaSel != null;
    }
    return {
      h: h, serv: serv, lista: lista, dia: dia, horaSel: horaSel, paso: paso, nivel: nivel,
      resumen: resumen, btnTxt: btnTxt, puede: puede,
      telAyuda: tel.vacio || tel.ok ? 'Ahí te mandamos el recordatorio del turno.' : 'Escribí un celular de Paraguay con el 09 adelante, por ejemplo 0981 123 456.'
    };
  }

  function botonServicio(s) {
    var el = s.id === R.servicio;
    var sub = s.grupo === 'combo' ? s.incluye + ', ' + durTxt(s.min) : durTxt(s.min);
    return '<button type="button" class="rv-servicio' + (el ? ' elegido' : '') + '" data-accion="servicio" data-id="' + s.id + '" data-foco="s-' + s.id + '" aria-pressed="' + el + '">' +
      '<span class="rv-s-nombre condensada">' + s.nombre + '</span><span class="rv-s-precio condensada">' + gs(s.precio) + '</span><span class="rv-s-dur">' + sub + '</span></button>';
  }

  function cuerpoReservar(v) {
    if (v.paso === 1) {
      return '<fieldset class="rv-fieldset"><legend class="rv-legend" id="rv-foco" tabindex="-1">¿Qué te hacemos?</legend>' +
        '<p class="rv-grupo">Servicios</p><div class="rv-servicios">' + SERVICIOS.filter(function (s) { return s.grupo === 'servicio'; }).map(botonServicio).join('') + '</div>' +
        '<p class="rv-grupo">Combos</p><div class="rv-servicios">' + SERVICIOS.filter(function (s) { return s.grupo === 'combo'; }).map(botonServicio).join('') + '</div>' +
        '</fieldset>';
    }
    if (v.paso === 2) {
      var dias = v.lista.map(function (x) {
        var el = x.k === v.dia.k;
        var bloq = x.libres === 0;
        var nota = x.k === 0 ? 'hoy' : (x.k === 1 ? 'mañana' : '');
        if (x.cerrado) nota = 'cerrado'; else if (bloq) nota = 'sin lugar';
        var aria = DIAS[x.wd] + ' ' + x.d + ' de ' + MESES[x.mo] + (x.cerrado ? ', cerrado' : (bloq ? ', sin lugar' : ', ' + plural(x.libres, 'horario libre', 'horarios libres')));
        return '<button type="button" class="rv-dia' + (el ? ' elegido' : '') + '" data-accion="dia" data-k="' + x.k + '" data-foco="d-' + x.k + '" aria-pressed="' + el + '" aria-label="' + aria + '"' + (bloq ? ' disabled' : '') + '>' +
          '<span class="rv-dia-sem">' + SEM[x.wd] + '</span><span class="rv-dia-num condensada">' + x.d + '</span><span class="rv-dia-nota">' + nota + '</span></button>';
      }).join('');
      var boton = function (s) {
        var el = s.m === v.horaSel;
        return '<button type="button" class="rv-hora' + (el ? ' elegido' : '') + '" data-accion="hora" data-k="' + v.dia.k + '" data-m="' + s.m + '" data-foco="h-' + s.m + '" aria-pressed="' + el + '" aria-label="' + hhmm(s.m) + (s.libre ? '' : ', ocupado') + '"' + (s.libre ? '' : ' disabled') + '>' + hhmm(s.m) + '</button>';
      };
      var franjas = [['Mañana', v.dia.slots.filter(function (s) { return s.m < 720; })], ['Tarde', v.dia.slots.filter(function (s) { return s.m >= 720; })]]
        .filter(function (f) { return f[1].length > 0; });
      return (R.aviso ? '<p class="rv-msg error" role="alert">' + esc(R.aviso) + '</p>' : '') +
        '<p class="rv-sub" id="rv-foco" tabindex="-1">Elegí el día</p><div class="rv-dias">' + dias + '</div>' +
        '<p class="rv-sub">Horarios para el ' + DIAS[v.dia.wd] + ' ' + v.dia.d + '</p>' +
        (v.dia.libres === 0 ? '<p class="rv-aviso">Ese día no queda lugar para ' + esc(minus(v.serv.nombre)) + '. Elegí otro día de la lista.</p>' : '') +
        franjas.map(function (f) { return '<p class="rv-franja">' + f[0] + '</p><div class="rv-horas">' + f[1].map(boton).join('') + '</div>'; }).join('');
    }
    if (v.paso === 3) {
      return '<div class="rv-form">' +
        '<p class="rv-sub" id="rv-foco" tabindex="-1" style="padding-bottom:0">Tus datos</p>' +
        '<div><label for="rv-nombre">Tu nombre</label><input class="campo" id="rv-nombre" data-campo="nombre" type="text" autocomplete="name" maxlength="60" value="' + esc(R.nombre) + '"></div>' +
        '<div><label for="rv-tel">Tu número de WhatsApp</label><input class="campo" id="rv-tel" data-campo="tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0981 123 456" aria-describedby="rv-tel-ayuda" value="' + esc(R.tel) + '"><p class="rv-ayuda" id="rv-tel-ayuda">' + v.telAyuda + '</p></div>' +
        '<div><label for="rv-nota">Algo que tengamos que saber <span class="suave" style="font-weight:400">(opcional)</span></label><textarea class="campo" id="rv-nota" data-campo="nota" rows="3" maxlength="200">' + esc(R.nota) + '</textarea></div>' +
        '<div class="rv-resumen-caja"><p>' + esc(nombreServicio(v.serv)) + '</p><p>' + (v.horaSel != null ? cap(diaLargo(v.dia.clave)) + ' a las ' + hhmm(v.horaSel) : 'Elegí un horario en el paso 2.') + '</p><p>' + gs(v.serv.precio) + ', se paga en la barbería.</p></div>' +
      '</div>';
    }
    return cuerpoTicket();
  }

  function confirmacionCancelar(t) {
    return '<div class="mt-confirmar" role="group" aria-label="Cancelar el turno">' +
      '<p>¿Seguro? El horario queda libre para otra persona.</p>' +
      '<div class="rv-acciones" style="margin-top:10px"><button type="button" class="btn btn-rojo btn-mini" data-accion="cancelar-mio-si" data-id="' + esc(t.id) + '" data-foco="si-' + esc(t.id) + '">Sí, cancelar</button>' +
      '<button type="button" class="btn btn-linea btn-mini" data-accion="cancelar-mio-no" data-id="' + esc(t.id) + '" data-foco="no-' + esc(t.id) + '">No, mantener</button></div></div>';
  }

  function cuerpoTicket() {
    var t = buscarTurno(R.ultimo);
    if (!t) return '<p class="rv-aviso">No encontramos ese turno.</p>';
    var s = SERV[t.servicio];
    if (t.estado === 'cancelado') {
      return '<div class="rv-ticket">' +
        '<p class="rv-confirmado condensada" id="rv-foco" tabindex="-1" style="margin:0">Turno cancelado</p>' +
        '<p class="rv-ticket-nota">Cancelaste tu turno ' + esc(cuandoTurno(t.fecha, t.min, true)) + '. El horario quedó libre.</p>' +
      '</div>' +
      '<div class="rv-acciones"><button type="button" class="btn btn-rojo" data-accion="otro" data-foco="otro">Reservar otro turno</button></div>';
    }
    var tel = telInfo(t.tel);
    return '<div class="rv-ticket">' +
        '<p class="rv-jajotopata">¡Jajotopata!</p>' +
        '<p class="rv-confirmado condensada" id="rv-foco" tabindex="-1">Turno confirmado</p>' +
        '<dl><dt>Servicio</dt><dd>' + esc(nombreServicio(s)) + '</dd><dt>Día</dt><dd>' + esc(cap(diaLargo(t.fecha))) + '</dd><dt>Hora</dt><dd>' + hhmm(t.min) + '</dd>' +
        '<dt>A nombre de</dt><dd>' + esc(t.cliente) + '</dd><dt>Precio</dt><dd>' + gs(t.precio) + '</dd><dt>Código</dt><dd>' + esc(t.codigo) + '</dd></dl>' +
        '<div class="rv-corte" aria-hidden="true"></div>' +
        '<p class="rv-ticket-nota">Te esperamos en ' + DIRECCION + '. Te vamos a recordar el turno por WhatsApp al ' + esc(tel.lindo || t.tel) + '.</p>' +
        '<p class="rv-ticket-nota">Lo encontrás en Mis turnos: desde ahí lo podés cancelar si no podés venir.</p>' +
        (R.cancelando === t.id ? confirmacionCancelar(t) : '<button type="button" class="link-btn link-rojo" data-accion="cancelar-mio" data-id="' + esc(t.id) + '" data-foco="cancelar-' + esc(t.id) + '" style="padding-left:0">Cancelar este turno</button>') +
      '</div>' +
      '<div class="rv-acciones"><a class="btn btn-negro" href="' + MAPS + '" target="_blank" rel="noopener">Cómo llegar</a><button type="button" class="btn btn-linea" data-accion="otro" data-foco="otro">Reservar otro turno</button></div>';
  }

  function itemMio(t, h) {
    var s = SERV[t.servicio];
    var activo = t.estado === 'confirmado' && !empezo(t, h);
    var estado = '';
    if (t.estado === 'cancelado') estado = t.canceladoPor === 'cliente' ? 'Lo cancelaste ' + cuandoFue(t.canceladoEn) + '.' : 'La barbería canceló este turno ' + cuandoFue(t.canceladoEn) + '.';
    else if (t.estado === 'atendido') estado = 'Atendido.';
    else if (t.estado === 'novino') estado = 'Quedó marcado como que no viniste.';
    else if (!activo) estado = 'Este turno ya empezó y no se puede cancelar.';
    return '<li class="mt-item' + (t.estado === 'cancelado' ? ' cancelado' : '') + '">' +
      '<p class="mt-cuando condensada">' + esc(cap(cuandoTurno(t.fecha, t.min, false))) + '</p>' +
      '<p class="mt-que">' + esc(nombreServicio(s)) + ', ' + gs(t.precio) + '</p>' +
      '<p class="mt-codigo">Código ' + esc(t.codigo) + '</p>' +
      (estado ? '<p class="mt-estado">' + esc(estado) + '</p>' : '') +
      (activo ? (R.cancelando === t.id ? confirmacionCancelar(t) : '<button type="button" class="link-btn link-rojo" data-accion="cancelar-mio" data-id="' + esc(t.id) + '" data-foco="cancelar-' + esc(t.id) + '" style="padding-left:0">Cancelar turno</button>') : '') +
    '</li>';
  }

  function cuerpoMisTurnos() {
    var h = ahoraPY();
    var prox = proximosMios();
    var otros = misReservas.filter(function (t) { return !(t.estado === 'confirmado' && !empezo(t, h)); })
      .sort(function (a, b) { return -porFechaHora(a, b); }).slice(0, 8);
    var msg = R.aviso ? '<p class="rv-msg" role="status">' + esc(R.aviso) + '</p>' : '';
    if (!misReservas.length) {
      return msg + '<p class="rv-sub" id="rv-foco" tabindex="-1">Todavía no hay turnos acá</p>' +
        '<p style="margin:0">Cuando reserves un turno desde este celular, lo vas a encontrar en esta lista.</p>' +
        '<div class="rv-acciones"><button type="button" class="btn btn-rojo" data-accion="modo" data-modo="reservar" data-foco="vacio-reservar">Reservar turno</button></div>';
    }
    return msg + '<p class="rv-intro-mis" id="rv-foco" tabindex="-1">Los turnos que reservaste desde este celular. Podés cancelar uno mientras no haya empezado.</p>' +
      '<p class="rv-sub">Próximos</p>' + (prox.length ? '<ul class="mt-lista">' + prox.map(function (t) { return itemMio(t, h); }).join('') + '</ul>' : '<p class="rv-aviso" style="margin-top:0">No tenés turnos próximos.</p>') +
      (otros.length ? '<p class="rv-sub">Anteriores y cancelados</p><ul class="mt-lista">' + otros.map(function (t) { return itemMio(t, h); }).join('') + '</ul>' : '');
  }

  function renderReserva(focoPaso) {
    var caja = document.getElementById('reserva');
    var tira = caja.querySelector('.rv-dias');
    var scrollTira = tira ? tira.scrollLeft : 0;
    var activo = document.activeElement;
    var foco = activo && caja.contains(activo) ? activo.getAttribute('data-foco') : null;
    var v = modeloReserva();
    var nMios = proximosMios().length;
    var enMis = R.modo === 'mis';
    var pasos = ['Servicio', 'Día y hora', 'Tus datos'].map(function (n, i) {
      var num = i + 1;
      var bloq = num > v.nivel || num === v.paso;
      return '<li><button type="button" class="rv-paso' + (num <= v.paso ? ' activo' : '') + '" data-accion="paso" data-n="' + num + '" data-foco="p-' + num + '"' + (bloq ? ' disabled' : '') + (num === v.paso ? ' aria-current="step"' : '') + '><b>' + num + '</b> ' + n + '</button></li>';
    }).join('');
    var cambiar = enMis
      ? '<button type="button" class="btn btn-linea btn-mini" data-accion="modo" data-modo="reservar" data-foco="modo">Reservar</button>'
      : '<button type="button" class="btn btn-linea btn-mini" data-accion="modo" data-modo="mis" data-foco="modo"' + (nMios ? ' aria-label="Mis turnos: ' + plural(nMios, 'turno próximo', 'turnos próximos') + '"' : '') + '>Mis turnos' + (nMios ? '<span class="contador" aria-hidden="true">' + nMios + '</span>' : '') + '</button>';
    var mostrarPie = !enMis && v.paso < 4;
    caja.innerHTML = '<div class="rv">' +
      '<div class="rv-cabeza"><div class="rv-titulo-fila"><span class="logo logo-44" aria-hidden="true"></span><h3 class="rv-titulo condensada">' + (enMis ? 'Mis turnos' : 'Reservar turno') + '</h3>' + cambiar + '</div>' +
      (mostrarPie ? '<ol class="rv-pasos" aria-label="Pasos de la reserva">' + pasos + '</ol>' : '') + '</div>' +
      '<div class="rv-cuerpo">' + (enMis ? cuerpoMisTurnos() : cuerpoReservar(v)) + '</div>' +
      (mostrarPie ? '<div class="rv-pie"><p class="rv-resumen" id="rv-resumen" aria-live="polite">' + esc(v.resumen) + '</p><button type="button" class="btn btn-rojo" id="rv-seguir" data-accion="seguir" data-foco="seguir"' + (v.puede ? '' : ' disabled') + '>' + v.btnTxt + '</button></div>' : '') +
    '</div>';
    var nuevaTira = caja.querySelector('.rv-dias');
    if (nuevaTira) nuevaTira.scrollLeft = scrollTira;
    if (focoPaso) {
      var f = document.getElementById('rv-foco');
      if (caja.getBoundingClientRect().top < 0) caja.scrollIntoView({ block: 'start' });
      if (f) f.focus({ preventScroll: true });
    } else if (foco) {
      var el = caja.querySelector('[data-foco="' + foco + '"]');
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }
  }

  function actualizarPieReserva() {
    var v = modeloReserva();
    var r = document.getElementById('rv-resumen');
    var b = document.getElementById('rv-seguir');
    var a = document.getElementById('rv-tel-ayuda');
    if (r) r.textContent = v.resumen;
    if (b) b.disabled = !v.puede;
    if (a) a.textContent = v.telAyuda;
  }

  function nuevoCodigo() {
    var usados = {};
    todosLosTurnos().forEach(function (t) { usados[t.codigo] = true; });
    var c;
    do { c = 'TB-' + (1000 + Math.floor(Math.random() * 9000)); } while (usados[c]);
    return c;
  }

  function confirmarReserva(v) {
    var s = v.serv;
    var dia = v.dia;
    var m = v.horaSel;
    // Se revisa otra vez que el horario siga libre (alguien pudo reservarlo en otra pestaña)
    misReservas = cargarReservas();
    if (!horarioLibre(dia.wd, m, s.min, ocupacion(dia.clave))) {
      R.paso = 2; R.hora = null; R.aviso = 'Alguien reservó ese horario recién. Elegí otro.';
      return;
    }
    var codigo = nuevoCodigo();
    var t = normalizarTurno({ id: codigo, codigo: codigo, servicio: s.id, fecha: dia.clave, min: m, precio: s.precio, dur: s.min, cliente: R.nombre.trim(), tel: telInfo(R.tel).lindo, nota: R.nota.trim(), creadoEn: Date.now() });
    misReservas.push(t);
    guardarReservas();
    R.ultimo = codigo; R.paso = 4; R.hora = null; R.diaIdx = null; R.aviso = ''; R.cancelando = null;
    renderHeroTurno();
  }

  function cancelarComoCliente(id) {
    var t = buscarTurno(id);
    var h = ahoraPY();
    if (!t || t.estado !== 'confirmado') return 'Este turno ya no está activo.';
    if (empezo(t, h)) return 'Este turno ya empezó y no se puede cancelar.';
    t.estado = 'cancelado'; t.canceladoPor = 'cliente'; t.canceladoEn = Date.now();
    guardarTurno(t);
    return '';
  }

  function abrirMisTurnos() {
    R.modo = 'mis'; R.aviso = ''; R.cancelando = null;
    renderReserva();
    var caja = document.getElementById('reserva');
    caja.scrollIntoView({ block: 'start' });
    var f = document.getElementById('rv-foco');
    if (f) f.focus({ preventScroll: true });
  }

  var cajaReserva = document.getElementById('reserva');
  cajaReserva.addEventListener('click', function (e) {
    var b = e.target.closest('[data-accion]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-accion');
    var id = b.getAttribute('data-id');
    if (a === 'modo') { R.modo = b.getAttribute('data-modo'); R.aviso = ''; R.cancelando = null; renderReserva(true); }
    else if (a === 'servicio') { R.servicio = b.getAttribute('data-id'); R.hora = null; renderReserva(); }
    else if (a === 'paso') { R.paso = +b.getAttribute('data-n'); R.aviso = ''; renderReserva(true); }
    else if (a === 'dia') { R.diaIdx = +b.getAttribute('data-k'); R.hora = null; R.aviso = ''; renderReserva(); }
    else if (a === 'hora') { R.diaIdx = +b.getAttribute('data-k'); R.hora = +b.getAttribute('data-m'); R.aviso = ''; renderReserva(); }
    else if (a === 'seguir') {
      var v = modeloReserva();
      if (!v.puede) return;
      if (v.paso === 1) R.paso = 2;
      else if (v.paso === 2) { R.paso = 3; R.diaIdx = v.dia.k; }
      else if (v.paso === 3) confirmarReserva(v);
      renderReserva(true);
    }
    else if (a === 'otro') {
      R.modo = 'reservar'; R.paso = 1; R.servicio = null; R.hora = null; R.diaIdx = null; R.ultimo = null; R.nota = ''; R.aviso = ''; R.cancelando = null;
      renderReserva(true);
    }
    else if (a === 'cancelar-mio') { R.cancelando = id; renderReserva(); var si = cajaReserva.querySelector('[data-accion="cancelar-mio-si"]'); if (si) si.focus({ preventScroll: true }); }
    else if (a === 'cancelar-mio-no') { R.cancelando = null; renderReserva(); var c = cajaReserva.querySelector('[data-foco="cancelar-' + id + '"]'); if (c) c.focus({ preventScroll: true }); }
    else if (a === 'cancelar-mio-si') {
      var t = buscarTurno(id);
      var error = cancelarComoCliente(id);
      R.cancelando = null;
      R.aviso = error || (t ? 'Cancelaste tu turno ' + cuandoTurno(t.fecha, t.min, true) + '. El horario quedó libre.' : '');
      if (R.modo === 'reservar' && R.paso === 4) R.aviso = error;
      renderHeroTurno();
      renderReserva(true);
      if (!panelEl.hidden && P.acceso) renderPanel();
    }
  });
  cajaReserva.addEventListener('input', function (e) {
    var c = e.target.getAttribute('data-campo');
    if (!c) return;
    R[c] = e.target.value;
    actualizarPieReserva();
  });

  document.getElementById('lista-precios').addEventListener('click', function (e) {
    var a = e.target.closest('[data-reservar]');
    if (!a) return;
    R.modo = 'reservar'; R.servicio = a.getAttribute('data-reservar');
    R.paso = 2; R.diaIdx = null; R.hora = null; R.ultimo = null; R.aviso = ''; R.cancelando = null;
    renderReserva();
  });

  document.addEventListener('click', function (e) {
    var mis = e.target.closest('[data-mis-turnos]');
    if (mis) { e.preventDefault(); if (location.hash !== '#mis-turnos') history.replaceState(null, '', '#mis-turnos'); abrirMisTurnos(); return; }
    var res = e.target.closest('a[href="#reservar"]:not([data-reservar])');
    if (res && R.modo === 'mis') { R.modo = 'reservar'; R.aviso = ''; R.cancelando = null; renderReserva(); }
  });

  /* ===================== Panel del dueño ===================== */
  var ICONOS = {
    hoy: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    turnos: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    caja: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    stock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
    precios: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    chat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/></svg>'
  };
  var DIENTES = '0,0 ' + Array.from({ length: 25 }, function (_, i) { return (i * 12 + 6) + ',10 ' + (i * 12 + 12) + ',0'; }).join(' ');
  var TITULOS = { hoy: 'Hoy', turnos: 'Turnos', caja: 'Caja', stock: 'Stock', precios: 'Precios' };
  var NOMBRE_ESTADO = { confirmado: 'Confirmado', silla: 'En la silla', atendido: 'Cobrado', novino: 'No vino', cancelado: 'Cancelado' };
  var ultimaSemana = [];

  var P = {
    acceso: false, pin: '', pinError: false, vista: 'hoy',
    abierto: null,            // { id, que: 'cobrar' | 'cancelar' | 'cancelado' } en una fila de turno
    filtroTurnos: 'proximos',
    periodo: 'hoy',
    form: { tipo: 'entrada', concepto: '', monto: '', medio: 'Efectivo' },
    avisoCaja: '',
    tabStock: 'insumo',
    nuevoAbierto: false,
    np: npVacio('insumo'),
    accionProd: null,         // { id, tipo: 'usar' | 'vender' | 'comprar' | 'editar' | 'eliminar', … }
    avisoStock: '',
    barra: null,
    borrador: {},             // precios y duraciones que el dueño está cambiando, antes de guardar
    avisoPrecios: '',
    restablecer: false,
    reiniciando: false,
    preview: null             // mensaje de WhatsApp de un turno de ejemplo
  };
  function npVacio(tipo) { return { nombre: '', tipo: tipo, presentacion: '', unidad: 'unidad', cantidad: '', minimo: '', precio: '', compra: false, costo: '', medio: 'Efectivo' }; }

  function boton(accion, id, texto, clase) {
    return '<button type="button" class="btn ' + clase + ' btn-mini" data-accion="' + accion + '" data-id="' + esc(id) + '" data-foco="' + accion + '-' + esc(id) + '">' + texto + '</button>';
  }
  // Botón de WhatsApp: en un turno real abre WhatsApp; en uno de ejemplo muestra el mensaje
  function botonWa(t, tipo, texto, clase) {
    var base = ' class="btn ' + clase + ' btn-mini" data-accion="' + tipo + '" data-id="' + esc(t.id) + '" data-foco="' + tipo + '-' + esc(t.id) + '"';
    if (t.ejemplo) return '<button type="button"' + base + '>' + ICONOS.chat + texto + '</button>';
    var texto2 = tipo === 'avisar' ? msjCancelacion(t) : msjRecordatorio(t);
    return '<a ' + atributosWa(telInfo(t.tel).wa, texto2) + base + '>' + ICONOS.chat + texto + '<span class="solo-lector"> (abre WhatsApp)</span></a>';
  }

  function siguienteDiaAbierto(h) {
    for (var k = 1; k <= 7; k++) {
      var c = sumarDias(h.clave, k);
      if (HORAS[diaSemana(c)].length) return c;
    }
    return null;
  }

  function filaTurno(t, h, ctx) {
    var s = SERV[t.servicio];
    var ev = estadoVisible(t, h);
    var tel = telInfo(t.tel);
    var abierto = P.abierto && P.abierto.id === t.id ? P.abierto.que : '';
    var antes = t.estado === 'confirmado' && !empezo(t, h);
    var enCurso = t.estado === 'confirmado' && empezo(t, h);
    var nombre = esc(primerNombre(t.cliente));
    var det = esc(nombreServicio(s)) + ', ' + gs(t.precio);
    if (t.estado === 'atendido' && t.medio) det += '. Pagó ' + (COMO_PAGO[t.medio] || esc(t.medio));
    var extra = [];
    if (t.tel) extra.push('WhatsApp ' + esc(tel.lindo || t.tel));
    if (t.nota) extra.push('Nota: ' + esc(t.nota));
    if (t.estado === 'cancelado') {
      extra.push((t.canceladoPor === 'cliente' ? 'Lo canceló el cliente ' : 'Lo cancelaste ') + cuandoFue(t.canceladoEn) + (t.avisadoEn ? '. Le avisaste ' + cuandoFue(t.avisadoEn) : '') + '.');
    } else if (t.recordadoEn && t.estado === 'confirmado') {
      extra.push('Recordatorio enviado ' + cuandoFue(t.recordadoEn) + '.');
    }
    var acciones = [];
    if (!abierto) {
      // El verde marca lo urgente: los turnos del próximo día que todavía no tienen recordatorio
      var urgente = ctx === 'turnos' && !t.recordadoEn && t.fecha === siguienteDiaAbierto(h);
      if (antes && tel.ok) acciones.push(botonWa(t, 'recordar', t.recordadoEn ? 'Recordar de nuevo' : 'Recordar por WhatsApp', urgente ? 'btn-wa' : 'btn-linea'));
      if (ctx === 'hoy' && (antes || enCurso)) acciones.push(boton('cobrar-abrir', t.id, 'Cobrar', 'btn-negro'));
      if (enCurso) acciones.push(boton('novino', t.id, 'No vino', 'btn-linea'));
      if (antes) acciones.push(boton('cancelar-abrir', t.id, 'Cancelar', 'btn-linea'));
      if (t.estado === 'cancelado' && t.canceladoPor === 'barberia' && !t.avisadoEn && tel.ok && !empezo(t, h)) acciones.push(botonWa(t, 'avisar', 'Avisar por WhatsApp', 'btn-wa'));
    }
    var panel = '';
    if (abierto === 'cobrar') {
      panel = '<div class="turno-panel" role="group" aria-label="Cobrar el turno de ' + nombre + '"><span class="turno-panel-txt">¿Cómo pagó ' + nombre + '?</span>' +
        MEDIOS.map(function (m) { return '<button type="button" class="btn btn-claro btn-mini" data-accion="cobrar" data-id="' + esc(t.id) + '" data-medio="' + m + '" data-foco="medio-' + esc(t.id) + '-' + m + '">' + NOMBRE_MEDIO[m] + '</button>'; }).join('') +
        '<button type="button" class="link-btn" data-accion="cerrar-panel" data-id="' + esc(t.id) + '">Cancelar</button></div>';
    } else if (abierto === 'cancelar') {
      panel = '<div class="turno-panel" role="group" aria-label="Cancelar el turno de ' + nombre + '"><span class="turno-panel-txt">¿Cancelar el turno de ' + nombre + '? El horario queda libre.</span>' +
        '<button type="button" class="btn btn-rojo btn-mini" data-accion="cancelar-si" data-id="' + esc(t.id) + '" data-foco="cancelar-si-' + esc(t.id) + '">Sí, cancelar</button>' +
        '<button type="button" class="link-btn" data-accion="cerrar-panel" data-id="' + esc(t.id) + '">No</button></div>';
    } else if (abierto === 'cancelado') {
      panel = '<div class="turno-panel" role="status"><span class="turno-panel-txt">Turno cancelado.' + (tel.ok ? ' ¿Le avisás a ' + nombre + '?' : '') + '</span>' +
        (tel.ok ? botonWa(t, 'avisar', 'Avisar por WhatsApp', 'btn-wa') : '') +
        '<button type="button" class="link-btn" data-accion="cerrar-panel" data-id="' + esc(t.id) + '" data-foco="cerrar-' + esc(t.id) + '">' + (tel.ok ? 'Ahora no' : 'Listo') + '</button></div>';
    }
    return '<li class="turno' + (t.estado === 'cancelado' ? ' cancelado' : '') + (t.estado === 'novino' ? ' novino' : '') + '">' +
      '<p class="turno-hora">' + hhmm(t.min) + '</p>' +
      '<div class="turno-info"><div class="turno-cab"><p class="turno-cliente">' + esc(t.cliente) + '</p><span class="pill pill-' + ev + '">' + NOMBRE_ESTADO[ev] + '</span></div>' +
        '<p class="turno-det">' + det + '</p>' + (extra.length ? '<p class="turno-extra">' + extra.join('<br>') + '</p>' : '') + '</div>' +
      (acciones.length ? '<div class="turno-acciones">' + acciones.join('') + '</div>' : '') +
      panel +
    '</li>';
  }

  function modeloHoy(h) {
    var turnosHoy = todosLosTurnos().filter(function (t) { return t.fecha === h.clave; }).sort(porFechaHora);
    var activos = turnosHoy.filter(function (t) { return t.estado !== 'cancelado'; });
    var movHoy = D.mov.filter(function (m) { return m.fecha === h.clave; }).sort(function (a, b) { return a.min - b.min; });
    var entradas = movHoy.filter(function (m) { return m.tipo === 'entrada'; });
    var salidas = movHoy.filter(function (m) { return m.tipo === 'salida'; });
    var prodHoy = entradas.filter(function (m) { return m.cat === 'producto'; });
    var unidades = prodHoy.reduce(function (a, m) { return a + (m.cantidad || 1); }, 0);
    var atendidos = activos.filter(function (t) { return t.estado === 'atendido'; }).length;
    var faltas = activos.filter(function (t) { return t.estado === 'novino'; }).length;
    var pendientes = activos.filter(function (t) { return t.estado === 'confirmado'; }).length;
    return {
      turnosHoy: turnosHoy, activos: activos, movHoy: movHoy, atendidos: atendidos, pendientes: pendientes,
      cifras: [
        { label: 'Cobrado hoy', valor: gs(suma(entradas)), nota: 'En efectivo: ' + gs(suma(entradas.filter(function (m) { return m.medio === 'Efectivo'; }))) },
        activos.length
          ? { label: 'Turnos atendidos', valor: atendidos + ' de ' + activos.length, nota: faltas === 0 ? 'Nadie faltó' : (faltas === 1 ? '1 cliente no vino' : faltas + ' clientes no vinieron') }
          : { label: 'Turnos atendidos', valor: '0', nota: 'Hoy no hay turnos' },
        { label: 'Productos vendidos', valor: String(unidades), nota: unidades ? 'Suman ' + gs(suma(prodHoy)) : 'Ninguno todavía' },
        { label: 'Gastos de hoy', valor: gs(suma(salidas)), nota: salidas.length ? salidas[salidas.length - 1].concepto : 'Sin gastos' }
      ],
      balance: suma(entradas) - suma(salidas)
    };
  }

  function cifra(c) {
    return '<div class="cifra"><p class="cifra-label">' + c.label + '</p><p class="cifra-valor">' + c.valor + '</p><p class="cifra-nota">' + esc(c.nota) + '</p></div>';
  }

  function avisoProximos(h) {
    var sig = siguienteDiaAbierto(h);
    var todos = todosLosTurnos();
    var delDia = todos.filter(function (t) { return t.fecha === sig && t.estado === 'confirmado'; });
    var sinRec = delDia.filter(function (t) { return !t.recordadoEn; }).length;
    var cancelCli = todos.filter(function (t) { return t.estado === 'cancelado' && t.canceladoPor === 'cliente' && t.fecha >= h.clave && Date.now() - t.canceladoEn < 2 * 86400000; }).length;
    var lineas = [];
    if (delDia.length) {
      var cuando = diasEntre(h.clave, sig) === 1 ? 'Mañana' : 'El ' + DIAS[diaSemana(sig)];
      var frase;
      if (!sinRec) frase = delDia.length === 1 ? ', con recordatorio enviado.' : ', todos con recordatorio.';
      else if (sinRec === delDia.length) frase = delDia.length === 1 ? ' y todavía no tiene recordatorio.' : ' y ninguno tiene recordatorio todavía.';
      else frase = ': ' + sinRec + ' todavía sin recordatorio.';
      lineas.push(cuando + ' tenés ' + plural(delDia.length, 'turno', 'turnos') + frase);
    }
    if (cancelCli) lineas.push(cancelCli === 1 ? '1 cliente canceló su turno.' : cancelCli + ' clientes cancelaron su turno.');
    if (!lineas.length) return '';
    return '<section class="aviso-turnos" aria-label="Turnos de los próximos días"><div>' + lineas.map(function (l) { return '<p>' + l + '</p>'; }).join('') + '</div>' +
      '<button type="button" class="btn btn-negro btn-mini" data-accion="vista" data-v="turnos" data-foco="ir-turnos">Ver turnos</button></section>';
  }

  function plantillaHoy(h) {
    var v = modeloHoy(h);
    var lineas = v.movHoy.map(function (m) {
      return '<div class="ticket-linea"><span><span class="ticket-hora">' + hhmm(m.min) + '</span>' + esc(m.concepto) + '</span><span class="monto' + (m.tipo === 'salida' ? ' salida' : '') + '">' + (m.tipo === 'salida' ? '− ' : '+ ') + gs(m.monto) + '</span></div>';
    }).join('');
    var sem = modeloSemana(h, v.atendidos);
    ultimaSemana = sem;
    return '<div class="cifras">' + v.cifras.map(cifra).join('') + '</div>' +
      avisoProximos(h) +
      '<div class="pa-dos">' +
        '<section class="pa-agenda" aria-labelledby="pa-agenda"><div class="agenda-cab"><h2 class="pa-h2" id="pa-agenda">Agenda</h2><span class="suave">' +
          (v.activos.length === 0 ? '' : (v.pendientes === 0 ? 'Todo atendido' : plural(v.pendientes, 'turno por atender', 'turnos por atender'))) + '</span></div>' +
          (v.turnosHoy.length ? '<ol class="lista">' + v.turnosHoy.map(function (t) { return filaTurno(t, h, 'hoy'); }).join('') + '</ol>'
            : '<p class="vacio">' + (h.wd === 0 ? 'Hoy domingo no se atiende. Mañana arrancás a las 08:00.' : 'No hay turnos para hoy todavía. Los que reserven en el sitio van a aparecer acá.') + '</p>') +
        '</section>' +
        '<section class="pa-ticket" aria-labelledby="pa-cajahoy"><h2 class="pa-h2" id="pa-cajahoy" style="margin-bottom:10px">Caja de hoy</h2>' +
          '<div class="ticket">' + (lineas || '<p class="suave" style="margin:0 0 8px">Todavía no hay movimientos hoy.</p>') +
          '<div class="ticket-total"><span>Balance del día</span><span>' + (v.balance < 0 ? '− ' : '') + gs(v.balance) + '</span></div></div>' +
          '<svg class="ticket-dientes" viewBox="0 0 300 10" preserveAspectRatio="none" aria-hidden="true"><polygon points="' + DIENTES + '" fill="#FFFFFF"/></svg>' +
        '</section>' +
      '</div>' +
      '<section class="semana" aria-labelledby="pa-semana"><h2 class="pa-h2" id="pa-semana">Lo que entró esta semana</h2>' +
        '<p class="suave" style="margin:6px 0 0;font-size:15px">En guaraníes, sumando servicios y productos. Pasá o tocá una barra para ver el detalle.</p>' +
        '<div class="barras">' + sem.map(function (b) {
          return '<button type="button" class="barra' + (b.hoy ? ' hoy' : '') + (b.sel ? ' sel' : '') + '" data-accion="barra" data-barra="' + b.i + '" data-foco="b-' + b.i + '" aria-pressed="' + b.sel + '" aria-label="' + b.aria + '"><span class="barra-valor">' + b.valorTxt + '</span><span class="barra-col" style="height:' + b.alto + 'px"></span></button>';
        }).join('') + '</div>' +
        '<div class="barras-dias">' + sem.map(function (b) { return '<span' + (b.hoy ? ' class="hoy"' : '') + '>' + b.dia + '</span>'; }).join('') + '</div>' +
        '<p class="barra-detalle" id="pa-barra-detalle" aria-live="polite">' + (sem.find(function (b) { return b.sel; }) || sem[0]).detalle + '</p>' +
      '</section>';
  }

  function modeloSemana(h, atendidosHoy) {
    var base = Date.UTC(h.y, h.mo - 1, h.d);
    var lunes = sumarDias(h.clave, -(h.wd === 0 ? 6 : h.wd - 1));
    var dias = [];
    for (var i = 0; i < 6; i++) {
      var clave = sumarDias(lunes, i);
      var ms = D.mov.filter(function (m) { return m.fecha === clave; });
      var esHoy = clave === h.clave;
      dias.push({
        i: i, wd: diaSemana(clave), num: fechaDe(clave).getUTCDate(), hoy: esHoy, futuro: fechaDe(clave).getTime() > base,
        ent: suma(ms.filter(function (m) { return m.tipo === 'entrada'; })),
        turnos: esHoy ? atendidosHoy : ms.filter(function (m) { return m.cat === 'servicio'; }).reduce(function (a, m) { return a + (m.turnos || 1); }, 0),
        prods: ms.filter(function (m) { return m.cat === 'producto'; }).reduce(function (a, m) { return a + (m.cantidad || 1); }, 0)
      });
    }
    var maxSem = Math.max.apply(null, [1].concat(dias.map(function (d) { return d.ent; })));
    var idxHoy = dias.findIndex(function (d) { return d.hoy; });
    var selIdx = P.barra != null ? P.barra : (idxHoy >= 0 ? idxHoy : 5);
    return dias.map(function (d) {
      return {
        i: d.i, hoy: d.hoy, sel: d.i === selIdx,
        dia: DIAS_C[d.wd] + ' ' + d.num,
        valorTxt: d.futuro ? '—' : abrev(d.ent),
        alto: d.futuro ? 0 : (d.ent > 0 ? Math.max(4, Math.round(d.ent / maxSem * 150)) : 0),
        aria: cap(DIAS[d.wd]) + ' ' + d.num + (d.hoy ? ', hoy' : '') + ': ' + (d.futuro ? 'todavía no llegó' : gs(d.ent)),
        detalle: d.futuro
          ? cap(DIAS[d.wd]) + ' ' + d.num + ': todavía no llegó.'
          : cap(DIAS[d.wd]) + ' ' + d.num + (d.hoy ? ' (hoy)' : '') + ': ' + gs(d.ent) + ', con ' + plural(d.turnos, 'turno', 'turnos') + ' y ' + plural(d.prods, 'producto', 'productos') + '.'
      };
    });
  }

  function plantillaTurnos(h) {
    var todos = todosLosTurnos();
    var recienCancelado = P.abierto && P.abierto.que === 'cancelado' ? P.abierto.id : null;
    var proximos = todos.filter(function (t) { return t.fecha > h.clave && (t.estado === 'confirmado' || t.id === recienCancelado); }).sort(porFechaHora);
    var cancelados = todos.filter(function (t) { return t.estado === 'cancelado' && t.fecha >= h.clave; }).sort(porFechaHora);
    var enCancelados = P.filtroTurnos === 'cancelados';
    var lista = enCancelados ? cancelados : proximos;
    var grupos = [];
    lista.forEach(function (t) {
      var g = grupos[grupos.length - 1];
      if (!g || g.fecha !== t.fecha) { g = { fecha: t.fecha, items: [] }; grupos.push(g); }
      g.items.push(t);
    });
    var html = '<div class="segmentado" role="group" aria-label="Qué turnos ver">' +
        '<button type="button" data-accion="filtro-turnos" data-f="proximos" data-foco="f-proximos" aria-pressed="' + !enCancelados + '">Próximos (' + proximos.filter(function (t) { return t.estado === 'confirmado'; }).length + ')</button>' +
        '<button type="button" data-accion="filtro-turnos" data-f="cancelados" data-foco="f-cancelados" aria-pressed="' + enCancelados + '">Cancelados (' + cancelados.length + ')</button>' +
      '</div>' +
      '<p class="turnos-intro">' + (enCancelados
        ? 'Turnos cancelados de hoy en adelante. Si cancelaste vos, podés avisarle al cliente por WhatsApp.'
        : 'Turnos reservados desde mañana; los de hoy están en Hoy. «Recordar por WhatsApp» abre WhatsApp con el mensaje listo: solo tocás Enviar.') + '</p>';
    if (!grupos.length) {
      return html + '<p class="vacio">' + (enCancelados ? 'No hay turnos cancelados.' : 'No hay turnos reservados para los próximos días.') + '</p>';
    }
    return html + grupos.map(function (g) {
      var conf = g.items.filter(function (t) { return t.estado === 'confirmado'; });
      var sinRec = conf.filter(function (t) { return !t.recordadoEn; }).length;
      var resumen = enCancelados ? plural(g.items.length, 'cancelado', 'cancelados')
        : plural(conf.length, 'turno', 'turnos') + (conf.length ? (sinRec ? ', ' + sinRec + ' sin recordatorio' : ', todos con recordatorio') : '');
      return '<section class="turnos-dia" aria-labelledby="td-' + g.fecha + '"><div class="turnos-dia-cab"><h2 class="pa-h3" id="td-' + g.fecha + '">' + diaTitulo(g.fecha) + '</h2><span class="suave">' + resumen + '</span></div>' +
        '<ol class="lista">' + g.items.map(function (t) { return filaTurno(t, h, 'turnos'); }).join('') + '</ol></section>';
    }).join('');
  }

  function modeloCaja(h) {
    var lunes = sumarDias(h.clave, -(h.wd === 0 ? 6 : h.wd - 1));
    var desde = P.periodo === 'hoy' ? h.clave : (P.periodo === 'semana' ? lunes : claveDe(h.y, h.mo, 1));
    var movs = D.mov.filter(function (m) { return m.fecha >= desde && m.fecha <= h.clave; });
    var entroArr = movs.filter(function (m) { return m.tipo === 'entrada'; });
    var salioArr = movs.filter(function (m) { return m.tipo === 'salida'; });
    var entro = suma(entroArr);
    var salio = suma(salioArr);
    var ganancia = entro - salio;
    var servPer = suma(entroArr.filter(function (m) { return m.cat === 'servicio'; }));
    var prodPer = entro - servPer;
    var pct = function (n) { return entro > 0 ? Math.round(n / entro * 100) : 0; };
    var fl = fechaDe(lunes);
    var notaPeriodo = P.periodo === 'hoy'
      ? cap(DIAS[h.wd]) + ' ' + h.d + ' de ' + MESES[h.mo - 1]
      : (P.periodo === 'semana' ? 'Desde el lunes ' + fl.getUTCDate() + ' de ' + MESES[fl.getUTCMonth()] : 'Del 1 al ' + h.d + ' de ' + MESES[h.mo - 1]);
    var atendidosHoy = todosLosTurnos().filter(function (t) { return t.fecha === h.clave && t.estado === 'atendido'; }).length;
    var filas;
    if (P.periodo === 'hoy') {
      filas = movs.slice().sort(function (a, b) { return b.min - a.min; }).map(function (m) {
        return { titulo: hhmm(m.min) + ' ' + m.concepto, detalle: CATEGORIAS[m.cat] + ', ' + (COMO_PAGO[m.medio] || m.medio), monto: (m.tipo === 'salida' ? '− ' : '+ ') + gs(m.monto), salida: m.tipo === 'salida' };
      });
    } else {
      var porDia = {};
      movs.forEach(function (m) { (porDia[m.fecha] = porDia[m.fecha] || []).push(m); });
      filas = Object.keys(porDia).sort().reverse().map(function (clave) {
        var l = porDia[clave];
        var esHoy = clave === h.clave;
        var ent = suma(l.filter(function (m) { return m.tipo === 'entrada'; }));
        var gas = suma(l.filter(function (m) { return m.tipo === 'salida'; }));
        var tur = esHoy ? atendidosHoy : l.filter(function (m) { return m.cat === 'servicio'; }).reduce(function (a, m) { return a + (m.turnos || 1); }, 0);
        var pro = l.filter(function (m) { return m.cat === 'producto'; }).reduce(function (a, m) { return a + (m.cantidad || 1); }, 0);
        return {
          titulo: cap(DIAS[diaSemana(clave)]) + ' ' + fechaDe(clave).getUTCDate() + (esHoy ? ' (hoy)' : ''),
          detalle: plural(tur, 'turno', 'turnos') + ' y ' + plural(pro, 'producto', 'productos') + (gas > 0 ? '. Gastos: ' + gs(gas) : ''),
          monto: '+ ' + gs(ent), salida: false
        };
      });
    }
    return {
      cifras: [
        { label: 'Entró', valor: gs(entro), nota: notaPeriodo },
        { label: 'Salió', valor: gs(salio), nota: salioArr.length === 0 ? 'Sin gastos' : plural(salioArr.length, 'gasto', 'gastos') },
        { label: 'Ganancia', valor: (ganancia < 0 ? '− ' : '') + gs(ganancia), nota: entro > 0 ? 'Te queda el ' + pct(ganancia) + '% de lo que entró' : 'Todavía no entró plata' }
      ],
      filas: filas,
      servTxt: gs(servPer) + ' (' + pct(servPer) + '%)', prodTxt: gs(prodPer) + ' (' + pct(prodPer) + '%)',
      partServ: servPer > 0 ? servPer : (entro > 0 ? 0 : 1), partProd: prodPer > 0 ? prodPer : 0
    };
  }

  function puedeAnotar() { return P.form.concepto.trim() !== '' && parseInt(P.form.monto || '0', 10) > 0; }

  function selectMedios(id, campo, valor) {
    return '<select class="campo" id="' + id + '" data-campo="' + campo + '">' +
      MEDIOS.map(function (m) { return '<option value="' + m + '"' + (valor === m ? ' selected' : '') + '>' + NOMBRE_MEDIO[m] + '</option>'; }).join('') + '</select>';
  }

  function plantillaCaja(h) {
    var v = modeloCaja(h);
    var f = P.form;
    return '<div class="segmentado" role="group" aria-label="Período">' +
        [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']].map(function (p) {
          return '<button type="button" data-accion="periodo" data-p="' + p[0] + '" data-foco="per-' + p[0] + '" aria-pressed="' + (P.periodo === p[0]) + '">' + p[1] + '</button>';
        }).join('') + '</div>' +
      '<div class="cifras" style="margin-top:20px">' + v.cifras.map(cifra).join('') + '</div>' +
      '<div class="reparto-caja"><p style="margin:0 0 8px;font-weight:700">De dónde viene la plata</p>' +
        '<div class="reparto" aria-hidden="true"><span class="rp-serv" style="flex:' + v.partServ + ' 1 0px"></span><span class="rp-prod" style="flex:' + v.partProd + ' 1 0px"></span></div>' +
        '<div class="leyenda"><span><i style="background:#000"></i>Servicios: ' + v.servTxt + '</span><span><i style="background:var(--rojo)"></i>Productos y otros: ' + v.prodTxt + '</span></div></div>' +
      '<div class="pa-dos" style="margin-top:32px">' +
        '<section class="tarjeta-form" aria-labelledby="pa-anotar"><h2 class="pa-h2" id="pa-anotar" style="font-size:26px;margin-bottom:14px">Anotar movimiento</h2>' +
          '<div class="dos-botones" role="group" aria-label="Tipo de movimiento">' +
            '<button type="button" class="toggle" data-accion="tipo" data-t="entrada" data-foco="tipo-entrada" aria-pressed="' + (f.tipo === 'entrada') + '">Entró plata</button>' +
            '<button type="button" class="toggle" data-accion="tipo" data-t="salida" data-foco="tipo-salida" aria-pressed="' + (f.tipo === 'salida') + '">Salió plata</button>' +
          '</div>' +
          '<label for="pa-concepto">Concepto</label><input class="campo" id="pa-concepto" type="text" maxlength="60" data-campo="form.concepto" placeholder="' + (f.tipo === 'entrada' ? 'Por ejemplo: venta de una gorra' : 'Por ejemplo: bidón de agua') + '" value="' + esc(f.concepto) + '">' +
          '<label for="pa-monto">Monto en guaraníes</label><input class="campo" id="pa-monto" type="text" inputmode="numeric" data-campo="form.monto" data-numero="miles" placeholder="35.000" value="' + (f.monto ? miles(f.monto) : '') + '">' +
          '<label for="pa-medio">Cómo se pagó</label>' + selectMedios('pa-medio', 'form.medio', f.medio) +
          '<button type="button" class="btn btn-rojo" id="pa-anotar-btn" data-accion="anotar" data-foco="anotar" style="width:100%;margin-top:18px"' + (puedeAnotar() ? '' : ' disabled') + '>Anotar movimiento</button>' +
          '<p class="aviso" aria-live="polite">' + esc(P.avisoCaja) + '</p>' +
        '</section>' +
        '<section class="pa-movs" aria-labelledby="pa-movs"><h2 class="pa-h2" id="pa-movs" style="font-size:26px;margin-bottom:10px">' + (P.periodo === 'hoy' ? 'Movimientos de hoy' : 'Día por día') + '</h2>' +
          (v.filas.length ? '<ol class="lista">' + v.filas.map(function (r) {
            return '<li class="fila-caja"><p class="fila-titulo">' + esc(r.titulo) + '</p><p class="fila-monto' + (r.salida ? ' salida' : '') + '">' + r.monto + '</p><p class="fila-det">' + esc(r.detalle) + '</p></li>';
          }).join('') + '</ol>' : '<p class="vacio">Todavía no hay movimientos en este período.</p>') +
        '</section>' +
      '</div>';
  }

  /* ----- Stock ----- */
  function buscarProd(id) { return D.productos.find(function (p) { return p.id === id; }) || null; }
  function restoTxt(p) {
    if (p.stock === 0) return 'Se terminó: hay que reponer.';
    var q = (p.stock === 1 ? 'Queda ' : 'Quedan ') + cantTxt(p.stock, p.uni) + '.';
    return p.stock <= p.minimo ? q + ' Hay que reponer.' : q;
  }
  function entero(v) { var n = parseInt(String(v == null ? '' : v), 10); return isNaN(n) ? null : n; }

  function validarNuevo() {
    var n = P.np;
    if (n.nombre.trim().length < 2) return 'Falta el nombre.';
    if (entero(n.cantidad) == null) return 'Falta cuántos hay.';
    if (n.tipo === 'venta' && !(entero(n.precio) > 0)) return 'Falta el precio de venta.';
    if (D.productos.some(function (p) { return p.nombre.toLowerCase() === n.nombre.trim().toLowerCase(); })) return 'Ya hay un producto con ese nombre.';
    return '';
  }
  function validarAccion() {
    var a = P.accionProd;
    if (!a) return '';
    var p = buscarProd(a.id);
    if (!p) return '';
    if (a.tipo === 'usar' || a.tipo === 'vender' || a.tipo === 'comprar') {
      var n = entero(a.cantidad);
      if (!(n >= 1)) return 'Poné una cantidad.';
      if (a.tipo !== 'comprar' && n > p.stock) return 'Hay ' + cantTxt(p.stock, p.uni) + ': no podés restar más de eso.';
      return '';
    }
    if (a.tipo === 'editar') {
      if (a.nombre.trim().length < 2) return 'Falta el nombre.';
      if (entero(a.stock) == null) return 'Falta cuántos hay.';
      if (p.tipo === 'venta' && !(entero(a.precio) > 0)) return 'Falta el precio de venta.';
      if (D.productos.some(function (x) { return x.id !== p.id && x.nombre.toLowerCase() === a.nombre.trim().toLowerCase(); })) return 'Ya hay otro producto con ese nombre.';
    }
    return '';
  }

  function registrarCaja(obj) {
    var h = ahoraPY();
    return nuevoMov(D, Object.assign({ fecha: h.clave, min: h.min }, obj));
  }

  function selectUnidades(id, campo, valor) {
    return '<select class="campo" id="' + id + '" data-campo="' + campo + '">' +
      UNIDADES.map(function (u) { return '<option value="' + u[0] + '"' + (valor === u[0] ? ' selected' : '') + '>' + cap(u[1]) + '</option>'; }).join('') + '</select>';
  }

  function stepper(a, p) {
    var max = a.tipo === 'comprar' ? 999 : p.stock;
    return '<div class="stepper">' +
      '<button type="button" class="stepper-btn" data-accion="cant-menos" data-foco="cant-menos" aria-label="Uno menos">−</button>' +
      '<input class="campo stepper-num" id="pf-cant" type="text" inputmode="numeric" data-campo="accionProd.cantidad" data-numero="entero" value="' + esc(a.cantidad) + '" aria-label="Cantidad de ' + esc(p.uni[1]) + '" data-max="' + max + '">' +
      '<button type="button" class="stepper-btn" data-accion="cant-mas" data-foco="cant-mas" aria-label="Uno más">+</button>' +
      '<span class="stepper-uni">' + esc(p.uni[1]) + '</span></div>';
  }

  function formAccion(p, a) {
    var falta = validarAccion();
    var cerrar = '<button type="button" class="link-btn" data-accion="prod-cerrar" data-foco="prod-cerrar">Cancelar</button>';
    var confirmar = function (texto, clase) { return '<button type="button" class="btn ' + (clase || 'btn-negro') + ' btn-mini" id="pf-confirmar" data-accion="prod-confirmar" data-foco="prod-confirmar"' + (falta ? ' disabled' : '') + '>' + texto + '</button>'; };
    var faltaHtml = '<p class="form-falta" id="pf-falta" aria-live="polite">' + esc(falta) + '</p>';
    if (a.tipo === 'usar') {
      return '<div class="prod-form" role="group" aria-labelledby="pf-t"><p class="prod-form-titulo" id="pf-t">¿Cuántos ' + esc(p.uni[1]) + ' usaste?</p>' + stepper(a, p) +
        '<div class="prod-form-acciones">' + confirmar('Restar del stock') + cerrar + '</div>' + faltaHtml + '</div>';
    }
    if (a.tipo === 'vender') {
      var total = (entero(a.cantidad) || 0) * p.precio;
      return '<div class="prod-form" role="group" aria-labelledby="pf-t"><p class="prod-form-titulo" id="pf-t">¿Cuántos ' + esc(p.uni[1]) + ' vendiste?</p>' + stepper(a, p) +
        '<p class="prod-form-total">Total: <b id="pf-total">' + gs(total) + '</b></p>' +
        '<div class="prod-form-campo"><label for="pf-medio">Cómo pagó</label>' + selectMedios('pf-medio', 'accionProd.medio', a.medio) + '</div>' +
        '<div class="prod-form-acciones">' + confirmar('Anotar venta') + cerrar + '</div>' + faltaHtml + '</div>';
    }
    if (a.tipo === 'comprar') {
      return '<div class="prod-form" role="group" aria-labelledby="pf-t"><p class="prod-form-titulo" id="pf-t">¿Cuántos ' + esc(p.uni[1]) + ' compraste?</p>' + stepper(a, p) +
        '<div class="prod-form-grilla">' +
          '<div><label for="pf-costo">Cuánto pagaste en total <span class="suave" style="font-weight:400">(opcional)</span></label><input class="campo" id="pf-costo" type="text" inputmode="numeric" data-campo="accionProd.costo" data-numero="miles" placeholder="Gs." value="' + (a.costo ? miles(a.costo) : '') + '"></div>' +
          '<div><label for="pf-medio">Cómo pagaste</label>' + selectMedios('pf-medio', 'accionProd.medio', a.medio) + '</div>' +
        '</div>' +
        '<p class="prod-form-ayuda">Si ponés lo que pagaste, se anota como gasto en la caja.</p>' +
        '<div class="prod-form-acciones">' + confirmar('Sumar al stock') + cerrar + '</div>' + faltaHtml + '</div>';
    }
    if (a.tipo === 'editar') {
      return '<div class="prod-form" role="group" aria-labelledby="pf-t"><p class="prod-form-titulo" id="pf-t">Editar ' + esc(p.nombre) + '</p>' +
        '<div class="prod-form-grilla">' +
          '<div><label for="pf-nombre">Nombre</label><input class="campo" id="pf-nombre" type="text" maxlength="50" data-campo="accionProd.nombre" value="' + esc(a.nombre) + '"></div>' +
          '<div><label for="pf-presentacion">Presentación <span class="suave" style="font-weight:400">(opcional)</span></label><input class="campo" id="pf-presentacion" type="text" maxlength="40" data-campo="accionProd.presentacion" placeholder="Por ejemplo: pote de 100 g" value="' + esc(a.presentacion) + '"></div>' +
          '<div><label for="pf-unidad">Se cuenta en</label>' + selectUnidades('pf-unidad', 'accionProd.unidad', a.unidad) + '</div>' +
          '<div><label for="pf-stock">Cuántos hay</label><input class="campo" id="pf-stock" type="text" inputmode="numeric" data-campo="accionProd.stock" data-numero="entero" value="' + esc(a.stock) + '"></div>' +
          '<div><label for="pf-minimo">Avisar cuando queden</label><input class="campo" id="pf-minimo" type="text" inputmode="numeric" data-campo="accionProd.minimo" data-numero="entero" value="' + esc(a.minimo) + '"></div>' +
          (p.tipo === 'venta' ? '<div><label for="pf-precio">Precio de venta</label><input class="campo" id="pf-precio" type="text" inputmode="numeric" data-campo="accionProd.precio" data-numero="miles" value="' + (a.precio ? miles(a.precio) : '') + '"></div>' : '') +
        '</div>' +
        '<p class="prod-form-ayuda">Si cambiás cuántos hay, queda registrado como corrección del stock.</p>' +
        '<div class="prod-form-acciones">' + confirmar('Guardar cambios') + cerrar +
          '<button type="button" class="link-btn link-rojo" data-accion="prod-eliminar" data-foco="prod-eliminar" style="margin-left:auto">Eliminar del stock</button></div>' + faltaHtml + '</div>';
    }
    if (a.tipo === 'eliminar') {
      return '<div class="prod-form" role="group" aria-labelledby="pf-t"><p class="prod-form-titulo" id="pf-t">¿Eliminar ' + esc(p.nombre) + ' del stock?</p>' +
        '<p class="prod-form-ayuda">Se borra de la lista. Lo que ya está anotado en la caja queda igual.</p>' +
        '<div class="prod-form-acciones"><button type="button" class="btn btn-rojo btn-mini" data-accion="prod-eliminar-si" data-foco="prod-eliminar-si">Sí, eliminar</button>' + cerrar + '</div></div>';
    }
    return '';
  }

  function filaProducto(p) {
    var agotado = p.stock <= 0;
    var bajo = !agotado && p.stock <= p.minimo;
    var a = P.accionProd && P.accionProd.id === p.id ? P.accionProd : null;
    var tag = agotado ? '<span class="tag-stock agotado">Agotado</span>' : (bajo ? '<span class="tag-stock">Reponer</span>' : '');
    var restar = p.tipo === 'venta' ? 'Vendí' : 'Usé';
    var acciones = a ? '' :
      '<button type="button" class="btn btn-negro btn-mini" data-accion="prod-accion" data-tipo="' + (p.tipo === 'venta' ? 'vender' : 'usar') + '" data-id="' + esc(p.id) + '" data-foco="restar-' + esc(p.id) + '" aria-label="' + restar + ': ' + esc(p.nombre) + '"' + (agotado ? ' disabled' : '') + '>' + restar + '</button>' +
      '<button type="button" class="btn btn-linea btn-mini" data-accion="prod-accion" data-tipo="comprar" data-id="' + esc(p.id) + '" data-foco="comprar-' + esc(p.id) + '" aria-label="Compré: ' + esc(p.nombre) + '">Compré</button>' +
      '<button type="button" class="btn btn-linea btn-mini" data-accion="prod-accion" data-tipo="editar" data-id="' + esc(p.id) + '" data-foco="editar-' + esc(p.id) + '" aria-label="Editar ' + esc(p.nombre) + '">Editar</button>';
    return '<li class="prod">' +
      '<div class="prod-info"><p class="prod-nombre">' + esc(p.nombre) + '</p><p class="prod-det">' + esc((p.presentacion ? p.presentacion + '. ' : '') + 'Avisar cuando queden ' + p.minimo) + '</p></div>' +
      '<p class="prod-precio">' + (p.tipo === 'venta' ? gs(p.precio) : 'Uso del local') + '</p>' +
      '<div class="prod-stock-col"><p class="prod-stock"><span class="stock-num">' + p.stock + '</span><span>' + esc(p.stock === 1 ? p.uni[0] : p.uni[1]) + '</span>' + tag + '</p>' +
        '<div class="stock-barra" aria-hidden="true"><i class="' + (bajo || agotado ? 'bajo' : '') + '" style="width:' + Math.min(100, Math.round(p.stock / Math.max(p.minimo * 3, 1) * 100)) + '%"></i></div></div>' +
      '<div class="prod-acciones">' + acciones + '</div>' +
      (a ? formAccion(p, a) : '') +
    '</li>';
  }

  function textoMovStock(m) {
    var n = minus(m.nombre);
    if (m.tipo === 'carga') return 'Cargaste ' + m.nombre + ' con ' + cantTxt(m.cantidad, m.uni);
    if (m.tipo === 'compra') return 'Compraste ' + cantTxt(m.cantidad, m.uni) + ' de ' + n + (m.costo ? ' por ' + gs(m.costo) : '');
    if (m.tipo === 'uso') return 'Usaste ' + cantTxt(m.cantidad, m.uni) + ' de ' + n;
    if (m.tipo === 'venta') return 'Vendiste ' + cantTxt(m.cantidad, m.uni) + ' de ' + n + (m.monto ? ' por ' + gs(m.monto) : '');
    if (m.tipo === 'ajuste') return 'Corregiste ' + n + ': de ' + m.antes + ' a ' + m.despues;
    return 'Sacaste ' + n + ' del stock';
  }
  function cantMovStock(m) {
    if (m.tipo === 'carga' || m.tipo === 'compra') return { txt: '+' + m.cantidad, clase: 'mas' };
    if (m.tipo === 'uso' || m.tipo === 'venta') return { txt: '−' + m.cantidad, clase: 'menos' };
    if (m.tipo === 'ajuste') { var d = m.despues - m.antes; return { txt: (d > 0 ? '+' : '−') + Math.abs(d), clase: d > 0 ? 'mas' : 'menos' }; }
    return { txt: '', clase: '' };
  }

  function plantillaStock() {
    var tab = P.tabStock;
    var insumos = D.productos.filter(function (p) { return p.tipo === 'insumo'; });
    var venta = D.productos.filter(function (p) { return p.tipo === 'venta'; });
    var items = tab === 'insumo' ? insumos : venta;
    var reponer = D.productos.filter(function (p) { return p.stock <= p.minimo; });
    var np = P.np;
    var faltaNuevo = validarNuevo();
    var html = '<div class="stock-sup"><div class="segmentado" role="group" aria-label="Tipo de producto">' +
        '<button type="button" data-accion="tab-stock" data-t="insumo" data-foco="tab-insumo" aria-pressed="' + (tab === 'insumo') + '">Insumos (' + insumos.length + ')</button>' +
        '<button type="button" data-accion="tab-stock" data-t="venta" data-foco="tab-venta" aria-pressed="' + (tab === 'venta') + '">Para vender (' + venta.length + ')</button></div>' +
      '<button type="button" class="btn btn-rojo btn-mini" data-accion="nuevo-toggle" data-foco="nuevo-toggle" aria-expanded="' + P.nuevoAbierto + '">' + (P.nuevoAbierto ? 'Cerrar el formulario' : 'Cargar al stock') + '</button></div>';
    if (reponer.length) {
      html += '<p class="alerta" role="status">Hay que reponer: ' + esc(listaY(reponer.map(function (p) {
        return p.nombre + ' (' + (p.stock <= 0 ? 'se terminó' : (p.stock === 1 ? 'queda 1' : 'quedan ' + p.stock)) + ')';
      }))) + '.</p>';
    }
    if (P.nuevoAbierto) {
      html += '<section class="nuevo-prod" aria-labelledby="np-titulo"><h2 class="pa-h3" id="np-titulo" style="font-size:24px;margin-bottom:12px">Cargar al stock</h2><div class="nuevo-grilla">' +
        '<div><label for="np-nombre">Nombre</label><input class="campo" id="np-nombre" type="text" maxlength="50" data-campo="np.nombre" placeholder="Por ejemplo: hojas de afeitar" value="' + esc(np.nombre) + '"></div>' +
        '<div><label for="np-tipo">Qué es</label><select class="campo" id="np-tipo" data-campo="np.tipo"><option value="insumo"' + (np.tipo === 'insumo' ? ' selected' : '') + '>Insumo del local</option><option value="venta"' + (np.tipo === 'venta' ? ' selected' : '') + '>Producto para vender</option></select></div>' +
        '<div><label for="np-presentacion">Presentación <span class="suave" style="font-weight:400">(opcional)</span></label><input class="campo" id="np-presentacion" type="text" maxlength="40" data-campo="np.presentacion" placeholder="Por ejemplo: caja de 100" value="' + esc(np.presentacion) + '"></div>' +
        '<div><label for="np-unidad">Se cuenta en</label>' + selectUnidades('np-unidad', 'np.unidad', np.unidad) + '</div>' +
        '<div><label for="np-cantidad">Cuántos hay</label><input class="campo" id="np-cantidad" type="text" inputmode="numeric" data-campo="np.cantidad" data-numero="entero" value="' + esc(np.cantidad) + '"></div>' +
        '<div><label for="np-minimo">Avisar cuando queden</label><input class="campo" id="np-minimo" type="text" inputmode="numeric" data-campo="np.minimo" data-numero="entero" placeholder="1" value="' + esc(np.minimo) + '"></div>' +
        '<div><label for="np-precio">Precio de venta</label><input class="campo" id="np-precio" type="text" inputmode="numeric" data-campo="np.precio" data-numero="miles" value="' + (np.precio ? miles(np.precio) : '') + '"' + (np.tipo === 'insumo' ? ' disabled' : '') + '></div>' +
      '</div>' +
      '<label class="check"><input type="checkbox" id="np-compra" data-campo="np.compra"' + (np.compra ? ' checked' : '') + '> Lo acabo de comprar: anotar el gasto en la caja</label>' +
      (np.compra ? '<div class="nuevo-grilla" style="margin-top:12px"><div><label for="np-costo">Cuánto pagaste en total</label><input class="campo" id="np-costo" type="text" inputmode="numeric" data-campo="np.costo" data-numero="miles" value="' + (np.costo ? miles(np.costo) : '') + '"></div>' +
        '<div><label for="np-medio">Cómo pagaste</label>' + selectMedios('np-medio', 'np.medio', np.medio) + '</div></div>' : '') +
      '<div class="prod-form-acciones" style="margin-top:16px"><button type="button" class="btn btn-negro" id="np-cargar" data-accion="nuevo-cargar" data-foco="nuevo-cargar"' + (faltaNuevo ? ' disabled' : '') + '>Cargar al stock</button></div>' +
      '<p class="form-falta" id="np-falta" aria-live="polite">' + esc(faltaNuevo) + '</p></section>';
    }
    html += '<p class="aviso aviso-stock" aria-live="polite">' + esc(P.avisoStock) + '</p>';
    html += items.length
      ? '<ol class="lista stock-lista">' + items.map(filaProducto).join('') + '</ol>'
      : '<p class="vacio">' + (tab === 'insumo' ? 'No hay insumos cargados. Tocá «Cargar al stock» para agregar el primero.' : 'No hay productos para vender. Tocá «Cargar al stock» para agregar uno.') + '</p>';
    var ultimos = D.movStock.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 12);
    html += '<section class="stock-movs" aria-labelledby="pa-smov"><h2 class="pa-h3" id="pa-smov">Últimos movimientos del stock</h2>' +
      (ultimos.length ? '<ol class="smov-lista">' + ultimos.map(function (m) {
        var c = cantMovStock(m);
        return '<li><span class="smov-cuando">' + cuandoCorto(m.ts) + '</span><span class="smov-que">' + esc(textoMovStock(m)) + '</span><span class="smov-cant ' + c.clase + '">' + c.txt + '</span></li>';
      }).join('') + '</ol>' : '<p class="suave" style="margin:0">Todavía no hay movimientos.</p>') + '</section>';
    return html;
  }

  function abrirAccionProd(id, tipo) {
    var p = buscarProd(id);
    if (!p) return;
    P.accionProd = { id: id, tipo: tipo, cantidad: '1', costo: '', medio: 'Efectivo' };
    if (tipo === 'editar') {
      Object.assign(P.accionProd, { nombre: p.nombre, presentacion: p.presentacion || '', unidad: p.uni[0], stock: String(p.stock), minimo: String(p.minimo), precio: p.precio ? String(p.precio) : '' });
    }
    P.avisoStock = '';
  }

  function nuevoMovStockAhora(p, tipo, cantidad, extra) { return nuevoMovStock(D, p, tipo, cantidad, Date.now(), extra); }

  function confirmarAccionProd() {
    var a = P.accionProd;
    var p = a ? buscarProd(a.id) : null;
    if (!p || validarAccion()) return false;
    var n = entero(a.cantidad);
    if (a.tipo === 'usar') {
      p.stock -= n;
      nuevoMovStockAhora(p, 'uso', n);
      P.avisoStock = 'Usaste ' + cantTxt(n, p.uni) + ' de ' + minus(p.nombre) + '. ' + restoTxt(p);
    } else if (a.tipo === 'vender') {
      var monto = n * p.precio;
      p.stock -= n;
      registrarCaja({ tipo: 'entrada', cat: 'producto', concepto: 'Venta: ' + cantTxt(n, p.uni) + ' de ' + minus(p.nombre), monto: monto, medio: a.medio, cantidad: n });
      nuevoMovStockAhora(p, 'venta', n, { monto: monto });
      P.avisoStock = 'Vendiste ' + cantTxt(n, p.uni) + ' de ' + minus(p.nombre) + ': ' + gs(monto) + ' ' + COMO_PAGO[a.medio] + ', anotados en la caja. ' + restoTxt(p);
    } else if (a.tipo === 'comprar') {
      var costo = entero(a.costo) || 0;
      p.stock += n;
      nuevoMovStockAhora(p, 'compra', n, { costo: costo });
      if (costo > 0) registrarCaja({ tipo: 'salida', cat: 'compra', concepto: 'Compra: ' + cantTxt(n, p.uni) + ' de ' + minus(p.nombre), monto: costo, medio: a.medio });
      P.avisoStock = 'Sumaste ' + cantTxt(n, p.uni) + ' de ' + minus(p.nombre) + '. Ahora hay ' + cantTxt(p.stock, p.uni) + '.' + (costo > 0 ? ' El gasto de ' + gs(costo) + ' quedó anotado en la caja.' : '');
    } else if (a.tipo === 'editar') {
      var antes = p.stock;
      var nuevo = entero(a.stock);
      p.nombre = a.nombre.trim();
      p.presentacion = a.presentacion.trim();
      p.uni = unidadDe(a.unidad).slice();
      p.minimo = entero(a.minimo) || 0;
      if (p.tipo === 'venta') p.precio = entero(a.precio);
      if (nuevo !== antes) {
        p.stock = nuevo;
        nuevoMovStockAhora(p, 'ajuste', Math.abs(nuevo - antes), { antes: antes, despues: nuevo });
      }
      P.avisoStock = 'Guardaste los cambios de ' + p.nombre + '.' + (nuevo !== antes ? ' La cantidad pasó de ' + antes + ' a ' + nuevo + '.' : '');
    }
    P.accionProd = null;
    guardarDatos();
    return true;
  }

  function eliminarProducto() {
    var p = P.accionProd ? buscarProd(P.accionProd.id) : null;
    if (!p) return;
    D.productos = D.productos.filter(function (x) { return x.id !== p.id; });
    nuevoMovStockAhora(p, 'baja', 0);
    P.avisoStock = 'Sacaste ' + p.nombre + ' del stock.';
    P.accionProd = null;
    guardarDatos();
  }

  function cargarProducto() {
    if (validarNuevo()) return false;
    var n = P.np;
    var p = {
      id: 'p' + Date.now().toString(36), tipo: n.tipo, nombre: n.nombre.trim(), presentacion: n.presentacion.trim(),
      uni: unidadDe(n.unidad).slice(), stock: entero(n.cantidad), minimo: entero(n.minimo) || 1, precio: n.tipo === 'venta' ? entero(n.precio) : 0
    };
    D.productos.push(p);
    nuevoMovStockAhora(p, 'carga', p.stock);
    var costo = n.compra ? (entero(n.costo) || 0) : 0;
    if (costo > 0) registrarCaja({ tipo: 'salida', cat: 'compra', concepto: 'Compra: ' + cantTxt(p.stock, p.uni) + ' de ' + minus(p.nombre), monto: costo, medio: n.medio });
    P.avisoStock = 'Cargaste ' + p.nombre + ': ' + cantTxt(p.stock, p.uni) + '.' + (costo > 0 ? ' El gasto de ' + gs(costo) + ' quedó anotado en la caja.' : '');
    P.tabStock = p.tipo;
    P.nuevoAbierto = false;
    P.np = npVacio(p.tipo);
    guardarDatos();
    return true;
  }

  /* ----- Precios ----- */
  function cambiosPendientes() {
    var lista = [];
    SERVICIOS.forEach(function (s) {
      var b = P.borrador[s.id];
      if (!b) return;
      var precio = b.precio != null ? entero(b.precio) : s.precio;
      var min = b.min != null ? +b.min : s.min;
      if (precio !== s.precio || min !== s.min) lista.push({ s: s, precio: precio, min: min });
    });
    return lista;
  }
  function errorPrecios() {
    var mal = SERVICIOS.filter(function (s) { var b = P.borrador[s.id]; return b && b.precio != null && !(entero(b.precio) > 0); });
    return mal.length ? 'Falta el precio de ' + listaY(mal.map(function (s) { return s.nombre; })) + '.' : '';
  }
  function textoBarra(pend, err) {
    return err || (pend.length === 1 ? '1 servicio con cambios sin guardar.' : pend.length + ' servicios con cambios sin guardar.');
  }

  function filaPrecioPanel(s) {
    var b = P.borrador[s.id] || {};
    var precioTxt = b.precio != null ? b.precio : String(s.precio);
    var min = b.min != null ? +b.min : s.min;
    var cambioP = b.precio != null && entero(b.precio) !== s.precio;
    var cambioM = min !== s.min;
    var opciones = DURACIONES.indexOf(min) >= 0 ? DURACIONES : DURACIONES.concat([min]);
    return '<li class="pr-fila' + (cambioP || cambioM ? ' cambiada' : '') + '" id="pr-fila-' + s.id + '">' +
      '<div class="pr-nombre"><p class="pr-titulo">' + esc(s.nombre) + '</p>' + (s.grupo === 'combo' ? '<p class="pr-incluye">' + esc(s.incluye) + '</p>' : '') + '</div>' +
      '<div class="pr-campo"><label for="pr-precio-' + s.id + '">Precio</label>' +
        '<div class="campo-gs"><span aria-hidden="true">Gs.</span><input class="campo" id="pr-precio-' + s.id + '" type="text" inputmode="numeric" data-precio="' + s.id + '" value="' + (precioTxt ? miles(precioTxt) : '') + '"></div>' +
        '<p class="pr-antes" id="pr-antes-p-' + s.id + '"' + (cambioP ? '' : ' hidden') + '>Antes: ' + gs(s.precio) + '</p></div>' +
      '<div class="pr-campo"><label for="pr-min-' + s.id + '">Duración</label>' +
        '<select class="campo" id="pr-min-' + s.id + '" data-duracion="' + s.id + '">' +
          opciones.map(function (d) { return '<option value="' + d + '"' + (d === min ? ' selected' : '') + '>' + durTxt(d) + '</option>'; }).join('') + '</select>' +
        '<p class="pr-antes" id="pr-antes-m-' + s.id + '"' + (cambioM ? '' : ' hidden') + '>Antes: ' + durTxt(s.min) + '</p></div>' +
    '</li>';
  }

  function textoCambioPrecio(c) {
    var cuanto = c.campo === 'precio'
      ? 'precio de ' + gs(c.antes) + ' a ' + gs(c.despues)
      : 'duración de ' + durTxt(c.antes) + ' a ' + durTxt(c.despues);
    return (c.lista ? 'Lista original. ' : '') + c.nombre + ': ' + cuanto;
  }
  function difCambioPrecio(c) {
    var d = c.despues - c.antes;
    if (!d) return '';
    return (d > 0 ? '+' : '−') + (c.campo === 'precio' ? miles(Math.abs(d)) : Math.abs(d) + ' min');
  }

  function plantillaPrecios() {
    var pend = cambiosPendientes();
    var err = errorPrecios();
    var difiere = SERVICIOS.some(function (s) { return s.precio !== OFICIAL[s.id].precio || s.min !== OFICIAL[s.id].min; });
    var hist = PRECIOS.historial.slice().reverse().slice(0, 12);
    var grupo = function (g) { return SERVICIOS.filter(function (s) { return s.grupo === g; }).map(filaPrecioPanel).join(''); };
    var restablecer = '';
    if (difiere) {
      restablecer = P.restablecer
        ? '<div class="pr-confirmar" role="group" aria-labelledby="pr-conf-t"><p id="pr-conf-t">Vuelven los precios y las duraciones de la lista del local (noviembre de 2026). Los turnos ya reservados no cambian.</p>' +
          '<div class="prod-form-acciones"><button type="button" class="btn btn-rojo btn-mini" data-accion="precios-restablecer-si" data-foco="precios-restablecer-si">Volver a la lista original</button>' +
          '<button type="button" class="link-btn" data-accion="precios-restablecer-no" data-foco="precios-restablecer-no">Cancelar</button></div></div>'
        : '<button type="button" class="link-btn" data-accion="precios-restablecer" data-foco="precios-restablecer" style="padding-left:0">Volver a la lista original del local</button>';
    }
    return '<p class="turnos-intro" style="margin-top:0">Cambiá el precio o la duración y tocá «Guardar cambios». El sitio se actualiza enseguida; los turnos ya reservados mantienen su precio y su duración.</p>' +
      (P.avisoPrecios ? '<p class="aviso-ok" role="status">' + esc(P.avisoPrecios) + '</p>' : '') +
      '<section class="pr-grupo" aria-labelledby="pr-servicios"><h2 class="pa-h3" id="pr-servicios">Servicios</h2><ol class="lista">' + grupo('servicio') + '</ol></section>' +
      '<section class="pr-grupo" aria-labelledby="pr-combos"><h2 class="pa-h3" id="pr-combos">Combos</h2><ol class="lista">' + grupo('combo') + '</ol></section>' +
      '<div class="pr-barra" id="pr-barra"' + (pend.length || err ? '' : ' hidden') + '><p id="pr-barra-txt" aria-live="polite">' + esc(textoBarra(pend, err)) + '</p>' +
        '<div class="pr-barra-botones"><button type="button" class="btn btn-rojo btn-mini" id="pr-guardar" data-accion="precios-guardar" data-foco="precios-guardar"' + (pend.length && !err ? '' : ' disabled') + '>Guardar cambios</button>' +
        '<button type="button" class="btn btn-linea btn-mini" data-accion="precios-descartar" data-foco="precios-descartar">Descartar</button></div></div>' +
      '<section class="pr-otros" aria-labelledby="pr-hist">' + restablecer +
        '<h2 class="pa-h3" id="pr-hist">Últimos cambios</h2>' +
        (hist.length ? '<ol class="smov-lista">' + hist.map(function (c) {
          return '<li><span class="smov-cuando">' + cuandoCorto(c.ts) + '</span><span class="smov-que">' + esc(textoCambioPrecio(c)) + '</span><span class="smov-cant">' + difCambioPrecio(c) + '</span></li>';
        }).join('') + '</ol>' : '<p class="suave" style="margin:0">Todavía no cambiaste ningún precio.</p>') +
      '</section>';
  }

  function guardarCambiosPrecios() {
    var pend = cambiosPendientes();
    if (errorPrecios() || !pend.length) return false;
    var ts = Date.now();
    pend.forEach(function (c) {
      var s = c.s;
      if (c.precio !== s.precio) {
        PRECIOS.historial.push({ ts: ts, id: s.id, nombre: s.nombre, campo: 'precio', antes: s.precio, despues: c.precio });
        s.precio = c.precio;
      }
      if (c.min !== s.min) {
        PRECIOS.historial.push({ ts: ts, id: s.id, nombre: s.nombre, campo: 'min', antes: s.min, despues: c.min });
        s.min = c.min;
      }
    });
    guardarPrecios();
    P.borrador = {};
    P.avisoPrecios = (pend.length === 1 ? 'Guardaste el cambio de ' + pend[0].s.nombre : 'Guardaste los cambios de ' + plural(pend.length, 'servicio', 'servicios')) + '. Ya se ven en el sitio.';
    renderPrecios();
    renderReserva();
    return true;
  }

  function restablecerPrecios() {
    var ts = Date.now();
    SERVICIOS.forEach(function (s) {
      var o = OFICIAL[s.id];
      if (s.precio !== o.precio) {
        PRECIOS.historial.push({ ts: ts, id: s.id, nombre: s.nombre, campo: 'precio', antes: s.precio, despues: o.precio, lista: true });
        s.precio = o.precio;
      }
      if (s.min !== o.min) {
        PRECIOS.historial.push({ ts: ts, id: s.id, nombre: s.nombre, campo: 'min', antes: s.min, despues: o.min, lista: true });
        s.min = o.min;
      }
    });
    guardarPrecios();
    P.borrador = {};
    P.restablecer = false;
    P.avisoPrecios = 'Volviste a los precios y las duraciones de la lista original. Ya se ven en el sitio.';
    renderPrecios();
    renderReserva();
  }

  // Mientras el dueño escribe: marca la fila cambiada y actualiza la barra de guardar, sin redibujar
  function actualizarPrecios(id) {
    var s = SERV[id];
    if (s) {
      var b = P.borrador[id] || {};
      var cambioP = b.precio != null && entero(b.precio) !== s.precio;
      var cambioM = b.min != null && +b.min !== s.min;
      var fila = document.getElementById('pr-fila-' + id);
      if (fila) fila.classList.toggle('cambiada', cambioP || cambioM);
      var ap = document.getElementById('pr-antes-p-' + id);
      if (ap) ap.hidden = !cambioP;
      var am = document.getElementById('pr-antes-m-' + id);
      if (am) am.hidden = !cambioM;
    }
    var pend = cambiosPendientes();
    var err = errorPrecios();
    var barra = document.getElementById('pr-barra');
    if (barra) barra.hidden = !(pend.length || err);
    var t = document.getElementById('pr-barra-txt');
    if (t) t.textContent = textoBarra(pend, err);
    var g = document.getElementById('pr-guardar');
    if (g) g.disabled = !(pend.length && !err);
  }

  /* ----- Acceso y armado del panel ----- */
  function plantillaAcceso() {
    var teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'Borrar'].map(function (k) {
      if (k === '') return '<span></span>';
      return '<button type="button" class="tecla' + (k === 'Borrar' ? ' tecla-borrar' : '') + '" data-accion="tecla" data-k="' + k + '" data-foco="t-' + k + '"' + (k === 'Borrar' ? ' aria-label="Borrar el último número"' : '') + '>' + k + '</button>';
    }).join('');
    return '<div class="pa-acceso muro"><div class="pa-acceso-caja">' +
      '<span class="logo logo-140" role="img" aria-label="Logo de Tommy Barber"></span>' +
      '<h1 class="pa-acceso-titulo">Panel</h1>' +
      '<p>Ingresá tu PIN de 4 números.</p>' +
      '<div class="pa-pin' + (P.pinError ? ' error' : '') + '" aria-hidden="true">' + [0, 1, 2, 3].map(function (i) { return '<span' + (i < P.pin.length ? ' class="lleno"' : '') + '></span>'; }).join('') + '</div>' +
      '<p class="pa-pin-msg" aria-live="assertive">' + (P.pinError ? 'Ese PIN no es correcto. Probá de nuevo.' : '<span class="solo-lector">' + P.pin.length + ' de 4 números ingresados</span>') + '</p>' +
      '<div class="pa-teclado">' + teclas + '</div>' +
      '<a class="pa-volver" href="#inicio">Volver al sitio</a>' +
    '</div></div>';
  }

  function renderPanel(focoClave) {
    var cont = document.getElementById('panel');
    var activo = document.activeElement;
    var foco = focoClave || (activo && cont.contains(activo) ? (activo.getAttribute('data-foco') || activo.id) : null);
    if (!P.acceso) {
      cont.innerHTML = plantillaAcceso();
    } else {
      var h = ahoraPY();
      var est = estadoLocal(h);
      var nav = ['hoy', 'turnos', 'caja', 'stock', 'precios'].map(function (k) {
        return '<button type="button" data-accion="vista" data-v="' + k + '" data-foco="v-' + k + '"' + (P.vista === k ? ' aria-current="page"' : '') + '>' + ICONOS[k] + TITULOS[k] + '</button>';
      }).join('');
      var plantillas = { hoy: plantillaHoy, turnos: plantillaTurnos, caja: plantillaCaja, stock: plantillaStock, precios: plantillaPrecios };
      var cuerpo = (plantillas[P.vista] || plantillaHoy)(h);
      cont.innerHTML = '<div class="pa">' +
        '<aside class="pa-aside"><div class="pa-marca"><span class="logo logo-56" aria-hidden="true"></span><div><p class="pa-marca-nombre condensada">Tommy Barber</p><p class="pa-marca-sub">Panel del dueño</p></div></div>' +
          '<nav class="pa-nav" aria-label="Secciones del panel">' + nav + '</nav>' +
          '<div class="pa-aside-pie"><a href="#inicio">Ver el sitio</a><button type="button" data-accion="salir">Salir</button>' +
            (P.reiniciando
              ? '<div class="pa-reinicio" role="group" aria-labelledby="pa-reinicio-t"><p id="pa-reinicio-t">Vuelven los datos de ejemplo de la agenda, la caja y el stock. Los precios y los turnos reservados en el sitio no se tocan.</p>' +
                '<div class="pa-reinicio-botones"><button type="button" class="btn btn-claro btn-mini" data-accion="reiniciar-si" data-foco="reiniciar-si">Reiniciar</button><button type="button" data-accion="reiniciar-no" data-foco="reiniciar">Cancelar</button></div></div>'
              : '<button type="button" data-accion="reiniciar" data-foco="reiniciar">Reiniciar datos de ejemplo</button>') +
          '</div></aside>' +
        '<main class="pa-main" id="pa-main">' +
          '<div class="pa-cabecera"><div><p class="pa-fecha">' + cap(DIAS[h.wd]) + ' ' + h.d + ' de ' + MESES[h.mo - 1] + '</p><h1 class="pa-titulo" id="pa-titulo" tabindex="-1">' + TITULOS[P.vista] + '</h1></div>' +
          '<p class="pa-estado"><span class="pa-poste' + (est.abierto ? ' abierto' : '') + '" id="pa-poste" aria-hidden="true"></span><span id="pa-estado-txt">' + est.corto + '</span></p></div>' +
          cuerpo +
        '</main></div>';
    }
    if (foco) {
      var claves = Array.isArray(foco) ? foco : [foco];
      for (var i = 0; i < claves.length; i++) {
        var el = cont.querySelector('[data-foco="' + claves[i] + '"]') || document.getElementById(claves[i]);
        if (el && !el.disabled) { el.focus({ preventScroll: true }); break; }
      }
    }
  }

  function marcarBarra(i) {
    P.barra = i;
    panelEl.querySelectorAll('[data-barra]').forEach(function (b) {
      var sel = +b.getAttribute('data-barra') === i;
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-pressed', String(sel));
    });
    var d = document.getElementById('pa-barra-detalle');
    if (d && ultimaSemana[i]) d.textContent = ultimaSemana[i].detalle;
  }

  function cobrarTurno(id, medio) {
    var t = buscarTurno(id);
    if (!t || t.estado !== 'confirmado') return;
    var s = SERV[t.servicio];
    t.estado = 'atendido';
    t.medio = medio;
    registrarCaja({ tipo: 'entrada', cat: 'servicio', concepto: nombreServicio(s) + ', ' + t.cliente, monto: t.precio, medio: medio, turno: t.id });
    guardarTurno(t);
    guardarDatos();
    P.abierto = null;
  }

  function anotar() {
    var f = P.form;
    var monto = entero(f.monto) || 0;
    if (!f.concepto.trim() || !(monto > 0)) return;
    registrarCaja({ tipo: f.tipo, cat: f.tipo === 'entrada' ? 'otro' : 'gasto', concepto: f.concepto.trim(), monto: monto, medio: f.medio });
    guardarDatos();
    P.avisoCaja = 'Anotado: ' + f.concepto.trim() + ', ' + (f.tipo === 'entrada' ? '+ ' : '− ') + gs(monto) + '.';
    P.form = { tipo: f.tipo, concepto: '', monto: '', medio: f.medio };
  }

  function tocarTecla(k) {
    P.pinError = false;
    if (k === 'Borrar') P.pin = P.pin.slice(0, -1);
    else if (P.pin.length < 4) P.pin += k;
    if (P.pin.length === 4) {
      if (P.pin === PIN_DUENO) {
        P.acceso = true; P.pin = ''; P.vista = 'hoy';
        renderPanel();
        window.scrollTo(0, 0);
        var t = document.getElementById('pa-titulo');
        if (t) t.focus({ preventScroll: true });
        return;
      }
      P.pin = '';
      P.pinError = true;
    }
    renderPanel('t-' + k);
  }

  function actualizarFormularios() {
    var b1 = document.getElementById('pa-anotar-btn');
    if (b1) b1.disabled = !puedeAnotar();
    var fn = validarNuevo();
    var b2 = document.getElementById('np-cargar');
    if (b2) b2.disabled = !!fn;
    var f2 = document.getElementById('np-falta');
    if (f2) f2.textContent = fn;
    var pr = document.getElementById('np-precio');
    if (pr) pr.disabled = P.np.tipo === 'insumo';
    var fa = validarAccion();
    var b3 = document.getElementById('pf-confirmar');
    if (b3) b3.disabled = !!fa;
    var f3 = document.getElementById('pf-falta');
    if (f3) f3.textContent = fa;
    var tot = document.getElementById('pf-total');
    if (tot && P.accionProd) {
      var p = buscarProd(P.accionProd.id);
      if (p) tot.textContent = gs((entero(P.accionProd.cantidad) || 0) * p.precio);
    }
  }

  function cambiarCantidad(delta) {
    var a = P.accionProd;
    if (!a) return;
    var p = buscarProd(a.id);
    var max = a.tipo === 'comprar' ? 999 : (p ? p.stock : 0);
    var n = Math.max(1, Math.min(max || 1, (entero(a.cantidad) || 0) + delta));
    a.cantidad = String(n);
    var input = document.getElementById('pf-cant');
    if (input) input.value = a.cantidad;
    actualizarFormularios();
  }

  /* ----- Vista previa de WhatsApp (turnos de ejemplo) ----- */
  var modalEl = document.getElementById('modal');
  function abrirPreview(t, tipo, volverA) {
    P.preview = { tel: telInfo(t.tel).lindo || t.tel, texto: tipo === 'avisar' ? msjCancelacion(t) : msjRecordatorio(t), volverA: volverA };
    modalEl.hidden = false;
    modalEl.innerHTML = '<div class="modal-fondo" data-accion="cerrar-preview"></div>' +
      '<div class="modal-caja" role="dialog" aria-modal="true" aria-labelledby="modal-titulo" aria-describedby="modal-nota">' +
        '<h2 class="pa-h3" id="modal-titulo">Mensaje de WhatsApp</h2>' +
        '<p class="suave" style="margin:0">Para ' + esc(P.preview.tel) + '</p>' +
        '<div class="wa-chat"><p class="wa-burbuja">' + esc(P.preview.texto) + '</p></div>' +
        '<p class="modal-nota" id="modal-nota">Es un turno de ejemplo. Con un cliente real, este botón abre WhatsApp con este mensaje listo: solo tocás Enviar.</p>' +
        '<button type="button" class="btn btn-negro" id="modal-cerrar" data-accion="cerrar-preview">Listo</button>' +
      '</div>';
    document.getElementById('modal-cerrar').focus();
  }
  function cerrarPreview() {
    var volver = P.preview ? P.preview.volverA : null;
    P.preview = null;
    modalEl.hidden = true;
    modalEl.innerHTML = '';
    var el = volver ? panelEl.querySelector('[data-foco="' + volver + '"]') : null;
    if (!el) el = document.getElementById('pa-titulo');
    if (el) el.focus({ preventScroll: true });
  }
  modalEl.addEventListener('click', function (e) {
    if (e.target.closest('[data-accion="cerrar-preview"]')) cerrarPreview();
  });

  /* ----- Eventos del panel ----- */
  var panelEl = document.getElementById('panel');
  panelEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-accion]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-accion');
    var id = b.getAttribute('data-id');
    var t;
    if (a === 'tecla') { tocarTecla(b.getAttribute('data-k')); return; }
    if (a === 'barra') { marcarBarra(+b.getAttribute('data-barra')); return; }
    if (a === 'vista') {
      P.vista = b.getAttribute('data-v'); P.abierto = null; P.accionProd = null; P.avisoCaja = ''; P.avisoStock = ''; P.avisoPrecios = ''; P.restablecer = false;
      renderPanel('v-' + P.vista);
      var main = document.getElementById('pa-main');
      if (main && main.getBoundingClientRect().top < 0) main.scrollIntoView({ block: 'start' });
      return;
    }
    if (a === 'salir') { P.acceso = false; P.pin = ''; P.pinError = false; P.reiniciando = false; renderPanel(); window.scrollTo(0, 0); return; }
    if (a === 'reiniciar') { P.reiniciando = true; renderPanel('reiniciar-si'); return; }
    if (a === 'reiniciar-no') { P.reiniciando = false; renderPanel('reiniciar'); return; }
    if (a === 'reiniciar-si') {
      D = datosNuevos(ahoraPY());
      guardarDatos();
      P.reiniciando = false; P.abierto = null; P.accionProd = null; P.barra = null; P.vista = 'hoy'; P.avisoCaja = ''; P.avisoStock = '';
      renderPanel('v-hoy');
      renderReserva();
      return;
    }
    if (a === 'cobrar-abrir') { P.abierto = { id: id, que: 'cobrar' }; renderPanel('medio-' + id + '-Efectivo'); return; }
    if (a === 'cancelar-abrir') { P.abierto = { id: id, que: 'cancelar' }; renderPanel('cancelar-si-' + id); return; }
    if (a === 'cerrar-panel') { P.abierto = null; renderPanel(['cobrar-abrir-' + id, 'cancelar-abrir-' + id, 'recordar-' + id, 'v-' + P.vista]); return; }
    if (a === 'cobrar') { cobrarTurno(id, b.getAttribute('data-medio')); renderPanel('v-hoy'); renderHeroTurno(); return; }
    if (a === 'novino') {
      t = buscarTurno(id);
      if (t && t.estado === 'confirmado') { t.estado = 'novino'; guardarTurno(t); }
      P.abierto = null; renderPanel('v-hoy'); return;
    }
    if (a === 'cancelar-si') {
      t = buscarTurno(id);
      if (t && t.estado === 'confirmado' && !empezo(t, ahoraPY())) {
        t.estado = 'cancelado'; t.canceladoPor = 'barberia'; t.canceladoEn = Date.now();
        guardarTurno(t);
        P.abierto = { id: id, que: 'cancelado' };
      } else {
        P.abierto = null;
      }
      renderPanel('avisar-' + id);
      renderHeroTurno();
      renderReserva();
      return;
    }
    if (a === 'recordar' || a === 'avisar') {
      t = buscarTurno(id);
      if (!t) return;
      if (a === 'recordar') t.recordadoEn = Date.now(); else t.avisadoEn = Date.now();
      if (a === 'avisar' && P.abierto && P.abierto.id === id) P.abierto = null;
      guardarTurno(t);
      var focoWa = b.getAttribute('data-foco');
      if (t.ejemplo) { renderPanel(); abrirPreview(t, a, focoWa); }
      else setTimeout(function () { renderPanel(focoWa); }, 300); // deja que se abra WhatsApp antes de redibujar
      return;
    }
    if (a === 'precios-guardar') { if (guardarCambiosPrecios()) renderPanel('pa-titulo'); return; }
    if (a === 'precios-descartar') { P.borrador = {}; P.avisoPrecios = ''; renderPanel('v-precios'); return; }
    if (a === 'precios-restablecer') { P.restablecer = true; renderPanel('precios-restablecer-si'); return; }
    if (a === 'precios-restablecer-no') { P.restablecer = false; renderPanel('precios-restablecer'); return; }
    if (a === 'precios-restablecer-si') { restablecerPrecios(); renderPanel('pa-titulo'); return; }
    if (a === 'filtro-turnos') { P.filtroTurnos = b.getAttribute('data-f'); P.abierto = null; renderPanel(); return; }
    if (a === 'periodo') { P.periodo = b.getAttribute('data-p'); renderPanel(); return; }
    if (a === 'tipo') { P.form.tipo = b.getAttribute('data-t'); renderPanel(); return; }
    if (a === 'anotar') { anotar(); renderPanel('pa-concepto'); return; }
    if (a === 'tab-stock') { P.tabStock = b.getAttribute('data-t'); P.accionProd = null; P.avisoStock = ''; renderPanel(); return; }
    if (a === 'nuevo-toggle') {
      P.nuevoAbierto = !P.nuevoAbierto; P.accionProd = null;
      if (P.nuevoAbierto) P.np = npVacio(P.tabStock);
      renderPanel(P.nuevoAbierto ? 'np-nombre' : 'nuevo-toggle'); return;
    }
    if (a === 'nuevo-cargar') { if (cargarProducto()) renderPanel('nuevo-toggle'); return; }
    if (a === 'prod-accion') {
      abrirAccionProd(id, b.getAttribute('data-tipo'));
      P.nuevoAbierto = false;
      renderPanel(b.getAttribute('data-tipo') === 'editar' ? 'pf-nombre' : 'pf-cant'); return;
    }
    if (a === 'prod-cerrar') {
      var cerrado = P.accionProd;
      P.accionProd = null;
      renderPanel(cerrado ? (cerrado.tipo === 'comprar' ? 'comprar-' : (cerrado.tipo === 'editar' || cerrado.tipo === 'eliminar' ? 'editar-' : 'restar-')) + cerrado.id : null);
      return;
    }
    if (a === 'cant-menos') { cambiarCantidad(-1); return; }
    if (a === 'cant-mas') { cambiarCantidad(1); return; }
    if (a === 'prod-confirmar') {
      var idProd = P.accionProd ? P.accionProd.id : null;
      if (confirmarAccionProd()) renderPanel(['restar-' + idProd, 'comprar-' + idProd]);
      return;
    }
    if (a === 'prod-eliminar') { P.accionProd.tipo = 'eliminar'; renderPanel('prod-eliminar-si'); return; }
    if (a === 'prod-eliminar-si') { eliminarProducto(); renderPanel('nuevo-toggle'); return; }
  });

  function guardarCampo(el) {
    var campo = el.getAttribute('data-campo');
    if (!campo) return false;
    var partes = campo.split('.');
    var obj = P[partes[0]];
    if (!obj) return false;
    var val = el.type === 'checkbox' ? el.checked : el.value;
    var tipoNum = el.getAttribute('data-numero');
    if (tipoNum) {
      val = String(val).replace(/\D/g, '').slice(0, tipoNum === 'miles' ? 10 : 4);
      var max = el.getAttribute('data-max');
      if (max != null && val !== '' && +val > +max) val = String(+max);
      el.value = tipoNum === 'miles' && val ? miles(val) : val;
    }
    obj[partes[1]] = val;
    return true;
  }
  panelEl.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-precio')) {
      var idp = el.getAttribute('data-precio');
      var val = el.value.replace(/\D/g, '').slice(0, 8);
      el.value = val ? miles(val) : '';
      P.borrador[idp] = Object.assign({}, P.borrador[idp], { precio: val });
      actualizarPrecios(idp);
      return;
    }
    if (el.tagName === 'SELECT' || el.type === 'checkbox') return;
    if (guardarCampo(el)) actualizarFormularios();
  });
  panelEl.addEventListener('change', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-duracion')) {
      var idd = el.getAttribute('data-duracion');
      P.borrador[idd] = Object.assign({}, P.borrador[idd], { min: el.value });
      actualizarPrecios(idd);
      return;
    }
    if (el.tagName !== 'SELECT' && el.type !== 'checkbox') return;
    if (!guardarCampo(el)) return;
    if (el.id === 'np-compra' || el.id === 'np-tipo') renderPanel(el.id);
    else actualizarFormularios();
  });
  panelEl.addEventListener('mouseover', function (e) {
    var b = e.target.closest('[data-barra]');
    if (b && P.barra !== +b.getAttribute('data-barra')) marcarBarra(+b.getAttribute('data-barra'));
  });
  panelEl.addEventListener('focusin', function (e) {
    var b = e.target.closest('[data-barra]');
    if (b) marcarBarra(+b.getAttribute('data-barra'));
  });
  document.addEventListener('keydown', function (e) {
    if (P.preview) {
      if (e.key === 'Escape') { e.preventDefault(); cerrarPreview(); }
      else if (e.key === 'Tab') { e.preventDefault(); var c = document.getElementById('modal-cerrar'); if (c) c.focus(); }
      return;
    }
    if (panelEl.hidden || P.acceso || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); tocarTecla(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); tocarTecla('Borrar'); }
  });

  // Si el sitio está abierto en otra pestaña, se actualiza cuando alguien reserva o cancela
  window.addEventListener('storage', function (e) {
    if (e.key === CLAVE_RESERVAS) {
      misReservas = cargarReservas();
      renderHeroTurno();
      renderReserva();
      if (!panelEl.hidden && P.acceso) renderPanel();
    } else if (e.key === CLAVE_PANEL) {
      D = cargarDatos();
      if (!panelEl.hidden && P.acceso) renderPanel();
    } else if (e.key === CLAVE_PRECIOS) {
      PRECIOS = cargarPrecios();
      renderPrecios();
      renderReserva();
      if (!panelEl.hidden && P.acceso) renderPanel();
    }
  });

  /* ===================== Navegación entre sitio y panel ===================== */
  function mostrarVista() {
    var enPanel = location.hash === '#panel';
    document.getElementById('sitio').hidden = enPanel;
    panelEl.hidden = !enPanel;
    document.title = enPanel ? 'Panel del dueño | Tommy Barber' : 'Tommy Barber | Barbería en Quiindy';
    if (enPanel) {
      renderPanel();
      window.scrollTo(0, 0);
    } else if (P.preview) {
      cerrarPreview();
    }
    if (location.hash === '#mis-turnos') abrirMisTurnos();
  }
  window.addEventListener('hashchange', mostrarVista);

  /* ===================== Arranque ===================== */
  renderPrecios();
  renderHorarios();
  renderEstadoHero();
  renderHeroTurno();
  renderReserva();
  mostrarVista();

  setInterval(function () {
    renderEstadoHero();
    renderHorarios();
    renderHeroTurno();
    if (!panelEl.hidden && P.acceso) {
      var e = estadoLocal(ahoraPY());
      var t = document.getElementById('pa-estado-txt');
      var p = document.getElementById('pa-poste');
      if (t) t.textContent = e.corto;
      if (p) p.classList.toggle('abierto', e.abierto);
    }
  }, 30000);
})();
