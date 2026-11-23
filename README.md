# Tommy Barber: sitio web, turnos y panel del dueño

Trabajo de campo: diseño web para **Tommy Barber**, barbería de Quiindy (Constitución esquina).

- **Sitio para clientes:** precios oficiales (7 servicios y 6 combos), galería de cortes, horarios con los cambios del local, cómo llegar, WhatsApp (0972 496 916) e Instagram.
- **Reserva de turnos:** servicio o combo, con qué barbero (o «el que esté libre»), día y hora según el horario real, nombre y WhatsApp, y comprobante. Un papá puede reservar para sus hijos con su número; hay un tope de turnos pendientes para frenar los turnos falsos.
- **Mis turnos:** el cliente ve los turnos que reservó desde su celular y, mientras no hayan empezado, puede cambiarlos de día u hora o cancelarlos.
- **Panel del dueño:**
  - **Atender:** el turno que corresponde ahora, en grande, con todo para cobrar, marcar «no vino» o pasarlo después; el siguiente al lado y la fila del día. Se usa con una mano o con el teclado (espacio y flechas para moverse, 1-2-3 para cobrar). Al que llega sin turno le da la primera hora libre del día y, si deja su WhatsApp, avisa cuándo escribirle. «Pasar después» intercambia las horas con el siguiente. Si hay varios barberos, cada uno tiene su botón y ve su fila. Se entra directo con `#atender`.
  - **Hoy:** agenda del día para cobrar, marcar «no vino» o cancelar, la caja del día y lo que entró en la semana.
  - **Turnos:** los turnos de los próximos días, con recordatorio por WhatsApp, cancelación y aviso al cliente, o «es falso: cancelar y bloquear el número».
  - **Caja:** lo que entra, los gastos y la ganancia de hoy, la semana o el mes.
  - **Stock:** insumos y productos para vender; el dueño los carga, resta lo que usa o vende y suma lo que compra.
  - **Servicios:** el dueño cambia el precio y la duración de cada servicio o combo, agrega servicios nuevos, deja de ofrecer los que ya no hace o vuelve a la lista original del local.
  - **Horario:** cerrar días u horas (para todo el local o para un barbero), o abrir con otro horario un día puntual; el sitio deja de ofrecer esos turnos y avisa el cambio.
  - **Barberos:** agregar, editar y quitar barberos, cada uno con sus días y horas.
  - **Clientes:** ficha de cada cliente con su N.º (visitas, gasto, faltas, historial), aviso en Atender cuando alguien suele faltar, posibles repetidos para unir, cambio de número sin perder el historial, y números bloqueados para reservar por la web.
  - **Reportes:** días y horas con más clientes, ganancia mes a mes, faltas y cancelaciones, y lo de cada barbero.
  - **Fotos:** cambiar el logo, la foto del local y las fotos de cortes de la página.

La documentación completa del trabajo (relevamiento, requerimientos, diseño, cómo está hecho el sistema, pruebas y capturas) está en [docs/DOCUMENTACION.md](docs/DOCUMENTACION.md), y el diseño de la base de datos en [docs/BASE_DE_DATOS.md](docs/BASE_DE_DATOS.md).

Es un prototipo que funciona en el navegador, sin servidor: los turnos, la caja, el stock, los servicios, los barberos, las fotos y los cambios de horario se guardan en el navegador (localStorage). La base de datos PostgreSQL ya está creada (`base-de-datos/`); falta el servidor que conecte la página con ella. Los avisos por WhatsApp abren WhatsApp con el mensaje listo (`wa.me`): el dueño solo toca Enviar.

## Cómo abrirlo

1. Cloná o descargá el repositorio (en GitHub: **Code > Download ZIP**).
2. Abrí `index.html` con el navegador.
3. Para entrar al panel, tocá **Acceso del dueño** al pie de la página. PIN de prueba: **2121**.

## Cómo probarlo en la presentación

1. En el sitio, reservá un turno para mañana con tu propio número de WhatsApp.
2. Arriba aparece «Tenés turno…». En **Mis turnos** se ve el turno y se puede cambiar de día u hora o cancelar.
3. Entrá al panel y abrí **Turnos**: tocá **Recordar por WhatsApp** en tu turno y se abre WhatsApp con el recordatorio para tu número.
4. Cancelalo desde el panel: el sistema ofrece **Avisar por WhatsApp** con el mensaje de cancelación, y en **Mis turnos** dice que la barbería lo canceló.
5. Abrí **Atender**: aparece el cliente que corresponde ahora. Probá Espacio y las flechas para moverte, **1** para cobrar en efectivo y **Z** para deshacer. Con **A** sumás a alguien que llegó sin turno: ya viene elegida la primera hora libre del día, y si deja su WhatsApp te aparece el botón para avisarle cuando le falte un cliente.
6. En **Horario**, cerrá mañana con el motivo «Feriado»: el sistema muestra los turnos que quedan afuera para avisarles, y en el sitio el día figura cerrado.
7. En **Clientes**, resolvé los posibles repetidos de arriba (unir o «son distintos»), buscá un cliente y abrí su ficha: ahí podés cambiarle el número. En **Reportes**, mirá el mapa de días y horas.
8. En **Stock**, cargá un insumo nuevo, usá uno y registrá una compra con lo que pagaste: el gasto aparece en **Caja**.
9. En **Servicios**, cambiá el precio de un corte y guardá: el sitio lo muestra enseguida. Los turnos ya reservados mantienen el precio con que se reservaron. Agregá un servicio nuevo y quitá uno que no se haga.
10. En **Barberos**, agregá uno que venga solo los sábados: en el sitio aparece «¿Con quién?» y en **Atender**, un botón por barbero.
11. En el sitio, reservá tres turnos con el mismo WhatsApp para tres personas distintas, e intentá reservar otro para la misma persona: el sitio no deja. En **Turnos**, cancelá uno con «Es falso»: el número queda bloqueado.
12. En **Fotos**, cambiá la foto del local o agregá una foto de corte.
13. Al terminar, **Reiniciar datos de ejemplo** (abajo del menú del panel) vuelve la agenda, la caja y el stock al principio; en **Servicios** está **Volver a la lista original del local**, en **Fotos** se vuelve a las originales y en **Horario** se quitan los cambios cargados.

Los turnos con números del tipo `0981 000 …` son de ejemplo: en esos, «Recordar» muestra cómo quedaría el mensaje en vez de abrir WhatsApp.

## Qué hay en cada carpeta

| Archivo o carpeta | Contenido |
|---|---|
| `index.html` | La página: inicio, precios, reserva, horarios, cómo llegar y pie |
| `css/estilos.css` | Colores, tipografías y diseño para celular y computadora |
| `js/app.js` | Datos del local, reserva, Mis turnos y panel del dueño |
| `img/` | Logo oficial, foto de la fachada, fotos de la galería (`img/galeria/`), textura de ladrillo e ícono |
| `fuentes/` | Tipografías Archivo y Sedgwick Ave Display, con su licencia |
| `herramientas/empaquetar.py` | Arma una versión en un solo archivo para mandarla o presentarla sin internet |
| `herramientas/publicar.mjs` | Arma `publico/`, la versión optimizada que se publica |
| `herramientas/capturas.py` | Saca las capturas del panel para la documentación |
| `base-de-datos/` | Base de datos PostgreSQL: esquema y datos iniciales del local |
| `package.json` | Herramientas para armar la versión optimizada (`npm run build`) |
| `despliegue.yaml` | Configuración de publicación del sitio (blueprint) |
| `docs/` | Documentación del proyecto, con capturas |
| `pruebas/` | Pruebas automáticas del sitio y del panel |

## Pruebas automáticas

Recorren el sitio y el panel en un navegador real, en computadora y en celular. Hace falta Python:

```
pip install playwright
python -m playwright install chromium
python pruebas/probar_todo.py
python pruebas/probar_precios.py
python pruebas/probar_atender.py
python pruebas/probar_mejoras.py
python pruebas/probar_llegada_clientes.py
python pruebas/probar_barberos_servicios_fotos.py
```

La prueba de la base de datos necesita la dirección de una base PostgreSQL (ver [docs/BASE_DE_DATOS.md](docs/BASE_DE_DATOS.md#pruebas)).

Al final dicen «todo bien» o qué falló. Las capturas quedan en `pruebas/capturas/`.

## Dónde cambiar los datos del local

Al principio de `js/app.js`:

- `SERVICIOS`: la lista original del local (nombre, grupo, qué incluye cada combo, duración en minutos y precio en guaraníes). El dueño cambia precios y duraciones, agrega servicios y quita los que no hace desde el panel, sin tocar el código.
- Los barberos y las fotos se cargan desde el panel.
- `HORAS`: horario de atención de cada día, en minutos desde la medianoche (480 son las 08:00 y 1050 las 17:30).
- `PIN_DUENO`: el PIN del panel.
- `UNIDADES`: cómo se cuentan los productos del stock (cajas, potes, frascos…).

Los textos fijos, como la dirección o la descripción del inicio, están en `index.html`.

## Para confirmar con el dueño

- [x] Servicios, combos y precios (lista oficial del local, desde noviembre de 2026)
- [x] Cuánto dura cada servicio y combo: quedan aproximadas (ni el dueño las sabe exactas)
- [ ] Qué incluye «Barba» en los combos: marcación, afeitado o ritual
- [ ] Calle que cruza con Constitución
- [x] Número de WhatsApp del local: 0972 496 916
- [ ] Nombres, días y horas de los barberos (el panel ya tiene agenda por barbero; falta cargarlos)
- [ ] En qué dispositivo va a usar el panel
- [ ] Productos que vende e insumos que usa
- [ ] Formas de pago que acepta (efectivo, transferencia, billetera)
- [ ] Permiso para usar el logo y la foto de la fachada si el sitio se publica

## Cómo trabajamos en equipo

1. Antes de empezar, traé lo último: `git pull`.
2. Creá una rama para tu cambio: `git checkout -b precios-reales`.
3. Guardá cambios chicos con un mensaje claro: `git commit -m "Actualiza los precios de corte y barba"`.
4. Subí la rama (`git push -u origin precios-reales`) y abrí un **Pull Request** en GitHub.
5. Otro compañero lo revisa y, si está bien, lo une a `main`.

Si prefieren no usar la terminal, [GitHub Desktop](https://desktop.github.com) hace lo mismo con botones.

## Versión publicada

El sitio se publica solo: cada cambio que se une a `main` arma la versión optimizada y la sube, con la configuración de `despliegue.yaml`.

La versión optimizada sale de los mismos archivos (`index.html`, `css/`, `js/`, `img/` y `fuentes/`), así que se sigue trabajando ahí. Para armarla en tu computadora hace falta [Node.js](https://nodejs.org) 20 o más nuevo:

```
npm install
npm run build
```

Queda en `publico/`, que no se sube al repositorio. Para verla como en internet, corré `python -m http.server 8080 -d publico` y abrí http://localhost:8080.

Qué hace para que cargue rápido:

- Pone el CSS dentro del HTML y minifica el CSS y el JS.
- Convierte las imágenes a WebP y AVIF. La foto de la fachada sale en tres tamaños y se carga recién cuando la página llega a esa parte.
- Pide las tipografías y el logo apenas llega la página.
- Les pone un hash en el nombre a los archivos de `assets/`, así el navegador los guarda un año y, si cambian, baja los nuevos.

Si cambiás `index.html` y el armado avisa que no encontró algo, revisá `herramientas/publicar.mjs`: busca partes exactas de la página (la hoja de estilos, el script y la foto de la fachada) para reemplazarlas.

## Versión en un solo archivo

Para mandar el proyecto como un único `.html` (con imágenes y tipografías adentro):

```
python herramientas/empaquetar.py
```

El archivo queda en `dist/tommy-barber.html`. La carpeta `dist/` no se sube al repositorio.

## Créditos

- Logo, foto de la fachada, fotos de cortes y lista de precios: Tommy Barber.
- Tipografías: Archivo (The Archivo Project Authors) y Sedgwick Ave Display (The Sedgwick Ave Project Authors), bajo la SIL Open Font License 1.1. Ver `fuentes/OFL.txt`. Archivo está recortada a los anchos (62 a 100 %) y pesos (400 a 800) que usa el sitio, para que pese menos.
