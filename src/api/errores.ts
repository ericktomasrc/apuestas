/**
 * Traducción de errores internos a respuestas HTTP.
 *
 * Regla que gobierna este archivo: el usuario NUNCA ve un código
 * técnico. `SALDO_INSUFICIENTE` va al log; en pantalla lee
 * "No te alcanza". Los códigos son para depurar, no para leer.
 *
 * El mensaje sí viaja en el cuerpo bajo `codigo`, pero es para que la
 * app pueda reaccionar (llevar a recargar, refrescar la sala), no para
 * mostrarlo tal cual.
 */

import { ErrorLiquidacion } from '../dominio/liquidacion.js';
import { ErrorSaldo } from '../servicios/ledger.servicio.js';
import { ErrorSala } from '../servicios/salas.servicio.js';
import { ErrorSeguridad } from '../servicios/seguridad.servicio.js';
import { ErrorAcceso } from './capas.js';
import { ErrorCasa } from '../servicios/casa.servicio.js';
import { ErrorPermiso } from '../servicios/autorizacion.servicio.js';

export interface RespuestaError {
  error: {
    codigo: string;
    mensaje: string;
    /** Qué debería hacer la app a continuación. */
    accion?: 'RECARGAR' | 'REFRESCAR' | 'REINTENTAR' | 'CONTACTAR_SOPORTE';
  };
}

interface Traduccion {
  estado: number;
  mensaje: string;
  accion?: RespuestaError['error']['accion'];
}

/**
 * Los mensajes son los del documento de flujos, sec. 5.2.
 * Si cambian aquí, cambian en toda la app.
 */
const TRADUCCIONES: Record<string, Traduccion> = {
  // --- saldo ---
  SALDO_INSUFICIENTE: {
    estado: 402,
    mensaje: 'No te alcanza para esta apuesta.',
    accion: 'RECARGAR',
  },
  MONTO_INVALIDO: { estado: 400, mensaje: 'El monto no es válido.' },
  // Entrada mal formada que no llegó a la validación por campos: JSON
  // roto, tipo de contenido raro. El problema está en la petición, así
  // que decir "algo falló de nuestro lado" sería mentir.
  ENTRADA_INVALIDA: { estado: 400, mensaje: 'Revisa los datos que enviaste.' },
  MONTO_FUERA_DE_RANGO: { estado: 400, mensaje: 'El monto está fuera del rango permitido.' },

  // --- sala ---
  SALA_NO_EXISTE: { estado: 404, mensaje: 'Esa sala ya no existe.' },
  MERCADO_NO_EXISTE: { estado: 404, mensaje: 'Esa apuesta ya no existe.' },
  SALA_CERRADA: {
    estado: 409,
    mensaje: 'La sala ya cerró.',
    accion: 'REFRESCAR',
  },
  SALA_LLENA: {
    estado: 409,
    mensaje: 'La sala se llenó mientras decidías.',
    accion: 'REFRESCAR',
  },
  CIERRE_INMINENTE: {
    estado: 409,
    mensaje: 'Ya no se puede: falta muy poco para el partido.',
    accion: 'REFRESCAR',
  },
  POSICION_CONTRADICTORIA: {
    estado: 409,
    mensaje: 'Ya estás en el otro lado de esta apuesta.',
  },
  POSICION_DUPLICADA: {
    estado: 409,
    mensaje: 'Ya tienes una apuesta aquí.',
  },
  SIN_POSICION: { estado: 404, mensaje: 'No tienes ninguna apuesta aquí.' },
  LIMITE_SALAS: {
    estado: 429,
    mensaje: 'Ya estás en demasiadas salas. Espera a que alguna se resuelva.',
  },
  SIN_PERMISO: { estado: 403, mensaje: 'No puedes hacer eso.' },
  ESTADO_INVALIDO: { estado: 409, mensaje: 'La sala no está en ese estado.', accion: 'REFRESCAR' },
  NADA_QUE_CERRAR: { estado: 409, mensaje: 'Todavía falta que se complete alguna apuesta.' },

  // --- usuario ---
  USUARIO_NO_EXISTE: { estado: 404, mensaje: 'Usuario no encontrado.' },
  USUARIO_NO_HABILITADO: { estado: 403, mensaje: 'Tu cuenta no está habilitada.' },
  USUARIO_AUTOEXCLUIDO: {
    estado: 403,
    mensaje: 'Tu cuenta está en autoexclusión.',
    accion: 'CONTACTAR_SOPORTE',
  },
  PAIS_NO_HABILITADO: { estado: 403, mensaje: 'Por ahora solo operamos en Perú.' },
  PAIS_DISTINTO: { estado: 403, mensaje: 'Esta sala es de otro país y usa otra moneda.' },
  UBICACION_BLOQUEADA: {
    estado: 403,
    mensaje: 'No podemos verificar desde dónde te conectas.',
  },

  // --- liquidación ---
  YA_LIQUIDADO: { estado: 409, mensaje: 'Esta apuesta ya se resolvió.', accion: 'REFRESCAR' },
  BALANCE_ROTO: {
    estado: 500,
    mensaje: 'Hubo un problema con esta apuesta. Ya lo estamos revisando.',
    accion: 'CONTACTAR_SOPORTE',
  },
  DESCUADRE: {
    estado: 500,
    mensaje: 'Hubo un problema con esta apuesta. Ya lo estamos revisando.',
    accion: 'CONTACTAR_SOPORTE',
  },

  PERSONAL_NO_APUESTA: {
    estado: 403,
    mensaje: 'Las cuentas del equipo no pueden apostar.',
  },

  // --- autenticación ---
  NO_AUTENTICADO: { estado: 401, mensaje: 'Inicia sesión para continuar.' },
  TOKEN_INVALIDO: { estado: 401, mensaje: 'Tu sesión venció. Vuelve a entrar.' },
  CREDENCIALES: { estado: 401, mensaje: 'Correo o contraseña incorrectos.' },
  PARTIDO_YA_EXISTE: { estado: 409, mensaje: 'Ya existe ese partido.' },
  PARTIDO_EN_USO: { estado: 409, mensaje: 'El partido tiene salas activas.' },
  LIGA_EN_USO: { estado: 409, mensaje: 'La liga tiene partidos por jugarse.' },
  LIGA_NO_EXISTE: { estado: 404, mensaje: 'Esa liga no existe.' },
  CASA_NO_HABILITADA: {
    estado: 403,
    mensaje: 'El modo casa no está disponible por ahora.',
  },
  CASA_SOLO_DECLARADAS: {
    estado: 403,
    mensaje: 'Por ahora solo la plataforma puede abrir casas.',
  },
  CASA_OFICIAL_APAGADA: {
    estado: 403,
    mensaje: 'La casa de la plataforma está desactivada.',
  },
  CASA_OFICIAL_NO_ANULA: {
    estado: 403,
    mensaje: 'La casa de la plataforma no puede anular sus propias casas.',
  },
  CUENTA_NO_DECLARADA: { estado: 400, mensaje: 'Esa cuenta no está declarada.' },
  CUPO_AGOTADO: { estado: 409, mensaje: 'Esa opción ya está completa.' },
  POCAS_OPCIONES: { estado: 400, mensaje: 'Una casa necesita al menos 2 opciones.' },
  DEMASIADAS_OPCIONES: { estado: 400, mensaje: 'Demasiadas opciones.' },
  PRESUPUESTO_EXCEDIDO: { estado: 400, mensaje: 'El presupuesto supera el máximo.' },
  MOTIVO_REQUERIDO: { estado: 400, mensaje: 'Falta el motivo.' },
  PROVEEDOR_CAIDO: {
    estado: 503,
    mensaje: 'El proveedor de datos no respondió. Se reintenta solo.',
  },
  TEMPORADA_SIN_ACCESO: {
    estado: 503,
    mensaje: 'El plan del proveedor no cubre esa temporada.',
  },
  CUOTA_AGOTADA: {
    estado: 503,
    mensaje: 'Se agotaron las peticiones del día al proveedor.',
  },
  // Errores de roles y permisos.
  //
  // Sin estos, todos caían al 500 genérico: alguien que escribía mal
  // un permiso veía «Algo falló de nuestro lado. Ya lo estamos
  // viendo», cuando el problema era suyo y tenía arreglo inmediato.
  PERMISO_NO_EXISTE: {
    estado: 400,
    mensaje: 'Alguno de esos permisos no existe.',
  },
  ROL_NO_EXISTE: { estado: 404, mensaje: 'Ese rol no existe.' },
  ROL_PROTEGIDO: {
    estado: 409,
    mensaje: 'El rol de administrador general no se puede modificar ni borrar.',
  },
  ROL_EN_USO: {
    estado: 409,
    mensaje: 'Hay personas con ese rol. Quítaselo antes de eliminarlo.',
  },
  ULTIMO_ADMIN: {
    estado: 409,
    mensaje: 'Es la única persona con acceso total. Nombra a otra primero.',
  },
  // ---- Entrada del usuario: 4xx, no 5xx ----
  //
  // Todos estos caían al 500 genérico. Alguien que escribía mal un
  // valor veía «Algo falló de nuestro lado», cuando el problema era
  // suyo y tenía arreglo inmediato.
  VALOR_INVALIDO: {
    estado: 400,
    mensaje: 'Ese valor no sirve para este parámetro.',
  },
  CONFIG_NO_EXISTE: { estado: 404, mensaje: 'Ese parámetro no existe.' },
  LIGA_YA_EXISTE: {
    estado: 409,
    mensaje: 'Ya hay una liga con ese identificador.',
  },
  MERCADO_NO_SOPORTADO: {
    estado: 400,
    mensaje: 'El sistema no sabe resolver ese tipo de apuesta.',
  },
  NO_ES_ANFITRION: {
    estado: 403,
    mensaje: 'Solo quien creó la sala puede hacer eso.',
  },

  // ---- Fallas del proveedor externo: 503, no 500 ----
  //
  // No es culpa nuestra ni del usuario, y se resuelve solo en el
  // siguiente ciclo.
  SIN_CREDENCIALES: {
    estado: 503,
    mensaje: 'Falta configurar el proveedor de datos.',
  },
  SIN_RESPUESTA: {
    estado: 503,
    mensaje: 'El proveedor de datos no respondió.',
  },
  RESPUESTA_INVALIDA: {
    estado: 503,
    mensaje: 'El proveedor de datos devolvió algo inesperado.',
  },
  RED: { estado: 503, mensaje: 'No se pudo contactar al proveedor.' },

  // ---- Errores del motor: SÍ son falla nuestra ----
  //
  // Si el reparto llega aquí, algo está mal en el código o en los
  // datos. Se registran como 500 a propósito: hay que mirarlos.
  INVARIANTE_ROTO: {
    estado: 500,
    mensaje: 'No pudimos completar el pago. Ya lo estamos revisando.',
  },
  LADO_VACIO: {
    estado: 500,
    mensaje: 'Esa apuesta no se puede resolver todavía.',
  },
  SIN_POSICIONES: {
    estado: 500,
    mensaje: 'Esa apuesta no tiene participantes.',
  },
  MONTO_NO_ENTERO: {
    estado: 500,
    mensaje: 'Hubo un problema con el cálculo. Ya lo estamos viendo.',
  },
  TASA_FUERA_DE_RANGO: {
    estado: 500,
    mensaje: 'Hubo un problema con la comisión. Ya lo estamos viendo.',
  },

  ALIAS_EN_USO: { estado: 409, mensaje: 'Ese alias ya está en uso.' },
  PLAN_YA_EXISTE: { estado: 409, mensaje: 'Ya existe una membresía con ese código.' },
  COMISION_BAJO_PISO: {
    estado: 400,
    mensaje: 'La comisión no puede bajar del 3%.',
  },
  EMAIL_EN_USO: { estado: 409, mensaje: 'Ese correo ya está registrado.' },
  MENOR_DE_EDAD: { estado: 403, mensaje: 'Debes ser mayor de 18 años.' },
  CUENTA_BLOQUEADA: {
    estado: 429,
    mensaje: 'Demasiados intentos. Vuelve a probar en unos minutos.',
  },
  TOTP_REQUERIDO: {
    estado: 401,
    mensaje: 'Ingresa el código de tu aplicación de autenticación.',
  },
  TOTP_INVALIDO: { estado: 401, mensaje: 'Ese código no es válido o ya venció.' },
  RELOJ_DESFASADO: {
    estado: 401,
    mensaje: 'El reloj del servidor está desfasado. Avisa a quien administra.',
    accion: 'CONTACTAR_SOPORTE',
  },
  TOTP_NO_PREPARADO: { estado: 400, mensaje: 'Primero escanea el código QR.' },
  PASSWORD_CORTA: {
    estado: 400,
    mensaje: 'La contraseña debe tener al menos 8 caracteres.',
  },
  SESION_VENCIDA: {
    estado: 401,
    mensaje: 'Tu sesión venció por inactividad. Vuelve a entrar.',
  },
  TOTP_OBLIGATORIO: {
    estado: 403,
    mensaje: 'Activa la verificación en dos pasos para usar el panel.',
    accion: 'CONTACTAR_SOPORTE',
  },
  DEMASIADAS_PETICIONES: {
    estado: 429,
    mensaje: 'Estás yendo muy rápido. Espera un momento.',
    accion: 'REINTENTAR',
  },
  REAUTENTICACION_REQUERIDA: {
    estado: 403,
    mensaje: 'Confirma tu contraseña para hacer este cambio.',
  },
  PASSWORD_TEMPORAL: {
    estado: 403,
    mensaje: 'Tienes que cambiar tu contraseña antes de continuar.',
  },

  // --- idempotencia ---
  FALTA_IDEMPOTENCIA: {
    estado: 400,
    mensaje: 'Petición mal formada.',
  },
  PETICION_DUPLICADA: {
    estado: 409,
    mensaje: 'Esta operación ya se procesó.',
    accion: 'REFRESCAR',
  },
};

const GENERICO: Traduccion = {
  estado: 500,
  mensaje: 'Algo falló de nuestro lado. Ya lo estamos viendo.',
  accion: 'CONTACTAR_SOPORTE',
};

export function traducirError(e: unknown): {
  estado: number;
  cuerpo: RespuestaError;
  codigoInterno: string;
} {
  let codigo = 'DESCONOCIDO';

  if (
    e instanceof ErrorSala ||
    e instanceof ErrorSaldo ||
    e instanceof ErrorLiquidacion ||
    e instanceof ErrorSeguridad ||
    e instanceof ErrorAcceso ||
    e instanceof ErrorCasa ||
    e instanceof ErrorPermiso
  ) {
    codigo = e.codigo;
  } else if (typeof e === 'object' && e !== null && 'codigo' in e) {
    // Errores que lanza la capa HTTP con un código adjunto
    // (NO_AUTENTICADO, CREDENCIALES, ALIAS_EN_USO...).
    codigo = String((e as { codigo: unknown }).codigo);
  } else if (e instanceof Error) {
    // Violación de UNIQUE en clave_idempotencia: el cliente reintentó
    // una petición que ya se procesó. No es un error del servidor.
    if (e.message.includes('idempotencia_unica')) codigo = 'PETICION_DUPLICADA';
    else if (e.message.includes('duplicate key')) codigo = 'PETICION_DUPLICADA';
  }

  // Un error de base de datos puede llegar con código propio de
  // PostgreSQL (23505 = unique_violation) que no está en la tabla.
  if (!TRADUCCIONES[codigo] && e instanceof Error) {
    if (e.message.includes('idempotencia_unica') || e.message.includes('duplicate key')) {
      codigo = 'PETICION_DUPLICADA';
    }
  }

  const t = TRADUCCIONES[codigo] ?? GENERICO;

  // Algunos errores traen un mensaje más específico que el de la tabla
  // ("Tu conexión viene de Chile" en vez de "no podemos verificar").
  // Solo se usa si viene de un error que nosotros creamos.
  const especifico =
    typeof e === 'object' && e !== null && 'mensajeUsuario' in e
      ? String((e as { mensajeUsuario: unknown }).mensajeUsuario)
      : null;

  return {
    estado: t.estado,
    codigoInterno: codigo,
    cuerpo: {
      error: {
        codigo: TRADUCCIONES[codigo] ? codigo : 'ERROR_INTERNO',
        mensaje: especifico ?? t.mensaje,
        ...(t.accion ? { accion: t.accion } : {}),
      },
    },
  };
}

/** Un error 5xx significa que fallamos nosotros: hay que mirarlo. */
export function esFallaNuestra(estado: number): boolean {
  return estado >= 500;
}
