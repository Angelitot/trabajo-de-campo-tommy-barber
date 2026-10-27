# Tommy Barber: sitio web, turnos y panel del dueño

Trabajo de campo: diseño web para **Tommy Barber**, barbería de Quiindy (Constitución esquina).

- **Sitio para clientes:** precios oficiales (7 servicios y 6 combos), horarios, cómo llegar e Instagram.
- **Reserva de turnos:** servicio o combo, día y hora según el horario real del local, nombre y WhatsApp, y comprobante.
- **Mis turnos:** el cliente ve los turnos que reservó desde su celular y puede cancelarlos mientras no hayan empezado.
- **Panel del dueño:**
  - **Hoy:** agenda del día para cobrar, marcar «no vino» o cancelar, la caja del día y lo que entró en la semana.
  - **Turnos:** los turnos de los próximos días, con recordatorio por WhatsApp, cancelación y aviso al cliente.
  - **Caja:** lo que entra, los gastos y la ganancia de hoy, la semana o el mes.
  - **Stock:** insumos y productos para vender; el dueño los carga, resta lo que usa o vende y suma lo que compra.
  - **Precios:** el dueño cambia el precio y la duración de cada servicio o combo, o vuelve a la lista original del local.

Es un prototipo que funciona en el navegador, sin servidor: los turnos, la caja, el stock y los precios se guardan en el navegador (localStorage). Los avisos por WhatsApp abren WhatsApp con el mensaje listo (`wa.me`): el dueño solo toca Enviar.

## Cómo abrirlo

1. Cloná o descargá el repositorio (en GitHub: **Code > Download ZIP**).
2. Abrí `index.html` con el navegador.
3. Para entrar al panel, tocá **Acceso del dueño** al pie de la página. PIN de prueba: **2121**.

## Cómo probarlo en la presentación

1. En el sitio, reservá un turno para mañana con tu propio número de WhatsApp.
2. Arriba aparece «Tenés turno…». En **Mis turnos** se ve el turno y se puede cancelar.
3. Entrá al panel y abrí **Turnos**: tocá **Recordar por WhatsApp** en tu turno y se abre WhatsApp con el recordatorio para tu número.
4. Cancelalo desde el panel: el sistema ofrece **Avisar por WhatsApp** con el mensaje de cancelación, y en **Mis turnos** dice que la barbería lo canceló.
5. En **Stock**, cargá un insumo nuevo, usá uno y registrá una compra con lo que pagaste: el gasto aparece en **Caja**.
6. En **Precios**, cambiá el precio de un corte y guardá: el sitio lo muestra enseguida. Los turnos ya reservados mantienen el precio con que se reservaron.
7. Al terminar, **Reiniciar datos de ejemplo** (abajo del menú del panel) vuelve la agenda, la caja y el stock al principio, y en **Precios** está **Volver a la lista original del local**.

Los turnos con números del tipo `0981 000 …` son de ejemplo: en esos, «Recordar» muestra cómo quedaría el mensaje en vez de abrir WhatsApp.

## Qué hay en cada carpeta

| Archivo o carpeta | Contenido |
|---|---|
| `index.html` | La página: inicio, precios, reserva, horarios, cómo llegar y pie |
| `css/estilos.css` | Colores, tipografías y diseño para celular y computadora |
| `js/app.js` | Datos del local, reserva, Mis turnos y panel del dueño |
| `img/` | Logo oficial, foto de la fachada, textura de ladrillo e ícono |
| `fuentes/` | Tipografías Archivo y Sedgwick Ave Display, con su licencia |
| `herramientas/empaquetar.py` | Arma una versión en un solo archivo para mandarla o presentarla sin internet |
| `herramientas/publicar.mjs` | Arma `publico/`, la versión optimizada que se publica |
| `package.json` | Herramientas para armar la versión optimizada (`npm run build`) |
| `despliegue.yaml` | Configuración de publicación del sitio (blueprint) |

## Dónde cambiar los datos del local

Al principio de `js/app.js`:

- `SERVICIOS`: la lista original del local (nombre, grupo, qué incluye cada combo, duración en minutos y precio en guaraníes). El dueño cambia precios y duraciones desde el panel, sin tocar el código.
- `HORAS`: horario de atención de cada día, en minutos desde la medianoche (480 son las 08:00 y 1050 las 17:30).
- `PIN_DUENO`: el PIN del panel.
- `UNIDADES`: cómo se cuentan los productos del stock (cajas, potes, frascos…).

Los textos fijos, como la dirección o la descripción del inicio, están en `index.html`.

## Para confirmar con el dueño

- [x] Servicios, combos y precios (lista oficial del local, desde noviembre de 2026)
- [ ] Cuánto dura cada servicio y combo (hoy son estimados)
- [ ] Qué incluye «Barba» en los combos: marcación, afeitado o ritual
- [ ] Calle que cruza con Constitución
- [ ] Número de WhatsApp del local
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

- Logo, foto de la fachada y lista de precios: Tommy Barber.
- Tipografías: Archivo (The Archivo Project Authors) y Sedgwick Ave Display (The Sedgwick Ave Project Authors), bajo la SIL Open Font License 1.1. Ver `fuentes/OFL.txt`. Archivo está recortada a los anchos (62 a 100 %) y pesos (400 a 800) que usa el sitio, para que pese menos.
