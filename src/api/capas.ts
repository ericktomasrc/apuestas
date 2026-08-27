/**
 * CAPAS DE SEGURIDAD de la API.
 *
 * Cada capa cubre una cosa distinta, y ninguna reemplaza a la otra:
 *
 *   1. Cabeceras          — el navegador ayuda a defenderse
 *   2. CORS               — quién puede llamar a la API
 *   3. Límite por IP      — nadie prueba contraseñas sin freno
 *   4. Autenticación      — quién eres          (auth.ts)
 *   5. Autorización       — qué puedes hacer    (autorizacion.servicio.ts)
 *   6. Frescura de sesión — desde hace cuánto no tocas nada
 *   7. Reautenticación    — para lo irreversible, la contraseña otra vez
 *   8. Auditoría          — qué hiciste         (historial, en la base)
 *
 * La 6 y la 7 existen porque un token robado, o una sesión abierta en
 * una máquina compartida, no deberían bastar para cambiar comisiones o
 * repartir permisos.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';

import { pool } from '../infraestructura/db.js';
import { verificarPassword } from './auth.js';
import { verificarSegundoFactor, tieneTotpActivo, config as configSeguridad }
  from '../servicios/seguridad.servicio.js';
import type { Sesion } from './auth.js';

export class ErrorAcceso extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorAcceso';
  }
}

// =====================================================================
//  1-3. Capas del transporte
// =====================================================================

export interface OpcionesCapas {
  /** Orígenes que pueden llamar a la API. Vacío = solo el mismo host. */
  origenesPermitidos?: string[];
  /** Se desactiva en pruebas: 200 peticiones seguidas son normales ahí. */
  limitarPeticiones?: boolean;
}

export async function registrarCapas(
  app: FastifyInstance,
  opciones: OpcionesCapas = {},
): Promise<void> {
  // --- Cabeceras de seguridad ---
  await app.register(helmet, {
    // El panel usa estilos y manejadores por línea, y carga fuentes de
    // Google. Una política más estricta rompe la página; una más laxa
    // dejaría pasar scripts de cualquier sitio.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://api.qrserver.com'],
        scriptSrc: ["'self'", "'unsafe-inline'"],

        // ⚠️ Concesión deliberada.
        //
        // Helmet pone `script-src-attr 'none'` por defecto, y eso
        // bloquea los `onclick` y `onsubmit` del panel — que están
        // construidos sobre manejadores por línea. Sin esto la página
        // carga pero ningún botón responde.
        //
        // Debilita el CSP, así que se compensa por otro lado: todo lo
        // que viene de la base pasa por esc() antes de renderizarse.
        // Si el panel creciera, conviene reescribirlo con
        // addEventListener y volver a 'none'.
        scriptSrcAttr: ["'unsafe-inline'"],

        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // El panel no debe poder incrustarse en un iframe ajeno: sería la
    // puerta a que alguien superponga botones invisibles encima.
    frameguard: { action: 'deny' },
  });

  // --- CORS ---
  await app.register(cors, {
    origin: opciones.origenesPermitidos?.length
      ? opciones.origenesPermitidos
      : false,
    credentials: true,
    // La app móvil manda estas dos en cada operación con dinero.
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  // --- Límite de peticiones ---
  if (opciones.limitarPeticiones !== false) {
    await app.register(rateLimit, {
      max: 300,
      timeWindow: '1 minute',
      // Por IP y por token: dos personas tras el mismo router no
      // deberían gastarse el límite entre sí.
      keyGenerator: (peticion) => {
        const cabecera = peticion.headers.authorization;
        return cabecera ? `t:${cabecera.slice(-24)}` : `ip:${peticion.ip}`;
      },
      // El objeto que se devuelve aquí se convierte en un error, y
      // Fastify toma su `statusCode`. Sin él lo trata como fallo
      // genérico y responde 500: el usuario leería "algo falló de
      // nuestro lado" cuando el problema es que va muy rápido, y en
      // producción esos 500 dispararían alertas de un servidor sano.
      errorResponseBuilder: (_peticion, contexto) => ({
        statusCode: 429,
        error: 'Too Many Requests',
        codigo: 'DEMASIADAS_PETICIONES',
        message: `Estás yendo muy rápido. Espera ${Math.ceil(contexto.ttl / 1000)} segundos.`,
      }),
    });
  }
}

/**
 * Límite más estricto para las rutas de autenticación.
 *
 * 300 por minuto está bien para navegar, pero permitiría probar 300
 * contraseñas por minuto. Aquí bajan a 10.
 */
export const LIMITE_AUTENTICACION = {
  rateLimit: { max: 10, timeWindow: '1 minute' },
};

/** Operaciones con dinero: un cliente con un bucle mal escrito no debe
 *  poder crear cien apuestas por segundo. */
export const LIMITE_DINERO = {
  rateLimit: { max: 30, timeWindow: '1 minute' },
};

// =====================================================================
//  6. Frescura de sesión
// =====================================================================

/**
 * Cuánto hace que esta sesión empezó.
 *
 * El token dura una semana para que la app móvil no pida clave cada
 * día. Pero el panel administrativo es otra cosa: una sesión olvidada
 * en una máquina compartida no debería seguir sirviendo horas después.
 */
export function minutosDeSesion(sesion: Sesion): number {
  // `expira` se fijó al firmar: restando la duración se obtiene el
  // momento de emisión.
  const duracionSegundos = 24 * 7 * 3600;
  const emitido = sesion.expira - duracionSegundos;
  return (Date.now() / 1000 - emitido) / 60;
}

export async function exigirSesionFresca(sesion: Sesion): Promise<void> {
  const cfg = await configSeguridad();
  if (minutosDeSesion(sesion) > cfg.minutosInactividad) {
    throw new ErrorAcceso(
      'SESION_VENCIDA',
      'Tu sesión venció por inactividad. Vuelve a entrar.',
    );
  }
}

// =====================================================================
//  7. Reautenticación para lo irreversible
// =====================================================================

/**
 * Acciones que exigen escribir la contraseña de nuevo.
 *
 * No es paranoia: son las que un token robado convertiría en un
 * desastre. Cambiar una comisión mueve dinero de todos; repartir
 * permisos abre el sistema entero.
 */
export const ACCIONES_CRITICAS = new Set([
  'comisiones.gestionar',
  'roles.gestionar',
  'usuarios.roles',
  'ajustes.crear',
]);

/**
 * Ventana de confianza tras confirmar la identidad.
 *
 * Es el modelo de `sudo`, y el mismo que usan GitHub, Google y AWS:
 * se pide la contraseña una vez y durante unos minutos las demás
 * acciones sensibles pasan sin volver a pedirla.
 *
 * Pedirla en cada clic parece más seguro pero no lo es: la gente
 * termina dejando la contraseña en el portapapeles, o eligiendo una
 * corta para escribirla rápido.
 *
 * Vive en memoria a propósito. Si el servidor se reinicia se pierde,
 * y volver a pedirla es el resultado seguro.
 */
const confirmados = new Map<string, number>();

export function marcarConfirmado(usuarioId: string, minutos: number): void {
  confirmados.set(usuarioId, Date.now() + minutos * 60_000);
}

export function siguesConfirmado(usuarioId: string): boolean {
  const hasta = confirmados.get(usuarioId);
  if (!hasta) return false;
  if (Date.now() > hasta) {
    confirmados.delete(usuarioId);
    return false;
  }
  return true;
}

/** Al cambiar la contraseña o cerrar sesión, la ventana se cierra. */
export function olvidarConfirmacion(usuarioId?: string): void {
  if (usuarioId) confirmados.delete(usuarioId);
  else confirmados.clear();
}

export async function reautenticar(
  usuarioId: string,
  password: string,
  codigoTotp?: string,
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT hash_password FROM v_usuarios WHERE id = $1`,
    [usuarioId],
  );
  if (rows.length === 0) {
    throw new ErrorAcceso('USUARIO_NO_EXISTE', 'El usuario no existe.');
  }
  if (!(await verificarPassword(password, rows[0].hash_password))) {
    throw new ErrorAcceso('CREDENCIALES', 'Tu contraseña no es correcta.');
  }

  // Si tiene segundo factor, también se pide: reautenticar solo con
  // contraseña dejaría el paso más débil que el propio ingreso.
  if (await tieneTotpActivo(usuarioId)) {
    if (!codigoTotp) {
      throw new ErrorAcceso(
        'TOTP_REQUERIDO',
        'Ingresa el código de tu aplicación de autenticación.',
      );
    }
    if (!(await verificarSegundoFactor(usuarioId, codigoTotp))) {
      throw new ErrorAcceso('TOTP_INVALIDO', 'Ese código no es válido.');
    }
  }

  const cfg = await configSeguridad();
  marcarConfirmado(usuarioId, cfg.minutosConfirmacion);
}

/**
 * Registra una acción crítica con su contexto.
 *
 * El historial de la base ya guarda qué cambió. Esto guarda además
 * desde dónde y con qué sesión: es lo que permite responder "¿fue esta
 * persona o alguien con su token?".
 */
export async function registrarAccionCritica(datos: {
  usuarioId: string;
  accion: string;
  detalle: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  await pool
    .query(
      `INSERT INTO incidentes (tipo, severidad, usuario_id, detalle)
       VALUES ('ACCION_CRITICA','BAJA',$1,$2)`,
      [
        datos.usuarioId,
        JSON.stringify({
          accion: datos.accion,
          ip: datos.ip && datos.ip !== '127.0.0.1' ? datos.ip : null,
          ...datos.detalle,
        }),
      ],
    )
    .catch(() => undefined);
}

// =====================================================================
//  Segundo factor obligatorio para el panel
// =====================================================================

/**
 * Quien administra un sistema que maneja dinero no debería poder
 * entrar solo con una contraseña.
 *
 * Se comprueba al usar el panel, no al ingresar: así la persona puede
 * entrar, ver el aviso, y configurarlo. Bloquearla en el ingreso la
 * dejaría fuera sin manera de arreglarlo.
 */
export async function exigirSegundoFactorSiCorresponde(
  usuarioId: string,
  tienePermisos: boolean,
): Promise<void> {
  if (!tienePermisos) return;

  const cfg = await configSeguridad();
  if (!cfg.totpObligatorioAdmin) return;

  if (!(await tieneTotpActivo(usuarioId))) {
    throw new ErrorAcceso(
      'TOTP_OBLIGATORIO',
      'Activa la verificación en dos pasos para usar el panel.',
    );
  }
}

/** Lee la contraseña y el código que el cliente manda para reautenticar. */
export function credencialesDe(peticion: FastifyRequest): {
  password?: string;
  codigo?: string;
} {
  const cuerpo = peticion.body as Record<string, unknown> | undefined;
  return {
    password: typeof cuerpo?.confirmarPassword === 'string' ? cuerpo.confirmarPassword : undefined,
    codigo: typeof cuerpo?.confirmarCodigo === 'string' ? cuerpo.confirmarCodigo : undefined,
  };
}
