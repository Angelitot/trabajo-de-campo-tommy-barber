/* Arma publico/: la versión del sitio que se publica, optimizada para que cargue rápido.

   - El CSS va minificado dentro del HTML: la página se dibuja sin esperar otro archivo.
   - El JS va minificado.
   - Las imágenes pasan a WebP; la foto de la fachada, además, a AVIF y en tres tamaños,
     para que cada celular baje la que necesita.
   - Las tipografías y el logo se piden apenas llega el HTML (preload).
   - Los archivos de publico/assets/ llevan un hash en el nombre: el navegador los guarda
     un año y, cuando un archivo cambia, cambia su nombre.

   Uso, desde la carpeta del repositorio: npm install (la primera vez) y npm run build.
   Los archivos originales no se tocan: se sigue trabajando en index.html, css/, js/ e img/. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import sharp from 'sharp';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'publico');
const ASSETS = path.join(SALIDA, 'assets');
const ANCHOS_FACHADA = [480, 720, 1080];
// Ancho con que se ve la foto de la fachada en pantalla (medido en celular, tablet y computadora).
const TAMANOS_FACHADA = '(min-width: 1280px) 681px, (min-width: 960px) 54vw, calc(100vw - 48px)';

const filas = [];
const ruta = (relativa) => path.join(RAIZ, relativa);
const tamano = async (archivo) => (await stat(archivo)).size;

async function guardar(nombre, extension, datos, origen) {
  const hash = createHash('sha256').update(datos).digest('hex').slice(0, 10);
  const archivo = `${nombre}.${hash}.${extension}`;
  await writeFile(path.join(ASSETS, archivo), datos);
  if (origen) filas.push([origen, archivo, await tamano(ruta(origen)), datos.length]);
  return 'assets/' + archivo;
}

// Reemplaza un texto exacto y avisa si no está, para que un cambio en index.html no rompa la publicación sin que nadie se entere.
function reemplazar(html, buscado, nuevo) {
  if (!html.includes(buscado)) throw new Error('No encontré esto en index.html: ' + buscado);
  return html.replace(buscado, () => nuevo);
}

async function imagenes() {
  const logo = await guardar('logo', 'webp', await sharp(ruta('img/logo.jpg')).webp({ quality: 76, effort: 6 }).toBuffer());
  const logoAvif = await guardar('logo', 'avif', await sharp(ruta('img/logo.jpg')).avif({ quality: 56, effort: 6 }).toBuffer(), 'img/logo.jpg');
  const ladrillo = await guardar('ladrillo', 'webp', await sharp(ruta('img/ladrillo.jpg')).webp({ quality: 70, effort: 6 }).toBuffer(), 'img/ladrillo.jpg');
  const favicon = await guardar('favicon', 'jpg', await readFile(ruta('img/favicon.jpg')));

  const fachada = { avif: [], webp: [] };
  for (const ancho of ANCHOS_FACHADA) {
    const foto = sharp(ruta('img/fachada.jpg')).resize({ width: ancho });
    fachada.avif.push(`${await guardar(`fachada-${ancho}`, 'avif', await foto.clone().avif({ quality: 52, effort: 6 }).toBuffer())} ${ancho}w`);
    fachada.webp.push(`${await guardar(`fachada-${ancho}`, 'webp', await foto.clone().webp({ quality: 72, effort: 6 }).toBuffer())} ${ancho}w`);
  }
  const grande = fachada.webp[fachada.webp.length - 1].split(' ')[0];
  const avif = await stat(path.join(SALIDA, fachada.avif[fachada.avif.length - 1].split(' ')[0]));
  filas.push(['img/fachada.jpg', `fachada-${ANCHOS_FACHADA.at(-1)} (AVIF)`, await tamano(ruta('img/fachada.jpg')), avif.size]);
  return { logo, logoAvif, ladrillo, favicon, fachada, grande };
}

async function main() {
  await rm(SALIDA, { recursive: true, force: true });
  await mkdir(ASSETS, { recursive: true });

  const img = await imagenes();
  const archivo = await guardar('archivo', 'woff2', await readFile(ruta('fuentes/archivo.woff2')));
  const sedgwick = await guardar('sedgwick-ave-display', 'woff2', await readFile(ruta('fuentes/sedgwick-ave-display.woff2')));

  // En el CSS las rutas son relativas a css/ (empiezan con ../); en el HTML publicado, a la raíz.
  const enCss = {
    'img/logo.jpg': img.logo,
    'img/ladrillo.jpg': img.ladrillo,
    'fuentes/archivo.woff2': archivo,
    'fuentes/sedgwick-ave-display.woff2': sedgwick,
  };
  let css = await readFile(ruta('css/estilos.css'), 'utf8');
  // El logo va en AVIF (más liviano) para los navegadores que lo entienden y en WebP para el resto.
  const fondoLogo = "url('../img/logo.jpg') center/cover no-repeat;";
  if (!css.includes(fondoLogo)) throw new Error('No encontré el fondo del logo en css/estilos.css: ' + fondoLogo);
  css = css.replace(fondoLogo, () => `${fondoLogo}background-image:image-set(url('${img.logoAvif}') type('image/avif'),url('${img.logo}') type('image/webp'));`);
  css = css.replace(/url\('\.\.\/([^']+)'\)/g, (_, original) => {
    if (!enCss[original]) throw new Error('El CSS usa un archivo que este script no conoce: ' + original);
    return `url('${enCss[original]}')`;
  });
  css = (await transform(css, { loader: 'css', minify: true })).code.trim();
  filas.push(['css/estilos.css', 'dentro de index.html', await tamano(ruta('css/estilos.css')), Buffer.byteLength(css)]);

  const js = (await transform(await readFile(ruta('js/app.js'), 'utf8'), { loader: 'js', minify: true })).code;
  const app = await guardar('app', 'js', Buffer.from(js), 'js/app.js');

  let html = await readFile(ruta('index.html'), 'utf8');
  html = reemplazar(html, '<link rel="icon" href="img/favicon.jpg">', `<link rel="icon" href="${img.favicon}">`);
  html = reemplazar(html, '<link rel="stylesheet" href="css/estilos.css">', [
    `<link rel="preload" href="${sedgwick}" as="font" type="font/woff2" crossorigin>`,
    `<link rel="preload" href="${archivo}" as="font" type="font/woff2" crossorigin>`,
    `<link rel="preload" href="${img.logoAvif}" as="image" type="image/avif" fetchpriority="high">`,
    `<style>${css}</style>`,
  ].join('\n'));
  html = reemplazar(html, '<img src="img/fachada.jpg" width="1080" height="859"', [
    '<picture>',
    `<source type="image/avif" srcset="${img.fachada.avif.join(', ')}" sizes="${TAMANOS_FACHADA}">`,
    `<source type="image/webp" srcset="${img.fachada.webp.join(', ')}" sizes="${TAMANOS_FACHADA}">`,
    `<img src="${img.grande}" width="1080" height="859" loading="lazy" decoding="async"`,
  ].join('\n'));
  html = html.replace(/(<img src="assets\/fachada[^>]*>)/, '$1\n</picture>');
  html = reemplazar(html, '<script src="js/app.js"></script>', `<script src="${app}"></script>`);

  const sueltos = html.match(/(?:src|href)="(?:img|css|js|fuentes)\/[^"]*"/g);
  if (sueltos) throw new Error('Quedaron rutas sin optimizar en index.html: ' + sueltos.join(', '));
  await writeFile(path.join(SALIDA, 'index.html'), html);
  filas.push(['index.html', 'index.html (con el CSS)', await tamano(ruta('index.html')), Buffer.byteLength(html)]);

  const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';
  console.log('Listo: publico/\n');
  for (const [origen, destino, antes, despues] of filas) {
    console.log(`${origen.padEnd(18)} ${kb(antes)}  ->  ${kb(despues)}   ${destino}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
