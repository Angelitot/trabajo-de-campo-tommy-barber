// Contraseñas, tokens y freno a los intentos de ingreso.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 32768, R = 8, P = 1, LARGO = 64;
const MEMORIA = 128 * N * R * 2;

function scryptP(clave, sal, n, r, p) {
  return new Promise((ok, mal) => scrypt(clave, sal, LARGO, { N: n, r, p, maxmem: MEMORIA }, (e, k) => (e ? mal(e) : ok(k))));
}

// Hash de una contraseña: scrypt$N$r$p$sal$hash (la contraseña nunca se guarda)
export async function hashClave(clave) {
  const sal = randomBytes(16);
  const k = await scryptP(clave.normalize('NFC'), sal, N, R, P);
  return ['scrypt', N, R, P, sal.toString('base64'), k.toString('base64')].join('$');
}

export async function verificarClave(clave, guardado) {
  const p = String(guardado || '').split('$');
  if (p.length !== 6 || p[0] !== 'scrypt') return false;
  const esperado = Buffer.from(p[5], 'base64');
  const k = await scryptP(String(clave).normalize('NFC'), Buffer.from(p[4], 'base64'), +p[1], +p[2], +p[3]);
  return k.length === esperado.length && timingSafeEqual(k, esperado);
}

// Un hash cualquiera para comparar cuando el usuario no existe (así tarda lo mismo)
let hashFalso = null;
export async function hashDeRelleno() {
  if (!hashFalso) hashFalso = await hashClave(randomBytes(12).toString('hex'));
  return hashFalso;
}

export function nuevoToken() { return randomBytes(32).toString('base64url'); }
export function sha256(t) { return createHash('sha256').update(String(t)).digest('hex'); }

// Letras sin las que se confunden (0/O, 1/I/L), para los códigos de turno
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function nuevoCodigo() {
  const b = randomBytes(6);
  let c = 'TB-';
  for (let i = 0; i < 6; i++) c += LETRAS[b[i] % LETRAS.length];
  return c;
}

const COMUNES = new Set(['1234567890', '0123456789', '1122334455', '1111111111', 'contraseña', 'contrasena', 'contrasena1', 'password', 'password1',
  'password123', 'qwertyuiop', 'asdfghjkl1', 'tommybarber', 'tommybarber1', 'tommybarber123', 'barberia123', 'barberia1', 'barbero123', 'barbero1234',
  'quiindy123', 'paraguay123', 'paraguay1', 'administrador', 'admin12345', 'abc1234567', 'abcdefghij', 'iloveyou12', 'teamo12345']);

// Contraseña segura: 10 caracteres o más, con letras y números, que no sea una de las comunes ni lleve el usuario
export function problemaClave(clave, usuario) {
  const c = String(clave || '');
  if (c.length < 10) return 'La contraseña tiene que tener al menos 10 caracteres.';
  if (c.length > 128) return 'La contraseña es demasiado larga (máximo 128 caracteres).';
  if (!/\p{L}/u.test(c) || !/\d/.test(c)) return 'La contraseña tiene que tener letras y números.';
  const baja = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (COMUNES.has(baja) || /^(.)\1+$/.test(c)) return 'Esa contraseña es muy fácil de adivinar. Elegí otra.';
  const u = String(usuario || '').toLowerCase();
  if (u.length >= 3 && baja.includes(u)) return 'La contraseña no puede llevar el nombre de usuario.';
  return '';
}

// Usuario: de 3 a 30 letras minúsculas, números, punto, guion o guion bajo
export function usuarioValido(u) { return /^[a-z0-9._-]{3,30}$/.test(String(u || '')); }

// Freno a los intentos fallidos: por usuario (5 en 15 minutos) y por dirección (20 en 15 minutos)
export function crearFreno({ porUsuario = 5, porIp = 20, ventana = 15 * 60000 } = {}) {
  const fallos = new Map();
  function limpiar(k, ahora) {
    const l = (fallos.get(k) || []).filter((t) => ahora - t < ventana);
    if (l.length) fallos.set(k, l); else fallos.delete(k);
    return l;
  }
  return {
    // Minutos que faltan para poder probar de nuevo (0: puede probar)
    espera(usuario, ip, ahora = Date.now()) {
      const lu = limpiar('u:' + usuario, ahora), li = limpiar('i:' + ip, ahora);
      let hasta = 0;
      if (lu.length >= porUsuario) hasta = Math.max(hasta, lu[lu.length - porUsuario] + ventana);
      if (li.length >= porIp) hasta = Math.max(hasta, li[li.length - porIp] + ventana);
      return hasta > ahora ? Math.ceil((hasta - ahora) / 60000) : 0;
    },
    fallo(usuario, ip, ahora = Date.now()) {
      for (const k of ['u:' + usuario, 'i:' + ip]) { const l = limpiar(k, ahora); l.push(ahora); fallos.set(k, l); }
    },
    bien(usuario) { fallos.delete('u:' + usuario); }
  };
}
