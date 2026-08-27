/**
 * Rutas de administración.
 *
 * Cada endpoint declara qué permiso exige. Ese permiso existe en el
 * código porque protege algo concreto; los ROLES que lo agrupan se
 * crean desde el panel.
 *
 * Todo cambio queda en `historial` con quién y cuándo, porque las
 * tablas llevan auditoría desde el día uno.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { pool, enTransaccion } from '../infraestructura/db.js';
import { invitar, config as configSeguridad } from '../servicios/seguridad.servicio.js';
import { proveedorDeEntorno, type ProveedorCorreo } from '../infraestructura/proveedores/correo.proveedor.js';
import {
  exigirPermiso,
  permisosDe,
  listarPermisos,
  listarRoles,
  permisosDeRol,
  crearRol,
  actualizarRol,
  eliminarRol,
  rolesDe,
  otorgarRol,
  quitarRol,
  listarTextos,
  guardarTexto,
  idiomas,
  invalidarTextos,
} from '../servicios/autorizacion.servicio.js';
import { invalidarPaises, formatear, paisDe } from '../servicios/paises.servicio.js';
import { invalidarConfig, anularPorMotivo } from '../servicios/salas.servicio.js';
import { invalidarConfigSeguridad } from '../servicios/seguridad.servicio.js';
import { invalidarConfigCasa } from '../servicios/casa.servicio.js';
import { salud } from '../servicios/procesos.servicio.js';
import {
  discrepancias,
  resumenVerificaciones,
  invalidarPolitica,
} from '../servicios/ubicacion.servicio.js';
import type { Sesion } from './auth.js';
import {
  exigirSesionFresca, exigirSegundoFactorSiCorresponde,
  reautenticar, registrarAccionCritica, credencialesDe,
  ACCIONES_CRITICAS, siguesConfirmado,
} from './capas.js';
import { ipDe } from '../servicios/ubicacion.servicio.js';
import { ESQUEMA_ERROR } from './docs.js';
import { registrarRutasCatalogo } from './catalogo.js';
import {
  ProveedorSimulado,
  type ProveedorDeportes,
} from '../infraestructura/proveedores/deportes.proveedor.js';
import { registrarRutasCasa } from './casa.js';

type ExigirSesion = (peticion: FastifyRequest) => Promise<Sesion>;

// El esquema de error viene de docs.ts, no se redefine aquí.
//
// Tener dos definiciones hacía que este archivo borrara `detalle` y
// `detalles` al serializar: el servidor explicaba qué campo estaba mal
// y el cliente recibía solo "revisa los datos".

export function registrarRutasAdmin(
  app: FastifyInstance,
  exigirSesion: ExigirSesion,
  sesionOpcional: (p: FastifyRequest) => Promise<Sesion | null>,
  correo: ProveedorCorreo = proveedorDeEntorno(),
  urlBase = process.env.URL_BASE ?? 'http://localhost:3000',
  proveedor: ProveedorDeportes = new ProveedorSimulado(),
): void {
  /**
   * Todas las capas en un solo paso.
   *
   * El orden importa: primero identidad, luego frescura, luego segundo
   * factor, luego permiso, y al final la reautenticación si la acción
   * lo merece. Cada una responde una pregunta distinta y ninguna
   * reemplaza a la anterior.
   */
  const conPermiso = async (
    peticion: FastifyRequest,
    permiso: string,
  ): Promise<Sesion> => {
    // 1. Quién eres
    const sesion = await exigirSesion(peticion);

    // 2. Desde hace cuánto no tocas nada. Una sesión olvidada en una
    //    máquina compartida no debería seguir sirviendo horas después.
    await exigirSesionFresca(sesion);

    const permisos = await permisosDe(sesion.usuarioId);

    // 3. Quien administra dinero no entra solo con contraseña
    await exigirSegundoFactorSiCorresponde(sesion.usuarioId, permisos.size > 0);

    // 4. Qué puedes hacer
    await exigirPermiso(sesion.usuarioId, permiso);

    // 5. Para lo irreversible, la contraseña otra vez. Un token robado
    //    no puede bastar para cambiar comisiones o repartir permisos.
    //
    //    Solo en métodos con cuerpo: un DELETE no puede llevar la
    //    confirmación. Los borrados sensibles están protegidos por sus
    //    propias reglas — quitar el último acceso total, por ejemplo,
    //    ya es imposible.
    const conCuerpo = ['POST', 'PATCH', 'PUT'].includes(peticion.method);
    if (ACCIONES_CRITICAS.has(permiso) && conCuerpo) {
      const cred = credencialesDe(peticion);

      // Ventana de confianza, como `sudo`: si confirmó hace poco, no
      // se le vuelve a pedir. Pedirla en cada clic no es más seguro —
      // la gente acaba dejando la contraseña en el portapapeles.
      //
      // Pero si el cliente ENVÍA credenciales, se verifican igual,
      // esté abierta la ventana o no. Aceptar una contraseña
      // equivocada en silencio le haría creer a quien la escribió que
      // era correcta, y ocultaría un intento fallido que merece
      // quedar registrado.
      if (cred.password) {
        await reautenticar(sesion.usuarioId, cred.password, cred.codigo);
      } else if (!siguesConfirmado(sesion.usuarioId)) {
        throw Object.assign(new Error('confirmar'), {
          codigo: 'REAUTENTICACION_REQUERIDA',
        });
      }

      // 6. Queda registrado con su contexto: el historial ya guarda QUÉ
      //    cambió; esto guarda desde dónde y con qué sesión.
      await registrarAccionCritica({
        usuarioId: sesion.usuarioId,
        accion: `${peticion.method} ${peticion.url}`,
        detalle: { permiso },
        ip: ipDe(peticion.headers, peticion.ip, process.env.CONFIAR_EN_PROXY === 'true'),
      });
    }

    return sesion;
  };

  // Deportes y salas van en su propio archivo: son otro dominio.
  registrarRutasCatalogo(app, exigirSesion, conPermiso, proveedor);

  const docBase = (summary: string, permiso: string, description?: string) => ({
    tags: ['admin'],
    summary,
    description: `Requiere el permiso \`${permiso}\`.${description ? `\n\n${description}` : ''}`,
    security: [{ bearer: [] }],
    // El 201 se declara aunque la mayoría de rutas no lo use: Fastify
    // solo permite responder con códigos que figuren en el esquema.
    response: {
      200: { type: 'object', additionalProperties: true },
      201: { type: 'object', additionalProperties: true },
      400: ESQUEMA_ERROR,
      401: ESQUEMA_ERROR,
      403: ESQUEMA_ERROR,
      409: ESQUEMA_ERROR,
    },
  });

  registrarRutasCasa(app, exigirSesion, sesionOpcional, conPermiso, docBase);

  // ===================================================================
  //  Mi acceso
  // ===================================================================

  app.get('/admin/yo', {
    schema: {
      tags: ['admin'],
      summary: 'Mis permisos y roles',
      description:
        'Lo llama el panel al cargar, para saber qué secciones mostrar. Un menú con opciones que van a fallar es peor que no tenerlas.',
      security: [{ bearer: [] }],
      response: { 401: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    // Deliberadamente SIN exigir segundo factor: es la ruta donde el
    // panel descubre que hace falta activarlo. Bloquearla dejaría a la
    // persona fuera sin manera de arreglarlo.
    const sesion = await exigirSesion(peticion);
    const permisos = await permisosDe(sesion.usuarioId);
    return {
      alias: sesion.alias,
      esAdministrador: permisos.size > 0,
      tieneSegundoFactor: (await pool.query(
        `SELECT totp_activado_en FROM usuarios WHERE id = $1`, [sesion.usuarioId]
      )).rows[0]?.totp_activado_en != null,
      permisos: [...permisos].sort(),
      roles: await rolesDe(sesion.usuarioId),
    };
  });

  // ===================================================================
  //  Roles y permisos
  // ===================================================================

  app.get('/admin/permisos', {
    schema: docBase('Catálogo de permisos', 'roles.gestionar',
      'Los permisos son fijos: cada uno protege un endpoint. Lo que se configura son los roles que los agrupan.'),
  }, async (peticion) => {
    await conPermiso(peticion, 'roles.gestionar');
    return { permisos: await listarPermisos() };
  });

  app.get('/admin/roles', {
    schema: docBase('Roles existentes', 'roles.gestionar'),
  }, async (peticion) => {
    await conPermiso(peticion, 'roles.gestionar');
    return { roles: await listarRoles() };
  });

  app.get('/admin/roles/:id', {
    schema: {
      ...docBase('Permisos de un rol', 'roles.gestionar'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'roles.gestionar');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    return { permisos: await permisosDeRol(id) };
  });

  app.post('/admin/roles', {
    schema: {
      ...docBase('Crear un rol', 'roles.gestionar',
        'Un rol es una combinación de permisos. Crear uno nuevo no requiere desplegar código.'),
      body: {
        type: 'object',
        properties: {
          clave: { type: 'string', minLength: 3, maxLength: 30 },
          nombre: { type: 'string', minLength: 3, maxLength: 60 },
          descripcion: { type: 'string', maxLength: 200 },
          permisos: { type: 'array', items: { type: 'string' } },
          confirmarPassword: {
            type: 'string',
            description: 'Tu contraseña. Obligatoria en acciones críticas.',
          },
          confirmarCodigo: {
            type: 'string',
            description: 'Tu código de dos pasos, si lo tienes activo.',
          },
        },
        required: ['clave', 'nombre', 'permisos'],
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await conPermiso(peticion, 'roles.gestionar');
    const datos = z
      .object({
        clave: z.string().min(3).max(30).regex(/^[A-Za-z_]+$/),
        nombre: z.string().min(3).max(60),
        descripcion: z.string().max(200).optional(),
        permisos: z.array(z.string()),
        confirmarPassword: z.string().optional(),
        confirmarCodigo: z.string().optional(),
      })
      .parse(peticion.body);

    const id = await crearRol(datos, sesion.usuarioId);
    return respuesta.code(201).send({ id });
  });

  app.patch('/admin/roles/:id', {
    schema: {
      ...docBase('Cambiar un rol', 'roles.gestionar'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          descripcion: { type: 'string' },
          permisos: { type: 'array', items: { type: 'string' } },
          confirmarPassword: { type: 'string' },
          confirmarCodigo: { type: 'string' },
        },
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'roles.gestionar');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const datos = z
      .object({
        nombre: z.string().min(3).max(60).optional(),
        descripcion: z.string().max(200).optional(),
        permisos: z.array(z.string()).optional(),
        confirmarPassword: z.string().optional(),
        confirmarCodigo: z.string().optional(),
      })
      .parse(peticion.body);

    await actualizarRol(id, datos, sesion.usuarioId);
    return { ok: true };
  });

  app.delete('/admin/roles/:id', {
    schema: {
      ...docBase('Eliminar un rol', 'roles.gestionar',
        'No se puede si alguien lo tiene asignado, ni si es un rol de sistema.'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'roles.gestionar');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    await eliminarRol(id, sesion.usuarioId);
    return { ok: true };
  });

  // ===================================================================
  //  Usuarios
  // ===================================================================

  app.get('/admin/usuarios', {
    schema: {
      ...docBase('Buscar cuentas', 'usuarios.ver'),
      querystring: {
        type: 'object',
        properties: {
          buscar: { type: 'string' },
          limite: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'usuarios.ver');
    const q = z
      .object({
        buscar: z.string().optional(),
        limite: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(peticion.query);

    const { rows } = await pool.query(
      `SELECT u.id, u.alias, u.email, u.pais, u.estado, u.fecha_crea,
              u.es_casa_oficial, u.financiada_por_plataforma,
              t.plan_vigente AS plan, t.plan_vencido,
              s.disponible_centavos, s.retenido_centavos, s.moneda,
              (SELECT count(*) FROM usuarios_roles ur
                WHERE ur.usuario_id = u.id AND ur.eliminado_en IS NULL)::int AS roles
         FROM v_usuarios u
         JOIN v_tasa_usuario t ON t.usuario_id = u.id
    LEFT JOIN v_saldos s  ON s.usuario_id = u.id
        WHERE ($1::text IS NULL
               OR u.alias ILIKE '%' || $1 || '%'
               OR u.email ILIKE '%' || $1 || '%')
        ORDER BY u.fecha_crea DESC LIMIT $2`,
      [q.buscar ?? null, q.limite],
    );
    return { usuarios: rows };
  });

  app.post('/admin/usuarios', {
    schema: {
      ...docBase('Crear una cuenta del equipo', 'usuarios.crear',
        'La contraseña se genera sola y **se envía por correo**. Nadie más la ve: si el admin pudiera leerla, podría entrar como esa persona y la auditoría dejaría de significar nada.'),
      body: {
        type: 'object',
        properties: {
          alias: { type: 'string', minLength: 3, maxLength: 20 },
          email: { type: 'string', format: 'email' },
          pais: { type: 'string', minLength: 2, maxLength: 2 },
          roles: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description: 'Roles a otorgar de inmediato. Requiere usuarios.roles.',
          },
        },
        required: ['alias', 'email'],
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await conPermiso(peticion, 'usuarios.crear');
    const datos = z
      .object({
        alias: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
        email: z.string().email(),
        pais: z.string().length(2).toUpperCase().default('PE'),
        roles: z.array(z.string().uuid()).default([]),
      })
      .parse(peticion.body);

    // Dar roles es un permiso aparte: alguien puede poder crear
    // cuentas de soporte sin poder convertirlas en administradores.
    if (datos.roles.length > 0) {
      await exigirPermiso(sesion.usuarioId, 'usuarios.roles');
    }

    await paisDe(datos.pais);

    const { id, nombresRoles } = await enTransaccion(async (c) => {
      const plan = await c.query(`SELECT id FROM v_planes WHERE codigo='GRATIS'`);
      let filas;
      try {
        filas = await c.query(
          `INSERT INTO usuarios
             (alias, email, hash_password, fecha_nacimiento, plan_id, pais,
              password_temporal)
           VALUES ($1,$2,'pendiente','1990-01-01',$3,$4,TRUE) RETURNING id`,
          [datos.alias, datos.email.toLowerCase(), plan.rows[0].id, datos.pais],
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

      const nombres: string[] = [];
      for (const rolId of datos.roles) {
        await c.query(
          `INSERT INTO usuarios_roles (usuario_id, rol_id, otorgado_por)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [filas.rows[0].id, rolId, sesion.usuarioId],
        );
        const r = await c.query(`SELECT nombre FROM v_roles WHERE id = $1`, [rolId]);
        if (r.rows[0]) nombres.push(r.rows[0].nombre);
      }
      return { id: filas.rows[0].id as string, nombresRoles: nombres };
    }, sesion.usuarioId);

    const { enviado } = await invitar(
      correo,
      { usuarioId: id, alias: datos.alias, email: datos.email, roles: nombresRoles },
      `${urlBase}/panel`,
    );

    return respuesta.code(201).send({
      id,
      alias: datos.alias,
      correoEnviado: enviado,
      // Si el correo falla, la cuenta igual se creó: se reenvía la
      // invitación en vez de perder el trabajo.
      ...(enviado ? {} : { aviso: 'La cuenta se creó, pero el correo no salió. Usa "Reenviar invitación".' }),
    });
  });

  app.post('/admin/usuarios/:id/reinvitar', {
    schema: {
      ...docBase('Reenviar la invitación', 'usuarios.crear',
        'Genera una contraseña temporal nueva y la envía. La anterior deja de servir.'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'usuarios.crear');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);

    const { rows } = await pool.query(
      `SELECT u.alias, u.email,
              COALESCE(array_agg(r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles
         FROM v_usuarios u
    LEFT JOIN usuarios_roles ur ON ur.usuario_id = u.id AND ur.eliminado_en IS NULL
    LEFT JOIN v_roles r ON r.id = ur.rol_id
        WHERE u.id = $1
        GROUP BY u.alias, u.email`,
      [id],
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('no existe'), { codigo: 'USUARIO_NO_EXISTE' });
    }

    const { enviado } = await invitar(
      correo,
      { usuarioId: id, alias: rows[0].alias, email: rows[0].email, roles: rows[0].roles },
      `${urlBase}/panel`,
    );
    return { correoEnviado: enviado };
  });

  app.get('/admin/usuarios/:id/roles', {
    schema: {
      ...docBase('Roles de una persona', 'usuarios.roles'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'usuarios.roles');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    return { roles: await rolesDe(id) };
  });

  app.post('/admin/usuarios/:id/roles', {
    schema: {
      ...docBase('Dar un rol', 'usuarios.roles'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          rolId: { type: 'string', format: 'uuid' },
          confirmarPassword: { type: 'string' },
          confirmarCodigo: { type: 'string' },
        },
        required: ['rolId'],
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'usuarios.roles');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const { rolId } = z
      .object({
        rolId: z.string().uuid(),
        confirmarPassword: z.string().optional(),
        confirmarCodigo: z.string().optional(),
      })
      .parse(peticion.body);
    await otorgarRol(id, rolId, sesion.usuarioId);
    return { ok: true };
  });

  app.delete('/admin/usuarios/:id/roles/:rolId', {
    schema: {
      ...docBase('Quitar un rol', 'usuarios.roles',
        'No se puede quitar el último acceso total: nadie podría volver a otorgarlo.'),
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          rolId: { type: 'string', format: 'uuid' },
        },
        required: ['id', 'rolId'],
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'usuarios.roles');
    const p = z
      .object({ id: z.string().uuid(), rolId: z.string().uuid() })
      .parse(peticion.params);
    await quitarRol(p.id, p.rolId, sesion.usuarioId);
    return { ok: true };
  });

  app.patch('/admin/usuarios/:id/estado', {
    schema: {
      ...docBase('Suspender o reactivar', 'usuarios.suspender'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: { estado: { type: 'string', enum: ['ACTIVO', 'SUSPENDIDO'] } },
        required: ['estado'],
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'usuarios.suspender');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const { estado } = z
      .object({ estado: z.enum(['ACTIVO', 'SUSPENDIDO']) })
      .parse(peticion.body);

    await enTransaccion(async (c) => {
      await c.query(`UPDATE usuarios SET estado = $2 WHERE id = $1`, [id, estado]);
    }, sesion.usuarioId);
    return { ok: true };
  });

  // ===================================================================
  //  Países
  // ===================================================================

  app.get('/admin/paises', {
    schema: docBase('Países configurados', 'paises.ver'),
  }, async (peticion) => {
    await conPermiso(peticion, 'paises.ver');
    const { rows } = await pool.query(
      `SELECT * FROM paises_habilitados WHERE eliminado_en IS NULL ORDER BY nombre`,
    );
    return { paises: rows };
  });

  app.post('/admin/paises', {
    schema: {
      ...docBase('Agregar un país', 'paises.gestionar',
        'Abrir un país nuevo es esto: una fila. No requiere desplegar código.'),
      body: {
        type: 'object',
        properties: {
          codigo: { type: 'string', minLength: 2, maxLength: 2 },
          nombre: { type: 'string' },
          moneda: { type: 'string', minLength: 3, maxLength: 3 },
          simbolo: { type: 'string', maxLength: 5 },
          decimales: { type: 'integer', minimum: 0, maximum: 4 },
          separadorMiles: { type: 'string', maxLength: 1 },
          separadorDecimal: { type: 'string', maxLength: 1 },
          minimoApuesta: { type: 'integer', minimum: 1 },
          maximoApuesta: { type: 'integer', minimum: 2 },
          zonaHoraria: { type: 'string' },
        },
        required: ['codigo', 'nombre', 'moneda', 'simbolo', 'decimales',
                   'minimoApuesta', 'maximoApuesta', 'zonaHoraria'],
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await conPermiso(peticion, 'paises.gestionar');
    const d = z
      .object({
        codigo: z.string().length(2).toUpperCase(),
        nombre: z.string().min(2),
        moneda: z.string().length(3).toUpperCase(),
        simbolo: z.string().min(1).max(5),
        decimales: z.number().int().min(0).max(4),
        separadorMiles: z.string().length(1).default(','),
        separadorDecimal: z.string().length(1).default('.'),
        minimoApuesta: z.number().int().positive(),
        maximoApuesta: z.number().int().positive(),
        zonaHoraria: z.string().min(3),
      })
      .refine((x) => x.maximoApuesta > x.minimoApuesta, {
        message: 'El máximo debe ser mayor que el mínimo',
      })
      .refine((x) => x.separadorMiles !== x.separadorDecimal, {
        message: 'Los separadores deben ser distintos',
      })
      .parse(peticion.body);

    await enTransaccion(async (c) => {
      await c.query(
        `INSERT INTO paises_habilitados
           (codigo, nombre, moneda, simbolo, decimales, separador_miles,
            separador_decimal, minimo_apuesta, maximo_apuesta, zona_horaria)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [d.codigo, d.nombre, d.moneda, d.simbolo, d.decimales, d.separadorMiles,
         d.separadorDecimal, d.minimoApuesta, d.maximoApuesta, d.zonaHoraria],
      );
    }, sesion.usuarioId);

    invalidarPaises();
    return respuesta.code(201).send({ ok: true });
  });

  app.patch('/admin/paises/:codigo', {
    schema: {
      ...docBase('Cambiar límites de un país', 'paises.gestionar'),
      params: { type: 'object', properties: { codigo: { type: 'string' } }, required: ['codigo'] },
      body: {
        type: 'object',
        properties: {
          minimoApuesta: { type: 'integer', minimum: 1 },
          maximoApuesta: { type: 'integer', minimum: 2 },
        },
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'paises.gestionar');
    const { codigo } = z.object({ codigo: z.string().length(2).toUpperCase() }).parse(peticion.params);
    const d = z
      .object({
        minimoApuesta: z.number().int().positive().optional(),
        maximoApuesta: z.number().int().positive().optional(),
      })
      .parse(peticion.body);

    await enTransaccion(async (c) => {
      await c.query(
        `UPDATE paises_habilitados
            SET minimo_apuesta = COALESCE($2, minimo_apuesta),
                maximo_apuesta = COALESCE($3, maximo_apuesta)
          WHERE codigo = $1`,
        [codigo, d.minimoApuesta ?? null, d.maximoApuesta ?? null],
      );
    }, sesion.usuarioId);

    invalidarPaises();
    return { ok: true };
  });

  // ===================================================================
  //  Comisiones y planes
  // ===================================================================

  app.get('/admin/planes', {
    schema: docBase('Membresías y comisiones', 'comisiones.ver'),
  }, async (peticion) => {
    await conPermiso(peticion, 'comisiones.ver');
    const { rows } = await pool.query(
      `SELECT id, codigo, nombre, precio_centavos, tasa_comision, activo,
              destacados_incluidos, estadisticas_avanzadas,
              (SELECT count(*) FROM v_usuarios u WHERE u.plan_id = p.id)::int AS usuarios
         FROM v_planes p ORDER BY tasa_comision DESC`,
    );
    return { planes: rows };
  });

  app.post('/admin/planes', {
    schema: {
      ...docBase('Crear una membresía', 'comisiones.gestionar',
        'La comisión no puede bajar del 3%. Un plan sin comisión dejaría el ingreso capado justo en los usuarios de mayor volumen.'),
      body: {
        type: 'object',
        properties: {
          codigo: { type: 'string', minLength: 3, maxLength: 20 },
          nombre: { type: 'string', minLength: 2, maxLength: 40 },
          precioCentavos: { type: 'integer', minimum: 0 },
          tasaComision: { type: 'number', minimum: 0.03, maximum: 0.2 },
          destacadosIncluidos: { type: 'boolean' },
          estadisticasAvanzadas: { type: 'boolean' },
          activo: { type: 'boolean' },
          confirmarPassword: { type: 'string' },
          confirmarCodigo: { type: 'string' },
        },
        required: ['codigo', 'nombre', 'precioCentavos', 'tasaComision'],
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await conPermiso(peticion, 'comisiones.gestionar');
    const d = z
      .object({
        codigo: z.string().min(3).max(20).regex(/^[A-Za-z_]+$/).toUpperCase(),
        nombre: z.string().min(2).max(40),
        precioCentavos: z.number().int().min(0),
        tasaComision: z.number().min(0.03).max(0.2),
        destacadosIncluidos: z.boolean().default(false),
        estadisticasAvanzadas: z.boolean().default(false),
        activo: z.boolean().default(true),
        confirmarPassword: z.string().optional(),
        confirmarCodigo: z.string().optional(),
      })
      .parse(peticion.body);

    const id = await enTransaccion(async (c) => {
      try {
        const r = await c.query(
          `INSERT INTO planes (codigo, nombre, precio_centavos, tasa_comision,
                               destacados_incluidos, estadisticas_avanzadas, activo)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [d.codigo, d.nombre, d.precioCentavos, d.tasaComision,
           d.destacadosIncluidos, d.estadisticasAvanzadas, d.activo],
        );
        return r.rows[0].id as string;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('uq_planes_codigo')) {
          throw Object.assign(new Error('codigo'), { codigo: 'PLAN_YA_EXISTE' });
        }
        if (msg.includes('piso_comision')) {
          throw Object.assign(new Error('piso'), { codigo: 'COMISION_BAJO_PISO' });
        }
        throw e;
      }
    }, sesion.usuarioId);

    return respuesta.code(201).send({ id, codigo: d.codigo });
  });

  app.patch('/admin/planes/:id', {
    schema: {
      ...docBase('Cambiar comisión o precio', 'comisiones.gestionar',
        'La tasa no puede bajar de 3%. Un plan sin comisión dejaría el ingreso capado justo en los usuarios de mayor volumen.'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          nombre: { type: 'string', minLength: 2, maxLength: 40 },
          tasaComision: { type: 'number', minimum: 0.03, maximum: 0.2 },
          precioCentavos: { type: 'integer', minimum: 0 },
          destacadosIncluidos: { type: 'boolean' },
          estadisticasAvanzadas: { type: 'boolean' },
          activo: {
            type: 'boolean',
            description: 'Desactivar oculta el plan a los nuevos, pero no toca a quien ya lo tiene.',
          },
          confirmarPassword: { type: 'string' },
          confirmarCodigo: { type: 'string' },
        },
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'comisiones.gestionar');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const d = z
      .object({
        nombre: z.string().min(2).max(40).optional(),
        tasaComision: z.number().min(0.03).max(0.2).optional(),
        precioCentavos: z.number().int().min(0).optional(),
        destacadosIncluidos: z.boolean().optional(),
        estadisticasAvanzadas: z.boolean().optional(),
        activo: z.boolean().optional(),
        confirmarPassword: z.string().optional(),
        confirmarCodigo: z.string().optional(),
      })
      .parse(peticion.body);

    // El CHECK de la tabla lo impide igual, pero avisar aquí da un
    // mensaje útil en vez de un error de base de datos.
    await enTransaccion(async (c) => {
      await c.query(
        `UPDATE planes
            SET nombre = COALESCE($2, nombre),
                tasa_comision = COALESCE($3, tasa_comision),
                precio_centavos = COALESCE($4, precio_centavos),
                destacados_incluidos = COALESCE($5, destacados_incluidos),
                estadisticas_avanzadas = COALESCE($6, estadisticas_avanzadas),
                activo = COALESCE($7, activo)
          WHERE id = $1`,
        [id, d.nombre ?? null, d.tasaComision ?? null, d.precioCentavos ?? null,
         d.destacadosIncluidos ?? null, d.estadisticasAvanzadas ?? null,
         d.activo ?? null],
      );
    }, sesion.usuarioId);
    return { ok: true };
  });

  // ===================================================================
  //  Configuración
  // ===================================================================

  app.get('/admin/config', {
    schema: docBase('Parámetros del sistema', 'config.ver'),
  }, async (peticion) => {
    await conPermiso(peticion, 'config.ver');
    const { rows } = await pool.query(
      `SELECT clave, valor, tipo, descripcion FROM configuracion
        WHERE eliminado_en IS NULL ORDER BY clave`,
    );
    return { config: rows };
  });

  app.patch('/admin/config/:clave', {
    schema: {
      ...docBase('Cambiar un parámetro', 'config.gestionar'),
      params: { type: 'object', properties: { clave: { type: 'string' } }, required: ['clave'] },
      body: { type: 'object', properties: { valor: { type: 'string' } }, required: ['valor'] },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'config.gestionar');
    const { clave } = z.object({ clave: z.string() }).parse(peticion.params);
    const { valor } = z.object({ valor: z.string() }).parse(peticion.body);

    await enTransaccion(async (c) => {
      const { rows } = await c.query(
        `SELECT tipo FROM configuracion WHERE clave = $1 AND eliminado_en IS NULL`,
        [clave],
      );
      if (rows.length === 0) {
        throw Object.assign(new Error('no existe'), { codigo: 'CONFIG_NO_EXISTE' });
      }
      // Un parámetro numérico con texto adentro rompería el sistema en
      // silencio: el código haría Number('abc') y usaría el valor por
      // defecto sin avisar a nadie.
      if (rows[0].tipo === 'NUMERO' && !Number.isFinite(Number(valor))) {
        throw Object.assign(new Error('no numérico'), { codigo: 'VALOR_INVALIDO' });
      }
      if (rows[0].tipo === 'BOOLEAN' && !['true', 'false'].includes(valor)) {
        throw Object.assign(new Error('no booleano'), { codigo: 'VALOR_INVALIDO' });
      }
      await c.query(`UPDATE configuracion SET valor = $2 WHERE clave = $1`, [clave, valor]);
    }, sesion.usuarioId);

    // Se invalidan TODAS las cachés de configuración, no solo la de
    // salas. Cada servicio guarda la suya por un minuto, así que
    // olvidar una obliga a esperar a que expire — y parece que el
    // cambio no se aplicó.
    invalidarConfig();
    invalidarPolitica();
    invalidarConfigSeguridad();
    invalidarConfigCasa();
    return { ok: true };
  });

  // ===================================================================
  //  Textos
  // ===================================================================

  app.get('/admin/textos', {
    schema: {
      ...docBase('Textos de la app', 'textos.gestionar',
        'Agregar un idioma es insertar filas aquí. No requiere tocar código.'),
      querystring: { type: 'object', properties: { idioma: { type: 'string' } } },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'textos.gestionar');
    const q = z.object({ idioma: z.string().length(2).default('es') }).parse(peticion.query);
    return { idiomas: await idiomas(), textos: await listarTextos(q.idioma) };
  });

  app.put('/admin/textos/:clave', {
    schema: {
      ...docBase('Guardar un texto', 'textos.gestionar'),
      params: { type: 'object', properties: { clave: { type: 'string' } }, required: ['clave'] },
      body: {
        type: 'object',
        properties: { idioma: { type: 'string' }, valor: { type: 'string', minLength: 1 } },
        required: ['idioma', 'valor'],
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'textos.gestionar');
    const { clave } = z.object({ clave: z.string() }).parse(peticion.params);
    const d = z
      .object({ idioma: z.string().length(2), valor: z.string().min(1).max(500) })
      .parse(peticion.body);

    await guardarTexto(clave, d.idioma, d.valor, sesion.usuarioId);
    return { ok: true };
  });

  app.post('/admin/idiomas', {
    schema: {
      ...docBase('Agregar un idioma', 'textos.gestionar'),
      body: {
        type: 'object',
        properties: {
          codigo: { type: 'string', minLength: 2, maxLength: 2 },
          nombre: { type: 'string' },
        },
        required: ['codigo', 'nombre'],
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await conPermiso(peticion, 'textos.gestionar');
    const d = z
      .object({ codigo: z.string().length(2).toLowerCase(), nombre: z.string().min(2) })
      .parse(peticion.body);

    await enTransaccion(async (c) => {
      await c.query(`INSERT INTO idiomas (codigo, nombre) VALUES ($1,$2)`, [
        d.codigo, d.nombre,
      ]);
    }, sesion.usuarioId);
    invalidarTextos();
    return respuesta.code(201).send({ ok: true });
  });

  // ===================================================================
  //  Operación
  // ===================================================================

  app.get('/admin/salud', {
    schema: docBase('Estado del sistema', 'incidentes.ver'),
  }, async (peticion) => {
    await conPermiso(peticion, 'incidentes.ver');
    return salud();
  });

  app.get('/admin/incidentes', {
    schema: {
      ...docBase('Incidentes', 'incidentes.ver'),
      querystring: {
        type: 'object',
        properties: { soloAbiertos: { type: 'boolean', default: true } },
      },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'incidentes.ver');
    const q = z.object({ soloAbiertos: z.coerce.boolean().default(true) }).parse(peticion.query);
    const { rows } = await pool.query(
      `SELECT id, tipo, severidad, detalle, mercado_id, resuelto_en, fecha_crea
         FROM incidentes
        WHERE ($1::boolean IS NOT TRUE OR resuelto_en IS NULL)
        ORDER BY
          CASE severidad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2
                         WHEN 'MEDIA' THEN 3 ELSE 4 END,
          fecha_crea DESC
        LIMIT 200`,
      [q.soloAbiertos],
    );
    return { incidentes: rows };
  });

  app.patch('/admin/incidentes/:id', {
    schema: {
      ...docBase('Marcar como resuelto', 'incidentes.resolver'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'incidentes.resolver');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    await enTransaccion(async (c) => {
      await c.query(
        `UPDATE incidentes SET resuelto_en = now(), resuelto_por = $2 WHERE id = $1`,
        [id, sesion.usuarioId],
      );
    }, sesion.usuarioId);
    return { ok: true };
  });

  // ===================================================================
  //  Ubicación
  // ===================================================================

  app.get('/admin/ubicacion', {
    schema: docBase('Quién declaró un país distinto al de su IP', 'usuarios.ver',
      'La IP **no es prueba**: una VPN la cambia en un clic y una red corporativa puede salir por otro país. Es la primera capa; el KYC es la que verifica de verdad.'),
  }, async (peticion) => {
    await conPermiso(peticion, 'usuarios.ver');
    return {
      discrepancias: await discrepancias(100),
      resumen: await resumenVerificaciones(),
    };
  });

  app.get('/admin/seguridad', {
    schema: docBase('Intentos de ingreso y estado del equipo', 'seguridad.ver'),
  }, async (peticion) => {
    await conPermiso(peticion, 'seguridad.ver');
    const [sospechosos, personal, correos, cfg] = await Promise.all([
      pool.query(`SELECT * FROM v_intentos_sospechosos LIMIT 50`),
      pool.query(`SELECT * FROM v_personal ORDER BY alias`),
      pool.query(
        `SELECT plantilla, estado, count(*)::int AS total
           FROM correos_enviados
          WHERE creado_en > now() - interval '7 days'
          GROUP BY plantilla, estado ORDER BY total DESC`,
      ),
      configSeguridad(),
    ]);
    return {
      intentosSospechosos: sospechosos.rows,
      personal: personal.rows,
      correos: correos.rows,
      politica: cfg,
    };
  });

  // ===================================================================
  //  Reportes
  // ===================================================================

  app.get('/admin/reportes/ingresos', {
    schema: {
      ...docBase('Ingresos por período', 'reportes.ver',
        'Las cifras salen del libro contable, separadas por moneda. Sumar soles con pesos daría un número sin significado.'),
      querystring: {
        type: 'object',
        properties: {
          desde: { type: 'string', format: 'date' },
          hasta: { type: 'string', format: 'date' },
          agrupar: { type: 'string', enum: ['dia', 'semana', 'mes'] },
        },
      },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'reportes.ver');
    const q = z
      .object({
        desde: z.string().optional(),
        hasta: z.string().optional(),
        agrupar: z.enum(['dia', 'semana', 'mes']).default('dia'),
      })
      .parse(peticion.query);

    const unidad = { dia: 'day', semana: 'week', mes: 'month' }[q.agrupar];

    const { rows } = await pool.query(
      `SELECT date_trunc($3, fecha_crea)::date AS periodo,
              moneda,
              SUM(monto_centavos) FILTER (WHERE es_casa)::bigint      AS comision,
              SUM(monto_centavos) FILTER (WHERE tipo='DEPOSITO')::bigint AS depositos,
              count(*) FILTER (WHERE tipo='RETENCION')::int           AS apuestas,
              SUM(-monto_centavos) FILTER (WHERE tipo='RETENCION')::bigint AS volumen
         FROM movimientos
        WHERE fecha_crea >= COALESCE($1::date, now() - interval '30 days')
          AND fecha_crea <  COALESCE($2::date, now()) + interval '1 day'
        GROUP BY periodo, moneda
        ORDER BY periodo DESC, moneda`,
      [q.desde ?? null, q.hasta ?? null, unidad],
    );
    return { periodos: rows };
  });

  app.get('/admin/reportes/resumen', {
    schema: docBase('Resumen del negocio', 'reportes.ver'),
  }, async (peticion) => {
    await conPermiso(peticion, 'reportes.ver');

    const [general, porMoneda] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT count(*) FROM v_usuarios)::int                              AS usuarios,
          (SELECT count(*) FROM v_usuarios WHERE fecha_crea > now() - interval '7 days')::int
                                                                              AS usuarios_semana,
          (SELECT count(*) FROM v_salas WHERE estado IN ('ABIERTA','CUENTA_REGRESIVA'))::int
                                                                              AS salas_abiertas,
          (SELECT count(*) FROM v_salas WHERE estado = 'LIQUIDADA')::int      AS salas_liquidadas,
          (SELECT count(*) FROM v_salas WHERE estado IN ('ANULADA','EXPIRADA'))::int
                                                                              AS salas_anuladas
      `),
      pool.query(`
        SELECT moneda,
               SUM(monto_centavos) FILTER (WHERE es_casa)::bigint            AS comision_total,
               SUM(monto_centavos) FILTER (WHERE tipo='DEPOSITO')::bigint    AS depositado,
               SUM(-monto_centavos) FILTER (WHERE tipo='RETENCION')::bigint  AS volumen_apostado
          FROM movimientos GROUP BY moneda
      `),
    ]);

    const g = general.rows[0];
    const liquidadas = Number(g.salas_liquidadas);
    const anuladas = Number(g.salas_anuladas);

    return {
      usuarios: g.usuarios,
      usuariosSemana: g.usuarios_semana,
      salasAbiertas: g.salas_abiertas,
      salasLiquidadas: liquidadas,
      salasAnuladas: anuladas,
      // Cada sala anulada es comisión que ya se tenía y se fue. Es la
      // métrica que más dice sobre la salud del producto.
      tasaAnulacion:
        liquidadas + anuladas > 0
          ? Math.round((anuladas / (liquidadas + anuladas)) * 1000) / 10
          : 0,
      porMoneda: porMoneda.rows,
    };
  });

  app.get('/admin/reportes/salas', {
    schema: {
      ...docBase('Salas anuladas y por qué', 'reportes.ver',
        'Sirve para saber si se pierden salas por falta de contraparte o por problemas de datos.'),
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'reportes.ver');
    const { rows } = await pool.query(
      `SELECT motivo_anulacion AS motivo, count(*)::int AS total
         FROM v_mercados
        WHERE motivo_anulacion IS NOT NULL
        GROUP BY motivo_anulacion ORDER BY total DESC`,
    );
    return { motivos: rows };
  });

  // ===================================================================
  //  Auditoría
  // ===================================================================

  app.get('/admin/historial', {
    schema: {
      ...docBase('Quién cambió qué', 'config.ver',
        'Toda modificación del sistema queda registrada desde el día uno.'),
      querystring: {
        type: 'object',
        properties: {
          tabla: { type: 'string' },
          limite: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
        },
      },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'config.ver');
    const q = z
      .object({
        tabla: z.string().optional(),
        limite: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(peticion.query);

    const { rows } = await pool.query(
      `SELECT h.tabla, h.registro_id, h.operacion, h.campos_cambiados,
              u.alias AS autor, h.creado_en
         FROM historial h
    LEFT JOIN v_usuarios u ON u.id = h.usuario_id
        WHERE ($1::text IS NULL OR h.tabla = $1)
        ORDER BY h.id DESC LIMIT $2`,
      [q.tabla ?? null, q.limite],
    );
    return { historial: rows };
  });
}
