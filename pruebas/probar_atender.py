"""Prueba la pantalla Atender del panel (reloj fijo: martes 27/10/2026 10:05, Paraguay)."""
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

async def nombre_actual(pg):
    return (await pg.inner_text('#at-card .at-nombre')).strip()

async def recorrido(b, nombre, vp, mobile):
    ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, timezone_id='America/Asuncion', locale='es-PY')
    pg = await ctx.new_page()
    await pg.clock.install(time=datetime(2026, 10, 27, 10, 5, tzinfo=PY))
    errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
    print(f'\n===== {nombre} =====')

    # Entrar directo por #atender
    await pg.goto(URL + '#atender')
    await pg.wait_for_timeout(200)
    for k in '2121':
        await pg.click(f'.tecla[data-k="{k}"]')
    await pg.wait_for_timeout(200)
    check((await pg.inner_text('#pa-titulo')).strip().lower() == 'atender', 'con #atender el PIN lleva directo a Atender')
    fila = await pg.locator('.at-fila-item').count()
    primero = await nombre_actual(pg)
    check(fila >= 3, f'la fila de hoy tiene turnos pendientes ({fila})')
    check(await pg.locator('.at-fila-item.sel').inner_text() != '' and primero in await pg.locator('.at-fila-item.sel').inner_text(), 'el actual es el primero de la fila')
    check('AHORA' in (await pg.inner_text('.at-etiqueta')).upper(), 'la tarjeta dice Ahora')
    await pg.screenshot(path=str(OUT / f'{nombre}-atender.png'), full_page=True)

    # Moverse con el teclado
    segundo = (await pg.locator('.at-fila-item').nth(1).inner_text()).split('\n')[1].strip()
    await pg.keyboard.press('Space')
    check(await nombre_actual(pg) == segundo, f'Espacio pasa al siguiente ({segundo})')
    check('SIGUIENTE' in (await pg.inner_text('.at-etiqueta')).upper(), 'la tarjeta dice Siguiente')
    await pg.keyboard.press('ArrowLeft')
    check(await nombre_actual(pg) == primero, 'la flecha izquierda vuelve al anterior')
    await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight')
    await pg.keyboard.press('Escape')
    check(await nombre_actual(pg) == primero, 'Esc vuelve al actual')

    # Un turno que todavía no llegó no se puede marcar como «no vino»
    await pg.keyboard.press('Space')
    check(await pg.is_disabled('[data-accion="at-novino"]'), '«No vino» está desactivado antes de la hora')
    await pg.keyboard.press('n')
    check(await nombre_actual(pg) == segundo, 'la tecla N no hace nada antes de la hora')
    await pg.keyboard.press('Escape')

    # Cobrar con la tecla 1 y deshacer
    caja_antes = await pg.evaluate("JSON.parse(localStorage.getItem('tommybarber-panel')).mov.length")
    await pg.keyboard.press('1')
    check(await nombre_actual(pg) == segundo, 'después de cobrar aparece el siguiente')
    aviso = await pg.inner_text('.at-hecho')
    check(f'Cobraste a {primero.split()[0]}' in aviso and 'en efectivo' in aviso, f'aviso: {aviso.splitlines()[0]}')
    caja = await pg.evaluate("JSON.parse(localStorage.getItem('tommybarber-panel')).mov.length")
    check(caja == caja_antes + 1, 'el cobro entra a la caja')
    await pg.keyboard.press('z')
    check(await nombre_actual(pg) == primero, 'Z deshace el cobro y vuelve el cliente')
    caja = await pg.evaluate("JSON.parse(localStorage.getItem('tommybarber-panel')).mov.length")
    check(caja == caja_antes, 'deshacer saca el cobro de la caja')

    # Pasar después del siguiente
    await pg.keyboard.press('p')
    check(await nombre_actual(pg) == segundo, 'P pasa al actual después del siguiente')
    orden = [ (await pg.locator('.at-fila-item').nth(i).inner_text()).split('\n')[1].strip() for i in range(2) ]
    check(orden == [segundo, primero], f'la fila queda {orden}')
    await pg.keyboard.press('z')
    check(await nombre_actual(pg) == primero, 'Z deshace el cambio de orden')

    # No vino (el actual ya pasó su hora)
    await pg.click('[data-accion="at-novino"]')
    check(await nombre_actual(pg) == segundo, '«No vino» lo saca de la fila')
    await pg.click('[data-accion="at-deshacer"]')
    check(await nombre_actual(pg) == primero, 'el botón Deshacer lo devuelve')

    # Alguien sin turno
    await pg.keyboard.press('a')
    check(await pg.locator('#at-l-serv').count() == 1, 'A abre el formulario de alguien sin turno')
    await pg.select_option('#at-l-serv', 'corte')
    await pg.fill('#at-l-nombre', 'Pedro')
    elegida = await pg.locator('.at-hora-op[aria-pressed="true"]').count()
    check(elegida == 1, 'ya viene elegida la primera hora libre')
    await pg.click('[data-accion="at-llegada-agregar"]')
    fila2 = await pg.locator('.at-fila-item').count()
    check(fila2 == fila + 1, 'el que llegó sin turno se suma a la fila')
    check('Pedro' in await pg.inner_text('.at-fila'), 'aparece Pedro en la fila')
    check(await nombre_actual(pg) == primero, 'el actual sigue siendo el mismo (orden de llegada)')

    # Cobrar a todos con el mouse hasta vaciar la fila
    for _ in range(fila2):
        await pg.click('[data-accion="at-cobrar"][data-medio="Transferencia"]')
    check('No queda nadie en la fila' in await pg.inner_text('#at-card'), 'al final: no queda nadie en la fila')
    check('Hoy atendiste' in await pg.inner_text('#at-card'), 'muestra el resumen del día')
    await pg.screenshot(path=str(OUT / f'{nombre}-atender-vacio.png'), full_page=True)

    # Lo cobrado aparece en Hoy
    await pg.click('[data-accion="vista"][data-v="hoy"]')
    check('Pedro' in await pg.inner_text('#pa-main'), 'Pedro aparece en la agenda de Hoy')

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
