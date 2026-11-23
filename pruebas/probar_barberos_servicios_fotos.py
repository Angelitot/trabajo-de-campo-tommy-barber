"""Prueba barberos (crear, editar, quitar, días y horas), reserva con barbero, límites contra turnos falsos,
números bloqueados, Atender por barbero e intercambio de horas, servicios nuevos y fotos de la página.
Reloj fijo: martes 27/10/2026 10:05, Paraguay."""
import asyncio, json, sys, tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
from PIL import Image
from playwright.async_api import async_playwright

RAIZ = Path(__file__).resolve().parent.parent
URL = sys.argv[1] if len(sys.argv) > 1 else (RAIZ / 'index.html').as_uri()
OUT = Path(__file__).resolve().parent / 'capturas'
OUT.mkdir(exist_ok=True)
PY = timezone(timedelta(hours=-3))
fallas = []

# Fotos de prueba (colores lisos, como si fueran fotos del celular)
TMP = Path(tempfile.mkdtemp())
for nombre, tam, color in [('logo.png', (900, 900), (200, 16, 46)), ('local.jpg', (2400, 1800), (40, 90, 160)), ('corte.jpg', (1500, 2000), (30, 140, 80))]:
    Image.new('RGB', tam, color).save(TMP / nombre)
(TMP / 'no-es-foto.txt').write_text('hola')


def check(cond, msg):
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)
    if not cond:
        fallas.append(msg)


async def datos(pg, clave):
    return json.loads(await pg.evaluate(f"localStorage.getItem('{clave}') || 'null'"))


async def todos_los_turnos(pg):
    panel = await datos(pg, 'tommybarber-panel')
    web = await datos(pg, 'tommybarber-reservas') or []
    return panel['turnos'] + web


async def pin(pg):
    for k in '2121':
        await pg.click(f'.tecla[data-k="{k}"]')
    await pg.wait_for_timeout(120)


async def vista(pg, v):
    await pg.evaluate(f"document.querySelector('[data-accion=\"vista\"][data-v=\"{v}\"]').click()")
    await pg.wait_for_timeout(80)


async def reservar(pg, servicio, barbero, k, m, nombre, tel):
    """Reserva desde el sitio. Devuelve el texto del pie (o del comprobante)."""
    await pg.goto(URL + '#reservar')
    await pg.reload()  # empieza la reserva de cero
    await pg.wait_for_timeout(150)
    await pg.click(f'.rv-servicio[data-id="{servicio}"]')
    await pg.click('#reserva [data-accion="seguir"]')
    if barbero is not None:
        await pg.click(f'[data-accion="barbero"][data-id="{barbero}"]')
    await pg.click(f'[data-accion="dia"][data-k="{k}"]')
    await pg.click(f'[data-accion="hora"][data-k="{k}"][data-m="{m}"]')
    await pg.click('#reserva [data-accion="seguir"]')
    await pg.fill('#rv-nombre', nombre)
    await pg.fill('#rv-tel', tel)
    boton = pg.locator('#reserva [data-accion="seguir"]')
    if await boton.is_disabled():
        return 'BLOQUEADO: ' + await pg.inner_text('#rv-tel-ayuda')
    await boton.click()
    await pg.wait_for_timeout(100)
    return await pg.inner_text('#reserva')


async def recorrido(b):
    ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, timezone_id='America/Asuncion', locale='es-PY')
    await ctx.route('https://wa.me/**', lambda r: r.abort())
    pg = await ctx.new_page()
    await pg.clock.install(time=datetime(2026, 10, 27, 10, 5, tzinfo=PY))
    errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' and 'wa.me' not in m.text and 'ERR_FAILED' not in m.text else None)

    # ===== Barberos =====
    print('\n--- Barberos')
    await pg.goto(URL + '#panel')
    await pg.wait_for_timeout(200)
    await pin(pg)
    await vista(pg, 'barberos')
    main = await pg.inner_text('#pa-main')
    check('Barbero principal' in main and 'Lun a sáb de 08:00 a 17:30' in main, 'al empezar hay un barbero, con el horario del local')
    check(await pg.locator('[data-accion="bb-quitar"]').count() == 0, 'el único barbero no se puede quitar')
    await pg.click('[data-accion="bb-editar"][data-id="b1"]')
    await pg.fill('#bb-nombre', 'Barbero 1')
    await pg.click('#bb-guardar')
    check('Guardaste los cambios de Barbero 1' in await pg.inner_text('#pa-main'), 'se le cambia el nombre')
    await pg.click('[data-accion="bb-nuevo"]')
    await pg.fill('#bb-nombre', 'barbero 1')
    check('Ya hay un barbero que se llama' in await pg.inner_text('#bb-falta'), 'no deja repetir un nombre')
    await pg.fill('#bb-nombre', 'Barbero 2')
    for wd in '12345':
        await pg.click(f'[data-bb-dia="{wd}"][data-bb="on"]')
    await pg.select_option('[data-bb-dia="6"][data-bb="hasta"]', '720')
    await pg.screenshot(path=str(OUT / 'bb-form.png'), full_page=True)
    await pg.click('#bb-guardar')
    main = await pg.inner_text('#pa-main')
    check('Agregaste a Barbero 2' in main and 'Sáb de 08:00 a 12:00' in main, 'se agrega un barbero que viene solo los sábados a la mañana')
    reg = await datos(pg, 'tommybarber-barberos')
    check(len(reg['barberos']) == 2 and reg['barberos'][1]['dias']['6'] == [480, 720] and reg['barberos'][1]['dias']['1'] is None, 'queda guardado con sus días y horas')
    await pg.screenshot(path=str(OUT / 'bb-lista.png'), full_page=True)

    # ===== Reserva con barbero =====
    print('\n--- Reserva con barbero')
    await pg.goto(URL + '#reservar')
    await pg.wait_for_timeout(150)
    await pg.click('.rv-servicio[data-id="corte"]')
    await pg.click('#reserva [data-accion="seguir"]')
    chips = await pg.locator('[data-accion="barbero"]').all_inner_texts()
    check(chips == ['El que esté libre', 'Barbero 1', 'Barbero 2'], f'el cliente elige con quién: {chips}')
    await pg.click('[data-accion="barbero"][data-id="b2"]')
    check('no atiende' in await pg.inner_text('[data-accion="dia"][data-k="0"]'), 'con Barbero 2, el martes dice «no atiende»')
    await pg.click('[data-accion="dia"][data-k="4"]')
    horas = [x.strip() for x in await pg.locator('.rv-hora').all_inner_texts()]
    check(horas and horas[0] == '08:00' and horas[-1] == '11:30', f'el sábado ofrece sus horas, de 08:00 a 11:30 ({horas[:2]}…{horas[-1:]})')
    await pg.screenshot(path=str(OUT / 'rv-barbero.png'))
    txt = await reservar(pg, 'corte', 'b2', 4, 540, 'Lucas Benítez', '0983 444 555')
    check('Con' in txt and 'Barbero 2' in txt, 'el comprobante dice con quién es el turno')
    t = [x for x in await todos_los_turnos(pg) if x['cliente'] == 'Lucas Benítez'][0]
    check(t['barbero'] == 'b2' and t['fecha'] == '2026-10-31' and t['min'] == 540, 'el turno queda con Barbero 2, sábado 09:00')
    # «El que esté libre» a la misma hora: Barbero 2 ya está ocupado, así que le toca al otro (si está libre)
    txt = await reservar(pg, 'corte', '', 4, 540, 'Marcos Benítez', '0981 222 333')
    m = [x for x in await todos_los_turnos(pg) if x['cliente'] == 'Marcos Benítez']
    check(bool(m) and m[0]['barbero'] == 'b1', '«El que esté libre» le da el turno al barbero que está libre a esa hora')

    # ===== Límites contra turnos falsos =====
    print('\n--- Límites')
    txt = await reservar(pg, 'corte', '', 1, 840, 'Marcos Benítez', '0981 222 333')
    check(txt.startswith('BLOQUEADO') and 'Ya hay un turno a nombre de Marcos Benítez' in txt, 'la misma persona no puede tener dos turnos pendientes')
    for i, n in enumerate(['Thiago Benítez', 'Mateo Benítez']):
        txt = await reservar(pg, 'corte', '', 1, 840 + 30 * i, n, '0981 222 333')
        check('BLOQUEADO' not in txt, f'un papá puede reservar para su hijo con su número ({n})')
    txt = await reservar(pg, 'corte', '', 2, 840, 'Pedro Sosa', '0982 777 888')
    check(txt.startswith('BLOQUEADO') and 'Desde este celular ya hay 4' in txt, 'un mismo celular tiene un tope de 4 turnos pendientes')
    await pg.screenshot(path=str(OUT / 'rv-limite.png'))
    # Tope por número: 4 turnos de ese número reservados desde otros celulares
    await pg.evaluate("""() => {
      const d = JSON.parse(localStorage.getItem('tommybarber-panel'));
      ['Ana', 'Bea', 'Caro', 'Dani'].forEach((n, i) => d.turnos.push({ id: 'X' + i, codigo: 'TB-90' + i, servicio: 'corte', fecha: '2026-11-0' + (3 + i), min: 600,
        precio: 30000, dur: 30, cliente: n + ' Rojas', tel: '0985 111 222', estado: 'confirmado', creadoEn: Date.now(), barbero: 'b1' }));
      localStorage.setItem('tommybarber-panel', JSON.stringify(d));
    }""")
    txt = await reservar(pg, 'corte', '', 2, 870, 'Eva Rojas', '0985 111 222')
    check(txt.startswith('BLOQUEADO') and 'ya hay 4 turnos pendientes' in txt, 'un mismo WhatsApp tiene un tope de 4 turnos pendientes (familia)')

    # ===== Atender por barbero e intercambio =====
    print('\n--- Atender')
    await pg.goto(URL + '#atender')
    await pg.wait_for_timeout(150)
    if await pg.locator('.tecla').count():
        await pin(pg)
    botones = await pg.locator('.at-barbero').all_inner_texts()
    check(len(botones) == 2 and botones[0].startswith('Barbero 1') and botones[1].startswith('Barbero 2'), f'cada barbero tiene su botón ({botones})')
    primero = (await pg.inner_text('#at-card .at-nombre')).strip()
    segundo = (await pg.locator('.at-fila-item').nth(1).inner_text()).split('\n')[1].strip()
    antes = {x['cliente']: x['min'] for x in await todos_los_turnos(pg) if x['fecha'] == '2026-10-27' and x['cliente'] in (primero, segundo)}
    check('intercambia las horas' in await pg.inner_text('#at-card'), 'avisa qué hace «Pasar después»')
    await pg.keyboard.press('p')
    despues = {x['cliente']: x['min'] for x in await todos_los_turnos(pg) if x['fecha'] == '2026-10-27' and x['cliente'] in (primero, segundo)}
    check(despues[segundo] == antes[primero] and despues[primero] == antes[segundo], f'se intercambian las horas ({antes} → {despues})')
    check((await pg.inner_text('#at-card .at-nombre')).strip() == segundo, 'el que estaba segundo pasa a ser el actual')
    await pg.screenshot(path=str(OUT / 'at-intercambio.png'), full_page=True)
    await pg.keyboard.press('z')
    vuelta = {x['cliente']: x['min'] for x in await todos_los_turnos(pg) if x['fecha'] == '2026-10-27' and x['cliente'] in (primero, segundo)}
    check(vuelta == antes, 'Z deshace el intercambio')
    # Llegada sin turno con barbero
    await pg.click('[data-accion="at-llegada-abrir"]')
    check(await pg.locator('#at-l-barbero').count() == 1, 'el que llega sin turno elige con quién (o el primero que se libere)')
    await pg.select_option('#at-l-barbero', 'b2')
    check('Hoy ya no queda lugar' in await pg.inner_text('.at-llegada') and 'sábado 31 de octubre' in await pg.inner_text('.at-llegada'), 'con Barbero 2 (no viene hoy) ofrece el sábado')
    await pg.select_option('#at-l-barbero', '')
    chip = await pg.locator('.at-hora-op[aria-pressed="true"]').inner_text()
    check('Barbero 1' in chip, f'con «el primero que se libere» cada hora dice con quién ({chip.splitlines()})')
    await pg.click('[data-accion="at-llegada-cancelar"]')
    await pg.click('.at-barbero[data-id="b2"]')
    check('Barbero 2' in await pg.inner_text('.at-barbero[aria-pressed="true"]') and 'No queda nadie' in await pg.inner_text('#at-card'), 'el botón de Barbero 2 muestra su fila (hoy vacía)')
    await pg.click('.at-barbero[data-id="b1"]')

    # ===== Turno falso: cancelar y bloquear =====
    print('\n--- Turnos falsos')
    await vista(pg, 'turnos')
    fila = pg.locator('.turno', has_text='Thiago Benítez')
    await fila.locator('[data-accion="cancelar-abrir"]').click()
    await pg.click('[data-accion="cancelar-falso"]')
    txt = await pg.inner_text('#pa-main')
    check('número bloqueado' in txt and 'Ese número tiene' in txt, 'cancela, bloquea el número y avisa que tiene más turnos')
    await pg.screenshot(path=str(OUT / 'falso.png'), full_page=True)
    await pg.click('[data-accion="cancelar-falsos"]')
    pend = [x for x in await todos_los_turnos(pg) if '0981 222 333' == x['tel'] and x['estado'] == 'confirmado']
    check(not pend, 'con «Cancelarlos también» se cancelan todos los de ese número')
    txt = await reservar(pg, 'corte', '', 2, 900, 'Alguien', '0981222333')
    check(txt.startswith('BLOQUEADO') and 'no puede reservar por la web' in txt, 'el número bloqueado ya no puede reservar por la web')
    await pg.goto(URL + '#panel')
    await pg.wait_for_timeout(100)
    if await pg.locator('.tecla').count():
        await pin(pg)
    await vista(pg, 'clientes')
    check('Números bloqueados (1)' in await pg.inner_text('#pa-main'), 'Clientes muestra los números bloqueados')
    await pg.screenshot(path=str(OUT / 'bloqueados.png'), full_page=True)
    await pg.click('.cl-bloqueados [data-accion="cl-desbloquear"]')
    check('Números bloqueados' not in await pg.inner_text('#pa-main'), 'se puede desbloquear')
    await pg.fill('#cl-buscar', 'Óscar Duarte')
    await pg.locator('.cl-lista li:not([hidden]) .cl-item').first.click()
    await pg.click('[data-accion="cl-bloquear"]')
    txt = await pg.inner_text('#pa-main')
    check('está bloqueado' in txt and 'ni las otras' in txt, 'bloquear desde la ficha avisa que también afecta a la familia que usa ese número')
    await pg.click('[data-accion="cl-desbloquear"]')

    # ===== Servicios =====
    print('\n--- Servicios')
    await vista(pg, 'precios')
    check((await pg.inner_text('#pa-titulo')).strip() == 'Servicios', 'la sección se llama Servicios')
    await pg.click('[data-accion="sv-nuevo"]')
    await pg.fill('#sv-nombre', 'corte clásico y degradado')
    await pg.fill('#sv-precio', '30000')
    check('Ya hay un servicio que se llama' in await pg.inner_text('#sv-falta'), 'no deja repetir el nombre de un servicio')
    await pg.fill('#sv-nombre', 'Corte para niños')
    await pg.fill('#sv-precio', '25000')
    await pg.select_option('#sv-min', '30')
    await pg.screenshot(path=str(OUT / 'sv-form.png'), full_page=True)
    await pg.click('#sv-guardar')
    check('Agregaste Corte para niños' in await pg.inner_text('#pa-main'), 'se agrega un servicio con precio y duración')
    await pg.locator('.pr-fila', has_text='Limpieza de cutis').locator('[data-accion="sv-quitar"]').click()
    await pg.click('[data-accion="sv-quitar-si"]')
    txt = await pg.inner_text('#pa-main')
    check('No se ofrecen' in txt and 'Limpieza de cutis ya no se ofrece' in txt, 'se deja de ofrecer un servicio')
    await pg.locator('.pr-fila', has_text='Corte para niños').locator('[data-accion="sv-editar"]').click()
    await pg.fill('#sv-precio', '20000')
    await pg.click('#sv-guardar')
    await pg.screenshot(path=str(OUT / 'sv-lista.png'), full_page=True)
    sitio = await pg.evaluate("document.getElementById('lista-precios').innerText")
    check('Corte para niños' in sitio and '20.000' in sitio and 'Limpieza de cutis' not in sitio, 'la lista de precios del sitio se actualiza')
    reg = await datos(pg, 'tommybarber-precios')
    check(reg['version'] == 2 and reg['nuevos'][0]['nombre'] == 'Corte para niños' and 'limpieza' in reg['ocultos'], 'los servicios quedan guardados')
    await pg.click('[data-accion="sv-volver"][data-id="limpieza"]')
    check('Limpieza de cutis se vuelve a ofrecer' in await pg.inner_text('#pa-main'), 'se puede volver a ofrecer')

    # ===== Horario de un solo barbero =====
    print('\n--- Cierre de un barbero')
    await vista(pg, 'horario')
    await pg.select_option('#hz-barbero', 'b2')
    await pg.fill('#hz-fecha', '2026-10-31')
    await pg.fill('#hz-motivo', 'Trámite')
    await pg.click('#hz-guardar')
    txt = await pg.inner_text('#pa-main')
    check('Barbero 2 no atiende' in txt, 'se cierra un día solo para Barbero 2')
    check('Lucas Benítez' in txt and 'afuera' in txt, 'avisa que el turno de Lucas (con Barbero 2) quedó afuera')
    sitio = await pg.evaluate("document.getElementById('lista-horarios').innerText")
    check('Barbero 2 no atiende' in sitio and 'Barberos' in sitio, 'el sitio avisa el cierre y muestra los días de cada barbero')
    await pg.click('[data-accion="hz-quitar"]')

    # ===== Reportes por barbero =====
    await vista(pg, 'reportes')
    check('Por barbero' in await pg.inner_text('#pa-main'), 'Reportes muestra clientes y cobros por barbero')

    # ===== Quitar un barbero con turnos =====
    print('\n--- Quitar barbero')
    await vista(pg, 'barberos')
    await pg.click('[data-accion="bb-quitar"][data-id="b2"]')
    txt = await pg.inner_text('.bb-quitar')
    check('tiene 1 turno pendiente' in txt or 'turnos pendientes' in txt, 'antes de quitarlo pide pasar sus turnos')
    await pg.click('[data-accion="bb-pasar"]')
    t = [x for x in await todos_los_turnos(pg) if x['cliente'] == 'Lucas Benítez'][0]
    check(t['barbero'] == 'b1' or 'no entran' in await pg.inner_text('#pa-main'), 'pasa sus turnos a Barbero 1 (o dice cuáles no entran)')
    if await pg.locator('[data-accion="bb-quitar-si"]').count():
        await pg.click('[data-accion="bb-quitar-si"]')
        txt = await pg.inner_text('#pa-main')
        check('Quitaste a Barbero 2' in txt and 'Ya no trabajan: Barbero 2' in txt, 'se quita y queda en el historial')

    # ===== Fotos =====
    print('\n--- Fotos')
    await vista(pg, 'fotos')
    await pg.set_input_files('#ft-logo', str(TMP / 'no-es-foto.txt'))
    await pg.wait_for_timeout(300)
    check('No se pudo leer esa foto' in await pg.inner_text('#pa-main'), 'un archivo que no es foto avisa y no cambia nada')
    await pg.set_input_files('#ft-logo', str(TMP / 'logo.png'))
    await pg.wait_for_timeout(500)
    estilo = await pg.evaluate("(document.getElementById('fotos-estilo') || {}).textContent || ''")
    check('data:image/' in estilo and 'Cambiaste el logo' in await pg.inner_text('#pa-main'), 'se cambia el logo en toda la página')
    await pg.set_input_files('#ft-fachada', str(TMP / 'local.jpg'))
    await pg.wait_for_timeout(500)
    await pg.fill('#ft-alt-fachada', 'Frente del local con la persiana abierta.')
    await pg.locator('#ft-alt-fachada').dispatch_event('change')
    info = await pg.evaluate("(() => { const i = document.getElementById('foto-fachada'); return [i.src.slice(0, 15), i.alt, i.naturalWidth || i.width]; })()")
    check(info[0] == 'data:image/webp' and info[1] == 'Frente del local con la persiana abierta.', f'la foto del local cambia, con su descripción ({info[0]})')
    fotos = await datos(pg, 'tommybarber-fotos')
    check(fotos['fachada']['w'] == 1280, f"la foto se achica a 1280 px de ancho ({fotos['fachada']['w']})")
    await pg.set_input_files('#ft-galeria', str(TMP / 'corte.jpg'))
    await pg.wait_for_timeout(500)
    check(await pg.evaluate("document.querySelectorAll('.galeria > li').length") == 4, 'se agrega una foto de corte a la galería')
    await pg.click('[data-accion="ft-mover"][data-i="3"][data-paso="-1"]')
    primera_nueva = await pg.evaluate("document.querySelectorAll('.galeria img')[2].src.slice(0, 10)")
    check(primera_nueva == 'data:image', 'se puede cambiar el orden')
    await pg.click('[data-accion="ft-quitar"][data-i="0"]')
    check(await pg.evaluate("document.querySelectorAll('.galeria > li').length") == 3, 'se puede quitar una foto')
    await pg.screenshot(path=str(OUT / 'fotos.png'), full_page=True)
    await pg.reload()
    await pg.wait_for_timeout(300)
    check(await pg.evaluate("document.getElementById('foto-fachada').src.slice(0, 10)") == 'data:image' and
          await pg.evaluate("document.querySelectorAll('.galeria > li').length") == 3, 'las fotos siguen después de recargar')
    if await pg.locator('.tecla').count():
        await pin(pg)
    await vista(pg, 'fotos')
    for cual in ['galeria', 'fachada', 'logo']:
        await pg.click(f'[data-accion="ft-original"][data-id="{cual}"]')
    fachada = await pg.evaluate("document.getElementById('foto-fachada').getAttribute('src')")
    check('data:' not in fachada and await pg.evaluate("document.querySelectorAll('.galeria > li').length") == 3 and
          await pg.evaluate("(document.getElementById('fotos-estilo') || {}).textContent || ''") == '', 'se vuelve a las fotos originales')

    check(not errores, 'sin errores en la consola' + (': ' + ' | '.join(errores[:3]) if errores else ''))
    await ctx.close()


async def celular(b):
    """Cómo se ven en el celular las partes nuevas."""
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, timezone_id='America/Asuncion', locale='es-PY')
    pg = await ctx.new_page()
    await pg.clock.install(time=datetime(2026, 10, 27, 10, 5, tzinfo=PY))
    await pg.goto(URL + '#panel')
    await pg.wait_for_timeout(200)
    await pin(pg)
    await pg.evaluate("localStorage.setItem('tommybarber-barberos', JSON.stringify({version:1,sig:3,barberos:[{id:'b1',nombre:'Barbero 1',activo:true,dias:{1:[480,1050],2:[480,1050],3:[480,1050],4:[480,1050],5:[480,1050],6:[480,1050]}},{id:'b2',nombre:'Barbero 2',activo:true,dias:{6:[480,720]}}]}))")
    await pg.reload()
    await pg.wait_for_timeout(200)
    await pin(pg)
    for v in ['barberos', 'atender', 'fotos', 'precios']:
        await vista(pg, v)
        ancho = await pg.evaluate('document.documentElement.scrollWidth')
        check(ancho <= 390, f'celular: {v} entra en la pantalla ({ancho}px)')
        await pg.screenshot(path=str(OUT / f'cel-{v}.png'), full_page=True)
    await vista(pg, 'barberos')
    await pg.click('[data-accion="bb-nuevo"]')
    ancho = await pg.evaluate('document.documentElement.scrollWidth')
    check(ancho <= 390, f'celular: el formulario de barbero entra ({ancho}px)')
    await pg.screenshot(path=str(OUT / 'cel-bb-form.png'), full_page=True)
    await ctx.close()


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        await recorrido(b)
        await celular(b)
        await b.close()
    print('\nRESULTADO:', 'todo bien' if not fallas else f'{len(fallas)} fallas')

asyncio.run(main())
