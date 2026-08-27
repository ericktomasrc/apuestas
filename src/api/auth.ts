/**
 * Autenticación.
 *
 * Sin dependencias externas: usa el módulo `crypto` de Node.
 *
 * Se evitó bcrypt/argon2 a propósito — son módulos nativos que hay que
 * compilar y suelen romper al cambiar de máquina o de versión de Node.
 * `scrypt` viene en Node, está diseñado justo para contraseñas, y es
 * resistente a ataques con hardware especializado.
 */

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHmac,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  clave: string | Buffer,
  sal: string | Buffer,
  largo: number,
) => Promise<Buffer>;

const LARGO_HASH = 64;

// =====================================================================
//  Contraseñas
// =====================================================================

export async function hashearPassword(password: string): Promise<string> {
  // Sal única por usuario: sin ella, dos usuarios con la misma
  // contraseña tendrían el mismo hash y una tabla precalculada las
  // rompería todas a la vez.
  const sal = randomBytes(16).toString('hex');
  const hash = await scrypt(password, sal, LARGO_HASH);
  return `scrypt$${sal}$${hash.toString('hex')}`;
}

export async function verificarPassword(
  password: string,
  guardado: string,
): Promise<boolean> {
  const [algoritmo, sal, hashHex] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !sal || !hashHex) return false;

  const calculado = await scrypt(password, sal, LARGO_HASH);
  const esperado = Buffer.from(hashHex, 'hex');
  if (calculado.length !== esperado.length) return false;

  // Comparación en tiempo constante: un `===` normal sale antes cuando
  // los primeros bytes difieren, y ese tiempo revela información sobre
  // el hash a quien mida con cuidado.
  return timingSafeEqual(calculado, esperado);
}

// =====================================================================
//  Tokens
// =====================================================================

export interface Sesion {
  usuarioId: string;
  alias: string;
  /** Segundos desde epoch */
  expira: number;
}

function base64url(b: Buffer | string): string {
  return Buffer.from(b)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function desdeBase64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function firmarToken(
  sesion: Omit<Sesion, 'expira'>,
  secreto: string,
  duracionHoras = 24 * 7,
): string {
  const cabecera = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const cuerpo = base64url(
    JSON.stringify({
      ...sesion,
      expira: Math.floor(Date.now() / 1000) + duracionHoras * 3600,
    }),
  );
  const firma = base64url(
    createHmac('sha256', secreto).update(`${cabecera}.${cuerpo}`).digest(),
  );
  return `${cabecera}.${cuerpo}.${firma}`;
}

export function verificarToken(token: string, secreto: string): Sesion | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [cabecera, cuerpo, firma] = partes;

  const esperada = base64url(
    createHmac('sha256', secreto).update(`${cabecera}.${cuerpo}`).digest(),
  );
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const datos = JSON.parse(desdeBase64url(cuerpo).toString()) as Sesion;
    // La expiración se valida DESPUÉS de la firma: si se hiciera antes,
    // un token manipulado podría llegar a parsearse.
    if (datos.expira < Math.floor(Date.now() / 1000)) return null;
    return datos;
  } catch {
    return null;
  }
}

// =====================================================================
//  Secreto
// =====================================================================

export function secretoDeEntorno(): string {
  const s = process.env.JWT_SECRETO;
  if (s && s.length >= 32) return s;

  if (process.env.NODE_ENV === 'production') {
    // En producción un secreto débil o generado al vuelo invalida todas
    // las sesiones en cada reinicio y, peor, es adivinable.
    throw new Error(
      'JWT_SECRETO es obligatorio en producción y debe tener al menos 32 caracteres',
    );
  }
  return 'secreto-solo-para-desarrollo-local-no-usar-en-produccion';
}
