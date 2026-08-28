/**
 * Servidor HTTP.
 *
 * Regla que gobierna este archivo: las rutas NO contienen lógica de
 * negocio. Solo validan la entrada, autentican, llaman al servicio y
 * traducen el error. Todo lo que decide algo vive en `servicios/`.
 *
 * Esa disciplina es lo que hace que cambiar de framework mañana sea
 * tedioso pero nunca riesgoso: la línea que hace el trabajo es la misma
 * en Fastify, en NestJS o en cualquier otro.
 */

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { pool } from '../infraestructura/db.js';
import { traducirError, esFallaNuestra } from './errores.js';
import {
  hashearPassword,
  verificarPassword,
  firmarToken,
  verificarToken,
  secretoDeEntorno,
  type Sesion,
} from './auth.js';
import { saldoDe } from '../servicios/ledger.servicio.js';
import {
  apostar,
  retirarse,
  balanceDe,
  iniciarCuentaRegresiva,
  config,
} from '../servicios/salas.servicio.js';
import { salud } from '../servicios/procesos.servicio.js';
import { paises, paisDe, formatear } from '../servicios/paises.servicio.js';
import { registrarRutasAdmin } from './admin.js';
import { registrarRutasSalas } from './salas-publicas.js';
import {
  ProveedorSimulado,
  type ProveedorDeportes,
} from '../infraestructura/proveedores/deportes.proveedor.js';
import { config as configCasa } from '../servicios/casa.servicio.js';
import {
  registrarCapas, LIMITE_AUTENTICACION, LIMITE_DINERO,
  ErrorAcceso, olvidarConfirmacion,
} from './capas.js';
import { verificar, guardarEnUsuario, ipDe } from '../servicios/ubicacion.servicio.js';
import {
  registrarIntento, estaBloqueado, contarFallo, limpiarFallos,
  passwordVencida, cambiarPassword, pedirRecuperacion, usarTokenRecuperacion,
  verificarSegundoFactor, tieneTotpActivo, prepararTotp, activarTotp,
  config as configSeguridad, ErrorSeguridad,
} from '../servicios/seguridad.servicio.js';
import {
  proveedorDeEntorno, MARCA,
  type ProveedorCorreo,
} from '../infraestructura/proveedores/correo.proveedor.js';
import {
  UbicacionSimulada,
  type ProveedorUbicacion,
} from '../infraestructura/proveedores/ubicacion.proveedor.js';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  registrarSwagger,
  jsonSchema,
  ESQUEMA_ERROR,
  ESQUEMA_SALDO,
  ESQUEMA_BALANCE,
  CABECERA_IDEMPOTENCIA,
} from './docs.js';

declare module 'fastify' {
  interface FastifyRequest {
    sesion?: Sesion;
  }
}

// =====================================================================
//  Esquemas de entrada
// =====================================================================

const Registro = z.object({
  alias: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guion bajo'),
  email: z.string().email(),
  password: z.string().min(8),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Determina la moneda del usuario y en qué salas puede entrar.
  pais: z.string().length(2).toUpperCase().default('PE'),
});

const Ingreso = z.object({
  email: z.string().email(),
  password: z.string(),
  /**
   * Segundo factor, si la cuenta lo tiene activo.
   *
   * Admite 6 dígitos (la aplicación de códigos) o 8 caracteres (un
   * código de respaldo). Exigir exactamente 6 dejaba fuera a quien
   * perdiera el teléfono, que es justo el caso para el que existen
   * los respaldos.
   */
  codigo: z.string().min(6).max(8).optional(),
});

const Apuesta = z.object({
  lado: z.enum(['A_FAVOR', 'EN_CONTRA']),
  montoCentavos: z.number().int().positive(),
});

// =====================================================================
//  Servidor
// =====================================================================

export interface OpcionesServidor {
  secreto?: string;
  logger?: boolean;
  /** En local, el simulado. En producción se pasa el real. */
  ubicacion?: ProveedorUbicacion;
  /** Se inyecta en pruebas para no enviar correos de verdad. */
  correo?: ProveedorCorreo;
  /**
   * El de deportes. En local el simulado, en producción API-Football.
   *
   * Lo necesitan la sincronización manual del panel y la pantalla que
   * muestra cuántas peticiones quedan.
   */
  deportes?: ProveedorDeportes;
  urlBase?: string;
  origenesPermitidos?: string[];
  /** Se apaga en pruebas: 200 peticiones seguidas son normales ahí. */
  limitarPeticiones?: boolean;
  /**
   * Solo activar si el servidor está DETRÁS de un proxy propio
   * (Cloudflare, nginx). Sin proxy, `x-forwarded-for` la puede
   * falsificar cualquiera y confiar en ella sería peor que ignorarla.
   */
  confiarEnProxy?: boolean;
}

/**
 * Traduce el mensaje de AJV.
 *
 * "must NOT have fewer than 3 characters" es correcto pero no está
 * escrito para quien llena un formulario. El texto de un error tiene
 * que decir qué hacer, no describir la regla que se rompió.
 */
function enCastellano(v: {
  keyword?: string;
  params?: { missingProperty?: string; limit?: number; pattern?: string };
  message?: string;
}): string {
  const limite = v.params?.limit;
  switch (v.keyword) {
    case 'required':   return 'Falta completarlo';
    case 'minLength':  return `Necesita al menos ${limite} caracteres`;
    case 'maxLength':  return `No puede pasar de ${limite} caracteres`;
    case 'minimum':    return `No puede ser menor que ${limite}`;
    case 'maximum':    return `No puede ser mayor que ${limite}`;
    case 'pattern':    return 'Solo se admiten letras y guion bajo';
    case 'format':     return 'El formato no es válido';
    case 'type':       return 'El tipo de dato no corresponde';
    case 'enum':       return 'No es uno de los valores permitidos';
    default:           return v.message ?? 'Valor inválido';
  }
}

export async function crearServidor(
  opciones: OpcionesServidor = {},
): Promise<FastifyInstance> {
  const secreto = opciones.secreto ?? secretoDeEntorno();
  const proveedor = opciones.deportes ?? new ProveedorSimulado();
  const proveedorUbicacion = opciones.ubicacion ?? new UbicacionSimulada();
  const correo = opciones.correo ?? proveedorDeEntorno();
  const urlBase = opciones.urlBase ?? process.env.URL_BASE ?? 'http://localhost:3000';
  const confiarEnProxy = opciones.confiarEnProxy ?? process.env.CONFIAR_EN_PROXY === 'true';
  const app = Fastify({
    logger: opciones.logger ?? false,
    // Identificador por petición: es lo que permite seguir el rastro de
    // un reclamo a través de los logs.
    genReqId: () => randomUUID(),
    ajv: {
      customOptions: {
        // Por defecto AJV se detiene en el primer campo inválido. Un
        // formulario con cuatro errores obligaría al usuario a corregir
        // uno, reenviar, y descubrir el siguiente.
        //
        // Contrapartida: validar todo cuesta más CPU con cuerpos muy
        // grandes. Con los tamaños de esta API es despreciable.
        allErrors: true,
      },
    },
  });

  // Un POST sin cuerpo declarado como JSON es válido.
  //
  // Fastify lo rechaza por defecto con FST_ERR_CTP_EMPTY_JSON_BODY, y
  // eso rompe toda acción que no necesita datos —reenviar una
  // invitación, resolver un incidente— para cualquier cliente que
  // mande el Content-Type por costumbre. La app móvil y curl lo hacen.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_peticion, cuerpo, listo) => {
      if (cuerpo === '' || cuerpo === undefined) return listo(null, {});
      try {
        listo(null, JSON.parse(cuerpo as string));
      } catch {
        listo(
          Object.assign(
            new Error(
              `El cuerpo no es JSON válido. Empieza con: ${String(cuerpo).slice(0, 60)}`,
            ),
            { statusCode: 400, codigo: 'ENTRADA_INVALIDA' },
          ),
          undefined,
        );
      }
    },
  );

  // Cabeceras, CORS y límite por IP. Van antes que cualquier ruta.
  await registrarCapas(app, {
    origenesPermitidos: opciones.origenesPermitidos,
    limitarPeticiones: opciones.limitarPeticiones,
  });

  await registrarSwagger(app);

  // Panel de administración: un solo archivo, sin paso de compilación.
  // Para un panel interno de pocas pantallas, montar un proyecto de
  // frontend aparte cuesta más de lo que aporta.
  const aqui = dirname(fileURLToPath(import.meta.url));

  await app.register(fastifyStatic, {
    root: join(aqui, 'panel'),
    prefix: '/panel/',
  });
  app.get('/panel', async (_p, respuesta) => respuesta.redirect('/panel/'));

  // La app de usuarios. Va en la raíz porque es el producto: quien
  // escribe el dominio a secas viene a apostar, no a administrar.
  //
  // `decorateReply: false` evita chocar con el registro anterior:
  // dos instancias del complemento no pueden decorar la respuesta con
  // el mismo método.
  await app.register(fastifyStatic, {
    root: join(aqui, 'web'),
    prefix: '/',
    decorateReply: false,
  });

  // -------------------------------------------------------------------
  //  Manejador central de errores
  // -------------------------------------------------------------------
  app.setErrorHandler((error, peticion, respuesta) => {
    // Fastify valida por su cuenta contra el JSON Schema declarado en
    // cada ruta (el mismo que alimenta Swagger). Sus errores NO son
    // ZodError: llegan como FST_ERR_VALIDATION con `.validation`.
    //
    // Sin esta rama, todo dato mal formado caía al 500 genérico: el
    // usuario veía "algo falló de nuestro lado" cuando el problema era
    // suyo y perfectamente explicable.
    const validacionFastify = (error as { validation?: unknown[] }).validation;
    if (Array.isArray(validacionFastify)) {
      return respuesta.code(400).send({
        error: {
          codigo: 'ENTRADA_INVALIDA',
          mensaje: 'Revisa los datos que enviaste.',
          detalles: validacionFastify.map((v) => {
            const i = v as {
              instancePath?: string;
              keyword?: string;
              params?: { missingProperty?: string; limit?: number };
              message?: string;
            };
            return {
              campo: i.instancePath?.replace(/^\//, '') || i.params?.missingProperty || '',
              problema: enCastellano(i),
            };
          }),
        },
      });
    }

    if (error instanceof z.ZodError) {
      return respuesta.code(400).send({
        error: {
          codigo: 'ENTRADA_INVALIDA',
          mensaje: 'Revisa los datos que enviaste.',
          detalles: error.issues.map((i) => ({
            campo: i.path.join('.'),
            problema: i.message,
          })),
        },
      });
    }

    // Fastify y sus complementos lanzan errores que YA traen su código
    // de estado: el límite de peticiones, por ejemplo, lanza un 429.
    //
    // Va DESPUÉS de las ramas de validación a propósito. Puesta antes,
    // se tragaba los errores de validación —que también son 4xx— y el
    // cliente perdía el detalle de qué campo estaba mal.
    const estadoPropio = (error as { statusCode?: number }).statusCode;
    if (estadoPropio && estadoPropio >= 400 && estadoPropio < 500) {
      // Un 4xx sin código conocido casi siempre es entrada mal formada
      // —JSON roto, tipo de contenido raro—. Decir "algo falló de
      // nuestro lado" sería mentir: el problema está en la petición.
      const conCodigo =
        typeof error === 'object' && error !== null && 'codigo' in error
          ? error
          : Object.assign(new Error('entrada'), {
              codigo: estadoPropio === 429 ? 'DEMASIADAS_PETICIONES' : 'ENTRADA_INVALIDA',
            });
      const { cuerpo } = traducirError(conCodigo);

      // Un "revisa los datos" sin decir cuáles no ayuda a nadie. Los
      // mensajes de Fastify describen la petición, no el sistema, así
      // que se pueden devolver sin exponer nada interno.
      // Se incluye siempre en los códigos genéricos: "revisa los
      // datos" sin decir cuáles obliga a adivinar. Los mensajes de
      // Fastify describen la petición, no el sistema, así que no
      // exponen nada interno.
      const mensajeCrudo = error instanceof Error ? error.message : String(error);
      const codigoDevuelto = (cuerpo.error as { codigo: string }).codigo;
      if (codigoDevuelto === 'ENTRADA_INVALIDA' || codigoDevuelto === 'ERROR_INTERNO') {
        (cuerpo.error as { detalle?: string }).detalle = mensajeCrudo;
      }

      peticion.log.warn(
        { estado: estadoPropio, mensaje: mensajeCrudo, ruta: peticion.url, reqId: peticion.id },
        'petición rechazada',
      );
      return respuesta.code(estadoPropio).send(cuerpo);
    }

    const { estado, cuerpo, codigoInterno } = traducirError(error);

    // El código técnico va al log, nunca a la respuesta.
    if (esFallaNuestra(estado)) {
      peticion.log.error(
        { err: error, codigoInterno, reqId: peticion.id },
        'falla del servidor',
      );

      // Además, legible en la consola.
      //
      // El log de Pino sale en una línea de JSON con el rastro
      // escapado: técnicamente está todo, pero encontrarlo entre las
      // demás líneas cuesta más de lo que debería. Un 500 es algo que
      // hay que ver de inmediato.
      const e = error as Error;
      console.error(
        `\n  ✗ 500 en ${peticion.method} ${peticion.url}` +
        `\n    ${e.message}` +
        (e.stack
          ? `\n${e.stack.split('\n').slice(1, 4)
              .map((l) => '    ' + l.trim()).join('\n')}`
          : '') + '\n',
      );
    } else {
      peticion.log.info({ codigoInterno, reqId: peticion.id }, 'petición rechazada');
    }

    return respuesta.code(estado).send(cuerpo);
  });

  // -------------------------------------------------------------------
  //  Autenticación
  // -------------------------------------------------------------------
  const exigirSesion = async (peticion: FastifyRequest): Promise<Sesion> => {
    const cabecera = peticion.headers.authorization;
    if (!cabecera?.startsWith('Bearer ')) {
      throw Object.assign(new Error('sin token'), { codigo: 'NO_AUTENTICADO' });
    }
    const sesion = verificarToken(cabecera.slice(7), secreto);
    if (!sesion) {
      throw Object.assign(new Error('token inválido'), { codigo: 'TOKEN_INVALIDO' });
    }
    peticion.sesion = sesion;
    return sesion;
  };

  /**
   * Sesión si la hay, null si no.
   *
   * Para pantallas que se pueden mirar sin cuenta: una sala compartida
   * por WhatsApp llega a gente que todavía no se registró. Obligarla a
   * entrar antes de ver de qué se trata es perderla ahí mismo.
   */
  const sesionOpcional = async (peticion: FastifyRequest): Promise<Sesion | null> => {
    const cabecera = peticion.headers.authorization;
    if (!cabecera?.startsWith('Bearer ')) return null;
    const sesion = verificarToken(cabecera.slice(7), secreto);
    if (sesion) peticion.sesion = sesion;
    return sesion ?? null;
  };

  /**
   * Toda operación con dinero exige `Idempotency-Key`.
   *
   * Sin ella, un reintento por timeout de red cobra dos veces. La clave
   * la genera el cliente por cada acción: reintentar la misma petición
   * reusa la clave, una acción nueva lleva clave nueva.
   */
  const exigirIdempotencia = (peticion: FastifyRequest): string => {
    const clave = peticion.headers['idempotency-key'];
    if (typeof clave !== 'string' || clave.length < 8 || clave.length > 200) {
      throw Object.assign(new Error('falta Idempotency-Key'), {
        codigo: 'FALTA_IDEMPOTENCIA',
      });
    }
    return clave;
  };

  // -------------------------------------------------------------------
  //  Rutas públicas
  // -------------------------------------------------------------------

  // Las rutas de administración van en su propio archivo: son otro
  // producto (el panel) sobre el mismo sistema.
  registrarRutasAdmin(app, exigirSesion, sesionOpcional, correo, urlBase, proveedor);
  registrarRutasSalas(app, exigirSesion, proveedor);

  app.get('/salud', {
    schema: {
      tags: ['sistema'],
      summary: 'Estado del servicio',
      description:
        'Público, sin autenticación. `degradado` significa que la conciliación detectó algo: hay que mirarlo.',
      response: {
        200: {
          type: 'object',
          properties: {
            estado: { type: 'string', enum: ['ok', 'degradado'] },
            salasAbiertas: { type: 'integer' },
            incidentesSinResolver: { type: 'integer' },
            dineroRetenido: {
              type: 'object',
              additionalProperties: { type: 'integer' },
              description: 'Comprometido en salas abiertas, por moneda',
            },
          },
        },
      },
    },
  }, async () => {
    const s = await salud();
    return {
      estado: s.sano ? 'ok' : 'degradado',
      salasAbiertas: s.salasAbiertas,
      incidentesSinResolver: s.incidentesSinResolver,
      // Por moneda: el retenido en soles y en pesos son cifras
      // distintas que no tendría sentido sumar.
      dineroRetenido: s.dineroRetenido,
    };
  });

  app.get('/paises', {
    schema: {
      tags: ['paises'],
      summary: 'Países habilitados y sus monedas',
      description:
        'Público. Cada país tiene su moneda, sus decimales y sus límites de apuesta. Una sala nunca mezcla monedas.',
      response: {
        200: {
          type: 'object',
          properties: {
            paises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  codigo: { type: 'string', examples: ['PE'] },
                  nombre: { type: 'string' },
                  moneda: { type: 'string', examples: ['PEN'] },
                  simbolo: { type: 'string', examples: ['S/'] },
                  decimales: { type: 'integer' },
                  minimoApuesta: { type: 'integer' },
                  maximoApuesta: { type: 'integer' },
                  zonaHoraria: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    return { paises: [...(await paises()).values()] };
  });

  app.post('/auth/registro', {
    config: LIMITE_AUTENTICACION,
    schema: {
      tags: ['auth'],
      summary: 'Crear cuenta',
      description: 'Devuelve el token de sesión. Solo mayores de 18 años.',
      body: jsonSchema(Registro),
      response: {
        201: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            usuario: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                alias: { type: 'string' },
              },
            },
            // Sin declararlo, Fastify lo BORRA al serializar: el
            // esquema de respuesta descarta toda propiedad que no
            // figure. Es el mismo tropiezo que tuvo `detalles`.
            aviso: {
              type: 'string',
              description:
                'Aparece si la conexión parece venir de otro país y la política es ADVERTIR.',
            },
          },
        },
        403: ESQUEMA_ERROR,
        409: ESQUEMA_ERROR,
      },
    },
  }, async (peticion, respuesta) => {
    const datos = Registro.parse(peticion.body);

    const edad =
      (Date.now() - new Date(datos.fechaNacimiento).getTime()) /
      (365.25 * 24 * 3600 * 1000);
    if (edad < 18) {
      throw Object.assign(new Error('menor'), { codigo: 'MENOR_DE_EDAD' });
    }

    // Lanza PAIS_NO_HABILITADO si no está en la tabla: no se crean
    // usuarios de países donde no se puede operar.
    await paisDe(datos.pais);

    // La licencia autoriza a operar en un país concreto. Aceptar
    // jugadores de otra jurisdicción es operar sin licencia allá,
    // aunque el servidor esté en Lima.
    const ip = ipDe(peticion.headers, peticion.ip, confiarEnProxy);
    const veredicto = await verificar(proveedorUbicacion, {
      ip,
      paisDeclarado: datos.pais,
      momento: 'REGISTRO',
    });
    if (veredicto.resultado === 'BLOQUEADO') {
      throw Object.assign(new Error(veredicto.mensaje), {
        codigo: 'UBICACION_BLOQUEADA',
        mensajeUsuario: veredicto.mensaje,
      });
    }

    const hash = await hashearPassword(datos.password);
    const plan = await pool.query(`SELECT id FROM v_planes WHERE codigo='GRATIS'`);

    let filas;
    try {
      filas = await pool.query(
        `INSERT INTO usuarios (alias, email, hash_password, fecha_nacimiento,
                               plan_id, pais)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, alias`,
        [datos.alias, datos.email.toLowerCase(), hash, datos.fechaNacimiento,
         plan.rows[0].id, datos.pais],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('uq_usuarios_alias')) {
        throw Object.assign(new Error('alias'), { codigo: 'ALIAS_EN_USO' });
      }
      if (msg.includes('uq_usuarios_email')) {
        throw Object.assign(new Error('email'), { codigo: 'EMAIL_EN_USO' });
      }
      throw e;
    }

    const u = filas.rows[0];
    // Queda registrado aunque la política sea dejar pasar: si mañana
    // hay que responderle a un regulador, la evidencia está guardada.
    await guardarEnUsuario(u.id, ip, veredicto);

    return respuesta.code(201).send({
      token: firmarToken({ usuarioId: u.id, alias: u.alias }, secreto),
      usuario: { id: u.id, alias: u.alias },
      ...(veredicto.resultado === 'ADVERTIDO'
        ? { aviso: 'Tu conexión parece venir de otro país. Podríamos pedirte verificar tu identidad más adelante.' }
        : {}),
    });
  });

  app.post('/auth/ingreso', {
    config: LIMITE_AUTENTICACION,
    schema: {
      tags: ['auth'],
      summary: 'Iniciar sesión',
      description: [
        'Correo inexistente y contraseña incorrecta devuelven el MISMO error: distinguirlos permitiría averiguar qué correos están registrados.',
        '',
        'La respuesta puede pedir dos cosas antes de dar el token:',
        '- `requiereTotp`: falta el código del segundo factor',
        '- `passwordTemporal`: hay que elegir una contraseña propia',
      ].join('\n'),
      body: jsonSchema(Ingreso),
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            usuario: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                alias: { type: 'string' },
              },
            },
            requiereTotp: { type: 'boolean' },
            passwordTemporal: {
              type: 'boolean',
              description: 'Hay que cambiarla antes de poder hacer nada.',
            },
          },
        },
        401: ESQUEMA_ERROR,
        403: ESQUEMA_ERROR,
        429: ESQUEMA_ERROR,
      },
    },
  }, async (peticion) => {
    const datos = Ingreso.parse(peticion.body);
    const ip = ipDe(peticion.headers, peticion.ip, confiarEnProxy);

    const { rows } = await pool.query(
      `SELECT id, alias, hash_password, estado, password_temporal
         FROM v_usuarios WHERE lower(email) = $1`,
      [datos.email.toLowerCase()],
    );

    const fallo = Object.assign(new Error('credenciales'), { codigo: 'CREDENCIALES' });

    if (rows.length === 0) {
      // Se calcula igual para que el tiempo de respuesta no delate que
      // el usuario no existe.
      await verificarPassword(datos.password, 'scrypt$0$0');
      await registrarIntento({ email: datos.email, ip, exitoso: false, motivo: 'NO_EXISTE' });
      throw fallo;
    }

    const u = rows[0];

    const bloqueo = await estaBloqueado(u.id);
    if (bloqueo) {
      await registrarIntento({
        email: datos.email, usuarioId: u.id, ip, exitoso: false, motivo: 'BLOQUEADO',
      });
      throw Object.assign(new Error('bloqueado'), {
        codigo: 'CUENTA_BLOQUEADA',
        mensajeUsuario: 'Demasiados intentos. Vuelve a probar en unos minutos.',
      });
    }

    if (!(await verificarPassword(datos.password, u.hash_password))) {
      await contarFallo(u.id);
      await registrarIntento({
        email: datos.email, usuarioId: u.id, ip, exitoso: false, motivo: 'PASSWORD',
      });
      throw fallo;
    }

    if (u.estado !== 'ACTIVO') {
      await registrarIntento({
        email: datos.email, usuarioId: u.id, ip, exitoso: false, motivo: u.estado,
      });
      throw Object.assign(new Error('no habilitado'), {
        codigo: u.estado === 'AUTOEXCLUIDO' ? 'USUARIO_AUTOEXCLUIDO' : 'USUARIO_NO_HABILITADO',
      });
    }

    // La contraseña temporal caduca: una invitación olvidada en un
    // correo no puede servir para siempre.
    if (await passwordVencida(u.id)) {
      await registrarIntento({
        email: datos.email, usuarioId: u.id, ip, exitoso: false, motivo: 'PASSWORD_VENCIDA',
      });
      throw Object.assign(new Error('vencida'), {
        codigo: 'TOKEN_INVALIDO',
        mensajeUsuario: 'Tu contraseña temporal venció. Pide una nueva invitación.',
      });
    }

    if (await tieneTotpActivo(u.id)) {
      if (!datos.codigo) {
        // No se entrega token todavía: sin el segundo factor, una
        // contraseña robada bastaría para entrar.
        return { requiereTotp: true };
      }
      if (!(await verificarSegundoFactor(u.id, datos.codigo))) {
        await contarFallo(u.id);
        await registrarIntento({
          email: datos.email, usuarioId: u.id, ip, exitoso: false, motivo: 'TOTP',
        });
        throw Object.assign(new Error('totp'), { codigo: 'TOTP_INVALIDO' });
      }
    }

    await limpiarFallos(u.id);
    await registrarIntento({ email: datos.email, usuarioId: u.id, ip, exitoso: true });

    return {
      token: firmarToken({ usuarioId: u.id, alias: u.alias }, secreto),
      usuario: { id: u.id, alias: u.alias },
      ...(u.password_temporal ? { passwordTemporal: true } : {}),
    };
  });

  // -------------------------------------------------------------------
  //  Contraseña
  // -------------------------------------------------------------------

  app.post('/auth/cambiar-password', {
    config: LIMITE_AUTENTICACION,
    schema: {
      tags: ['auth'],
      summary: 'Cambiar mi contraseña',
      description: 'Exige la actual, salvo que la vigente sea temporal.',
      security: [{ bearer: [] }],
      body: {
        type: 'object',
        properties: {
          actual: { type: 'string' },
          nueva: { type: 'string', minLength: 8 },
        },
        required: ['nueva'],
      },
      response: { 200: { type: 'object', additionalProperties: true },
                  400: ESQUEMA_ERROR, 401: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    const d = z
      .object({ actual: z.string().optional(), nueva: z.string().min(8).max(200) })
      .parse(peticion.body);

    const { rows } = await pool.query(
      `SELECT hash_password, password_temporal FROM v_usuarios WHERE id = $1`,
      [sesion.usuarioId],
    );

    // Con clave temporal no se pide la actual: la persona la acaba de
    // leer de un correo y el objetivo es que la reemplace cuanto antes.
    if (!rows[0].password_temporal) {
      if (!d.actual || !(await verificarPassword(d.actual, rows[0].hash_password))) {
        throw Object.assign(new Error('actual'), {
          codigo: 'CREDENCIALES',
          mensajeUsuario: 'Tu contraseña actual no es correcta.',
        });
      }
    }

    await cambiarPassword(
      correo, sesion.usuarioId, d.nueva,
      ipDe(peticion.headers, peticion.ip, confiarEnProxy),
    );
    // La confianza se cierra: la contraseña con la que se confirmó ya
    // no es la vigente.
    olvidarConfirmacion(sesion.usuarioId);
    return { ok: true };
  });

  app.post('/auth/recuperar', {
    config: LIMITE_AUTENTICACION,
    schema: {
      tags: ['auth'],
      summary: 'Pedir enlace de recuperación',
      description:
        'Responde lo mismo exista o no la cuenta. Si respondiera distinto, cualquiera podría averiguar qué correos están registrados.',
      body: {
        type: 'object',
        properties: { email: { type: 'string', format: 'email' } },
        required: ['email'],
      },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  }, async (peticion) => {
    const { email } = z.object({ email: z.string().email() }).parse(peticion.body);
    await pedirRecuperacion(
      correo, email, urlBase,
      ipDe(peticion.headers, peticion.ip, confiarEnProxy),
    );
    return {
      ok: true,
      mensaje: 'Si esa dirección tiene una cuenta, le llegará un enlace en unos minutos.',
    };
  });

  app.post('/auth/restablecer', {
    config: LIMITE_AUTENTICACION,
    schema: {
      tags: ['auth'],
      summary: 'Elegir contraseña con el enlace recibido',
      body: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          nueva: { type: 'string', minLength: 8 },
        },
        required: ['token', 'nueva'],
      },
      response: { 200: { type: 'object', additionalProperties: true },
                  400: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const d = z
      .object({ token: z.string().min(10), nueva: z.string().min(8).max(200) })
      .parse(peticion.body);
    await usarTokenRecuperacion(
      correo, d.token, d.nueva,
      ipDe(peticion.headers, peticion.ip, confiarEnProxy),
    );
    return { ok: true };
  });

  // -------------------------------------------------------------------
  //  Segundo factor
  // -------------------------------------------------------------------

  app.post('/auth/totp/preparar', {
    schema: {
      tags: ['auth'],
      summary: 'Empezar a configurar el segundo factor',
      description:
        'Devuelve el secreto y la URL para el código QR. No queda activo hasta confirmar un código: activarlo antes dejaría fuera a quien configure mal la aplicación.',
      security: [{ bearer: [] }],
      response: { 200: { type: 'object', additionalProperties: true },
                  401: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    return prepararTotp(sesion.usuarioId, sesion.alias, MARCA);
  });

  app.post('/auth/totp/activar', {
    config: LIMITE_AUTENTICACION,
    schema: {
      tags: ['auth'],
      summary: 'Confirmar el segundo factor',
      description:
        'Devuelve los códigos de respaldo. Son la única forma de entrar si se pierde el teléfono, y también llegan por correo.',
      security: [{ bearer: [] }],
      body: {
        type: 'object',
        properties: { codigo: { type: 'string', minLength: 6, maxLength: 6 } },
        required: ['codigo'],
      },
      response: { 200: { type: 'object', additionalProperties: true },
                  400: ESQUEMA_ERROR, 401: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    const { codigo } = z.object({ codigo: z.string().length(6) }).parse(peticion.body);
    return activarTotp(correo, sesion.usuarioId, codigo);
  });

  // -------------------------------------------------------------------
  //  Muro de salas
  // -------------------------------------------------------------------

  app.get('/salas', {
    schema: {
      tags: ['salas'],
      summary: 'Muro de salas abiertas',
      description:
        'Ordenadas por destacadas, luego por nivel de llenado, luego por proximidad del partido. Las vacías se hunden.',
      querystring: {
        type: 'object',
        properties: {
          deporte: { type: 'string', examples: ['FUTBOL','BASQUET'] },
          maxMinimo: {
            type: 'integer',
            description: 'Solo salas cuyo mínimo pueda pagar (en centavos)',
          },
          soloNecesitanGente: {
            type: 'boolean',
            description: 'Solo salas con algún mercado sin balancear. El filtro más útil del muro.',
          },
          pais: {
            type: 'string',
            examples: ['PE'],
            description: 'Solo salas de este país. Cada país usa su propia moneda.',
          },
        },
      },
    },
  }, async (peticion) => {
    const q = z
      .object({
        deporte: z.string().optional(),
        maxMinimo: z.coerce.number().int().positive().optional(),
        soloNecesitanGente: z.coerce.boolean().optional(),
        pais: z.string().length(2).toUpperCase().optional(),
      })
      .parse(peticion.query);

    const { rows } = await pool.query(
      `SELECT s.id, s.codigo, s.descripcion, s.tope_participantes,
              s.monto_minimo_centavos, s.estado, s.es_del_sistema,
              s.destacada_hasta, s.pais,
              pa.moneda, pa.simbolo, pa.decimales,
              p.equipo_local, p.equipo_visitante, p.inicia_en,
              p.logo_local, p.logo_visitante,
              l.nombre AS liga, d.clave AS deporte,
              u.alias AS anfitrion,
              (SELECT count(DISTINCT po.usuario_id)
                 FROM v_posiciones po
                 JOIN v_mercados me ON me.id = po.mercado_id
                WHERE me.sala_id = s.id)::int AS participantes,
              (SELECT json_agg(json_build_object(
                        'id', b.mercado_id,
                        'tipo', me.tipo_mercado,
                        'linea', me.linea,
                        'etiquetaFavor', me.etiqueta_favor,
                        'etiquetaContra', me.etiqueta_contra,
                        'totalFavor', b.total_favor,
                        'totalContra', b.total_contra,
                        'balanceado', b.balanceado))
                 FROM v_balance_mercados b
                 JOIN v_mercados me ON me.id = b.mercado_id
                WHERE b.sala_id = s.id) AS mercados
         FROM v_salas s
         JOIN v_partidos p ON p.id = s.partido_id
         JOIN v_ligas l    ON l.id = p.liga_id
         JOIN v_deportes d ON d.id = p.deporte_id
    LEFT JOIN v_usuarios u ON u.id = s.anfitrion_id
    LEFT JOIN paises_habilitados pa ON pa.codigo = s.pais
        WHERE s.estado IN ('ABIERTA','CUENTA_REGRESIVA')
          AND ($1::text IS NULL OR d.clave = $1)
          AND ($2::bigint IS NULL OR s.monto_minimo_centavos <= $2)
          AND ($3::text IS NULL OR s.pais = $3)
        ORDER BY s.destacada_hasta DESC NULLS LAST,
                 (SELECT count(*) FROM v_posiciones po
                   JOIN v_mercados me ON me.id = po.mercado_id
                  WHERE me.sala_id = s.id) DESC,
                 p.inicia_en ASC
        LIMIT 50`,
      [q.deporte ?? null, q.maxMinimo ?? null, q.pais ?? null],
    );

    let salas = rows;
    if (q.soloNecesitanGente) {
      salas = rows.filter((s) =>
        (s.mercados ?? []).some(
          (m: { balanceado: boolean }) => !m.balanceado,
        ),
      );
    }
    return { salas };
  });

  app.get('/salas/:id', {
    schema: {
      tags: ['salas'],
      summary: 'Detalle de una sala',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: { 404: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);

    // La sesión es opcional: una sala compartida por WhatsApp se puede
    // mirar sin cuenta. Solo se usa para marcar qué es tuyo.
    const sesion = await sesionOpcional(peticion);
    const yo = sesion?.usuarioId ?? null;

    const { rows } = await pool.query(
      `SELECT s.*, p.equipo_local, p.equipo_visitante, p.inicia_en,
              p.logo_local, p.logo_visitante,
              p.estado AS estado_partido, p.goles_local, p.goles_visitante,
              l.nombre AS liga, d.nombre AS deporte,
              u.alias AS anfitrion,
              (s.anfitrion_id = $2::uuid) AS soy_anfitrion,
              (SELECT count(DISTINCT po.usuario_id)
                 FROM v_posiciones po JOIN v_mercados m ON m.id = po.mercado_id
                WHERE m.sala_id = s.id)::int AS participantes
         FROM v_salas s
         JOIN v_partidos p ON p.id = s.partido_id
         JOIN v_ligas l    ON l.id = p.liga_id
         JOIN v_deportes d ON d.id = p.deporte_id
    LEFT JOIN v_usuarios u ON u.id = s.anfitrion_id
        WHERE s.id = $1`,
      [id, yo],
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('no existe'), { codigo: 'SALA_NO_EXISTE' });
    }

    const mercados = await pool.query(
      `SELECT b.*, m.tipo_mercado, m.linea, m.etiqueta_favor, m.etiqueta_contra,
              m.estado AS estado_mercado, m.lado_ganador
         FROM v_balance_mercados b
         JOIN v_mercados m ON m.id = b.mercado_id
        WHERE b.sala_id = $1
        ORDER BY m.tipo_mercado`,
      [id],
    );

    // Quién está en cada lado. Ver los nombres es parte de la gracia:
    // se juega contra gente, no contra un sistema.
    const posiciones = await pool.query(
      `SELECT po.mercado_id, po.lado, po.monto_centavos, u.alias,
              (po.usuario_id = $2::uuid) AS soy_yo
         FROM v_posiciones po
         JOIN v_usuarios u ON u.id = po.usuario_id
         JOIN v_mercados m ON m.id = po.mercado_id
        WHERE m.sala_id = $1
        ORDER BY po.monto_centavos DESC`,
      [id, yo],
    );

    return {
      sala: rows[0],
      mercados: mercados.rows,
      posiciones: posiciones.rows,
      misPosiciones: posiciones.rows.filter((p) => p.soy_yo),
    };
  });

  app.get('/mercados/:id/balance', {
    schema: {
      tags: ['salas'],
      summary: 'Cuánto falta para que el mercado corra',
      description:
        'El campo `falta` dice cuánto y de qué lado. La gente piensa en personas, pero el sistema iguala dinero.',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: { 200: ESQUEMA_BALANCE, 404: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    return balanceDe(id);
  });

  // -------------------------------------------------------------------
  //  Operaciones con dinero
  // -------------------------------------------------------------------

  app.post('/mercados/:id/apostar', {
    config: LIMITE_DINERO,
    schema: {
      tags: ['apuestas'],
      summary: 'Entrar a un mercado',
      description:
        'Retiene el dinero. Requiere `Idempotency-Key`. Bloqueado a menos de 15 min del partido.',
      security: [{ bearer: [] }],
      headers: CABECERA_IDEMPOTENCIA,
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: jsonSchema(Apuesta),
      response: {
        201: {
          type: 'object',
          properties: { balance: ESQUEMA_BALANCE, saldo: ESQUEMA_SALDO },
        },
        400: ESQUEMA_ERROR,
        401: ESQUEMA_ERROR,
        402: ESQUEMA_ERROR,
        409: ESQUEMA_ERROR,
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion);
    const clave = exigirIdempotencia(peticion);
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const datos = Apuesta.parse(peticion.body);

    await apostar(sesion.usuarioId, id, datos.lado, datos.montoCentavos, clave);

    return respuesta.code(201).send({
      balance: await balanceDe(id),
      saldo: await saldoDe(sesion.usuarioId),
    });
  });

  app.delete('/mercados/:id/apostar', {
    config: LIMITE_DINERO,
    schema: {
      tags: ['apuestas'],
      summary: 'Salir de un mercado',
      description:
        'Devuelve el dinero **sin ningún cargo**. Bloqueado a menos de 15 min del partido, para tapar la salida oportunista.',
      security: [{ bearer: [] }],
      headers: CABECERA_IDEMPOTENCIA,
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: { balance: ESQUEMA_BALANCE, saldo: ESQUEMA_SALDO },
        },
        401: ESQUEMA_ERROR,
        404: ESQUEMA_ERROR,
        409: ESQUEMA_ERROR,
      },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    const clave = exigirIdempotencia(peticion);
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);

    await retirarse(sesion.usuarioId, id, clave);

    return {
      balance: await balanceDe(id),
      saldo: await saldoDe(sesion.usuarioId),
    };
  });

  app.post('/salas/:id/cerrar', {
    schema: {
      tags: ['salas'],
      summary: 'Iniciar la cuenta regresiva',
      description:
        'Solo el anfitrión. **Nunca cierra de golpe**: arranca una regresiva de 5 min durante la cual todavía se puede salir. Si el anfitrión pudiera cerrar al instante, elegiría el momento con información que todos tienen pero solo él tiene el botón.',
      security: [{ bearer: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            estado: { type: 'string', examples: ['CUENTA_REGRESIVA'] },
            terminaEn: { type: 'string', format: 'date-time' },
          },
        },
        401: ESQUEMA_ERROR,
        403: ESQUEMA_ERROR,
        409: ESQUEMA_ERROR,
      },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const termina = await iniciarCuentaRegresiva(id, sesion.usuarioId);
    // Nunca cierra de golpe: siempre pasa por la regresiva, para que
    // nadie quede encerrado por una decisión del anfitrión.
    return { estado: 'CUENTA_REGRESIVA', terminaEn: termina.toISOString() };
  });

  // -------------------------------------------------------------------
  //  Cuenta del usuario
  // -------------------------------------------------------------------

  app.get('/yo', {
    schema: {
      tags: ['cuenta'],
      summary: 'Mi perfil, saldo y límites',
      security: [{ bearer: [] }],
      response: { 401: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    const { rows } = await pool.query(
      // La tasa sale de v_tasa_usuario, no de planes: esa vista ya
      // aplica el vencimiento. Leer el plan directo hacía que alguien
      // con Pro vencido viera 4% y se le cobrara 7% al ganar.
      `SELECT u.id, u.alias, u.email, u.pais, u.estado,
              u.es_casa_oficial, u.financiada_por_plataforma,
              t.plan_vigente AS plan, t.tasa_comision,
              u.plan_vence_en, t.plan_vencido
         FROM v_usuarios u
         JOIN v_tasa_usuario t ON t.usuario_id = u.id
        WHERE u.id = $1`,
      [sesion.usuarioId],
    );
    const pais = await paisDe(rows[0].pais);
    const saldo = await saldoDe(sesion.usuarioId);
    return {
      usuario: rows[0],
      saldo,
      // El texto ya formateado evita que cada cliente reimplemente el
      // formato (y se equivoque con las monedas de 0 decimales).
      saldoTexto: {
        disponible: formatear(saldo.disponibleCentavos, pais),
        retenido: formatear(saldo.retenidoCentavos, pais),
        total: formatear(saldo.totalCentavos, pais),
      },
      pais,
      limites: await config(),
      // Qué está disponible hoy. La app oculta lo que no lo esté en
      // vez de mostrar un menú que lleva a una pantalla vacía.
      modulos: await (async () => {
        const c = await configCasa();
        return {
          casa: c.habilitada,
          // Ver casas y poder abrir una son cosas distintas: al
          // arrancar, cualquiera puede apostar contra la casa pero
          // solo la plataforma puede operarlas.
          casaPuedeCrear: c.habilitada && (
            !c.soloDeclaradas
            || rows[0].es_casa_oficial === true
            || rows[0].financiada_por_plataforma === true
          ),
        };
      })(),
    };
  });

  app.get('/yo/saldo', {
    schema: {
      tags: ['cuenta'],
      summary: 'Mi saldo',
      security: [{ bearer: [] }],
      response: { 200: ESQUEMA_SALDO, 401: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    return saldoDe(sesion.usuarioId);
  });

  app.get('/yo/resultados', {
    schema: {
      tags: ['cuenta'],
      summary: 'Cómo me está yendo',
      description: [
        'Resultado real por período: cuánto entró, cuánto salió, cuánto se pagó en comisión.',
        '',
        'Se calcula desde el LIBRO de movimientos, no desde las posiciones: es la única fuente que no se puede reconstruir mal.',
      ].join('\n'),
      security: [{ bearer: [] }],
      querystring: {
        type: 'object',
        properties: {
          dias: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
        },
      },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    const { dias } = z
      .object({ dias: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(peticion.query);

    const desde = new Date(Date.now() - dias * 86400_000);

    // Los perdedores NO llevan movimiento propio: su retención ya
    // descontó al entrar. Por eso la pérdida es la retención que nunca
    // volvió, y el resultado se calcula sumando TODO lo que tocó cada
    // sala o casa.
    const resumen = await pool.query(
      `WITH por_evento AS (
         SELECT COALESCE(m.sala_id, m.casa_id) AS evento,
                (m.casa_id IS NOT NULL)        AS es_casa,
                SUM(m.monto_centavos)::bigint  AS neto,
                SUM(m.monto_centavos) FILTER (WHERE m.tipo = 'COMISION')::bigint
                                               AS comision,
                max(m.fecha_crea)               AS ultimo
           FROM movimientos m
          WHERE m.usuario_id = $1
            AND m.fecha_crea >= $2
            AND (m.sala_id IS NOT NULL OR m.casa_id IS NOT NULL)
          GROUP BY COALESCE(m.sala_id, m.casa_id), (m.casa_id IS NOT NULL)
       )
       SELECT count(*)::int                                    AS eventos,
              count(*) FILTER (WHERE neto > 0)::int            AS ganados,
              count(*) FILTER (WHERE neto < 0)::int            AS perdidos,
              count(*) FILTER (WHERE neto = 0)::int            AS devueltos,
              COALESCE(SUM(neto), 0)::bigint                   AS resultado,
              COALESCE(SUM(neto) FILTER (WHERE neto > 0), 0)::bigint AS ganado,
              COALESCE(-SUM(neto) FILTER (WHERE neto < 0), 0)::bigint AS perdido,
              COALESCE(SUM(comision), 0)::bigint               AS comision,
              count(*) FILTER (WHERE es_casa)::int             AS como_casa
         FROM por_evento`,
      [sesion.usuarioId, desde],
    );

    // Día a día, para la gráfica.
    const porDia = await pool.query(
      `SELECT date_trunc('day', m.fecha_crea)::date AS dia,
              SUM(m.monto_centavos)::bigint        AS neto
         FROM movimientos m
        WHERE m.usuario_id = $1
          AND m.fecha_crea >= $2
          AND (m.sala_id IS NOT NULL OR m.casa_id IS NOT NULL)
        GROUP BY 1 ORDER BY 1`,
      [sesion.usuarioId, desde],
    );

    const detalle = await pool.query(
      `SELECT COALESCE(m.sala_id, m.casa_id) AS evento_id,
              (m.casa_id IS NOT NULL)        AS es_casa,
              SUM(m.monto_centavos)::bigint  AS neto,
              max(m.fecha_crea)               AS cuando,
              COALESCE(s.codigo, ca.codigo)  AS codigo,
              p.equipo_local, p.equipo_visitante,
              COALESCE(s.estado::text, ca.estado::text) AS estado
         FROM movimientos m
    LEFT JOIN v_salas s     ON s.id = m.sala_id
    LEFT JOIN v_casas ca    ON ca.id = m.casa_id
    LEFT JOIN v_partidos p  ON p.id = COALESCE(s.partido_id, ca.partido_id)
        WHERE m.usuario_id = $1
          AND m.fecha_crea >= $2
          AND (m.sala_id IS NOT NULL OR m.casa_id IS NOT NULL)
        GROUP BY COALESCE(m.sala_id, m.casa_id), (m.casa_id IS NOT NULL),
                 s.codigo, ca.codigo, p.equipo_local, p.equipo_visitante,
                 s.estado, ca.estado
        ORDER BY max(m.fecha_crea) DESC
        LIMIT 60`,
      [sesion.usuarioId, desde],
    );

    return {
      dias,
      resumen: resumen.rows[0],
      porDia: porDia.rows,
      eventos: detalle.rows,
    };
  });

  app.get('/yo/movimientos', {
    schema: {
      tags: ['cuenta'],
      summary: 'Historial de movimientos',
      description: 'Sale del libro contable. Cada línea es inmutable.',
      security: [{ bearer: [] }],
      querystring: {
        type: 'object',
        properties: {
          limite: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
      response: { 401: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    const q = z
      .object({ limite: z.coerce.number().int().min(1).max(100).default(50) })
      .parse(peticion.query);

    const { rows } = await pool.query(
      `SELECT tipo, monto_centavos, mercado_id, sala_id, fecha_crea
         FROM movimientos
        WHERE usuario_id = $1
        ORDER BY id DESC LIMIT $2`,
      [sesion.usuarioId, q.limite],
    );
    return { movimientos: rows };
  });

  app.get('/yo/salas', {
    schema: {
      tags: ['cuenta'],
      summary: 'Mis salas activas',
      description:
        'La pantalla más usada de la app. Muestra las tres cifras del saldo y el estado de cada sala.',
      security: [{ bearer: [] }],
      response: { 401: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);

    // Una sala es "mía" si aposté en ella O si la creé.
    //
    // Antes solo miraba las posiciones, así que una sala recién creada
    // desaparecía hasta que el anfitrión apostara. Y crear no obliga a
    // apostar: quedaba invisible para su propio dueño.
    const { rows } = await pool.query(
      `SELECT s.id, s.codigo, s.estado, s.regresiva_termina_en,
              s.monto_minimo_centavos, s.tope_participantes,
              p.equipo_local, p.equipo_visitante, p.inicia_en,
              p.logo_local, p.logo_visitante,
              l.nombre AS liga,
              (s.anfitrion_id = $1) AS soy_anfitrion,
              (SELECT count(DISTINCT po.usuario_id)
                 FROM v_posiciones po JOIN v_mercados mm ON mm.id = po.mercado_id
                WHERE mm.sala_id = s.id)::int AS participantes,
              COALESCE((
                SELECT json_agg(json_build_object(
                         'mercadoId',  m.id,
                         'lado',       po.lado,
                         'montoCentavos', po.monto_centavos,
                         'etiqueta', CASE WHEN po.lado = 'A_FAVOR'
                                          THEN m.etiqueta_favor
                                          ELSE m.etiqueta_contra END,
                         'estado',     m.estado,
                         'ganador',    m.lado_ganador))
                  FROM v_posiciones po
                  JOIN v_mercados m ON m.id = po.mercado_id
                 WHERE m.sala_id = s.id AND po.usuario_id = $1
              ), '[]') AS mis_posiciones,
              -- Lo que ganó o perdió aquí. Los perdedores no llevan
              -- movimiento propio: su retención ya descontó al entrar,
              -- así que la pérdida es la retención que no volvió.
              (SELECT COALESCE(SUM(mv.monto_centavos), 0)::bigint
                 FROM movimientos mv
                WHERE mv.sala_id = s.id AND mv.usuario_id = $1
                  AND mv.tipo IN ('RETENCION','LIBERACION','PREMIO',
                                  'DEVOLUCION','AJUSTE')
              ) AS mi_resultado_centavos
         FROM v_salas s
         JOIN v_partidos p ON p.id = s.partido_id
         JOIN v_ligas l    ON l.id = p.liga_id
        WHERE s.anfitrion_id = $1
           OR EXISTS (SELECT 1 FROM v_posiciones po
                        JOIN v_mercados m ON m.id = po.mercado_id
                       WHERE m.sala_id = s.id AND po.usuario_id = $1)
        ORDER BY p.inicia_en ASC`,
      [sesion.usuarioId],
    );

    return {
      salas: rows.map((s) => ({
        ...s,
        misPosiciones: s.mis_posiciones,
        // Solo tiene sentido mostrarlo cuando ya se resolvió: antes es
        // dinero comprometido, no un resultado.
        miResultadoCentavos: ['LIQUIDADA', 'ANULADA', 'EXPIRADA'].includes(s.estado)
          ? Number(s.mi_resultado_centavos)
          : null,
      })),
      saldo: await saldoDe(sesion.usuarioId),
    };
  });

  return app;
}

// =====================================================================
//  Arranque
// =====================================================================

export async function iniciar(
  puerto = 3000,
  deportes?: ProveedorDeportes,
): Promise<FastifyInstance> {
  const app = await crearServidor({ logger: true, deportes });
  await app.listen({ port: puerto, host: '0.0.0.0' });
  return app;
}
