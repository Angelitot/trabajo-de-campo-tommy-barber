"""Prueba galería, WhatsApp del local, cambios de horario, cambiar turno, clientes y reportes
(reloj fijo: martes 27/10/2026 10:05, Paraguay)."""
import asyncio, sys
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

async def entrar(pg, vista):
    await pg.goto(URL + '#panel')
    await pg.wait_for_timeout(150)
    if await pg.locator('.tecla').count():
        for k in '2121':
            await pg.click(f'.tecla[data-k="{k}"]')
    await pg.click(f'[data-accion="vista"][data-v="{vista}"]')
    await pg.wait_for_timeout(100)

async def recorrido(b, nombre, vp, mobile):
    ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, timezone_id='America/Asuncion', locale='es-PY')
    pg = await ctx.new_page()
    await pg.clock.install(time=datetime(2026, 10, 27, 10, 5, tzinfo=PY))
    errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
    print(f'\n===== {nombre} =====')
    await pg.goto(URL)
    await pg.wait_for_timeout(300)

    # Sitio: galería, WhatsApp del local y texto de la fachada
    check(await pg.locator('#cortes .galeria img').count() == 3, 'la galería tiene 3 fotos')
    wa = await pg.locator('#llegar a.btn-wa').get_attribute('href')
    check('595972496916' in wa, 'botón de WhatsApp del local en Cómo llegar')
    check('595972496916' in await pg.locator('.pie-links').inner_html(), 'WhatsApp del local en el pie')
    check('persiana blanca' not in await pg.inner_text('#llegar'), 'ya no está la frase de la persiana')

    # Cambiar día u hora desde Mis turnos
    await pg.click('[data-reservar="combo-4"]')
    await pg.click('.rv-dia[data-k="1"]')
    await pg.click('.rv-hora:not([disabled])')
    await pg.fill('#rv-nombre', 'Juan Prueba')
    await pg.fill('#rv-tel', '0981 555 214')
    await pg.click('#rv-seguir')
    antes = await pg.inner_text('.rv-ticket')
    await pg.click('[data-accion="modo"][data-modo="mis"]')
    await pg.click('[data-accion="cambiar-mio"]')
    check('Cambiar turno' in await pg.inner_text('.rv-titulo'), 'el widget pasa a «Cambiar turno»')
    await pg.click('.rv-dia[data-k="2"]')
    await pg.click('.rv-hora:not([disabled]) >> nth=2')
    await pg.click('#rv-seguir')
    ticket = await pg.inner_text('.rv-ticket')
    check('Turno cambiado' in ticket and 'Antes era' in ticket, 'el comprobante dice «Turno cambiado» y el horario anterior')
    check('jueves' in ticket.lower(), 'el turno quedó para el jueves')
    await pg.click('[data-accion="modo"][data-modo="mis"]')
    check('Lo cambiaste' in await pg.inner_text('.mt-lista'), 'Mis turnos muestra que lo cambió')

    # Panel > Turnos: el dueño ve el cambio y tiene que recordar de nuevo
    await entrar(pg, 'turnos')
    juan = await pg.locator('.turno', has_text='Juan Prueba').inner_text()
    check('El cliente lo cambió' in juan, 'en Turnos se ve que el cliente lo cambió')

    # Horario: cerrar mañana (tiene turnos de ejemplo)
    await pg.click('[data-accion="vista"][data-v="horario"]')
    check(await pg.is_disabled('#hz-guardar'), 'sin fecha no deja guardar')
    await pg.fill('#hz-fecha', '2026-10-28')
    await pg.fill('#hz-motivo', 'Feriado')
    await pg.wait_for_timeout(100)
    prev = await pg.inner_text('#hz-afectados')
    check('turno' in prev, f'avisa los turnos que quedan afuera: {prev[:70]}')
    await pg.click('#hz-guardar')
    aviso = await pg.inner_text('.aviso-ok')
    check('Guardaste' in aviso and 'afuera' in aviso, f'aviso: {aviso[:80]}')
    item = await pg.inner_text('.hz-item')
    check('Cerrado todo el día' in item and 'Feriado' in item, 'el cambio aparece en la lista')
    afectados = await pg.locator('.hz-item .turno').count()
    check(afectados >= 1, f'lista los turnos afectados ({afectados})')
    await pg.locator('.hz-item .turno [data-accion="cancelar-abrir"]').first.click()
    await pg.locator('[data-accion="cancelar-si"]').first.click()
    check(await pg.locator('.hz-item [data-accion="avisar"]').count() >= 1, 'después de cancelar ofrece avisar por WhatsApp')
    await pg.screenshot(path=str(OUT / f'{nombre}-horario.png'), full_page=True)

    # El sitio ya no ofrece el miércoles y lo avisa en Horarios
    await pg.goto(URL + '#inicio')
    await pg.wait_for_timeout(200)
    check('cerrado todo el día' in (await pg.inner_text('#lista-horarios')).lower() and 'Feriado' in await pg.inner_text('#lista-horarios'), 'Horarios del sitio avisa el cierre')
    await pg.click('[data-reservar="corte"]')
    mie = await pg.locator('.rv-dia[data-k="1"]').inner_text()
    check('cerrado' in mie and await pg.is_disabled('.rv-dia[data-k="1"]'), 'la reserva muestra el miércoles cerrado')

    # Cerrar unas horas hoy: el local figura cerrado ahora
    await entrar(pg, 'horario')
    await pg.click('[data-accion="hz-tipo"][data-t="franja"]')
    await pg.fill('#hz-fecha', '2026-10-27')
    await pg.select_option('#hz-desde', '600')
    await pg.select_option('#hz-fin', '690')
    await pg.click('#hz-guardar')
    check('Cerrado' in await pg.inner_text('#pa-estado-txt') or 'cerrado' in (await pg.inner_text('#pa-estado-txt')).lower(), 'con la franja de 10:00 a 11:30 el local figura cerrado ahora')
    # Otro horario un domingo
    await pg.click('[data-accion="hz-tipo"][data-t="especial"]')
    await pg.fill('#hz-fecha', '2026-11-01')
    await pg.select_option('#hz-desde', '480')
    await pg.select_option('#hz-fin', '720')
    await pg.click('#hz-guardar')
    check(await pg.locator('.hz-item').count() == 3, 'quedan tres cambios cargados')
    await pg.goto(URL + '#inicio')
    await pg.wait_for_timeout(200)
    await pg.click('[data-reservar="corte"]')
    dom = pg.locator('.rv-dia[data-k="5"]')
    check('cerrado' not in await dom.inner_text() and not await dom.is_disabled(), 'el domingo con horario especial se puede reservar')
    # Quitar el cierre del miércoles
    await entrar(pg, 'horario')
    await pg.locator('.hz-item', has_text='Feriado').locator('[data-accion="hz-quitar"]').click()
    check('Quitaste' in await pg.inner_text('.aviso-ok'), 'se puede quitar un cambio')
    check(await pg.locator('.hz-item').count() == 2, 'quedan dos cambios')

    # Clientes
    await pg.click('[data-accion="vista"][data-v="clientes"]')
    total = await pg.locator('.cl-lista li').count()
    check(total >= 50 and await pg.locator('.cl-lista li:not([hidden])').count() == 60, f'lista de clientes ({total}, se ven 60)')
    await pg.fill('#cl-buscar', 'fabrizio')
    visibles = await pg.locator('.cl-lista li:not([hidden])').count()
    check(1 <= visibles < 60, f'la búsqueda filtra ({visibles})')
    await pg.locator('.cl-lista li:not([hidden]) .cl-item').first.click()
    ficha = await pg.inner_text('#pa-main')
    check('Historial' in ficha and 'Visitas' in ficha and 'Fabrizio' in ficha, 'abre la ficha del cliente')
    check(await pg.locator('.cl-hist li').count() >= 3, 'la ficha tiene historial')
    await pg.screenshot(path=str(OUT / f'{nombre}-cliente.png'), full_page=True)
    await pg.click('[data-accion="cl-volver"]')
    await pg.click('[data-accion="cl-orden"][data-o="faltas"]')
    check(await pg.locator('.cl-lista .pill-falta').count() == await pg.locator('.cl-lista li').count(), '«Con faltas» muestra solo clientes que faltaron')

    # Atender avisa las faltas
    await pg.click('[data-accion="vista"][data-v="atender"]')
    pills = 0
    for _ in range(await pg.locator('.at-fila-item').count()):
        pills += await pg.locator('#at-card .pill-falta').count()
        await pg.keyboard.press('Space')
    check(pills >= 1, 'Atender avisa cuando un cliente faltó antes')

    # Reportes
    await pg.click('[data-accion="vista"][data-v="reportes"]')
    check(await pg.locator('.rep-mapa tbody tr').count() == 6 and await pg.locator('.rep-mapa tbody tr:first-child td').count() == 10, 'mapa de días (6) por horas (10)')
    check(await pg.locator('.rep-mes').count() == 6, 'ganancia de los últimos 6 meses')
    check('No vinieron' in await pg.inner_text('#pa-main'), 'faltas y cancelaciones')
    r3 = await pg.inner_text('.cifra-valor >> nth=0')
    await pg.click('[data-accion="rep-periodo"][data-p="4s"]')
    r1 = await pg.inner_text('.cifra-valor >> nth=0')
    check(int(r1) < int(r3), f'el período cambia los números ({r3} → {r1})')
    await pg.screenshot(path=str(OUT / f'{nombre}-reportes.png'), full_page=True)

    check(not errores, 'sin errores en la consola' + (': ' + ' | '.join(errores) if errores else ''))
    await ctx.close()

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        await recorrido(b, 'pc', {'width': 1440, 'height': 900}, False)
        await recorrido(b, 'cel', {'width': 390, 'height': 844}, True)
        await b.close()
    print('\nRESULTADO:', 'todo bien' if not fallas else f'{len(fallas)} fallas')

asyncio.run(main())
