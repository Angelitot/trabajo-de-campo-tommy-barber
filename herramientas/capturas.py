"""Saca las capturas del panel para docs/capturas/ (WebP, 1200 px de ancho).
Usa datos de ejemplo y el reloj fijo en el martes 27/10/2026 a las 10:05, hora de Paraguay.

Uso, desde la carpeta del repositorio: python herramientas/capturas.py
(necesita: pip install playwright pillow, y python -m playwright install chromium)."""
import asyncio, io, tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
from PIL import Image
from playwright.async_api import async_playwright

RAIZ = Path(__file__).resolve().parent.parent
URL = (RAIZ / 'index.html').as_uri()
DESTINO = RAIZ / 'docs' / 'capturas'
PY = timezone(timedelta(hours=-3))
ALTO_MAX = 2200
TMP = Path(tempfile.mkdtemp())


def guardar(png, nombre, ancho=None):
    im = Image.open(io.BytesIO(png)).convert('RGB')
    if im.height > ALTO_MAX * im.width / 1200:
        im = im.crop((0, 0, im.width, int(ALTO_MAX * im.width / 1200)))
    if ancho and im.width > ancho:
        im = im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS)
    im.save(DESTINO / f'{nombre}.webp', 'WEBP', quality=80, method=6)
    print('  ', nombre, im.size)


async def nueva(b, vp, movil=False):
    ctx = await b.new_context(viewport=vp, device_scale_factor=2 if movil else 1, is_mobile=movil, has_touch=movil,
                              timezone_id='America/Asuncion', locale='es-PY')
    await ctx.route('https://wa.me/**', lambda r: r.abort())
    pg = await ctx.new_page()
    await pg.clock.install(time=datetime(2026, 10, 27, 10, 5, tzinfo=PY))
    return ctx, pg


async def pin(pg):
    for k in '2121':
        await pg.click(f'.tecla[data-k="{k}"]')
    await pg.wait_for_timeout(150)


async def vista(pg, v):
    await pg.evaluate(f"document.querySelector('[data-accion=\"vista\"][data-v=\"{v}\"]').click()")
    await pg.mouse.move(5, 5)
    await pg.wait_for_timeout(150)


async def foto(pg, nombre, completa=True):
    await pg.evaluate('window.scrollTo(0, 0)')
    await pg.wait_for_timeout(150)
    guardar(await pg.screenshot(full_page=completa), nombre)


async def main():
    Image.new('RGB', (1500, 2000), (60, 60, 60)).save(TMP / 'corte.jpg')
    async with async_playwright() as pw:
        b = await pw.chromium.launch()

        # ---- Panel con un solo barbero (como al empezar)
        ctx, pg = await nueva(b, {'width': 1200, 'height': 750})
        await pg.goto(URL + '#panel')
        await pg.wait_for_timeout(300)
        await pin(pg)
        for v, nombre in [('hoy', '08-panel-hoy'), ('turnos', '09-panel-turnos'), ('caja', '10-panel-caja'), ('stock', '11-panel-stock'),
                          ('precios', '12-panel-servicios'), ('horario', '18-panel-horario'), ('clientes', '19-panel-clientes'), ('reportes', '21-panel-reportes')]:
            await vista(pg, v)
            await foto(pg, nombre)
        await vista(pg, 'clientes')
        await pg.fill('#cl-buscar', 'Fabrizio Giménez')
        await pg.locator('.cl-lista li:not([hidden]) .cl-item').first.click()
        await pg.mouse.move(5, 5)
        await foto(pg, '20-panel-cliente', completa=False)
        await vista(pg, 'atender')
        await foto(pg, '15-panel-atender', completa=False)
        # Servicio nuevo
        await vista(pg, 'precios')
        await pg.click('[data-accion="sv-nuevo"]')
        await pg.fill('#sv-nombre', 'Corte para niños')
        await pg.fill('#sv-precio', '25000')
        await pg.mouse.move(5, 5)
        await foto(pg, '30-servicio-nuevo', completa=False)
        await ctx.close()

        # ---- Dos barberos: uno de lunes a sábado y otro que viene los sábados a la mañana
        ctx, pg = await nueva(b, {'width': 1200, 'height': 750})
        await pg.goto(URL + '#panel')
        await pg.wait_for_timeout(300)
        await pin(pg)
        await vista(pg, 'barberos')
        await pg.click('[data-accion="bb-nuevo"]')
        await pg.fill('#bb-nombre', 'Barbero 2')
        for wd in '12345':
            await pg.click(f'[data-bb-dia="{wd}"][data-bb="on"]')
        await pg.select_option('[data-bb-dia="6"][data-bb="hasta"]', '720')
        await pg.mouse.move(5, 5)
        await foto(pg, '27-barbero-nuevo')
        await pg.click('#bb-guardar')
        await pg.mouse.move(5, 5)
        await foto(pg, '26-panel-barberos', completa=False)
        # Reserva con barbero
        await pg.goto(URL + '#reservar')
        await pg.reload()
        await pg.wait_for_timeout(300)
        await pg.click('.rv-servicio[data-id="corte"]')
        await pg.click('#reserva [data-accion="seguir"]')
        await pg.click('[data-accion="barbero"][data-id="b2"]')
        await pg.click('[data-accion="dia"][data-k="4"]')
        await pg.click('[data-accion="hora"][data-k="4"][data-m="540"]')
        await pg.mouse.move(5, 5)
        guardar(await pg.locator('#reserva').screenshot(), '28-reserva-barbero')
        # Tope de turnos: un papá que ya reservó para sus dos hijos y para él
        for n in ['Marcos Benítez', 'Thiago Benítez', 'Mateo Benítez']:
            await pg.reload()
            await pg.wait_for_timeout(200)
            await pg.click('.rv-servicio[data-id="corte"]')
            await pg.click('#reserva [data-accion="seguir"]')
            await pg.click('[data-accion="dia"][data-k="1"]')
            await pg.locator('.rv-hora:not([disabled])').first.click()
            await pg.click('#reserva [data-accion="seguir"]')
            await pg.fill('#rv-nombre', n)
            await pg.fill('#rv-tel', '0981 222 333')
            await pg.click('#reserva [data-accion="seguir"]')
        await pg.reload()
        await pg.wait_for_timeout(200)
        await pg.click('.rv-servicio[data-id="corte"]')
        await pg.click('#reserva [data-accion="seguir"]')
        await pg.click('[data-accion="dia"][data-k="2"]')
        await pg.locator('.rv-hora:not([disabled])').first.click()
        await pg.click('#reserva [data-accion="seguir"]')
        await pg.fill('#rv-nombre', 'Marcos Benítez')
        await pg.fill('#rv-tel', '0981 222 333')
        await pg.mouse.move(5, 5)
        guardar(await pg.locator('#reserva').screenshot(), '34-reserva-limite')
        # Atender con un botón por barbero e intercambio de horas
        await pg.goto(URL + '#atender')
        await pg.reload()
        await pg.wait_for_timeout(300)
        await pin(pg)
        await pg.keyboard.press('p')
        await pg.mouse.move(5, 5)
        await foto(pg, '29-atender-barberos', completa=False)
        # Turno falso
        await vista(pg, 'turnos')
        await pg.locator('.turno', has_text='Thiago Benítez').locator('[data-accion="cancelar-abrir"]').click()
        await pg.click('[data-accion="cancelar-falso"]')
        await pg.mouse.move(5, 5)
        guardar(await pg.locator('.turno', has_text='Thiago Benítez').screenshot(), '31-turno-falso')
        await pg.click('[data-accion="cancelar-falsos"]')
        await vista(pg, 'clientes')
        guardar(await pg.locator('.cl-bloqueados').screenshot(), '32-numeros-bloqueados')
        # Fotos
        await vista(pg, 'fotos')
        await pg.set_input_files('#ft-galeria', str(TMP / 'corte.jpg'))
        await pg.wait_for_timeout(600)
        await pg.mouse.move(5, 5)
        await foto(pg, '33-panel-fotos')
        await ctx.close()

        # ---- Celular
        ctx, pg = await nueva(b, {'width': 390, 'height': 844}, movil=True)
        await pg.goto(URL + '#atender')
        await pg.wait_for_timeout(300)
        await pin(pg)
        await pg.evaluate("document.getElementById('pa-main').scrollIntoView()")
        await pg.wait_for_timeout(150)
        guardar(await pg.screenshot(), '14-celular-panel', ancho=780)
        await ctx.close()
        await b.close()

asyncio.run(main())
