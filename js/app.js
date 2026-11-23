/* Tommy Barber: sitio para clientes, reserva de turnos, Mis turnos y panel del dueño.
   Los datos del local están al principio (SERVICIOS, HORAS, PIN_DUENO).
   Dos formas de funcionar:
   - Con la base de datos (la página publicada): todo se guarda en el servidor (la API de servidor/).
     El panel se abre en /acceso-barberos con usuario y contraseña; el dueño ve todo y cada barbero, lo suyo.
   - Modo demostración (abriendo index.html desde la carpeta, en localhost o con ?demo en la dirección):
     datos de ejemplo guardados en el navegador (localStorage) y el panel en #panel con el PIN.
   Los avisos por WhatsApp abren WhatsApp con el mensaje listo (wa.me): el dueño solo toca Enviar. */
(function () {
  'use strict';

  /* ===================== ¿Con la base de datos o en demostración? ===================== */
  // La dirección de la API va en <meta name="api">. En la computadora (localhost) se usa ?api=… para probar con un servidor.
  var API = (function () {
    var q = new URLSearchParams(location.search);
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    var meta = document.querySelector('meta[name="api"]');
    var url = local ? (q.get('api') || '') : (meta ? meta.getAttribute('content') || '' : '');
    if (location.protocol === 'file:' || q.has('demo') || !/^https?:\/\//.test(url)) url = '';
    return url.replace(/\/+$/, '');
  })();
  var REMOTO = !!API;
  var RUTA_PANEL = '/acceso-barberos';
  // Estado de la conexión con la API (solo con la base de datos)
  var PANEL = { listo: false, cargando: false, yo: null, vers: {}, desde: 0, snap: null, programado: false, reintento: null, aviso: '', avisoError: false, cuentas: null };
  var COLA = { corriendo: false, trabajos: [] };
  var SITIO = { cargado: false, error: false };
  var TEMP_IDS = {}, tempSig = 1;  // N.º de cliente provisorio hasta que el servidor le dé uno

  /* ===================== Datos del local ===================== */
  var NEGOCIO = 'Tommy Barber';
  var DIRECCION = 'Constitución esquina, Quiindy';
  var MAPS = 'https://maps.app.goo.gl/TG3mWFFuAyfFZYSr5';
  var WA_LOCAL = '595972496916';        // WhatsApp del local
  var WA_LOCAL_TXT = '0972 496 916';
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
  SERVICIOS.forEach(function (s) { SERV[s.id] = s; s.activo = true; });
  var LISTA_LOCAL = SERVICIOS.slice();  // la lista del local; los servicios que agrega el dueño van después

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

  // Servicios, precios y duraciones que el dueño cambió desde el panel (se guardan en el navegador).
  // { version: 2, cambios: { id: { precio, min } } (lista del local), nuevos: [{ id, grupo, nombre, incluye, precio, min }],
  //   ocultos: [id] (servicios que ya no se ofrecen), historial }
  // Un servicio nunca se borra: si se deja de ofrecer queda oculto, así los turnos viejos siguen mostrando su nombre.
  function cargarPrecios() {
    var g = REMOTO ? null : leerJSON(CLAVE_PRECIOS, null);
    var cambios = g && g.cambios && typeof g.cambios === 'object' ? g.cambios : {};
    var ocultos = g && Array.isArray(g.ocultos) ? g.ocultos : [];
    var nuevos = (g && Array.isArray(g.nuevos) ? g.nuevos : []).filter(function (n) {
      return n && n.id && !OFICIAL[n.id] && (n.grupo === 'servicio' || n.grupo === 'combo') && String(n.nombre || '').trim() && entero(n.precio) > 0 && DURACIONES.indexOf(+n.min) >= 0;
    }).map(function (n) {
      return { id: String(n.id), grupo: n.grupo, nombre: String(n.nombre).trim().slice(0, 40), incluye: n.grupo === 'combo' ? String(n.incluye || '').trim().slice(0, 60) : '', min: +n.min, precio: entero(n.precio), nuevo: true };
    });
    LISTA_LOCAL.forEach(function (s) {
      var o = OFICIAL[s.id];
      var c = cambios[s.id];
      s.precio = c && entero(c.precio) > 0 ? entero(c.precio) : o.precio;
      s.min = c && DURACIONES.indexOf(+c.min) >= 0 ? +c.min : o.min;
    });
    var todos = LISTA_LOCAL.concat(nuevos);
    SERVICIOS = todos.filter(function (s) { return s.grupo === 'servicio'; }).concat(todos.filter(function (s) { return s.grupo === 'combo'; }));
    SERV = {};
    SERVICIOS.forEach(function (s) { SERV[s.id] = s; s.activo = ocultos.indexOf(s.id) < 0; });
    return { historial: g && Array.isArray(g.historial) ? g.historial.slice(-40) : [] };
  }
  function guardarPrecios() {
    if (REMOTO) { sincronizar(); return; }
    var cambios = {};
    LISTA_LOCAL.forEach(function (s) {
      if (s.precio !== OFICIAL[s.id].precio || s.min !== OFICIAL[s.id].min) cambios[s.id] = { precio: s.precio, min: s.min };
    });
    guardarJSON(CLAVE_PRECIOS, {
      version: 2, cambios: cambios,
      nuevos: SERVICIOS.filter(function (s) { return s.nuevo; }).map(function (s) { return { id: s.id, grupo: s.grupo, nombre: s.nombre, incluye: s.incluye, precio: s.precio, min: s.min }; }),
      ocultos: SERVICIOS.filter(function (s) { return !s.activo; }).map(function (s) { return s.id; }),
      historial: PRECIOS.historial.slice(-40)
    });
  }
  function serviciosActivos(grupo) { return SERVICIOS.filter(function (s) { return s.activo && (!grupo || s.grupo === grupo); }); }
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
    var tramos = horasDe(h.clave);
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
      var cortoHoy = BLOQ.some(function (b) { return b.tipo !== 'cerrado' && b.fecha === h.clave; });
      if (cortoHoy) return { abierto: false, titulo: 'Volvemos a las ' + hhmm(sig[0]), detalle: 'Ahora estamos cerrados. Podés reservar igual para más tarde.', corto: 'Cerrado, vuelve a las ' + hhmm(sig[0]) };
      return { abierto: false, titulo: 'Volvemos a las ' + hhmm(sig[0]), detalle: 'Cerramos al mediodía. Podés reservar igual para la tarde.', corto: 'Cerrado al mediodía, vuelve a las ' + hhmm(sig[0]) };
    }
    if (sig) {
      return { abierto: false, titulo: 'Cerrado ahora', detalle: 'Abrimos hoy a las ' + hhmm(sig[0]) + '.', corto: 'Abre hoy a las ' + hhmm(sig[0]) };
    }
    // Próximo día con atención, contando los días que el dueño cerró
    var k = 1, nd = null;
    for (; k <= 30; k++) { var c = sumarDias(h.clave, k); if (horasDe(c).length) { nd = c; break; } }
    var hoyCerrado = BLOQ.find(function (b) { return b.tipo === 'cerrado' && h.clave >= b.fecha && h.clave <= b.hasta; });
    var porque = hoyCerrado && !tramos.length ? 'Hoy no abrimos' + (hoyCerrado.motivo ? ' (' + hoyCerrado.motivo + ')' : '') + '. ' : '';
    if (!nd) return { abierto: false, titulo: 'Cerrado ahora', detalle: porque + 'Pronto avisamos cuándo volvemos a abrir.', corto: 'Cerrado' };
    var ndWd = diaSemana(nd);
    var cuando = k === 1 ? 'mañana' : (k < 7 ? 'el ' + DIAS[ndWd] : 'el ' + DIAS[ndWd] + ' ' + fechaDe(nd).getUTCDate());
    var abre = hhmm(horasDe(nd)[0][0]);
    return { abierto: false, titulo: 'Cerrado ahora', detalle: porque + 'Abrimos ' + cuando + ' a las ' + abre + '.', corto: 'Cerrado, abre ' + cuando + ' a las ' + abre };
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
  function msjEsperando(t) {
    return 'Hola ' + primerNombre(t.cliente) + ', te escribimos de ' + NEGOCIO + ': te estamos esperando para tu turno de las ' + hhmm(t.min) + '. ¿Venís?';
  }
  // Al cliente sin turno que dejó su número y se fue: ya casi le toca
  function msjLlamar(t) {
    var min = minutosParaLlamar(t);
    var hola = nombreNorm(t.cliente) ? 'Hola ' + primerNombre(t.cliente) : 'Hola';
    return hola + ', te escribimos de ' + NEGOCIO + ': ' + (min > 0
      ? 'ya casi es tu turno. Estamos con el cliente de antes y en unos ' + min + ' minutos te toca.'
      : 'ya es tu turno.') + ' Te esperamos en ' + DIRECCION + '.';
  }
  function msjDe(t, tipo) {
    return tipo === 'avisar' ? msjCancelacion(t) : tipo === 'esperando' ? msjEsperando(t) : tipo === 'llamar' ? msjLlamar(t) : msjRecordatorio(t);
  }
  function msjCancelacion(t) {
    return 'Hola ' + primerNombre(t.cliente) + ', te escribimos de ' + NEGOCIO + ': tuvimos que cancelar tu turno ' +
      cuandoTurno(t.fecha, t.min, true) + '. ¿Te queda bien otro horario?';
  }

  /* ===================== Turnos ===================== */
  /* ===================== Barberos ===================== */
  // Cada barbero tiene sus días y horas, siempre dentro del horario del local.
  // { version: 1, sig, barberos: [{ id, nombre, activo, dias: { 0..6: [desde, hasta] | null }, creadoEn, quitadoEn }] }
  // Quitar a un barbero no lo borra: queda inactivo para que su historial siga en los reportes.
  var CLAVE_BARBEROS = 'tommybarber-barberos';
  var BARBERO_1 = 'b1';
  function rangoDelLocal(wd) { var h = HORAS[wd]; return h.length ? [h[0][0], h[h.length - 1][1]] : null; }
  function normalizarDias(d) {
    var r = {};
    for (var wd = 0; wd < 7; wd++) {
      var x = d && d[wd], local = rangoDelLocal(wd);
      r[wd] = local && Array.isArray(x) && +x[1] > +x[0] ? [Math.max(+x[0], local[0]), Math.min(+x[1], local[1])] : null;
      if (r[wd] && r[wd][1] <= r[wd][0]) r[wd] = null;
    }
    return r;
  }
  function diasDelLocal() { var d = {}; for (var wd = 0; wd < 7; wd++) d[wd] = rangoDelLocal(wd); return d; }
  // El nombre del dueño no figura en ningún lado: el primer barbero se llama así hasta que él lo cambie
  function barberosIniciales() {
    return { version: 1, sig: 2, barberos: [{ id: BARBERO_1, nombre: 'Barbero principal', activo: true, dias: diasDelLocal(), creadoEn: 0, quitadoEn: 0 }] };
  }
  function cargarBarberos() {
    var g = REMOTO ? null : leerJSON(CLAVE_BARBEROS, null);
    if (!g || g.version !== 1 || !Array.isArray(g.barberos)) return barberosIniciales();
    var l = g.barberos.filter(function (b) { return b && b.id && String(b.nombre || '').trim(); }).map(function (b) {
      return { id: String(b.id), nombre: String(b.nombre).trim().slice(0, 40), activo: b.activo !== false, dias: normalizarDias(b.dias), creadoEn: +b.creadoEn || 0, quitadoEn: +b.quitadoEn || 0 };
    });
    if (!l.length) return barberosIniciales();
    if (!l.some(function (b) { return b.activo; })) l[0].activo = true;
    return { version: 1, sig: Math.max(+g.sig || 0, l.length + 1), barberos: l };
  }
  var BARB = cargarBarberos();
  function guardarBarberos() { if (REMOTO) sincronizar(); else guardarJSON(CLAVE_BARBEROS, BARB); }
  function barberosActivos() { return BARB.barberos.filter(function (b) { return b.activo; }); }
  function barberoPorId(id) { return BARB.barberos.find(function (b) { return b.id === id; }) || null; }
  function nombreBarbero(id) { var b = barberoPorId(id); return b ? b.nombre : 'Barbero'; }
  function hayVarios() { return barberosActivos().length > 1; }
  // "Lun a vie de 08:00 a 17:30 · sáb de 08:00 a 12:00"
  function textoDias(dias) {
    var grupos = [];
    [1, 2, 3, 4, 5, 6, 0].forEach(function (wd) {
      var r = dias[wd];
      if (!r) return;
      var g = grupos[grupos.length - 1];
      if (g && g.r[0] === r[0] && g.r[1] === r[1] && g.ultimo === (wd === 0 ? 6 : wd - 1)) { g.ultimo = wd; g.n++; }
      else grupos.push({ primero: wd, ultimo: wd, n: 1, r: r });
    });
    if (!grupos.length) return 'Sin días cargados';
    return grupos.map(function (g) {
      var dias = g.n === 1 ? SEM[g.primero] : g.n === 2 ? SEM[g.primero] + ' y ' + SEM[g.ultimo] : SEM[g.primero] + ' a ' + SEM[g.ultimo];
      return dias + ' de ' + hhmm(g.r[0]) + ' a ' + hhmm(g.r[1]);
    }).join(' · ').replace(/^./, function (c) { return c.toUpperCase(); });
  }

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
      // orden: lugar en la fila de Atender cuando el dueño lo pospone; sinTurno: llegó al local sin reservar
      orden: +r.orden || 0, sinTurno: !!r.sinTurno,
      // Sin turno: a qué hora llegó (su turno es la primera hora libre que se le dio) y cuándo se le avisó que ya le toca.
      // enLocal: turno que el dueño anotó en el local (por ejemplo, para el día siguiente si hoy no había lugar)
      llego: r.llego != null && !isNaN(+r.llego) ? +r.llego : null, llamadoEn: +r.llamadoEn || 0, enLocal: !!r.enLocal,
      // Si el cliente lo cambió de día u hora: el horario anterior y cuándo lo cambió
      antes: r.antes && r.antes.fecha ? { fecha: String(r.antes.fecha), min: +r.antes.min } : null, cambiadoEn: +r.cambiadoEn || 0,
      // Con qué barbero es. Los turnos de antes de que hubiera varios barberos son del primero.
      barbero: r.barbero ? String(r.barbero) : BARBERO_1,
      // pospuesto: el dueño lo pasó después del siguiente porque no llegó; falso: cancelado como turno falso
      pospuesto: !!r.pospuesto, falso: !!r.falso,
      ejemplo: !!r.ejemplo
    };
  }

  // Turnos reservados desde este navegador (la "base" del prototipo)
  function cargarReservas() {
    if (REMOTO) return misReservas || [];  // con la base de datos vienen del servidor
    var desde = sumarDias(ahoraPY().clave, -30);
    var l = leerJSON(CLAVE_RESERVAS, []);
    return (Array.isArray(l) ? l : []).map(normalizarTurno).filter(function (t) { return t && t.fecha >= desde; });
  }
  function guardarReservas() { if (!REMOTO) guardarJSON(CLAVE_RESERVAS, misReservas.slice(-100)); }
  var misReservas = cargarReservas();

  /* ===================== Cambios de horario ===================== */
  // El dueño puede cerrar días, cerrar unas horas o abrir con otro horario un día puntual.
  // { id, tipo: 'cerrado' | 'franja' | 'especial', fecha, hasta (último día, en 'cerrado'),
  //   desde y fin (minutos, en 'franja' y 'especial'), motivo, creadoEn }
  var CLAVE_HORARIO = 'tommybarber-horario';
  function cargarBloqueos() {
    var g = REMOTO ? null : leerJSON(CLAVE_HORARIO, null);
    var hoy = ahoraPY().clave;
    return (g && Array.isArray(g.bloqueos) ? g.bloqueos : []).filter(function (b) {
      return b && b.fecha && ['cerrado', 'franja', 'especial'].indexOf(b.tipo) >= 0 && (b.tipo === 'cerrado' ? b.hasta : b.fecha) >= hoy;
    });
  }
  function guardarBloqueos() { if (REMOTO) sincronizar(); else guardarJSON(CLAVE_HORARIO, { version: 1, bloqueos: BLOQ }); }
  var BLOQ = cargarBloqueos();

  // Cambios de horario de ese día: los de todo el local (barbero vacío) o los de un barbero
  function bloqueosDel(clave, lista, barbero) {
    return (lista || BLOQ).filter(function (b) {
      return (b.barbero || '') === (barbero || '') && (b.tipo === 'cerrado' ? clave >= b.fecha && clave <= b.hasta : b.fecha === clave);
    });
  }
  function restarFranja(tramos, desde, fin) {
    var quedan = [];
    tramos.forEach(function (t) {
      if (fin <= t[0] || desde >= t[1]) { quedan.push(t); return; }
      if (desde > t[0]) quedan.push([t[0], desde]);
      if (fin < t[1]) quedan.push([fin, t[1]]);
    });
    return quedan;
  }
  // Tramos en que se atiende ese día: el horario normal con los cambios del dueño
  function horasDe(clave, lista) {
    var tramos = HORAS[diaSemana(clave)].map(function (t) { return t.slice(); });
    var cambios = bloqueosDel(clave, lista);
    if (cambios.some(function (b) { return b.tipo === 'cerrado'; })) return [];
    var esp = cambios.find(function (b) { return b.tipo === 'especial'; });
    if (esp) tramos = [[esp.desde, esp.fin]];
    cambios.filter(function (b) { return b.tipo === 'franja'; }).forEach(function (b) { tramos = restarFranja(tramos, b.desde, b.fin); });
    return tramos;
  }
  // Tramos en que atiende un barbero ese día: el horario del local recortado a sus horas, menos sus cierres propios.
  // Un día con otro horario del local (por ejemplo, un domingo que se abre), atienden todos en ese horario, salvo un cierre propio.
  function horasBarbero(b, clave, lista) {
    if (!b) return [];
    var rango = b.dias[diaSemana(clave)];
    var especial = bloqueosDel(clave, lista).some(function (x) { return x.tipo === 'especial'; });
    if (!rango && !especial) return [];
    var tramos = [];
    horasDe(clave, lista).forEach(function (t) {
      var a = especial ? t[0] : Math.max(t[0], rango[0]), z = especial ? t[1] : Math.min(t[1], rango[1]);
      if (z > a) tramos.push([a, z]);
    });
    var propios = bloqueosDel(clave, lista, b.id);
    if (propios.some(function (x) { return x.tipo === 'cerrado'; })) return [];
    propios.filter(function (x) { return x.tipo === 'franja'; }).forEach(function (x) { tramos = restarFranja(tramos, x.desde, x.fin); });
    return tramos;
  }
  function entraEnHorario(t, lista) {
    return horasBarbero(barberoPorId(t.barbero), t.fecha, lista).some(function (tr) { return t.min >= tr[0] && t.min + t.dur <= tr[1]; });
  }
  function textoBloqueo(b) {
    if (b.barbero) {
      var n = nombreBarbero(b.barbero);
      if (b.tipo === 'cerrado') return n + ' no atiende' + (b.hasta > b.fecha ? '' : ' ese día');
      return n + ' no atiende de ' + hhmm(b.desde) + ' a ' + hhmm(b.fin);
    }
    if (b.tipo === 'cerrado') return b.hasta > b.fecha ? 'Cerrado' : 'Cerrado todo el día';
    if (b.tipo === 'franja') return 'Cerrado de ' + hhmm(b.desde) + ' a ' + hhmm(b.fin);
    return 'Abre de ' + hhmm(b.desde) + ' a ' + hhmm(b.fin);
  }
  function fechasBloqueo(b) {
    if (b.tipo !== 'cerrado' || b.hasta === b.fecha) return cap(diaLargo(b.fecha));
    return 'Del ' + diaLargo(b.fecha) + ' al ' + diaLargo(b.hasta);
  }

  function bloques(min) { return Math.ceil(min / PASO); }
  function ocupacionDe(lista, clave) {
    var ocup = {};
    lista.forEach(function (t) {
      if (t.fecha !== clave || t.estado === 'cancelado') return;
      for (var j = 0; j < bloques(t.dur); j++) ocup[t.min + j * PASO] = true;
    });
    return ocup;
  }
  // Cada barbero tiene su agenda: un turno solo ocupa la de su barbero
  function ocupacionBarbero(id, clave, lista) {
    return ocupacionDe((lista || todosLosTurnos()).filter(function (t) { return t.barbero === id; }), clave);
  }
  function trabajaA(b, clave, m, dur) {
    return horasBarbero(b, clave).some(function (tr) { return m >= tr[0] && m + dur <= tr[1]; });
  }
  // El turno entra en el horario del barbero y no pisa otro turno suyo
  function libreBarbero(b, clave, m, dur, ocup) {
    if (!trabajaA(b, clave, m, dur)) return false;
    for (var j = 0; j < bloques(dur); j++) if (ocup[m + j * PASO]) return false;
    return true;
  }
  // «El que esté libre»: entre los barberos libres a esa hora, el que tiene menos turnos ese día
  function elegirBarbero(cands, clave, m, dur, lista) {
    lista = lista || todosLosTurnos();
    var libres = cands.filter(function (b) { return libreBarbero(b, clave, m, dur, ocupacionBarbero(b.id, clave, lista)); });
    if (!libres.length) return null;
    var cuenta = function (b) { return lista.filter(function (t) { return t.barbero === b.id && t.fecha === clave && t.estado !== 'cancelado'; }).length; };
    return libres.map(function (b, i) { return { b: b, n: cuenta(b), i: i }; }).sort(function (x, y) { return x.n - y.n || x.i - y.i; })[0].b;
  }
  function empezo(t, h) { return t.fecha < h.clave || (t.fecha === h.clave && h.min >= t.min); }
  function estadoVisible(t, h) { return t.estado === 'confirmado' && empezo(t, h) ? 'silla' : t.estado; }

  /* ===================== Datos del panel (de ejemplo, se guardan en el navegador) ===================== */
  var NOMBRES = ['Derlis Ortiz', 'Matías Benítez', 'Nahuel Cáceres', 'Fabrizio Giménez', 'Hugo Ayala', 'Rodrigo Villalba', 'Iván Rolón',
    'Óscar Duarte', 'Lucas Brítez', 'Elías Martínez', 'Tobías Aquino', 'Junior Ramírez', 'Gustavo Vera', 'Alan Núñez', 'Diego Sanabria',
    'Marcos Florentín', 'Enzo Galeano', 'Kevin Riquelme', 'Bruno Ortellado', 'Sergio Arce'];
  var PREFIJOS_EJ = ['0981', '0982', '0971', '0961', '0985', '0976'];
  // Más clientes para el historial: nombres y apellidos comunes de Paraguay combinados
  var PILA_EJ = ['Juan', 'Carlos', 'José', 'Luis', 'Miguel', 'Fernando', 'Ricardo', 'Pablo', 'Víctor', 'César', 'Hernán', 'Ariel', 'Mauricio',
    'Gabriel', 'Rubén', 'Javier', 'Adrián', 'Nelson', 'Fabián', 'Cristian', 'Ezequiel', 'Thiago', 'Mateo', 'Santiago', 'Benjamín', 'Joel',
    'Axel', 'Ángel', 'Hugo', 'Ramón', 'Osvaldo', 'Pedro', 'Daniel', 'Alejandro', 'Gonzalo', 'Rodrigo', 'Emanuel', 'Lautaro', 'Dylan', 'Néstor'];
  var APELLIDOS_EJ = ['González', 'Benítez', 'Martínez', 'López', 'Giménez', 'Vera', 'Duarte', 'Ramírez', 'Báez', 'Rojas', 'Acosta', 'Ortiz',
    'Fernández', 'Cabrera', 'Villalba', 'Aquino', 'Ayala', 'Cáceres', 'Romero', 'Sosa', 'Núñez', 'Franco', 'Insfrán', 'Espínola', 'Ojeda',
    'Galeano', 'Paredes', 'Ruiz Díaz', 'Torres', 'Zárate'];
  // Dos casos de ejemplo para la lista de clientes:
  // - Rodrigo Villalba (cliente fijo) cambió de número hace tres semanas y reservó con el nuevo.
  // - Thiago Duarte, hijo de Óscar Duarte, reserva con el número del papá.
  var NI_CAMBIO_EJ = 5, TEL_NUEVO_EJ = '0994 000 512', CORTE_TEL_EJ = sumarDias(ahoraPY().clave, -21);
  var NI_HIJO_EJ = 64, NI_PAPA_EJ = 7;
  function nombreEjemplo(ni) {
    if (ni === NI_HIJO_EJ) return 'Thiago Duarte';
    if (ni < NOMBRES.length) return NOMBRES[ni];
    var j = ni - NOMBRES.length;
    return PILA_EJ[j % PILA_EJ.length] + ' ' + APELLIDOS_EJ[(Math.floor(j / PILA_EJ.length) * 7 + j) % APELLIDOS_EJ.length];
  }
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

  function telEjemplo(i, clave) {
    if (i === NI_HIJO_EJ) i = NI_PAPA_EJ;
    if (i === NI_CAMBIO_EJ && clave && clave >= CORTE_TEL_EJ) return TEL_NUEVO_EJ;
    return PREFIJOS_EJ[i % PREFIJOS_EJ.length] + ' 000 ' + (100 + (i * 37) % 900);
  }
  function turnoEjemplo(clave, min, ni, servicio) {
    return normalizarTurno({
      id: 'E' + clave.replace(/-/g, '') + '-' + min, codigo: 'TB-' + (1000 + hashTxt(clave + '|' + min) % 9000),
      servicio: servicio, fecha: clave, min: min, cliente: nombreEjemplo(ni), tel: telEjemplo(ni, clave),
      creadoEn: msDe(sumarDias(clave, -2), 600 + ni * 7), ejemplo: true
    });
  }
  // Con la base de datos, cada celular arma identificadores que no se repiten con los de otro
  function idUnico(prefijo) { return prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function nuevoMov(d, obj) { obj.id = REMOTO ? idUnico('m') : 'm' + (d.nId++); d.mov.push(obj); return obj; }
  function nuevoMovStock(d, p, tipo, cantidad, ts, extra) {
    var m = momentoPY(ts);
    var r = Object.assign({ id: REMOTO ? idUnico('s') : 's' + (d.nId++), prodId: p.id, nombre: p.nombre, uni: p.uni.slice(), tipo: tipo, cantidad: cantidad, ts: ts, fecha: m.clave, min: m.min }, extra || {});
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
  // Historial de ejemplo: turnos de los últimos seis meses, siempre los mismos para cada fecha.
  // Alimenta la caja de los días anteriores, las fichas de clientes y los reportes.
  var DIAS_HISTORIAL = 186;
  var cacheHistorial = {};
  function historialDia(clave) {
    if (REMOTO) return [];
    if (cacheHistorial[clave]) return cacheHistorial[clave];
    var wd = diaSemana(clave);
    var lista = [];
    if (HORAS[wd].length) {
      var r = rng(hashTxt('hist|' + clave));
      // Horarios posibles del día, con más peso a las horas en que más gente viene
      var slots = [];
      HORAS[wd].forEach(function (tr) {
        for (var m = tr[0]; m < tr[1]; m += PASO) {
          var peso = 1;
          if (m >= 540 && m < 630) peso += 1.6;      // 09:00 a 10:30
          if (m >= 960 && m < 1050) peso += 1.3;     // 16:00 a 17:30
          if (wd >= 5 && m >= 660 && m < 840) peso += 0.9;  // viernes y sábado al mediodía
          slots.push({ m: m, peso: peso });
        }
      });
      var cuantos = Math.min(slots.length - 2, (wd >= 5 ? 11 : 7) + Math.floor(r() * 5));
      for (var i = 0; i < cuantos; i++) {
        var total = slots.reduce(function (a, s) { return a + s.peso; }, 0);
        var x = r() * total, j = 0;
        while (j < slots.length - 1 && (x -= slots[j].peso) > 0) j++;
        var m = slots.splice(j, 1)[0].m;
        // Clientes fijos (vienen cada dos o tres semanas), ocasionales y de una sola vez
        var tipo = r();
        var ni = tipo < 0.45 ? Math.floor(r() * 60) : tipo < 0.8 ? 60 + Math.floor(r() * 200) : 260 + Math.floor(r() * 540);
        var sid = POPULARES[Math.floor(r() * POPULARES.length)];
        var t = turnoEjemplo(clave, m, ni, sid);
        t.id = 'H' + clave.replace(/-/g, '') + '-' + m;
        t.precio = OFICIAL[sid].precio; t.dur = OFICIAL[sid].min;
        var faltador = ni === 3 || ni === 11;  // dos clientes que faltan seguido
        var u = r();
        if (u < (faltador ? 0.3 : 0.045)) t.estado = 'novino';
        else if (u < (faltador ? 0.36 : 0.095)) {
          t.estado = 'cancelado';
          t.canceladoPor = r() < 0.8 ? 'cliente' : 'barberia';
          t.canceladoEn = msDe(sumarDias(clave, -1), 900 + i * 7);
        } else {
          t.estado = 'atendido';
          t.medio = MEDIOS_EJ[i % MEDIOS_EJ.length];
        }
        t.historial = true;
        lista.push(t);
      }
      lista.sort(function (a, b) { return a.min - b.min; });
    }
    cacheHistorial[clave] = lista;
    return lista;
  }
  function historialHasta(h) {
    var l = [];
    for (var k = DIAS_HISTORIAL; k >= 1; k--) l = l.concat(historialDia(sumarDias(h.clave, -k)));
    return l;
  }
  // Movimientos de caja de un día pasado sin movimientos guardados (los arma el historial de ejemplo)
  function cajaEjemploDia(clave) {
    var wd = diaSemana(clave);
    if (!HORAS[wd].length) return [];
    var hechos = historialDia(clave).filter(function (t) { return t.estado === 'atendido'; });
    var movs = [{ fecha: clave, min: 1050, tipo: 'entrada', cat: 'servicio', concepto: 'Servicios del día', monto: hechos.reduce(function (a, t) { return a + t.precio; }, 0), medio: 'Varios', turnos: hechos.length }];
    var r = rng(hashTxt(clave));
    var vendidos = Math.floor(r() * 4);
    if (vendidos > 0) movs.push({ fecha: clave, min: 1050, tipo: 'entrada', cat: 'producto', concepto: 'Productos vendidos', monto: vendidos * (30000 + Math.floor(r() * 4) * 5000), medio: 'Varios', cantidad: vendidos });
    var dm = fechaDe(clave).getUTCDate();
    var g = null;
    if (dm === 5) g = ['compra', 'Mercadería: ceras y pomadas', 420000, 'Transferencia'];
    else if (dm === 8) g = ['gasto', 'ANDE (luz)', 185000, 'Transferencia'];
    else if (dm === 12) g = ['gasto', 'Internet', 140000, 'Transferencia'];
    else if (r() < 0.25) g = r() < 0.5 ? ['gasto', 'Bidón de agua', 12000, 'Efectivo'] : ['compra', 'Talco y alcohol', 32000, 'Efectivo'];
    if (g) movs.push({ fecha: clave, min: 1000, tipo: 'salida', cat: g[0], concepto: g[1], monto: g[2], medio: g[3] });
    return movs;
  }

  function completarHistorial(d, h) {
    var conMov = {};
    d.mov.forEach(function (m) { conMov[m.fecha] = true; });
    for (var k = 40; k >= 1; k--) {
      var clave = sumarDias(h.clave, -k);
      if (conMov[clave]) continue;
      cajaEjemploDia(clave).forEach(function (m) { nuevoMov(d, m); });
    }
  }

  // Turnos de ejemplo de hoy y de los próximos tres días con atención, sin pisar los reservados de verdad
  function turnosDeEjemplo(d, h) {
    var hechos = [];
    var ahora = Date.now();
    // Los turnos de ejemplo son del primer barbero activo
    var b0 = barberosActivos()[0];
    function libre(clave, wd, m, dur) { return libreBarbero(b0, clave, m, dur, ocupacionBarbero(b0.id, clave, misReservas.concat(hechos))); }

    var plantilla = h.wd === 0 ? [] : (h.wd >= 5 ? PLANTILLA_FINDE : PLANTILLA_SEMANA);
    plantilla.forEach(function (p, i) {
      var s = SERV[p[2]];
      if (!libre(h.clave, h.wd, p[0], s.min)) return;
      var t = turnoEjemplo(h.clave, p[0], p[1], s.id);
      t.barbero = b0.id;
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
      if (!horasBarbero(b0, clave).length) continue;
      abiertos++;
      var r = rng(hashTxt('ejemplo|' + clave));
      var usados = {};
      var prob = abiertos === 1 ? 0.3 : 0.22;
      horasBarbero(b0, clave).forEach(function (tr) {
        for (var m = tr[0]; m < tr[1]; m += PASO) {
          if (r() > prob) continue;
          var sid = POPULARES[Math.floor(r() * POPULARES.length)];
          if (!libre(clave, wd, m, SERV[sid].min)) continue;
          var ni = Math.floor(r() * NOMBRES.length);
          for (var intento = 0; usados[ni] && intento < NOMBRES.length; intento++) ni = (ni + 1) % NOMBRES.length;
          usados[ni] = true;
          var t = turnoEjemplo(clave, m, ni, sid);
          t.barbero = b0.id;
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
    // Con la base de datos no hay datos de ejemplo: los turnos, la caja y el stock llegan del servidor
    if (REMOTO) return { version: VERSION_DATOS, fecha: h.clave, turnos: [], mov: [], productos: [], movStock: [], nId: 1 };
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
  function guardarDatos() { if (REMOTO) sincronizar(); else guardarJSON(CLAVE_PANEL, D); }
  guardarDatos();

  function todosLosTurnos() {
    if (!misReservas.length) return D.turnos.slice();
    // Si el panel está abierto en el mismo celular, los turnos propios ya están entre los del panel
    if (REMOTO && PANEL.listo) {
      var hay = {};
      D.turnos.forEach(function (t) { hay[t.id] = true; });
      return D.turnos.concat(misReservas.filter(function (t) { return !hay[t.id]; }));
    }
    return D.turnos.concat(misReservas);
  }
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
      var desc = s.grupo === 'combo' ? esc(s.incluye) + '. ' + durTxt(s.min) + ' aprox.' : durTxt(s.min) + ' aprox.';
      return '<div class="precio-fila">' +
        '<div class="precio-linea"><span class="precio-nombre">' + esc(s.nombre) + '</span><span class="precio-puntos" aria-hidden="true"></span><span class="precio-valor">' + gs(s.precio) + '</span></div>' +
        '<a class="btn btn-linea" href="#reservar" data-reservar="' + s.id + '" aria-label="Reservar ' + esc(nombreServicio(s)) + '">Reservar</a>' +
        '<p class="precio-desc">' + desc + '</p>' +
      '</div>';
    }
    document.getElementById('lista-precios').innerHTML =
      '<h3 class="precios-grupo">Servicios</h3><div class="precios">' + serviciosActivos('servicio').map(fila).join('') + '</div>' +
      (serviciosActivos('combo').length ? '<h3 class="precios-grupo">Combos</h3><div class="precios">' + serviciosActivos('combo').map(fila).join('') + '</div>' : '');
  }

  function renderHorarios() {
    var h = ahoraPY();
    var filaHoy = h.wd === 0 ? 2 : (h.wd >= 5 ? 1 : 0);
    var filas = [['Lunes a jueves', '08:00 a 11:30 y 13:00 a 17:30'], ['Viernes y sábado', '08:00 a 17:30, de corrido'], ['Domingo', 'Cerrado']];
    // Cambios de horario de las próximas dos semanas
    var limite = sumarDias(h.clave, DIAS_ADELANTE - 1);
    var avisos = BLOQ.filter(function (b) { return b.fecha <= limite; }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
    document.getElementById('lista-horarios').innerHTML = avisos.map(function (b) {
      var txt = textoBloqueo(b);
      return '<p class="horarios-aviso">' + esc(fechasBloqueo(b)) + ': ' + esc(b.barbero ? txt : minus(txt)) + (b.motivo ? '<span>' + esc(b.motivo) + '</span>' : '') + '</p>';
    }).join('') + filas.map(function (f, i) {
      return '<div class="horario-fila' + (i === filaHoy ? ' hoy' : '') + '">' +
        '<p class="horario-dias">' + f[0] + (i === filaHoy ? '<span class="horario-hoy">hoy</span>' : '') + '</p>' +
        '<p class="horario-horas">' + f[1] + '</p></div>';
    }).join('') +
    (hayVarios() ? '<div class="horarios-barberos"><p class="horarios-barberos-t">Barberos</p>' + barberosActivos().map(function (b) {
      return '<p><strong>' + esc(b.nombre) + ':</strong> ' + esc(minus(textoDias(b.dias))) + '</p>';
    }).join('') + '</div>' : '');
  }

  /* ===================== Reserva y Mis turnos ===================== */
  var R = { modo: 'reservar', paso: 1, servicio: null, diaIdx: null, hora: null, nombre: '', tel: '', nota: '', ultimo: null, cancelando: null, aviso: '',
    enviando: false,      // con la base de datos: esperando la respuesta del servidor
    limiteServidor: null, // { wa, nombre, texto }: tope que avisó el servidor
    barbero: '',      // '' = el que esté libre
    cambiando: null,  // id del turno que el cliente está cambiando de día u hora
    cambiado: false   // el comprobante muestra «Turno cambiado»
  };

  // Barberos entre los que se busca lugar: el elegido o todos los activos
  function candidatosReserva() {
    var b = R.barbero ? barberoPorId(R.barbero) : null;
    return b && b.activo ? [b] : barberosActivos();
  }
  // Protección contra turnos falsos: números bloqueados por el dueño y un tope de turnos pendientes.
  // Una persona (WhatsApp + nombre) tiene un turno pendiente a la vez; un mismo WhatsApp puede reservar
  // para varias personas (un papá para sus hijos que no tienen celular), hasta MAX_POR_NUMERO.
  var MAX_POR_NUMERO = 4, MAX_POR_CELULAR = 4;
  function limiteReserva(tel, nombre) {
    var t = telInfo(tel);
    if (!t.ok) return '';
    // Lo que respondió el servidor para este número y este nombre
    if (R.limiteServidor && R.limiteServidor.wa === t.wa && R.limiteServidor.nombre === nombreNorm(nombre)) return R.limiteServidor.texto;
    if (numeroBloqueado(t.wa)) return 'Este número no puede reservar por la web. Para pedir un turno, escribinos al WhatsApp ' + WA_LOCAL_TXT + '.';
    var h = ahoraPY();
    var pendientes = todosLosTurnos().filter(function (x) { return x.estado === 'confirmado' && !empezo(x, h); });
    var mismoNumero = pendientes.filter(function (x) { return telInfo(x.tel).wa === t.wa; });
    var n = nombreNorm(nombre);
    var persona = n && mismoNumero.find(function (x) { return nombreNorm(x.cliente) === n; });
    if (persona) return 'Ya hay un turno a nombre de ' + persona.cliente + ' ' + cuandoTurno(persona.fecha, persona.min, false) + '. Si necesitás otro horario, cambialo desde Mis turnos. Si es para otra persona, poné su nombre.';
    if (mismoNumero.length >= MAX_POR_NUMERO) return 'Con este WhatsApp ya hay ' + mismoNumero.length + ' turnos pendientes. Para reservar más, escribinos al ' + WA_LOCAL_TXT + '.';
    var delCelular = misReservas.filter(function (x) { return x.estado === 'confirmado' && !empezo(x, h); });
    if (delCelular.length >= MAX_POR_CELULAR) return 'Desde este celular ya hay ' + delCelular.length + ' turnos pendientes. Para reservar más, escribinos al ' + WA_LOCAL_TXT + '.';
    return '';
  }

  function modeloReserva() {
    var h = ahoraPY();
    var serv = SERV[R.servicio] || null;
    if (serv && serv.activo === false) serv = null;
    var dur = serv ? serv.min : PASO;
    var cambio = R.cambiando ? buscarTurno(R.cambiando) : null;
    if (cambio) { serv = SERV[cambio.servicio]; dur = cambio.dur; }
    var cands = candidatosReserva();
    var otros = todosLosTurnos().filter(function (t) { return t.id !== R.cambiando; });
    var lista = [];
    for (var k = 0; k < DIAS_ADELANTE; k++) {
      var clave = sumarDias(h.clave, k);
      var f = fechaDe(clave);
      var wd = f.getUTCDay();
      var tramos = horasDe(clave);
      var slots = [];
      tramos.forEach(function (tr) {
        for (var m = tr[0]; m + dur <= tr[1]; m += PASO) {
          if (k === 0 && m < h.min + ANTICIPACION) continue;
          // Solo se muestran las horas en que trabaja alguno de los barberos elegidos
          if (!cands.some(function (b) { return trabajaA(b, clave, m, dur); })) continue;
          slots.push({ m: m, libre: !!elegirBarbero(cands, clave, m, dur, otros) });
        }
      });
      lista.push({ k: k, wd: wd, clave: clave, d: f.getUTCDate(), mo: f.getUTCMonth(), slots: slots, libres: slots.filter(function (s) { return s.libre; }).length,
        cerrado: tramos.length === 0, noViene: tramos.length > 0 && slots.length === 0 });
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
    var limite = cambio ? '' : limiteReserva(R.tel, R.nombre);
    var conQuien = hayVarios() ? (R.barbero && barberoPorId(R.barbero) ? ', con ' + nombreBarbero(R.barbero) : '') : '';
    var resumen = '';
    var btnTxt = '';
    var puede = false;
    if (cambio) {
      var mismo = horaSel != null && dia.clave === cambio.fecha && horaSel === cambio.min;
      resumen = horaSel == null ? 'Elegí el nuevo día y horario.' : (mismo ? 'Es el mismo horario que ya tenés.' : 'Nuevo horario: ' + DIAS[dia.wd] + ' ' + dia.d + ' a las ' + hhmm(horaSel) + '.');
      btnTxt = 'Cambiar mi turno';
      puede = horaSel != null && !mismo;
      paso = 2;
    } else if (paso === 1) {
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
      else if (limite) resumen = 'No se puede reservar con este número. Mirá el aviso arriba.';
      else resumen = serv.nombre + ', ' + DIAS[dia.wd] + ' ' + dia.d + ' a las ' + hhmm(horaSel) + conQuien;
      btnTxt = 'Confirmar turno';
      puede = nombreOk && tel.ok && horaSel != null && !limite;
    }
    if (R.enviando) { puede = false; btnTxt = cambio ? 'Cambiando…' : 'Confirmando…'; }
    return {
      h: h, serv: serv, lista: lista, dia: dia, horaSel: horaSel, paso: paso, nivel: nivel, cambio: cambio,
      resumen: resumen, btnTxt: btnTxt, puede: puede, limite: limite,
      telAyuda: limite || (tel.vacio || tel.ok ? 'Ahí te mandamos el recordatorio del turno.' : 'Escribí un celular de Paraguay con el 09 adelante, por ejemplo 0981 123 456.')
    };
  }

  function botonServicio(s) {
    var el = s.id === R.servicio;
    var sub = s.grupo === 'combo' ? esc(s.incluye) + ', ' + durTxt(s.min) : durTxt(s.min);
    return '<button type="button" class="rv-servicio' + (el ? ' elegido' : '') + '" data-accion="servicio" data-id="' + s.id + '" data-foco="s-' + s.id + '" aria-pressed="' + el + '">' +
      '<span class="rv-s-nombre condensada">' + esc(s.nombre) + '</span><span class="rv-s-precio condensada">' + gs(s.precio) + '</span><span class="rv-s-dur">' + sub + '</span></button>';
  }

  function cuerpoReservar(v) {
    if (v.paso === 1) {
      return '<fieldset class="rv-fieldset"><legend class="rv-legend" id="rv-foco" tabindex="-1">¿Qué te hacemos?</legend>' +
        '<p class="rv-grupo">Servicios</p><div class="rv-servicios">' + serviciosActivos('servicio').map(botonServicio).join('') + '</div>' +
        (serviciosActivos('combo').length ? '<p class="rv-grupo">Combos</p><div class="rv-servicios">' + serviciosActivos('combo').map(botonServicio).join('') + '</div>' : '') +
        '</fieldset>';
    }
    if (v.paso === 2) {
      var dias = v.lista.map(function (x) {
        var el = x.k === v.dia.k;
        var bloq = x.libres === 0;
        var nota = x.k === 0 ? 'hoy' : (x.k === 1 ? 'mañana' : '');
        if (x.cerrado) nota = 'cerrado'; else if (x.noViene) nota = 'no atiende'; else if (bloq) nota = 'sin lugar';
        var aria = DIAS[x.wd] + ' ' + x.d + ' de ' + MESES[x.mo] + (x.cerrado ? ', cerrado' : x.noViene ? ', ' + nombreBarbero(R.barbero) + ' no atiende' : (bloq ? ', sin lugar' : ', ' + plural(x.libres, 'horario libre', 'horarios libres')));
        return '<button type="button" class="rv-dia' + (el ? ' elegido' : '') + '" data-accion="dia" data-k="' + x.k + '" data-foco="d-' + x.k + '" aria-pressed="' + el + '" aria-label="' + aria + '"' + (bloq ? ' disabled' : '') + '>' +
          '<span class="rv-dia-sem">' + SEM[x.wd] + '</span><span class="rv-dia-num condensada">' + x.d + '</span><span class="rv-dia-nota">' + nota + '</span></button>';
      }).join('');
      var boton = function (s) {
        var el = s.m === v.horaSel;
        var actual = v.cambio && v.dia.clave === v.cambio.fecha && s.m === v.cambio.min;
        return '<button type="button" class="rv-hora' + (el ? ' elegido' : '') + (actual ? ' rv-hora-actual' : '') + '" data-accion="hora" data-k="' + v.dia.k + '" data-m="' + s.m + '" data-foco="h-' + s.m + '" aria-pressed="' + el + '" aria-label="' + hhmm(s.m) + (actual ? ', tu horario actual' : '') + (s.libre ? '' : ', ocupado') + '"' + (actual ? ' title="Tu horario actual"' : '') + (s.libre ? '' : ' disabled') + '>' + hhmm(s.m) + '</button>';
      };
      var franjas = [['Mañana', v.dia.slots.filter(function (s) { return s.m < 720; })], ['Tarde', v.dia.slots.filter(function (s) { return s.m >= 720; })]]
        .filter(function (f) { return f[1].length > 0; });
      return (R.aviso ? '<p class="rv-msg error" role="alert">' + esc(R.aviso) + '</p>' : '') +
        (v.cambio ? '<div class="rv-cambio"><p>Tu turno de ' + esc(servicioEnFrase(v.serv)) + ' es ' + esc(cuandoTurno(v.cambio.fecha, v.cambio.min, false)) + '. Elegí el nuevo día y horario: el precio y el código no cambian.</p>' +
          '<button type="button" class="link-btn" data-accion="cambiar-volver" data-foco="cambiar-volver" style="padding-left:0">No cambiar, volver a Mis turnos</button></div>' : '') +
        (hayVarios() ? '<p class="rv-sub" id="rv-barbero-t">¿Con quién?</p><div class="rv-barberos" role="group" aria-labelledby="rv-barbero-t">' +
          [{ id: '', nombre: 'El que esté libre' }].concat(barberosActivos()).map(function (b) {
            var el = (R.barbero || '') === b.id;
            return '<button type="button" class="rv-barbero' + (el ? ' elegido' : '') + '" data-accion="barbero" data-id="' + esc(b.id) + '" data-foco="bb-' + esc(b.id || 'libre') + '" aria-pressed="' + el + '">' + esc(b.nombre) + '</button>';
          }).join('') + '</div>' : '') +
        '<p class="rv-sub" id="rv-foco" tabindex="-1">Elegí el día</p><div class="rv-dias">' + dias + '</div>' +
        '<p class="rv-sub">Horarios para el ' + DIAS[v.dia.wd] + ' ' + v.dia.d + '</p>' +
        (v.dia.noViene ? '<p class="rv-aviso">' + esc(nombreBarbero(R.barbero)) + ' no atiende ese día. Elegí otro día o «El que esté libre».</p>'
          : v.dia.libres === 0 ? '<p class="rv-aviso">Ese día no queda lugar para ' + esc(minus(v.serv.nombre)) + '. Elegí otro día de la lista.</p>' : '') +
        franjas.map(function (f) { return '<p class="rv-franja">' + f[0] + '</p><div class="rv-horas">' + f[1].map(boton).join('') + '</div>'; }).join('');
    }
    if (v.paso === 3) {
      return '<div class="rv-form">' +
        (R.aviso ? '<p class="rv-msg error" role="alert">' + esc(R.aviso) + '</p>' : '') +
        '<p class="rv-sub" id="rv-foco" tabindex="-1" style="padding-bottom:0">Tus datos</p>' +
        '<div><label for="rv-nombre">Nombre de quien viene a cortarse</label><input class="campo" id="rv-nombre" data-campo="nombre" type="text" autocomplete="name" maxlength="60" aria-describedby="rv-nombre-ayuda" value="' + esc(R.nombre) + '">' +
          '<p class="rv-ayuda" id="rv-nombre-ayuda">¿Es para tu hijo o para alguien sin celular? Poné su nombre y tu WhatsApp.</p></div>' +
        '<div><label for="rv-tel">Tu número de WhatsApp</label><input class="campo" id="rv-tel" data-campo="tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0981 123 456" aria-describedby="rv-tel-ayuda" value="' + esc(R.tel) + '"><p class="rv-ayuda' + (v.limite ? ' error' : '') + '" id="rv-tel-ayuda" aria-live="polite">' + esc(v.telAyuda) + '</p></div>' +
        '<div><label for="rv-nota">Algo que tengamos que saber <span class="suave" style="font-weight:400">(opcional)</span></label><textarea class="campo" id="rv-nota" data-campo="nota" rows="3" maxlength="120">' + esc(R.nota) + '</textarea></div>' +
        '<div class="rv-resumen-caja"><p>' + esc(nombreServicio(v.serv)) + '</p><p>' + (v.horaSel != null ? cap(diaLargo(v.dia.clave)) + ' a las ' + hhmm(v.horaSel) : 'Elegí un horario en el paso 2.') + '</p>' +
          (hayVarios() ? '<p>Con ' + esc(R.barbero && barberoPorId(R.barbero) ? nombreBarbero(R.barbero) : 'el barbero que esté libre') + '</p>' : '') +
          '<p>' + gs(v.serv.precio) + ', se paga en la barbería.</p></div>' +
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
        '<p class="rv-confirmado condensada" id="rv-foco" tabindex="-1">' + (R.cambiado ? 'Turno cambiado' : 'Turno confirmado') + '</p>' +
        (R.cambiado && t.antes ? '<p class="rv-ticket-nota" style="margin-top:0">Antes era ' + esc(cuandoTurno(t.antes.fecha, t.antes.min, false)) + '. Ese horario quedó libre.</p>' : '') +
        '<dl><dt>Servicio</dt><dd>' + esc(nombreServicio(s)) + '</dd><dt>Día</dt><dd>' + esc(cap(diaLargo(t.fecha))) + '</dd><dt>Hora</dt><dd>' + hhmm(t.min) + '</dd>' +
        (hayVarios() ? '<dt>Con</dt><dd>' + esc(nombreBarbero(t.barbero)) + '</dd>' : '') +
        '<dt>A nombre de</dt><dd>' + esc(t.cliente) + '</dd><dt>Precio</dt><dd>' + gs(t.precio) + '</dd><dt>Código</dt><dd>' + esc(t.codigo) + '</dd></dl>' +
        '<div class="rv-corte" aria-hidden="true"></div>' +
        '<p class="rv-ticket-nota">Te esperamos en ' + DIRECCION + '. Te vamos a recordar el turno por WhatsApp al ' + esc(tel.lindo || t.tel) + '.</p>' +
        '<p class="rv-ticket-nota">Lo encontrás en Mis turnos: desde ahí lo podés cambiar o cancelar si no podés venir. ¿Dudas? Escribinos al <a href="' + esc(waLink(WA_LOCAL, 'Hola, tengo una consulta sobre mi turno ' + t.codigo + '.')) + '" target="_blank" rel="noopener">WhatsApp ' + WA_LOCAL_TXT + '</a>.</p>' +
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
      '<p class="mt-que">' + esc(nombreServicio(s)) + ', ' + gs(t.precio) + (hayVarios() ? ', con ' + esc(nombreBarbero(t.barbero)) : '') + '</p>' +
      '<p class="mt-codigo">Código ' + esc(t.codigo) + '</p>' +
      (estado ? '<p class="mt-estado">' + esc(estado) + '</p>' : '') +
      (t.estado === 'confirmado' && t.cambiadoEn && t.antes ? '<p class="mt-estado">Lo cambiaste ' + esc(cuandoFue(t.cambiadoEn)) + '; antes era ' + esc(cuandoTurno(t.antes.fecha, t.antes.min, false)) + '.</p>' : '') +
      (activo ? (R.cancelando === t.id ? confirmacionCancelar(t) : '<div class="mt-acciones"><button type="button" class="btn btn-linea btn-mini" data-accion="cambiar-mio" data-id="' + esc(t.id) + '" data-foco="cambiar-' + esc(t.id) + '">Cambiar día u hora</button>' +
        '<button type="button" class="link-btn link-rojo" data-accion="cancelar-mio" data-id="' + esc(t.id) + '" data-foco="cancelar-' + esc(t.id) + '">Cancelar turno</button></div>') : '') +
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
    return msg + '<p class="rv-intro-mis" id="rv-foco" tabindex="-1">Los turnos que reservaste desde este celular. Mientras no haya empezado, podés cambiarlo de día u hora o cancelarlo.</p>' +
      '<p class="rv-sub">Próximos</p>' + (prox.length ? '<ul class="mt-lista">' + prox.map(function (t) { return itemMio(t, h); }).join('') + '</ul>' : '<p class="rv-aviso" style="margin-top:0">No tenés turnos próximos.</p>') +
      (otros.length ? '<p class="rv-sub">Anteriores y cancelados</p><ul class="mt-lista">' + otros.map(function (t) { return itemMio(t, h); }).join('') + '</ul>' : '');
  }

  // En «Tus datos», el cursor va directo al primer dato que falta (o al botón de confirmar)
  function enfocarDatos() {
    var n = document.getElementById('rv-nombre'), t = document.getElementById('rv-tel'), c = document.getElementById('rv-seguir');
    var el = n && R.nombre.trim().length < 2 ? n : (t && !telInfo(R.tel).ok ? t : c);
    if (el && !el.disabled) el.focus({ preventScroll: true });
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
    var enCambio = !enMis && !!v.cambio && v.paso < 4;
    var pasos = ['Servicio', 'Día y hora', 'Tus datos'].map(function (n, i) {
      var num = i + 1;
      var bloq = num > v.nivel || num === v.paso;
      return '<li><button type="button" class="rv-paso' + (num <= v.paso ? ' activo' : '') + '" data-accion="paso" data-n="' + num + '" data-foco="p-' + num + '"' + (bloq ? ' disabled' : '') + (num === v.paso ? ' aria-current="step"' : '') + '><b>' + num + '</b> ' + n + '</button></li>';
    }).join('');
    var cambiar = enMis
      ? '<button type="button" class="btn btn-linea btn-mini" data-accion="modo" data-modo="reservar" data-foco="modo">Reservar</button>'
      : '<button type="button" class="btn btn-linea btn-mini" data-accion="modo" data-modo="mis" data-foco="modo"' + (nMios ? ' aria-label="Mis turnos: ' + plural(nMios, 'turno próximo', 'turnos próximos') + '"' : '') + '>Mis turnos' + (nMios ? '<span class="contador" aria-hidden="true">' + nMios + '</span>' : '') + '</button>';
    // El botón de abajo queda solo para confirmar: elegir el servicio y la hora ya pasa al paso siguiente
    var mostrarPie = !enMis && (v.paso === 3 || (v.cambio && v.paso < 4));
    if (REMOTO && !SITIO.cargado) {
      caja.innerHTML = '<div class="rv"><div class="rv-cabeza"><div class="rv-titulo-fila"><span class="logo logo-44" aria-hidden="true"></span><h3 class="rv-titulo condensada">Reservar turno</h3></div></div>' +
        '<div class="rv-cuerpo">' + (SITIO.error
          ? '<p class="rv-msg error" role="alert">No pudimos cargar los horarios. Revisá tu conexión y probá de nuevo. También podés pedir tu turno por <a href="' + esc(waLink(WA_LOCAL, 'Hola, quiero reservar un turno.')) + '" target="_blank" rel="noopener">WhatsApp al ' + WA_LOCAL_TXT + '</a>.</p>' +
            '<div class="rv-acciones"><button type="button" class="btn btn-rojo" data-accion="reintentar" data-foco="reintentar">Probar de nuevo</button></div>'
          : '<p class="rv-cargando" role="status">Cargando los horarios libres…</p>') + '</div></div>';
      return;
    }
    caja.innerHTML = '<div class="rv">' +
      '<div class="rv-cabeza"><div class="rv-titulo-fila"><span class="logo logo-44" aria-hidden="true"></span><h3 class="rv-titulo condensada">' + (enMis ? 'Mis turnos' : (enCambio ? 'Cambiar turno' : 'Reservar turno')) + '</h3>' + cambiar + '</div>' +
      (!enMis && !enCambio && v.paso < 4 ? '<ol class="rv-pasos" aria-label="Pasos de la reserva">' + pasos + '</ol>' : '') + '</div>' +
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
    if (a) { a.textContent = v.telAyuda; a.classList.toggle('error', !!v.limite); }
  }

  function nuevoCodigo() {
    if (REMOTO) {
      // Igual que los que da el servidor: TB- y 6 letras o números que no se confunden
      var letras = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', b = new Uint8Array(6), r = 'TB-';
      crypto.getRandomValues(b);
      for (var i = 0; i < 6; i++) r += letras[b[i] % letras.length];
      return r;
    }
    var usados = {};
    todosLosTurnos().forEach(function (t) { usados[t.codigo] = true; });
    var c;
    do { c = 'TB-' + (1000 + Math.floor(Math.random() * 9000)); } while (usados[c]);
    return c;
  }

  function confirmarReserva(v) {
    if (REMOTO) { reservarEnServidor(v); return; }
    var s = v.serv;
    var dia = v.dia;
    var m = v.horaSel;
    // Se revisa otra vez que el horario siga libre (alguien pudo reservarlo en otra pestaña)
    misReservas = cargarReservas();
    var barbero = elegirBarbero(candidatosReserva(), dia.clave, m, s.min);
    if (!barbero) {
      R.paso = 2; R.hora = null; R.aviso = 'Alguien reservó ese horario recién. Elegí otro.';
      return;
    }
    if (limiteReserva(R.tel, R.nombre)) return;
    var codigo = nuevoCodigo();
    var t = normalizarTurno({ id: codigo, codigo: codigo, servicio: s.id, fecha: dia.clave, min: m, precio: s.precio, dur: s.min, cliente: R.nombre.trim(), tel: telInfo(R.tel).lindo, nota: R.nota.trim(), creadoEn: Date.now(), barbero: barbero.id });
    misReservas.push(t);
    guardarReservas();
    R.ultimo = codigo; R.paso = 4; R.hora = null; R.diaIdx = null; R.aviso = ''; R.cancelando = null; R.cambiado = false;
    renderHeroTurno();
  }

  function cambiarTurnoCliente(v) {
    if (REMOTO) { cambiarEnServidor(v); return; }
    var t = v.cambio;
    var h = ahoraPY();
    misReservas = cargarReservas();
    t = buscarTurno(t.id);
    if (!t || t.estado !== 'confirmado' || empezo(t, h)) { R.cambiando = null; R.modo = 'mis'; R.aviso = 'Ese turno ya no se puede cambiar.'; return; }
    var otros = todosLosTurnos().filter(function (x) { return x.id !== t.id; });
    var barbero = elegirBarbero(candidatosReserva(), v.dia.clave, v.horaSel, t.dur, otros);
    if (!barbero) {
      R.hora = null; R.aviso = 'Alguien reservó ese horario recién. Elegí otro.';
      return;
    }
    t.antes = { fecha: t.fecha, min: t.min };
    t.fecha = v.dia.clave; t.min = v.horaSel; t.barbero = barbero.id;
    t.cambiadoEn = Date.now();
    t.recordadoEn = 0;  // el recordatorio era para el horario anterior
    guardarTurno(t);
    R.ultimo = t.id; R.paso = 4; R.cambiando = null; R.cambiado = true; R.hora = null; R.diaIdx = null; R.aviso = '';
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
    if (a === 'reintentar') { SITIO.error = false; renderReserva(); cargarSitio(); return; }
    if (a === 'modo') { R.modo = b.getAttribute('data-modo'); R.aviso = ''; R.cancelando = null; R.cambiando = null; if (R.modo === 'reservar' && R.paso === 2 && !R.servicio) R.paso = 1; renderReserva(true); }
    else if (a === 'cambiar-mio') {
      var tc = buscarTurno(id);
      R.barbero = tc && hayVarios() && barberoPorId(tc.barbero) && barberoPorId(tc.barbero).activo ? tc.barbero : '';
      R.modo = 'reservar'; R.cambiando = id; R.paso = 2; R.diaIdx = null; R.hora = null; R.aviso = ''; R.cancelando = null; R.cambiado = false;
      renderReserva(true);
    }
    else if (a === 'cambiar-volver') { R.cambiando = null; R.modo = 'mis'; R.aviso = ''; R.paso = 1; R.servicio = null; renderReserva(true); }
    else if (a === 'servicio') { R.servicio = b.getAttribute('data-id'); R.hora = null; R.aviso = ''; R.paso = 2; renderReserva(true); }
    else if (a === 'paso') { R.paso = +b.getAttribute('data-n'); R.aviso = ''; renderReserva(true); }
    else if (a === 'dia') { R.diaIdx = +b.getAttribute('data-k'); R.hora = null; R.aviso = ''; renderReserva(); }
    else if (a === 'barbero') { R.barbero = id || ''; R.hora = null; R.aviso = ''; renderReserva(); }
    else if (a === 'hora') {
      R.diaIdx = +b.getAttribute('data-k'); R.hora = +b.getAttribute('data-m'); R.aviso = '';
      if (R.cambiando) { renderReserva(); return; }  // al cambiar un turno se confirma con el botón
      R.paso = 3;
      renderReserva(true);
      enfocarDatos();
    }
    else if (a === 'seguir') {
      var v = modeloReserva();
      if (!v.puede) return;
      if (v.cambio) { cambiarTurnoCliente(v); renderReserva(true); if (!panelEl.hidden && P.acceso) renderPanel(); return; }
      if (v.paso === 1) R.paso = 2;
      else if (v.paso === 2) { R.paso = 3; R.diaIdx = v.dia.k; }
      else if (v.paso === 3) confirmarReserva(v);
      renderReserva(true);
    }
    else if (a === 'otro') {
      R.modo = 'reservar'; R.paso = 1; R.servicio = null; R.hora = null; R.diaIdx = null; R.ultimo = null; R.nota = ''; R.aviso = ''; R.cancelando = null; R.cambiando = null; R.cambiado = false;
      renderReserva(true);
    }
    else if (a === 'cancelar-mio') { R.cancelando = id; renderReserva(); var si = cajaReserva.querySelector('[data-accion="cancelar-mio-si"]'); if (si) si.focus({ preventScroll: true }); }
    else if (a === 'cancelar-mio-no') { R.cancelando = null; renderReserva(); var c = cajaReserva.querySelector('[data-foco="cancelar-' + id + '"]'); if (c) c.focus({ preventScroll: true }); }
    else if (a === 'cancelar-mio-si' && REMOTO) { cancelarEnServidor(id); }
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
    R.paso = 2; R.diaIdx = null; R.hora = null; R.ultimo = null; R.aviso = ''; R.cancelando = null; R.cambiando = null;
    renderReserva();
  });

  document.addEventListener('click', function (e) {
    var mis = e.target.closest('[data-mis-turnos]');
    if (mis) { e.preventDefault(); if (location.hash !== '#mis-turnos') history.replaceState(null, '', '#mis-turnos'); abrirMisTurnos(); return; }
    var res = e.target.closest('a[href="#reservar"]:not([data-reservar])');
    if (res && R.modo === 'mis') { R.modo = 'reservar'; R.aviso = ''; R.cancelando = null; renderReserva(); }
  });

  /* ===================== Fotos de la página ===================== */
  // El dueño cambia el logo, la foto del local y las fotos de cortes desde el panel.
  // Las fotos se achican en el celular antes de guardarlas, para que la página siga cargando rápido.
  // { version: 1, logo: dataURL | null, fachada: { src, alt, w, h } | null,
  //   galeria: null (las de siempre) | [{ tipo: 'original', n } | { tipo: 'nueva', id, src, alt, w, h }] }
  var CLAVE_FOTOS = 'tommybarber-fotos';
  var MAX_GALERIA = 8;
  var TAM_FOTO = { logo: 512, fachada: 1280, galeria: 1000 };  // lado más largo, en píxeles
  function esFoto(x) { return typeof x === 'string' && /^data:image\/(webp|jpeg|png);base64,/.test(x); }
  function cargarFotos() {
    var g = (REMOTO ? null : leerJSON(CLAVE_FOTOS, null)) || {};
    var f = { version: 1, logo: esFoto(g.logo) ? g.logo : null, fachada: null, galeria: null };
    if (g.fachada && esFoto(g.fachada.src)) f.fachada = { src: g.fachada.src, alt: String(g.fachada.alt || '').slice(0, 160), w: +g.fachada.w || 1080, h: +g.fachada.h || 859 };
    if (Array.isArray(g.galeria)) {
      f.galeria = g.galeria.filter(function (x) {
        return x && ((x.tipo === 'original' && x.n >= 0 && x.n < ORIG.galeria.length) || (x.tipo === 'nueva' && esFoto(x.src)));
      }).slice(0, MAX_GALERIA).map(function (x) {
        return x.tipo === 'original' ? { tipo: 'original', n: +x.n } : { tipo: 'nueva', id: String(x.id || Date.now()), src: x.src, alt: String(x.alt || '').slice(0, 160), w: +x.w || 800, h: +x.h || 1000 };
      });
    }
    return f;
  }
  // Las fotos de siempre (las que vienen con la página), para poder volver a ellas
  function nodoFachada() {
    var img = document.getElementById('foto-fachada');
    return img ? (img.parentNode.tagName === 'PICTURE' ? img.parentNode : img) : null;
  }
  var ORIG = (function () {
    var nf = nodoFachada(), imgF = document.getElementById('foto-fachada');
    var icono = document.querySelector('link[rel="icon"]');
    return {
      fachadaHtml: nf ? nf.outerHTML : '', fachadaSrc: imgF ? imgF.getAttribute('src') : '', fachadaAlt: imgF ? imgF.alt : '',
      galeria: Array.prototype.map.call(document.querySelectorAll('.galeria > li'), function (li) {
        var im = li.querySelector('img');
        return { html: li.outerHTML, src: im ? im.getAttribute('src') : '', alt: im ? im.alt : '' };
      }),
      favicon: icono ? icono.getAttribute('href') : ''
    };
  })();
  var FOTOS = cargarFotos();
  function guardarFotos() {
    if (REMOTO) { encolarFotos(); return true; }
    try { localStorage.setItem(CLAVE_FOTOS, JSON.stringify(FOTOS)); return true; } catch (e) { return false; }
  }
  function galeriaActual() {
    return FOTOS.galeria || ORIG.galeria.map(function (o, i) { return { tipo: 'original', n: i }; });
  }
  function aplicarFotos() {
    var st = document.getElementById('fotos-estilo');
    if (!st) { st = document.createElement('style'); st.id = 'fotos-estilo'; document.head.appendChild(st); }
    st.textContent = FOTOS.logo ? '.logo{background-image:url("' + FOTOS.logo + '")!important}' : '';
    var icono = document.querySelector('link[rel="icon"]');
    if (icono && ORIG.favicon) icono.setAttribute('href', FOTOS.logo || ORIG.favicon);
    var nf = nodoFachada();
    if (nf) {
      var tmp = document.createElement('div');
      tmp.innerHTML = FOTOS.fachada
        ? '<img id="foto-fachada" src="' + FOTOS.fachada.src + '" width="' + FOTOS.fachada.w + '" height="' + FOTOS.fachada.h + '" loading="lazy" decoding="async" alt="' + esc(FOTOS.fachada.alt) + '">'
        : ORIG.fachadaHtml;
      if (tmp.firstChild) nf.parentNode.replaceChild(tmp.firstChild, nf);
    }
    var ul = document.querySelector('.galeria');
    if (ul) ul.innerHTML = galeriaActual().map(function (x) {
      return x.tipo === 'original' ? ORIG.galeria[x.n].html
        : '<li><figure class="foto"><img src="' + x.src + '" width="' + x.w + '" height="' + x.h + '" loading="lazy" decoding="async" alt="' + esc(x.alt) + '"></figure></li>';
    }).join('');
  }
  // Lee la foto elegida, la achica y la pasa a WebP (o JPG si el navegador no sabe hacer WebP)
  function leerFoto(archivo, maxLado) {
    return new Promise(function (ok, mal) {
      if (!archivo || !/^image\//.test(archivo.type)) { mal(new Error('tipo')); return; }
      var url = URL.createObjectURL(archivo);
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        var datos = c.toDataURL('image/webp', 0.8);
        if (datos.indexOf('data:image/webp') !== 0) datos = c.toDataURL('image/jpeg', 0.82);
        ok({ src: datos, w: w, h: h });
      };
      img.onerror = function () { URL.revokeObjectURL(url); mal(new Error('leer')); };
      img.src = url;
    });
  }
  function cambiarFoto(donde, archivo) {
    var antes = JSON.stringify(FOTOS);
    P.ftError = ''; P.avisoFotos = '';
    return leerFoto(archivo, TAM_FOTO[donde === 'galeria' ? 'galeria' : donde]).then(function (f) {
      if (donde === 'logo') { FOTOS.logo = f.src; P.avisoFotos = 'Cambiaste el logo. Ya se ve en toda la página.'; }
      else if (donde === 'fachada') {
        FOTOS.fachada = { src: f.src, alt: FOTOS.fachada ? FOTOS.fachada.alt : 'Fachada de ' + NEGOCIO + '.', w: f.w, h: f.h };
        P.avisoFotos = 'Cambiaste la foto del local. Revisá la descripción: la leen quienes usan lector de pantalla.';
      } else {
        var g = galeriaActual().slice();
        if (g.length >= MAX_GALERIA) { P.ftError = 'Ya hay ' + MAX_GALERIA + ' fotos de cortes. Quitá una para agregar otra.'; return; }
        g.push({ tipo: 'nueva', id: Date.now().toString(36), src: f.src, alt: 'Corte hecho en ' + NEGOCIO + '.', w: f.w, h: f.h });
        FOTOS.galeria = g;
        P.avisoFotos = 'Agregaste una foto de corte. Escribí abajo qué se ve en la foto.';
      }
      if (!guardarFotos()) {
        FOTOS = JSON.parse(antes);
        P.avisoFotos = '';
        P.ftError = 'No entra más en la memoria de este navegador. Quitá alguna foto o usá una más chica.';
        return;
      }
      aplicarFotos();
    }).catch(function () {
      P.ftError = 'No se pudo leer esa foto. Probá con una foto JPG o PNG.';
    });
  }
  function moverFotoGaleria(i, paso) {
    var g = galeriaActual().slice();
    var j = i + paso;
    if (j < 0 || j >= g.length) return;
    var x = g[i]; g[i] = g[j]; g[j] = x;
    FOTOS.galeria = g;
    guardarFotos();
    aplicarFotos();
  }
  function quitarFotoGaleria(i) {
    var g = galeriaActual().slice();
    g.splice(i, 1);
    FOTOS.galeria = g;
    guardarFotos();
    aplicarFotos();
    P.avisoFotos = g.length ? 'Quitaste la foto.' : 'Quitaste la última foto: la sección Cortes queda vacía hasta que agregues otra.';
  }
  function srcGaleria(x) { return x.tipo === 'original' ? ORIG.galeria[x.n].src : x.src; }
  function plantillaFotos() {
    var g = galeriaActual();
    var botonArchivo = function (id, donde, texto) {
      return '<input class="ft-input" type="file" accept="image/*" id="' + id + '" data-foto="' + donde + '"><label class="btn btn-linea btn-mini" for="' + id + '">' + texto + '</label>';
    };
    return '<p class="turnos-intro" style="margin-top:0">Cambiá el logo, la foto del local y las fotos de cortes que se ven en la página. Las fotos se achican solas para que la página siga cargando rápido.</p>' +
      (P.avisoFotos ? '<p class="aviso-ok" role="status">' + esc(P.avisoFotos) + '</p>' : '') +
      (P.ftError ? '<p class="campo-error" role="alert">' + esc(P.ftError) + '</p>' : '') +
      '<div class="ft-dos">' +
        '<section class="tarjeta-form ft-caja" aria-labelledby="ft-logo-t"><h2 class="pa-h3" id="ft-logo-t">Logo</h2>' +
          '<span class="logo ft-logo" role="img" aria-label="Logo actual"></span>' +
          '<div class="prod-form-acciones">' + botonArchivo('ft-logo', 'logo', 'Cambiar logo') +
            (FOTOS.logo ? '<button type="button" class="link-btn" data-accion="ft-original" data-id="logo" data-foco="ft-original-logo">Volver al logo original</button>' : '') + '</div>' +
          '<p class="suave ft-nota">Conviene una imagen cuadrada: en la página se muestra en un cuadrado.</p>' +
        '</section>' +
        '<section class="tarjeta-form ft-caja" aria-labelledby="ft-fachada-t"><h2 class="pa-h3" id="ft-fachada-t">Foto del local</h2>' +
          '<img class="ft-fachada" src="' + (FOTOS.fachada ? FOTOS.fachada.src : esc(ORIG.fachadaSrc)) + '" alt="">' +
          '<div class="prod-form-acciones">' + botonArchivo('ft-fachada', 'fachada', 'Cambiar foto') +
            (FOTOS.fachada ? '<button type="button" class="link-btn" data-accion="ft-original" data-id="fachada" data-foco="ft-original-fachada">Volver a la foto original</button>' : '') + '</div>' +
          (FOTOS.fachada ? '<label for="ft-alt-fachada">Qué se ve en la foto</label><input class="campo" id="ft-alt-fachada" type="text" maxlength="160" data-ft-alt="fachada" value="' + esc(FOTOS.fachada.alt) + '">' : '') +
        '</section>' +
      '</div>' +
      '<section class="ft-galeria-caja" aria-labelledby="ft-gal-t"><h2 class="pa-h3" id="ft-gal-t">Fotos de cortes (' + g.length + ' de ' + MAX_GALERIA + ')</h2>' +
        (g.length ? '<ul class="ft-galeria">' + g.map(function (x, i) {
          return '<li class="ft-item"><img src="' + esc(srcGaleria(x)) + '" alt="">' +
            (x.tipo === 'nueva'
              ? '<label for="ft-alt-' + i + '">Qué se ve en la foto</label><input class="campo" id="ft-alt-' + i + '" type="text" maxlength="160" data-ft-alt="' + i + '" value="' + esc(x.alt) + '">'
              : '<p class="suave ft-alt">' + esc(ORIG.galeria[x.n].alt) + '</p>') +
            '<div class="ft-botones">' +
              '<button type="button" class="btn btn-linea btn-mini" data-accion="ft-mover" data-i="' + i + '" data-paso="-1" data-foco="ft-subir-' + i + '" aria-label="Mover la foto ' + (i + 1) + ' antes"' + (i === 0 ? ' disabled' : '') + '>←</button>' +
              '<button type="button" class="btn btn-linea btn-mini" data-accion="ft-mover" data-i="' + i + '" data-paso="1" data-foco="ft-bajar-' + i + '" aria-label="Mover la foto ' + (i + 1) + ' después"' + (i === g.length - 1 ? ' disabled' : '') + '>→</button>' +
              '<button type="button" class="btn btn-linea btn-mini btn-peligro" data-accion="ft-quitar" data-i="' + i + '" data-foco="ft-quitar-' + i + '" aria-label="Quitar la foto ' + (i + 1) + '">Quitar</button>' +
            '</div></li>';
        }).join('') + '</ul>' : '<p class="vacio">No hay fotos de cortes. La sección Cortes de la página queda vacía hasta que agregues una.</p>') +
        '<div class="prod-form-acciones">' + (g.length < MAX_GALERIA ? botonArchivo('ft-galeria', 'galeria', '+ Agregar foto') : '') +
          (FOTOS.galeria ? '<button type="button" class="link-btn" data-accion="ft-original" data-id="galeria" data-foco="ft-original-galeria">Volver a las fotos originales</button>' : '') + '</div>' +
      '</section>';
  }

  /* ===================== Panel del dueño ===================== */
  var ICONOS = {
    atender: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/></svg>',
    hoy: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    turnos: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    caja: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    stock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
    horario: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M10 13l4 4M14 13l-4 4"/></svg>',
    clientes: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/></svg>',
    reportes: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M6 17V10M11 17V5M16 17v-4M21 17V8"/></svg>',
    precios: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    barberos: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.6c2.3.3 3.9 2 4.5 4.9"/></svg>',
    fotos: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    chat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/></svg>'
  };
  var DIENTES = '0,0 ' + Array.from({ length: 25 }, function (_, i) { return (i * 12 + 6) + ',10 ' + (i * 12 + 12) + ',0'; }).join(' ');
  var TITULOS = { atender: 'Atender', hoy: 'Hoy', turnos: 'Turnos', caja: 'Caja', stock: 'Stock', precios: 'Servicios', horario: 'Horario', barberos: 'Barberos', clientes: 'Clientes', reportes: 'Reportes', fotos: 'Fotos' };
  var NOMBRE_ESTADO = { confirmado: 'Confirmado', silla: 'En la silla', atendido: 'Cobrado', novino: 'No vino', cancelado: 'Cancelado' };
  var ultimaSemana = [];

  var P = {
    acceso: false, pin: '', pinError: false, vista: 'hoy',
    atBarbero: null,          // Atender: barbero que se está mirando
    bb: null, bbQuitar: null, avisoBarberos: '',   // Barberos: formulario { id, nombre, dias } y quitar { id, destino, noEntran }
    sv: null, svQuitar: null, // Servicios: formulario de servicio nuevo o editado, y el que se está por dejar de ofrecer
    avisoFotos: '', ftError: '',
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
    preview: null,            // mensaje de WhatsApp de un turno de ejemplo
    atVer: null,              // Atender: id del turno que se está mirando (null = el actual)
    llegada: null,            // Atender: { servicio, nombre } de alguien que llegó sin turno
    deshacer: null,           // Atender: última acción, para poder deshacerla
    hz: null,                 // Horario: formulario de un cambio nuevo
    avisoHorario: '',
    cliente: null,            // Clientes: ficha abierta
    clTel: null,              // Clientes: { valor, error } al cambiar el número
    clUnir: null,             // Clientes: { buscar } al elegir con qué ficha se junta
    clConfirmar: null,        // Clientes: { a, b } par de fichas a punto de unirse
    avisoCliente: '',
    clBuscar: '',
    clOrden: 'frecuentes',
    repPeriodo: '3m',         // Reportes: período
    login: { usuario: '', error: '', enviando: false },  // con la base de datos: ingreso con usuario y contraseña
    miClave: null,            // { actual, nueva, repetir, error }: cambiar la contraseña propia
    prueba: null,             // { confirmar, enviando }: datos de prueba y empezar de cero (solo el dueño)
    cuenta: null,             // Barberos: { barbero, modo: 'nueva' | 'clave', usuario, clave, error } cuenta para entrar al panel
    avisoCuenta: ''
  };
  P.hz = hzVacio('cerrado');
  function npVacio(tipo) { return { nombre: '', tipo: tipo, presentacion: '', unidad: 'unidad', cantidad: '', minimo: '', precio: '', compra: false, costo: '', medio: 'Efectivo' }; }

  function boton(accion, id, texto, clase) {
    return '<button type="button" class="btn ' + clase + ' btn-mini" data-accion="' + accion + '" data-id="' + esc(id) + '" data-foco="' + accion + '-' + esc(id) + '">' + texto + '</button>';
  }
  // Botón de WhatsApp: en un turno real abre WhatsApp; en uno de ejemplo muestra el mensaje
  function botonWa(t, tipo, texto, clase) {
    var base = ' class="btn ' + clase + ' btn-mini" data-accion="' + tipo + '" data-id="' + esc(t.id) + '" data-foco="' + tipo + '-' + esc(t.id) + '"';
    if (t.ejemplo) return '<button type="button"' + base + '>' + ICONOS.chat + texto + '</button>';
    var texto2 = msjDe(t, tipo);
    return '<a ' + atributosWa(telInfo(t.tel).wa, texto2) + base + '>' + ICONOS.chat + texto + '<span class="solo-lector"> (abre WhatsApp)</span></a>';
  }

  function siguienteDiaAbierto(h) {
    for (var k = 1; k <= 7; k++) {
      var c = sumarDias(h.clave, k);
      if (horasDe(c).length) return c;
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
    var det = esc(nombreServicio(s)) + ', ' + gs(t.precio) + (hayVarios() ? ', con ' + esc(nombreBarbero(t.barbero)) : '');
    if (t.estado === 'atendido' && t.medio) det += '. Pagó ' + (COMO_PAGO[t.medio] || esc(t.medio));
    var extra = [];
    if (t.tel) extra.push('WhatsApp ' + esc(tel.lindo || t.tel));
    if (t.nota) extra.push('Nota: ' + esc(t.nota));
    if (t.estado === 'cancelado' && t.falso) {
      extra.push('Lo cancelaste como turno falso ' + cuandoFue(t.canceladoEn) + (tel.ok && numeroBloqueado(tel.wa) ? '. El número quedó bloqueado para reservar por la web' : '') + '.');
    } else if (t.estado === 'cancelado') {
      extra.push((t.canceladoPor === 'cliente' ? 'Lo canceló el cliente ' : 'Lo cancelaste ') + cuandoFue(t.canceladoEn) + (t.avisadoEn ? '. Le avisaste ' + cuandoFue(t.avisadoEn) : '') + '.');
    } else if (t.recordadoEn && t.estado === 'confirmado') {
      extra.push('Recordatorio enviado ' + cuandoFue(t.recordadoEn) + '.');
    }
    if (t.cambiadoEn && t.antes && t.estado === 'confirmado') extra.push('El cliente lo cambió ' + cuandoFue(t.cambiadoEn) + '; antes era ' + cuandoTurno(t.antes.fecha, t.antes.min, false) + '.');
    var acciones = [];
    if (!abierto) {
      // El verde marca lo urgente: los turnos del próximo día que todavía no tienen recordatorio
      var urgente = ctx === 'turnos' && !t.recordadoEn && t.fecha === siguienteDiaAbierto(h);
      if (antes && tel.ok) acciones.push(botonWa(t, 'recordar', t.recordadoEn ? 'Recordar de nuevo' : 'Recordar por WhatsApp', urgente ? 'btn-wa' : 'btn-linea'));
      if (ctx === 'hoy' && (antes || enCurso)) acciones.push(boton('cobrar-abrir', t.id, 'Cobrar', 'btn-negro'));
      if (enCurso) acciones.push(boton('novino', t.id, 'No vino', 'btn-linea'));
      if (antes) acciones.push(boton('cancelar-abrir', t.id, 'Cancelar', 'btn-linea'));
      if (t.estado === 'cancelado' && t.canceladoPor === 'barberia' && !t.falso && !t.avisadoEn && tel.ok && !empezo(t, h)) acciones.push(botonWa(t, 'avisar', 'Avisar por WhatsApp', 'btn-wa'));
    }
    var panel = '';
    if (abierto === 'cobrar') {
      panel = '<div class="turno-panel" role="group" aria-label="Cobrar el turno de ' + nombre + '"><span class="turno-panel-txt">¿Cómo pagó ' + nombre + '?</span>' +
        MEDIOS.map(function (m) { return '<button type="button" class="btn btn-claro btn-mini" data-accion="cobrar" data-id="' + esc(t.id) + '" data-medio="' + m + '" data-foco="medio-' + esc(t.id) + '-' + m + '">' + NOMBRE_MEDIO[m] + '</button>'; }).join('') +
        '<button type="button" class="link-btn" data-accion="cerrar-panel" data-id="' + esc(t.id) + '">Cancelar</button></div>';
    } else if (abierto === 'cancelar') {
      panel = '<div class="turno-panel" role="group" aria-label="Cancelar el turno de ' + nombre + '"><span class="turno-panel-txt">¿Cancelar el turno de ' + nombre + '? El horario queda libre.</span>' +
        '<button type="button" class="btn btn-rojo btn-mini" data-accion="cancelar-si" data-id="' + esc(t.id) + '" data-foco="cancelar-si-' + esc(t.id) + '">Sí, cancelar</button>' +
        (tel.ok && !t.enLocal && !esBarbero() ? '<button type="button" class="btn btn-linea btn-mini btn-peligro" data-accion="cancelar-falso" data-id="' + esc(t.id) + '" data-foco="cancelar-falso-' + esc(t.id) + '">Es falso: cancelar y bloquear el número</button>' : '') +
        '<button type="button" class="link-btn" data-accion="cerrar-panel" data-id="' + esc(t.id) + '">No</button></div>';
    } else if (abierto === 'falso') {
      var mas = otrosPendientesDe(t);
      panel = '<div class="turno-panel" role="status"><span class="turno-panel-txt">Turno cancelado y número bloqueado: ya no puede reservar por la web.' +
        (mas.length ? ' Ese número tiene ' + (mas.length === 1 ? 'otro turno pendiente' : mas.length + ' turnos pendientes más') + ': ' + esc(listaY(mas.map(function (x) { return primerNombre(x.cliente) + ' (' + DIAS_C[diaSemana(x.fecha)] + ' ' + hhmm(x.min) + ')'; }))) + '.' : '') + '</span>' +
        (mas.length ? '<button type="button" class="btn btn-rojo btn-mini" data-accion="cancelar-falsos" data-id="' + esc(t.id) + '" data-foco="cancelar-falsos-' + esc(t.id) + '">' + (mas.length === 1 ? 'Cancelarlo también' : 'Cancelarlos también') + '</button>' : '') +
        '<button type="button" class="link-btn" data-accion="cerrar-panel" data-id="' + esc(t.id) + '" data-foco="cerrar-' + esc(t.id) + '">' + (mas.length ? 'Dejarlos' : 'Listo') + '</button></div>';
    } else if (abierto === 'cancelado') {
      panel = '<div class="turno-panel" role="status"><span class="turno-panel-txt">Turno cancelado.' + (tel.ok ? ' ¿Le avisás a ' + nombre + '?' : '') + '</span>' +
        (tel.ok ? botonWa(t, 'avisar', 'Avisar por WhatsApp', 'btn-wa') : '') +
        '<button type="button" class="link-btn" data-accion="cerrar-panel" data-id="' + esc(t.id) + '" data-foco="cerrar-' + esc(t.id) + '">' + (tel.ok ? 'Ahora no' : 'Listo') + '</button></div>';
    }
    return '<li class="turno' + (t.estado === 'cancelado' ? ' cancelado' : '') + (t.estado === 'novino' ? ' novino' : '') + '">' +
      '<p class="turno-hora">' + hhmm(t.min) + '</p>' +
      '<div class="turno-info"><div class="turno-cab"><p class="turno-cliente">' + esc(t.cliente) + '</p><span class="pill pill-' + ev + '">' + NOMBRE_ESTADO[ev] + '</span>' + (t.estado === 'confirmado' ? pillFaltas(t) : '') + '</div>' +
        '<p class="turno-det">' + det + '</p>' + (extra.length ? '<p class="turno-extra">' + extra.join('<br>') + '</p>' : '') + '</div>' +
      (acciones.length ? '<div class="turno-acciones">' + acciones.join('') + '</div>' : '') +
      panel +
    '</li>';
  }

  // Turnos pendientes reservados por la web con el mismo número que t (para cancelar todos los falsos juntos)
  function otrosPendientesDe(t) {
    var wa = telInfo(t.tel).wa, h = ahoraPY();
    return todosLosTurnos().filter(function (x) { return x.id !== t.id && !x.enLocal && x.estado === 'confirmado' && !empezo(x, h) && telInfo(x.tel).wa === wa; }).sort(porFechaHora);
  }
  function cancelarFalso(x) {
    x.estado = 'cancelado'; x.canceladoPor = 'barberia'; x.canceladoEn = Date.now(); x.falso = true;
    guardarTurno(x);
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
    return '<div class="cifras">' + (esBarbero() ? v.cifras.slice(0, 2) : v.cifras).map(cifra).join('') + '</div>' +
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
    var recienCancelado = P.abierto && (P.abierto.que === 'cancelado' || P.abierto.que === 'falso') ? P.abierto.id : null;
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
    var futuros = turnosPendientesDe(s.id).length;
    var acciones = P.svQuitar === s.id
      ? '<div class="pr-confirmar pr-quitar" role="group" aria-labelledby="pr-q-' + s.id + '"><p id="pr-q-' + s.id + '">¿Dejar de ofrecer ' + esc(s.nombre) + '? Ya no aparece en el sitio ni para reservar.' +
          (futuros ? ' ' + (futuros === 1 ? 'El turno que ya tiene reservado sigue en pie.' : 'Los ' + futuros + ' turnos que ya tiene reservados siguen en pie.') : '') + '</p>' +
          '<div class="prod-form-acciones"><button type="button" class="btn btn-rojo btn-mini" data-accion="sv-quitar-si" data-id="' + s.id + '" data-foco="sv-quitar-si">Dejar de ofrecer</button>' +
          '<button type="button" class="link-btn" data-accion="sv-quitar-no" data-id="' + s.id + '">No</button></div></div>'
      : '<div class="pr-acciones">' + (s.nuevo ? '<button type="button" class="link-btn" data-accion="sv-editar" data-id="' + s.id + '" data-foco="sv-editar-' + s.id + '" aria-label="Editar ' + esc(s.nombre) + '">Editar</button>' : '') +
          '<button type="button" class="link-btn link-rojo" data-accion="sv-quitar" data-id="' + s.id + '" data-foco="sv-quitar-' + s.id + '" aria-label="Dejar de ofrecer ' + esc(s.nombre) + '">Quitar</button></div>';
    return '<li class="pr-fila' + (cambioP || cambioM ? ' cambiada' : '') + '" id="pr-fila-' + s.id + '">' +
      '<div class="pr-nombre"><p class="pr-titulo">' + esc(s.nombre) + (s.nuevo ? ' <span class="pill">Agregado</span>' : '') + '</p>' + (s.grupo === 'combo' ? '<p class="pr-incluye">' + esc(s.incluye) + '</p>' : '') + '</div>' +
      '<div class="pr-campo"><label for="pr-precio-' + s.id + '">Precio</label>' +
        '<div class="campo-gs"><span aria-hidden="true">Gs.</span><input class="campo" id="pr-precio-' + s.id + '" type="text" inputmode="numeric" data-precio="' + s.id + '" value="' + (precioTxt ? miles(precioTxt) : '') + '"></div>' +
        '<p class="pr-antes" id="pr-antes-p-' + s.id + '"' + (cambioP ? '' : ' hidden') + '>Antes: ' + gs(s.precio) + '</p></div>' +
      '<div class="pr-campo"><label for="pr-min-' + s.id + '">Duración</label>' +
        '<select class="campo" id="pr-min-' + s.id + '" data-duracion="' + s.id + '">' +
          opciones.map(function (d) { return '<option value="' + d + '"' + (d === min ? ' selected' : '') + '>' + durTxt(d) + '</option>'; }).join('') + '</select>' +
        '<p class="pr-antes" id="pr-antes-m-' + s.id + '"' + (cambioM ? '' : ' hidden') + '>Antes: ' + durTxt(s.min) + '</p></div>' +
      acciones +
    '</li>';
  }

  function textoCambioPrecio(c) {
    if (c.campo === 'nuevo') return 'Nuevo: ' + c.nombre + ', ' + gs(c.despues) + ', ' + durTxt(c.min);
    if (c.campo === 'oculto') return 'Dejó de ofrecerse: ' + c.nombre;
    if (c.campo === 'vuelve') return 'Se vuelve a ofrecer: ' + c.nombre;
    if (c.campo === 'nombre') return 'Cambió el nombre: ' + c.antesTxt + ' → ' + c.nombre;
    var cuanto = c.campo === 'precio'
      ? 'precio de ' + gs(c.antes) + ' a ' + gs(c.despues)
      : 'duración de ' + durTxt(c.antes) + ' a ' + durTxt(c.despues);
    return (c.lista ? 'Lista original. ' : '') + c.nombre + ': ' + cuanto;
  }
  function difCambioPrecio(c) {
    if (c.campo !== 'precio' && c.campo !== 'min') return '';
    var d = c.despues - c.antes;
    if (!d) return '';
    return (d > 0 ? '+' : '−') + (c.campo === 'precio' ? miles(Math.abs(d)) : Math.abs(d) + ' min');
  }

  function plantillaPrecios() {
    var pend = cambiosPendientes();
    var err = errorPrecios();
    var difiere = LISTA_LOCAL.some(function (s) { return s.precio !== OFICIAL[s.id].precio || s.min !== OFICIAL[s.id].min; });
    var hist = PRECIOS.historial.slice().reverse().slice(0, 12);
    var grupo = function (g) { return serviciosActivos(g).map(filaPrecioPanel).join('') || '<li class="vacio">No hay ' + (g === 'combo' ? 'combos' : 'servicios') + ' que se ofrezcan.</li>'; };
    var ocultos = SERVICIOS.filter(function (s) { return !s.activo; });
    var restablecer = '';
    if (difiere) {
      restablecer = P.restablecer
        ? '<div class="pr-confirmar" role="group" aria-labelledby="pr-conf-t"><p id="pr-conf-t">Vuelven los precios y las duraciones de la lista del local (noviembre de 2026). Los turnos ya reservados no cambian.</p>' +
          '<div class="prod-form-acciones"><button type="button" class="btn btn-rojo btn-mini" data-accion="precios-restablecer-si" data-foco="precios-restablecer-si">Volver a la lista original</button>' +
          '<button type="button" class="link-btn" data-accion="precios-restablecer-no" data-foco="precios-restablecer-no">Cancelar</button></div></div>'
        : '<button type="button" class="link-btn" data-accion="precios-restablecer" data-foco="precios-restablecer" style="padding-left:0">Volver a la lista original del local</button>';
    }
    return '<p class="turnos-intro" style="margin-top:0">Cambiá el precio o la duración y tocá «Guardar cambios», agregá servicios nuevos o quitá los que ya no se hacen. El sitio se actualiza enseguida; los turnos ya reservados mantienen su precio y su duración.</p>' +
      (P.avisoPrecios ? '<p class="aviso-ok" role="status">' + esc(P.avisoPrecios) + '</p>' : '') +
      (P.sv ? plantillaFormServicio() : '<button type="button" class="btn btn-negro btn-mini" data-accion="sv-nuevo" data-foco="sv-nuevo">+ Agregar servicio o combo</button>') +
      '<section class="pr-grupo" aria-labelledby="pr-servicios"><h2 class="pa-h3" id="pr-servicios">Servicios</h2><ol class="lista">' + grupo('servicio') + '</ol></section>' +
      '<section class="pr-grupo" aria-labelledby="pr-combos"><h2 class="pa-h3" id="pr-combos">Combos</h2><ol class="lista">' + grupo('combo') + '</ol></section>' +
      '<div class="pr-barra" id="pr-barra"' + (pend.length || err ? '' : ' hidden') + '><p id="pr-barra-txt" aria-live="polite">' + esc(textoBarra(pend, err)) + '</p>' +
        '<div class="pr-barra-botones"><button type="button" class="btn btn-rojo btn-mini" id="pr-guardar" data-accion="precios-guardar" data-foco="precios-guardar"' + (pend.length && !err ? '' : ' disabled') + '>Guardar cambios</button>' +
        '<button type="button" class="btn btn-linea btn-mini" data-accion="precios-descartar" data-foco="precios-descartar">Descartar</button></div></div>' +
      (ocultos.length ? '<section class="pr-grupo" aria-labelledby="pr-ocultos"><h2 class="pa-h3" id="pr-ocultos">No se ofrecen</h2><ul class="lista">' + ocultos.map(function (s) {
          return '<li class="pr-fila pr-oculto"><div class="pr-nombre"><p class="pr-titulo">' + esc(s.nombre) + '</p><p class="pr-incluye">' + (s.grupo === 'combo' ? esc(s.incluye) + ' · ' : '') + gs(s.precio) + ' · ' + durTxt(s.min) + '</p></div>' +
            '<div class="pr-acciones"><button type="button" class="btn btn-linea btn-mini" data-accion="sv-volver" data-id="' + s.id + '" data-foco="sv-volver-' + s.id + '">Volver a ofrecer</button></div></li>';
        }).join('') + '</ul></section>' : '') +
      '<section class="pr-otros" aria-labelledby="pr-hist">' + restablecer +
        '<h2 class="pa-h3" id="pr-hist">Últimos cambios</h2>' +
        (hist.length ? '<ol class="smov-lista">' + hist.map(function (c) {
          return '<li><span class="smov-cuando">' + cuandoCorto(c.ts) + '</span><span class="smov-que">' + esc(textoCambioPrecio(c)) + '</span><span class="smov-cant">' + difCambioPrecio(c) + '</span></li>';
        }).join('') + '</ol>' : '<p class="suave" style="margin:0">Todavía no cambiaste ningún precio.</p>') +
      '</section>';
  }

  function turnosPendientesDe(sid) {
    var h = ahoraPY();
    return todosLosTurnos().filter(function (t) { return t.servicio === sid && t.estado === 'confirmado' && !empezo(t, h); });
  }
  function svVacio() { return { id: null, grupo: 'servicio', nombre: '', incluye: '', precio: '', min: '30', error: '' }; }
  function validarServicio() {
    var f = P.sv;
    var nombre = f.nombre.trim();
    if (nombre.length < 2) return 'Escribí el nombre.';
    var igual = SERVICIOS.find(function (s) { return s.id !== f.id && sinAcentos(s.nombre) === sinAcentos(nombre); });
    if (igual) return 'Ya hay un servicio que se llama ' + igual.nombre + (igual.activo ? '.' : ' (no se ofrece: lo podés volver a ofrecer abajo).');
    if (f.grupo === 'combo' && f.incluye.trim().length < 3) return 'Escribí qué incluye el combo.';
    if (!(entero(f.precio) > 0)) return 'Escribí el precio.';
    return '';
  }
  function plantillaFormServicio() {
    var f = P.sv;
    var falta = validarServicio();
    return '<section class="tarjeta-form sv-form" aria-labelledby="sv-form-t"><h2 class="pa-h3" id="sv-form-t">' + (f.id ? 'Editar ' + esc(SERV[f.id].nombre) : 'Nuevo servicio o combo') + '</h2>' +
      '<div class="segmentado" role="group" aria-label="Tipo">' + [['servicio', 'Servicio'], ['combo', 'Combo']].map(function (x) {
        return '<button type="button" data-accion="sv-grupo" data-g="' + x[0] + '" data-foco="sv-grupo-' + x[0] + '" aria-pressed="' + (f.grupo === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="sv-campos">' +
        '<div><label for="sv-nombre">Nombre</label><input class="campo" id="sv-nombre" type="text" maxlength="40" autocomplete="off" placeholder="' + (f.grupo === 'combo' ? 'Combo 7' : 'Corte para niños') + '" data-campo="sv.nombre" value="' + esc(f.nombre) + '"></div>' +
        (f.grupo === 'combo' ? '<div><label for="sv-incluye">Qué incluye</label><input class="campo" id="sv-incluye" type="text" maxlength="60" autocomplete="off" placeholder="Corte + Barba" data-campo="sv.incluye" value="' + esc(f.incluye) + '"></div>' : '') +
        '<div><label for="sv-precio">Precio</label><div class="campo-gs"><span aria-hidden="true">Gs.</span><input class="campo" id="sv-precio" type="text" inputmode="numeric" data-campo="sv.precio" data-numero="miles" value="' + (f.precio ? miles(f.precio) : '') + '"></div></div>' +
        '<div><label for="sv-min">Duración</label><select class="campo" id="sv-min" data-campo="sv.min">' +
          DURACIONES.map(function (d) { return '<option value="' + d + '"' + (String(d) === String(f.min) ? ' selected' : '') + '>' + durTxt(d) + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<p class="form-falta" id="sv-falta">' + esc(f.error || (f.nombre || f.precio ? falta : '')) + '</p>' +
      '<div class="prod-form-acciones"><button type="button" class="btn btn-negro btn-mini" id="sv-guardar" data-accion="sv-guardar" data-foco="sv-guardar"' + (falta ? ' disabled' : '') + '>' + (f.id ? 'Guardar' : 'Agregar') + '</button>' +
        '<button type="button" class="link-btn" data-accion="sv-cancelar">Cancelar</button></div>' +
    '</section>';
  }
  function guardarServicio() {
    var f = P.sv;
    if (validarServicio()) return false;
    var ts = Date.now();
    var datos = { grupo: f.grupo, nombre: f.nombre.trim().slice(0, 40), incluye: f.grupo === 'combo' ? f.incluye.trim().slice(0, 60) : '', precio: entero(f.precio), min: +f.min };
    if (f.id) {
      var s = SERV[f.id];
      if (s.nombre !== datos.nombre) PRECIOS.historial.push({ ts: ts, id: s.id, nombre: datos.nombre, campo: 'nombre', antesTxt: s.nombre });
      if (s.precio !== datos.precio) PRECIOS.historial.push({ ts: ts, id: s.id, nombre: datos.nombre, campo: 'precio', antes: s.precio, despues: datos.precio });
      if (s.min !== datos.min) PRECIOS.historial.push({ ts: ts, id: s.id, nombre: datos.nombre, campo: 'min', antes: s.min, despues: datos.min });
      Object.assign(s, datos);
      P.avisoPrecios = 'Guardaste los cambios de ' + s.nombre + '. Ya se ven en el sitio.';
    } else {
      var nuevo = Object.assign({ id: 'n' + ts.toString(36), nuevo: true, activo: true }, datos);
      var ultimo = -1;
      SERVICIOS.forEach(function (x, i) { if (x.grupo === nuevo.grupo) ultimo = i; });
      SERVICIOS.splice(ultimo + 1, 0, nuevo);
      SERV[nuevo.id] = nuevo;
      PRECIOS.historial.push({ ts: ts, id: nuevo.id, nombre: nuevo.nombre, campo: 'nuevo', despues: nuevo.precio, min: nuevo.min });
      P.avisoPrecios = 'Agregaste ' + nuevo.nombre + ' (' + gs(nuevo.precio) + ', ' + durTxt(nuevo.min) + '). Ya se puede reservar en el sitio.';
    }
    guardarPrecios();
    P.sv = null;
    renderPrecios();
    renderReserva();
    return true;
  }
  function ofrecerServicio(id, si) {
    var s = SERV[id];
    if (!s) return;
    if (!si && serviciosActivos().length <= 1) { P.avisoPrecios = 'Tiene que quedar al menos un servicio para reservar.'; P.svQuitar = null; return; }
    s.activo = si;
    PRECIOS.historial.push({ ts: Date.now(), id: s.id, nombre: s.nombre, campo: si ? 'vuelve' : 'oculto' });
    delete P.borrador[id];
    guardarPrecios();
    P.svQuitar = null;
    P.avisoPrecios = si ? s.nombre + ' se vuelve a ofrecer en el sitio.' : s.nombre + ' ya no se ofrece. Lo encontrás abajo, en «No se ofrecen».';
    renderPrecios();
    renderReserva();
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
    LISTA_LOCAL.forEach(function (s) {
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
  /* ----- Atender: el turno actual en una sola pantalla, para usar mientras se corta ----- */
  // La fila de hoy: los turnos que todavía no se cobraron, en el orden en que se atienden.
  function claveFila(t) { return t.orden || t.min; }
  // La fila de un barbero (o de todos, si no se pasa el barbero)
  function colaHoy(h, barbero) {
    return todosLosTurnos().filter(function (t) { return t.fecha === h.clave && t.estado === 'confirmado' && (!barbero || t.barbero === barbero); })
      .sort(function (a, b) { return claveFila(a) - claveFila(b) || a.min - b.min || (a.codigo < b.codigo ? -1 : 1); });
  }
  function kbd(k) { return '<kbd>' + k + '</kbd>'; }
  // Barbero que se está mirando en Atender: cada celular recuerda el suyo
  var CLAVE_ATENDER = 'tommybarber-atender';
  function barberoAtender() {
    if (esBarbero()) return PANEL.yo.barbero;  // cada barbero ve su fila
    var act = barberosActivos();
    // El dueño, que también es barbero, arranca en su propia fila
    if (!P.atBarbero) P.atBarbero = (leerJSON(CLAVE_ATENDER, {}) || {}).barbero || (REMOTO && PANEL.yo ? PANEL.yo.barbero : null);
    if (!act.some(function (b) { return b.id === P.atBarbero; })) P.atBarbero = act[0].id;
    return P.atBarbero;
  }

  // Cuándo le toca, dicho como lo diría el dueño
  function cuandoAtender(t, h) {
    if (t.sinTurno) {
      if (t.llego == null || t.llego === t.min) return 'Llegó sin turno a las ' + hhmm(t.min);
      return 'Llegó sin turno a las ' + hhmm(t.llego) + ' · ' + (h.min < t.min ? 'le toca a las ' : 'su hora: ') + hhmm(t.min);
    }
    var dif = h.min - t.min;
    if (dif >= 0 && dif < 5) return 'Le toca ahora, a las ' + hhmm(t.min);
    if (dif >= 5) return 'Le tocaba a las ' + hhmm(t.min) + ', hace ' + durTxt(dif);
    return 'Llega a las ' + hhmm(t.min) + ', en ' + durTxt(-dif);
  }

  /* Cliente sin turno: se le da la primera hora libre que queda hoy (o se elige otra libre).
     Si hoy ya no hay lugar, se le ofrecen las horas libres del próximo día. */
  function llegadaVacia() {
    return { servicio: SERV.corte && SERV.corte.activo ? 'corte' : serviciosActivos()[0].id, nombre: '', tel: '', barbero: '', hora: null, error: '' };
  }
  // Horas libres de un día para los barberos candidatos: [{ m, b }] (en cada hora, el barbero que la toma)
  function horasLibresDia(clave, dur, desde, cands) {
    // Los turnos ya cobrados o que no vinieron dejan su hora libre
    var activos = todosLosTurnos().filter(function (t) { return t.estado === 'confirmado'; });
    var l = [];
    horasDe(clave).forEach(function (tr) {
      for (var m = tr[0]; m + dur <= tr[1]; m += PASO) {
        if (m < desde) continue;
        var b = elegirBarbero(cands, clave, m, dur, activos);
        if (b) l.push({ m: m, b: b });
      }
    });
    return l;
  }
  var MARGEN_AHORA = 10;  // un turno que empezó hace 10 minutos o menos todavía se puede dar "ahora"
  function opcionesLlegada(h) {
    var s = SERV[P.llegada.servicio] && SERV[P.llegada.servicio].activo ? SERV[P.llegada.servicio] : serviciosActivos()[0];
    var elegido = esBarbero() ? barberoPorId(PANEL.yo.barbero) : P.llegada.barbero ? barberoPorId(P.llegada.barbero) : null;
    var cands = elegido && elegido.activo ? [elegido] : barberosActivos();
    var inicio = h.min - h.min % PASO;
    if (h.min - inicio > MARGEN_AHORA) inicio += PASO;
    var op = { serv: s, hoy: true, dia: h.clave, horas: horasLibresDia(h.clave, s.min, inicio, cands) };
    for (var k = 1; !op.horas.length && k <= 14; k++) {
      var c = sumarDias(h.clave, k);
      var l = horasLibresDia(c, s.min, 0, cands);
      if (l.length) op = { serv: s, hoy: false, dia: c, horas: l };
    }
    op.sel = op.horas.find(function (x) { return x.m === P.llegada.hora; }) || op.horas[0] || null;
    return op;
  }
  // Cómo se lee cada hora libre: "ahora", "al terminar con Juan" o solo la hora
  function etiquetaHoraLlegada(x, h, op) {
    var conQuien = hayVarios() && !P.llegada.barbero && !esBarbero() ? x.b.nombre : '';
    if (!op.hoy) return conQuien;
    var et = '';
    if (x.m <= h.min) et = 'ahora';
    else {
      var termina = colaHoy(h, x.b.id).filter(function (t) { return t.min <= h.min && Math.ceil((t.min + t.dur) / PASO) * PASO === x.m; })[0];
      if (termina) et = 'al terminar con ' + primerNombre(termina.cliente);
    }
    return [conQuien, et].filter(Boolean).join(' · ');
  }
  // Minutos que faltan para atender a un cliente sin turno que dejó su número (null: todavía no hay que avisarle)
  function minutosParaLlamar(t) {
    if (!t.sinTurno || !telInfo(t.tel).ok || t.estado !== 'confirmado') return null;
    var h = ahoraPY();
    var cola = colaHoy(h, t.barbero);
    var i = cola.indexOf(t);
    if (i < 0) i = cola.findIndex(function (x) { return x.id === t.id; });
    if (i === 0) return 0;
    if (i !== 1) return null;
    var ant = cola[0];
    if (h.min < ant.min && !ant.sinTurno) return null;  // el de antes todavía no llegó a su hora
    var resta = h.min >= ant.min ? Math.max(5, ant.min + ant.dur - h.min) : ant.min - h.min + ant.dur;
    resta = Math.max(resta, t.min - h.min);
    return Math.ceil(resta / 5) * 5;
  }
  function avisoLlamar(t) {
    var min = minutosParaLlamar(t);
    if (min == null) return '';
    var quien = nombreNorm(t.cliente) ? esc(primerNombre(t.cliente)) : 'El cliente sin turno';
    return '<div class="at-llamar" role="group" aria-label="Avisarle que ya le toca">' +
      '<p class="at-llamar-t">' + (t.llamadoEn ? 'Le avisaste ' + esc(cuandoFue(t.llamadoEn)) + '.' : quien + ' dejó su número. ' + (min > 0 ? 'Le falta 1 cliente: avisale que vuelva.' : 'Ya le toca: avisale.')) + '</p>' +
      botonWa(t, 'llamar', t.llamadoEn ? 'Avisar de nuevo' : 'Avisarle por WhatsApp', t.llamadoEn ? 'btn-linea' : 'btn-wa') + '</div>';
  }
  function plantillaLlegada(h) {
    var op = opcionesLlegada(h);
    var L = P.llegada;
    var horas;
    if (!op.horas.length) {
      horas = '<p class="hz-alerta" role="status">No queda lugar para ' + esc(nombreServicio(op.serv)) + ' ni hoy ni en los próximos 14 días.</p>';
    } else {
      horas = (op.hoy ? '' : '<p class="hz-alerta" role="status">Hoy ya no queda lugar para ' + esc(nombreServicio(op.serv)) + ' (' + durTxt(op.serv.min) + '). Estas son las horas libres del ' + esc(diaLargo(op.dia)) + ':</p>') +
        '<p class="campo-label" id="at-l-hora-t">' + (op.hoy ? 'Hora (ya está elegida la primera libre)' : 'Hora') + '</p>' +
        '<div class="at-horas" role="group" aria-labelledby="at-l-hora-t">' + op.horas.slice(0, 16).map(function (x) {
          var et = etiquetaHoraLlegada(x, h, op);
          return '<button type="button" class="at-hora-op" data-accion="at-l-hora" data-m="' + x.m + '" data-foco="at-l-hora-' + x.m + '" aria-pressed="' + (x === op.sel) + '">' + hhmm(x.m) + (et ? '<span>' + esc(et) + '</span>' : '') + '</button>';
        }).join('') + '</div>';
    }
    var conQuien = op.sel && hayVarios() && !esBarbero() ? ' con ' + op.sel.b.nombre : '';
    var boton = !op.sel ? 'Sumar a la fila' : op.hoy ? 'Sumar a la fila a las ' + hhmm(op.sel.m) + conQuien : 'Darle turno el ' + diaLargo(op.dia) + ' a las ' + hhmm(op.sel.m) + conQuien;
    return '<div class="at-llegada" role="group" aria-labelledby="at-llegada-t"><p class="at-llegada-t" id="at-llegada-t">Llegó alguien sin turno</p>' +
      '<label class="campo-label" for="at-l-serv">Servicio</label><select class="campo" id="at-l-serv" data-campo="llegada.servicio">' +
        serviciosActivos().map(function (x) { return '<option value="' + x.id + '"' + (L.servicio === x.id ? ' selected' : '') + '>' + esc(nombreServicio(x)) + ', ' + gs(x.precio) + '</option>'; }).join('') + '</select>' +
      (hayVarios() && !esBarbero() ? '<label class="campo-label" for="at-l-barbero">¿Con quién?</label><select class="campo" id="at-l-barbero" data-campo="llegada.barbero">' +
        '<option value="">El primero que se libere</option>' + barberosActivos().map(function (b) { return '<option value="' + esc(b.id) + '"' + (L.barbero === b.id ? ' selected' : '') + '>' + esc(b.nombre) + '</option>'; }).join('') + '</select>' : '') +
      '<label class="campo-label" for="at-l-nombre">Nombre y apellido (si quiere)</label><input class="campo" id="at-l-nombre" type="text" autocomplete="off" maxlength="40" data-campo="llegada.nombre" value="' + esc(L.nombre) + '">' +
      '<label class="campo-label" for="at-l-tel">WhatsApp (si se va y vuelve)</label><input class="campo" id="at-l-tel" type="tel" inputmode="tel" autocomplete="off" maxlength="20" placeholder="0981 123 456" data-campo="llegada.tel" value="' + esc(L.tel) + '" aria-describedby="at-l-tel-nota">' +
      '<p class="suave at-l-nota" id="at-l-tel-nota">Cuando le falte un cliente, te aparece el botón para avisarle.</p>' +
      horas +
      (L.error ? '<p class="campo-error" role="alert">' + esc(L.error) + '</p>' : '') +
      '<div class="at-llegada-botones"><button type="button" class="btn btn-negro btn-mini" data-accion="at-llegada-agregar" data-foco="at-llegada-agregar"' + (op.sel == null ? ' disabled' : '') + '>' + esc(boton) + '</button>' +
      '<button type="button" class="link-btn" data-accion="at-llegada-cancelar">Cancelar</button></div></div>';
  }

  function plantillaAtender(h) {
    var bAt = barberoAtender();
    var cola = colaHoy(h, bAt);
    var idx = 0;
    if (P.atVer) {
      idx = cola.findIndex(function (x) { return x.id === P.atVer; });
      if (idx < 0) { idx = 0; P.atVer = null; }
    }
    var t = cola[idx];
    var sig = cola[idx + 1];
    var html = '';

    if (hayVarios() && !esBarbero()) {
      html += '<div class="at-barberos" role="group" aria-label="¿Qué barbero sos?">' + barberosActivos().map(function (b) {
        var n = colaHoy(h, b.id).length;
        return '<button type="button" class="at-barbero" data-accion="at-barbero" data-id="' + esc(b.id) + '" data-foco="at-b-' + esc(b.id) + '" aria-pressed="' + (b.id === bAt) + '">' +
          esc(b.nombre) + '<span class="at-barbero-n" aria-label="' + plural(n, 'cliente en la fila', 'clientes en la fila') + '">' + n + '</span></button>';
      }).join('') + '</div>';
    }
    if (P.deshacer) {
      html += '<div class="at-hecho" role="status"><p>' + esc(P.deshacer.texto) + '</p>' +
        '<button type="button" class="btn btn-linea btn-mini" data-accion="at-deshacer" data-foco="at-deshacer">Deshacer ' + kbd('Z') + '</button></div>';
    }

    var principal;
    if (!t) {
      var hoy = todosLosTurnos().filter(function (x) { return x.fecha === h.clave && x.barbero === bAt; });
      var hechos = hoy.filter(function (x) { return x.estado === 'atendido'; });
      var atendidos = hechos.length;
      var cobrado = hechos.reduce(function (a, x) { return a + x.precio; }, 0);
      var futuro = todosLosTurnos().filter(function (x) { return x.fecha > h.clave && x.estado === 'confirmado' && x.barbero === bAt; }).sort(porFechaHora)[0];
      principal = '<section class="at-card at-vacia" id="at-card" tabindex="-1" data-foco="at-card" aria-labelledby="at-vacia-t">' +
        '<p class="at-etiqueta">Ahora</p>' +
        '<h2 class="at-nombre" id="at-vacia-t">No queda nadie en la fila</h2>' +
        '<p class="at-serv">' + (atendidos ? 'Hoy atendiste a ' + plural(atendidos, 'cliente', 'clientes') + ' y cobraste ' + gs(cobrado) + '.' : 'Todavía no hay turnos para atender hoy.') + '</p>' +
        (futuro ? '<p class="at-extra">Próximo turno: ' + esc(cuandoTurno(futuro.fecha, futuro.min, false)) + ', ' + esc(futuro.cliente) + ' (' + esc(nombreServicio(SERV[futuro.servicio])) + ').</p>' : '') +
      '</section>';
    } else {
      var s = SERV[t.servicio];
      var tel = telInfo(t.tel);
      var llego = empezo(t, h) || t.sinTurno;
      var etiqueta = idx === 0 ? 'Ahora' : idx === 1 ? 'Siguiente' : (idx + 1) + '.º en la fila';
      var marcas = [];
      if (t.sinTurno) marcas.push('<span class="pill">Sin turno</span>');
      if (t.orden || t.pospuesto) marcas.push('<span class="pill">Pospuesto</span>');
      if (faltasDe(t)) marcas.push(pillFaltas(t));
      if (t.recordadoEn) marcas.push('<span class="pill">Recordado</span>');
      var extra = [];
      if (t.tel) extra.push('WhatsApp ' + esc(tel.lindo || t.tel));
      if (t.nota) extra.push('Nota: ' + esc(t.nota));
      var medios = MEDIOS.map(function (m, i) {
        return '<button type="button" class="btn ' + (i === 0 ? 'btn-negro' : 'btn-claro') + ' at-medio" data-accion="at-cobrar" data-id="' + esc(t.id) + '" data-medio="' + m + '" data-foco="at-cobrar-' + m + '" aria-label="Cobrar ' + gs(t.precio) + ' ' + COMO_PAGO[m] + '">' + m + kbd(i + 1) + '</button>';
      }).join('');
      var otras = '<button type="button" class="btn btn-linea btn-mini" data-accion="at-novino" data-id="' + esc(t.id) + '" data-foco="at-novino"' + (llego ? '' : ' disabled title="Se puede marcar cuando llegue la hora del turno"') + '>No vino ' + kbd('N') + '</button>' +
        '<button type="button" class="btn btn-linea btn-mini" data-accion="at-posponer" data-id="' + esc(t.id) + '" data-foco="at-posponer"' + (sig ? '' : ' disabled title="No hay nadie después en la fila"') + '>' + (sig ? 'Pasar después de ' + esc(primerNombre(sig.cliente)) : 'Posponer') + ' ' + kbd('P') + '</button>' +
        (tel.ok && llego && !t.sinTurno ? botonWa(t, 'esperando', '¿Venís?', 'btn-linea') : '');
      principal = '<section class="at-card' + (idx === 0 ? ' at-actual' : '') + '" id="at-card" tabindex="-1" data-foco="at-card" aria-labelledby="at-nombre">' +
        '<div class="at-top"><p class="at-etiqueta">' + etiqueta + '</p><p class="at-cuando">' + cuandoAtender(t, h) + '</p>' + marcas.join('') + '</div>' +
        '<div class="at-cuerpo"><p class="at-hora">' + hhmm(t.min) + '</p><div class="at-datos">' +
          '<h2 class="at-nombre" id="at-nombre">' + esc(t.cliente) + '</h2>' +
          '<p class="at-serv">' + esc(nombreServicio(s)) + ' <span class="suave">· ' + durTxt(t.dur) + '</span></p>' +
          (extra.length ? '<p class="at-extra">' + extra.join(' · ') + '</p>' : '') +
        '</div></div>' +
        '<div class="at-cobro" role="group" aria-label="Cobrar ' + gs(t.precio) + '"><p class="at-cobro-txt">Cobrar <strong>' + gs(t.precio) + '</strong></p><div class="at-medios">' + medios + '</div></div>' +
        '<div class="at-otras">' + otras + '</div>' + avisoLlamar(t) +
        (sig ? '<p class="at-nota-pasar">Si todavía no llegó, «Pasar después» intercambia las horas: ' + esc(primerNombre(sig.cliente)) + ' toma las ' + hhmm(Math.min(t.min, sig.min)) +
          ' y ' + esc(primerNombre(t.cliente)) + ' pasa a las ' + hhmm(Math.max(t.min, sig.min)) + '.</p>' : '') +
      '</section>';
    }

    var pasos = cola.length > 1
      ? '<div class="at-pasos"><button type="button" class="btn btn-linea btn-mini" data-accion="at-ant" data-foco="at-ant"' + (idx === 0 ? ' disabled' : '') + '>' + kbd('←') + ' Anterior</button>' +
        '<p class="at-pos">' + (idx + 1) + ' de ' + cola.length + '</p>' +
        '<button type="button" class="btn btn-linea btn-mini" data-accion="at-sig" data-foco="at-sig"' + (sig ? '' : ' disabled') + '>Siguiente ' + kbd('→') + '</button>' +
        (idx > 0 ? '<button type="button" class="link-btn" data-accion="at-actual" data-foco="at-actual">Volver al actual (Esc)</button>' : '') + '</div>'
      : '';

    var despues = '<section class="at-lado-caja" aria-labelledby="at-despues-t"><h2 class="pa-h3" id="at-despues-t">Después</h2>' +
      (sig
        ? '<button type="button" class="at-sig-card" data-accion="at-sig" data-foco="at-sig-card"><span class="at-sig-hora">' + hhmm(sig.min) + '</span><span><span class="at-sig-nombre">' + esc(sig.cliente) + '</span><span class="at-sig-serv">' + esc(nombreServicio(SERV[sig.servicio])) + '</span><span class="at-sig-cuando">' + cuandoAtender(sig, h) + '</span></span></button>' + avisoLlamar(sig)
        : '<p class="vacio">Nadie más por ahora.</p>') +
      '</section>';

    var fila = cola.length
      ? '<ol class="at-fila">' + cola.map(function (x, i) {
          return '<li><button type="button" class="at-fila-item' + (i === idx ? ' sel' : '') + '" data-accion="at-ir" data-id="' + esc(x.id) + '" data-foco="at-ir-' + esc(x.id) + '"' + (i === idx ? ' aria-current="true"' : '') + '>' +
            '<span class="at-fila-hora">' + hhmm(x.min) + '</span><span class="at-fila-nombre">' + esc(x.cliente) + '</span><span class="at-fila-serv">' + esc(SERV[x.servicio].nombre) + '</span></button></li>';
        }).join('') + '</ol>'
      : '<p class="vacio">La fila está vacía.</p>';

    var llegada;
    if (P.llegada) {
      llegada = plantillaLlegada(h);
    } else {
      llegada = '<button type="button" class="btn btn-linea btn-mini at-llegada-btn" data-accion="at-llegada-abrir" data-foco="at-llegada-abrir">+ Llegó alguien sin turno ' + kbd('A') + '</button>';
    }

    return html +
      '<div class="at">' +
        '<div class="at-principal">' + principal + pasos + '</div>' +
        '<div class="at-lado">' + despues +
          '<section class="at-lado-caja" aria-labelledby="at-fila-t"><h2 class="pa-h3" id="at-fila-t">La fila de hoy</h2>' + fila + llegada + '</section>' +
        '</div>' +
      '</div>' +
      '<p class="at-atajos">Atajos del teclado: ' + kbd('Espacio') + ' o ' + kbd('→') + ' siguiente · ' + kbd('←') + ' anterior · ' + kbd('Esc') + ' el actual · ' +
        kbd('1') + ' ' + kbd('2') + ' ' + kbd('3') + ' cobrar · ' + kbd('N') + ' no vino · ' + kbd('P') + ' pasar después · ' + kbd('A') + ' sin turno · ' + kbd('Z') + ' deshacer</p>';
  }

  // Acciones de Atender. Todas dejan la pantalla en el turno actual y se pueden deshacer.
  // En el celular, el menú del panel queda arriba: al abrir Atender se baja directo al cliente
  function atAlFrente() {
    var c = document.getElementById('at-card');
    if (c && P.vista === 'atender' && window.matchMedia('(max-width: 760px)').matches) c.scrollIntoView({ block: 'start' });
  }
  function atMover(paso) {
    var cola = colaHoy(ahoraPY(), barberoAtender());
    if (!cola.length) return;
    var idx = P.atVer ? Math.max(0, cola.findIndex(function (x) { return x.id === P.atVer; })) : 0;
    var nuevo = Math.min(cola.length - 1, Math.max(0, idx + paso));
    P.atVer = nuevo === 0 ? null : cola[nuevo].id;
  }
  function atCobrar(id, medio) {
    var t = buscarTurno(id);
    if (!t || t.estado !== 'confirmado') return;
    var mov = cobrarTurno(id, medio);
    P.deshacer = { tipo: 'cobrar', id: id, movId: mov.id, texto: 'Cobraste a ' + primerNombre(t.cliente) + ': ' + gs(t.precio) + ' ' + COMO_PAGO[medio] + '.' };
    P.atVer = null;
    renderHeroTurno();
  }
  function atNoVino(id) {
    var t = buscarTurno(id);
    if (!t || t.estado !== 'confirmado' || !(empezo(t, ahoraPY()) || t.sinTurno)) return;
    t.estado = 'novino';
    guardarTurno(t);
    P.deshacer = { tipo: 'novino', id: id, texto: primerNombre(t.cliente) + ' quedó como «no vino».' };
    P.atVer = null;
  }
  // «Pasar después» del siguiente: se intercambian las horas. El siguiente toma la hora del que no llegó
  // y el que no llegó pasa a la hora que dejó el siguiente.
  function atPosponer(id) {
    var h = ahoraPY();
    var cola = colaHoy(h, barberoAtender());
    var i = cola.findIndex(function (x) { return x.id === id; });
    if (i < 0 || !cola[i + 1]) return;
    var a = cola[i], b = cola[i + 1];
    var antes = { aMin: a.min, aOrden: a.orden, aPos: a.pospuesto, bMin: b.min, bOrden: b.orden };
    var na = Math.max(a.min, b.min), nb = Math.min(a.min, b.min);
    b.min = nb; b.orden = 0;
    a.min = na; a.orden = 0; a.pospuesto = true;
    guardarTurno(a); guardarTurno(b);
    P.deshacer = { tipo: 'posponer', id: a.id, otro: b.id, antes: antes,
      texto: primerNombre(b.cliente) + ' pasa a las ' + hhmm(nb) + ' y ' + primerNombre(a.cliente) + ' a las ' + hhmm(na) + '.' };
    P.atVer = null;
    renderHeroTurno();
    renderReserva();
  }
  function atAgregarLlegada() {
    var h = ahoraPY();
    var L = P.llegada;
    var tel = telInfo(L.tel);
    if (!tel.vacio && !tel.ok) { L.error = 'Ese número no parece un celular de Paraguay. Revisalo o dejalo vacío.'; return 'at-l-tel'; }
    var op = opcionesLlegada(h);
    if (L.hora != null && (!op.sel || op.sel.m !== L.hora)) { L.error = 'Las ' + hhmm(L.hora) + ' ya no está libre. Elegí otra hora.'; L.hora = null; return 'at-l-hora-t'; }
    if (!op.sel) return 'at-l-serv';
    var s = op.serv;
    var nombre = L.nombre.trim() || 'Cliente sin turno';
    var codigo = nuevoCodigo();
    var t = normalizarTurno({ id: codigo, codigo: codigo, servicio: s.id, fecha: op.dia, min: op.sel.m, precio: s.precio, dur: s.min, cliente: nombre,
      tel: tel.ok ? tel.lindo : '', creadoEn: Date.now(), sinTurno: op.hoy, llego: op.hoy ? h.min : null, enLocal: true, barbero: op.sel.b.id });
    D.turnos.push(t);
    guardarDatos();
    P.llegada = null;
    var conQuien = hayVarios() ? ', con ' + op.sel.b.nombre : '';
    P.deshacer = { tipo: 'llegada', id: t.id, texto: op.hoy
      ? nombre + ' quedó en la fila para las ' + hhmm(t.min) + ' (' + nombreServicio(s) + conQuien + ').'
      : nombre + ' tiene turno el ' + diaLargo(op.dia) + ' a las ' + hhmm(t.min) + ' (' + nombreServicio(s) + conQuien + ').' };
    renderReserva();
    return null;
  }
  function atDeshacer() {
    var d = P.deshacer;
    if (!d) return;
    var t = buscarTurno(d.id);
    if (d.tipo === 'llegada') {
      D.turnos = D.turnos.filter(function (x) { return x.id !== d.id; });
      guardarDatos();
    } else if (t) {
      if (d.tipo === 'cobrar') {
        t.estado = 'confirmado'; t.medio = '';
        D.mov = D.mov.filter(function (m) { return m.id !== d.movId; });
        guardarDatos();
      } else if (d.tipo === 'novino') {
        t.estado = 'confirmado';
      } else if (d.tipo === 'posponer') {
        var otro = buscarTurno(d.otro);
        t.min = d.antes.aMin; t.orden = d.antes.aOrden; t.pospuesto = d.antes.aPos;
        if (otro) { otro.min = d.antes.bMin; otro.orden = d.antes.bOrden; guardarTurno(otro); }
        renderReserva();
      }
      guardarTurno(t);
      P.atVer = d.tipo === 'posponer' ? null : t.id;
      if (P.atVer === (colaHoy(ahoraPY(), barberoAtender())[0] || {}).id) P.atVer = null;
    }
    P.deshacer = null;
    renderHeroTurno();
  }

  /* ----- Barberos: agregar, editar y quitar ----- */
  function bbForm(b) {
    var dias = {};
    for (var wd = 0; wd < 7; wd++) {
      var local = rangoDelLocal(wd);
      if (!local) continue;
      var r = b ? b.dias[wd] : local;
      dias[wd] = { on: !!r, desde: String(r ? r[0] : local[0]), hasta: String(r ? r[1] : local[1]) };
    }
    return { id: b ? b.id : null, nombre: b ? b.nombre : '', dias: dias };
  }
  function diasDelForm() {
    var d = {};
    for (var wd = 0; wd < 7; wd++) { var x = P.bb.dias[wd]; d[wd] = x && x.on ? [+x.desde, +x.hasta] : null; }
    return normalizarDias(d);
  }
  function validarBarbero() {
    var f = P.bb;
    var n = f.nombre.trim();
    if (n.length < 2) return 'Escribí el nombre.';
    var igual = barberosActivos().find(function (b) { return b.id !== f.id && sinAcentos(b.nombre) === sinAcentos(n); });
    if (igual) return 'Ya hay un barbero que se llama ' + igual.nombre + '.';
    var on = Object.keys(f.dias).filter(function (wd) { return f.dias[wd].on; });
    if (!on.length) return 'Marcá al menos un día.';
    var mal = on.find(function (wd) { return +f.dias[wd].hasta <= +f.dias[wd].desde; });
    if (mal != null) return 'El ' + DIAS[mal] + ', la hora de salida tiene que ser después de la de entrada.';
    return '';
  }
  // Turnos que todavía tiene: los confirmados de hoy en adelante
  function turnosPendientesBarbero(id) {
    var h = ahoraPY();
    return todosLosTurnos().filter(function (t) { return t.barbero === id && t.estado === 'confirmado' && t.fecha >= h.clave; }).sort(porFechaHora);
  }
  function opcionesRango(wd, valor) {
    var local = rangoDelLocal(wd), html = '';
    for (var m = local[0]; m <= local[1]; m += PASO) html += '<option value="' + m + '"' + (String(valor) === String(m) ? ' selected' : '') + '>' + hhmm(m) + '</option>';
    return html;
  }
  function plantillaFormBarbero() {
    var f = P.bb;
    var falta = validarBarbero();
    var filas = [1, 2, 3, 4, 5, 6, 0].filter(function (wd) { return f.dias[wd]; }).map(function (wd) {
      var d = f.dias[wd];
      return '<div class="bb-dia"><label class="bb-dia-check"><input type="checkbox" data-bb-dia="' + wd + '" data-bb="on" data-foco="bb-on-' + wd + '"' + (d.on ? ' checked' : '') + '> ' + cap(DIAS[wd]) + '</label>' +
        '<select class="campo" data-bb-dia="' + wd + '" data-bb="desde" aria-label="' + cap(DIAS[wd]) + ', desde"' + (d.on ? '' : ' disabled') + '>' + opcionesRango(wd, d.desde) + '</select>' +
        '<span aria-hidden="true">a</span>' +
        '<select class="campo" data-bb-dia="' + wd + '" data-bb="hasta" aria-label="' + cap(DIAS[wd]) + ', hasta"' + (d.on ? '' : ' disabled') + '>' + opcionesRango(wd, d.hasta) + '</select></div>';
    }).join('');
    return '<section class="tarjeta-form bb-form" aria-labelledby="bb-form-t"><h2 class="pa-h3" id="bb-form-t">' + (f.id ? 'Editar a ' + esc(nombreBarbero(f.id)) : 'Nuevo barbero') + '</h2>' +
      '<label for="bb-nombre">Nombre</label><input class="campo" id="bb-nombre" type="text" maxlength="40" autocomplete="off" data-campo="bb.nombre" value="' + esc(f.nombre) + '">' +
      '<fieldset class="bb-dias"><legend>Días y horas que atiende</legend>' + filas + '</fieldset>' +
      '<p class="suave bb-nota">Siempre dentro del horario del local: de lunes a jueves, de 11:30 a 13:00 no se dan turnos aunque marques el día entero.</p>' +
      '<p class="form-falta" id="bb-falta">' + esc(f.nombre ? falta : '') + '</p>' +
      '<div class="prod-form-acciones"><button type="button" class="btn btn-negro btn-mini" id="bb-guardar" data-accion="bb-guardar" data-foco="bb-guardar"' + (falta ? ' disabled' : '') + '>' + (f.id ? 'Guardar' : 'Agregar barbero') + '</button>' +
        '<button type="button" class="link-btn" data-accion="bb-cancelar">Cancelar</button></div></section>';
  }
  function plantillaQuitarBarbero(b) {
    var q = P.bbQuitar;
    var pend = turnosPendientesBarbero(b.id);
    var otros = barberosActivos().filter(function (x) { return x.id !== b.id; });
    var resto = q.noEntran && q.noEntran.length ? '<p class="hz-alerta">Estos turnos no entran en el horario de ' + esc(nombreBarbero(q.destino)) + ': ' +
      esc(listaY(q.noEntran.map(function (t) { return primerNombre(t.cliente) + ' (' + DIAS_C[diaSemana(t.fecha)] + ' ' + fechaDe(t.fecha).getUTCDate() + ', ' + hhmm(t.min) + ')'; }))) +
      '. Cambialos o cancelalos desde Turnos.</p>' : '';
    if (pend.length) {
      if (!q.destino || !otros.some(function (x) { return x.id === q.destino; })) q.destino = otros[0].id;
      return '<div class="bb-quitar" role="group" aria-labelledby="bb-q-t"><p id="bb-q-t"><strong>' + esc(b.nombre) + ' tiene ' + plural(pend.length, 'turno pendiente', 'turnos pendientes') + '.</strong> Antes de quitarlo, pasalos a otro barbero.</p>' + resto +
        '<label class="campo-label" for="bb-destino">Pasar sus turnos a</label><select class="campo" id="bb-destino" data-campo="bbQuitar.destino">' +
          otros.map(function (x) { return '<option value="' + esc(x.id) + '"' + (q.destino === x.id ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('') + '</select>' +
        '<div class="prod-form-acciones"><button type="button" class="btn btn-negro btn-mini" data-accion="bb-pasar" data-id="' + esc(b.id) + '" data-foco="bb-pasar">Pasar los turnos</button>' +
          '<button type="button" class="link-btn" data-accion="bb-quitar-no" data-id="' + esc(b.id) + '">Cancelar</button></div></div>';
    }
    return '<div class="bb-quitar" role="group" aria-labelledby="bb-q-t"><p id="bb-q-t"><strong>¿Quitar a ' + esc(b.nombre) + '?</strong> Ya no aparece para reservar ni en Atender. Su historial queda en los reportes.</p>' + resto +
      '<div class="prod-form-acciones"><button type="button" class="btn btn-rojo btn-mini" data-accion="bb-quitar-si" data-id="' + esc(b.id) + '" data-foco="bb-quitar-si">Sí, quitar</button>' +
        '<button type="button" class="link-btn" data-accion="bb-quitar-no" data-id="' + esc(b.id) + '">No</button></div></div>';
  }
  function plantillaBarberos(h) {
    var act = barberosActivos();
    var desde30 = sumarDias(h.clave, -30);
    var hist = historialHasta(h).concat(todosLosTurnos());
    var lista = '<ul class="bb-lista">' + act.map(function (b) {
      var pend = turnosPendientesBarbero(b.id).length;
      var atendidos = hist.filter(function (t) { return t.barbero === b.id && t.estado === 'atendido' && t.fecha >= desde30; }).length;
      var editando = P.bb && P.bb.id === b.id;
      return '<li class="bb-item"><div class="bb-cab"><div><p class="bb-nombre" id="bb-n-' + esc(b.id) + '" tabindex="-1">' + esc(b.nombre) + (esDelDueno(b.id) ? ' <span class="bb-dueno">Dueño</span>' : '') + '</p>' +
          '<p class="bb-dias">' + esc(textoDias(b.dias)) + '</p>' +
          '<p class="suave bb-datos">' + plural(pend, 'turno pendiente', 'turnos pendientes') + ' · ' + plural(atendidos, 'cliente atendido', 'clientes atendidos') + ' en los últimos 30 días</p></div>' +
        '<div class="bb-botones"><button type="button" class="btn btn-linea btn-mini" data-accion="bb-editar" data-id="' + esc(b.id) + '" data-foco="bb-editar-' + esc(b.id) + '" aria-label="Editar a ' + esc(b.nombre) + '"' + (editando ? ' aria-expanded="true"' : '') + '>Editar</button>' +
          (act.length > 1 && !esDelDueno(b.id) ? '<button type="button" class="btn btn-linea btn-mini btn-peligro" data-accion="bb-quitar" data-id="' + esc(b.id) + '" data-foco="bb-quitar-' + esc(b.id) + '" aria-label="Quitar a ' + esc(b.nombre) + '">Quitar</button>' : '') +
        '</div></div>' +
        (REMOTO ? plantillaCuenta(b) : '') +
        (editando ? plantillaFormBarbero() : '') +
        (P.bbQuitar && P.bbQuitar.id === b.id ? plantillaQuitarBarbero(b) : '') +
      '</li>';
    }).join('') + '</ul>';
    var quitados = BARB.barberos.filter(function (b) { return !b.activo; });
    return '<p class="turnos-intro" style="margin-top:0">Cada barbero atiende en sus días y horas, dentro del horario del local. ' +
        (act.length > 1 ? 'En la reserva, el cliente elige con quién cortarse o «El que esté libre»; en Atender, cada barbero toca su nombre y ve su fila.' : 'Cuando haya más de un barbero, en la reserva el cliente elige con quién cortarse y en Atender cada uno ve su fila.') + '</p>' +
      (P.avisoBarberos ? '<p class="aviso-ok" role="status">' + esc(P.avisoBarberos) + '</p>' : '') +
      (P.avisoCuenta ? '<p class="aviso-ok" role="status">' + esc(P.avisoCuenta) + '</p>' : '') +
      lista +
      (P.bb && !P.bb.id ? plantillaFormBarbero() : '<button type="button" class="btn btn-negro btn-mini" data-accion="bb-nuevo" data-foco="bb-nuevo">+ Agregar barbero</button>') +
      (quitados.length ? '<p class="suave bb-quitados">Ya no trabajan: ' + esc(listaY(quitados.map(function (b) { return b.nombre; }))) + '. Sus cortes siguen contando en los reportes.</p>' : '');
  }
  function guardarBarbero() {
    var f = P.bb;
    if (validarBarbero()) return false;
    var dias = diasDelForm();
    var nombre = f.nombre.trim().slice(0, 40);
    var b;
    if (f.id) { b = barberoPorId(f.id); b.nombre = nombre; b.dias = dias; }
    else if (REMOTO) {
      // El N.º del barbero lo da la base: se agrega y se espera la respuesta
      agregarBarberoEnServidor({ nombre: nombre, dias: dias });
      P.bb = null;
      return 'nuevo';
    } else {
      b = { id: 'b' + BARB.sig++, nombre: nombre, activo: true, dias: dias, creadoEn: Date.now(), quitadoEn: 0 };
      BARB.barberos.push(b);
    }
    guardarBarberos();
    var afuera = turnosAfuera(BLOQ, ahoraPY().clave, '9999-12-31').filter(function (t) { return t.barbero === b.id; });
    P.avisoBarberos = (f.id ? 'Guardaste los cambios de ' + b.nombre + '.' : 'Agregaste a ' + b.nombre + '. Ya aparece para elegir en la reserva.') +
      (afuera.length ? ' Quedaron ' + plural(afuera.length, 'turno', 'turnos') + ' fuera de sus horas: ' +
        listaY(afuera.slice(0, 3).map(function (t) { return primerNombre(t.cliente) + ' (' + DIAS_C[diaSemana(t.fecha)] + ' ' + hhmm(t.min) + ')'; })) + (afuera.length > 3 ? ' y más' : '') + '. Cambialos o cancelalos desde Turnos.' : '');
    P.bb = null;
    actualizarSitioHorario();
    return b.id;
  }
  function pasarTurnos(deId, aId) {
    var dest = barberoPorId(aId);
    var noEntran = [], pasados = 0;
    turnosPendientesBarbero(deId).forEach(function (t) {
      var otros = todosLosTurnos().filter(function (x) { return x.id !== t.id; });
      if (libreBarbero(dest, t.fecha, t.min, t.dur, ocupacionBarbero(dest.id, t.fecha, otros))) { t.barbero = dest.id; guardarTurno(t); pasados++; }
      else noEntran.push(t);
    });
    P.bbQuitar.noEntran = noEntran;
    P.avisoBarberos = pasados ? 'Pasaste ' + plural(pasados, 'turno', 'turnos') + ' a ' + dest.nombre + '.' : '';
    renderReserva();
  }
  function quitarBarbero(id) {
    var b = barberoPorId(id);
    if (!b || barberosActivos().length <= 1 || turnosPendientesBarbero(id).length) return;
    b.activo = false; b.quitadoEn = Date.now();
    BLOQ = BLOQ.filter(function (x) { return x.barbero !== id; });
    guardarBloqueos();
    guardarBarberos();
    if (R.barbero === id) R.barbero = '';
    if (P.atBarbero === id) P.atBarbero = null;
    P.bbQuitar = null;
    P.avisoBarberos = 'Quitaste a ' + b.nombre + '. Su historial sigue en los reportes.';
    actualizarSitioHorario();
  }

  /* ----- Horario: días cerrados, horas cerradas y horarios especiales ----- */
  function hzVacio(tipo) { return { tipo: tipo || 'cerrado', fecha: '', hasta: '', desde: '', fin: '', motivo: '', barbero: '' }; }
  function armarBloqueo() {
    var f = P.hz;
    var b = { tipo: f.tipo, fecha: f.fecha, motivo: f.motivo.trim().slice(0, 60) };
    // Cerrar días u horas puede ser solo para un barbero (vacaciones, un trámite); "otro horario" es de todo el local
    if (f.barbero && f.tipo !== 'especial' && barberoPorId(f.barbero)) b.barbero = f.barbero;
    if (f.tipo === 'cerrado') b.hasta = f.hasta && f.hasta > f.fecha ? f.hasta : f.fecha;
    else { b.desde = f.desde === '' ? null : +f.desde; b.fin = f.fin === '' ? null : +f.fin; }
    return b;
  }
  function validarBloqueo() {
    var f = P.hz;
    var hoy = ahoraPY().clave;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return 'Elegí la fecha.';
    if (f.fecha < hoy) return 'La fecha ya pasó.';
    if (f.tipo === 'cerrado') {
      if (f.hasta && f.hasta < f.fecha) return 'El último día tiene que ser después del primero.';
      return '';
    }
    if (f.desde === '' || f.fin === '') return f.tipo === 'franja' ? 'Elegí desde y hasta qué hora se cierra.' : 'Elegí a qué hora abre y a qué hora cierra.';
    if (+f.fin <= +f.desde) return 'La hora final tiene que ser después de la inicial.';
    if (f.tipo === 'franja' && f.barbero && barberoPorId(f.barbero)) {
      var bb = barberoPorId(f.barbero);
      if (!horasBarbero(bb, f.fecha).some(function (t) { return +f.desde < t[1] && +f.fin > t[0]; })) return 'Ese día ' + bb.nombre + ' no atiende en ese horario.';
    } else if (f.tipo === 'franja' && !HORAS[diaSemana(f.fecha)].some(function (t) { return +f.desde < t[1] && +f.fin > t[0]; })) {
      return 'Ese día el local ya está cerrado en ese horario.';
    }
    return '';
  }
  // Turnos confirmados que quedan afuera del horario con estos cambios
  function turnosAfuera(lista, fechaDesde, fechaHasta) {
    var h = ahoraPY();
    return todosLosTurnos().filter(function (t) {
      return t.estado === 'confirmado' && !empezo(t, h) && t.fecha >= fechaDesde && t.fecha <= fechaHasta && !entraEnHorario(t, lista);
    }).sort(porFechaHora);
  }
  function afectadosPrevios() {
    if (validarBloqueo()) return [];
    var b = armarBloqueo();
    return turnosAfuera(BLOQ.concat([b]), b.fecha, b.hasta || b.fecha).filter(function (t) { return entraEnHorario(t); });
  }
  function textoAfectados(l) {
    if (!l.length) return '';
    return '<p class="hz-afectados-txt">' + (l.length === 1 ? 'Hay 1 turno reservado' : 'Hay ' + l.length + ' turnos reservados') + ' en ese horario: ' +
      esc(listaY(l.slice(0, 4).map(function (t) { return primerNombre(t.cliente) + ' (' + DIAS_C[diaSemana(t.fecha)] + ' ' + fechaDe(t.fecha).getUTCDate() + ', ' + hhmm(t.min) + ')'; }))) +
      (l.length > 4 ? ' y ' + (l.length - 4) + ' más' : '') + '. Después de guardar, cancelalos y avisales por WhatsApp desde la lista de abajo.</p>';
  }
  function opcionesHora(valor, primera) {
    var html = '<option value="">' + primera + '</option>';
    for (var m = 360; m <= 1320; m += PASO) html += '<option value="' + m + '"' + (String(valor) === String(m) ? ' selected' : '') + '>' + hhmm(m) + '</option>';
    return html;
  }

  function plantillaHorario(h) {
    var f = P.hz;
    var tipos = [['cerrado', 'Cerrar días'], ['franja', 'Cerrar horas'], ['especial', 'Otro horario']];
    var campos = '<div class="hz-campo"><label for="hz-fecha">' + (f.tipo === 'cerrado' ? 'Desde el día' : 'Día') + '</label><input class="campo" id="hz-fecha" type="date" min="' + h.clave + '" data-campo="hz.fecha" value="' + esc(f.fecha) + '"></div>';
    if (f.tipo === 'cerrado') {
      campos += '<div class="hz-campo"><label for="hz-hasta">Hasta el día <span class="suave">(opcional)</span></label><input class="campo" id="hz-hasta" type="date" min="' + h.clave + '" data-campo="hz.hasta" value="' + esc(f.hasta) + '"></div>';
    } else {
      var esp = f.tipo === 'especial';
      campos += '<div class="hz-campo"><label for="hz-desde">' + (esp ? 'Abre a las' : 'Cerrado desde') + '</label><select class="campo" id="hz-desde" data-campo="hz.desde">' + opcionesHora(f.desde, 'Elegí') + '</select></div>' +
        '<div class="hz-campo"><label for="hz-fin">' + (esp ? 'Cierra a las' : 'Hasta') + '</label><select class="campo" id="hz-fin" data-campo="hz.fin">' + opcionesHora(f.fin, 'Elegí') + '</select></div>';
    }
    if (hayVarios() && f.tipo !== 'especial') {
      campos += '<div class="hz-campo"><label for="hz-barbero">¿Para quién?</label><select class="campo" id="hz-barbero" data-campo="hz.barbero">' +
        '<option value="">Todo el local</option>' + barberosActivos().map(function (b) { return '<option value="' + esc(b.id) + '"' + (f.barbero === b.id ? ' selected' : '') + '>Solo ' + esc(b.nombre) + '</option>'; }).join('') + '</select></div>';
    }
    campos += '<div class="hz-campo hz-motivo"><label for="hz-motivo">Motivo <span class="suave">(se muestra en el sitio, opcional)</span></label><input class="campo" id="hz-motivo" type="text" maxlength="60" placeholder="Feriado, vacaciones, trámite…" data-campo="hz.motivo" value="' + esc(f.motivo) + '"></div>';
    var falta = validarBloqueo();

    var proximos = BLOQ.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
    var recien = P.abierto && P.abierto.que === 'cancelado' ? P.abierto.id : null;
    var lista = proximos.length ? '<ul class="hz-lista">' + proximos.map(function (b) {
      var fin = b.tipo === 'cerrado' ? b.hasta : b.fecha;
      var delBloqueo = function (t) { return bloqueosDel(t.fecha, null, b.barbero).indexOf(b) >= 0 && (!b.barbero || t.barbero === b.barbero); };
      var afuera = turnosAfuera(BLOQ, b.fecha, fin).filter(delBloqueo);
      if (recien) { var tr = buscarTurno(recien); if (tr && tr.fecha >= b.fecha && tr.fecha <= fin && afuera.indexOf(tr) < 0 && delBloqueo(tr)) afuera.push(tr); }
      return '<li class="hz-item"><div class="hz-item-cab"><div><p class="hz-fechas">' + esc(fechasBloqueo(b)) + '</p><p class="hz-que">' + textoBloqueo(b) + (b.motivo ? ' · ' + esc(b.motivo) : '') + '</p></div>' +
        '<button type="button" class="btn btn-linea btn-mini" data-accion="hz-quitar" data-id="' + esc(b.id) + '" data-foco="hz-quitar-' + esc(b.id) + '">Quitar</button></div>' +
        (afuera.length ? '<p class="hz-alerta">' + (afuera.filter(function (t) { return t.estado === 'confirmado'; }).length === 1 ? 'Este turno quedó afuera del horario:' : 'Estos turnos quedaron afuera del horario:') + '</p><ul class="lista">' + afuera.map(function (t) { return filaTurno(t, h, 'horario'); }).join('') + '</ul>' : '') +
      '</li>';
    }).join('') + '</ul>' : '<p class="vacio">No hay cambios de horario cargados. El local atiende en su horario normal.</p>';

    return (P.avisoHorario ? '<p class="aviso-ok" role="status">' + esc(P.avisoHorario) + '</p>' : '') +
      '<p class="turnos-intro">Horario normal: lunes a jueves de 08:00 a 11:30 y de 13:00 a 17:30; viernes y sábado de 08:00 a 17:30; domingo cerrado. ' +
        'Acá cerrás días u horas, o abrís con otro horario un día puntual: el sitio deja de ofrecer esos turnos y avisa el cambio en Horarios.' +
        (hayVarios() ? ' Si es solo para un barbero (vacaciones, un trámite), elegilo en «¿Para quién?»; los días y horas de cada uno se cambian en Barberos.' : '') + '</p>' +
      '<div class="pa-dos">' +
        '<section class="hz-form tarjeta-form" aria-labelledby="hz-form-t"><h2 class="pa-h3" id="hz-form-t">Nuevo cambio de horario</h2>' +
          '<div class="segmentado" role="group" aria-label="Tipo de cambio">' + tipos.map(function (x) {
            return '<button type="button" data-accion="hz-tipo" data-t="' + x[0] + '" data-foco="hz-tipo-' + x[0] + '" aria-pressed="' + (f.tipo === x[0]) + '">' + x[1] + '</button>';
          }).join('') + '</div>' +
          '<div class="hz-campos">' + campos + '</div>' +
          '<div id="hz-afectados">' + textoAfectados(afectadosPrevios()) + '</div>' +
          '<p class="form-falta" id="hz-falta">' + (f.fecha ? falta : '') + '</p>' +
          '<button type="button" class="btn btn-negro" id="hz-guardar" data-accion="hz-guardar" data-foco="hz-guardar"' + (falta ? ' disabled' : '') + '>Guardar cambio</button>' +
        '</section>' +
        '<section class="hz-proximos" aria-labelledby="hz-prox-t"><h2 class="pa-h3" id="hz-prox-t">Próximos cambios</h2>' + lista + '</section>' +
      '</div>';
  }
  function guardarBloqueo() {
    if (validarBloqueo()) return false;
    var b = armarBloqueo();
    b.id = 'b' + Date.now().toString(36);
    b.creadoEn = Date.now();
    BLOQ.push(b);
    guardarBloqueos();
    var afuera = turnosAfuera(BLOQ, b.fecha, b.hasta || b.fecha).length;
    P.avisoHorario = 'Guardaste: ' + fechasBloqueo(b).replace(/^D/, 'd') + ', ' + minus(textoBloqueo(b)) + '.' + (afuera ? ' Quedaron ' + plural(afuera, 'turno', 'turnos') + ' afuera: avisales desde la lista.' : ' El sitio ya no ofrece esos horarios.');
    P.hz = hzVacio(P.hz.tipo);
    actualizarSitioHorario();
    return true;
  }
  function quitarBloqueo(id) {
    var b = BLOQ.find(function (x) { return x.id === id; });
    if (!b) return;
    BLOQ = BLOQ.filter(function (x) { return x !== b; });
    guardarBloqueos();
    P.avisoHorario = 'Quitaste el cambio (' + fechasBloqueo(b).replace(/^D/, 'd') + '). El sitio vuelve a ofrecer esos horarios.';
    actualizarSitioHorario();
  }
  function actualizarSitioHorario() { renderHorarios(); renderEstadoHero(); renderReserva(); }

  /* ----- Clientes: cada uno tiene un número interno ----- */
  // Como en la base de datos: el N.º de cliente es la clave (PK) y nunca cambia.
  // Un turno es de un cliente cuando coinciden su WhatsApp y su nombre y apellido (sin importar
  // mayúsculas ni acentos). Así un papá y su hijo que reservan con el mismo número quedan separados,
  // y si alguien cambia de número se le cambia en la ficha sin perder su historial.
  // { v, sig: próximo N.º, ids: { 'número|nombre': N.º }, fichas: { N.º: { tel, anteriores: [{ wa, hasta }], unidos: [N.º] } },
  //   distintos: ['3-15'] (pares que el dueño confirmó que son personas distintas) }
  var CLAVE_CLIENTES = 'tommybarber-clientes';
  // bloqueados: [{ wa, motivo, en }] números que no pueden reservar por la web (turnos falsos)
  function registroVacio() { return { v: 1, sig: 1, ids: {}, fichas: {}, distintos: [], bloqueados: [] }; }
  function cargarRegistro() {
    var r = REMOTO ? null : leerJSON(CLAVE_CLIENTES, null);
    if (!(r && r.v === 1 && r.sig > 0 && r.ids && r.fichas && Array.isArray(r.distintos))) return registroVacio();
    if (!Array.isArray(r.bloqueados)) r.bloqueados = [];
    return r;
  }
  var CLI = cargarRegistro();
  var cliCambio = false;
  // Con la base de datos el registro lo lleva el servidor: los cambios van con opCliente()
  function guardarRegistro() { if (!REMOTO) guardarJSON(CLAVE_CLIENTES, CLI); cliCambio = false; }
  function nombreNorm(n) {
    var s = sinAcentos(String(n || '').trim().replace(/\s+/g, ' '));
    return s === 'cliente sin turno' || s === 'cliente' ? '' : s;
  }
  function claveBase(nombre, tel) {
    var t = telInfo(tel), n = nombreNorm(nombre);
    if (t.ok) return 't' + t.wa + '|' + n;
    return n ? 'n' + n : null;
  }
  function fichaDe(id) { return CLI.fichas[id] || (CLI.fichas[id] = { tel: '', anteriores: [], unidos: [] }); }
  // Clientes que usan (o usaron) ese número
  function idsConTel(wa) {
    var ids = {};
    Object.keys(CLI.ids).forEach(function (k) { if (k.indexOf('t' + wa + '|') === 0) ids[CLI.ids[k]] = true; });
    Object.keys(CLI.fichas).forEach(function (id) {
      if (CLI.fichas[id].anteriores.some(function (a) { return a.wa === wa; })) ids[id] = true;
    });
    return Object.keys(ids).map(Number);
  }
  // N.º de cliente de un turno (lo crea si es la primera vez que viene)
  function clienteIdDe(t) {
    var b = claveBase(t.cliente, t.tel);
    if (!b) return null;
    if (CLI.ids[b]) return CLI.ids[b];
    // Con la base de datos, el N.º lo da el servidor: mientras tanto, uno provisorio
    if (REMOTO) return TEMP_IDS[b] || (TEMP_IDS[b] = -(tempSig++));
    var tel = telInfo(t.tel);
    if (tel.ok && !nombreNorm(t.cliente)) {
      // Dejó solo el número: si es de un único cliente, es él
      var mismos = idsConTel(tel.wa);
      if (mismos.length === 1) { CLI.ids[b] = mismos[0]; cliCambio = true; return mismos[0]; }
    }
    CLI.ids[b] = CLI.sig++;
    cliCambio = true;
    return CLI.ids[b];
  }
  function claveCliente(t) { var id = clienteIdDe(t); return id ? String(id) : null; }
  function parDistinto(a, b) { return Math.min(+a, +b) + '-' + Math.max(+a, +b); }

  // Junta dos fichas en una. Queda el N.º más antiguo y el último número que usó; el otro pasa a "números anteriores".
  function unirClientes(a, b) {
    var queda = Math.min(+a, +b), sale = Math.max(+a, +b);
    if (queda === sale) return null;
    if (REMOTO) opCliente('POST', '/api/panel/clientes/unir', { a: queda, b: sale });
    var ca = IDX[String(queda)], cb = IDX[String(sale)];
    var fq = fichaDe(queda), fs = CLI.fichas[sale] || { tel: '', anteriores: [], unidos: [] };
    Object.keys(CLI.ids).forEach(function (k) { if (CLI.ids[k] === sale) CLI.ids[k] = queda; });
    // El número que queda: el último que cargó el dueño con «Cambiar número» o, si no, el del turno más reciente
    var turnos = (ca ? ca.turnos : []).concat(cb ? cb.turnos : []).filter(function (t) { return telInfo(t.tel).ok; }).sort(porFechaHora);
    var nums = [fq.tel, fs.tel].concat(turnos.map(function (t) { return telInfo(t.tel).wa; })).filter(Boolean);
    var cargado = [fq, fs].filter(function (f) { return f.tel && f.cambioTel; }).sort(function (x, y) { return y.cambioTel - x.cambioTel; })[0];
    var actual = cargado ? cargado.tel : turnos.length ? telInfo(turnos[turnos.length - 1].tel).wa : (fq.tel || fs.tel);
    if (cargado) fq.cambioTel = cargado.cambioTel;
    var anteriores = fq.anteriores.concat(fs.anteriores);
    nums.forEach(function (wa) { if (wa !== actual && !anteriores.some(function (x) { return x.wa === wa; })) anteriores.push({ wa: wa, hasta: Date.now() }); });
    fq.tel = actual || '';
    fq.anteriores = anteriores.filter(function (x, i) { return x.wa !== actual && anteriores.findIndex(function (y) { return y.wa === x.wa; }) === i; });
    fq.unidos = fq.unidos.concat([sale], fs.unidos || []);
    delete CLI.fichas[sale];
    CLI.distintos = CLI.distintos.filter(function (p) { return p.split('-').indexOf(String(sale)) < 0; });
    guardarRegistro();
    return queda;
  }
  // El cliente cambió de número: queda guardado el anterior y sus próximos turnos se avisan al nuevo
  function cambiarNumero(c, nuevo) {
    var t = telInfo(nuevo);
    if (REMOTO) {
      // Primero el servidor cambia la ficha; después van los turnos con el número nuevo
      opCliente('POST', '/api/panel/clientes/numero', { id: +c.id, tel: t.wa, nombre: c.nombre, anterior: c.tel || '' });
      var hNum = ahoraPY();
      todosLosTurnos().forEach(function (x) {
        if (x.estado === 'confirmado' && !empezo(x, hNum) && claveCliente(x) === String(c.id)) { x.tel = t.lindo; guardarTurno(x); }
      });
      // Si ya había otra ficha con ese número y ese nombre, el servidor las junta en la de N.º más bajo
      var bNum = claveBase(c.nombre, t.lindo), otroNum = CLI.ids[bNum];
      CLI.ids[bNum] = +c.id;
      return otroNum && otroNum !== +c.id ? Math.min(otroNum, +c.id) : +c.id;
    }
    var f = fichaDe(+c.id);
    var viejo = telInfo(c.tel);
    if (viejo.ok && viejo.wa !== t.wa && !f.anteriores.some(function (x) { return x.wa === viejo.wa; })) f.anteriores.push({ wa: viejo.wa, hasta: Date.now() });
    f.anteriores = f.anteriores.filter(function (x) { return x.wa !== t.wa; });
    f.tel = t.wa;
    f.cambioTel = Date.now();
    var h = ahoraPY();
    todosLosTurnos().forEach(function (x) {
      if (x.estado === 'confirmado' && !empezo(x, h) && claveCliente(x) === String(c.id)) { x.tel = t.lindo; guardarTurno(x); }
    });
    // Desde ahora, ese número con ese nombre es este cliente. Si ya había otra ficha así, se juntan.
    var b = claveBase(c.nombre, t.lindo);
    var otro = CLI.ids[b];
    CLI.ids[b] = +c.id;
    guardarRegistro();
    if (otro && otro !== +c.id) return unirClientes(otro, c.id);
    return +c.id;
  }

  /* Números bloqueados: no pueden reservar por la web. El dueño igual los puede anotar en el local. */
  function numeroBloqueado(wa) { return CLI.bloqueados.find(function (x) { return x.wa === wa; }) || null; }
  function bloquearNumero(wa, motivo) {
    if (!wa || numeroBloqueado(wa)) return;
    CLI.bloqueados.push({ wa: wa, motivo: String(motivo || '').slice(0, 80), en: Date.now() });
    if (REMOTO) opCliente('POST', '/api/panel/clientes/bloqueados', { wa: wa, motivo: String(motivo || '').slice(0, 80) });
    guardarRegistro();
  }
  function desbloquearNumero(wa) {
    CLI.bloqueados = CLI.bloqueados.filter(function (x) { return x.wa !== wa; });
    if (REMOTO) opCliente('DELETE', '/api/panel/clientes/bloqueados/' + wa);
    guardarRegistro();
  }

  var IDX = {};  // índice de clientes del último dibujo del panel
  function indiceClientes(h) {
    var idx = {};
    historialHasta(h).concat(todosLosTurnos()).forEach(function (t) {
      var k = claveCliente(t);
      if (!k) return;
      var c = idx[k] || (idx[k] = { id: k, num: +k, nombre: t.cliente, tel: '', ejemplo: true, turnos: [], visitas: 0, faltas: 0, cancela: 0, gastado: 0 });
      c.turnos.push(t);
      if (!t.ejemplo) c.ejemplo = false;
      if (t.estado === 'atendido') { c.visitas++; c.gastado += t.precio; }
      else if (t.estado === 'novino') c.faltas++;
      else if (t.estado === 'cancelado' && t.canceladoPor === 'cliente') c.cancela++;
    });
    if (cliCambio) guardarRegistro();
    Object.keys(idx).forEach(function (k) {
      var c = idx[k];
      c.turnos.sort(porFechaHora);
      var hechos = c.turnos.filter(function (t) { return t.estado === 'atendido'; });
      var f = CLI.fichas[k];
      var conTel = c.turnos.filter(function (t) { return telInfo(t.tel).ok; });
      c.tel = f && f.tel ? telInfo(f.tel).lindo : conTel.length ? telInfo(conTel[conTel.length - 1].tel).lindo : '';
      c.cambioTel = f && f.cambioTel ? f.cambioTel : 0;
      c.anteriores = f ? f.anteriores.map(function (x) { return telInfo(x.wa).lindo; }) : [];
      var conNombre = c.turnos.filter(function (t) { return nombreNorm(t.cliente); });
      c.nombre = conNombre.length ? conNombre[conNombre.length - 1].cliente : 'Cliente sin turno';
      c.primero = c.turnos[0].fecha;
      c.ultimo = hechos[hechos.length - 1] || null;
      c.proximo = c.turnos.find(function (t) { return t.estado === 'confirmado' && !empezo(t, h); }) || null;
      var veces = {};
      hechos.forEach(function (t) { veces[t.servicio] = (veces[t.servicio] || 0) + 1; });
      var fav = Object.keys(veces).sort(function (a, b) { return veces[b] - veces[a]; })[0];
      c.favorito = fav ? { nombre: nombreServicio(SERV[fav]), veces: veces[fav] } : null;
    });
    return idx;
  }
  // Fichas que pueden ser de la misma persona: mismo nombre y apellido con otro número
  // (¿cambió de número?) o mismo número con otro nombre (¿un familiar, o lo escribió distinto?)
  function posiblesRepetidos(idx) {
    var porNombre = {}, porTel = {}, pares = {}, lista = [];
    Object.keys(idx).forEach(function (k) {
      var c = idx[k], n = nombreNorm(c.nombre), t = telInfo(c.tel);
      if (n) (porNombre[n] = porNombre[n] || []).push(c);
      if (t.ok) (porTel[t.wa] = porTel[t.wa] || []).push(c);
    });
    function agregar(grupos, motivo) {
      Object.keys(grupos).forEach(function (g) {
        var l = grupos[g].sort(function (a, b) { return a.num - b.num; });
        for (var i = 0; i < l.length; i++) for (var j = i + 1; j < l.length; j++) {
          var par = parDistinto(l[i].id, l[j].id);
          if (pares[par] || CLI.distintos.indexOf(par) >= 0) continue;
          pares[par] = true;
          lista.push({ par: par, a: l[i], b: l[j], motivo: motivo });
        }
      });
    }
    agregar(porNombre, 'nombre');
    agregar(porTel, 'tel');
    return lista;
  }
  function repetidosDe(c) { return REP.filter(function (r) { return r.a.id === c.id || r.b.id === c.id; }); }
  var REP = [];
  function faltasDe(t) { var c = IDX[claveCliente(t)]; return c ? c.faltas : 0; }
  function pillFaltas(t) {
    var n = faltasDe(t);
    return n ? '<span class="pill pill-falta">Faltó ' + (n === 1 ? '1 vez' : n + ' veces') + '</span>' : '';
  }
  function haceDias(clave, h) {
    var d = diasEntre(clave, h.clave);
    return d === 0 ? 'hoy' : d === 1 ? 'ayer' : d < 31 ? 'hace ' + d + ' días' : 'el ' + fechaDe(clave).getUTCDate() + ' de ' + MESES[fechaDe(clave).getUTCMonth()];
  }
  function sinAcentos(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function plantillaClientes(h) {
    if (P.cliente && IDX[P.cliente]) return plantillaFicha(IDX[P.cliente], h);
    var todos = Object.keys(IDX).map(function (k) { return IDX[k]; });
    var frecuentes = todos.filter(function (c) { return c.visitas >= 4; }).length;
    var conFaltas = todos.filter(function (c) { return c.faltas > 0; });
    var lista = P.clOrden === 'faltas' ? conFaltas.slice().sort(function (a, b) { return b.faltas - a.faltas || b.visitas - a.visitas; })
      : P.clOrden === 'recientes' ? todos.slice().sort(function (a, b) { return (b.ultimo ? b.ultimo.fecha : '') < (a.ultimo ? a.ultimo.fecha : '') ? -1 : 1; })
      : todos.slice().sort(function (a, b) { return b.visitas - a.visitas || b.gastado - a.gastado; });
    var ordenes = [['frecuentes', 'Los que más vienen'], ['recientes', 'Recientes'], ['faltas', 'Con faltas (' + conFaltas.length + ')']];
    var repetidos = REP.length
      ? '<section class="cl-reps" aria-labelledby="cl-reps-t"><h2 class="pa-h3" id="cl-reps-t">Posibles clientes repetidos (' + REP.length + ')</h2>' +
        '<p class="suave cl-reps-intro">Fichas que pueden ser de la misma persona. Si es el mismo cliente, se juntan con todo su historial; si no, marcalos como distintos y no se vuelve a preguntar.</p>' +
        REP.map(function (r) { return itemRepetido(r, ''); }).join('') + '</section>'
      : '';
    var bloqueados = CLI.bloqueados.length
      ? '<section class="cl-bloqueados" aria-labelledby="cl-bloq-t"><h2 class="pa-h3" id="cl-bloq-t">Números bloqueados (' + CLI.bloqueados.length + ')</h2>' +
        '<p class="suave cl-reps-intro">No pueden reservar por la web: el sitio les pide que escriban al WhatsApp del local.</p><ul class="cl-bloq-lista">' +
        CLI.bloqueados.map(function (x) {
          var quienes = Object.keys(IDX).map(function (k) { return IDX[k]; }).filter(function (c) { return telInfo(c.tel).wa === x.wa; }).map(function (c) { return c.nombre; });
          return '<li><div><p class="cl-bloq-num">' + esc(telInfo(x.wa).lindo) + (quienes.length ? ' · ' + esc(listaY(quienes.slice(0, 3))) : '') + '</p>' +
            '<p class="suave">Bloqueado ' + esc(cuandoFue(x.en)) + (x.motivo ? '. ' + esc(x.motivo) : '') + '</p></div>' +
            '<button type="button" class="btn btn-linea btn-mini" data-accion="cl-desbloquear" data-id="' + esc(x.wa) + '" data-foco="cl-desbloquear-' + esc(x.wa) + '">Desbloquear</button></li>';
        }).join('') + '</ul></section>'
      : '';
    return (P.avisoCliente ? '<p class="aviso-ok" role="status">' + esc(P.avisoCliente) + '</p>' : '') + repetidos + bloqueados +
      '<div class="cifras">' +
        '<div class="cifra"><p class="cifra-label">Clientes en los últimos 6 meses</p><p class="cifra-valor">' + todos.length + '</p></div>' +
        '<div class="cifra"><p class="cifra-label">Vinieron 4 veces o más</p><p class="cifra-valor">' + frecuentes + '</p></div>' +
        '<div class="cifra"><p class="cifra-label">Faltaron alguna vez</p><p class="cifra-valor">' + conFaltas.length + '</p></div>' +
      '</div>' +
      '<div class="cl-controles"><label class="solo-lector" for="cl-buscar">Buscar cliente</label><input class="campo cl-buscar" id="cl-buscar" type="search" placeholder="Buscar por nombre o WhatsApp" autocomplete="off" value="' + esc(P.clBuscar) + '">' +
        '<div class="segmentado" role="group" aria-label="Orden de la lista">' + ordenes.map(function (o) {
          return '<button type="button" data-accion="cl-orden" data-o="' + o[0] + '" data-foco="cl-orden-' + o[0] + '" aria-pressed="' + (P.clOrden === o[0]) + '">' + o[1] + '</button>';
        }).join('') + '</div></div>' +
      '<p class="vacio" id="cl-sin" hidden>No hay clientes con ese nombre o número.</p>' +
      '<ul class="cl-lista">' + lista.map(function (c, i) {
        var busca = sinAcentos(c.nombre) + ' ' + [c.tel].concat(c.anteriores).map(function (x) { return String(x).replace(/\D/g, ''); }).join(' ');
        return '<li data-busca="' + esc(busca) + '"' + (i >= MAX_CLIENTES ? ' hidden' : '') + '><button type="button" class="cl-item" data-accion="cl-ver" data-id="' + esc(c.id) + '" data-foco="cl-' + esc(c.id) + '">' +
          '<span class="cl-nombre">' + esc(c.nombre) + (c.faltas ? ' <span class="pill pill-falta">Faltó ' + (c.faltas === 1 ? '1 vez' : c.faltas + ' veces') + '</span>' : '') +
            (telInfo(c.tel).ok && numeroBloqueado(telInfo(c.tel).wa) ? ' <span class="pill pill-bloq">Bloqueado</span>' : '') + '</span>' +
          '<span class="cl-dato">N.º ' + c.num + ' · ' + (c.tel ? 'WhatsApp ' + esc(c.tel) + ' · ' : '') + plural(c.visitas, 'visita', 'visitas') + (c.ultimo ? ' · último corte ' + haceDias(c.ultimo.fecha, h) : '') + '</span>' +
          '<span class="cl-gasto">' + gs(c.gastado) + '</span></button></li>';
      }).join('') + '</ul>' +
      (lista.length > MAX_CLIENTES ? '<p class="suave" id="cl-mas">Se muestran ' + MAX_CLIENTES + ' de ' + lista.length + '. Buscá por nombre o número para encontrar al resto.</p>' : '');
  }
  var MAX_CLIENTES = 60;
  function limpiarCliente() { P.clTel = null; P.clUnir = null; P.clConfirmar = null; P.avisoCliente = ''; }
  function guardarNumeroCliente() {
    var c = IDX[P.cliente];
    if (!c || !P.clTel) return false;
    var t = telInfo(P.clTel.valor);
    if (!t.ok) { P.clTel.error = 'Escribí un celular de Paraguay, por ejemplo 0981 123 456.'; return false; }
    if (t.lindo === c.tel) { P.clTel.error = 'Ese ya es su número.'; return false; }
    var queda = cambiarNumero(c, t.lindo);
    P.cliente = String(queda);
    P.clTel = null;
    P.avisoCliente = 'Listo: el WhatsApp de ' + primerNombre(c.nombre) + ' ahora es ' + t.lindo + '.' +
      (queda !== c.num ? ' Ya había otra ficha suya con ese número y quedaron juntas en la N.º ' + queda + '.' : '');
    return true;
  }
  function unirDesdePanel() {
    var par = P.clConfirmar;
    if (!par || !IDX[par.a] || !IDX[par.b]) { P.clConfirmar = null; return; }
    var na = IDX[par.a].num, nb = IDX[par.b].num;
    var queda = unirClientes(par.a, par.b);
    P.clConfirmar = null; P.clUnir = null;
    if (P.cliente) P.cliente = String(queda);
    P.avisoCliente = 'Listo: las fichas N.º ' + Math.min(na, nb) + ' y N.º ' + Math.max(na, nb) + ' quedaron en una sola, la N.º ' + queda + '.';
  }
  function filtrarClientes() {
    var q = sinAcentos(P.clBuscar.trim());
    var qn = P.clBuscar.replace(/\D/g, '');
    var visibles = 0;
    panelEl.querySelectorAll('.cl-lista li').forEach(function (li, i) {
      var b = li.getAttribute('data-busca');
      var ok = q ? (b.indexOf(q) >= 0 || (qn.length >= 3 && b.indexOf(qn.replace(/^0/, '')) >= 0)) : i < MAX_CLIENTES;
      li.hidden = !ok;
      if (ok) visibles++;
    });
    var mas = document.getElementById('cl-mas');
    if (mas) mas.hidden = !!q;
    var sin = document.getElementById('cl-sin');
    if (sin) sin.hidden = visibles > 0;
  }
  // Un par de fichas que pueden ser la misma persona, con los botones para decidir.
  // desde: la ficha abierta (para no repetir su propio nombre como link)
  function itemRepetido(r, desde) {
    var pregunta = r.motivo === 'nombre'
      ? 'Mismo nombre y apellido, otro número. ¿Cambió de número?'
      : 'Mismo número, otro nombre. ¿Es la misma persona o reserva con el número de un familiar?';
    var ficha = function (c) {
      var txt = 'N.º ' + c.num + ' · ' + esc(c.nombre) + (c.tel ? ' · ' + esc(c.tel) : '') + ' · ' + plural(c.visitas, 'visita', 'visitas');
      return c.id === desde ? '<span class="cl-rep-ficha actual">' + txt + ' (esta ficha)</span>'
        : '<button type="button" class="cl-rep-ficha" data-accion="cl-ver" data-id="' + esc(c.id) + '" data-foco="cl-rep-' + r.par + '-' + esc(c.id) + '">' + txt + '</button>';
    };
    var abierto = P.clConfirmar && parDistinto(P.clConfirmar.a, P.clConfirmar.b) === r.par;
    return '<div class="cl-rep" role="group" aria-label="' + esc(pregunta) + '"><p class="cl-rep-t">' + esc(pregunta) + '</p>' +
      '<div class="cl-rep-par">' + ficha(r.a) + ficha(r.b) + '</div>' +
      (abierto ? confirmacionUnir(r.a.id, r.b.id)
        : '<div class="at-llegada-botones"><button type="button" class="btn btn-negro btn-mini" data-accion="cl-unir-pedir" data-a="' + esc(r.a.id) + '" data-b="' + esc(r.b.id) + '" data-foco="cl-unir-' + r.par + '">Es el mismo: unir</button>' +
          '<button type="button" class="btn btn-linea btn-mini" data-accion="cl-distintos" data-par="' + r.par + '" data-foco="cl-distintos-' + r.par + '">Son distintos</button></div>') +
      '</div>';
  }
  // El número que queda al juntar dos fichas (misma regla que unirClientes)
  function telQueQueda(ca, cb) {
    var fa = CLI.fichas[ca.id], fb = CLI.fichas[cb.id];
    var cargado = [fa, fb].filter(function (f) { return f && f.tel && f.cambioTel; }).sort(function (x, y) { return y.cambioTel - x.cambioTel; })[0];
    if (cargado) return telInfo(cargado.tel).lindo;
    var turnos = ca.turnos.concat(cb.turnos).filter(function (t) { return telInfo(t.tel).ok; }).sort(porFechaHora);
    return turnos.length ? telInfo(turnos[turnos.length - 1].tel).lindo : (ca.tel || cb.tel);
  }
  function confirmacionUnir(a, b) {
    var ca = IDX[a], cb = IDX[b];
    if (!ca || !cb) return '';
    var queda = ca.num < cb.num ? ca : cb, sale = queda === ca ? cb : ca;
    var tel = telQueQueda(ca, cb);
    return '<div class="cl-confirmar" role="group" aria-labelledby="cl-confirmar-t"><p id="cl-confirmar-t"><strong>¿Juntar las dos fichas?</strong> Queda la N.º ' + queda.num + ' con el historial de las dos (' +
        plural(queda.visitas + sale.visitas, 'visita', 'visitas') + ')' + (tel ? ' y el número ' + esc(tel) + ', el último que usó' : '') + '. La N.º ' + sale.num + ' deja de existir.</p>' +
      '<div class="at-llegada-botones"><button type="button" class="btn btn-negro btn-mini" data-accion="cl-unir-si" data-foco="cl-unir-si">Sí, unir</button>' +
      '<button type="button" class="link-btn" data-accion="cl-unir-no" data-foco="cl-unir-no">Cancelar</button></div></div>';
  }
  function resultadosUnir(c) {
    var q = sinAcentos(P.clUnir.buscar.trim()), qn = P.clUnir.buscar.replace(/\D/g, '').replace(/^0/, '');
    if (!q) return '<li class="vacio">Escribí para buscar.</li>';
    var l = Object.keys(IDX).map(function (k) { return IDX[k]; }).filter(function (x) {
      if (x.id === c.id) return false;
      var nums = [x.tel].concat(x.anteriores).join(' ').replace(/\D/g, '');
      return sinAcentos(x.nombre).indexOf(q) >= 0 || (qn.length >= 3 && nums.indexOf(qn) >= 0) || String(x.num) === q.replace(/^n\.?\s*º?\s*/, '');
    }).sort(function (a, b) { return b.visitas - a.visitas; }).slice(0, 8);
    if (!l.length) return '<li class="vacio">No encontré a nadie así.</li>';
    return l.map(function (x) {
      return '<li><button type="button" class="cl-item" data-accion="cl-unir-pedir" data-a="' + esc(c.id) + '" data-b="' + esc(x.id) + '" data-foco="cl-unir-con-' + esc(x.id) + '">' +
        '<span class="cl-nombre">' + esc(x.nombre) + '</span><span class="cl-dato">N.º ' + x.num + (x.tel ? ' · WhatsApp ' + esc(x.tel) : '') + ' · ' + plural(x.visitas, 'visita', 'visitas') + '</span><span class="cl-gasto">Elegir</span></button></li>';
    }).join('');
  }
  function plantillaFicha(c, h) {
    var hist = c.turnos.slice().reverse().slice(0, 40);
    var datos = [
      ['Cliente desde', cap(diaLargo(c.primero))],
      ['Último corte', c.ultimo ? cap(haceDias(c.ultimo.fecha, h)) + ', ' + nombreServicio(SERV[c.ultimo.servicio]) : 'Todavía no vino'],
      ['Próximo turno', c.proximo ? cap(cuandoTurno(c.proximo.fecha, c.proximo.min, false)) + ', ' + nombreServicio(SERV[c.proximo.servicio]) : 'No tiene'],
      ['Lo que más se hace', c.favorito ? c.favorito.nombre + ' (' + plural(c.favorito.veces, 'vez', 'veces') + ')' : '—']
    ];
    var tel = telInfo(c.tel);
    var herramienta = '';
    if (P.clTel) {
      herramienta = '<div class="cl-herr" role="group" aria-labelledby="cl-tel-t"><p class="cl-herr-t" id="cl-tel-t">Cambiar el número de ' + esc(primerNombre(c.nombre)) + '</p>' +
        '<label class="campo-label" for="cl-tel">Número nuevo de WhatsApp</label>' +
        '<input class="campo" id="cl-tel" type="tel" inputmode="tel" autocomplete="off" maxlength="20" placeholder="0981 123 456" data-campo="clTel.valor" value="' + esc(P.clTel.valor) + '">' +
        (P.clTel.error ? '<p class="campo-error" role="alert">' + esc(P.clTel.error) + '</p>' : '') +
        '<p class="suave cl-herr-nota">' + (c.tel ? 'El ' + esc(c.tel) + ' queda guardado como número anterior: si reserva con ese, se lo reconoce igual. ' : '') + 'Sus próximos turnos se le avisan al número nuevo.</p>' +
        '<div class="at-llegada-botones"><button type="button" class="btn btn-negro btn-mini" data-accion="cl-tel-guardar" data-foco="cl-tel-guardar">Guardar número</button>' +
        '<button type="button" class="link-btn" data-accion="cl-tel-cancelar">Cancelar</button></div></div>';
    } else if (P.clUnir) {
      herramienta = '<div class="cl-herr" role="group" aria-labelledby="cl-unir-t"><p class="cl-herr-t" id="cl-unir-t">¿Con qué ficha se junta?</p>' +
        '<p class="suave cl-herr-nota">Para cuando el mismo cliente quedó dos veces, por ejemplo porque reservó con otro número o escribió su nombre distinto.</p>' +
        '<label class="campo-label" for="cl-unir-buscar">Buscar por nombre, WhatsApp o N.º</label>' +
        '<input class="campo" id="cl-unir-buscar" type="search" autocomplete="off" value="' + esc(P.clUnir.buscar) + '">' +
        '<ul class="cl-lista cl-unir-res" id="cl-unir-res">' + resultadosUnir(c) + '</ul>' +
        '<div class="at-llegada-botones"><button type="button" class="link-btn" data-accion="cl-unir-cancelar">Cancelar</button></div></div>';
    }
    var confirmar = P.clConfirmar && (P.clConfirmar.a === c.id || P.clConfirmar.b === c.id) && !REP.some(function (r) { return r.par === parDistinto(P.clConfirmar.a, P.clConfirmar.b); })
      ? confirmacionUnir(P.clConfirmar.a, P.clConfirmar.b) : '';
    var reps = repetidosDe(c);
    var bloq = tel.ok ? numeroBloqueado(tel.wa) : null;
    var usanNumero = tel.ok ? Object.keys(IDX).filter(function (k) { return telInfo(IDX[k].tel).wa === tel.wa; }).length : 0;
    return '<button type="button" class="link-btn cl-volver" data-accion="cl-volver" data-foco="cl-volver">← Todos los clientes</button>' +
      (P.avisoCliente ? '<p class="aviso-ok" role="status">' + esc(P.avisoCliente) + '</p>' : '') +
      '<div class="cl-ficha-cab"><div><p class="cl-num">Cliente N.º ' + c.num + '</p><h2 class="cl-ficha-nombre" id="cl-ficha-t" tabindex="-1">' + esc(c.nombre) + '</h2>' +
        '<p class="suave" style="margin:6px 0 0">' + (c.tel ? 'WhatsApp ' + esc(c.tel) : 'Sin WhatsApp') + '</p>' +
        (c.anteriores.length ? '<p class="suave cl-anteriores">Números anteriores: ' + esc(c.anteriores.join(', ')) + '</p>' : '') + '</div>' +
        '<div class="cl-ficha-botones">' +
          (tel.ok && !c.ejemplo ? '<a class="btn btn-linea btn-mini" ' + atributosWa(tel.wa, 'Hola ' + primerNombre(c.nombre) + ', te escribimos de ' + NEGOCIO + '.') + '>' + ICONOS.chat + 'Escribirle</a>' : '') +
          '<button type="button" class="btn btn-linea btn-mini" data-accion="cl-tel-abrir" data-foco="cl-tel-abrir"' + (P.clTel ? ' aria-expanded="true"' : ' aria-expanded="false"') + '>' + (c.tel ? 'Cambiar número' : 'Cargar número') + '</button>' +
          '<button type="button" class="btn btn-linea btn-mini" data-accion="cl-unir-abrir" data-foco="cl-unir-abrir"' + (P.clUnir ? ' aria-expanded="true"' : ' aria-expanded="false"') + '>Unir con otra ficha</button>' +
          (tel.ok ? (bloq
            ? '<button type="button" class="btn btn-linea btn-mini" data-accion="cl-desbloquear" data-id="' + esc(tel.wa) + '" data-foco="cl-desbloquear">Desbloquear número</button>'
            : '<button type="button" class="btn btn-linea btn-mini btn-peligro" data-accion="cl-bloquear" data-id="' + esc(tel.wa) + '" data-foco="cl-bloquear">Bloquear reservas web</button>') : '') +
        '</div>' +
      '</div>' +
      (bloq ? '<p class="hz-alerta cl-bloq">El ' + esc(tel.lindo) + ' está bloqueado ' + esc(cuandoFue(bloq.en)) + (bloq.motivo ? ' (' + esc(bloq.motivo) + ')' : '') +
        ': no puede reservar por la web' + (usanNumero > 1 ? ', ni las otras ' + (usanNumero - 1 === 1 ? 'persona que reserva' : (usanNumero - 1) + ' personas que reservan') + ' con ese número' : '') +
        '. Si viene al local, lo anotás igual desde Atender.</p>' : '') +
      herramienta + confirmar +
      reps.map(function (r) { return itemRepetido(r, c.id); }).join('') +
      (c.faltas >= 2 ? '<p class="hz-alerta">Faltó ' + c.faltas + ' veces sin avisar. Conviene confirmarle el turno el día anterior.</p>' : '') +
      '<div class="cifras" style="margin-top:20px">' +
        '<div class="cifra"><p class="cifra-label">Visitas</p><p class="cifra-valor">' + c.visitas + '</p></div>' +
        '<div class="cifra"><p class="cifra-label">Gastó en total</p><p class="cifra-valor">' + abrev(c.gastado) + '</p></div>' +
        '<div class="cifra"><p class="cifra-label">No vino</p><p class="cifra-valor">' + c.faltas + '</p></div>' +
        '<div class="cifra"><p class="cifra-label">Canceló</p><p class="cifra-valor">' + c.cancela + '</p></div>' +
      '</div>' +
      '<dl class="cl-datos">' + datos.map(function (d) { return '<div><dt>' + d[0] + '</dt><dd>' + esc(d[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<h3 class="pa-h3" style="margin-top:32px">Historial</h3>' +
      '<ul class="cl-hist">' + hist.map(function (t) {
        var ev = estadoVisible(t, h);
        return '<li><span class="cl-hist-fecha">' + DIAS_C[diaSemana(t.fecha)] + ' ' + fechaDe(t.fecha).getUTCDate() + ' ' + MESES[fechaDe(t.fecha).getUTCMonth()].slice(0, 3) + ', ' + hhmm(t.min) + '</span>' +
          '<span class="cl-hist-serv">' + esc(nombreServicio(SERV[t.servicio])) + '</span><span class="cl-hist-precio">' + gs(t.precio) + '</span>' +
          '<span class="pill pill-' + ev + '">' + NOMBRE_ESTADO[ev] + '</span></li>';
      }).join('') + '</ul>';
  }

  /* ----- Reportes ----- */
  var PERIODOS_REP = { '4s': ['Últimas 4 semanas', 28], '3m': ['Últimos 3 meses', 91], '6m': ['Últimos 6 meses', 182] };
  function movimientosDia(clave, h) {
    var guardados = D.mov.filter(function (m) { return m.fecha === clave; });
    if (guardados.length || clave >= h.clave) return guardados;
    return diasEntre(clave, h.clave) <= DIAS_HISTORIAL ? cajaEjemploDia(clave) : [];
  }
  function plantillaReportes(h) {
    var dias = PERIODOS_REP[P.repPeriodo][1];
    var desde = sumarDias(h.clave, -dias);
    var turnos = historialHasta(h).concat(todosLosTurnos()).filter(function (t) { return t.fecha >= desde && t.fecha <= h.clave; });
    var hechos = turnos.filter(function (t) { return t.estado === 'atendido'; });

    // Días y horas
    var horas = [];
    for (var hr = 8; hr <= 17; hr++) horas.push(hr);
    var mapa = {}, porDia = {}, diasConAtencion = {};
    hechos.forEach(function (t) {
      var wd = diaSemana(t.fecha), hh = Math.floor(t.min / 60);
      mapa[wd + '-' + hh] = (mapa[wd + '-' + hh] || 0) + 1;
      porDia[wd] = (porDia[wd] || 0) + 1;
    });
    for (var k = 0; k <= dias; k++) { var c = sumarDias(desde, k); if (c <= h.clave && HORAS[diaSemana(c)].length) diasConAtencion[diaSemana(c)] = (diasConAtencion[diaSemana(c)] || 0) + 1; }
    var maxCelda = Math.max.apply(null, [1].concat(Object.keys(mapa).map(function (x) { return mapa[x]; })));
    // La casilla más llena, para explicar cómo se lee el mapa con un dato real
    var ejemplo = Object.keys(mapa).sort(function (a, b) { return mapa[b] - mapa[a]; }).map(function (k) { var p = k.split('-'); return { wd: +p[0], hr: +p[1], n: mapa[k] }; })[0];
    var porHora = {};
    hechos.forEach(function (t) { var hh = Math.floor(t.min / 60); porHora[hh] = (porHora[hh] || 0) + 1; });
    var mejorDia = [1, 2, 3, 4, 5, 6].sort(function (a, b) { return (porDia[b] || 0) / (diasConAtencion[b] || 1) - (porDia[a] || 0) / (diasConAtencion[a] || 1); })[0];
    var mejorHora = horas.slice().sort(function (a, b) { return (porHora[b] || 0) - (porHora[a] || 0); })[0];
    var promedio = Math.round((porDia[mejorDia] || 0) / (diasConAtencion[mejorDia] || 1) * 10) / 10;
    var tabla = '<div class="rep-mapa-scroll"><table class="rep-mapa"><caption class="solo-lector">Clientes atendidos por día y hora</caption><thead><tr><th scope="col"><span class="solo-lector">Día</span></th>' +
      horas.map(function (x) { return '<th scope="col">' + pad(x) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      [1, 2, 3, 4, 5, 6].map(function (wd) {
        return '<tr><th scope="row">' + DIAS_C[wd] + '</th>' + horas.map(function (x) {
          var n = mapa[wd + '-' + x] || 0;
          var nivel = n === 0 ? 0 : Math.min(4, Math.ceil(n / maxCelda * 4));
          return '<td class="n' + nivel + '" title="' + cap(DIAS[wd]) + ' de ' + pad(x) + ':00 a ' + pad(x + 1) + ':00: ' + plural(n, 'cliente', 'clientes') + '">' + (n || '') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';

    // Ganancia mes a mes (últimos 6 meses)
    var meses = [];
    for (var i = 5; i >= 0; i--) {
      var y = h.y, mo = h.mo - i;
      while (mo < 1) { mo += 12; y--; }
      meses.push({ y: y, mo: mo, ent: 0, sal: 0 });
    }
    var inicio = claveDe(meses[0].y, meses[0].mo, 1);
    for (var c2 = inicio; c2 <= h.clave; c2 = sumarDias(c2, 1)) {
      var f2 = fechaDe(c2);
      var mes = meses.find(function (m) { return m.y === f2.getUTCFullYear() && m.mo === f2.getUTCMonth() + 1; });
      movimientosDia(c2, h).forEach(function (m) { if (m.tipo === 'entrada') mes.ent += m.monto; else mes.sal += m.monto; });
    }
    var maxGan = Math.max.apply(null, [1].concat(meses.map(function (m) { return Math.abs(m.ent - m.sal); })));
    var ganancia = '<div class="rep-meses">' + meses.map(function (m, idx) {
      var g = m.ent - m.sal;
      var actual = idx === meses.length - 1;
      return '<div class="rep-mes' + (actual ? ' actual' : '') + '"><p class="rep-mes-nombre">' + cap(MESES[m.mo - 1]) + (actual ? ' <span class="suave">(hasta hoy)</span>' : '') + '</p>' +
        '<div class="rep-mes-barra"><span style="width:' + Math.max(2, Math.round(Math.abs(g) / maxGan * 100)) + '%"' + (g < 0 ? ' class="negativa"' : '') + '></span></div>' +
        '<p class="rep-mes-valor">' + (g < 0 ? '− ' : '') + gs(Math.abs(g)) + '</p>' +
        '<p class="rep-mes-detalle">Entró ' + gs(m.ent) + ' · salió ' + gs(m.sal) + '</p></div>';
    }).join('') + '</div>';

    // Faltas y cancelaciones (turnos reservados, sin contar a los que llegaron sin turno)
    var reservados = turnos.filter(function (t) { return !t.sinTurno && (t.estado !== 'confirmado'); });
    var faltas = reservados.filter(function (t) { return t.estado === 'novino'; }).length;
    var canCli = reservados.filter(function (t) { return t.estado === 'cancelado' && t.canceladoPor === 'cliente'; }).length;
    var canBar = reservados.filter(function (t) { return t.estado === 'cancelado' && t.canceladoPor !== 'cliente'; }).length;
    var pct = function (n) { return reservados.length ? Math.round(n / reservados.length * 100) : 0; };
    var faltadores = Object.keys(IDX).map(function (k) { return IDX[k]; }).filter(function (c) { return c.faltas > 0; })
      .sort(function (a, b) { return b.faltas - a.faltas; }).slice(0, 5);

    // Por barbero (cuando hay o hubo más de uno)
    var porBarbero = BARB.barberos.map(function (b) {
      var suyos = turnos.filter(function (t) { return t.barbero === b.id; });
      var hs = suyos.filter(function (t) { return t.estado === 'atendido'; });
      return { b: b, n: hs.length, cobrado: hs.reduce(function (a, t) { return a + t.precio; }, 0), faltas: suyos.filter(function (t) { return t.estado === 'novino'; }).length };
    }).filter(function (x) { return x.b.activo || x.n; });
    var seccionBarberos = porBarbero.length > 1 ? '<section class="rep-seccion" aria-labelledby="rep-bb-t"><h2 class="pa-h3" id="rep-bb-t">Por barbero</h2>' +
      '<div class="rep-mapa-scroll"><table class="rep-tabla"><caption class="solo-lector">Clientes y cobros por barbero</caption><thead><tr><th scope="col">Barbero</th><th scope="col">Clientes atendidos</th><th scope="col">Cobrado en servicios</th><th scope="col">No vinieron</th></tr></thead><tbody>' +
      porBarbero.map(function (x) {
        return '<tr><th scope="row">' + esc(x.b.nombre) + (x.b.activo ? '' : ' <span class="suave">(ya no trabaja)</span>') + '</th><td>' + x.n + '</td><td>' + gs(x.cobrado) + '</td><td>' + x.faltas + '</td></tr>';
      }).join('') + '</tbody></table></div></section>' : '';

    var periodos = Object.keys(PERIODOS_REP).map(function (k) {
      return '<button type="button" data-accion="rep-periodo" data-p="' + k + '" data-foco="rep-' + k + '" aria-pressed="' + (P.repPeriodo === k) + '">' + PERIODOS_REP[k][0] + '</button>';
    }).join('');
    return '<div class="segmentado" role="group" aria-label="Período del reporte">' + periodos + '</div>' +
      '<section class="rep-seccion" aria-labelledby="rep-mapa-t"><h2 class="pa-h3" id="rep-mapa-t">Días y horas con más clientes</h2>' +
        '<p class="rep-resumen">El día con más clientes es el <strong>' + DIAS[mejorDia] + '</strong>, con ' + String(promedio).replace('.', ',') + ' por día en promedio. La hora con más movimiento es de <strong>' + pad(mejorHora) + ':00 a ' + pad(mejorHora + 1) + ':00</strong>. ' +
        'Cada casilla cuenta los clientes atendidos en esa hora (' + PERIODOS_REP[P.repPeriodo][0].toLowerCase() + ').</p>' + tabla +
        '<div class="rep-leyenda" aria-hidden="true"><span>Menos clientes</span><span class="rep-ley n1"></span><span class="rep-ley n2"></span><span class="rep-ley n3"></span><span class="rep-ley n4"></span><span>Más clientes</span>' +
          '<span class="rep-ley-sep"></span><span class="rep-ley n0"></span><span>Cerrado o sin clientes</span></div>' +
        '<p class="suave rep-como">Cómo se lee: las filas son los días y las columnas, la hora en que empieza el turno («09» es de 09:00 a 10:00). ' +
          (ejemplo ? 'Por ejemplo, el ' + ejemplo.n + ' de la fila ' + DIAS_C[ejemplo.wd] + ' y la columna ' + pad(ejemplo.hr) + ' quiere decir que en los ' + PERIODOS_REP[P.repPeriodo][0].toLowerCase() +
            ' se atendió a ' + ejemplo.n + ' clientes los ' + DIAS[ejemplo.wd] + (/s$/.test(DIAS[ejemplo.wd]) ? '' : 's') + ' de ' + pad(ejemplo.hr) + ':00 a ' + pad(ejemplo.hr + 1) + ':00. ' : '') +
          'Sirve para ver cuándo conviene tener otro barbero y en qué horas tranquilas hacer trámites o promociones.</p>' +
      '</section>' +
      '<section class="rep-seccion" aria-labelledby="rep-gan-t"><h2 class="pa-h3" id="rep-gan-t">Ganancia mes a mes</h2>' +
        '<p class="rep-resumen">Lo que entró menos lo que salió de la caja en cada mes (servicios, ventas, compras y gastos).</p>' + ganancia +
      '</section>' +
      '<section class="rep-seccion" aria-labelledby="rep-faltas-t"><h2 class="pa-h3" id="rep-faltas-t">Faltas y cancelaciones</h2>' +
        '<div class="cifras">' +
          '<div class="cifra"><p class="cifra-label">Turnos reservados</p><p class="cifra-valor">' + reservados.length + '</p><p class="cifra-nota">' + PERIODOS_REP[P.repPeriodo][0] + '</p></div>' +
          '<div class="cifra"><p class="cifra-label">No vinieron</p><p class="cifra-valor">' + pct(faltas) + ' %</p><p class="cifra-nota">' + plural(faltas, 'turno', 'turnos') + '</p></div>' +
          '<div class="cifra"><p class="cifra-label">Cancelados por el cliente</p><p class="cifra-valor">' + pct(canCli) + ' %</p><p class="cifra-nota">' + plural(canCli, 'turno', 'turnos') + '</p></div>' +
          '<div class="cifra"><p class="cifra-label">Cancelados por la barbería</p><p class="cifra-valor">' + pct(canBar) + ' %</p><p class="cifra-nota">' + plural(canBar, 'turno', 'turnos') + '</p></div>' +
        '</div>' +
        (faltadores.length ? '<h3 class="rep-sub">Los que más faltan</h3><ul class="cl-lista">' + faltadores.map(function (c) {
          return '<li><button type="button" class="cl-item" data-accion="cl-ver" data-id="' + esc(c.id) + '" data-foco="rep-cl-' + esc(c.id) + '"><span class="cl-nombre">' + esc(c.nombre) + ' <span class="pill pill-falta">Faltó ' + (c.faltas === 1 ? '1 vez' : c.faltas + ' veces') + '</span></span>' +
            '<span class="cl-dato">' + plural(c.visitas, 'visita', 'visitas') + ' en 6 meses</span><span class="cl-gasto">Ver ficha</span></button></li>';
        }).join('') + '</ul>' : '') +
      '</section>' + seccionBarberos;
  }

  // Con la base de datos: usuario y contraseña
  function plantillaIngreso() {
    var L = P.login;
    if (PANEL.cargando) {
      return '<div class="pa-acceso muro"><div class="pa-acceso-caja"><span class="logo logo-140" role="img" aria-label="Logo de Tommy Barber"></span>' +
        '<h1 class="pa-acceso-titulo">Panel</h1><p role="status">Cargando…</p></div></div>';
    }
    return '<div class="pa-acceso muro"><div class="pa-acceso-caja">' +
      '<span class="logo logo-140" role="img" aria-label="Logo de Tommy Barber"></span>' +
      '<h1 class="pa-acceso-titulo">Panel</h1>' +
      '<p>Ingresá con tu usuario y tu contraseña.</p>' +
      '<form class="pa-login" id="pa-login" novalidate>' +
        '<label for="pa-usuario">Usuario</label>' +
        '<input class="campo" id="pa-usuario" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="30" required value="' + esc(L.usuario) + '">' +
        '<label for="pa-clave">Contraseña</label>' +
        '<input class="campo" id="pa-clave" name="password" type="password" autocomplete="current-password" maxlength="128" required>' +
        '<p class="pa-pin-msg" id="pa-login-msg" role="alert">' + esc(L.error) + '</p>' +
        '<button type="submit" class="btn btn-rojo" id="pa-ingresar" data-foco="pa-ingresar"' + (L.enviando ? ' disabled' : '') + '>' + (L.enviando ? 'Ingresando…' : 'Ingresar') + '</button>' +
      '</form>' +
      '<a class="pa-volver" href="/">Volver al sitio</a>' +
    '</div></div>';
  }
  function plantillaAcceso() {
    if (REMOTO) return plantillaIngreso();
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
      IDX = indiceClientes(h);
      REP = posiblesRepetidos(IDX);
      var vistas = esBarbero() ? VISTAS_BARBERO : ['atender', 'hoy', 'turnos', 'caja', 'stock', 'precios', 'horario', 'barberos', 'clientes', 'reportes', 'fotos'];
      if (vistas.indexOf(P.vista) < 0) P.vista = vistas[0];
      var nav = vistas.map(function (k) {
        return '<button type="button" data-accion="vista" data-v="' + k + '" data-foco="v-' + k + '"' + (P.vista === k ? ' aria-current="page"' : '') + '>' + ICONOS[k] + TITULOS[k] + '</button>';
      }).join('');
      var plantillas = { atender: plantillaAtender, hoy: plantillaHoy, turnos: plantillaTurnos, caja: plantillaCaja, stock: plantillaStock, precios: plantillaPrecios,
        horario: plantillaHorario, barberos: plantillaBarberos, clientes: plantillaClientes, reportes: plantillaReportes, fotos: plantillaFotos };
      var cuerpo = (P.miClave ? plantillaMiClave() : '') + (P.prueba ? plantillaPrueba() : '') + avisoConexion() + (plantillas[P.vista] || plantillaHoy)(h);
      cont.innerHTML = '<div class="pa">' +
        '<aside class="pa-aside"><div class="pa-marca"><span class="logo logo-56" aria-hidden="true"></span><div><p class="pa-marca-nombre condensada">Tommy Barber</p><p class="pa-marca-sub">' + (esBarbero() ? 'Panel de ' + esc(PANEL.yo.nombre) : 'Panel del dueño') + '</p></div></div>' +
          '<nav class="pa-nav" aria-label="Secciones del panel">' + nav + '</nav>' +
          '<div class="pa-aside-pie"><a href="' + (REMOTO ? '/' : '#inicio') + '">Ver el sitio</a><button type="button" data-accion="salir">Salir</button>' +
            (REMOTO ? '<button type="button" data-accion="mi-clave" data-foco="mi-clave">Cambiar mi contraseña</button>' +
              (esBarbero() ? '' : '<button type="button" data-accion="prueba-abrir" data-foco="prueba-abrir">Datos de prueba</button>') : P.reiniciando
              ? '<div class="pa-reinicio" role="group" aria-labelledby="pa-reinicio-t"><p id="pa-reinicio-t">Vuelven los datos de ejemplo de la agenda, la caja y el stock, y se deshacen los cambios de número, las fichas unidas y los números bloqueados. Los servicios, los barberos, las fotos, los cambios de horario y los turnos reservados en el sitio no se tocan.</p>' +
                '<div class="pa-reinicio-botones"><button type="button" class="btn btn-claro btn-mini" data-accion="reiniciar-si" data-foco="reiniciar-si">Reiniciar</button><button type="button" data-accion="reiniciar-no" data-foco="reiniciar">Cancelar</button></div></div>'
              : '<button type="button" data-accion="reiniciar" data-foco="reiniciar">Reiniciar datos de ejemplo</button>') +
          '</div></aside>' +
        '<main class="pa-main" id="pa-main">' +
          '<div class="pa-cabecera"><div><p class="pa-fecha">' + cap(DIAS[h.wd]) + ' ' + h.d + ' de ' + MESES[h.mo - 1] + '</p><h1 class="pa-titulo" id="pa-titulo" tabindex="-1">' + TITULOS[P.vista] + '</h1></div>' +
          '<p class="pa-estado"><span class="pa-poste' + (est.abierto ? ' abierto' : '') + '" id="pa-poste" aria-hidden="true"></span><span id="pa-estado-txt">' + est.corto + '</span></p></div>' +
          cuerpo +
        '</main></div>';
    }
    if (P.acceso && P.vista === 'clientes' && !P.cliente && P.clBuscar) filtrarClientes();
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
    var mov = registrarCaja({ tipo: 'entrada', cat: 'servicio', concepto: nombreServicio(s) + ', ' + t.cliente, monto: t.precio, medio: medio, turno: t.id });
    guardarTurno(t);
    guardarDatos();
    P.abierto = null;
    return mov;
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
        P.acceso = true; P.pin = ''; P.vista = location.hash === '#atender' ? 'atender' : 'hoy';
        renderPanel();
        window.scrollTo(0, 0);
        var t = document.getElementById('pa-titulo');
        if (t) t.focus({ preventScroll: true });
        atAlFrente();
        return;
      }
      P.pin = '';
      P.pinError = true;
    }
    renderPanel('t-' + k);
  }

  function actualizarFormularios() {
    if (P.vista === 'barberos' && P.bb) {
      var fb = validarBarbero();
      var gb = document.getElementById('bb-guardar');
      if (gb) gb.disabled = !!fb;
      var tb = document.getElementById('bb-falta');
      if (tb) tb.textContent = P.bb.nombre ? fb : '';
    }
    if (P.vista === 'precios' && P.sv) {
      var fs = validarServicio();
      var gsb = document.getElementById('sv-guardar');
      if (gsb) gsb.disabled = !!fs;
      var ts = document.getElementById('sv-falta');
      if (ts) ts.textContent = P.sv.nombre || P.sv.precio ? fs : '';
    }
    if (P.vista === 'horario') {
      var fh = validarBloqueo();
      var bh = document.getElementById('hz-guardar');
      if (bh) bh.disabled = !!fh;
      var th = document.getElementById('hz-falta');
      if (th) th.textContent = P.hz.fecha ? fh : '';
      var ah = document.getElementById('hz-afectados');
      if (ah) ah.innerHTML = textoAfectados(afectadosPrevios());
    }
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
    P.preview = { tel: telInfo(t.tel).lindo || t.tel, texto: msjDe(t, tipo), volverA: volverA };
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
      P.atVer = null; P.llegada = null; P.deshacer = null; P.avisoHorario = ''; P.cliente = null; limpiarCliente();
      P.bb = null; P.bbQuitar = null; P.avisoBarberos = ''; P.sv = null; P.svQuitar = null; P.avisoFotos = ''; P.ftError = '';
      P.cuenta = null; P.avisoCuenta = '';
      if (REMOTO && P.vista === 'barberos') cargarCuentas();
      renderPanel('v-' + P.vista);
      var main = document.getElementById('pa-main');
      if (main && main.getBoundingClientRect().top < 0) main.scrollIntoView({ block: 'start' });
      atAlFrente();
      return;
    }
    if (a === 'salir' && REMOTO) { salirDelPanel(); return; }
    if (a === 'prueba-abrir') { P.prueba = P.prueba ? null : { confirmar: false, enviando: '' }; renderPanel(P.prueba ? 'pb-t' : 'prueba-abrir'); return; }
    if (a === 'prueba-cerrar') { P.prueba = null; renderPanel('prueba-abrir'); return; }
    if (a === 'prueba-cargar') { cargarPrueba(); return; }
    if (a === 'prueba-borrar') { P.prueba.confirmar = true; renderPanel('pb-borrar-no'); return; }
    if (a === 'prueba-borrar-no') { P.prueba.confirmar = false; renderPanel('prueba-borrar'); return; }
    if (a === 'prueba-borrar-si') { borrarTodo(); return; }
    if (a === 'aviso-cerrar') { PANEL.aviso = ''; renderPanel('pa-titulo'); return; }
    if (a === 'mi-clave') { P.miClave = P.miClave ? null : { actual: '', nueva: '', repetir: '', error: '' }; renderPanel(P.miClave ? 'mc-actual' : 'mi-clave'); return; }
    if (a === 'mi-clave-cancelar') { P.miClave = null; renderPanel('mi-clave'); return; }
    if (a === 'cuenta-abrir') { P.cuenta = { barbero: id, modo: b.getAttribute('data-modo'), usuario: '', clave: '', error: '' }; P.avisoCuenta = ''; renderPanel(P.cuenta.modo === 'nueva' ? 'ct-usuario' : 'ct-clave'); return; }
    if (a === 'cuenta-cancelar') { P.cuenta = null; renderPanel('bb-n-' + id); return; }
    if (a === 'cuenta-quitar') { quitarCuenta(+id); return; }
    if (a === 'salir') { P.acceso = false; P.pin = ''; P.pinError = false; P.reiniciando = false; renderPanel(); window.scrollTo(0, 0); return; }
    if (a === 'reiniciar') { P.reiniciando = true; renderPanel('reiniciar-si'); return; }
    if (a === 'reiniciar-no') { P.reiniciando = false; renderPanel('reiniciar'); return; }
    if (a === 'reiniciar-si') {
      D = datosNuevos(ahoraPY());
      guardarDatos();
      CLI = registroVacio();
      guardarRegistro();
      P.cliente = null; limpiarCliente();
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
    if (a === 'cancelar-falso') {
      t = buscarTurno(id);
      if (t && t.estado === 'confirmado' && !empezo(t, ahoraPY())) {
        cancelarFalso(t);
        bloquearNumero(telInfo(t.tel).wa, 'Turno falso a nombre de ' + t.cliente + ', ' + DIAS_C[diaSemana(t.fecha)] + ' ' + fechaDe(t.fecha).getUTCDate() + ' ' + hhmm(t.min));
        P.abierto = { id: id, que: 'falso' };
      } else P.abierto = null;
      renderPanel(['cancelar-falsos-' + id, 'cerrar-' + id]);
      renderHeroTurno(); renderReserva();
      return;
    }
    if (a === 'cancelar-falsos') {
      t = buscarTurno(id);
      if (t) otrosPendientesDe(t).forEach(cancelarFalso);
      P.abierto = null;
      renderPanel('v-' + P.vista);
      renderHeroTurno(); renderReserva();
      return;
    }
    if (a === 'cl-bloquear') { bloquearNumero(id, 'Bloqueado desde la ficha'); P.avisoCliente = 'Bloqueaste el ' + telInfo(id).lindo + ': ya no puede reservar por la web.'; renderPanel('cl-desbloquear'); return; }
    if (a === 'cl-desbloquear') { desbloquearNumero(id); P.avisoCliente = 'Desbloqueaste el ' + telInfo(id).lindo + ': puede volver a reservar por la web.'; renderPanel(['cl-bloquear', 'cl-buscar']); return; }
    if (a === 'at-barbero') {
      P.atBarbero = id; P.atVer = null; P.llegada = null; P.deshacer = null;
      guardarJSON(CLAVE_ATENDER, { barbero: id });
      renderPanel('at-b-' + id); return;
    }
    if (a === 'bb-nuevo') { P.bb = bbForm(null); P.bbQuitar = null; P.avisoBarberos = ''; renderPanel('bb-nombre'); return; }
    if (a === 'bb-editar') { P.bb = bbForm(barberoPorId(id)); P.bbQuitar = null; P.avisoBarberos = ''; renderPanel('bb-nombre'); return; }
    if (a === 'bb-cancelar') { var bbId = P.bb && P.bb.id; P.bb = null; renderPanel(bbId ? 'bb-editar-' + bbId : 'bb-nuevo'); return; }
    if (a === 'bb-guardar') { var guardado = guardarBarbero(); if (guardado) renderPanel(guardado === 'nuevo' ? 'bb-nuevo' : 'bb-n-' + guardado); return; }
    if (a === 'bb-quitar') { P.bbQuitar = { id: id, destino: '', noEntran: [] }; P.bb = null; P.avisoBarberos = ''; renderPanel(['bb-pasar', 'bb-quitar-si']); return; }
    if (a === 'bb-quitar-no') { P.bbQuitar = null; renderPanel('bb-quitar-' + id); return; }
    if (a === 'bb-pasar') { pasarTurnos(id, P.bbQuitar.destino); renderPanel(['bb-quitar-si', 'bb-pasar']); return; }
    if (a === 'bb-quitar-si') { quitarBarbero(id); renderPanel('bb-nuevo'); return; }
    if (a === 'sv-nuevo') { P.sv = svVacio(); P.svQuitar = null; P.avisoPrecios = ''; renderPanel('sv-nombre'); return; }
    if (a === 'sv-editar') {
      var se = SERV[id];
      P.sv = { id: id, grupo: se.grupo, nombre: se.nombre, incluye: se.incluye || '', precio: String(se.precio), min: String(se.min), error: '' };
      P.svQuitar = null; P.avisoPrecios = '';
      renderPanel('sv-nombre'); return;
    }
    if (a === 'sv-grupo') { P.sv.grupo = b.getAttribute('data-g'); renderPanel('sv-grupo-' + P.sv.grupo); return; }
    if (a === 'sv-cancelar') { var svId = P.sv && P.sv.id; P.sv = null; renderPanel(svId ? 'sv-editar-' + svId : 'sv-nuevo'); return; }
    if (a === 'sv-guardar') { if (guardarServicio()) renderPanel('pa-titulo'); return; }
    if (a === 'sv-quitar') { P.svQuitar = id; P.sv = null; P.avisoPrecios = ''; renderPanel('sv-quitar-si'); return; }
    if (a === 'sv-quitar-no') { P.svQuitar = null; renderPanel('sv-quitar-' + id); return; }
    if (a === 'sv-quitar-si') { ofrecerServicio(id, false); renderPanel('pa-titulo'); return; }
    if (a === 'sv-volver') { ofrecerServicio(id, true); renderPanel('pa-titulo'); return; }
    if (a === 'ft-original') {
      if (id === 'logo') FOTOS.logo = null; else if (id === 'fachada') FOTOS.fachada = null; else FOTOS.galeria = null;
      guardarFotos(); aplicarFotos();
      P.ftError = '';
      P.avisoFotos = id === 'logo' ? 'Volvió el logo original.' : id === 'fachada' ? 'Volvió la foto original del local.' : 'Volvieron las fotos de cortes originales.';
      renderPanel('pa-titulo'); return;
    }
    if (a === 'ft-mover') {
      var iMov = +b.getAttribute('data-i'), paso = +b.getAttribute('data-paso');
      moverFotoGaleria(iMov, paso);
      P.avisoFotos = ''; P.ftError = '';
      renderPanel([(paso < 0 ? 'ft-subir-' : 'ft-bajar-') + (iMov + paso), 'ft-gal-t']); return;
    }
    if (a === 'ft-quitar') { quitarFotoGaleria(+b.getAttribute('data-i')); P.ftError = ''; renderPanel(['ft-quitar-' + b.getAttribute('data-i'), 'ft-gal-t']); return; }
    if (a === 'recordar' || a === 'avisar' || a === 'llamar') {
      t = buscarTurno(id);
      if (!t) return;
      if (a === 'recordar') t.recordadoEn = Date.now(); else if (a === 'llamar') t.llamadoEn = Date.now(); else t.avisadoEn = Date.now();
      if (a === 'avisar' && P.abierto && P.abierto.id === id) P.abierto = null;
      guardarTurno(t);
      var focoWa = b.getAttribute('data-foco');
      if (t.ejemplo) { renderPanel(); abrirPreview(t, a, focoWa); }
      else setTimeout(function () { renderPanel(focoWa); }, 300); // deja que se abra WhatsApp antes de redibujar
      return;
    }
    if (a === 'hz-tipo') { P.hz = Object.assign(hzVacio(b.getAttribute('data-t')), { fecha: P.hz.fecha, motivo: P.hz.motivo, barbero: P.hz.barbero }); P.avisoHorario = ''; renderPanel('hz-tipo-' + P.hz.tipo); return; }
    if (a === 'hz-guardar') { if (guardarBloqueo()) renderPanel('pa-titulo'); return; }
    if (a === 'hz-quitar') { quitarBloqueo(id); renderPanel('pa-titulo'); return; }
    if (a === 'cl-ver') { P.vista = 'clientes'; P.cliente = id; limpiarCliente(); renderPanel('cl-ficha-t'); var m2 = document.getElementById('pa-main'); if (m2 && m2.getBoundingClientRect().top < 0) m2.scrollIntoView({ block: 'start' }); return; }
    if (a === 'cl-volver') { var antes = P.cliente; P.cliente = null; limpiarCliente(); renderPanel('cl-' + antes); return; }
    if (a === 'cl-tel-abrir') { limpiarCliente(); P.clTel = { valor: '', error: '' }; renderPanel('cl-tel'); return; }
    if (a === 'cl-tel-cancelar') { P.clTel = null; renderPanel('cl-tel-abrir'); return; }
    if (a === 'cl-tel-guardar') { renderPanel(guardarNumeroCliente() ? 'cl-ficha-t' : 'cl-tel'); return; }
    if (a === 'cl-unir-abrir') { limpiarCliente(); P.clUnir = { buscar: '' }; renderPanel('cl-unir-buscar'); return; }
    if (a === 'cl-unir-cancelar') { P.clUnir = null; P.clConfirmar = null; renderPanel('cl-unir-abrir'); return; }
    if (a === 'cl-unir-pedir') { P.avisoCliente = ''; P.clConfirmar = { a: b.getAttribute('data-a'), b: b.getAttribute('data-b') }; renderPanel('cl-unir-si'); return; }
    if (a === 'cl-unir-no') {
      var parNo = P.clConfirmar ? parDistinto(P.clConfirmar.a, P.clConfirmar.b) : '';
      P.clConfirmar = null; renderPanel(['cl-unir-' + parNo, 'cl-unir-buscar', 'cl-ficha-t']); return;
    }
    if (a === 'cl-unir-si') { unirDesdePanel(); renderPanel(P.cliente ? 'cl-ficha-t' : 'cl-reps-t'); return; }
    if (a === 'cl-distintos') {
      var parSi = b.getAttribute('data-par');
      if (CLI.distintos.indexOf(parSi) < 0) CLI.distintos.push(parSi);
      if (REMOTO) opCliente('POST', '/api/panel/clientes/distintos', { a: +parSi.split('-')[0], b: +parSi.split('-')[1] });
      guardarRegistro();
      P.clConfirmar = null;
      P.avisoCliente = 'Listo: las fichas N.º ' + parSi.replace('-', ' y N.º ') + ' quedan como clientes distintos.';
      renderPanel(P.cliente ? 'cl-ficha-t' : 'cl-buscar'); return;
    }
    if (a === 'cl-orden') { P.clOrden = b.getAttribute('data-o'); renderPanel('cl-orden-' + P.clOrden); return; }
    if (a === 'rep-periodo') { P.repPeriodo = b.getAttribute('data-p'); renderPanel('rep-' + P.repPeriodo); return; }
    if (a === 'at-sig') { atMover(1); renderPanel('at-card'); return; }
    if (a === 'at-ant') { atMover(-1); renderPanel('at-card'); return; }
    if (a === 'at-actual') { P.atVer = null; renderPanel('at-card'); return; }
    if (a === 'at-ir') { P.atVer = id; atMover(0); renderPanel('at-card'); return; }
    if (a === 'at-cobrar') { atCobrar(id, b.getAttribute('data-medio')); renderPanel('at-card'); return; }
    if (a === 'at-novino') { atNoVino(id); renderPanel('at-card'); return; }
    if (a === 'at-posponer') { atPosponer(id); renderPanel('at-card'); return; }
    if (a === 'at-deshacer') { atDeshacer(); renderPanel('at-card'); return; }
    if (a === 'at-llegada-abrir') { P.llegada = llegadaVacia(); renderPanel('at-l-serv'); return; }
    if (a === 'at-l-hora') { P.llegada.hora = +b.getAttribute('data-m'); P.llegada.error = ''; renderPanel('at-l-hora-' + P.llegada.hora); return; }
    if (a === 'at-llegada-cancelar') { P.llegada = null; renderPanel('at-llegada-abrir'); return; }
    if (a === 'at-llegada-agregar') { renderPanel(atAgregarLlegada() || 'at-card'); return; }
    if (a === 'esperando') {
      t = buscarTurno(id);
      if (t && t.ejemplo) abrirPreview(t, 'esperando', b.getAttribute('data-foco'));
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
    if (el.id === 'cl-buscar') { P.clBuscar = el.value; filtrarClientes(); return; }
    if (el.hasAttribute('data-ft-alt')) return;  // se guarda al salir del campo (change)
    if (el.id === 'cl-unir-buscar' && P.clUnir) {
      P.clUnir.buscar = el.value;
      var res = document.getElementById('cl-unir-res'), c = IDX[P.cliente];
      if (res && c) res.innerHTML = resultadosUnir(c);
      return;
    }
    if (el.tagName === 'SELECT' || el.type === 'checkbox') return;
    if (guardarCampo(el)) actualizarFormularios();
  });
  panelEl.addEventListener('change', function (e) {
    var el = e.target;
    if (el.type === 'file' && el.hasAttribute('data-foto')) {
      var donde = el.getAttribute('data-foto');
      if (el.files && el.files[0]) cambiarFoto(donde, el.files[0]).then(function () { renderPanel(['ft-' + donde, 'pa-titulo']); });
      return;
    }
    if (el.hasAttribute('data-ft-alt')) {
      var cual = el.getAttribute('data-ft-alt'), txt = el.value.trim().slice(0, 160);
      if (cual === 'fachada' && FOTOS.fachada) FOTOS.fachada.alt = txt;
      else if (FOTOS.galeria && FOTOS.galeria[+cual] && FOTOS.galeria[+cual].tipo === 'nueva') FOTOS.galeria[+cual].alt = txt;
      guardarFotos(); aplicarFotos();
      return;
    }
    if (el.hasAttribute('data-bb-dia') && P.bb) {
      var dd = P.bb.dias[el.getAttribute('data-bb-dia')], que = el.getAttribute('data-bb');
      if (que === 'on') { dd.on = el.checked; renderPanel('bb-on-' + el.getAttribute('data-bb-dia')); }
      else { dd[que] = el.value; actualizarFormularios(); }
      return;
    }
    if (el.hasAttribute('data-duracion')) {
      var idd = el.getAttribute('data-duracion');
      P.borrador[idd] = Object.assign({}, P.borrador[idd], { min: el.value });
      actualizarPrecios(idd);
      return;
    }
    if (el.tagName !== 'SELECT' && el.type !== 'checkbox') return;
    if (!guardarCampo(el)) return;
    if (el.id === 'at-l-serv' || el.id === 'at-l-barbero') { P.llegada.hora = null; P.llegada.error = ''; renderPanel(el.id); }
    else if (el.id === 'hz-barbero') actualizarFormularios();
    else if (el.id === 'bb-destino') { P.bbQuitar.noEntran = []; renderPanel('bb-destino'); }
    else if (el.id === 'np-compra' || el.id === 'np-tipo') renderPanel(el.id);
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
    if (!panelEl.hidden && P.acceso && P.vista === 'atender') { teclaAtender(e); return; }
    if (REMOTO || panelEl.hidden || P.acceso || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); tocarTecla(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); tocarTecla('Borrar'); }
  });

  // Atajos de Atender: el dueño pasa de un cliente a otro y cobra sin buscar botones
  function teclaAtender(e) {
    var enCampo = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || !!(e.target.closest && e.target.closest('.at-llegada'));
    if (enCampo) {
      if (e.key === 'Escape' && P.llegada) { e.preventDefault(); P.llegada = null; renderPanel('at-llegada-abrir'); }
      return;
    }
    if (e.altKey) return;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ((e.ctrlKey || e.metaKey) && k !== 'z') return;
    var cola = colaHoy(ahoraPY(), barberoAtender());
    var actual = P.atVer ? buscarTurno(P.atVer) : cola[0];
    var hecho = true;
    if (k === ' ' || k === 'ArrowRight') atMover(e.shiftKey ? -1 : 1);
    else if (k === 'ArrowLeft') atMover(-1);
    else if (k === 'Escape' || k === 'Home') P.atVer = null;
    else if (k === '1' || k === '2' || k === '3') { if (actual) atCobrar(actual.id, MEDIOS[+k - 1]); }
    else if (k === 'n') { if (actual) atNoVino(actual.id); }
    else if (k === 'p') { if (actual) atPosponer(actual.id); }
    else if (k === 'z') atDeshacer();
    else if (k === 'a') { e.preventDefault(); P.llegada = llegadaVacia(); renderPanel('at-l-serv'); return; }
    else hecho = false;
    if (!hecho) return;
    e.preventDefault();
    renderPanel('at-card');
  }
  // Que la barra espaciadora no "toque" el botón que quedó con foco: en Atender, pasa al siguiente
  document.addEventListener('keyup', function (e) {
    if (e.key === ' ' && !panelEl.hidden && P.acceso && P.vista === 'atender' && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && !(e.target.closest && e.target.closest('.at-llegada'))) e.preventDefault();
  });

  // Si el sitio está abierto en otra pestaña, se actualiza cuando alguien reserva o cancela
  window.addEventListener('storage', function (e) {
    if (REMOTO) return;  // con la base de datos, los otros celulares se enteran por el servidor
    if (e.key === CLAVE_RESERVAS) {
      misReservas = cargarReservas();
      renderHeroTurno();
      renderReserva();
      if (!panelEl.hidden && P.acceso) renderPanel();
    } else if (e.key === CLAVE_PANEL) {
      D = cargarDatos();
      if (!panelEl.hidden && P.acceso) renderPanel();
    } else if (e.key === CLAVE_CLIENTES) {
      CLI = cargarRegistro();
      if (!panelEl.hidden && P.acceso) renderPanel();
    } else if (e.key === CLAVE_HORARIO) {
      BLOQ = cargarBloqueos();
      actualizarSitioHorario();
      if (!panelEl.hidden && P.acceso) renderPanel();
    } else if (e.key === CLAVE_BARBEROS) {
      BARB = cargarBarberos();
      actualizarSitioHorario();
      if (!panelEl.hidden && P.acceso) renderPanel();
    } else if (e.key === CLAVE_FOTOS) {
      FOTOS = cargarFotos();
      aplicarFotos();
      if (!panelEl.hidden && P.acceso && P.vista === 'fotos') renderPanel();
    } else if (e.key === CLAVE_PRECIOS) {
      PRECIOS = cargarPrecios();
      renderPrecios();
      renderReserva();
      if (!panelEl.hidden && P.acceso) renderPanel();
    }
  });

  /* ===================== Conexión con la base de datos (API) ===================== */
  // Solo con la base de datos (REMOTO). La página sigue trabajando con sus objetos de siempre (D, BARB, SERVICIOS,
  // BLOQ, CLI, FOTOS); cada vez que se guarda algo, se compara con la última versión del servidor (PANEL.snap)
  // y se manda solo lo que cambió. Los pedidos van de a uno y en orden (COLA).
  var VISTAS_BARBERO = ['atender', 'hoy', 'turnos'];
  function esBarbero() { return REMOTO && !!PANEL.yo && PANEL.yo.rol === 'barbero'; }
  // El barbero que es el dueño (no se puede quitar)
  function esDelDueno(id) { return REMOTO && !!PANEL.yo && PANEL.yo.rol === 'dueno' && PANEL.yo.barbero === id; }
  var CAMPOS_TURNO = ['servicio', 'fecha', 'min', 'cliente', 'tel', 'nota', 'precio', 'dur', 'estado', 'medio', 'canceladoPor', 'canceladoEn', 'recordadoEn',
    'avisadoEn', 'orden', 'sinTurno', 'llego', 'llamadoEn', 'enLocal', 'antes', 'cambiadoEn', 'barbero', 'pospuesto', 'falso'];
  var CAMPOS_PRODUCTO = ['nombre', 'presentacion', 'uni', 'stock', 'minimo', 'precio'];
  var CAMPOS_SERVICIO = ['nombre', 'grupo', 'incluye', 'min', 'precio', 'activo'];
  var CAMPOS_BARBERO = ['nombre', 'activo', 'dias'];
  var CLAVE_SESION = 'tommybarber-sesion', CLAVE_MIS = 'tommybarber-mis-turnos', CLAVE_DISPOSITIVO = 'tommybarber-dispositivo';
  var OCUPACION = [];  // horarios ocupados que manda el sitio (sin datos de nadie)

  function leerTexto(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function guardarTexto(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* sin memoria en este navegador */ } }
  var TOKEN = REMOTO ? leerTexto(CLAVE_SESION) : '';
  function copia(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function igual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // Pedido a la API. Si falla, el error trae .estado (0 = sin conexión) y .datos (la respuesta del servidor)
  function pedir(metodo, ruta, cuerpo) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var corte = ctrl ? setTimeout(function () { ctrl.abort(); }, 60000) : null;
    var headers = {};
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    var conSesion = ruta.indexOf('/api/panel') === 0 || (ruta.indexOf('/api/acceso/') === 0 && ruta !== '/api/acceso/ingresar');
    if (TOKEN && conSesion) headers.Authorization = 'Bearer ' + TOKEN;
    function fin() { if (corte) clearTimeout(corte); }
    return fetch(API + ruta, { method: metodo, headers: headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        fin();
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.ok) return d;
          var e = new Error(d.mensaje || 'Error ' + r.status);
          e.estado = r.status; e.datos = d;
          throw e;
        });
      }, function () {
        fin();
        var e = new Error('Sin conexión');
        e.estado = 0; e.datos = {};
        throw e;
      });
  }
  function mensajeDe(e, defecto) { return e.estado === 0 ? 'No hay conexión con el servidor. Revisá internet y probá de nuevo.' : (e.datos && e.datos.mensaje) || defecto; }

  // Cola: los pedidos que cambian algo salen de a uno, en el orden en que se hicieron
  function encolar(fn) {
    return new Promise(function (ok, mal) { COLA.trabajos.push({ fn: fn, ok: ok, mal: mal }); correrCola(); });
  }
  function correrCola() {
    if (COLA.corriendo || !COLA.trabajos.length) return;
    COLA.corriendo = true;
    var t = COLA.trabajos.shift();
    Promise.resolve().then(t.fn).then(t.ok, t.mal).then(function () { COLA.corriendo = false; correrCola(); });
  }
  function colaQuieta() { return !COLA.corriendo && !COLA.trabajos.length && !PANEL.programado; }

  /* ----- Lo que llega del servidor ----- */
  function aplicarServicios(lista) {
    SERVICIOS = lista.map(function (s) {
      if (s.original) OFICIAL[s.id] = { precio: s.original.precio, min: s.original.min };
      return { id: s.id, grupo: s.grupo, nombre: s.nombre, incluye: s.grupo === 'combo' ? s.incluye || '' : '', min: s.min, precio: s.precio, activo: s.activo !== false, nuevo: !!s.nuevo };
    });
    SERV = {};
    SERVICIOS.forEach(function (s) { SERV[s.id] = s; });
    LISTA_LOCAL = SERVICIOS.filter(function (s) { return !s.nuevo && OFICIAL[s.id]; });
  }
  function aplicarConfig(c) {
    if (c.servicios && c.servicios.length) aplicarServicios(c.servicios);
    if (c.barberos && c.barberos.length) {
      BARB = { version: 1, sig: c.barberos.length + 1, barberos: c.barberos.map(function (b) {
        return { id: b.id, nombre: b.nombre, activo: b.activo, dias: normalizarDias(b.dias), creadoEn: b.creadoEn || 0, quitadoEn: b.quitadoEn || 0 };
      }) };
    }
    if (c.bloqueos) BLOQ = c.bloqueos.map(copia);
    if (c.historial) PRECIOS.historial = c.historial.slice(-40);
  }
  function aplicarFotosServidor(f) {
    f = f || {};
    FOTOS = { version: 1, logo: f.logo || null, fachada: f.fachada ? copia(f.fachada) : null,
      galeria: Array.isArray(f.galeria) ? f.galeria.filter(function (x) { return x.tipo !== 'original' || (x.n >= 0 && x.n < ORIG.galeria.length); }).map(copia) : null };
    aplicarFotos();
  }
  function redibujarSitio() { renderPrecios(); renderHorarios(); renderEstadoHero(); renderHeroTurno(); renderReservaSeguro(); }
  // La reserva no se redibuja mientras el cliente escribe su nombre o su número (se perdería el cursor)
  function renderReservaSeguro() {
    var a = document.activeElement;
    if (a && cajaReserva.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { actualizarPieReserva(); return; }
    renderReserva();
  }

  /* ----- Página de los clientes ----- */
  function misClaves() {
    var l = leerJSON(CLAVE_MIS, []);
    return Array.isArray(l) ? l.filter(function (x) { return x && /^TB-[A-Z0-9]{4,6}$/.test(x.codigo) && typeof x.clave === 'string'; }) : [];
  }
  function claveDeTurno(codigo) { return (misClaves().find(function (x) { return x.codigo === codigo; }) || {}).clave || ''; }
  function idDispositivo() {
    var id = leerTexto(CLAVE_DISPOSITIVO);
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) { id = idUnico('c'); guardarTexto(CLAVE_DISPOSITIVO, id); }
    return id;
  }
  // Los horarios ocupados como turnos sin datos (así la reserva calcula igual que siempre).
  // Los turnos de este celular ya están en Mis turnos: no se cuentan dos veces.
  function armarOcupacion() {
    if (PANEL.listo) return;
    var mios = misReservas.filter(function (t) { return t.estado !== 'cancelado'; }), usados = {};
    D.turnos = OCUPACION.filter(function (o) {
      var t = mios.find(function (x) { return !usados[x.id] && x.fecha === o.fecha && x.min === o.min && x.barbero === o.barbero; });
      if (t) { usados[t.id] = true; return false; }
      return true;
    }).map(function (o, i) {
      return { id: 'ocupado-' + i, codigo: '', servicio: '', fecha: o.fecha, min: o.min, dur: o.dur, barbero: o.barbero, estado: 'confirmado', cliente: '', tel: '', ejemplo: false };
    });
  }
  // Mis turnos: el pedido sale ya mismo; los turnos se arman cuando están los servicios (aplicarMisTurnos)
  function pedirMisTurnos() {
    var l = misClaves();
    if (!l.length) return Promise.resolve(null);
    return pedir('POST', '/api/reservas/consultar', { items: l.slice(-100) }).then(function (d) { return { l: l, turnos: d.turnos }; });
  }
  function aplicarMisTurnos(r) {
    if (!r) { misReservas = []; armarOcupacion(); return; }
    var desde = sumarDias(ahoraPY().clave, -30);
    misReservas = r.turnos.map(normalizarTurno).filter(function (t) { return t && t.fecha >= desde; });
    var quedan = {};
    misReservas.forEach(function (t) { quedan[t.codigo] = true; });
    guardarJSON(CLAVE_MIS, r.l.filter(function (x) { return quedan[x.codigo]; }));
    armarOcupacion();
  }
  function cargarMisTurnos() { return pedirMisTurnos().then(aplicarMisTurnos); }

  // Lo último que se recibió del sitio queda guardado en el celular: la próxima vez la página
  // muestra precios y horarios al instante y los actualiza apenas responde el servidor.
  var CLAVE_SITIO = 'tommybarber-sitio';
  function aplicarSitio(d) {
    aplicarConfig(d);
    aplicarFotosServidor(d.fotos);
    OCUPACION = d.ocupacion || [];
    armarOcupacion();
    SITIO.cargado = true; SITIO.error = false;
  }
  function sitioGuardado() {
    var g = leerJSON(CLAVE_SITIO, null);
    if (!g || !g.d || !g.en || Date.now() - g.en > 86400000 || !Array.isArray(g.d.servicios) || !g.d.servicios.length) return;
    try { aplicarSitio(g.d); } catch (e) { SITIO.cargado = false; }
  }
  function cargarSitio() {
    if (PANEL.listo) return Promise.resolve();
    var mis = pedirMisTurnos().catch(function () { return undefined; });   // a la vez que el sitio
    return pedir('GET', '/api/sitio').then(function (d) {
      if (PANEL.listo) return;  // el panel ya trajo sus datos
      aplicarSitio(d);
      guardarJSON(CLAVE_SITIO, { en: Date.now(), d: d });
      return mis.then(function (r) { if (r !== undefined && !PANEL.listo) aplicarMisTurnos(r); });
    }).catch(function () {
      if (!SITIO.cargado) SITIO.error = true;
    }).then(function () {
      if (!PANEL.listo) redibujarSitio();
    });
  }

  // Lo que avisa el servidor cuando no se puede reservar, con las mismas palabras que la página
  function textoLimite(d) {
    if (d.error === 'bloqueado') return 'Este número no puede reservar por la web. Para pedir un turno, escribinos al WhatsApp ' + WA_LOCAL_TXT + '.';
    if (d.error === 'persona' && d.turno) return 'Ya hay un turno a nombre de ' + d.turno.cliente + ' ' + cuandoTurno(d.turno.fecha, d.turno.min, false) + '. Si necesitás otro horario, cambialo desde Mis turnos. Si es para otra persona, poné su nombre.';
    if (d.error === 'tope-numero') return 'Con este WhatsApp ya hay ' + d.cantidad + ' turnos pendientes. Para reservar más, escribinos al ' + WA_LOCAL_TXT + '.';
    if (d.error === 'tope-celular') return 'Desde este celular ya hay ' + d.cantidad + ' turnos pendientes. Para reservar más, escribinos al ' + WA_LOCAL_TXT + '.';
    return '';
  }
  function errorReserva(e) {
    var d = e.datos || {};
    var lim = textoLimite(d);
    if (lim) { R.limiteServidor = { wa: telInfo(R.tel).wa, nombre: nombreNorm(R.nombre), texto: lim }; R.aviso = ''; return; }
    if (d.error === 'ocupado' || d.error === 'fuera-de-horario' || d.error === 'barbero') {
      R.paso = 2; R.hora = null; R.aviso = d.mensaje || 'Ese horario ya no está libre. Elegí otro.';
      cargarSitio();
      return;
    }
    if (d.error === 'servicio') { R.paso = 1; R.servicio = null; R.aviso = ''; cargarSitio(); return; }
    R.aviso = mensajeDe(e, 'No se pudo guardar. Probá de nuevo en un rato.');
  }
  function reservarEnServidor(v) {
    if (R.enviando) return;
    R.enviando = true; R.aviso = '';
    var datos = { servicio: v.serv.id, fecha: v.dia.clave, min: v.horaSel, barbero: R.barbero || '', nombre: R.nombre.trim(), tel: R.tel,
      nota: R.nota.trim().slice(0, 120), dispositivo: idDispositivo() };
    pedir('POST', '/api/reservas', datos).then(function (d) {
      var l = misClaves();
      l.push({ codigo: d.turno.codigo, clave: d.clave });
      guardarJSON(CLAVE_MIS, l.slice(-100));
      var t = normalizarTurno(d.turno);
      if (t) misReservas.push(t);
      R.ultimo = t ? t.id : null; R.paso = 4; R.hora = null; R.diaIdx = null; R.cancelando = null; R.cambiado = false; R.limiteServidor = null;
      if (PANEL.listo) buscarNovedades();
    }, errorReserva).then(function () {
      R.enviando = false;
      renderReserva(true);
      renderHeroTurno();
    });
  }
  function reemplazarMio(n) {
    var i = misReservas.findIndex(function (x) { return x.id === n.id; });
    if (i >= 0) misReservas[i] = n; else misReservas.push(n);
  }
  function cambiarEnServidor(v) {
    var t = v.cambio, clave = claveDeTurno(t.codigo);
    if (!clave) { R.cambiando = null; R.modo = 'mis'; R.aviso = 'Ese turno no se puede cambiar desde este celular.'; return; }
    if (R.enviando) return;
    R.enviando = true; R.aviso = '';
    pedir('POST', '/api/reservas/' + t.codigo + '/cambiar', { clave: clave, fecha: v.dia.clave, min: v.horaSel, barbero: R.barbero || '' }).then(function (d) {
      var n = normalizarTurno(d.turno);
      if (n) reemplazarMio(n);
      R.ultimo = t.id; R.paso = 4; R.cambiando = null; R.cambiado = true; R.hora = null; R.diaIdx = null; R.aviso = '';
      cargarSitio();
    }, function (e) {
      var d = e.datos || {};
      if (d.error === 'inactivo' || d.error === 'empezo' || e.estado === 404) {
        R.cambiando = null; R.modo = 'mis'; R.aviso = 'Ese turno ya no se puede cambiar.';
        cargarMisTurnos().catch(function () {}).then(function () { renderReserva(); renderHeroTurno(); });
      } else if (d.error === 'mismo') R.aviso = 'Es el mismo horario que ya tenés.';
      else errorReserva(e);
    }).then(function () {
      R.enviando = false;
      renderReserva(true);
      renderHeroTurno();
    });
  }
  function cancelarEnServidor(id) {
    var t = buscarTurno(id), clave = t ? claveDeTurno(t.codigo) : '';
    R.cancelando = null;
    if (R.enviando) return;
    if (!t || !clave) { R.aviso = 'Este turno ya no está activo.'; renderReserva(true); return; }
    R.enviando = true;
    renderReserva();
    pedir('POST', '/api/reservas/' + t.codigo + '/cancelar', { clave: clave }).then(function (d) {
      var n = normalizarTurno(d.turno);
      if (n) reemplazarMio(n);
      R.aviso = R.modo === 'reservar' && R.paso === 4 ? '' : 'Cancelaste tu turno ' + cuandoTurno(t.fecha, t.min, true) + '. El horario quedó libre.';
      cargarSitio();
    }, function (e) {
      R.aviso = mensajeDe(e, 'No se pudo cancelar. Probá de nuevo.');
      if (e.datos && (e.datos.error === 'inactivo' || e.datos.error === 'empezo')) cargarMisTurnos().catch(function () {});
    }).then(function () {
      R.enviando = false;
      renderHeroTurno();
      renderReserva(true);
    });
  }

  /* ----- Panel: ingreso y datos ----- */
  function renderPanelSiVisible(foco) { if (!panelEl.hidden) renderPanel(foco); }
  // Redibuja el panel salvo que el usuario esté escribiendo (para no moverle el cursor)
  function renderPanelSeguro(foco) {
    if (panelEl.hidden) return;
    var a = document.activeElement;
    if (!foco && P.acceso && a && panelEl.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { PANEL.redibujar = true; return; }
    PANEL.redibujar = false;
    renderPanel(foco);
  }
  function avisar(texto, esError) { PANEL.aviso = texto; PANEL.avisoError = !!esError; }
  function avisoConexion() {
    if (!PANEL.aviso) return '';
    return '<p class="aviso-ok' + (PANEL.avisoError ? ' aviso-red' : '') + '" role="' + (PANEL.avisoError ? 'alert' : 'status') + '">' + esc(PANEL.aviso) +
      ' <button type="button" class="link-btn" data-accion="aviso-cerrar" data-foco="aviso-cerrar">Cerrar</button></p>';
  }
  function datosServicio(s) { return { id: s.id, grupo: s.grupo, nombre: s.nombre, incluye: s.grupo === 'combo' ? s.incluye || '' : '', min: s.min, precio: s.precio, activo: s.activo !== false }; }
  function datosBarbero(b) { return { id: b.id, nombre: b.nombre, activo: b.activo, dias: normalizarDias(b.dias) }; }
  function claveHist(c) { return c.ts + '|' + c.id + '|' + c.campo; }
  function porId(l, f) { var m = {}; l.forEach(function (x) { m[x.id] = copia(f ? f(x) : x); }); return m; }
  function snapConfig() {
    var S = PANEL.snap;
    S.barberos = porId(BARB.barberos, datosBarbero);
    S.servicios = porId(SERVICIOS, datosServicio);
    S.bloqueos = porId(BLOQ);
    S.historial = {};
    PRECIOS.historial.forEach(function (c) { S.historial[claveHist(c)] = true; });
  }
  function snapStock() { PANEL.snap.productos = porId(D.productos); PANEL.snap.movStock = porId(D.movStock); }
  function tomarSnap() {
    PANEL.snap = { turnos: porId(D.turnos), mov: porId(D.mov), fotos: copia(FOTOS) };
    snapStock();
    snapConfig();
  }
  function aplicarDatosPanel(d) {
    aplicarConfig(d.config);
    if (d.fotos) aplicarFotosServidor(d.fotos);
    D = { version: VERSION_DATOS, fecha: ahoraPY().clave, turnos: d.turnos.map(normalizarTurno).filter(Boolean), mov: d.mov || [],
      productos: d.productos || [], movStock: d.movStock || [], nId: 1 };
    CLI = d.registro || registroVacio();
    if (!Array.isArray(CLI.bloqueados)) CLI.bloqueados = [];
    TEMP_IDS = {};
    PANEL.vers = d.versiones || {};
    PANEL.desde = d.ahora;
    tomarSnap();
  }
  function cargarPanel(mensaje, esBueno) {
    PANEL.cargando = !PANEL.listo;
    if (PANEL.cargando) renderPanelSiVisible();
    return pedir('GET', '/api/panel/datos').then(function (d) {
      var primera = !P.acceso;
      PANEL.yo = d.yo;
      aplicarDatosPanel(d);
      PANEL.listo = true; PANEL.cargando = false;
      if (mensaje) avisar(mensaje, !esBueno);
      redibujarSitio();
      if (primera) {
        P.acceso = true;
        P.vista = esBarbero() || location.hash === '#atender' ? 'atender' : 'hoy';
        renderPanelSiVisible();
        window.scrollTo(0, 0);
        var t = document.getElementById('pa-titulo');
        if (t) t.focus({ preventScroll: true });
        atAlFrente();
      } else renderPanelSiVisible();
    }, function (e) {
      PANEL.cargando = false;
      if (e.estado === 401) { sesionVencida(PANEL.yo ? 'La sesión se cerró. Ingresá de nuevo.' : ''); return; }
      avisar(mensajeDe(e, 'No se pudo cargar el panel.') + ' Probando de nuevo…', true);
      P.login.error = P.acceso ? '' : mensajeDe(e, 'No se pudo cargar el panel.');
      renderPanelSiVisible();
      setTimeout(function () { if (TOKEN) cargarPanel(); }, 10000);
    });
  }
  function ingresar() {
    var L = P.login;
    if (L.enviando) return;
    var u = document.getElementById('pa-usuario'), c = document.getElementById('pa-clave');
    L.usuario = u ? u.value.trim() : '';
    var clave = c ? c.value : '';
    if (!L.usuario || !clave) { L.error = 'Escribí tu usuario y tu contraseña.'; renderPanel(L.usuario ? 'pa-clave' : 'pa-usuario'); return; }
    L.enviando = true; L.error = '';
    renderPanel('pa-ingresar');
    pedir('POST', '/api/acceso/ingresar', { usuario: L.usuario, clave: clave }).then(function (d) {
      TOKEN = d.token;
      guardarTexto(CLAVE_SESION, TOKEN);
      PANEL.yo = d.yo;
      L.enviando = false;
      return cargarPanel();
    }, function (e) {
      L.enviando = false;
      L.error = mensajeDe(e, 'No se pudo ingresar.');
      renderPanel('pa-clave');
    });
  }
  function cerrarSesionLocal() {
    TOKEN = '';
    guardarTexto(CLAVE_SESION, '');
    PANEL.listo = false; PANEL.yo = null; PANEL.snap = null; PANEL.cuentas = null; PANEL.aviso = '';
    COLA.trabajos = [];
    P.acceso = false; P.miClave = null; P.cuenta = null; P.prueba = null; P.login = { usuario: '', error: '', enviando: false };
    D = cargarDatos();
    CLI = registroVacio();
    armarOcupacion();
  }
  function sesionVencida(texto) {
    cerrarSesionLocal();
    P.login.error = texto || '';
    renderPanelSiVisible('pa-usuario');
    cargarSitio();
  }
  function salirDelPanel() {
    sincronizarYa();
    encolar(function () { return pedir('POST', '/api/acceso/salir').catch(function () { /* la sesión vence sola */ }); }).then(function () {
      cerrarSesionLocal();
      renderPanelSiVisible();
      window.scrollTo(0, 0);
      cargarSitio();
    });
  }

  /* ----- Panel: mandar los cambios ----- */
  function difCampos(antes, ahora, campos) {
    var c = null;
    campos.forEach(function (k) { if (!igual(antes[k], ahora[k])) (c = c || {})[k] = [copia(antes[k]), copia(ahora[k])]; });
    return c;
  }
  function limpiarMov(m) {
    var r = { id: m.id, fecha: m.fecha, min: m.min, tipo: m.tipo, cat: m.cat, concepto: m.concepto, monto: m.monto, medio: m.medio };
    if (m.turno) r.turno = m.turno;
    if (m.cantidad) r.cantidad = m.cantidad;
    return r;
  }
  function limpiarMovStock(m) {
    var r = { id: m.id, prodId: m.prodId, tipo: m.tipo, cantidad: m.cantidad, ts: m.ts };
    ['monto', 'costo', 'antes', 'despues'].forEach(function (k) { if (m[k] != null) r[k] = m[k]; });
    return r;
  }
  // Lo que cambió desde la última versión del servidor (null: nada)
  function paqueteCambios() {
    var S = PANEL.snap;
    if (!S) return null;
    var p = {}, hay = false;
    function lista(actuales, snap, campos, limpiar) {
      var r = { nuevos: [], cambiados: [], quitados: [] }, vistos = {};
      actuales.forEach(function (x) {
        vistos[x.id] = true;
        var a = snap[x.id];
        if (!a) r.nuevos.push(limpiar ? limpiar(x) : copia(x));
        else if (campos) { var c = difCampos(a, limpiar ? limpiar(x) : x, campos); if (c) r.cambiados.push({ id: x.id, cambios: c }); }
      });
      Object.keys(snap).forEach(function (id) { if (!vistos[id]) r.quitados.push(id); });
      return r;
    }
    function poner(nombre, r, sin) {
      sin.forEach(function (k) { delete r[k]; });
      if (Object.keys(r).some(function (k) { return r[k].length; })) { p[nombre] = r; hay = true; }
    }
    poner('turnos', lista(D.turnos, S.turnos, CAMPOS_TURNO), []);
    poner('mov', lista(D.mov, S.mov, null, limpiarMov), ['cambiados']);
    if (!esBarbero()) {
      poner('productos', lista(D.productos, S.productos, CAMPOS_PRODUCTO), []);
      poner('movStock', lista(D.movStock, S.movStock, null, limpiarMovStock), ['cambiados', 'quitados']);
      var bb = lista(BARB.barberos, S.barberos, CAMPOS_BARBERO, datosBarbero);
      poner('barberos', { nuevos: bb.nuevos, cambiados: bb.cambiados.map(function (c) { return datosBarbero(barberoPorId(c.id)); }) }, []);
      var sv = lista(SERVICIOS, S.servicios, CAMPOS_SERVICIO, datosServicio);
      sv.historial = PRECIOS.historial.filter(function (c) { return !S.historial[claveHist(c)]; }).map(copia);
      poner('servicios', sv, ['quitados']);
      poner('bloqueos', lista(BLOQ, S.bloqueos, null), ['cambiados']);
    }
    return hay ? p : null;
  }
  // Lo mandado ya está en el servidor: pasa a ser la última versión conocida
  function confirmarEnviado(paq, r) {
    var S = PANEL.snap;
    function aplicarA(snap, q, f) {
      if (!q) return;
      (q.nuevos || []).forEach(function (x) { snap[x.id] = copia(f ? f(x) : x); });
      (q.cambiados || []).forEach(function (c) {
        var a = snap[c.id];
        if (!a) return;
        if (c.cambios) Object.keys(c.cambios).forEach(function (k) { a[k] = copia(c.cambios[k][1]); });
        else snap[c.id] = copia(f ? f(c) : c);
      });
      (q.quitados || []).forEach(function (id) { delete snap[id]; });
    }
    aplicarA(S.turnos, paq.turnos);
    aplicarA(S.mov, paq.mov);
    aplicarA(S.productos, paq.productos);
    aplicarA(S.movStock, paq.movStock);
    aplicarA(S.barberos, paq.barberos, datosBarbero);
    aplicarA(S.servicios, paq.servicios);
    aplicarA(S.bloqueos, paq.bloqueos);
    if (paq.servicios) paq.servicios.historial.forEach(function (c) { S.historial[claveHist(c)] = true; });
    // Los turnos como quedaron en la base (si no se tocaron mientras tanto)
    (r.turnos || []).forEach(function (st) {
      var n = normalizarTurno(st), local = n && D.turnos.find(function (t) { return t.id === n.id; });
      if (local && S.turnos[n.id] && !difCampos(S.turnos[n.id], local, CAMPOS_TURNO)) { Object.assign(local, n); S.turnos[n.id] = copia(n); }
    });
    if (r.clientes) {
      Object.keys(r.clientes).forEach(function (k) { CLI.ids[k] = r.clientes[k]; });
      if (Object.keys(TEMP_IDS).length) { TEMP_IDS = {}; renderPanelSeguro(); }
    }
  }
  function sincronizar() {
    if (!REMOTO || !PANEL.listo || PANEL.programado) return;
    PANEL.programado = true;
    setTimeout(function () { PANEL.programado = false; encolar(trabajoSync); }, 0);
  }
  function sincronizarYa() { if (REMOTO && PANEL.listo) { PANEL.programado = false; encolar(trabajoSync); } }
  function trabajoSync() {
    if (!PANEL.listo) return;
    var paq = paqueteCambios();
    if (!paq) return;
    return pedir('POST', '/api/panel/cambios', paq).then(function (r) {
      confirmarEnviado(paq, r);
      PANEL.fallos = 0;
      if (PANEL.aviso && PANEL.avisoError && PANEL.sinRed) { PANEL.aviso = ''; PANEL.sinRed = false; renderPanelSeguro(); }
      if (paqueteCambios()) sincronizar();
    }, function (e) {
      if (e.estado === 401) { sesionVencida('La sesión se cerró. Ingresá de nuevo: lo último que hiciste puede no haberse guardado.'); return; }
      if (e.estado === 0 || e.estado === 429 || (e.estado >= 500 && (PANEL.fallos = (PANEL.fallos || 0) + 1) < 4)) {
        // Sin conexión: los cambios siguen acá y se mandan cuando vuelva
        PANEL.sinRed = true;
        avisar('Sin conexión con el servidor: los cambios se guardan apenas vuelva.', true);
        renderPanelSeguro();
        clearTimeout(PANEL.reintento);
        PANEL.reintento = setTimeout(sincronizar, 8000);
        return;
      }
      PANEL.fallos = 0;
      // Conflicto con otro celular o un dato que no corresponde: se vuelve a cargar lo que hay en la base
      return cargarPanel(mensajeDe(e, 'No se pudo guardar el cambio.') + ' Se volvió a cargar la información del panel.');
    });
  }

  /* ----- Panel: lo que cambió en otros celulares ----- */
  function buscarNovedades() {
    if (!PANEL.listo || PANEL.buscando || !colaQuieta()) return;
    PANEL.buscando = true;
    var v = PANEL.vers;
    pedir('GET', '/api/panel/novedades?desde=' + PANEL.desde + '&config=' + (v.config || 0) + '&registro=' + (v.registro || 0) + '&stock=' + (v.stock || 0)).then(function (n) {
      // Si mientras tanto hubo cambios propios, se espera a que salgan
      if (PANEL.listo && colaQuieta() && !paqueteCambios()) aplicarNovedades(n);
    }, function (e) {
      if (e.estado === 401) sesionVencida('La sesión se cerró. Ingresá de nuevo.');
    }).then(function () {
      PANEL.buscando = false;
      if (PANEL.redibujar) renderPanelSeguro();
    });
  }
  function aplicarNovedades(n) {
    if (n.versiones && PANEL.vers.datos != null && n.versiones.datos !== PANEL.vers.datos) {
      cargarPanel('Se cargaron datos de prueba o se empezó de cero desde otro celular: el panel se actualizó.', true);
      return;
    }
    var S = PANEL.snap, cambio = false, sitio = false;
    var locales = {};
    D.turnos.forEach(function (t) { locales[t.id] = t; });
    n.turnos.forEach(function (st) {
      var t = normalizarTurno(st);
      if (!t) return;
      var l = locales[t.id];
      if (!l) { D.turnos.push(t); cambio = true; } else if (!igual(l, t)) { Object.assign(l, t); cambio = true; }
      S.turnos[t.id] = copia(t);
    });
    var sacar = {};
    (n.fuera || []).concat(n.borrados || []).forEach(function (c) { if (locales[c]) sacar[c] = true; });
    if (Object.keys(sacar).length) {
      D.turnos = D.turnos.filter(function (t) { return !sacar[t.id]; });
      Object.keys(sacar).forEach(function (c) { delete S.turnos[c]; });
      cambio = true;
    }
    (n.mov || []).forEach(function (m) {
      if (S.mov[m.id] || D.mov.some(function (x) { return x.id === m.id; })) return;
      D.mov.push(m); S.mov[m.id] = copia(m); cambio = true;
    });
    if ((n.movAnulados || []).length) {
      var anul = {};
      n.movAnulados.forEach(function (id) { anul[id] = true; delete S.mov[id]; });
      var antes = D.mov.length;
      D.mov = D.mov.filter(function (m) { return !anul[m.id]; });
      if (D.mov.length !== antes) cambio = true;
    }
    if (n.config) { aplicarConfig(n.config); snapConfig(); cambio = true; sitio = true; }
    if (n.fotos) { aplicarFotosServidor(n.fotos); S.fotos = copia(FOTOS); }
    if (n.registro) { CLI = n.registro; if (!Array.isArray(CLI.bloqueados)) CLI.bloqueados = []; TEMP_IDS = {}; cambio = true; }
    else if (n.clientes) Object.keys(n.clientes).forEach(function (k) { if (CLI.ids[k] !== n.clientes[k]) { CLI.ids[k] = n.clientes[k]; cambio = true; } });
    if (n.productos) { D.productos = n.productos; D.movStock = n.movStock || []; snapStock(); cambio = true; }
    PANEL.vers = n.versiones || PANEL.vers;
    PANEL.desde = n.ahora || PANEL.desde;
    if (!cambio) return;
    if (sitio) redibujarSitio(); else { renderHeroTurno(); renderReservaSeguro(); }
    if (!P.llegada && !P.preview) renderPanelSeguro();
  }

  /* ----- Panel: fotos, clientes, barberos nuevos y cuentas ----- */
  function encolarFotos() {
    if (!PANEL.listo) return;
    encolar(function () {
      var S = PANEL.snap.fotos || { logo: null, fachada: null, galeria: null }, F = FOTOS, pasos = [];
      var esNueva = function (src) { return /^data:/.test(src || ''); };
      if (F.logo !== S.logo) pasos.push(F.logo ? ['PUT', '/api/panel/fotos/logo', { src: F.logo }] : ['DELETE', '/api/panel/fotos/logo']);
      if (!F.fachada && S.fachada) pasos.push(['DELETE', '/api/panel/fotos/fachada']);
      else if (F.fachada && (!S.fachada || F.fachada.src !== S.fachada.src)) {
        pasos.push(['PUT', '/api/panel/fotos/fachada', esNueva(F.fachada.src) ? { src: F.fachada.src, alt: F.fachada.alt, w: F.fachada.w, h: F.fachada.h } : { alt: F.fachada.alt }]);
      } else if (F.fachada && F.fachada.alt !== S.fachada.alt) pasos.push(['PUT', '/api/panel/fotos/fachada', { alt: F.fachada.alt }]);
      if (!igual(F.galeria, S.galeria)) {
        pasos.push(['PUT', '/api/panel/fotos/galeria', { galeria: F.galeria ? F.galeria.map(function (x) {
          return x.tipo === 'original' ? { tipo: 'original', n: x.n } : { tipo: 'nueva', id: x.id, alt: x.alt, w: x.w, h: x.h, src: esNueva(x.src) ? x.src : undefined };
        }) : null }]);
      }
      if (!pasos.length) return;
      var enviado = JSON.stringify(F), ultimo = null;
      return pasos.reduce(function (pr, x) {
        return pr.then(function () { return pedir(x[0], x[1], x[2]).then(function (r) { ultimo = r.fotos; }); });
      }, Promise.resolve()).then(function () {
        PANEL.snap.fotos = copia(ultimo);
        if (JSON.stringify(FOTOS) === enviado) {
          aplicarFotosServidor(ultimo);
          PANEL.snap.fotos = copia(FOTOS);
          if (P.vista === 'fotos') renderPanelSeguro();
        }
      }, function (e) {
        if (e.estado === 401) { sesionVencida('La sesión se cerró. Ingresá de nuevo.'); return; }
        P.avisoFotos = '';
        P.ftError = mensajeDe(e, 'No se pudo guardar la foto. Probá de nuevo.');
        // Vuelven las fotos que tiene el servidor
        return pedir('GET', '/api/sitio').then(function (d) { aplicarFotosServidor(d.fotos); PANEL.snap.fotos = copia(FOTOS); }).catch(function () {})
          .then(function () { if (P.vista === 'fotos') renderPanelSeguro(); });
      });
    });
  }
  // Cambios en las fichas de clientes: los hace el servidor y devuelve el registro como quedó
  function opCliente(metodo, ruta, cuerpo) {
    if (!PANEL.listo) return;
    encolar(function () {
      return pedir(metodo, ruta, cuerpo).then(function (r) {
        if (r.registro) {
          CLI = r.registro;
          if (!Array.isArray(CLI.bloqueados)) CLI.bloqueados = [];
          TEMP_IDS = {};
        }
        if (r.versiones) PANEL.vers.registro = r.versiones.registro;
        if (!P.cliente || IDX[P.cliente] || r.queda) renderPanelSeguro();
      }, function (e) {
        if (e.estado === 401) { sesionVencida('La sesión se cerró. Ingresá de nuevo.'); return; }
        return cargarPanel(mensajeDe(e, 'No se pudo guardar el cambio en la ficha.'));
      });
    });
  }
  function agregarBarberoEnServidor(datos) {
    var temp = idUnico('x');
    P.avisoBarberos = 'Agregando a ' + datos.nombre + '…';
    sincronizarYa();
    encolar(function () {
      return pedir('POST', '/api/panel/cambios', { barberos: { nuevos: [{ id: temp, nombre: datos.nombre, activo: true, dias: datos.dias }] } }).then(function (r) {
        var id = r.ids && r.ids[temp];
        var nuevo = id && r.config && r.config.barberos.find(function (b) { return b.id === id; });
        if (nuevo) {
          var b = { id: id, nombre: nuevo.nombre, activo: true, dias: normalizarDias(nuevo.dias), creadoEn: nuevo.creadoEn || Date.now(), quitadoEn: 0 };
          BARB.barberos.push(b);
          PANEL.snap.barberos[id] = datosBarbero(b);
        }
        P.avisoBarberos = 'Agregaste a ' + datos.nombre + '. Ya aparece para elegir en la reserva.';
        actualizarSitioHorario();
        renderPanelSeguro(id ? 'bb-n-' + id : null);
      }, function (e) {
        if (e.estado === 401) { sesionVencida('La sesión se cerró. Ingresá de nuevo.'); return; }
        P.avisoBarberos = '';
        avisar(mensajeDe(e, 'No se pudo agregar al barbero.'), true);
        renderPanelSeguro();
      });
    });
  }
  function cargarCuentas() {
    if (esBarbero()) return;
    pedir('GET', '/api/panel/cuentas').then(function (r) {
      PANEL.cuentas = r.cuentas;
      if (P.vista === 'barberos') renderPanelSeguro();
    }, function (e) { if (e.estado === 401) sesionVencida('La sesión se cerró. Ingresá de nuevo.'); });
  }
  function cuentaDe(barbero) { return (PANEL.cuentas || []).find(function (u) { return u.barbero === barbero && u.activo; }) || null; }
  function sugerenciaUsuario(nombre) { return sinAcentos(primerNombre(nombre)).replace(/[^a-z0-9]/g, '') || 'barbero'; }
  function plantillaCuenta(b) {
    if (!PANEL.cuentas) return '<p class="suave bb-acceso-t">Cargando el acceso al panel…</p>';
    var c = cuentaDe(b.id);
    if (c && c.rol === 'dueno') {
      return '<div class="bb-acceso"><p class="bb-acceso-t">Es el dueño: entra al panel con el usuario <strong>' + esc(c.usuario) + '</strong> y ve todo. Su contraseña se cambia en «Cambiar mi contraseña».</p></div>';
    }
    var f = P.cuenta && P.cuenta.barbero === b.id ? P.cuenta : null;
    var html = '<div class="bb-acceso"><p class="bb-acceso-t">' + (c
      ? 'Entra al panel con el usuario <strong>' + esc(c.usuario) + '</strong>' + (c.ultimoIngreso ? '. Último ingreso: ' + esc(cuandoFue(c.ultimoIngreso)) : '. Todavía no entró') + '.'
      : 'Todavía no puede entrar al panel.') + '</p>';
    if (f && f.modo === 'quitar') {
      html += '<div class="bb-quitar" role="group" aria-labelledby="ct-q-t"><p id="ct-q-t">¿Quitarle el acceso al panel a ' + esc(b.nombre) + '? Se cierra su sesión en todos los celulares.</p>' +
        '<div class="prod-form-acciones"><button type="button" class="btn btn-rojo btn-mini" data-accion="cuenta-quitar" data-id="' + (c ? c.id : '') + '" data-foco="ct-quitar-si"' + (f.enviando ? ' disabled' : '') + '>Sí, quitar el acceso</button>' +
        '<button type="button" class="link-btn" data-accion="cuenta-cancelar" data-id="' + esc(b.id) + '">No</button></div></div>';
    } else if (f) {
      html += '<form class="bb-cuenta" data-form="cuenta" novalidate>' +
        (f.modo === 'nueva' ? '<label for="ct-usuario">Usuario</label><input class="campo" id="ct-usuario" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30" data-campo="cuenta.usuario" placeholder="' + esc(sugerenciaUsuario(b.nombre)) + '" value="' + esc(f.usuario) + '">' +
          '<p class="suave bb-nota">Con letras minúsculas, números, punto o guion, sin espacios.</p>' : '') +
        '<label for="ct-clave">' + (f.modo === 'nueva' ? 'Contraseña' : 'Contraseña nueva') + '</label><input class="campo" id="ct-clave" type="text" autocomplete="new-password" autocapitalize="none" spellcheck="false" maxlength="128" data-campo="cuenta.clave" value="' + esc(f.clave) + '">' +
        '<p class="suave bb-nota">Al menos 10 caracteres, con letras y números. Pasásela en persona: después la puede cambiar desde el panel.</p>' +
        (f.error ? '<p class="campo-error" role="alert">' + esc(f.error) + '</p>' : '') +
        '<div class="prod-form-acciones"><button type="submit" class="btn btn-negro btn-mini" data-foco="ct-guardar"' + (f.enviando ? ' disabled' : '') + '>' + (f.modo === 'nueva' ? 'Darle acceso' : 'Guardar la contraseña') + '</button>' +
        '<button type="button" class="link-btn" data-accion="cuenta-cancelar" data-id="' + esc(b.id) + '">Cancelar</button></div></form>';
    } else {
      html += '<div class="bb-botones">' + (c
        ? '<button type="button" class="btn btn-linea btn-mini" data-accion="cuenta-abrir" data-modo="clave" data-id="' + esc(b.id) + '" data-foco="ct-abrir-' + esc(b.id) + '">Nueva contraseña</button>' +
          '<button type="button" class="link-btn link-rojo" data-accion="cuenta-abrir" data-modo="quitar" data-id="' + esc(b.id) + '" data-foco="ct-quitar-' + esc(b.id) + '">Quitarle el acceso</button>'
        : '<button type="button" class="btn btn-linea btn-mini" data-accion="cuenta-abrir" data-modo="nueva" data-id="' + esc(b.id) + '" data-foco="ct-abrir-' + esc(b.id) + '">Darle acceso al panel</button>') + '</div>';
    }
    return html + '</div>';
  }
  function problemaClaveRapido(clave) {
    if (clave.length < 10) return 'La contraseña tiene que tener al menos 10 caracteres.';
    if (!/[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ]/.test(clave) || !/\d/.test(clave)) return 'La contraseña tiene que tener letras y números.';
    return '';
  }
  function guardarCuenta() {
    var f = P.cuenta;
    if (!f || f.enviando) return;
    var b = barberoPorId(f.barbero), c = cuentaDe(f.barbero);
    var usuario = (f.usuario || '').trim().toLowerCase();
    f.error = f.modo === 'nueva' && !/^[a-z0-9._-]{3,30}$/.test(usuario) ? 'El usuario tiene que tener de 3 a 30 letras minúsculas, números, punto o guion, sin espacios.' : problemaClaveRapido(f.clave || '');
    if (f.error) { renderPanel(f.modo === 'nueva' && /usuario/.test(f.error) ? 'ct-usuario' : 'ct-clave'); return; }
    f.enviando = true;
    renderPanel('ct-clave');
    var pedido = f.modo === 'nueva' ? pedir('POST', '/api/panel/cuentas', { barbero: f.barbero, usuario: usuario, clave: f.clave })
      : pedir('PUT', '/api/panel/cuentas/' + (c ? c.id : 0), { clave: f.clave });
    pedido.then(function (r) {
      PANEL.cuentas = r.cuentas;
      P.avisoCuenta = f.modo === 'nueva' ? (b ? b.nombre : 'El barbero') + ' ya puede entrar al panel en ' + location.host + RUTA_PANEL + ' con el usuario ' + usuario + '.'
        : 'Cambiaste la contraseña de ' + (b ? b.nombre : 'el barbero') + '. Sus sesiones abiertas se cerraron.';
      P.cuenta = null;
      renderPanel('bb-n-' + f.barbero);
    }, function (e) {
      if (e.estado === 401) { sesionVencida('La sesión se cerró. Ingresá de nuevo.'); return; }
      f.enviando = false;
      f.error = mensajeDe(e, 'No se pudo guardar.');
      renderPanel('ct-clave');
    });
  }
  function quitarCuenta(id) {
    var f = P.cuenta;
    if (!f || f.enviando || !id) return;
    f.enviando = true;
    renderPanel();
    pedir('PUT', '/api/panel/cuentas/' + id, { activo: false }).then(function (r) {
      PANEL.cuentas = r.cuentas;
      P.avisoCuenta = 'Le quitaste el acceso al panel a ' + nombreBarbero(f.barbero) + '.';
      P.cuenta = null;
      renderPanel('bb-n-' + f.barbero);
    }, function (e) {
      if (e.estado === 401) { sesionVencida('La sesión se cerró. Ingresá de nuevo.'); return; }
      P.cuenta = null;
      P.avisoCuenta = mensajeDe(e, 'No se pudo quitar el acceso.');
      renderPanel();
    });
  }
  function plantillaMiClave() {
    var f = P.miClave;
    return '<section class="tarjeta-form mi-clave" aria-labelledby="mc-t"><h2 class="pa-h3" id="mc-t">Cambiar mi contraseña</h2>' +
      '<form id="pa-mi-clave" novalidate>' +
        '<input type="text" name="username" autocomplete="username" value="' + esc(PANEL.yo ? PANEL.yo.usuario : '') + '" hidden>' +
        '<label for="mc-actual">Contraseña actual</label><input class="campo" id="mc-actual" type="password" autocomplete="current-password" maxlength="128">' +
        '<label for="mc-nueva">Contraseña nueva</label><input class="campo" id="mc-nueva" type="password" autocomplete="new-password" maxlength="128">' +
        '<label for="mc-repetir">Repetí la contraseña nueva</label><input class="campo" id="mc-repetir" type="password" autocomplete="new-password" maxlength="128">' +
        '<p class="suave bb-nota">Al menos 10 caracteres, con letras y números. Al guardarla se cierra la sesión en los otros celulares.</p>' +
        (f.error ? '<p class="campo-error" role="alert">' + esc(f.error) + '</p>' : '') +
        '<div class="prod-form-acciones"><button type="submit" class="btn btn-negro btn-mini" data-foco="mc-guardar"' + (f.enviando ? ' disabled' : '') + '>Guardar</button>' +
        '<button type="button" class="link-btn" data-accion="mi-clave-cancelar">Cancelar</button></div>' +
      '</form></section>';
  }
  function cambiarMiClave() {
    var f = P.miClave;
    if (!f || f.enviando) return;
    var v = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var actual = v('mc-actual'), nueva = v('mc-nueva');
    f.error = !actual ? 'Escribí tu contraseña actual.' : problemaClaveRapido(nueva) || (nueva !== v('mc-repetir') ? 'Las dos contraseñas nuevas no son iguales.' : '');
    if (f.error) { renderPanel(!actual ? 'mc-actual' : 'mc-nueva'); return; }
    f.enviando = true;
    renderPanel('mc-guardar');
    pedir('POST', '/api/acceso/clave', { actual: actual, nueva: nueva }).then(function () {
      P.miClave = null;
      avisar('Cambiaste tu contraseña.', false);
      renderPanel('aviso-cerrar');
    }, function (e) {
      if (e.estado === 401 && !(e.datos && e.datos.error === 'datos-incorrectos')) { sesionVencida('La sesión se cerró. Ingresá de nuevo.'); return; }
      f.enviando = false;
      f.error = mensajeDe(e, 'No se pudo cambiar la contraseña.');
      renderPanel('mc-actual');
    });
  }

  /* ----- Panel: datos de prueba y empezar de cero ----- */
  function plantillaPrueba() {
    var f = P.prueba, ocupado = !!f.enviando;
    return '<section class="tarjeta-form prueba" aria-labelledby="pb-t"><h2 class="pa-h3" id="pb-t" tabindex="-1">Datos de prueba</h2>' +
      '<p>Carga un mes de trabajo para probar el sistema: clientes, turnos de los últimos 30 días y de las próximas dos semanas, cobros, ventas, compras, gastos y stock. ' +
        'Usa los barberos, los servicios y el horario que ya están cargados, y solo ocupa horas libres.</p>' +
      '<div class="prod-form-acciones"><button type="button" class="btn btn-negro btn-mini" data-accion="prueba-cargar" data-foco="prueba-cargar"' + (ocupado ? ' disabled' : '') + '>' +
        (f.enviando === 'cargar' ? 'Cargando…' : 'Cargar datos de prueba') + '</button></div>' +
      '<h3 class="pa-h3 prueba-cero">Empezar de cero</h3>' +
      '<p>Borra todos los turnos, los clientes, la caja y el stock (también los de prueba). Quedan los barberos y sus accesos, las fotos, los servicios con sus precios y el horario.</p>' +
      (f.confirmar
        ? '<div class="bb-quitar" role="group" aria-labelledby="pb-q-t"><p id="pb-q-t"><strong>¿Borrar todo y empezar de cero?</strong> No se puede deshacer.</p>' +
          '<div class="prod-form-acciones"><button type="button" class="btn btn-rojo btn-mini" data-accion="prueba-borrar-si" data-foco="pb-borrar-si"' + (ocupado ? ' disabled' : '') + '>' +
            (f.enviando === 'borrar' ? 'Borrando…' : 'Sí, borrar todo') + '</button>' +
          '<button type="button" class="link-btn" data-accion="prueba-borrar-no" data-foco="pb-borrar-no">No</button></div></div>'
        : '<div class="prod-form-acciones"><button type="button" class="btn btn-linea btn-mini btn-peligro" data-accion="prueba-borrar" data-foco="prueba-borrar"' + (ocupado ? ' disabled' : '') + '>Empezar de cero</button>' +
          '<button type="button" class="link-btn" data-accion="prueba-cerrar">Cerrar</button></div>') +
    '</section>';
  }
  // Primero salen los cambios pendientes; después el pedido; al final se vuelve a cargar todo el panel
  function pedidoDePrueba(que, ruta, cuerpo, listo) {
    if (!P.prueba || P.prueba.enviando) return;
    P.prueba.enviando = que;
    renderPanel(que === 'cargar' ? 'prueba-cargar' : 'pb-borrar-si');
    sincronizarYa();
    encolar(function () {
      return pedir('POST', ruta, cuerpo).then(function (r) {
        P.prueba = null;
        return cargarPanel(listo(r), true);
      }, function (e) {
        if (e.estado === 401) { sesionVencida('La sesión se cerró. Ingresá de nuevo.'); return; }
        if (P.prueba) { P.prueba.enviando = ''; P.prueba.confirmar = false; }
        avisar(mensajeDe(e, 'No se pudo hacer. Probá de nuevo.'), true);
        renderPanelSeguro();
      });
    });
  }
  function cargarPrueba() {
    pedidoDePrueba('cargar', '/api/panel/prueba', {}, function (r) {
      var x = r.resumen || {};
      return 'Se cargaron los datos de prueba: ' + plural(x.turnos || 0, 'turno', 'turnos') + ', ' + plural(x.clientes || 0, 'cliente', 'clientes') + ' y ' +
        plural(x.caja || 0, 'movimiento de caja', 'movimientos de caja') + '.';
    });
  }
  function borrarTodo() {
    pedidoDePrueba('borrar', '/api/panel/empezar-de-cero', { confirmar: 'BORRAR' }, function () {
      return 'Listo: se borraron los turnos, los clientes, la caja y el stock. El sistema quedó en cero.';
    });
  }

  function iniciarRemoto() {
    panelEl.addEventListener('submit', function (e) {
      var f = e.target;
      e.preventDefault();
      if (f.id === 'pa-login') ingresar();
      else if (f.id === 'pa-mi-clave') cambiarMiClave();
      else if (f.getAttribute('data-form') === 'cuenta') guardarCuenta();
    });
    if (esRutaPanel() && TOKEN) cargarPanel();
    else {
      sitioGuardado();
      if (SITIO.cargado) redibujarSitio();
      cargarSitio();
    }
    setInterval(function () { if (PANEL.listo) buscarNovedades(); }, 15000);
    setInterval(function () { if (!PANEL.listo && !R.enviando) cargarSitio(); }, 120000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (PANEL.listo) buscarNovedades(); else if (!R.enviando) cargarSitio();
    });
    window.addEventListener('online', function () { if (PANEL.listo) sincronizar(); });
    // Antes de cerrar la pestaña, avisar si quedaron cambios sin guardar
    window.addEventListener('beforeunload', function (e) {
      if (PANEL.listo && (!colaQuieta() || paqueteCambios())) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ===================== Navegación entre sitio y panel ===================== */
  function esRutaPanel() { return location.pathname.replace(/\/+$/, '') === RUTA_PANEL; }
  function mostrarVista() {
    // Con la base de datos el panel está solo en /acceso-barberos; en demostración, en #panel
    var enPanel = REMOTO ? esRutaPanel() : (location.hash === '#panel' || location.hash === '#atender');
    if (location.hash === '#atender') { P.vista = 'atender'; P.atVer = null; }
    document.getElementById('sitio').hidden = enPanel;
    panelEl.hidden = !enPanel;
    document.title = enPanel ? (REMOTO ? 'Panel | Tommy Barber' : 'Panel del dueño | Tommy Barber') : 'Tommy Barber | Barbería en Quiindy';
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
  if (FOTOS.logo || FOTOS.fachada || FOTOS.galeria) aplicarFotos();  // si no hay fotos cambiadas, la página queda como vino
  renderPrecios();
  renderHorarios();
  renderEstadoHero();
  renderHeroTurno();
  renderReserva();
  mostrarVista();
  if (REMOTO) iniciarRemoto();

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
      // En Atender se actualiza el "le toca en X min" y quién es el actual
      if (P.vista === 'atender' && !P.llegada && !P.preview) renderPanel();
    }
  }, 30000);
})();
