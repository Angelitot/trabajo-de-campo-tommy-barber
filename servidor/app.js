// La API de Tommy Barber: arma la aplicación de Express (el arranque está en index.js).
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { ZodError } from 'zod';
import { ErrorApi } from './datos.js';
import { rutasPublicas } from './rutas/publico.js';
import { rutasAcceso, autenticar } from './rutas/acceso.js';
import { rutasPanel } from './rutas/panel.js';
import { crearFreno } from './seguridad.js';
import { invalidar } from './cache.js';

// opciones: { pool, origenes: ['https://…'], base: 'https://api…' (para las direcciones de las fotos), origenesLocales, sinLimites }
export function crearApp(opciones) {
  const app = express();
  const ctx = { ...opciones, freno: crearFreno() };
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
  app.use(compression());

  // Solo la página del local puede usar la API desde el navegador
  const permitidos = new Set((opciones.origenes || []).map((o) => o.replace(/\/+$/, '')));
  app.use((req, res, next) => {
    const o = req.get('origin');
    if (o && (permitidos.has(o) || (opciones.origenesLocales && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)))) {
      res.set('Access-Control-Allow-Origin', o);
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.set('Access-Control-Max-Age', '600');
    }
    res.vary('Origin');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });
  app.use(express.json({ limit: '3mb' }));
  // Todo pedido que guarda algo descarta lo armado en memoria (horarios ocupados), así nadie ve algo viejo
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') res.on('finish', invalidar);
    next();
  });
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/salud', async (req, res) => {
    try {
      await ctx.pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api', rutasPublicas(ctx));
  app.use('/api/acceso', rutasAcceso(ctx));
  app.use('/api/panel', autenticar(ctx), rutasPanel(ctx));

  app.use((req, res) => res.status(404).json({ error: 'no-existe', mensaje: 'No existe esa dirección.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((e, req, res, next) => {
    if (e instanceof ErrorApi) return res.status(e.estado).json({ error: e.codigo, mensaje: e.message, ...(e.extra || {}) });
    if (e instanceof ZodError) return res.status(400).json({ error: 'invalido', mensaje: 'Faltan datos o hay datos que no corresponden.', detalle: e.issues.slice(0, 5).map((i) => i.path.join('.') + ': ' + i.message) });
    if (e.type === 'entity.too.large') return res.status(413).json({ error: 'muy-grande', mensaje: 'Lo que mandaste es demasiado grande.' });
    if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalido', mensaje: 'No se entendió lo que mandaste.' });
    if (e.code === '23505' || e.code === '23P01') return res.status(409).json({ error: 'conflicto', mensaje: 'Ese dato ya existe o ese horario ya está ocupado.' });
    if (e.code === '23514' || e.code === '23502' || e.code === '23503' || (e.code && e.code.startsWith('22'))) {
      return res.status(400).json({ error: 'invalido', mensaje: 'Hay datos que no corresponden.', detalle: [e.constraint || e.message] });
    }
    console.error(e);
    res.status(500).json({ error: 'interno', mensaje: 'Algo salió mal. Probá de nuevo en un rato.' });
  });
  return app;
}
