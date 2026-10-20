/* Tommy Barber: datos del local, reserva de turnos y panel del dueño.
   Los datos que hay que confirmar con el dueño están al principio (SERVICIOS, HORAS, PIN_DUENO). */
(function () {
  'use strict';

  /* ===================== Datos del local ===================== */
  var MAPS = 'https://maps.app.goo.gl/TG3mWFFuAyfFZYSr5';
  var PIN_DUENO = '2121';
  var CLAVE_RESERVAS = 'tommybarber-reservas';

  var SERVICIOS = [
    { id: 'corte', nombre: 'Corte', detalle: 'A máquina o tijera, con terminación a navaja.', min: 30, precio: 25000 },
    { id: 'degrade', nombre: 'Degradé', detalle: 'Bajo, medio o alto, prolijo en la nuca y las patillas.', min: 45, precio: 30000 },
    { id: 'corte-barba', nombre: 'Corte y barba', detalle: 'El corte que elijas más el perfilado de la barba.', min: 60, precio: 40000 },
    { id: 'barba', nombre: 'Barba', detalle: 'Perfilado y rebaje con navaja.', min: 20, precio: 15000 },
    { id: 'ninos', nombre: 'Corte para niños', detalle: 'Hasta 12 años.', min: 30, precio: 20000 },
    { id: 'platinado', nombre: 'Platinado', detalle: 'Decoloración y matiz. El precio final depende del largo.', min: 120, precio: 90000, desde: true }
  ];
  var SERV = {};
  SERVICIOS.forEach(function (s) { SERV[s.id] = s; });

  // Horario de atención en minutos desde la medianoche (del contestador automático)
  var HORAS = {
    0: [],
    1: [[480, 690], [780, 1050]],
    2: [[480, 690], [780, 1050]],
    3: [[480, 690], [780, 1050]],
    4: [[480, 690], [780, 1050]],
    5: [[480, 1050]],
    6: [[480, 1050]]
  };
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MEDIOS = ['Efectivo', 'Transferencia', 'Billetera'];
  var COMO_PAGO = { Efectivo: 'en efectivo', Transferencia: 'por transferencia', Billetera: 'con billetera electrónica', Varios: 'con varios medios' };

  /* ===================== Utilidades ===================== */
  function pad(n) { return String(n).padStart(2, '0'); }
  function hhmm(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function aMin(t) { return parseInt(String(t).slice(0, 2), 10) * 60 + parseInt(String(t).slice(3, 5), 10); }
  function miles(n) { return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function gs(n) { return 'Gs. ' + miles(n); }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function minus(t) { return t.charAt(0).toLowerCase() + t.slice(1); }
  function durTxt(m) { return m >= 60 ? (m === 60 ? '1 hora' : (m / 60) + ' horas') : m + ' min'; }
  function precioDe(s) { return (s.desde ? 'desde ' : '') + gs(s.precio); }
  function claveDe(y, mo, d) { return y + '-' + pad(mo) + '-' + pad(d); }
  function fechaDe(c) { return new Date(Date.UTC(+c.slice(0, 4), +c.slice(5, 7) - 1, +c.slice(8, 10))); }
  function suma(arr) { return arr.reduce(function (a, m) { return a + m.monto; }, 0); }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
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

  // Fecha y hora de Paraguay, aunque el dispositivo esté en otra zona horaria
  function ahoraPY() {
    var f = new Date();
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

  /* ===================== Reservas guardadas en el navegador ===================== */
  function cargarReservas() {
    try {
      var hoy = ahoraPY().clave;
      var l = JSON.parse(localStorage.getItem(CLAVE_RESERVAS) || '[]');
      if (!Array.isArray(l)) return [];
      return l.filter(function (r) { return r && r.fecha && r.hora && SERV[r.servicio] && r.fecha >= hoy; })
        .map(function (r) { return Object.assign({}, r, { min: r.min != null ? r.min : aMin(r.hora) }); });
    } catch (e) { return []; }
  }
  function guardarReservas() {
    try { localStorage.setItem(CLAVE_RESERVAS, JSON.stringify(reservasWeb.slice(-40))); } catch (e) { /* sin almacenamiento */ }
  }
  var reservasWeb = cargarReservas();

  /* ===================== Panel: datos de ejemplo ===================== */
  function sembrarPanel() {
    var h = ahoraPY();
    var medios = ['Efectivo', 'Efectivo', 'Transferencia', 'Efectivo', 'Billetera', 'Efectivo', 'Transferencia'];
    var semana = [
      [480, 'Derlis Ortiz', 'corte'], [510, 'Matías Benítez', 'degrade'], [570, 'Nahuel Cáceres', 'corte-barba'],
      [630, 'Fabrizio Giménez', 'barba', true], [660, 'Hugo Ayala', 'corte'], [780, 'Rodrigo Villalba', 'degrade'],
      [840, 'Iván Rolón', 'ninos'], [870, 'Óscar Duarte', 'corte-barba'], [960, 'Lucas Brítez', 'degrade'],
      [1020, 'Elías Martínez', 'barba']
    ];
    var finde = [
      [480, 'Tobías Aquino', 'corte'], [510, 'Derlis Ortiz', 'degrade'], [570, 'Junior Ramírez', 'corte-barba'],
      [630, 'Matías Benítez', 'corte'], [690, 'Hugo Ayala', 'barba', true], [720, 'Nahuel Cáceres', 'degrade'],
      [810, 'Rodrigo Villalba', 'corte'], [840, 'Iván Rolón', 'ninos'], [900, 'Óscar Duarte', 'corte-barba'],
      [960, 'Lucas Brítez', 'degrade'], [1020, 'Elías Martínez', 'corte']
    ];
    var plantilla = h.wd === 0 ? [] : (h.wd >= 5 ? finde : semana);
    var mov = [];
    var nId = 1;
    var agenda = plantilla.map(function (p, i) {
      var s = SERV[p[2]];
      var fin = p[0] + s.min;
      var estado = 'confirmado';
      var medio = '';
      if (p[3] && fin <= h.min) {
        estado = 'novino';
      } else if (fin <= h.min) {
        estado = 'atendido';
        medio = medios[i % medios.length];
        mov.push({ id: 'm' + (nId++), fecha: h.clave, min: fin, tipo: 'entrada', cat: 'servicio', concepto: s.nombre + ', ' + p[1], monto: s.precio, medio: medio });
      } else if (p[0] <= h.min) {
        estado = 'silla';
      }
      return { id: 'a' + i, min: p[0], cliente: p[1], servicio: s.id, estado: estado, medio: medio, web: false };
    });
    if (h.wd !== 0) {
      [
        [520, 'salida', 'gasto', 'Bidón de agua', 12000, 'Efectivo'],
        [605, 'entrada', 'producto', 'Venta: Cera mate', 35000, 'Efectivo'],
        [920, 'entrada', 'producto', 'Venta: Aceite para barba', 45000, 'Transferencia']
      ].forEach(function (e) {
        if (e[0] <= h.min) mov.push({ id: 'm' + (nId++), fecha: h.clave, min: e[0], tipo: e[1], cat: e[2], concepto: e[3], monto: e[4], medio: e[5] });
      });
    }
    var base = Date.UTC(h.y, h.mo - 1, h.d);
    for (var k = 1; k <= 40; k++) {
      var t = new Date(base - k * 86400000);
      var wd = t.getUTCDay();
      if (wd === 0) continue;
      var clave = claveDe(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
      var r = rng(hashTxt(clave));
      var turnos = (wd >= 5 ? 11 : 8) + Math.floor(r() * 5);
      var ticket = 26000 + Math.floor(r() * 6) * 1000;
      mov.push({ id: 'm' + (nId++), fecha: clave, min: 1050, tipo: 'entrada', cat: 'servicio', concepto: 'Servicios del día', monto: turnos * ticket, medio: 'Varios', turnos: turnos });
      var vendidos = Math.floor(r() * 4);
      if (vendidos > 0) {
        mov.push({ id: 'm' + (nId++), fecha: clave, min: 1050, tipo: 'entrada', cat: 'producto', concepto: 'Productos vendidos', monto: vendidos * (32000 + Math.floor(r() * 4) * 3000), medio: 'Varios', cantidad: vendidos });
      }
      var dm = t.getUTCDate();
      var gasto = null;
      if (dm === 5) gasto = ['Mercadería: ceras y pomadas', 420000, 'Transferencia'];
      else if (dm === 8) gasto = ['ANDE (luz)', 185000, 'Transferencia'];
      else if (dm === 12) gasto = ['Internet', 140000, 'Transferencia'];
      else if (r() < 0.25) gasto = r() < 0.5 ? ['Bidón de agua', 12000, 'Efectivo'] : ['Talco y alcohol', 32000, 'Efectivo'];
      if (gasto) mov.push({ id: 'm' + (nId++), fecha: clave, min: 1000, tipo: 'salida', cat: 'gasto', concepto: gasto[0], monto: gasto[1], medio: gasto[2] });
    }
    var productos = [
      { id: 'cera', tipo: 'venta', nombre: 'Cera mate', detalle: 'Pote de 100 g', precio: 35000, stock: 8, minimo: 3, uni: ['pote', 'potes'] },
      { id: 'pomada', tipo: 'venta', nombre: 'Pomada con brillo', detalle: 'Pote de 100 g', precio: 35000, stock: 5, minimo: 3, uni: ['pote', 'potes'] },
      { id: 'polvo', tipo: 'venta', nombre: 'Polvo texturizador', detalle: 'Frasco de 20 g', precio: 40000, stock: 2, minimo: 3, uni: ['frasco', 'frascos'] },
      { id: 'aceite', tipo: 'venta', nombre: 'Aceite para barba', detalle: 'Gotero de 30 ml', precio: 45000, stock: 4, minimo: 2, uni: ['gotero', 'goteros'] },
      { id: 'shampoo', tipo: 'venta', nombre: 'Shampoo para barba', detalle: 'Botella de 200 ml', precio: 38000, stock: 6, minimo: 2, uni: ['botella', 'botellas'] },
      { id: 'gel', tipo: 'venta', nombre: 'Gel de fijación fuerte', detalle: 'Pote de 250 g', precio: 18000, stock: 10, minimo: 4, uni: ['pote', 'potes'] },
      { id: 'hojas', tipo: 'insumo', nombre: 'Hojas de afeitar', detalle: 'Caja de 100', precio: 0, stock: 1, minimo: 2, uni: ['caja', 'cajas'] },
      { id: 'talco', tipo: 'insumo', nombre: 'Talco', detalle: 'Frasco de 300 g', precio: 0, stock: 3, minimo: 1, uni: ['frasco', 'frascos'] },
      { id: 'alcohol', tipo: 'insumo', nombre: 'Alcohol al 70 %', detalle: 'Botella de 1 litro', precio: 0, stock: 2, minimo: 1, uni: ['botella', 'botellas'] },
      { id: 'cuellos', tipo: 'insumo', nombre: 'Cuellos descartables', detalle: 'Rollo de 100', precio: 0, stock: 4, minimo: 2, uni: ['rollo', 'rollos'] }
    ];
    return { agenda: agenda, mov: mov, productos: productos, nId: nId };
  }

  var P = Object.assign(sembrarPanel(), {
    acceso: false,
    pin: '',
    pinError: false,
    vista: 'hoy',
    cobrando: null,
    periodo: 'hoy',
    form: { tipo: 'entrada', concepto: '', monto: '', medio: 'Efectivo' },
    avisoCaja: '',
    avisoProd: '',
    tabProd: 'venta',
    nuevoAbierto: false,
    np: { nombre: '', tipo: 'venta', precio: '', stock: '', minimo: '' },
    barra: null
  });

  function agregarAgenda(r) {
    var id = 'w' + r.codigo;
    if (P.agenda.some(function (a) { return a.id === id; })) return;
    P.agenda.push({ id: id, min: r.min, cliente: r.cliente, servicio: r.servicio, estado: 'confirmado', medio: '', web: true });
  }
  (function () {
    var hoy = ahoraPY().clave;
    reservasWeb.filter(function (r) { return r.fecha === hoy; }).forEach(agregarAgenda);
  })();

  /* ===================== Sitio ===================== */
  function renderEstadoHero() {
    var e = estadoLocal(ahoraPY());
    document.getElementById('estado-titulo').textContent = e.titulo;
    document.getElementById('estado-detalle').textContent = e.detalle;
    document.getElementById('poste-tubo').classList.toggle('gira', e.abierto);
    document.getElementById('poste-globo').classList.toggle('prendido', e.abierto);
  }

  function renderPrecios() {
    document.getElementById('lista-precios').innerHTML = SERVICIOS.map(function (s) {
      return '<div class="precio-fila">' +
        '<div class="precio-linea"><span class="precio-nombre">' + s.nombre + '</span><span class="precio-puntos" aria-hidden="true"></span><span class="precio-valor">' + precioDe(s) + '</span></div>' +
        '<a class="btn btn-linea" href="#reservar" data-reservar="' + s.id + '" aria-label="Reservar ' + s.nombre + '">Reservar</a>' +
        '<p class="precio-desc">' + durTxt(s.min) + '. ' + s.detalle + '</p>' +
      '</div>';
    }).join('');
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

  /* ===================== Reserva de turnos ===================== */
  var R = { paso: 1, servicio: null, diaIdx: null, hora: null, nombre: '', tel: '', nota: '', ticket: null };

  function bloques(m) { return Math.ceil(m / 30); }

  function modeloReserva() {
    var h = ahoraPY();
    var serv = SERV[R.servicio] || null;
    var dur = serv ? serv.min : 30;
    // Horarios tomados: reservas hechas desde la web y la agenda real de hoy
    var tomadosWeb = {};
    reservasWeb.forEach(function (r) {
      for (var j = 0; j < bloques(SERV[r.servicio].min); j++) tomadosWeb[r.fecha + '-' + (r.min + j * 30)] = true;
    });
    var agendaHoy = {};
    P.agenda.forEach(function (a) {
      if (a.estado === 'novino') return;
      var s = SERV[a.servicio];
      for (var j = 0; j < bloques(s ? s.min : 30); j++) agendaHoy[a.min + j * 30] = true;
    });
    function ocupado(clave, m) {
      if (tomadosWeb[clave + '-' + m]) return true;
      if (clave === h.clave) return !!agendaHoy[m];
      return hashTxt(clave + '|' + m) % 100 < 34;
    }
    var base = Date.UTC(h.y, h.mo - 1, h.d);
    var lista = [];
    for (var k = 0; k < 14; k++) {
      var t = new Date(base + k * 86400000);
      var wd = t.getUTCDay();
      var clave = claveDe(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
      var slots = [];
      HORAS[wd].forEach(function (tr) {
        for (var m = tr[0]; m + dur <= tr[1]; m += 30) {
          if (k === 0 && m <= h.min + 15) continue;
          var libre = true;
          for (var j = 0; j < bloques(dur); j++) if (ocupado(clave, m + j * 30)) libre = false;
          slots.push({ m: m, libre: libre });
        }
      });
      lista.push({ k: k, wd: wd, clave: clave, d: t.getUTCDate(), mo: t.getUTCMonth(), slots: slots, libres: slots.filter(function (s) { return s.libre; }).length, cerrado: HORAS[wd].length === 0 });
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
    var digitos = R.tel.replace(/\D/g, '');
    var nombreOk = R.nombre.trim().length >= 2;
    var telOk = digitos.length >= 9 && digitos.length <= 13;
    var resumen = '', btnTxt = '', puede = false;
    if (paso === 1) {
      resumen = serv ? serv.nombre + ', ' + precioDe(serv) + ', ' + durTxt(serv.min) : 'Elegí un servicio para seguir.';
      btnTxt = 'Elegir día y hora';
      puede = !!serv;
    } else if (paso === 2) {
      resumen = serv.nombre + (horaSel != null ? ', ' + DIAS[dia.wd] + ' ' + dia.d + ' a las ' + hhmm(horaSel) : '. Elegí un horario libre.');
      btnTxt = 'Seguir con mis datos';
      puede = horaSel != null;
    } else if (paso === 3) {
      if (horaSel == null) resumen = 'Ese horario ya no está libre. Volvé al paso 2 y elegí otro.';
      else if (!nombreOk) resumen = 'Falta tu nombre.';
      else if (!telOk) resumen = 'Falta tu número de WhatsApp.';
      else resumen = serv.nombre + ', ' + DIAS[dia.wd] + ' ' + dia.d + ' a las ' + hhmm(horaSel);
      btnTxt = 'Confirmar turno';
      puede = nombreOk && telOk && horaSel != null;
    }
    return {
      h: h, serv: serv, lista: lista, dia: dia, horaSel: horaSel, paso: paso, nivel: nivel,
      resumen: resumen, btnTxt: btnTxt, puede: puede, digitos: digitos,
      telAyuda: digitos.length === 0 || telOk ? 'Te escribimos solo si hay algún cambio en tu turno.' : 'Escribilo con el 09 adelante, por ejemplo 0981 123 456.'
    };
  }

  function diaLargo(x) { return DIAS[x.wd] + ' ' + x.d + ' de ' + MESES[x.mo]; }

  function cuerpoReserva(v) {
    if (v.paso === 1) {
      return '<fieldset class="rv-fieldset"><legend class="rv-legend" id="rv-foco" tabindex="-1">¿Qué te hacemos?</legend><div class="rv-servicios">' +
        SERVICIOS.map(function (s) {
          var el = s.id === R.servicio;
          return '<button type="button" class="rv-servicio' + (el ? ' elegido' : '') + '" data-accion="servicio" data-id="' + s.id + '" data-foco="s-' + s.id + '" aria-pressed="' + el + '">' +
            '<span class="rv-s-nombre condensada">' + s.nombre + '</span><span class="rv-s-precio condensada">' + precioDe(s) + '</span><span class="rv-s-dur">' + durTxt(s.min) + '</span></button>';
        }).join('') + '</div></fieldset>';
    }
    if (v.paso === 2) {
      var dias = v.lista.map(function (x) {
        var el = x.k === v.dia.k;
        var bloq = x.libres === 0;
        var nota = x.k === 0 ? 'hoy' : (x.k === 1 ? 'mañana' : '');
        if (x.cerrado) nota = 'cerrado'; else if (bloq) nota = 'sin lugar';
        var aria = diaLargo(x) + (x.cerrado ? ', cerrado' : (bloq ? ', sin lugar' : ', ' + plural(x.libres, 'horario libre', 'horarios libres')));
        return '<button type="button" class="rv-dia' + (el ? ' elegido' : '') + '" data-accion="dia" data-k="' + x.k + '" data-foco="d-' + x.k + '" aria-pressed="' + el + '" aria-label="' + aria + '"' + (bloq ? ' disabled' : '') + '>' +
          '<span class="rv-dia-sem">' + SEM[x.wd] + '</span><span class="rv-dia-num condensada">' + x.d + '</span><span class="rv-dia-nota">' + nota + '</span></button>';
      }).join('');
      var boton = function (s) {
        var el = s.m === v.horaSel;
        return '<button type="button" class="rv-hora' + (el ? ' elegido' : '') + '" data-accion="hora" data-k="' + v.dia.k + '" data-m="' + s.m + '" data-foco="h-' + s.m + '" aria-pressed="' + el + '" aria-label="' + hhmm(s.m) + (s.libre ? '' : ', ocupado') + '"' + (s.libre ? '' : ' disabled') + '>' + hhmm(s.m) + '</button>';
      };
      var franjas = [['Mañana', v.dia.slots.filter(function (s) { return s.m < 720; })], ['Tarde', v.dia.slots.filter(function (s) { return s.m >= 720; })]]
        .filter(function (f) { return f[1].length > 0; });
      return '<p class="rv-sub" id="rv-foco" tabindex="-1">Elegí el día</p><div class="rv-dias">' + dias + '</div>' +
        '<p class="rv-sub">Horarios para el ' + DIAS[v.dia.wd] + ' ' + v.dia.d + '</p>' +
        (v.dia.libres === 0 ? '<p class="rv-aviso">Ese día no queda lugar para ' + minus(v.serv.nombre) + '. Elegí otro día de la lista.</p>' : '') +
        franjas.map(function (f) { return '<p class="rv-franja">' + f[0] + '</p><div class="rv-horas">' + f[1].map(boton).join('') + '</div>'; }).join('');
    }
    if (v.paso === 3) {
      return '<div class="rv-form">' +
        '<p class="rv-sub" id="rv-foco" tabindex="-1" style="padding-bottom:0">Tus datos</p>' +
        '<div><label for="rv-nombre">Tu nombre</label><input class="campo" id="rv-nombre" data-campo="nombre" type="text" autocomplete="name" maxlength="60" value="' + esc(R.nombre) + '"></div>' +
        '<div><label for="rv-tel">Tu número de WhatsApp</label><input class="campo" id="rv-tel" data-campo="tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0981 123 456" aria-describedby="rv-tel-ayuda" value="' + esc(R.tel) + '"><p class="rv-ayuda" id="rv-tel-ayuda">' + v.telAyuda + '</p></div>' +
        '<div><label for="rv-nota">Algo que tengamos que saber <span class="suave" style="font-weight:400">(opcional)</span></label><textarea class="campo" id="rv-nota" data-campo="nota" rows="3" maxlength="200">' + esc(R.nota) + '</textarea></div>' +
        '<div class="rv-resumen-caja"><p>' + v.serv.nombre + '</p><p>' + (v.horaSel != null ? cap(diaLargo(v.dia)) + ' a las ' + hhmm(v.horaSel) : 'Elegí un horario en el paso 2.') + '</p><p>' + precioDe(v.serv) + ', se paga en la barbería.</p></div>' +
      '</div>';
    }
    var t = R.ticket;
    return '<div class="rv-ticket">' +
        '<p class="rv-jajotopata">¡Jajotopata!</p>' +
        '<p class="rv-confirmado condensada" id="rv-foco" tabindex="-1">Turno confirmado</p>' +
        '<dl><dt>Servicio</dt><dd>' + esc(t.servicio) + '</dd><dt>Día</dt><dd>' + esc(t.dia) + '</dd><dt>Hora</dt><dd>' + esc(t.hora) + '</dd>' +
        '<dt>A nombre de</dt><dd>' + esc(t.cliente) + '</dd><dt>Precio</dt><dd>' + esc(t.precio) + '</dd><dt>Código</dt><dd>' + esc(t.codigo) + '</dd></dl>' +
        '<div class="rv-corte" aria-hidden="true"></div>' +
        '<p class="rv-ticket-nota">Te esperamos en Constitución esquina, Quiindy. Si no podés venir, avisanos por Instagram y liberamos el horario.</p>' +
      '</div>' +
      '<div class="rv-acciones"><a class="btn btn-negro" href="' + MAPS + '" target="_blank" rel="noopener">Cómo llegar</a><button type="button" class="btn btn-linea" data-accion="otro" data-foco="otro">Reservar otro turno</button></div>';
  }

  function renderReserva(focoPaso) {
    var caja = document.getElementById('reserva');
    var tira = caja.querySelector('.rv-dias');
    var scrollTira = tira ? tira.scrollLeft : 0;
    var activo = document.activeElement;
    var foco = activo && caja.contains(activo) ? activo.getAttribute('data-foco') : null;
    var v = modeloReserva();
    var pasos = ['Servicio', 'Día y hora', 'Tus datos'].map(function (n, i) {
      var num = i + 1;
      var bloq = num > v.nivel || num === v.paso;
      return '<li><button type="button" class="rv-paso' + (num <= v.paso ? ' activo' : '') + '" data-accion="paso" data-n="' + num + '" data-foco="p-' + num + '"' + (bloq ? ' disabled' : '') + (num === v.paso ? ' aria-current="step"' : '') + '><b>' + num + '</b> ' + n + '</button></li>';
    }).join('');
    caja.innerHTML = '<div class="rv">' +
      '<div class="rv-cabeza"><div class="rv-titulo-fila"><span class="logo logo-44" aria-hidden="true"></span><h3 class="rv-titulo condensada">Reservar turno</h3><span class="rv-paso-txt">' + (v.paso < 4 ? 'Paso ' + v.paso + ' de 3' : 'Listo') + '</span></div>' +
      (v.paso < 4 ? '<ol class="rv-pasos" aria-label="Pasos de la reserva">' + pasos + '</ol>' : '') + '</div>' +
      '<div class="rv-cuerpo">' + cuerpoReserva(v) + '</div>' +
      (v.paso < 4 ? '<div class="rv-pie"><p class="rv-resumen" id="rv-resumen" aria-live="polite">' + esc(v.resumen) + '</p><button type="button" class="btn btn-rojo" id="rv-seguir" data-accion="seguir" data-foco="seguir"' + (v.puede ? '' : ' disabled') + '>' + v.btnTxt + '</button></div>' : '') +
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

  function confirmarReserva(v) {
    var s = v.serv;
    var dia = v.dia;
    var m = v.horaSel;
    var codigo = 'TB-' + (1000 + hashTxt(R.nombre + v.digitos + dia.clave + m + Date.now()) % 9000);
    var r = { codigo: codigo, servicio: s.id, servicioNombre: s.nombre, precio: s.precio, fecha: dia.clave, hora: hhmm(m), min: m, cliente: R.nombre.trim(), tel: R.tel.trim(), nota: R.nota.trim() };
    reservasWeb.push(r);
    guardarReservas();
    if (dia.clave === v.h.clave) agregarAgenda(r);
    R.ticket = { servicio: s.nombre, dia: cap(diaLargo(dia)), hora: hhmm(m), cliente: r.cliente, precio: precioDe(s), codigo: codigo };
    R.paso = 4;
    R.hora = null;
    R.diaIdx = null;
  }

  var cajaReserva = document.getElementById('reserva');
  cajaReserva.addEventListener('click', function (e) {
    var b = e.target.closest('[data-accion]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-accion');
    if (a === 'servicio') { R.servicio = b.getAttribute('data-id'); R.hora = null; renderReserva(); }
    else if (a === 'paso') { R.paso = +b.getAttribute('data-n'); renderReserva(true); }
    else if (a === 'dia') { R.diaIdx = +b.getAttribute('data-k'); R.hora = null; renderReserva(); }
    else if (a === 'hora') { R.diaIdx = +b.getAttribute('data-k'); R.hora = +b.getAttribute('data-m'); renderReserva(); }
    else if (a === 'seguir') {
      var v = modeloReserva();
      if (!v.puede) return;
      if (v.paso === 1) R.paso = 2;
      else if (v.paso === 2) { R.paso = 3; R.diaIdx = v.dia.k; }
      else if (v.paso === 3) confirmarReserva(v);
      renderReserva(true);
    }
    else if (a === 'otro') {
      R.paso = 1; R.servicio = null; R.hora = null; R.diaIdx = null; R.ticket = null; R.nota = '';
      renderReserva(true);
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
    R.servicio = a.getAttribute('data-reservar');
    R.paso = 2; R.diaIdx = null; R.hora = null; R.ticket = null;
    renderReserva();
  });

  /* ===================== Panel del dueño ===================== */
  var ICONOS = {
    hoy: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    caja: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    productos: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>'
  };
  var DIENTES = '0,0 ' + Array.from({ length: 25 }, function (_, i) { return (i * 12 + 6) + ',10 ' + (i * 12 + 12) + ',0'; }).join(' ');
  var ultimaSemana = [];

  function modeloPanel() {
    var h = ahoraPY();
    var est = estadoLocal(h);
    var agendaOrd = P.agenda.slice().sort(function (a, b) { return a.min - b.min; });
    var movHoy = P.mov.filter(function (m) { return m.fecha === h.clave; }).sort(function (a, b) { return a.min - b.min; });
    var entradasHoy = movHoy.filter(function (m) { return m.tipo === 'entrada'; });
    var salidasHoy = movHoy.filter(function (m) { return m.tipo === 'salida'; });
    var entHoy = suma(entradasHoy);
    var salHoy = suma(salidasHoy);
    var efectivoHoy = suma(entradasHoy.filter(function (m) { return m.medio === 'Efectivo'; }));
    var atendidos = P.agenda.filter(function (a) { return a.estado === 'atendido'; }).length;
    var faltas = P.agenda.filter(function (a) { return a.estado === 'novino'; }).length;
    var pendientes = P.agenda.filter(function (a) { return a.estado === 'confirmado' || a.estado === 'silla'; }).length;
    var prodHoy = entradasHoy.filter(function (m) { return m.cat === 'producto'; });

    var cifrasHoy = [
      { label: 'Cobrado hoy', valor: gs(entHoy), nota: 'En efectivo: ' + gs(efectivoHoy) },
      P.agenda.length
        ? { label: 'Turnos atendidos', valor: atendidos + ' de ' + P.agenda.length, nota: faltas === 0 ? 'Nadie faltó' : (faltas === 1 ? '1 cliente no vino' : faltas + ' clientes no vinieron') }
        : { label: 'Turnos atendidos', valor: '0', nota: 'Hoy no hay turnos' },
      { label: 'Productos vendidos', valor: String(prodHoy.length), nota: prodHoy.length ? 'Suman ' + gs(suma(prodHoy)) : 'Ninguno todavía' },
      { label: 'Gastos de hoy', valor: gs(salHoy), nota: salidasHoy.length ? salidasHoy[salidasHoy.length - 1].concepto : 'Sin gastos' }
    ];

    var nombresEstado = { confirmado: 'Confirmado', silla: 'En la silla', atendido: 'Cobrado', novino: 'No vino' };
    var agenda = agendaOrd.map(function (t) {
      var s = SERV[t.servicio] || { nombre: 'Servicio', precio: 0 };
      var cob = P.cobrando === t.id;
      return {
        id: t.id, estado: t.estado, web: t.web, cobrando: cob,
        hora: hhmm(t.min),
        cliente: t.cliente,
        nombreCorto: t.cliente.split(' ')[0],
        detalle: s.nombre + ', ' + gs(s.precio) + (t.estado === 'atendido' && t.medio ? '. Pagó ' + (COMO_PAGO[t.medio] || t.medio) : ''),
        estadoTxt: nombresEstado[t.estado] || 'Confirmado',
        cobrable: (t.estado === 'confirmado' || t.estado === 'silla') && !cob,
        puedeFaltar: t.estado === 'confirmado' && !cob
      };
    });

    var webProximas = reservasWeb.filter(function (w) { return w.fecha > h.clave; })
      .sort(function (a, b) { return (a.fecha + a.hora) < (b.fecha + b.hora) ? -1 : 1; })
      .slice(0, 6)
      .map(function (w) {
        var f = fechaDe(w.fecha);
        return { cuando: cap(DIAS[f.getUTCDay()]) + ' ' + f.getUTCDate() + ', ' + w.hora, quien: w.cliente + ', ' + w.servicioNombre, tel: w.tel };
      });

    // Semana de lunes a sábado
    var base = Date.UTC(h.y, h.mo - 1, h.d);
    var lunes = base - (h.wd === 0 ? 6 : h.wd - 1) * 86400000;
    var tl = new Date(lunes);
    var claveLunes = claveDe(tl.getUTCFullYear(), tl.getUTCMonth() + 1, tl.getUTCDate());
    var dias = [];
    for (var i = 0; i < 6; i++) {
      var t = new Date(lunes + i * 86400000);
      var clave = claveDe(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
      var ms = P.mov.filter(function (m) { return m.fecha === clave; });
      var esHoy = clave === h.clave;
      dias.push({
        i: i, wd: t.getUTCDay(), num: t.getUTCDate(), hoy: esHoy, futuro: t.getTime() > base,
        ent: suma(ms.filter(function (m) { return m.tipo === 'entrada'; })),
        turnos: esHoy ? atendidos : ms.filter(function (m) { return m.cat === 'servicio'; }).reduce(function (a, m) { return a + (m.turnos || 1); }, 0),
        prods: ms.filter(function (m) { return m.cat === 'producto' && m.tipo === 'entrada'; }).reduce(function (a, m) { return a + (m.cantidad || 1); }, 0)
      });
    }
    var maxSem = Math.max.apply(null, [1].concat(dias.map(function (d) { return d.ent; })));
    var idxHoy = dias.findIndex(function (d) { return d.hoy; });
    var selIdx = P.barra != null ? P.barra : (idxHoy >= 0 ? idxHoy : 5);
    var semana = dias.map(function (d) {
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

    // Caja por período
    var desde = P.periodo === 'hoy' ? h.clave : (P.periodo === 'semana' ? claveLunes : claveDe(h.y, h.mo, 1));
    var movsPer = P.mov.filter(function (m) { return m.fecha >= desde && m.fecha <= h.clave; });
    var entroArr = movsPer.filter(function (m) { return m.tipo === 'entrada'; });
    var salioArr = movsPer.filter(function (m) { return m.tipo === 'salida'; });
    var entro = suma(entroArr);
    var salio = suma(salioArr);
    var ganancia = entro - salio;
    var servPer = suma(entroArr.filter(function (m) { return m.cat === 'servicio'; }));
    var prodPer = entro - servPer;
    var pct = function (n) { return entro > 0 ? Math.round(n / entro * 100) : 0; };
    var notaPeriodo = P.periodo === 'hoy'
      ? cap(DIAS[h.wd]) + ' ' + h.d + ' de ' + MESES[h.mo - 1]
      : (P.periodo === 'semana' ? 'Desde el lunes ' + tl.getUTCDate() + ' de ' + MESES[tl.getUTCMonth()] : 'Del 1 al ' + h.d + ' de ' + MESES[h.mo - 1]);
    var cifrasCaja = [
      { label: 'Entró', valor: gs(entro), nota: notaPeriodo },
      { label: 'Salió', valor: gs(salio), nota: salioArr.length === 0 ? 'Sin gastos' : plural(salioArr.length, 'gasto', 'gastos') },
      { label: 'Ganancia', valor: (ganancia < 0 ? '− ' : '') + gs(ganancia), nota: entro > 0 ? 'Te queda el ' + pct(ganancia) + '% de lo que entró' : 'Todavía no entró plata' }
    ];
    var filasCaja;
    if (P.periodo === 'hoy') {
      filasCaja = movHoy.slice().reverse().map(function (m) {
        var tipo = m.tipo === 'salida' ? 'Gasto' : (m.cat === 'producto' ? 'Producto' : (m.cat === 'servicio' ? 'Servicio' : 'Otro ingreso'));
        return { titulo: hhmm(m.min) + ' ' + m.concepto, detalle: tipo + ', ' + (COMO_PAGO[m.medio] || m.medio), monto: (m.tipo === 'salida' ? '− ' : '+ ') + gs(m.monto), salida: m.tipo === 'salida' };
      });
    } else {
      var porDia = {};
      movsPer.forEach(function (m) { (porDia[m.fecha] = porDia[m.fecha] || []).push(m); });
      filasCaja = Object.keys(porDia).sort().reverse().map(function (clave) {
        var lista = porDia[clave];
        var f = fechaDe(clave);
        var esHoy = clave === h.clave;
        var ent = suma(lista.filter(function (m) { return m.tipo === 'entrada'; }));
        var gas = suma(lista.filter(function (m) { return m.tipo === 'salida'; }));
        var tur = esHoy ? atendidos : lista.filter(function (m) { return m.cat === 'servicio'; }).reduce(function (a, m) { return a + (m.turnos || 1); }, 0);
        var pro = lista.filter(function (m) { return m.cat === 'producto' && m.tipo === 'entrada'; }).reduce(function (a, m) { return a + (m.cantidad || 1); }, 0);
        return {
          titulo: cap(DIAS[f.getUTCDay()]) + ' ' + f.getUTCDate() + (esHoy ? ' (hoy)' : ''),
          detalle: plural(tur, 'turno', 'turnos') + ' y ' + plural(pro, 'producto', 'productos') + (gas > 0 ? '. Gastos: ' + gs(gas) : ''),
          monto: '+ ' + gs(ent),
          salida: false
        };
      });
    }

    // Productos
    var venta = P.productos.filter(function (p) { return p.tipo === 'venta'; });
    var insumos = P.productos.filter(function (p) { return p.tipo === 'insumo'; });
    var bajos = P.productos.filter(function (p) { return p.stock <= p.minimo; });
    var listaProd = (P.tabProd === 'venta' ? venta : insumos).map(function (p) {
      var bajo = p.stock <= p.minimo;
      return {
        id: p.id, nombre: p.nombre, tipo: p.tipo, bajo: bajo,
        detalle: (p.detalle ? p.detalle + '. ' : '') + 'Avisar cuando queden ' + p.minimo,
        precio: p.tipo === 'venta' ? gs(p.precio) : 'Uso del local',
        stock: p.stock,
        unidad: p.stock === 1 ? p.uni[0] : p.uni[1],
        barra: Math.min(100, Math.round(p.stock / Math.max(p.minimo * 3, 1) * 100))
      };
    });

    return {
      h: h, est: est, cifrasHoy: cifrasHoy, agenda: agenda, webProximas: webProximas,
      agendaResumen: P.agenda.length === 0 ? '' : (pendientes === 0 ? 'Todo atendido' : plural(pendientes, 'turno por atender', 'turnos por atender')),
      agendaVaciaTxt: h.wd === 0 ? 'Hoy domingo no se atiende. Mañana arrancás a las 08:00.' : 'No hay turnos para hoy todavía. Los que reserven por la web van a aparecer acá.',
      movHoy: movHoy, balanceHoy: entHoy - salHoy,
      semana: semana,
      cifrasCaja: cifrasCaja, filasCaja: filasCaja,
      servTxt: gs(servPer) + ' (' + pct(servPer) + '%)', prodTxt: gs(prodPer) + ' (' + pct(prodPer) + '%)',
      partServ: servPer > 0 ? servPer : (entro > 0 ? 0 : 1), partProd: prodPer > 0 ? prodPer : 0,
      venta: venta, insumos: insumos, bajos: bajos, listaProd: listaProd
    };
  }

  function cifra(c) {
    return '<div class="cifra"><p class="cifra-label">' + c.label + '</p><p class="cifra-valor">' + c.valor + '</p><p class="cifra-nota">' + esc(c.nota) + '</p></div>';
  }

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

  function plantillaHoy(v) {
    var turnos = v.agenda.map(function (t) {
      return '<li class="turno' + (t.estado === 'novino' ? ' novino' : '') + '">' +
        '<p class="turno-hora">' + t.hora + '</p>' +
        '<div style="min-width:0"><p class="turno-cliente">' + esc(t.cliente) + (t.web ? '<span class="tag-web">Reservó por la web</span>' : '') + '</p><p class="turno-det">' + esc(t.detalle) + '</p></div>' +
        '<div class="turno-acciones"><span class="pill pill-' + t.estado + '">' + t.estadoTxt + '</span>' +
          (t.cobrable ? '<button type="button" class="btn btn-negro btn-mini" data-accion="cobrar-abrir" data-id="' + t.id + '" data-foco="c-' + t.id + '">Cobrar</button>' : '') +
          (t.puedeFaltar ? '<button type="button" class="btn btn-linea btn-mini" data-accion="novino" data-id="' + t.id + '" data-foco="n-' + t.id + '">No vino</button>' : '') +
        '</div>' +
        (t.cobrando ? '<div class="cobro"><span class="cobro-pregunta">¿Cómo pagó ' + esc(t.nombreCorto) + '?</span>' +
          MEDIOS.map(function (m) { return '<button type="button" class="btn btn-claro btn-mini" data-accion="cobrar" data-id="' + t.id + '" data-medio="' + m + '" data-foco="m-' + t.id + '-' + m + '">' + m + '</button>'; }).join('') +
          '<button type="button" class="link-btn" data-accion="cobrar-cancelar" data-id="' + t.id + '">Cancelar</button></div>' : '') +
      '</li>';
    }).join('');
    var lineas = v.movHoy.map(function (m) {
      return '<div class="ticket-linea"><span><span class="ticket-hora">' + hhmm(m.min) + '</span>' + esc(m.concepto) + '</span><span class="monto' + (m.tipo === 'salida' ? ' salida' : '') + '">' + (m.tipo === 'salida' ? '− ' : '+ ') + gs(m.monto) + '</span></div>';
    }).join('');
    return '<div class="cifras">' + v.cifrasHoy.map(cifra).join('') + '</div>' +
      (v.webProximas.length ? '<section class="web-nuevas" aria-labelledby="pa-web"><h2 class="pa-h3" id="pa-web">Reservas nuevas desde la web</h2><ul>' +
        v.webProximas.map(function (w) { return '<li><b>' + esc(w.cuando) + '</b><span>' + esc(w.quien) + '</span><span class="suave">' + esc(w.tel) + '</span></li>'; }).join('') + '</ul></section>' : '') +
      '<div class="pa-dos">' +
        '<section class="pa-agenda" aria-labelledby="pa-agenda"><div class="agenda-cab"><h2 class="pa-h2" id="pa-agenda">Agenda</h2><span class="suave">' + v.agendaResumen + '</span></div>' +
          (v.agenda.length ? '<ol class="lista">' + turnos + '</ol>' : '<p class="vacio">' + v.agendaVaciaTxt + '</p>') + '</section>' +
        '<section class="pa-ticket" aria-labelledby="pa-cajahoy"><h2 class="pa-h2" id="pa-cajahoy" style="margin-bottom:10px">Caja de hoy</h2>' +
          '<div class="ticket">' + (lineas || '<p class="suave" style="margin:0 0 8px">Todavía no hay movimientos hoy.</p>') +
          '<div class="ticket-total"><span>Balance del día</span><span>' + (v.balanceHoy < 0 ? '− ' : '') + gs(v.balanceHoy) + '</span></div></div>' +
          '<svg class="ticket-dientes" viewBox="0 0 300 10" preserveAspectRatio="none" aria-hidden="true"><polygon points="' + DIENTES + '" fill="#FFFFFF"/></svg>' +
        '</section>' +
      '</div>' +
      '<section class="semana" aria-labelledby="pa-semana"><h2 class="pa-h2" id="pa-semana">Lo que entró esta semana</h2>' +
        '<p class="suave" style="margin:6px 0 0;font-size:15px">En guaraníes, sumando servicios y productos. Pasá o tocá una barra para ver el detalle.</p>' +
        '<div class="barras">' + v.semana.map(function (b) {
          return '<button type="button" class="barra' + (b.hoy ? ' hoy' : '') + (b.sel ? ' sel' : '') + '" data-accion="barra" data-barra="' + b.i + '" data-foco="b-' + b.i + '" aria-pressed="' + b.sel + '" aria-label="' + b.aria + '"><span class="barra-valor">' + b.valorTxt + '</span><span class="barra-col" style="height:' + b.alto + 'px"></span></button>';
        }).join('') + '</div>' +
        '<div class="barras-dias">' + v.semana.map(function (b) { return '<span' + (b.hoy ? ' class="hoy"' : '') + '>' + b.dia + '</span>'; }).join('') + '</div>' +
        '<p class="barra-detalle" id="pa-barra-detalle" aria-live="polite">' + (v.semana.find(function (b) { return b.sel; }) || v.semana[0]).detalle + '</p>' +
      '</section>';
  }

  function plantillaCaja(v) {
    var f = P.form;
    var puedeAnotar = f.concepto.trim() !== '' && parseInt(f.monto || '0', 10) > 0;
    return '<div class="segmentado" role="group" aria-label="Período">' +
        [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']].map(function (p) {
          return '<button type="button" data-accion="periodo" data-p="' + p[0] + '" data-foco="per-' + p[0] + '" aria-pressed="' + (P.periodo === p[0]) + '">' + p[1] + '</button>';
        }).join('') + '</div>' +
      '<div class="cifras" style="margin-top:20px">' + v.cifrasCaja.map(cifra).join('') + '</div>' +
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
          '<label for="pa-medio">Cómo se pagó</label><select class="campo" id="pa-medio" data-campo="form.medio">' +
            MEDIOS.map(function (m) { return '<option value="' + m + '"' + (f.medio === m ? ' selected' : '') + '>' + (m === 'Billetera' ? 'Billetera electrónica' : m) + '</option>'; }).join('') + '</select>' +
          '<button type="button" class="btn btn-rojo" id="pa-anotar-btn" data-accion="anotar" data-foco="anotar" style="width:100%;margin-top:18px"' + (puedeAnotar ? '' : ' disabled') + '>Anotar movimiento</button>' +
          '<p class="aviso" aria-live="polite">' + esc(P.avisoCaja) + '</p>' +
        '</section>' +
        '<section class="pa-movs" aria-labelledby="pa-movs"><h2 class="pa-h2" id="pa-movs" style="font-size:26px;margin-bottom:10px">' + (P.periodo === 'hoy' ? 'Movimientos de hoy' : 'Día por día') + '</h2>' +
          (v.filasCaja.length ? '<ol class="lista">' + v.filasCaja.map(function (r) {
            return '<li class="fila-caja"><p class="fila-titulo">' + esc(r.titulo) + '</p><p class="fila-monto' + (r.salida ? ' salida' : '') + '">' + r.monto + '</p><p class="fila-det">' + esc(r.detalle) + '</p></li>';
          }).join('') + '</ol>' : '<p class="vacio">Todavía no hay movimientos en este período.</p>') +
        '</section>' +
      '</div>';
  }

  function plantillaProductos(v) {
    var np = P.np;
    var puedeAgregar = np.nombre.trim().length >= 2 && np.stock !== '' && (np.tipo === 'insumo' || parseInt(np.precio || '0', 10) > 0);
    var alerta = v.bajos.length ? '<p class="alerta" role="status">Hay que reponer: ' + esc(listaY(v.bajos.map(function (p) {
      return p.nombre + ' (' + (p.stock === 0 ? 'se terminó' : (p.stock === 1 ? 'queda 1' : 'quedan ' + p.stock)) + ')';
    }))) + '.</p>' : '';
    var nuevo = P.nuevoAbierto ? '<section class="nuevo-prod" aria-labelledby="pa-nuevo"><h2 class="pa-h3" id="pa-nuevo" style="font-size:24px;margin-bottom:12px">Nuevo producto</h2><div class="nuevo-grilla">' +
        '<div><label for="np-nombre">Nombre</label><input class="campo" id="np-nombre" type="text" maxlength="50" data-campo="np.nombre" value="' + esc(np.nombre) + '"></div>' +
        '<div><label for="np-tipo">Tipo</label><select class="campo" id="np-tipo" data-campo="np.tipo"><option value="venta"' + (np.tipo === 'venta' ? ' selected' : '') + '>Para vender</option><option value="insumo"' + (np.tipo === 'insumo' ? ' selected' : '') + '>Insumo del local</option></select></div>' +
        '<div><label for="np-precio">Precio de venta</label><input class="campo" id="np-precio" type="text" inputmode="numeric" data-campo="np.precio" data-numero="miles" value="' + (np.precio ? miles(np.precio) : '') + '"' + (np.tipo === 'insumo' ? ' disabled' : '') + '></div>' +
        '<div><label for="np-stock">Cuántos hay</label><input class="campo" id="np-stock" type="text" inputmode="numeric" data-campo="np.stock" data-numero="entero" value="' + esc(np.stock) + '"></div>' +
        '<div><label for="np-minimo">Avisar cuando queden</label><input class="campo" id="np-minimo" type="text" inputmode="numeric" data-campo="np.minimo" data-numero="entero" placeholder="1" value="' + esc(np.minimo) + '"></div>' +
      '</div><button type="button" class="btn btn-negro" id="np-agregar-btn" data-accion="agregar-prod" data-foco="agregar-prod" style="margin-top:16px"' + (puedeAgregar ? '' : ' disabled') + '>Agregar producto</button></section>' : '';
    var filas = v.listaProd.map(function (p) {
      return '<li class="prod">' +
        '<div style="min-width:0"><p class="prod-nombre">' + esc(p.nombre) + '</p><p class="prod-det">' + esc(p.detalle) + '</p></div>' +
        '<p class="prod-precio">' + p.precio + '</p>' +
        '<div><p class="prod-stock"><span class="stock-num">' + p.stock + '</span><span>' + p.unidad + '</span>' + (p.bajo ? '<span class="tag-pedir">Pedir</span>' : '') + '</p>' +
          '<div class="stock-barra" aria-hidden="true"><i class="' + (p.bajo ? 'bajo' : '') + '" style="width:' + p.barra + '%"></i></div></div>' +
        '<div class="prod-acciones">' +
          '<button type="button" class="btn btn-negro btn-mini" data-accion="restar" data-id="' + p.id + '" data-foco="r-' + p.id + '" aria-label="' + (p.tipo === 'venta' ? 'Vendí 1 ' : 'Usé 1 ') + esc(p.nombre) + '"' + (p.stock <= 0 ? ' disabled' : '') + '>' + (p.tipo === 'venta' ? 'Vendí 1' : 'Usé 1') + '</button>' +
          '<button type="button" class="btn btn-linea btn-mini" data-accion="sumar" data-id="' + p.id + '" data-foco="u-' + p.id + '" aria-label="Sumar 1 ' + esc(p.nombre) + '">+1</button>' +
        '</div></li>';
    }).join('');
    return '<div class="prod-barra-sup"><div class="segmentado" role="group" aria-label="Tipo de producto">' +
        '<button type="button" data-accion="tab-prod" data-t="venta" data-foco="tab-venta" aria-pressed="' + (P.tabProd === 'venta') + '">Para vender (' + v.venta.length + ')</button>' +
        '<button type="button" data-accion="tab-prod" data-t="insumo" data-foco="tab-insumo" aria-pressed="' + (P.tabProd === 'insumo') + '">Insumos (' + v.insumos.length + ')</button></div>' +
        '<button type="button" class="btn btn-rojo btn-mini" data-accion="nuevo-toggle" data-foco="nuevo-toggle" aria-expanded="' + P.nuevoAbierto + '">' + (P.nuevoAbierto ? 'Cerrar el formulario' : 'Agregar producto') + '</button></div>' +
      alerta + nuevo +
      '<p class="aviso" aria-live="polite" style="font-size:15px;margin-top:14px">' + esc(P.avisoProd) + '</p>' +
      '<div class="prod-tabla"><ol class="lista prod-lista">' + filas + '</ol></div>';
  }

  function renderPanel(focoClave) {
    var cont = document.getElementById('panel');
    var activo = document.activeElement;
    var foco = focoClave || (activo && cont.contains(activo) ? (activo.getAttribute('data-foco') || activo.id) : null);
    if (!P.acceso) {
      cont.innerHTML = plantillaAcceso();
    } else {
      var v = modeloPanel();
      ultimaSemana = v.semana;
      var titulo = P.vista === 'caja' ? 'Caja' : (P.vista === 'productos' ? 'Productos' : 'Hoy');
      var nav = [['hoy', 'Hoy'], ['caja', 'Caja'], ['productos', 'Productos']].map(function (n) {
        return '<button type="button" data-accion="vista" data-v="' + n[0] + '" data-foco="v-' + n[0] + '"' + (P.vista === n[0] ? ' aria-current="page"' : '') + '>' + ICONOS[n[0]] + n[1] + '</button>';
      }).join('');
      cont.innerHTML = '<div class="pa">' +
        '<aside class="pa-aside"><div class="pa-marca"><span class="logo logo-56" aria-hidden="true"></span><div><p class="pa-marca-nombre condensada">Tommy Barber</p><p class="pa-marca-sub">Panel del dueño</p></div></div>' +
          '<nav class="pa-nav" aria-label="Secciones del panel">' + nav + '</nav>' +
          '<div class="pa-aside-pie"><a href="#inicio">Ver el sitio</a><button type="button" data-accion="salir">Salir</button></div></aside>' +
        '<main class="pa-main" id="pa-main">' +
          '<div class="pa-cabecera"><div><p class="pa-fecha">' + cap(DIAS[v.h.wd]) + ' ' + v.h.d + ' de ' + MESES[v.h.mo - 1] + '</p><h1 class="pa-titulo">' + titulo + '</h1></div>' +
          '<p class="pa-estado"><span class="pa-poste' + (v.est.abierto ? ' abierto' : '') + '" id="pa-poste" aria-hidden="true"></span><span id="pa-estado-txt">' + v.est.corto + '</span></p></div>' +
          (P.vista === 'caja' ? plantillaCaja(v) : (P.vista === 'productos' ? plantillaProductos(v) : plantillaHoy(v))) +
        '</main></div>';
    }
    if (foco) {
      var el = cont.querySelector('[data-foco="' + foco + '"]') || document.getElementById(foco);
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }
  }

  function marcarBarra(i) {
    P.barra = i;
    var cont = document.getElementById('panel');
    cont.querySelectorAll('[data-barra]').forEach(function (b) {
      var sel = +b.getAttribute('data-barra') === i;
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-pressed', String(sel));
    });
    var d = document.getElementById('pa-barra-detalle');
    if (d && ultimaSemana[i]) d.textContent = ultimaSemana[i].detalle;
  }

  function cobrar(id, medio) {
    var h = ahoraPY();
    var t = P.agenda.find(function (a) { return a.id === id; });
    if (!t) return;
    var s = SERV[t.servicio];
    t.estado = 'atendido';
    t.medio = medio;
    P.mov.push({ id: 'm' + (P.nId++), fecha: h.clave, min: h.min, tipo: 'entrada', cat: 'servicio', concepto: (s ? s.nombre : 'Servicio') + ', ' + t.cliente, monto: s ? s.precio : 0, medio: medio });
    P.cobrando = null;
  }

  function cambiarStock(id, delta) {
    var p = P.productos.find(function (x) { return x.id === id; });
    if (!p || p.stock + delta < 0) return;
    p.stock += delta;
    var nombre = '1 ' + p.uni[0] + ' de ' + minus(p.nombre);
    if (delta > 0) {
      P.avisoProd = 'Sumaste ' + nombre + '. Ahora hay ' + p.stock + ' ' + (p.stock === 1 ? p.uni[0] : p.uni[1]) + '.';
      return;
    }
    var resto = p.stock === 0 ? 'Se terminó: hay que reponer.' : (p.stock === 1 ? 'Queda 1 ' + p.uni[0] + '.' : 'Quedan ' + p.stock + ' ' + p.uni[1] + '.');
    if (p.tipo === 'venta') {
      var h = ahoraPY();
      P.mov.push({ id: 'm' + (P.nId++), fecha: h.clave, min: h.min, tipo: 'entrada', cat: 'producto', concepto: 'Venta: ' + p.nombre, monto: p.precio, medio: 'Efectivo' });
      P.avisoProd = 'Vendiste ' + nombre + ' y se anotaron ' + gs(p.precio) + ' en la caja. ' + resto;
    } else {
      P.avisoProd = 'Usaste ' + nombre + '. ' + resto;
    }
  }

  function anotar() {
    var f = P.form;
    var monto = parseInt(f.monto || '0', 10);
    if (!f.concepto.trim() || !(monto > 0)) return;
    var h = ahoraPY();
    P.mov.push({ id: 'm' + (P.nId++), fecha: h.clave, min: h.min, tipo: f.tipo, cat: f.tipo === 'entrada' ? 'otro' : 'gasto', concepto: f.concepto.trim(), monto: monto, medio: f.medio });
    P.avisoCaja = 'Anotado: ' + f.concepto.trim() + ', ' + (f.tipo === 'entrada' ? '+ ' : '− ') + gs(monto) + '.';
    P.form = { tipo: f.tipo, concepto: '', monto: '', medio: f.medio };
  }

  function agregarProducto() {
    var n = P.np;
    var precio = parseInt(n.precio || '0', 10);
    if (!(n.nombre.trim().length >= 2 && n.stock !== '' && (n.tipo === 'insumo' || precio > 0))) return;
    var nuevo = {
      id: 'p' + Date.now(), tipo: n.tipo, nombre: n.nombre.trim(), detalle: '',
      precio: n.tipo === 'venta' ? precio : 0,
      stock: parseInt(n.stock, 10), minimo: n.minimo === '' ? 1 : parseInt(n.minimo, 10), uni: ['unidad', 'unidades']
    };
    P.productos.push(nuevo);
    P.np = { nombre: '', tipo: n.tipo, precio: '', stock: '', minimo: '' };
    P.nuevoAbierto = false;
    P.tabProd = n.tipo;
    P.avisoProd = 'Agregaste ' + nuevo.nombre + ' con ' + plural(nuevo.stock, 'unidad', 'unidades') + '.';
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
        return;
      }
      P.pin = '';
      P.pinError = true;
    }
    renderPanel('t-' + k);
  }

  function actualizarBotonesPanel() {
    var b1 = document.getElementById('pa-anotar-btn');
    if (b1) b1.disabled = !(P.form.concepto.trim() !== '' && parseInt(P.form.monto || '0', 10) > 0);
    var b2 = document.getElementById('np-agregar-btn');
    if (b2) b2.disabled = !(P.np.nombre.trim().length >= 2 && P.np.stock !== '' && (P.np.tipo === 'insumo' || parseInt(P.np.precio || '0', 10) > 0));
    var pr = document.getElementById('np-precio');
    if (pr) pr.disabled = P.np.tipo === 'insumo';
  }

  var panelEl = document.getElementById('panel');
  panelEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-accion]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-accion');
    var id = b.getAttribute('data-id');
    if (a === 'tecla') { tocarTecla(b.getAttribute('data-k')); return; }
    if (a === 'barra') { marcarBarra(+b.getAttribute('data-barra')); return; }
    if (a === 'vista') {
      P.vista = b.getAttribute('data-v'); P.cobrando = null; P.avisoCaja = ''; P.avisoProd = '';
      renderPanel();
      var main = document.getElementById('pa-main');
      if (main && main.getBoundingClientRect().top < 0) main.scrollIntoView({ block: 'start' });
      return;
    }
    if (a === 'salir') { P.acceso = false; P.pin = ''; P.pinError = false; renderPanel(); window.scrollTo(0, 0); return; }
    if (a === 'cobrar-abrir') { P.cobrando = id; renderPanel('m-' + id + '-Efectivo'); return; }
    if (a === 'cobrar-cancelar') { P.cobrando = null; renderPanel('c-' + id); return; }
    if (a === 'cobrar') { cobrar(id, b.getAttribute('data-medio')); renderPanel('v-hoy'); return; }
    if (a === 'novino') { var t = P.agenda.find(function (x) { return x.id === id; }); if (t) t.estado = 'novino'; P.cobrando = null; renderPanel('v-hoy'); return; }
    if (a === 'periodo') { P.periodo = b.getAttribute('data-p'); renderPanel(); return; }
    if (a === 'tipo') { P.form.tipo = b.getAttribute('data-t'); renderPanel(); return; }
    if (a === 'anotar') { anotar(); renderPanel('pa-concepto'); return; }
    if (a === 'tab-prod') { P.tabProd = b.getAttribute('data-t'); renderPanel(); return; }
    if (a === 'nuevo-toggle') { P.nuevoAbierto = !P.nuevoAbierto; renderPanel(P.nuevoAbierto ? 'np-nombre' : 'nuevo-toggle'); return; }
    if (a === 'agregar-prod') { agregarProducto(); renderPanel('nuevo-toggle'); return; }
    if (a === 'restar') { cambiarStock(id, -1); renderPanel(); return; }
    if (a === 'sumar') { cambiarStock(id, 1); renderPanel(); return; }
  });
  panelEl.addEventListener('input', function (e) {
    var el = e.target;
    var campo = el.getAttribute('data-campo');
    if (!campo || el.tagName === 'SELECT') return;
    var partes = campo.split('.');
    var val = el.value;
    var tipoNum = el.getAttribute('data-numero');
    if (tipoNum) {
      val = val.replace(/\D/g, '').slice(0, tipoNum === 'miles' ? 10 : 4);
      el.value = tipoNum === 'miles' && val ? miles(val) : val;
    }
    P[partes[0]][partes[1]] = val;
    actualizarBotonesPanel();
  });
  panelEl.addEventListener('change', function (e) {
    var el = e.target;
    var campo = el.getAttribute('data-campo');
    if (!campo || el.tagName !== 'SELECT') return;
    var partes = campo.split('.');
    P[partes[0]][partes[1]] = el.value;
    actualizarBotonesPanel();
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
    if (panelEl.hidden || P.acceso || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); tocarTecla(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); tocarTecla('Borrar'); }
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
    }
  }
  window.addEventListener('hashchange', mostrarVista);

  /* ===================== Arranque ===================== */
  renderPrecios();
  renderHorarios();
  renderEstadoHero();
  renderReserva();
  mostrarVista();

  setInterval(function () {
    renderEstadoHero();
    renderHorarios();
    if (!panelEl.hidden && P.acceso) {
      var e = estadoLocal(ahoraPY());
      var t = document.getElementById('pa-estado-txt');
      var p = document.getElementById('pa-poste');
      if (t) t.textContent = e.corto;
      if (p) p.classList.toggle('abierto', e.abierto);
    }
  }, 30000);
})();
