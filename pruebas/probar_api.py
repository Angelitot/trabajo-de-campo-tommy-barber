"""Prueba la página y el panel con la base de datos de verdad: levanta la API (servidor/) contra un
PostgreSQL, sirve la página en localhost y la recorre con Playwright usando ?api=.
Crea una base nueva para la prueba y la borra al final.

Uso: python pruebas/probar_api.py "postgres://usuario@localhost:5432/postgres" [carpeta]
  carpeta: lo que se sirve (por defecto la del repositorio; publico/ para probar la versión publicada).
Necesita: Node 22 con las dependencias de servidor/ (npm ci), pip install playwright "psycopg[binary]"."""
import asyncio, functools, http.server, json, os, re, socket, subprocess, sys, threading, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
import psycopg
from playwright.async_api import async_playwright

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('PRUEBAS_DB', 'postgres://postgres@localhost:5499/postgres')
CARPETA = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else RAIZ
OUT = Path(__file__).resolve().parent / 'capturas'
OUT.mkdir(exist_ok=True)
DB = 'tb_e2e_%d' % os.getpid()
DUENO = ('tommy', 'Navaja.2026.fina')
PY = timezone(timedelta(hours=-3))
fallas = []


def check(cond, msg):
    print(('OK   ' if cond else 'FALLA') + ' ' + msg)
    if not cond:
        fallas.append(msg)


def puerto_libre():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


# Página en localhost: /acceso-barberos se sirve con index.html (como en Render)
class Pagina(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.split('?')[0].rstrip('/') == '/acceso-barberos':
            path = '/index.html'
        return super().translate_path(path)

    def log_message(self, *a):
        pass


def api(metodo, ruta, cuerpo=None, token=None):
    req = urllib.request.Request(API + ruta, method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


# Días para reservar: el primero de lunes a jueves que venga, a partir de mañana
hoy = datetime.now(PY).date()
DIAS = [(k, hoy + timedelta(days=k)) for k in range(1, 14) if (hoy + timedelta(days=k)).weekday() <= 3]
K1, F1 = DIAS[0]
K2, F2 = DIAS[1]


async def reservar(pg, k, m, nombre, tel, servicio='corte', confirmar=True):
    await pg.click(f'.rv-servicio[data-id="{servicio}"]')
    await pg.click(f'[data-accion="dia"][data-k="{k}"]')
    await pg.click(f'[data-accion="hora"][data-k="{k}"][data-m="{m}"]')
    await pg.fill('#rv-nombre', nombre)
    await pg.fill('#rv-tel', tel)
    if confirmar:
        await pg.click('#reserva [data-accion="seguir"]')


async def ingresar(pg, usuario, clave):
    await pg.goto(PANEL_URL)
    await pg.wait_for_selector('#pa-login')
    await pg.fill('#pa-usuario', usuario)
    await pg.fill('#pa-clave', clave)
    await pg.click('#pa-ingresar')


async def vista(pg, v):
    await pg.click(f'[data-accion="vista"][data-v="{v}"]')
    await pg.wait_for_timeout(150)


async def main():
    global API, SITIO_URL, PANEL_URL
    with psycopg.connect(ADMIN, autocommit=True) as c:
        c.execute(f'CREATE DATABASE {DB}')
    url_db = ADMIN.rsplit('/', 1)[0] + '/' + DB
    pa, pw_ = puerto_libre(), puerto_libre()
    API = f'http://127.0.0.1:{pa}'
    env = dict(os.environ, DATABASE_URL=url_db, DUENO_USUARIO=DUENO[0], DUENO_CLAVE=DUENO[1], PORT=str(pa), ORIGENES_LOCALES='1', API_URL=API)
    srv = subprocess.Popen(['node', str(RAIZ / 'servidor' / 'index.js')], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', pw_), functools.partial(Pagina, directory=str(CARPETA)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    SITIO_URL = f'http://localhost:{pw_}/?api={API}'
    PANEL_URL = f'http://localhost:{pw_}/acceso-barberos?api={API}'
    try:
        for _ in range(60):
            try:
                if api('GET', '/api/salud')[0] == 200:
                    break
            except Exception:
                pass
            time.sleep(0.25)
        await recorrido()
    finally:
        httpd.shutdown()
        srv.terminate()
        salida = srv.communicate(timeout=10)[0]
        if fallas:
            print('--- salida del servidor ---\n' + salida[-3000:])
        with psycopg.connect(ADMIN, autocommit=True) as c:
            c.execute(f'DROP DATABASE IF EXISTS {DB} WITH (FORCE)')
    print('\nRESULTADO:', 'todo bien' if not fallas else f'{len(fallas)} fallas')


async def recorrido():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        def contexto():
            return b.new_context(viewport={'width': 1200, 'height': 850}, timezone_id='America/Asuncion', locale='es-PY')

        errores = []

        async def pagina(ctx):
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errores.append(str(e)))
            await ctx.route('https://wa.me/**', lambda r: r.abort())
            return pg

        # ---------- Cliente ----------
        cli = await contexto()
        pg = await pagina(cli)
        await pg.goto(SITIO_URL)
        await pg.wait_for_selector('.rv-servicio')
        check(await pg.locator('a[href="#panel"]').count() == 0, 'la página de los clientes no tiene botón de acceso al panel')
        await pg.goto(SITIO_URL + '#panel')
        await pg.wait_for_timeout(300)
        check(await pg.locator('#panel').is_hidden(), '#panel no abre el panel con la base de datos')
        check(await pg.locator('.tecla').count() == 0, 'no hay teclado de PIN')
        await reservar(pg, K1, 540, 'Derlis Ortiz', '0981 111 222')
        await pg.wait_for_selector('.rv-ticket')
        codigo = (await pg.locator('.rv-ticket dd').last.inner_text()).strip()
        check(re.fullmatch(r'TB-[A-Z0-9]{6}', codigo) is not None, f'turno confirmado con código del servidor ({codigo})')
        guardadas = await pg.evaluate("JSON.parse(localStorage.getItem('tommybarber-mis-turnos') || '[]')")
        check(len(guardadas) == 1 and guardadas[0]['codigo'] == codigo and len(guardadas[0]['clave']) > 30, 'el celular guarda el código y su clave, no los datos')
        check(await pg.evaluate("localStorage.getItem('tommybarber-reservas')") is None, 'los turnos no se guardan en el navegador')
        # La misma persona no saca otro turno (lo frena la página y, si se borra lo guardado, el servidor)
        await pg.click('[data-accion="otro"]')
        await reservar(pg, K1, 600, 'Derlis Ortiz', '0981 111 222', confirmar=False)
        check('Ya hay un turno a nombre de Derlis Ortiz' in await pg.inner_text('#rv-tel-ayuda'), 'la página avisa que esa persona ya tiene turno')
        nuevo = await contexto()
        pn = await pagina(nuevo)
        await pn.goto(SITIO_URL)
        await pn.wait_for_selector('.rv-servicio')
        await reservar(pn, K1, 630, 'derlis  ortiz', '0981111222')
        await pn.wait_for_selector('#rv-tel-ayuda.error')
        check('Ya hay un turno a nombre de Derlis Ortiz' in await pn.inner_text('#rv-tel-ayuda'), 'desde otro celular lo frena el servidor y la página lo explica')
        check(await pn.locator('#rv-seguir').is_disabled(), 'y no deja confirmar')
        await nuevo.close()
        await pg.fill('#rv-nombre', 'Thiago Ortiz')
        await pg.wait_for_timeout(100)
        check(not await pg.locator('#rv-seguir').is_disabled(), 'con el nombre del hijo se puede reservar')
        await pg.click('#rv-seguir')
        await pg.wait_for_selector('.rv-ticket')
        # Recargar: Mis turnos sale del servidor
        await pg.goto(SITIO_URL + '#mis-turnos')
        await pg.wait_for_selector('.mt-item')
        check(await pg.locator('.mt-item').count() == 2, 'Mis turnos muestra los dos turnos después de recargar')
        # La hora reservada aparece ocupada en otro celular
        otro = await contexto()
        pg2 = await pagina(otro)
        await pg2.goto(SITIO_URL)
        await pg2.wait_for_selector('.rv-servicio')
        await pg2.click('.rv-servicio[data-id="corte"]')
        await pg2.click(f'[data-accion="dia"][data-k="{K1}"]')
        check(await pg2.locator(f'[data-accion="hora"][data-m="540"]').is_disabled(), 'otro celular ve las 09:00 ocupadas')
        check('Derlis' not in await pg2.content(), 'otro celular no ve el nombre de nadie')
        # Cambiar el turno de día y cancelar el otro
        await pg.locator('.mt-item', has_text='Corte').filter(has_text=re.compile('09:00')).locator('[data-accion="cambiar-mio"]').click()
        await pg.click(f'[data-accion="dia"][data-k="{K2}"]')
        await pg.click(f'[data-accion="hora"][data-k="{K2}"][data-m="810"]')
        await pg.click('#reserva [data-accion="seguir"]')
        await pg.wait_for_selector('.rv-ticket')
        check('Turno cambiado' in await pg.inner_text('.rv-ticket'), 'el cliente cambia su turno de día')
        await pg.click('[data-accion="cancelar-mio"]')
        await pg.click('[data-accion="cancelar-mio-si"]')
        await pg.wait_for_timeout(600)
        check('Turno cancelado' in await pg.inner_text('#reserva'), 'el cliente cancela su turno')

        # ---------- Panel del dueño ----------
        due = await contexto()
        pd = await pagina(due)
        await pd.goto(PANEL_URL)
        await pd.wait_for_selector('#pa-login')
        check(await pd.locator('#pa-usuario').count() == 1 and await pd.locator('#pa-clave').get_attribute('type') == 'password', '/acceso-barberos pide usuario y contraseña')
        await pd.wait_for_timeout(200)
        await pd.screenshot(path=str(OUT / 'api-ingreso.png'))
        await pd.fill('#pa-usuario', 'tommy')
        await pd.fill('#pa-clave', 'otra-clave-1')
        await pd.click('#pa-ingresar')
        await pd.wait_for_selector('#pa-login-msg:has-text("no son correctos")')
        check(True, 'contraseña incorrecta: no entra')
        await pd.fill('#pa-clave', DUENO[1])
        await pd.click('#pa-ingresar')
        await pd.wait_for_selector('#pa-titulo')
        check((await pd.inner_text('#pa-titulo')).strip() == 'Hoy', 'el dueño entra al panel')
        token = await pd.evaluate("localStorage.getItem('tommybarber-sesion')")
        check(bool(token) and len(token) > 30, 'el celular guarda solo el token de la sesión')
        check(await pd.locator('[data-accion="reiniciar"]').count() == 0, 'no hay «Reiniciar datos de ejemplo»')
        await vista(pd, 'turnos')
        lista = await pd.inner_text('#pa-main')
        check('Thiago Ortiz' in lista, 'el dueño ve los turnos reservados en la página')
        # Recordatorio y cancelación desde el panel
        fila = pd.locator('.turno', has_text='Thiago Ortiz')
        await fila.locator('[data-accion="cancelar-abrir"]').click()
        await pd.click('[data-accion="cancelar-si"]')
        await pd.wait_for_timeout(800)
        s, d = api('GET', '/api/panel/datos', token=token)
        t = next(x for x in d['turnos'] if x['cliente'] == 'Thiago Ortiz')
        check(t['estado'] == 'cancelado' and t['canceladoPor'] == 'barberia', 'cancelar desde el panel queda en la base')

        # Servicios: precio nuevo, se ve en la página
        await vista(pd, 'precios')
        await pd.fill('#pr-precio-corte', '40000')
        await pd.click('#pr-guardar')
        await pd.wait_for_timeout(800)
        await pg2.goto(SITIO_URL)
        await pg2.wait_for_selector('.rv-servicio')
        check('40.000' in await pg2.inner_text('#lista-precios'), 'el precio nuevo se ve en la página de los clientes')

        # Barbero nuevo con acceso al panel
        await vista(pd, 'barberos')
        await pd.click('[data-accion="bb-nuevo"]')
        await pd.fill('#bb-nombre', 'Barbero 2')
        await pd.click('#bb-guardar')
        await pd.wait_for_selector('#bb-n-b2')
        b1 = pd.locator('.bb-item', has=pd.locator('#bb-n-b1'))
        check('Dueño' in await b1.inner_text() and 'Es el dueño' in await b1.inner_text(), 'el barbero del dueño dice que es el dueño y entra con su cuenta')
        check(await pd.locator('[data-accion="bb-quitar"][data-id="b1"]').count() == 0, 'al dueño no se lo puede quitar de los barberos')
        check(True, 'barbero nuevo con el N.º que da la base (b2)')
        await pd.wait_for_selector('[data-accion="cuenta-abrir"][data-id="b2"]')
        await pd.click('[data-accion="cuenta-abrir"][data-id="b2"]')
        await pd.fill('#ct-usuario', 'barbero2')
        await pd.fill('#ct-clave', '1234567890')
        await pd.click('[data-foco="ct-guardar"]')
        await pd.wait_for_timeout(300)
        check('letras y números' in await pd.inner_text('#pa-main'), 'la contraseña débil no se acepta')
        await pd.fill('#ct-clave', 'Tijera.Fina.77')
        await pd.click('[data-foco="ct-guardar"]')
        await pd.wait_for_selector('.bb-acceso-t:has-text("barbero2")')
        check(True, 'el dueño le da acceso al panel al barbero')
        await pd.mouse.move(5, 5)
        await pd.screenshot(path=str(OUT / 'api-barberos.png'), full_page=True)

        # El barbero entra y ve solo lo suyo
        bar = await contexto()
        pb = await pagina(bar)
        await ingresar(pb, 'barbero2', 'Tijera.Fina.77')
        await pb.wait_for_selector('#pa-titulo')
        nav = await pb.locator('.pa-nav [data-accion="vista"]').evaluate_all('l => l.map(b => b.getAttribute("data-v"))')
        check(nav == ['atender', 'hoy', 'turnos'], f'el barbero ve Atender, Hoy y Turnos ({nav})')
        check((await pb.inner_text('#pa-titulo')).strip() == 'Atender', 'el barbero entra directo a Atender')
        check(await pb.locator('.at-barberos').count() == 0, 'el barbero no elige de quién es la fila')
        await vista(pb, 'turnos')
        check('Derlis' not in await pb.inner_text('#pa-main'), 'el barbero no ve los turnos de otro barbero')

        # Una reserva con el barbero 2 llega a su panel sola
        await pg2.goto(SITIO_URL)
        await pg2.wait_for_selector('.rv-servicio')
        await pg2.click('.rv-servicio[data-id="corte"]')
        await pg2.click('[data-accion="barbero"][data-id="b2"]')
        await pg2.click(f'[data-accion="dia"][data-k="{K1}"]')
        await pg2.click(f'[data-accion="hora"][data-k="{K1}"][data-m="540"]')
        await pg2.fill('#rv-nombre', 'Iván Rolón')
        await pg2.fill('#rv-tel', '0985 444 555')
        await pg2.click('#reserva [data-accion="seguir"]')
        await pg2.wait_for_selector('.rv-ticket')
        check('Barbero 2' in await pg2.inner_text('.rv-ticket'), 'a las 09:00 ocupado con uno, se reserva con el otro barbero')
        await pb.wait_for_function("document.getElementById('pa-main').innerText.includes('Iván Rolón')", timeout=25000)
        check(True, 'la reserva aparece en el panel del barbero sin recargar')

        # El barbero cambia su contraseña
        await pb.click('[data-accion="mi-clave"]')
        await pb.fill('#mc-actual', 'Tijera.Fina.77')
        await pb.fill('#mc-nueva', 'Peine.Azul.2028')
        await pb.fill('#mc-repetir', 'Peine.Azul.2029')
        await pb.click('[data-foco="mc-guardar"]')
        check('no son iguales' in await pb.inner_text('.mi-clave'), 'avisa si las dos contraseñas nuevas no coinciden')
        await pb.fill('#mc-actual', 'Tijera.Fina.77')
        await pb.fill('#mc-nueva', 'Peine.Azul.2028')
        await pb.fill('#mc-repetir', 'Peine.Azul.2028')
        await pb.click('[data-foco="mc-guardar"]')
        await pb.wait_for_selector('.aviso-ok:has-text("Cambiaste tu contraseña")')
        check(api('POST', '/api/acceso/ingresar', {'usuario': 'barbero2', 'clave': 'Peine.Azul.2028'})[0] == 200, 'el barbero cambia su contraseña y entra con la nueva')

        # Dos celulares del dueño cambian lo mismo: conflicto y se recarga
        due2 = await contexto()
        pd2 = await pagina(due2)
        await ingresar(pd2, *DUENO)
        await pd2.wait_for_selector('#pa-titulo')
        await vista(pd2, 'turnos')
        await vista(pd, 'turnos')
        await pd.wait_for_function("document.getElementById('pa-main').innerText.includes('Iván Rolón')", timeout=25000)
        await pd.locator('.turno', has_text='Iván Rolón').locator('[data-accion="cancelar-abrir"]').click()
        await pd.click('[data-accion="cancelar-si"]')
        await pd.wait_for_timeout(800)
        await pd2.locator('.turno', has_text='Iván Rolón').locator('[data-accion="cancelar-abrir"]').click()
        await pd2.click('[data-accion="cancelar-si"]')
        await pd2.wait_for_selector('.aviso-red', timeout=10000)
        check('Se volvió a cargar' in await pd2.inner_text('.aviso-red'), 'el segundo celular avisa del cambio simultáneo y recarga')

        # Foto: el logo nuevo se ve en la página
        await vista(pd, 'fotos')
        from PIL import Image
        Image.new('RGB', (600, 600), (200, 20, 40)).save(OUT / 'logo-prueba.png')
        await pd.set_input_files('#ft-logo', str(OUT / 'logo-prueba.png'))
        await pd.wait_for_timeout(1500)
        await pg2.goto(SITIO_URL)
        await pg2.wait_for_selector('.rv-servicio')
        await pg2.wait_for_timeout(300)
        estilo = await pg2.evaluate("(document.getElementById('fotos-estilo') || {}).textContent || ''")
        check('/api/fotos/logo-' in estilo, 'el logo nuevo sale del servidor')

        # ---------- El resto del panel, guardando en la base ----------
        def datos():
            return api('GET', '/api/panel/datos', token=token)[1]
        def turno_de(nombre):
            return next((x for x in datos()['turnos'] if x['cliente'] == nombre), None)
        hoy_txt = hoy.isoformat()
        if hoy.weekday() <= 5:
            # Dos clientes hoy a primera hora (anotados por la API) para usar Atender
            base = {'servicio': 'corte', 'tel': '', 'nota': '', 'precio': 35000, 'dur': 30, 'estado': 'confirmado', 'medio': '', 'canceladoPor': '',
                    'canceladoEn': 0, 'recordadoEn': 0, 'avisadoEn': 0, 'creadoEn': int(time.time() * 1000), 'orden': 0, 'sinTurno': False, 'llego': None,
                    'llamadoEn': 0, 'enLocal': True, 'antes': None, 'cambiadoEn': 0, 'barbero': 'b1', 'pospuesto': False, 'falso': False, 'ejemplo': False, 'fecha': hoy_txt}
            s, r = api('POST', '/api/panel/cambios', {'turnos': {'nuevos': [dict(base, id='TB-AAAAA1', codigo='TB-AAAAA1', cliente='Ana Benítez', min=480),
                                                                        dict(base, id='TB-AAAAA2', codigo='TB-AAAAA2', cliente='Beto Vera', min=510)]}}, token)
            check(s == 200, 'dos clientes de hoy para Atender')
            await pd.goto(PANEL_URL + '#atender')
            await pd.reload()
            await pd.wait_for_selector('#at-card')
            tarjeta = await pd.inner_text('#at-card')
            check('Ana Benítez' in tarjeta, 'Atender muestra a la primera de la fila' + ('' if 'Ana' in tarjeta else ': ' + tarjeta[:200]))
            await pd.click('[data-accion="at-cobrar"][data-medio="Efectivo"]')
            await pd.wait_for_timeout(900)
            t = turno_de('Ana Benítez')
            cobro = [m for m in datos()['mov'] if m.get('turno') == 'TB-AAAAA1']
            check(t['estado'] == 'atendido' and t['medio'] == 'Efectivo' and len(cobro) == 1 and cobro[0]['monto'] == 35000, 'cobrar en Atender queda en la base con su movimiento de caja')
            await pd.click('[data-accion="at-deshacer"]')
            await pd.wait_for_timeout(900)
            check(turno_de('Ana Benítez')['estado'] == 'confirmado' and not [m for m in datos()['mov'] if m.get('turno') == 'TB-AAAAA1'], 'deshacer el cobro también se deshace en la base')
            await pd.click('[data-accion="at-posponer"]')
            await pd.wait_for_timeout(900)
            check(turno_de('Ana Benítez')['min'] == 510 and turno_de('Beto Vera')['min'] == 480 and turno_de('Ana Benítez')['pospuesto'], '«Pasar después» intercambia las horas en la base')
            await pd.click('[data-accion="at-llegada-abrir"]')
            await pd.fill('#at-l-nombre', 'Cliente Nuevo')
            await pd.click('[data-accion="at-llegada-agregar"]')
            await pd.wait_for_timeout(900)
            nuevo = turno_de('Cliente Nuevo')
            check(nuevo is not None and nuevo['enLocal'], 'un cliente sin turno anotado en Atender queda en la base')
            await pd.click('[data-accion="at-deshacer"]')
            await pd.wait_for_timeout(900)
            check(turno_de('Cliente Nuevo') is None, 'deshacer lo borra de la base')
        else:
            print('(hoy es domingo: se saltea Atender)')

        await vista(pd, 'caja')
        await pd.click('[data-accion="tipo"][data-t="salida"]')
        await pd.fill('#pa-concepto', 'Bidón de agua')
        await pd.fill('#pa-monto', '12000')
        await pd.click('#pa-anotar-btn')
        await pd.wait_for_timeout(900)
        check(any(m['concepto'] == 'Bidón de agua' and m['tipo'] == 'salida' and m['monto'] == 12000 for m in datos()['mov']), 'un gasto anotado en la caja queda en la base')

        await vista(pd, 'stock')
        await pd.click('[data-accion="nuevo-toggle"]')
        await pd.fill('#np-nombre', 'Talco')
        await pd.fill('#np-cantidad', '3')
        await pd.click('#np-cargar')
        await pd.wait_for_timeout(900)
        prod = next((x for x in datos()['productos'] if x['nombre'] == 'Talco'), None)
        check(prod is not None and prod['stock'] == 3, 'un producto cargado queda en la base')
        await pd.click('[data-accion="prod-accion"][data-tipo="usar"]')
        await pd.click('#pf-confirmar')
        await pd.wait_for_timeout(900)
        d = datos()
        check(next(x for x in d['productos'] if x['nombre'] == 'Talco')['stock'] == 2 and any(m['tipo'] == 'uso' and m['nombre'] == 'Talco' for m in d['movStock']), 'usar uno resta el stock en la base')

        await vista(pd, 'horario')
        await pd.fill('#hz-fecha', F2.isoformat())
        await pd.fill('#hz-motivo', 'Feriado')
        await pd.click('#hz-guardar')
        await pd.wait_for_timeout(900)
        await pg2.goto(SITIO_URL)
        await pg2.wait_for_selector('.rv-servicio')
        await pg2.click('.rv-servicio[data-id="corte"]')
        check(await pg2.locator(f'[data-accion="dia"][data-k="{K2}"]').is_disabled() and 'Feriado' in await pg2.inner_text('#lista-horarios'), 'un día cerrado en el panel se cierra en la página')

        await vista(pd, 'clientes')
        await pd.fill('#cl-buscar', 'Derlis')
        await pd.locator('.cl-lista li:not([hidden]) .cl-item').first.click()
        await pd.click('[data-accion="cl-bloquear"]')
        await pd.wait_for_timeout(900)
        check(any(x['wa'] == '595981111222' for x in datos()['registro']['bloqueados']), 'bloquear un número desde la ficha queda en la base')

        await vista(pd, 'barberos')
        await pd.click('[data-accion="bb-quitar"][data-id="b2"]')
        await pd.click('[data-accion="bb-quitar-si"]')
        await pd.wait_for_timeout(900)
        b2 = next(x for x in datos()['config']['barberos'] if x['id'] == 'b2')
        check(not b2['activo'], 'quitar un barbero queda en la base')
        s, _ = api('GET', '/api/panel/datos', token=await pb.evaluate("localStorage.getItem('tommybarber-sesion')"))
        check(s == 401, 'al quitar al barbero se cierra su acceso')

        await vista(pd, 'reportes')
        check('Reportes' in await pd.inner_text('#pa-titulo'), 'los reportes se arman con los datos de la base')

        # Datos de prueba y empezar de cero
        await pd.click('[data-accion="prueba-abrir"]')
        await pd.mouse.move(5, 5)
        await pd.locator('.prueba').screenshot(path=str(OUT / 'api-datos-prueba.png'))
        await pd.click('[data-accion="prueba-cargar"]')
        await pd.wait_for_selector('.aviso-ok:has-text("Se cargaron los datos de prueba")', timeout=30000)
        d = datos()
        check(len(d['turnos']) > 100 and len(d['productos']) >= 10 and any(m['cat'] == 'gasto' for m in d['mov']), f"datos de prueba cargados ({len(d['turnos'])} turnos)")
        for v in ['atender', 'hoy', 'turnos', 'caja', 'stock', 'clientes', 'reportes']:
            t0 = time.time()
            await vista(pd, v)
            ms_vista = (time.time() - t0) * 1000
            check(ms_vista < 1500, f'con datos de prueba, {v} se abre rápido ({ms_vista:.0f} ms)')
        await pd.mouse.move(5, 5)
        await pd.screenshot(path=str(OUT / 'api-reportes-prueba.png'), full_page=True)
        await pd.click('[data-accion="prueba-abrir"]')
        await pd.click('[data-accion="prueba-borrar"]')
        await pd.click('[data-accion="prueba-borrar-si"]')
        await pd.wait_for_selector('.aviso-ok:has-text("quedó en cero")', timeout=30000)
        d = datos()
        check(not d['turnos'] and not d['mov'] and not d['productos'] and not d['registro']['ids'], 'empezar de cero deja turnos, caja, stock y clientes vacíos')
        check(any(b['nombre'] == 'Barbero 2' for b in d['config']['barberos']) and d['fotos']['logo'], 'quedan los barberos y las fotos')
        check(api('POST', '/api/acceso/ingresar', {'usuario': 'tommy', 'clave': DUENO[1]})[0] == 200, 'quedan las cuentas')

        # La página aparece al instante con lo último guardado, aunque el servidor tarde
        lento = await contexto()
        pl = await pagina(lento)
        await pl.goto(SITIO_URL)
        await pl.wait_for_selector('.rv-servicio')
        async def demorar(route):
            await asyncio.sleep(4)
            await route.continue_()
        await pl.route('**/api/sitio', demorar)
        t0 = time.time()
        await pl.reload()
        await pl.wait_for_selector('.rv-servicio')
        espera = (time.time() - t0) * 1000
        check(espera < 2500, f'con el servidor lento, la reserva aparece igual con lo guardado ({espera:.0f} ms)')
        await lento.close()

        # Salir
        await pd.click('[data-accion="salir"]')
        await pd.wait_for_selector('#pa-login')
        check(await pd.evaluate("localStorage.getItem('tommybarber-sesion')") is None, 'al salir se borra la sesión del celular')
        s, _ = api('GET', '/api/panel/datos', token=token)
        check(s == 401, 'la sesión cerrada ya no sirve en el servidor')

        check(not errores, 'sin errores de JavaScript' + (': ' + '; '.join(errores[:3]) if errores else ''))
        await b.close()


asyncio.run(main())
