/**
 * Servicio de SEGURIDAD de cuentas.
 *
 * Reúne cuatro cosas que van juntas:
 *   - intentos de ingreso y bloqueo temporal
 *   - contraseñas temporales que obligan a cambiarlas
 *   - segundo factor (TOTP)
 *   - recuperación por correo
 *
 * Una decisión que atraviesa todo el archivo: **el sistema nunca revela
 * si una cuenta existe**. Ni al ingresar, ni al recuperar. Distinguirlo
 * permitiría averiguar qué correos están registrados.
 */

import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { pool, enTransaccion, type Cliente } from '../infraestructura/db.js';
import { hashearPassword } from '../api/auth.js';
import {
  plantillaInvitacion,
  plantillaRecuperacion,
  plantillaAlerta,
  plantillaSegundoFactor,
  type ProveedorCorreo,
  type Correo,
} from '../infraestructura/proveedores/correo.proveedor.js';

export class ErrorSeguridad extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorSeguridad';
  }
}

// =====================================================================
//  Configuración
// =====================================================================

export interface ConfigSeguridad {
  maxIntentos: number;
  minutosBloqueo: number;
  horasInvitacion: number;
  minutosRecuperacion: number;
  minutosInactividad: number;
  /** Cuánto dura la confianza tras confirmar la identidad. */
  minutosConfirmacion: number;
  totpObligatorioAdmin: boolean;
  adminPuedeApostar: boolean;
}

let cache: { valor: ConfigSeguridad; expira: number } | null = null;

export async function config(cliente?: Cliente): Promise<ConfigSeguridad> {
  if (cache && Date.now() < cache.expira) return cache.valor;

  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT clave, valor FROM configuracion WHERE eliminado_en IS NULL`,
  );
  const m = new Map<string, string>(rows.map((r) => [r.clave, r.valor]));
  const num = (k: string, d: number): number => {
    const n = Number(m.get(k));
    return Number.isFinite(n) ? n : d;
  };

  const valor: ConfigSeguridad = {
    maxIntentos: num('max_intentos_ingreso', 5),
    minutosBloqueo: num('minutos_bloqueo_cuenta', 15),
    horasInvitacion: num('horas_validez_invitacion', 72),
    minutosRecuperacion: num('minutos_validez_recuperacion', 30),
    minutosInactividad: num('minutos_inactividad_panel', 30),
    minutosConfirmacion: num('minutos_confirmacion_identidad', 10),
    totpObligatorioAdmin: m.get('totp_obligatorio_admin') !== 'false',
    // Debe quedarse en false: quien puede anular una sala no puede
    // tener dinero en juego.
    adminPuedeApostar: m.get('admin_puede_apostar') === 'true',
  };
  cache = { valor, expira: Date.now() + 60_000 };
  return valor;
}

export function invalidarConfigSeguridad(): void {
  cache = null;
}

// =====================================================================
//  TOTP (RFC 6238)
//
//  Implementado con `crypto` en vez de una librería: son cuarenta
//  líneas, y evita una dependencia más en el camino crítico del
//  ingreso.
// =====================================================================

const ALFABETO32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function aBase32(b: Buffer): string {
  let bits = '';
  let salida = '';
  for (const x of b) bits += x.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    salida += ALFABETO32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return salida;
}

function deBase32(s: string): Buffer {
  let bits = '';
  for (const c of s.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    bits += ALFABETO32.indexOf(c).toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generarSecretoTotp(): string {
  return aBase32(randomBytes(20));
}

export function codigoTotp(secreto: string, desplazamiento = 0): string {
  const contador = Math.floor(Date.now() / 30000) + desplazamiento;
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(contador));
  const h = createHmac('sha1', deBase32(secreto)).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const cod =
    ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(cod % 1_000_000).padStart(6, '0');
}

/**
 * Acepta el código anterior, el actual y el siguiente.
 *
 * Sin esa ventana, un reloj desfasado por unos segundos haría fallar
 * códigos correctos y la gente quedaría fuera de su propia cuenta.
 */
export function verificarTotp(secreto: string, codigo: string): boolean {
  const limpio = codigo.replace(/\D/g, '');
  if (limpio.length !== 6) return false;
  return [-1, 0, 1].some((d) => {
    const esperado = codigoTotp(secreto, d);
    return timingSafeEqual(Buffer.from(esperado), Buffer.from(limpio));
  });
}

/**
 * ¿El código sería válido con otro desfase de reloj?
 *
 * Un código correcto que falla casi siempre es el reloj del servidor,
 * no la persona. Pasa mucho en Docker sobre Windows: al despertar del
 * suspendido, la hora del contenedor queda atrás.
 *
 * Decir "tu reloj está desfasado 4 minutos" es accionable; decir
 * "código inválido" manda a alguien a pelear con su teléfono.
 *
 * Devuelve el desfase en segundos, o null si el código sencillamente
 * no corresponde a este secreto.
 */
export function desfaseDeReloj(secreto: string, codigo: string): number | null {
  const limpio = codigo.replace(/\D/g, '');
  if (limpio.length !== 6) return null;

  // ±20 pasos = ±10 minutos. Más allá, el desfase no es de reloj.
  for (let d = -20; d <= 20; d++) {
    if (d >= -1 && d <= 1) continue;   // dentro de la ventana normal
    if (codigoTotp(secreto, d) === limpio) return d * 30;
  }
  return null;
}

export function urlTotp(secreto: string, alias: string, marca: string): string {
  return (
    `otpauth://totp/${encodeURIComponent(marca)}:${encodeURIComponent(alias)}` +
    `?secret=${secreto}&issuer=${encodeURIComponent(marca)}&digits=6&period=30`
  );
}

// =====================================================================
//  Contraseñas y tokens
// =====================================================================

/**
 * Contraseña temporal legible.
 *
 * Se compone de sílabas porque se va a leer desde un correo y a veces
 * dictar por teléfono. `Xk9$mQ2!` es más fuerte pero se transcribe mal,
 * y una clave que se copia con error genera más soporte del que evita.
 * Dura horas y obliga a cambiarla, así que la fortaleza importa menos
 * que que llegue bien.
 */
export function claveTemporal(): string {
  const silabas = ['ma','re','lo','ti','sa','nu','pe','va','ka','ri','to','ze','fi','mo'];
  let s = '';
  for (let i = 0; i < 4; i++) s += silabas[randomInt(silabas.length)];
  return s + randomInt(10, 100);
}

function generarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** Se guarda el hash, no el token: si alguien lee la base, no puede
 *  usar los enlaces pendientes. */
function hashToken(token: string): string {
  return createHmac('sha256', process.env.JWT_SECRETO ?? 'local').update(token).digest('hex');
}

// =====================================================================
//  Registro de correos
// =====================================================================

async function enviarYRegistrar(
  proveedor: ProveedorCorreo,
  usuarioId: string | null,
  destinatario: string,
  correo: Correo & { plantilla: string },
): Promise<boolean> {
  const r = await proveedor.enviar({ ...correo, para: destinatario });

  await pool
    .query(
      `INSERT INTO correos_enviados
         (usuario_id, destinatario, plantilla, asunto, estado, error, proveedor)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        usuarioId,
        destinatario,
        correo.plantilla,
        correo.asunto,
        r.enviado ? (r.proveedor === 'SIMULADO' ? 'SIMULADO' : 'ENVIADO') : 'FALLIDO',
        r.error ?? null,
        r.proveedor,
      ],
    )
    .catch(() => undefined);

  return r.enviado;
}

// =====================================================================
//  Invitación al equipo
// =====================================================================

export async function invitar(
  proveedor: ProveedorCorreo,
  datos: { usuarioId: string; alias: string; email: string; roles: string[] },
  urlPanel: string,
): Promise<{ enviado: boolean }> {
  const cfg = await config();
  const clave = claveTemporal();
  const hash = await hashearPassword(clave);
  const expira = new Date(Date.now() + cfg.horasInvitacion * 3600_000);

  await enTransaccion(async (c) => {
    await c.query(
      `UPDATE usuarios
          SET hash_password = $2,
              password_temporal = TRUE,
              password_expira_en = $3
        WHERE id = $1`,
      [datos.usuarioId, hash, expira],
    );
  }, datos.usuarioId);

  const enviado = await enviarYRegistrar(
    proveedor,
    datos.usuarioId,
    datos.email,
    plantillaInvitacion({
      alias: datos.alias,
      password: clave,
      url: urlPanel,
      horas: cfg.horasInvitacion,
      roles: datos.roles,
    }),
  );

  // La clave NO se devuelve: el admin nunca debe verla. Si el correo
  // falla, se reenvía generando una nueva.
  return { enviado };
}

// =====================================================================
//  Ingreso
// =====================================================================

export interface ResultadoIngreso {
  usuarioId: string;
  alias: string;
  /** Debe cambiar la contraseña antes de hacer cualquier cosa. */
  passwordTemporal: boolean;
  requiereTotp: boolean;
}

export async function registrarIntento(datos: {
  email: string;
  usuarioId?: string | null;
  ip?: string | null;
  exitoso: boolean;
  motivo?: string;
}): Promise<void> {
  await pool
    .query(
      `INSERT INTO intentos_ingreso (email, usuario_id, ip, exitoso, motivo)
       VALUES ($1,$2,$3::inet,$4,$5)`,
      [
        datos.email.toLowerCase(),
        datos.usuarioId ?? null,
        datos.ip && datos.ip !== '127.0.0.1' ? datos.ip : null,
        datos.exitoso,
        datos.motivo ?? null,
      ],
    )
    .catch(() => undefined);
}

export async function estaBloqueado(usuarioId: string): Promise<Date | null> {
  const { rows } = await pool.query(
    `SELECT bloqueado_hasta FROM usuarios WHERE id = $1`,
    [usuarioId],
  );
  const hasta = rows[0]?.bloqueado_hasta;
  return hasta && new Date(hasta) > new Date() ? new Date(hasta) : null;
}

export async function contarFallo(usuarioId: string): Promise<void> {
  const cfg = await config();
  await enTransaccion(async (c) => {
    const { rows } = await c.query(
      `UPDATE usuarios
          SET intentos_fallidos = intentos_fallidos + 1
        WHERE id = $1
      RETURNING intentos_fallidos`,
      [usuarioId],
    );
    if (rows[0].intentos_fallidos >= cfg.maxIntentos) {
      // El bloqueo es temporal, no permanente: uno permanente convierte
      // un ataque en una forma de dejar a alguien fuera de su cuenta.
      await c.query(
        `UPDATE usuarios
            SET bloqueado_hasta = now() + make_interval(mins => $2),
                intentos_fallidos = 0
          WHERE id = $1`,
        [usuarioId, cfg.minutosBloqueo],
      );
    }
  }, usuarioId);
}

export async function limpiarFallos(usuarioId: string): Promise<void> {
  await enTransaccion(async (c) => {
    await c.query(
      `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL
        WHERE id = $1 AND (intentos_fallidos > 0 OR bloqueado_hasta IS NOT NULL)`,
      [usuarioId],
    );
  }, usuarioId);
}

export async function passwordVencida(usuarioId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT password_temporal, password_expira_en FROM usuarios WHERE id = $1`,
    [usuarioId],
  );
  if (!rows[0]?.password_temporal) return false;
  const expira = rows[0].password_expira_en;
  return expira ? new Date(expira) < new Date() : false;
}

// =====================================================================
//  Cambio de contraseña
// =====================================================================

export async function cambiarPassword(
  proveedor: ProveedorCorreo,
  usuarioId: string,
  nueva: string,
  ip?: string,
): Promise<void> {
  if (nueva.length < 8) {
    throw new ErrorSeguridad('PASSWORD_CORTA', 'La contraseña debe tener al menos 8 caracteres.');
  }

  const hash = await hashearPassword(nueva);
  const { rows } = await pool.query(
    `SELECT alias, email FROM v_usuarios WHERE id = $1`,
    [usuarioId],
  );

  await enTransaccion(async (c) => {
    await c.query(
      `UPDATE usuarios
          SET hash_password = $2,
              password_temporal = FALSE,
              password_expira_en = NULL,
              password_cambiada_en = now(),
              intentos_fallidos = 0,
              bloqueado_hasta = NULL
        WHERE id = $1`,
      [usuarioId, hash],
    );
    // Los enlaces pendientes dejan de servir: si alguien pidió
    // recuperación y después recordó su clave, ese enlace no puede
    // seguir vivo en su bandeja.
    await c.query(
      `UPDATE tokens_acceso SET usado_en = now()
        WHERE usuario_id = $1 AND usado_en IS NULL`,
      [usuarioId],
    );
  }, usuarioId);

  if (rows[0]) {
    await enviarYRegistrar(
      proveedor,
      usuarioId,
      rows[0].email,
      plantillaAlerta({
        alias: rows[0].alias,
        que: 'Se cambió la contraseña de tu cuenta',
        cuando: new Date().toLocaleString('es-PE'),
        ip: ip && ip !== '127.0.0.1' ? ip : undefined,
      }),
    );
  }
}

// =====================================================================
//  Recuperación
// =====================================================================

/**
 * Envía el enlace si la cuenta existe.
 *
 * Devuelve lo mismo exista o no: si respondiera distinto, cualquiera
 * podría averiguar qué correos están registrados probando direcciones.
 */
export async function pedirRecuperacion(
  proveedor: ProveedorCorreo,
  email: string,
  urlBase: string,
  ip?: string,
): Promise<void> {
  const cfg = await config();
  const { rows } = await pool.query(
    `SELECT id, alias, email FROM v_usuarios WHERE lower(email) = lower($1)`,
    [email],
  );
  if (rows.length === 0) return;

  const u = rows[0];
  const { token, hash } = generarToken();
  const expira = new Date(Date.now() + cfg.minutosRecuperacion * 60_000);

  await pool.query(
    `INSERT INTO tokens_acceso (usuario_id, tipo, token_hash, expira_en, ip_solicitud)
     VALUES ($1,'RECUPERACION',$2,$3,$4::inet)`,
    [u.id, hash, expira, ip && ip !== '127.0.0.1' ? ip : null],
  );

  await enviarYRegistrar(
    proveedor,
    u.id,
    u.email,
    plantillaRecuperacion({
      alias: u.alias,
      url: `${urlBase}/panel/#recuperar=${token}`,
      minutos: cfg.minutosRecuperacion,
      ip: ip && ip !== '127.0.0.1' ? ip : undefined,
    }),
  );
}

export async function usarTokenRecuperacion(
  proveedor: ProveedorCorreo,
  token: string,
  nueva: string,
  ip?: string,
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, usuario_id FROM tokens_acceso
      WHERE token_hash = $1 AND tipo = 'RECUPERACION'
        AND usado_en IS NULL AND expira_en > now()`,
    [hashToken(token)],
  );
  if (rows.length === 0) {
    throw new ErrorSeguridad(
      'TOKEN_INVALIDO',
      'Ese enlace ya venció o se usó. Pide uno nuevo.',
    );
  }

  await pool.query(`UPDATE tokens_acceso SET usado_en = now() WHERE id = $1`, [
    rows[0].id,
  ]);
  await cambiarPassword(proveedor, rows[0].usuario_id, nueva, ip);
}

// =====================================================================
//  Segundo factor
// =====================================================================

export async function prepararTotp(
  usuarioId: string,
  alias: string,
  marca: string,
): Promise<{ secreto: string; url: string }> {
  const secreto = generarSecretoTotp();
  // Se guarda sin activar: hasta que la persona confirme un código, la
  // cuenta sigue funcionando con solo contraseña. Activarlo antes
  // dejaría fuera a quien configure mal la aplicación.
  await enTransaccion(async (c) => {
    await c.query(
      `UPDATE usuarios SET totp_secreto = $2, totp_activado_en = NULL WHERE id = $1`,
      [usuarioId, secreto],
    );
  }, usuarioId);

  return { secreto, url: urlTotp(secreto, alias, marca) };
}

export async function activarTotp(
  proveedor: ProveedorCorreo,
  usuarioId: string,
  codigo: string,
): Promise<{ codigosRespaldo: string[] }> {
  const { rows } = await pool.query(
    `SELECT totp_secreto, alias, email FROM usuarios WHERE id = $1`,
    [usuarioId],
  );
  const secreto = rows[0]?.totp_secreto;
  if (!secreto) {
    throw new ErrorSeguridad('TOTP_NO_PREPARADO', 'Primero escanea el código.');
  }
  if (!verificarTotp(secreto, codigo)) {
    const desfase = desfaseDeReloj(secreto, codigo);
    if (desfase !== null) {
      throw new ErrorSeguridad(
        'RELOJ_DESFASADO',
        `El código es correcto, pero el reloj del servidor va ${
          desfase > 0 ? 'atrasado' : 'adelantado'
        } ${Math.abs(Math.round(desfase / 60))} minuto(s). Hay que sincronizarlo.`,
      );
    }
    throw new ErrorSeguridad('TOTP_INVALIDO', 'Ese código no es válido.');
  }

  // Son la única forma de entrar si se pierde el teléfono.
  const codigos = Array.from({ length: 8 }, () =>
    randomBytes(4).toString('hex').toUpperCase(),
  );
  const hashes = codigos.map((c) => hashToken(c));

  await enTransaccion(async (c) => {
    await c.query(
      `UPDATE usuarios
          SET totp_activado_en = now(), totp_codigos_respaldo = $2
        WHERE id = $1`,
      [usuarioId, hashes],
    );
  }, usuarioId);

  await enviarYRegistrar(
    proveedor,
    usuarioId,
    rows[0].email,
    plantillaSegundoFactor({ alias: rows[0].alias, codigos }),
  );

  return { codigosRespaldo: codigos };
}

export async function verificarSegundoFactor(
  usuarioId: string,
  codigo: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT totp_secreto, totp_codigos_respaldo FROM usuarios WHERE id = $1`,
    [usuarioId],
  );
  const secreto = rows[0]?.totp_secreto;
  if (!secreto) return false;

  if (verificarTotp(secreto, codigo)) return true;

  // Un código correcto con el reloj desfasado no es culpa de nadie:
  // conviene decirlo en vez de rechazarlo sin más.
  const desfase = desfaseDeReloj(secreto, codigo);
  if (desfase !== null) {
    throw new ErrorSeguridad(
      'RELOJ_DESFASADO',
      `El código es correcto, pero el reloj del servidor va ${
        desfase > 0 ? 'atrasado' : 'adelantado'
      } ${Math.abs(Math.round(desfase / 60))} minuto(s). Hay que sincronizarlo.`,
    );
  }

  // Código de respaldo: sirve una sola vez y se consume.
  const hash = hashToken(codigo.trim().toUpperCase());
  const respaldo: string[] = rows[0].totp_codigos_respaldo ?? [];
  if (respaldo.includes(hash)) {
    await enTransaccion(async (c) => {
      await c.query(
        `UPDATE usuarios SET totp_codigos_respaldo = array_remove($2::text[], $3)
          WHERE id = $1`,
        [usuarioId, respaldo, hash],
      );
    }, usuarioId);
    return true;
  }
  return false;
}

export async function tieneTotpActivo(usuarioId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT totp_activado_en FROM usuarios WHERE id = $1`,
    [usuarioId],
  );
  return rows[0]?.totp_activado_en !== null && rows[0]?.totp_activado_en !== undefined;
}

// =====================================================================
//  Personal
// =====================================================================

/**
 * ¿Esta cuenta trabaja en la plataforma?
 *
 * Quien puede anular una sala no puede tener dinero en juego: podría
 * entrar, ver que va perdiendo, y anularla para recuperarlo. No hace
 * falta mala fe — basta la posibilidad para que el sistema deje de ser
 * creíble.
 */
export async function esPersonal(usuarioId: string, cliente?: Cliente): Promise<boolean> {
  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT 1 FROM usuarios_roles WHERE usuario_id = $1 AND eliminado_en IS NULL LIMIT 1`,
    [usuarioId],
  );
  return rows.length > 0;
}

export async function exigirQueNoSeaPersonal(
  usuarioId: string,
  cliente?: Cliente,
): Promise<void> {
  const cfg = await config(cliente);
  if (cfg.adminPuedeApostar) return;

  if (await esPersonal(usuarioId, cliente)) {
    throw new ErrorSeguridad(
      'PERSONAL_NO_APUESTA',
      'Las cuentas del equipo no pueden apostar.',
    );
  }
}
