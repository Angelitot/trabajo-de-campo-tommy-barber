"""Prueba la llegada sin turno (hora libre, WhatsApp, próximo día) y el registro de clientes
(N.º interno, repetidos, unir fichas, cambiar número). Reloj fijo: martes 27/10/2026 10:05, Paraguay."""
import asyncio, json, sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from playwright.async_api import async_playwright

RAIZ = Path(__file__).resolve().parent.parent
URL = sys.argv[1] if len(sys.argv) > 1 else (RAIZ / 'index.html').as_uri()
OUT = Path(__file__).resolve().parent / 'capturas'
OUT.mkdir(exist_ok=True)
PY = timezone(timedelta(hours=-3))
fallas = []

def check(cond, msg):
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)
    if not cond:
        fallas.append(msg)

async def panel(pg):
    return json.loads(await pg.evaluate("localStorage.getItem('tommybarber-panel')"))

async def registro(pg):
    return json.loads(await pg.evaluate("localStorage.getItem('tommybarber-clientes') || 'null'"))

async def entrar(pg, hash_):
    await pg.goto(URL + hash_)
    await pg.wait_for_timeout(200)
    for k in '2121':
        await pg.click(f'.tecla[data-k="{k}"]')
    await pg.wait_for_timeout(150)

async def recorrido(b, nombre, vp, mobile):
    ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, timezone_id='America/Asuncion', locale='es-PY')
    await ctx.route('https://wa.me/**', lambda r: r.abort())
    pg = await ctx.new_page()
    await pg.clock.install(time=datetime(2026, 10, 27, 10, 5, tzinfo=PY))
    errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' and 'wa.me' not in m.text and 'ERR_FAILED' not in m.text else None)
    print(f'\n===== {nombre} =====')

    # Se libera la hora de las 10:30 (el cliente canceló) para tener un hueco a continuación del actual
    await entrar(pg, '#atender')
    d = await panel(pg)
    for t in d['turnos']:
        if t['fecha'] == '2026-10-27' and t['min'] == 630:
            t['estado'] = 'cancelado'; t['canceladoPor'] = 'cliente'
    await pg.evaluate("d => localStorage.setItem('tommybarber-panel', JSON.stringify(d))", d)
    await pg.reload()
    await pg.wait_for_timeout(200)
    for k in '2121':
        await pg.click(f'.tecla[data-k="{k}"]')
    await pg.wait_for_timeout(150)
    actual = (await pg.inner_text('#at-card .at-nombre')).strip()

    # ---- Llegó alguien sin turno: se le da la primera hora libre, no la hora actual
    await pg.keyboard.press('a')
    horas = [ (await pg.locator('.at-hora-op').nth(i).inner_text()).split('\n')[0] for i in range(await pg.locator('.at-hora-op').count()) ]
    elegida = (await pg.locator('.at-hora-op[aria-pressed="true"]').inner_text()).split('\n')
    check(horas[0] == '10:30' and elegida[0] == '10:30', f'la primera hora libre (10:30) ya viene elegida, no las 10:05 ({horas[:4]})')
    check('10:00' not in horas, 'la hora del turno que está en curso no se ofrece')
    check('16:30' in horas, 'también se puede elegir otra hora libre del día (16:30)')
    check('10:30' in await pg.inner_text('[data-accion="at-llegada-agregar"]'), 'el botón dice a qué hora queda')
    await pg.fill('#at-l-nombre', 'Pedro Gómez')
    await pg.fill('#at-l-tel', '123')
    await pg.click('[data-accion="at-llegada-agregar"]')
    check('no parece un celular' in await pg.inner_text('.at-llegada'), 'un número mal escrito avisa y no lo anota')
    await pg.fill('#at-l-tel', '0981 555 444')
    await pg.click('.at-hora-op[data-m="990"]')
    check('16:30' in await pg.inner_text('[data-accion="at-llegada-agregar"]'), 'se puede cambiar a otra hora libre (16:30)')
    await pg.click('.at-hora-op[data-m="630"]')
    await pg.screenshot(path=str(OUT / f'{nombre}-llegada-form.png'), full_page=True)
    await pg.click('[data-accion="at-llegada-agregar"]')
    fila = await pg.inner_text('.at-fila')
    check('Pedro Gómez' in fila, 'Pedro se suma a la fila')
    d = await panel(pg)
    pedro = [t for t in d['turnos'] if t['cliente'] == 'Pedro Gómez'][0]
    check(pedro['min'] == 630 and pedro['llego'] == 605 and pedro['sinTurno'] and pedro['tel'] == '0981 555 444',
          f"queda a las 10:30, con la hora de llegada (10:05) y su número ({pedro['min']}, {pedro['llego']}, {pedro['tel']})")
    check(await nombre_actual(pg) == actual, 'el actual sigue siendo el mismo')

    # ---- Le falta 1 cliente: aparece el aviso para mandarle WhatsApp
    despues = await pg.inner_text('.at-lado')
    check('Le falta 1 cliente' in despues, 'en «Después» aparece el aviso de que le falta 1 cliente')
    a = pg.locator('.at-lado [data-accion="llamar"]')
    href = await a.get_attribute('href')
    check(href and '595981555444' in href and 'ya%20casi%20es%20tu%20turno' in href and 'minutos' in href, 'el botón abre WhatsApp con el mensaje listo')
    check('Llegó sin turno a las 10:05' in despues and 'le toca a las 10:30' in despues, 'dice a qué hora llegó y a qué hora le toca')
    await pg.screenshot(path=str(OUT / f'{nombre}-llegada-aviso.png'), full_page=True)
    async with ctx.expect_page() as popup:
        await a.click()
    await (await popup.value).close()
    await pg.wait_for_timeout(450)
    check('Le avisaste' in await pg.inner_text('.at-lado'), 'después de avisarle queda anotado «Le avisaste…»')
    d = await panel(pg)
    check([t for t in d['turnos'] if t['cliente'] == 'Pedro Gómez'][0]['llamadoEn'] > 0, 'se guarda cuándo se le avisó')

    # ---- Si hoy ya no queda lugar: se ofrecen las horas libres del próximo día
    await pg.keyboard.press('Escape')
    await pg.click('[data-accion="at-llegada-abrir"]')
    await pg.select_option('#at-l-serv', 'combo-2')
    txt = await pg.inner_text('.at-llegada')
    check('Hoy ya no queda lugar' in txt and 'miércoles 28 de octubre' in txt, 'un servicio largo que no entra hoy ofrece el miércoles 28')
    await pg.fill('#at-l-nombre', '')
    await pg.fill('#at-l-tel', '0981555444')
    check('Darle turno el miércoles 28 de octubre' in await pg.inner_text('[data-accion="at-llegada-agregar"]'), 'el botón da el turno del otro día')
    await pg.screenshot(path=str(OUT / f'{nombre}-llegada-otro-dia.png'), full_page=True)
    await pg.click('[data-accion="at-llegada-agregar"]')
    check('tiene turno el miércoles 28 de octubre' in await pg.inner_text('.at-hecho'), 'avisa que quedó con turno para el otro día')
    d = await panel(pg)
    otro = [t for t in d['turnos'] if t['fecha'] == '2026-10-28' and t.get('enLocal')]
    check(len(otro) == 1 and not otro[0]['sinTurno'], 'el turno del otro día queda guardado como anotado en el local')

    # ---- Clientes: N.º interno y posibles repetidos
    await pg.click('[data-accion="vista"][data-v="clientes"]') if not mobile else await pg.evaluate("document.querySelector('[data-accion=\"vista\"][data-v=\"clientes\"]').click()")
    main = await pg.inner_text('#pa-main')
    check('Posibles clientes repetidos (2)' in main, 'avisa dos posibles repetidos')
    check('¿Cambió de número?' in main and 'número de un familiar' in main, 'uno por mismo nombre y otro por mismo número')
    check('N.º ' in main, 'cada cliente muestra su N.º')
    reg = await registro(pg)
    pedro_ids = [v for k, v in reg['ids'].items() if k.startswith('t595981555444|')]
    check(len(set(pedro_ids)) == 1, 'el que dejó solo el número quedó en la ficha de Pedro (mismo cliente)')
    await pg.screenshot(path=str(OUT / f'{nombre}-clientes-repetidos.png'), full_page=True)

    # Son distintos (papá e hijo con el mismo número)
    rep = pg.locator('.cl-rep', has_text='número de un familiar')
    check('Óscar Duarte' in await rep.inner_text() and 'Thiago Duarte' in await rep.inner_text(), 'Óscar y Thiago Duarte comparten número')
    await rep.locator('[data-accion="cl-distintos"]').click()
    check('Posibles clientes repetidos (1)' in await pg.inner_text('#pa-main'), '«Son distintos» lo saca de la lista')
    check(len((await registro(pg))['distintos']) == 1, 'y queda guardado para no volver a preguntar')

    # Unir: Rodrigo Villalba cambió de número
    rep = pg.locator('.cl-rep', has_text='¿Cambió de número?')
    check('Rodrigo Villalba' in await rep.inner_text(), 'Rodrigo Villalba aparece con dos números')
    await rep.locator('[data-accion="cl-unir-pedir"]').click()
    conf = await pg.inner_text('.cl-confirmar')
    check('0994 000 512' in conf and 'el último que usó' in conf, 'antes de unir dice qué número queda (el último)')
    await pg.click('[data-accion="cl-unir-si"]')
    main = await pg.inner_text('#pa-main')
    check('quedaron en una sola' in main and 'Posibles clientes repetidos' not in main, 'se unen y ya no hay repetidos')
    rodrigos = await pg.locator('.cl-item', has_text='Rodrigo Villalba').count()
    check(rodrigos == 1, 'queda un solo Rodrigo Villalba en la lista')

    # Ficha: números anteriores y búsqueda por el número viejo
    await pg.fill('#cl-buscar', '0976 000 285')
    visibles = await pg.locator('.cl-lista li:not([hidden])').count()
    check(visibles == 1 and 'Rodrigo Villalba' in await pg.locator('.cl-lista li:not([hidden])').first.inner_text(), 'se lo encuentra buscando por su número anterior')
    await pg.locator('.cl-lista li:not([hidden]) .cl-item').first.click()
    ficha = await pg.inner_text('#pa-main')
    check('CLIENTE N.º' in ficha.upper() and 'WhatsApp 0994 000 512' in ficha and 'Números anteriores: 0976 000 285' in ficha, 'la ficha muestra N.º, número actual y el anterior')

    # Cambiar número
    await pg.click('[data-accion="cl-tel-abrir"]')
    await pg.fill('#cl-tel', '0994 000 512')
    await pg.click('[data-accion="cl-tel-guardar"]')
    check('Ese ya es su número' in await pg.inner_text('.cl-herr'), 'no deja poner el mismo número')
    await pg.fill('#cl-tel', '0983 222 111')
    await pg.click('[data-accion="cl-tel-guardar"]')
    ficha = await pg.inner_text('#pa-main')
    check('ahora es 0983 222 111' in ficha and 'WhatsApp 0983 222 111' in ficha, 'cambia el número')
    check('0994 000 512' in ficha.split('Números anteriores:')[1].split('\n')[0] and '0976 000 285' in ficha.split('Números anteriores:')[1].split('\n')[0], 'los dos números viejos quedan como anteriores')
    await pg.screenshot(path=str(OUT / f'{nombre}-clientes-ficha.png'), full_page=True)
    d = await panel(pg)
    hoy = [t for t in d['turnos'] if t['cliente'] == 'Rodrigo Villalba' and t['estado'] == 'confirmado' and t['fecha'] >= '2026-10-27' and t['min'] > 605]
    check(hoy and all(t['tel'] == '0983 222 111' for t in hoy), 'sus próximos turnos pasan al número nuevo')

    # Unir con otra ficha a mano (buscador)
    await pg.click('[data-accion="cl-volver"]')
    await pg.fill('#cl-buscar', 'Thiago Duarte')
    await pg.locator('.cl-lista li:not([hidden]) .cl-item').first.click()
    await pg.click('[data-accion="cl-unir-abrir"]')
    await pg.fill('#cl-unir-buscar', 'Pedro Gómez')
    check(await pg.locator('#cl-unir-res [data-accion="cl-unir-pedir"]').count() == 1, 'el buscador encuentra a Pedro Gómez')
    await pg.click('#cl-unir-res [data-accion="cl-unir-pedir"]')
    check('¿Juntar las dos fichas?' in await pg.inner_text('#pa-main'), 'pide confirmar antes de unir')
    await pg.click('[data-accion="cl-unir-no"]')
    check(await pg.locator('.cl-confirmar').count() == 0, 'Cancelar no une nada')

    # El mapa de calor tiene leyenda
    await pg.evaluate("document.querySelector('[data-accion=\"vista\"][data-v=\"reportes\"]').click()")
    check('Menos clientes' in await pg.inner_text('.rep-leyenda') and 'Cómo se lee' in await pg.inner_text('#pa-main'), 'el mapa de Reportes tiene leyenda y explicación')

    # Al recargar, todo sigue igual
    await pg.reload()
    await pg.wait_for_timeout(150)
    for k in '2121':
        await pg.click(f'.tecla[data-k="{k}"]')
    await pg.evaluate("document.querySelector('[data-accion=\"vista\"][data-v=\"clientes\"]').click()")
    main = await pg.inner_text('#pa-main')
    check('Posibles clientes repetidos' not in main and await pg.locator('.cl-item', has_text='Rodrigo Villalba').count() == 1, 'después de recargar la unión y «son distintos» se mantienen')

    check(not errores, 'sin errores en la consola' + (': ' + ' | '.join(errores) if errores else ''))
    await ctx.close()

async def nombre_actual(pg):
    return (await pg.inner_text('#at-card .at-nombre')).strip()

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        await recorrido(b, 'pc', {'width': 1440, 'height': 900}, False)
        await recorrido(b, 'cel', {'width': 390, 'height': 844}, True)
        await b.close()
    print('\nRESULTADO:', 'todo bien' if not fallas else f'{len(fallas)} fallas')

asyncio.run(main())
