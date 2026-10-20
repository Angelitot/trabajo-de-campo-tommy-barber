"""Arma dist/tommy-barber.html: una sola página con estilos, código, imágenes y tipografías adentro.

Sirve para mandar el proyecto como un único archivo o presentarlo sin internet.
Uso, desde la carpeta del repositorio:

    python herramientas/empaquetar.py
"""
import base64
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TIPOS = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
}


def data_uri(ruta):
    tipo = TIPOS[ruta.suffix.lower()]
    return f'data:{tipo};base64,' + base64.b64encode(ruta.read_bytes()).decode()


def main():
    html = (RAIZ / 'index.html').read_text(encoding='utf-8')
    css = (RAIZ / 'css' / 'estilos.css').read_text(encoding='utf-8')
    js = (RAIZ / 'js' / 'app.js').read_text(encoding='utf-8')

    # Las rutas del CSS son relativas a css/, por eso empiezan con ../
    css = re.sub(r"url\('\.\./([^']+)'\)", lambda m: f'url({data_uri(RAIZ / m.group(1))})', css)

    html = html.replace('<link rel="stylesheet" href="css/estilos.css">', '<style>\n' + css + '</style>')
    html = html.replace('<script src="js/app.js"></script>', '<script>\n' + js + '</script>')
    html = re.sub(r'(src|href)="(img/[^"]+)"', lambda m: f'{m.group(1)}="{data_uri(RAIZ / m.group(2))}"', html)

    salida = RAIZ / 'dist' / 'tommy-barber.html'
    salida.parent.mkdir(exist_ok=True)
    salida.write_text(html, encoding='utf-8')
    print(f'Listo: {salida.relative_to(RAIZ)} ({salida.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
