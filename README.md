# Tommy Barber: sitio web, turnos y panel del dueño

Trabajo de campo: diseño web para **Tommy Barber**, barbería de Quiindy (Constitución esquina).

- **Sitio para clientes:** precios, horarios, cómo llegar e Instagram.
- **Reserva de turnos:** servicio, día y hora según el horario real del local, datos del cliente y comprobante.
- **Panel del dueño:** agenda del día, caja (lo que entra, los gastos y la ganancia) y productos con stock.

Es un prototipo que funciona en el navegador, sin servidor. Las reservas se guardan en el navegador de quien las hace (localStorage) y los datos del panel son de ejemplo.

## Cómo abrirlo

1. Cloná o descargá el repositorio (en GitHub: **Code > Download ZIP**).
2. Abrí `index.html` con el navegador.
3. Para entrar al panel, tocá **Acceso del dueño** al pie de la página. PIN de prueba: **2121**.

Si reservás un turno en el sitio y después entrás al panel, la reserva aparece en «Reservas nuevas desde la web», o en la agenda si es para hoy.

## Qué hay en cada carpeta

| Archivo o carpeta | Contenido |
|---|---|
| `index.html` | La página: inicio, precios, reserva, horarios, cómo llegar y pie |
| `css/estilos.css` | Colores, tipografías y diseño para celular y computadora |
| `js/app.js` | Datos del local, reserva de turnos y panel del dueño |
| `img/` | Logo oficial, foto de la fachada, textura de ladrillo e ícono |
| `fuentes/` | Tipografías Archivo y Sedgwick Ave Display, con su licencia |
| `herramientas/empaquetar.py` | Arma una versión en un solo archivo para mandarla o presentarla sin internet |

## Dónde cambiar los datos del local

Al principio de `js/app.js`:

- `SERVICIOS`: nombre, descripción, duración en minutos y precio en guaraníes de cada servicio.
- `HORAS`: horario de atención de cada día, en minutos desde la medianoche (480 son las 08:00 y 1050 las 17:30).
- `PIN_DUENO`: el PIN del panel.

Los textos fijos, como la dirección o la descripción del inicio, están en `index.html`.

## Para confirmar en la entrevista con el dueño

- [ ] Servicios, precios y cuánto dura cada uno
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

## Versión en un solo archivo

Para mandar el proyecto como un único `.html` (con imágenes y tipografías adentro):

```
python herramientas/empaquetar.py
```

El archivo queda en `dist/tommy-barber.html`. La carpeta `dist/` no se sube al repositorio.

## Créditos

- Logo y foto de la fachada: Tommy Barber.
- Tipografías: Archivo (The Archivo Project Authors) y Sedgwick Ave Display (The Sedgwick Ave Project Authors), bajo la SIL Open Font License 1.1. Ver `fuentes/OFL.txt`.
