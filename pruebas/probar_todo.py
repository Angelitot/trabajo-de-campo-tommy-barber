"""Recorre el sitio y el panel de Tommy Barber con un reloj fijo (martes 27/10/2026 10:05, Paraguay)."""
import asyncio, re, sys, urllib.parse
from pathlib import Path
from datetime import datetime, timezone, timedelta
from playwright.async_api import async_playwright

RAIZ = Path(__file__).resolve().parent.parent
URL = sys.argv[1] if len(sys.argv) > 1 else (RAIZ / 'index.html').as_uri()
OUT = Path(__file__).resolve().parent / 'capturas'
OUT.mkdir(exist_ok=True)
PY = timezone(timedelta(hours=-3))
INICIO = datetime(2026, 10, 27, 10, 5, tzinfo=PY)
fallas = []

def check(cond, msg):
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)
    if not cond:
        fallas.append(msg)

async def txt(pg, sel):
    return (await pg.locator(sel).first.inner_text()).strip()

async def recorrido(p, nombre, vp, mobile):
    ctx = await p.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, timezone_id='America/Asuncion', locale='es-PY')
    pg = await ctx.new_page()
    await pg.clock.install(time=INICIO)
    errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
    await pg.goto(URL)
    await pg.wait_for_timeout(400)
    print(f'\n===== {nombre} =====')

    # Precios oficiales
    filas = await pg.locator('.precio-fila').count()
    check(filas == 13, f'13 filas de precios ({filas})')
    primera = await txt(pg, '.precio-fila')
    check('Corte clásico y degradado' in primera and 'Gs. 35.000' in primera, 'primera fila: corte clásico 35.000')
    combo2 = await pg.locator('.precio-fila', has_text='Combo 2').inner_text()
    check('Gs. 90.000' in combo2 and 'Corte + Barba + Ceja + Limpieza' in combo2, 'combo 2: 90.000 e incluye limpieza')
    await pg.screenshot(path=f'{OUT}/{nombre}-sitio.png', full_page=True)

    # Reserva 1: combo 4 para mañana
    await pg.click('[data-reservar="combo-4"]')
    await pg.wait_for_timeout(150)
    await pg.click('.rv-dia[data-k="1"]')
    check(await pg.locator('#rv-seguir').count() == 0, 'en día y hora no hay botón para seguir: se elige y pasa solo')
    await pg.click('.rv-hora:not([disabled])')
    await pg.wait_for_selector('#rv-nombre')
    check(await pg.evaluate("document.activeElement.id") == 'rv-nombre', 'al tocar la hora pasa a «Tus datos» con el cursor en el nombre')
    resumen = await txt(pg, '.rv-resumen-caja')
    check('Combo 4' in resumen and 'miércoles 28' in resumen.lower(), 'resumen en tus datos: ' + resumen.replace(chr(10), ' · '))
    await pg.fill('#rv-nombre', 'Juan Prueba')
    await pg.fill('#rv-tel', '021 123 456')
    check(await pg.is_disabled('#rv-seguir'), 'un teléfono fijo no deja confirmar')
    ayuda = await txt(pg, '#rv-tel-ayuda')
    check('celular de Paraguay' in ayuda, f'ayuda del teléfono: {ayuda}')
    await pg.fill('#rv-tel', '0981 555 214')
    check(not await pg.is_disabled('#rv-seguir'), 'con celular válido se puede confirmar')
    await pg.click('#rv-seguir')
    await pg.wait_for_timeout(150)
    ticket = await txt(pg, '.rv-ticket')
    check('Combo 4: Corte + Barba' in ticket and 'Gs. 50.000' in ticket and '0981 555 214' in ticket, 'comprobante con combo, precio y WhatsApp')
    await pg.locator('#reserva').screenshot(path=f'{OUT}/{nombre}-ticket.png')
    hero = await txt(pg, '#hero-turno')
    check(hero.startswith('Tenés turno mañana miércoles 28'), f'aviso en el inicio: {hero}')

    # Reserva 2: perfilado de ceja pasado mañana, para cancelarla como cliente
    await pg.click('[data-accion="otro"]')
    check(await pg.locator('#rv-seguir').count() == 0, 'al elegir el servicio no hay botón para seguir')
    await pg.click('.rv-servicio[data-id="ceja"]')
    check(await pg.locator('.rv-dia').count() > 0, 'al tocar el servicio pasa solo a día y hora')
    await pg.click('.rv-dia[data-k="2"]')
    hora2 = await pg.locator('.rv-hora:not([disabled])').first.inner_text()
    await pg.click('.rv-hora:not([disabled])')
    await pg.fill('#rv-nombre', 'Ana Prueba')
    await pg.fill('#rv-tel', '+595 982 111 222')
    await pg.click('#rv-seguir')
    await pg.wait_for_timeout(150)
    cont = await txt(pg, '[data-accion="modo"][data-modo="mis"]')
    check('2' in cont, f'botón Mis turnos con 2 próximos ({cont})')

    # Mis turnos: cancelar el de Ana
    await pg.click('[data-accion="modo"][data-modo="mis"]')
    items = await pg.locator('.mt-item').count()
    check(items == 2, f'Mis turnos lista 2 ({items})')
    await pg.locator('.mt-item', has_text='Perfilado de ceja').locator('[data-accion="cancelar-mio"]').click()
    check(await pg.locator('.mt-confirmar').count() == 1, 'pide confirmar la cancelación')
    await pg.click('[data-accion="cancelar-mio-si"]')
    await pg.wait_for_timeout(150)
    msg = await txt(pg, '.rv-msg')
    check(msg.startswith('Cancelaste tu turno del jueves 29') and 'quedó libre' in msg, f'mensaje: {msg}')
    canc = await pg.locator('.mt-item.cancelado').inner_text()
    check('Lo cancelaste hoy' in canc, 'el cancelado queda en Anteriores y cancelados')
    await pg.locator('#reserva').screenshot(path=f'{OUT}/{nombre}-mis-turnos.png')

    # El horario cancelado vuelve a estar libre
    await pg.click('[data-accion="modo"][data-modo="reservar"]')
    await pg.click('[data-reservar="ceja"]')
    await pg.click('.rv-dia[data-k="2"]')
    libre = await pg.locator('.rv-hora', has_text=hora2).first.is_enabled()
    check(libre, f'el horario {hora2} del jueves quedó libre')

    # Panel: PIN
    await pg.goto(URL + '#panel')
    await pg.wait_for_timeout(200)
    for k in '1111':
        await pg.click(f'.tecla[data-k="{k}"]')
    check('no es correcto' in await txt(pg, '.pa-pin-msg'), 'PIN incorrecto avisa')
    for k in '2121':
        await pg.click(f'.tecla[data-k="{k}"]')
    await pg.wait_for_timeout(200)
    check(await txt(pg, '.pa-titulo') == 'Hoy', 'entra al panel con 2121')
    aviso = await txt(pg, '.aviso-turnos')
    check('Mañana tenés 3 turnos y ninguno tiene recordatorio todavía.' in aviso, f'aviso de mañana: {aviso}')
    check('2 clientes cancelaron su turno.' in aviso, 'aviso de cancelaciones de clientes')
    await pg.screenshot(path=f'{OUT}/{nombre}-panel-hoy.png', full_page=True)

    # Cobrar el que está en la silla y cancelar uno de la tarde
    fila_silla = pg.locator('.turno', has=pg.locator('.pill-silla')).first
    if await fila_silla.count():
        await fila_silla.locator('[data-accion="cobrar-abrir"]').click()
        await pg.locator('[data-accion="cobrar"][data-medio="Transferencia"]').click()
        await pg.wait_for_timeout(100)
        check(await pg.locator('.pill-silla').count() == 0, 'después de cobrar no queda nadie en la silla')
    antes = await txt(pg, '.cifra .cifra-valor')
    fila_tarde = pg.locator('.lista .turno', has=pg.locator('[data-accion="cancelar-abrir"]')).last
    cliente_tarde = (await fila_tarde.locator('.turno-cliente').inner_text()).strip()
    await fila_tarde.locator('[data-accion="cancelar-abrir"]').click()
    await pg.click('[data-accion="cancelar-si"]')
    await pg.wait_for_timeout(100)
    panel_txt = await txt(pg, '.turno-panel')
    check('Turno cancelado' in panel_txt and primerNombre(cliente_tarde) in panel_txt, f'ofrece avisar a {cliente_tarde}')
    await pg.click('.turno-panel [data-accion="avisar"]')
    await pg.wait_for_timeout(150)
    check(await pg.locator('.modal-caja').is_visible(), 'turno de ejemplo: muestra la vista previa del mensaje')
    burbuja = await txt(pg, '.wa-burbuja')
    check(burbuja.startswith('Hola ' + primerNombre(cliente_tarde) + ', te escribimos de Tommy Barber: tuvimos que cancelar tu turno de hoy a las'), f'mensaje de cancelación: {burbuja[:90]}…')
    await pg.screenshot(path=f'{OUT}/{nombre}-preview.png')
    await pg.keyboard.press('Escape')
    check(not await pg.locator('.modal-caja').count(), 'Escape cierra la vista previa')
    print('     cobrado hoy:', antes)

    # Turnos próximos: recordar a Juan (real) por WhatsApp
    await pg.click('[data-accion="vista"][data-v="turnos"]')
    fila_juan = pg.locator('.turno', has_text='Juan Prueba')
    link = fila_juan.locator('a[data-accion="recordar"]')
    href = await link.get_attribute('href')
    texto = urllib.parse.unquote(href.split('text=')[1]) if href and 'text=' in href else ''
    check(href.startswith('https://wa.me/595981555214?text='), f'enlace de WhatsApp al número de Juan: {href[:48]}…')
    check(texto.startswith('Hola Juan, te recordamos tu turno de Combo 4 (corte + barba) en Tommy Barber: mañana miércoles 28 a las'), f'texto del recordatorio: {texto[:100]}…')
    async with pg.context.expect_page() as nueva:
        await link.click()
    popup = await nueva.value
    await popup.close()
    await pg.wait_for_timeout(500)
    extra = await fila_juan.locator('.turno-extra').inner_text()
    check('Recordatorio enviado hoy a las 10:' in extra, f'queda registrado el recordatorio: {extra}')
    await pg.screenshot(path=f'{OUT}/{nombre}-panel-turnos.png', full_page=True)

    # Cancelados: aparece el que canceló Ana
    await pg.click('[data-accion="filtro-turnos"][data-f="cancelados"]')
    canc_txt = await pg.locator('#pa-main').inner_text()
    check('Ana Prueba' in canc_txt and 'Lo canceló el cliente' in canc_txt, 'Cancelados muestra el turno que canceló Ana')

    # Cancelar el de Juan desde el panel: ofrece avisar con el mensaje de cancelación
    await pg.click('[data-accion="filtro-turnos"][data-f="proximos"]')
    await fila_juan.locator('[data-accion="cancelar-abrir"]').click()
    await pg.click('[data-accion="cancelar-si"]')
    await pg.wait_for_timeout(100)
    aviso_link = pg.locator('.turno-panel a[data-accion="avisar"]')
    href2 = await aviso_link.get_attribute('href')
    texto2 = urllib.parse.unquote(href2.split('text=')[1])
    check(texto2.startswith('Hola Juan, te escribimos de Tommy Barber: tuvimos que cancelar tu turno de mañana miércoles 28 a las'), f'mensaje de cancelación a Juan: {texto2[:80]}…')
    await pg.click('.turno-panel [data-accion="cerrar-panel"]')

    # Stock
    await pg.click('[data-accion="vista"][data-v="stock"]')
    fila = pg.locator('.prod', has_text='Hojas de afeitar')
    await fila.locator('[data-accion="prod-accion"][data-tipo="usar"]').click()
    await pg.click('[data-accion="cant-mas"]')
    check(await pg.input_value('#pf-cant') == '1', 'no deja usar más de lo que hay (1 caja)')
    await pg.click('#pf-confirmar')
    await pg.wait_for_timeout(100)
    check('Agotado' in await fila.inner_text(), 'hojas de afeitar queda agotado')
    check(await fila.locator('[data-tipo="usar"]').is_disabled(), 'agotado: no se puede usar')
    check('se terminó' in await txt(pg, '.alerta'), 'alerta de reponer dice que se terminó')
    await fila.locator('[data-tipo="comprar"]').click()
    await pg.fill('#pf-cant', '6')
    await pg.fill('#pf-costo', '150000')
    await pg.select_option('#pf-medio', 'Transferencia')
    check(await pg.input_value('#pf-costo') == '150.000', 'el costo se formatea con puntos')
    await pg.click('#pf-confirmar')
    await pg.wait_for_timeout(100)
    aviso_s = await txt(pg, '.aviso-stock')
    check('Sumaste 6 cajas de hojas de afeitar. Ahora hay 6 cajas.' in aviso_s and 'Gs. 150.000' in aviso_s, f'aviso de compra: {aviso_s}')
    talco = pg.locator('.prod', has_text='Talco')
    await talco.locator('[data-tipo="editar"]').click()
    await pg.fill('#pf-stock', '5')
    await pg.fill('#pf-minimo', '2')
    await pg.click('#pf-confirmar')
    await pg.wait_for_timeout(100)
    check('La cantidad pasó de 3 a 5' in await txt(pg, '.aviso-stock'), 'corrección de stock del talco')
    toallas = pg.locator('.prod', has_text='Toallas descartables')
    await toallas.locator('[data-tipo="editar"]').click()
    await pg.click('[data-accion="prod-eliminar"]')
    await pg.click('[data-accion="prod-eliminar-si"]')
    await pg.wait_for_timeout(100)
    check(await pg.locator('.prod', has_text='Toallas descartables').count() == 0, 'toallas eliminadas del stock')
    await pg.click('[data-accion="nuevo-toggle"]')
    await pg.fill('#np-nombre', 'Navajas descartables')
    await pg.select_option('#np-unidad', 'paquete')
    await pg.fill('#np-cantidad', '4')
    await pg.fill('#np-minimo', '2')
    await pg.check('#np-compra')
    await pg.wait_for_timeout(100)
    await pg.fill('#np-costo', '60000')
    check(not await pg.is_disabled('#np-cargar'), 'el formulario nuevo queda listo')
    await pg.click('#np-cargar')
    await pg.wait_for_timeout(100)
    aviso_n = await txt(pg, '.aviso-stock')
    check(aviso_n == 'Cargaste Navajas descartables: 4 paquetes. El gasto de Gs. 60.000 quedó anotado en la caja.', f'aviso de carga: {aviso_n}')
    await pg.click('[data-accion="tab-stock"][data-t="venta"]')
    cera = pg.locator('.prod', has_text='Cera mate')
    await cera.locator('[data-tipo="vender"]').click()
    await pg.click('[data-accion="cant-mas"]')
    check(await txt(pg, '#pf-total') == 'Gs. 70.000', 'vender 2 ceras: total Gs. 70.000')
    await pg.click('#pf-confirmar')
    await pg.wait_for_timeout(100)
    check(re.search(r'\b6\s+potes', await cera.inner_text()) is not None, 'quedan 6 potes de cera')
    movs = await pg.locator('.smov-lista').inner_text()
    check('Vendiste 2 potes de cera mate por Gs. 70.000' in movs and 'Compraste 6 cajas de hojas de afeitar por Gs. 150.000' in movs, 'últimos movimientos del stock')
    await pg.click('[data-accion="tab-stock"][data-t="insumo"]')
    await pg.locator('.prod', has_text='Cuellos descartables').locator('[data-tipo="comprar"]').click()
    await pg.screenshot(path=f'{OUT}/{nombre}-panel-stock.png', full_page=True)
    await pg.click('[data-accion="prod-cerrar"]')

    # Caja: las compras y ventas quedaron anotadas
    await pg.click('[data-accion="vista"][data-v="caja"]')
    caja = await pg.locator('.pa-movs').inner_text()
    check('Compra: 6 cajas de hojas de afeitar' in caja and 'Venta: 2 potes de cera mate' in caja and 'Compra: 4 paquetes de navajas descartables' in caja, 'la caja de hoy tiene compras y ventas del stock')
    await pg.screenshot(path=f'{OUT}/{nombre}-panel-caja.png', full_page=True)

    # Todo se guarda: recargar y volver a entrar
    await pg.reload()
    await pg.wait_for_timeout(300)
    for k in '2121':
        await pg.click(f'.tecla[data-k="{k}"]')
    await pg.click('[data-accion="vista"][data-v="stock"]')
    hojas = await pg.locator('.prod', has_text='Hojas de afeitar').inner_text()
    check('6' in hojas and await pg.locator('.prod', has_text='Navajas descartables').count() == 1, 'después de recargar el stock sigue igual')
    await pg.click('[data-accion="vista"][data-v="hoy"]')
    check(await pg.locator('.turno.cancelado', has_text=cliente_tarde).count() == 1, 'después de recargar sigue cancelado el turno de la tarde')

    # Sitio: Juan ve que la barbería canceló
    await pg.goto(URL + '#mis-turnos')
    await pg.wait_for_timeout(300)
    mis = await pg.locator('#reserva').inner_text()
    check('La barbería canceló este turno' in mis, 'Mis turnos muestra que la barbería canceló')
    check(await pg.locator('#hero-turno').is_hidden(), 'sin turnos próximos no aparece el aviso del inicio')

    # Reiniciar datos de ejemplo
    await pg.goto(URL + '#panel')
    await pg.wait_for_timeout(200)
    check(await pg.locator('.tecla').count() == 0, 'volviendo del sitio, el panel sigue abierto hasta tocar Salir')
    await pg.click('[data-accion="reiniciar"]')
    await pg.click('[data-accion="reiniciar-si"]')
    await pg.click('[data-accion="vista"][data-v="stock"]')
    check(re.search(r'\b1\s+caja\b', await pg.locator('.prod', has_text='Hojas de afeitar').inner_text()) is not None, 'reiniciar vuelve al stock de ejemplo')

    check(not errores, 'sin errores en la consola' + (': ' + ' | '.join(errores) if errores else ''))
    await ctx.close()

def primerNombre(n):
    return n.split()[0]

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        await recorrido(b, 'pc', {'width': 1440, 'height': 900}, False)
        await recorrido(b, 'cel', {'width': 390, 'height': 844}, True)
        await b.close()
    print('\nRESULTADO:', 'todo bien' if not fallas else f'{len(fallas)} fallas')

asyncio.run(main())
