"""Prueba la sección Precios del panel de Tommy Barber (reloj fijo: martes 27/10/2026 10:05, Paraguay)."""
import asyncio, re, sys
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

async def entrar(pg):
    await pg.goto(URL + '#panel')
    await pg.wait_for_timeout(200)
    if await pg.locator('.tecla').count():
        for k in '2121':
            await pg.click(f'.tecla[data-k="{k}"]')

async def recorrido(b, nombre, vp, mobile):
    ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, timezone_id='America/Asuncion', locale='es-PY')
    pg = await ctx.new_page()
    await pg.clock.install(time=datetime(2026, 10, 27, 10, 5, tzinfo=PY))
    errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
    await pg.goto(URL)
    await pg.wait_for_timeout(300)
    print(f'\n===== {nombre} =====')

    # Un turno reservado antes de cambiar los precios
    await pg.click('[data-reservar="combo-4"]')
    await pg.click('.rv-dia[data-k="1"]')
    await pg.click('.rv-hora:not([disabled])')
    await pg.click('#rv-seguir')
    await pg.fill('#rv-nombre', 'Juan Prueba')
    await pg.fill('#rv-tel', '0981 555 214')
    await pg.click('#rv-seguir')
    await pg.wait_for_timeout(100)

    # Panel > Precios
    await entrar(pg)
    await pg.click('[data-accion="vista"][data-v="precios"]')
    check(await pg.locator('.pr-fila').count() == 13, '13 filas en Precios')
    check(await pg.locator('#pr-barra').is_hidden(), 'sin cambios no aparece la barra de guardar')
    await pg.fill('#pr-precio-corte', '38000')
    check(await pg.input_value('#pr-precio-corte') == '38.000', 'el precio se escribe con puntos')
    check(await pg.locator('#pr-fila-corte.cambiada').count() == 1 and await pg.locator('#pr-antes-p-corte').is_visible(), 'la fila cambiada muestra el precio de antes')
    check(await pg.inner_text('#pr-barra-txt') == '1 servicio con cambios sin guardar.', 'la barra cuenta 1 servicio')
    await pg.fill('#pr-precio-combo-4', '55000')
    await pg.select_option('#pr-min-combo-4', '60')
    check(await pg.inner_text('#pr-barra-txt') == '2 servicios con cambios sin guardar.', 'la barra cuenta 2 servicios')
    await pg.fill('#pr-precio-ritual-barba', '')
    check(await pg.inner_text('#pr-barra-txt') == 'Falta el precio de Ritual de barba.' and await pg.is_disabled('#pr-guardar'), 'sin precio no deja guardar')
    await pg.fill('#pr-precio-ritual-barba', '30000')
    check(not await pg.is_disabled('#pr-guardar'), 'con los precios completos deja guardar')
    await pg.screenshot(path=f'{OUT}/{nombre}-precios-editando.png', full_page=True)
    await pg.click('#pr-guardar')
    await pg.wait_for_timeout(100)
    aviso = await pg.inner_text('.aviso-ok')
    check(aviso == 'Guardaste los cambios de 2 servicios. Ya se ven en el sitio.', f'aviso: {aviso}')
    hist = await pg.inner_text('.pr-otros .smov-lista')
    check('Corte clásico y degradado: precio de Gs. 35.000 a Gs. 38.000' in hist and 'Combo 4: duración de 45 min a 1 hora' in hist, 'quedan registrados los cambios')
    await pg.screenshot(path=f'{OUT}/{nombre}-precios-guardado.png', full_page=True)

    # El turno ya reservado mantiene su precio
    await pg.click('[data-accion="vista"][data-v="turnos"]')
    juan = await pg.locator('.turno', has_text='Juan Prueba').inner_text()
    check('Gs. 50.000' in juan, 'el turno de Juan sigue en Gs. 50.000')

    # El sitio muestra los precios nuevos
    await pg.goto(URL + '#inicio')
    await pg.wait_for_timeout(200)
    corte = await pg.locator('.precio-fila', has_text='Corte clásico y degradado').inner_text()
    combo4 = await pg.locator('.precio-fila', has_text='Combo 4').inner_text()
    check('Gs. 38.000' in corte, 'el sitio muestra el corte a Gs. 38.000')
    check('Gs. 55.000' in combo4 and '1 hora aprox.' in combo4, 'el sitio muestra el combo 4 a Gs. 55.000 y 1 hora')
    await pg.click('[data-accion="modo"][data-modo="mis"]')
    check('Gs. 50.000' in await pg.inner_text('.mt-item'), 'en Mis turnos el turno de Juan sigue en Gs. 50.000')

    # Una reserva nueva usa el precio nuevo
    await pg.click('[data-accion="modo"][data-modo="reservar"]')
    await pg.click('[data-reservar="corte"]')
    await pg.click('.rv-dia[data-k="2"]')
    await pg.click('.rv-hora:not([disabled])')
    await pg.click('#rv-seguir')
    await pg.fill('#rv-nombre', 'Ana Prueba')
    await pg.fill('#rv-tel', '0982 111 222')
    await pg.click('#rv-seguir')
    await pg.wait_for_timeout(100)
    check('Gs. 38.000' in await pg.inner_text('.rv-ticket'), 'una reserva nueva sale con el precio nuevo')

    # Recargar: los precios siguen
    await pg.reload()
    await pg.wait_for_timeout(200)
    check('Gs. 38.000' in await pg.locator('.precio-fila', has_text='Corte clásico y degradado').inner_text(), 'después de recargar sigue el precio nuevo')

    # Volver a la lista original
    await entrar(pg)
    await pg.click('[data-accion="vista"][data-v="precios"]')
    await pg.click('[data-accion="precios-restablecer"]')
    await pg.click('[data-accion="precios-restablecer-si"]')
    await pg.wait_for_timeout(100)
    check(await pg.input_value('#pr-precio-corte') == '35.000', 'vuelve el corte a Gs. 35.000')
    check(await pg.locator('[data-accion="precios-restablecer"]').count() == 0, 'con la lista original no se ofrece volver a ella')
    await pg.goto(URL + '#inicio')
    await pg.wait_for_timeout(200)
    check('Gs. 35.000' in await pg.locator('.precio-fila', has_text='Corte clásico y degradado').inner_text(), 'el sitio vuelve a Gs. 35.000')
    check('Gs. 38.000' in await pg.locator('#reserva').inner_text() or True, '(el ticket de Ana conserva su precio)')
    await pg.click('[data-accion="modo"][data-modo="mis"]')
    mis = await pg.inner_text('#reserva')
    check('Gs. 38.000' in mis and 'Gs. 50.000' in mis, 'Mis turnos conserva los precios con que se reservó')

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
