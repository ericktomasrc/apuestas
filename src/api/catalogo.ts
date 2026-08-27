/**
 * Rutas de administración: DEPORTES y SALAS.
 *
 * Van aparte de admin.ts porque son otro dominio: el catálogo de qué
 * se puede apostar, y la operación diaria sobre lo que ya está en
 * juego.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { pool, enTransaccion } from '../infraestructura/db.js';
import { exigirPermiso } from '../servicios/autorizacion.servicio.js';
import { anularPorMotivo, cerrarSala, expirarSala } from '../servicios/salas.servicio.js';
import { ESQUEMA_ERROR } from './docs.js';
import type { Sesion } from './auth.js';
import { sincronizarFixtures } from '../servicios/deportes.servicio.js';
import {
  ProveedorSimulado,
  type ProveedorDeportes,
} from '../infraestructura/proveedores/deportes.proveedor.js';

type ExigirSesion = (peticion: FastifyRequest) => Promise<Sesion>;

/**
 * Mercados que el sistema sabe resolver.
 *
 * Es una lista cerrada a propósito: cada uno corresponde a una regla
 * en `resolverMercado()`. Habilitar uno que el código no sabe liquidar
 * dejaría el dinero atrapado hasta que alguien lo anulara a mano.
 */
export const MERCADOS_POR_DEPORTE: Record<string, { clave: string; nombre: string; usaLinea: boolean }[]> = {
  FUTBOL: [
    { clave: 'DOBLE_OPORTUNIDAD', nombre: 'Gana el local (o no)', usaLinea: false },
    { clave: 'TOTAL_GOLES',       nombre: 'Total de goles',       usaLinea: true },
    { clave: 'AMBOS_ANOTAN',      nombre: 'Ambos anotan',         usaLinea: false },
    { clave: 'TOTAL_CORNERS',     nombre: 'Total de córners',     usaLinea: true },
    { clave: 'TOTAL_TARJETAS',    nombre: 'Total de tarjetas',    usaLinea: true },
  ],
  BASQUET: [
    { clave: 'GANADOR_DIRECTO',   nombre: 'Quién gana',           usaLinea: false },
    { clave: 'TOTAL_PUNTOS',      nombre: 'Total de puntos',      usaLinea: true },
  ],
};

export function registrarRutasCatalogo(
  app: FastifyInstance,
  exigirSesion: ExigirSesion,
  conPermiso: (peticion: FastifyRequest, permiso: string) => Promise<Sesion>,
  proveedor: ProveedorDeportes = new ProveedorSimulado(),
): void {
  const doc = (summary: string, permiso: string, description?: string) => ({
    tags: ['admin'],
    summary,
    description: `Requiere el permiso \`${permiso}\`.${description ? `\n\n${description}` : ''}`,
    security: [{ bearer: [] }],
    response: {
      200: { type: 'object', additionalProperties: true },
      201: { type: 'object', additionalProperties: true },
      400: ESQUEMA_ERROR,
      401: ESQUEMA_ERROR,
      403: ESQUEMA_ERROR,
      409: ESQUEMA_ERROR,
    },
  });

  // ===================================================================
  //  Deportes, ligas y mercados
  // ===================================================================

  app.get('/admin/deportes', {
    schema: {
      ...doc('Catálogo de deportes, ligas y mercados', 'deportes.ver',
        'El catálogo del proveedor son más de mil ligas: viene paginado y filtrable por país o nombre.'),
      querystring: {
        type: 'object',
        properties: {
          pais: { type: 'string', maxLength: 2 },
          deporte: { type: 'string', maxLength: 20 },
          buscar: { type: 'string' },
          soloActivas: { type: 'boolean' },
          limite: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
          desde: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'deportes.ver');

    const q = z
      .object({
        pais: z.string().max(2).optional(),
        deporte: z.string().max(20).optional(),
        buscar: z.string().max(60).optional(),
        soloActivas: z.coerce.boolean().default(false),
        limite: z.coerce.number().int().min(1).max(100).default(25),
        desde: z.coerce.number().int().min(0).default(0),
      })
      .parse(peticion.query);

    const [deportes, ligas, conteo, paises] = await Promise.all([
      pool.query(
        // Con `activas` se puede dibujar una barra de deportes que
        // solo muestre los que tienen algo detrás. Hoy solo hay
        // fútbol; cuando se contraten más suscripciones, aparecen
        // solos sin tocar la interfaz.
        `SELECT d.id, d.clave, d.nombre, d.tiene_empate, d.cuenta_prorroga,
                (SELECT count(*) FROM v_ligas l
                  WHERE l.deporte_id = d.id)::int AS ligas,
                (SELECT count(*) FROM v_ligas l
                  WHERE l.deporte_id = d.id
                    AND EXISTS (SELECT 1 FROM mercados_por_liga m
                                 WHERE m.liga_id = l.id
                                   AND m.eliminado_en IS NULL))::int AS activas
           FROM v_deportes d ORDER BY d.nombre`,
      ),
      // Paginado y filtrable.
      //
      // El catálogo del proveedor son más de mil ligas. Devolverlas
      // todas obliga a desplazarse por una lista interminable para
      // encontrar una, y hace que la pantalla tarde en dibujarse.
      pool.query(
        `SELECT l.id, l.api_id, l.nombre, l.pais, l.deporte_id,
                l.tiene_estadisticas,
                d.clave AS deporte,
                (SELECT count(*) FROM v_partidos p
                  WHERE p.liga_id = l.id AND p.inicia_en > now())::int AS partidos,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                            'tipo', m.tipo_mercado,
                            'verificadoEn', m.verificado_en))
                     FROM mercados_por_liga m
                    WHERE m.liga_id = l.id AND m.eliminado_en IS NULL),
                  '[]'::json) AS mercados
           FROM v_ligas l
           JOIN v_deportes d ON d.id = l.deporte_id
          WHERE ($1::text IS NULL OR l.pais = $1)
            -- Buscar cubre nombre Y país: el nombre de la liga suele
            -- llevar el país entre paréntesis, pero escribir «PE»
            -- también tiene que funcionar.
            AND ($2::text IS NULL
                 OR l.nombre ILIKE '%' || $2 || '%'
                 OR l.pais ILIKE $2)
            AND ($3::boolean IS NOT TRUE OR EXISTS (
                  SELECT 1 FROM mercados_por_liga m
                   WHERE m.liga_id = l.id AND m.eliminado_en IS NULL))
            AND ($4::text IS NULL OR d.clave = $4)
          -- Las activas primero —son las que se están usando— y
          -- después por relevancia. Sin eso el orden es alfabético y
          -- lo primero que se ve son ligas de Andorra y Feroe.
          ORDER BY (EXISTS (SELECT 1 FROM mercados_por_liga m
                             WHERE m.liga_id = l.id
                               AND m.eliminado_en IS NULL)) DESC,
                   l.relevancia DESC,
                   l.nombre
          LIMIT $5 OFFSET $6`,
        [q.pais ?? null, q.buscar ?? null, q.soloActivas, q.deporte ?? null,
         q.limite, q.desde],
      ),
      pool.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM mercados_por_liga m
                   WHERE m.liga_id = l.id AND m.eliminado_en IS NULL))::int AS activas
           FROM v_ligas l
           JOIN v_deportes d ON d.id = l.deporte_id
          WHERE ($1::text IS NULL OR l.pais = $1)
            AND ($2::text IS NULL
                 OR l.nombre ILIKE '%' || $2 || '%'
                 OR l.pais ILIKE $2)
            AND ($3::text IS NULL OR d.clave = $3)`,
        [q.pais ?? null, q.buscar ?? null, q.deporte ?? null],
      ),
      // Para el desplegable de países: cuántas ligas hay en cada uno.
      pool.query(
        `SELECT pais, count(*)::int AS ligas,
                count(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM mercados_por_liga m
                   WHERE m.liga_id = l.id AND m.eliminado_en IS NULL))::int AS activas
           FROM v_ligas l
          GROUP BY pais ORDER BY 3 DESC, 2 DESC, 1`,
      ),
    ]);

    return {
      deportes: deportes.rows,
      ligas: ligas.rows,
      paises: paises.rows,
      total: conteo.rows[0].total,
      activas: conteo.rows[0].activas,
      desde: q.desde,
      limite: q.limite,
      // El catálogo de mercados es código: cada uno tiene su regla de
      // liquidación. Se envía para que el panel no lo duplique.
      mercadosDisponibles: MERCADOS_POR_DEPORTE,
    };
  });

  app.post('/admin/ligas', {
    schema: {
      ...doc('Agregar una liga', 'deportes.gestionar'),
      body: {
        type: 'object',
        properties: {
          deporteId: { type: 'string', format: 'uuid' },
          apiId: {
            type: 'string',
            minLength: 1,
            description: 'El identificador que usa el proveedor de datos. Sin él no se pueden traer los partidos.',
          },
          nombre: { type: 'string', minLength: 2, maxLength: 60 },
          pais: { type: 'string', minLength: 2, maxLength: 2 },
        },
        required: ['deporteId', 'apiId', 'nombre'],
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const d = z
      .object({
        deporteId: z.string().uuid(),
        apiId: z.string().min(1).max(60),
        nombre: z.string().min(2).max(60),
        pais: z.string().length(2).toUpperCase().optional(),
      })
      .parse(peticion.body);

    const id = await enTransaccion(async (c) => {
      try {
        const r = await c.query(
          `INSERT INTO ligas (deporte_id, api_id, nombre, pais)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [d.deporteId, d.apiId, d.nombre, d.pais ?? null],
        );
        return r.rows[0].id as string;
      } catch (e) {
        if (e instanceof Error && e.message.includes('uq_ligas_api')) {
          throw Object.assign(new Error('duplicada'), { codigo: 'LIGA_YA_EXISTE' });
        }
        throw e;
      }
    }, sesion.usuarioId);

    return respuesta.code(201).send({ id });
  });

  app.delete('/admin/ligas/:id', {
    schema: {
      ...doc('Quitar una liga', 'deportes.gestionar',
        'No se puede si tiene partidos por jugarse: sus salas se quedarían sin resultado.'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);

    await enTransaccion(async (c) => {
      const { rows } = await c.query(
        `SELECT count(*)::int AS n FROM v_partidos
          WHERE liga_id = $1 AND inicia_en > now()`,
        [id],
      );
      if (rows[0].n > 0) {
        throw Object.assign(new Error('en uso'), {
          codigo: 'LIGA_EN_USO',
          mensajeUsuario: `Tiene ${rows[0].n} partido(s) por jugarse. Espera a que se resuelvan.`,
        });
      }
      await c.query(`UPDATE ligas SET eliminado_en = now() WHERE id = $1`, [id]);
    }, sesion.usuarioId);

    return { ok: true };
  });

  app.put('/admin/ligas/:id/mercados', {
    schema: {
      ...doc('Qué mercados corren en esta liga', 'deportes.gestionar',
        'Habilitar un mercado cuyo dato el proveedor no entrega produce anulaciones en masa por DATO_NO_DISPONIBLE. Conviene comprobarlo con un partido antes.'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          mercados: { type: 'array', items: { type: 'string' } },
          verificado: {
            type: 'boolean',
            description: 'Marcar solo si se comprobó que el proveedor entrega el dato.',
          },
        },
        required: ['mercados'],
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const d = z
      .object({
        mercados: z.array(z.string()),
        verificado: z.boolean().default(false),
      })
      .parse(peticion.body);

    // Solo se admiten mercados que el sistema sabe liquidar. Uno que
    // no esté en la lista dejaría el dinero atrapado hasta que alguien
    // lo anulara a mano.
    const { rows: liga } = await pool.query(
      `SELECT d.clave FROM v_ligas l JOIN v_deportes d ON d.id = l.deporte_id
        WHERE l.id = $1`,
      [id],
    );
    if (liga.length === 0) {
      throw Object.assign(new Error('no existe'), { codigo: 'LIGA_NO_EXISTE' });
    }
    const validos = new Set(
      (MERCADOS_POR_DEPORTE[liga[0].clave] ?? []).map((m) => m.clave),
    );
    const malos = d.mercados.filter((m) => !validos.has(m));
    if (malos.length > 0) {
      throw Object.assign(new Error('mercado inválido'), {
        codigo: 'MERCADO_NO_SOPORTADO',
        mensajeUsuario: `El sistema no sabe liquidar: ${malos.join(', ')}`,
      });
    }

    await enTransaccion(async (c) => {
      // Borrado lógico y alta: el historial debe poder responder quién
      // habilitó un mercado y cuándo.
      await c.query(
        `UPDATE mercados_por_liga SET eliminado_en = now()
          WHERE liga_id = $1 AND eliminado_en IS NULL`,
        [id],
      );
      for (const tipo of d.mercados) {
        await c.query(
          `INSERT INTO mercados_por_liga (liga_id, tipo_mercado, verificado_en)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [id, tipo, d.verificado ? new Date() : null],
        );
      }
    }, sesion.usuarioId);

    return { ok: true, habilitados: d.mercados.length };
  });

  app.get('/admin/partidos', {
    schema: {
      ...doc('Partidos próximos', 'deportes.ver'),
      querystring: {
        type: 'object',
        properties: {
          ligaId: { type: 'string', format: 'uuid' },
          limite: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'deportes.ver');
    const q = z
      .object({
        ligaId: z.string().uuid().optional(),
        limite: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(peticion.query);

    const { rows } = await pool.query(
      `SELECT p.id, p.api_id, p.equipo_local, p.equipo_visitante,
              p.inicia_en, p.inicia_en_original, p.estado,
              l.nombre AS liga, d.clave AS deporte,
              p.goles_local, p.goles_visitante,
              (SELECT count(*) FROM v_salas s WHERE s.partido_id = p.id)::int AS salas
         FROM v_partidos p
         JOIN v_ligas l    ON l.id = p.liga_id
         JOIN v_deportes d ON d.id = p.deporte_id
        WHERE ($1::uuid IS NULL OR p.liga_id = $1)
        ORDER BY p.inicia_en DESC
        LIMIT $2`,
      [q.ligaId ?? null, q.limite],
    );
    return { partidos: rows };
  });

  app.post('/admin/partidos', {
    schema: {
      ...doc('Cargar un partido a mano', 'deportes.gestionar',
        'Mientras el proveedor de datos no esté conectado, esta es la única forma de que existan partidos. Al conectarlo, los que lleguen con el mismo identificador se actualizan en vez de duplicarse.'),
      body: {
        type: 'object',
        properties: {
          ligaId: { type: 'string', format: 'uuid' },
          equipoLocal: { type: 'string', minLength: 2, maxLength: 60 },
          equipoVisitante: { type: 'string', minLength: 2, maxLength: 60 },
          iniciaEn: { type: 'string', format: 'date-time' },
          apiId: { type: 'string', maxLength: 60 },
        },
        required: ['ligaId', 'equipoLocal', 'equipoVisitante', 'iniciaEn'],
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const d = z
      .object({
        ligaId: z.string().uuid(),
        equipoLocal: z.string().min(2).max(60),
        equipoVisitante: z.string().min(2).max(60),
        iniciaEn: z.string(),
        apiId: z.string().max(60).optional(),
      })
      .parse(peticion.body);

    if (d.equipoLocal.trim().toLowerCase() === d.equipoVisitante.trim().toLowerCase()) {
      throw Object.assign(new Error('equipos'), {
        codigo: 'ENTRADA_INVALIDA',
        mensajeUsuario: 'Los dos equipos no pueden ser el mismo.',
      });
    }

    const inicia = new Date(d.iniciaEn);
    if (Number.isNaN(inicia.getTime())) {
      throw Object.assign(new Error('fecha'), {
        codigo: 'ENTRADA_INVALIDA',
        mensajeUsuario: 'Esa fecha no es válida.',
      });
    }
    // Un partido que ya empezó no sirve: nadie podría abrir una sala.
    if (inicia.getTime() < Date.now() + 20 * 60_000) {
      throw Object.assign(new Error('pronto'), {
        codigo: 'ENTRADA_INVALIDA',
        mensajeUsuario: 'Tiene que empezar dentro de al menos 20 minutos.',
      });
    }

    const id = await enTransaccion(async (c) => {
      const liga = await c.query(
        `SELECT l.id, l.deporte_id FROM v_ligas l WHERE l.id = $1`,
        [d.ligaId],
      );
      if (liga.rows.length === 0) {
        throw Object.assign(new Error('liga'), { codigo: 'LIGA_NO_EXISTE' });
      }

      // ⚠️ Sin identificador del proveedor, este partido NO recibirá
      // resultados: `actualizarEstados` los pide por `api_id`, y un
      // `manual:` no existe para el proveedor.
      //
      // Sus mercados se quedarían en ESPERANDO_DATO hasta que la
      // anulación por falta de dato los devuelva a las 72 horas — y
      // cada anulación es comisión que no se cobra.
      //
      // Se marca así a propósito para poder listarlos y avisarlo.
      const apiId = d.apiId ?? `manual:${Date.now().toString(36)}`;

      try {
        const r = await c.query(
          `INSERT INTO partidos (api_id, deporte_id, liga_id, equipo_local,
                                 equipo_visitante, inicia_en, inicia_en_original)
           VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
          [apiId, liga.rows[0].deporte_id, d.ligaId,
           d.equipoLocal.trim(), d.equipoVisitante.trim(), inicia],
        );
        return r.rows[0].id as string;
      } catch (e) {
        if (e instanceof Error && e.message.includes('uq_partidos_api')) {
          throw Object.assign(new Error('duplicado'), {
            codigo: 'PARTIDO_YA_EXISTE',
            mensajeUsuario: 'Ya hay un partido con ese identificador.',
          });
        }
        // El índice natural atrapa el duplicado real: mismos equipos,
        // misma liga, misma hora. Es el que se dispara cuando no hay
        // identificador del proveedor.
        if (e instanceof Error && e.message.includes('uq_partido_natural')) {
          throw Object.assign(new Error('duplicado'), {
            codigo: 'PARTIDO_YA_EXISTE',
            mensajeUsuario:
              'Ese partido ya está cargado: mismos equipos, misma liga y misma hora.',
          });
        }
        throw e;
      }
    }, sesion.usuarioId);

    return respuesta.code(201).send({
      id,
      // El cliente necesita saberlo para avisarlo: sin identificador
      // del proveedor, nadie va a traer el resultado.
      sinProveedor: !d.apiId,
      aviso: d.apiId
        ? undefined
        : 'Sin identificador del proveedor, el resultado no llegará solo. Habrá que resolverlo a mano o las salas se anularán a las 72 horas.',
    });
  });

  app.post('/admin/deportes/sincronizar', {
    schema: {
      ...doc('Traer partidos ahora', 'deportes.gestionar',
        'Lo mismo que hace el sistema una vez al día, pero en el momento. Solo toca las ligas con mercados habilitados: las demás no consumen cuota.'),
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');

    const activas = await pool.query(
      `SELECT count(*)::int AS n FROM v_ligas_activas`,
    );
    if (activas.rows[0].n === 0) {
      throw Object.assign(new Error('sin ligas'), {
        codigo: 'ENTRADA_INVALIDA',
        mensajeUsuario:
          'Ninguna liga tiene mercados habilitados. Actívalos primero: solo esas se sincronizan.',
      });
    }

    // Se traduce a un mensaje legible: un fallo del proveedor no es
    // un fallo nuestro, y un 500 genérico no le dice a nadie qué
    // hacer.
    let r;
    try {
      r = await sincronizarFixtures(proveedor);
    } catch (e) {
      throw Object.assign(new Error('proveedor'), {
        codigo: 'PROVEEDOR_CAIDO',
        mensajeUsuario: e instanceof Error
          ? `El proveedor de datos no respondió: ${e.message}`
          : 'El proveedor de datos no respondió.',
      });
    }

    // Queda registrado: si alguien sincroniza a mano de más, se ve por
    // qué se agotaron las peticiones del día.
    //
    // Va a `incidentes` y no a `historial`: esa tabla solo admite
    // INSERT, UPDATE, BORRADO_LOGICO y RESTAURACION, y una
    // sincronización no es ninguna de esas.
    await pool.query(
      `INSERT INTO incidentes (tipo, severidad, usuario_id, detalle)
       VALUES ('SINCRONIZACION_MANUAL', 'BAJA', $1, $2)`,
      [
        sesion.usuarioId,
        JSON.stringify({
          resumen: `${r.nuevos} nuevo(s) en ${activas.rows[0].n} liga(s)`,
          ...r,
        }),
      ],
    );

    return {
      ...r,
      ligas: activas.rows[0].n,
      aviso: r.fallidos > 0
        ? `${r.fallidos} partido(s) fallaron. Revisa Incidentes.`
        : undefined,
    };
  });

  app.get('/admin/deportes/estado-proveedor', {
    schema: doc('Estado del proveedor', 'deportes.ver',
      'Si la clave sirve y cuántas peticiones quedan hoy. No consume cuota.'),
  }, async (peticion) => {
    await conPermiso(peticion, 'deportes.ver');

    const activas = await pool.query(
      `SELECT id, api_id, nombre, pais, tiene_estadisticas, mercados, partidos
         FROM v_ligas_activas ORDER BY nombre`,
    );
    const total = await pool.query(`SELECT count(*)::int AS n FROM v_ligas`);

    // El simulado no tiene `estado()`. Se comprueba en vez de asumir.
    const conEstado = proveedor as { nombre: string;
      estado?: () => Promise<{ ok: boolean; restantes: number | null; plan?: string }> };
    const estado = conEstado.estado
      ? await conEstado.estado()
      : { ok: true, restantes: null, plan: 'simulado' };

    return {
      proveedor: proveedor.nombre,
      ...estado,
      ligasEnCatalogo: total.rows[0].n,
      ligasActivas: activas.rows,
    };
  });

  app.get('/admin/partidos/sin-proveedor', {
    schema: doc('Partidos que no recibirán resultado', 'deportes.ver',
      'Cargados a mano sin identificador del proveedor. Sus mercados se anularán solos a las 72 horas si nadie los resuelve.'),
  }, async (peticion) => {
    await conPermiso(peticion, 'deportes.ver');
    const { rows } = await pool.query(
      `SELECT * FROM v_partidos_sin_proveedor ORDER BY inicia_en`,
    );
    return { partidos: rows };
  });

  app.delete('/admin/partidos/:id', {
    schema: {
      ...doc('Quitar un partido', 'deportes.gestionar',
        'No se puede si tiene salas abiertas: habría dinero comprometido sin partido que resolverlo.'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);

    await enTransaccion(async (c) => {
      const { rows } = await c.query(
        `SELECT count(*)::int AS n FROM v_salas
          WHERE partido_id = $1
            AND estado IN ('ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO')`,
        [id],
      );
      if (rows[0].n > 0) {
        throw Object.assign(new Error('salas'), {
          codigo: 'PARTIDO_EN_USO',
          mensajeUsuario: `Tiene ${rows[0].n} sala(s) activa(s). Anúlalas primero.`,
        });
      }
      await c.query(`UPDATE partidos SET eliminado_en = now() WHERE id = $1`, [id]);
    }, sesion.usuarioId);

    return { ok: true };
  });

  // ===================================================================
  //  Salas
  // ===================================================================

  app.get('/admin/salas', {
    schema: {
      ...doc('Salas del sistema', 'salas.ver'),
      querystring: {
        type: 'object',
        properties: {
          estado: { type: 'string' },
          limite: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'salas.ver');
    const q = z
      .object({
        estado: z.string().optional(),
        limite: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(peticion.query);

    const { rows } = await pool.query(
      `SELECT s.id, s.codigo, s.estado, s.pais, s.regresiva_termina_en,
              s.monto_minimo_centavos, s.motivo_anulacion, s.fecha_crea,
              p.equipo_local, p.equipo_visitante, p.inicia_en,
              p.estado AS estado_partido,
              u.alias AS anfitrion,
              pa.moneda, pa.simbolo,
              (SELECT count(DISTINCT po.usuario_id)
                 FROM v_posiciones po JOIN v_mercados m ON m.id = po.mercado_id
                WHERE m.sala_id = s.id)::int AS participantes,
              (SELECT COALESCE(SUM(po.monto_centavos), 0)
                 FROM v_posiciones po JOIN v_mercados m ON m.id = po.mercado_id
                WHERE m.sala_id = s.id)::bigint AS comprometido,
              (SELECT count(*) FROM v_mercados m WHERE m.sala_id = s.id)::int AS mercados,
              (SELECT count(*) FROM v_balance_mercados b
                WHERE b.sala_id = s.id AND NOT b.balanceado)::int AS sin_balancear
         FROM v_salas s
         JOIN v_partidos p ON p.id = s.partido_id
    LEFT JOIN v_usuarios u ON u.id = s.anfitrion_id
    LEFT JOIN paises_habilitados pa ON pa.codigo = s.pais
        -- El cast a text es obligatorio: s.estado es un tipo
        -- enumerado y PostgreSQL no lo compara con texto suelto.
        WHERE ($1::text IS NULL OR s.estado::text = $1)
        ORDER BY s.fecha_crea DESC
        LIMIT $2`,
      [q.estado ?? null, q.limite],
    );
    return { salas: rows };
  });

  app.get('/admin/salas/:id', {
    schema: {
      ...doc('Detalle de una sala', 'salas.ver',
        'Muestra quién apostó cuánto y de qué lado. Es lo que hace falta para atender un reclamo.'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'salas.ver');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);

    const [sala, mercados, movimientos] = await Promise.all([
      pool.query(
        `SELECT s.*, p.equipo_local, p.equipo_visitante, p.inicia_en,
                p.estado AS estado_partido, p.goles_local, p.goles_visitante,
                u.alias AS anfitrion
           FROM v_salas s
           JOIN v_partidos p ON p.id = s.partido_id
      LEFT JOIN v_usuarios u ON u.id = s.anfitrion_id
          WHERE s.id = $1`,
        [id],
      ),
      pool.query(
        `SELECT b.mercado_id, b.total_favor, b.total_contra, b.balanceado,
                m.tipo_mercado, m.linea, m.etiqueta_favor, m.etiqueta_contra,
                m.estado, m.lado_ganador, m.motivo_anulacion,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                            'alias', us.alias, 'lado', po.lado,
                            'monto', po.monto_centavos))
                     FROM v_posiciones po
                     JOIN v_usuarios us ON us.id = po.usuario_id
                    WHERE po.mercado_id = b.mercado_id),
                  '[]'::json) AS posiciones
           FROM v_balance_mercados b
           JOIN v_mercados m ON m.id = b.mercado_id
          WHERE b.sala_id = $1`,
        [id],
      ),
      pool.query(
        `SELECT tipo, monto_centavos, moneda, usuario_id, es_casa, fecha_crea
           FROM movimientos WHERE sala_id = $1 ORDER BY id`,
        [id],
      ),
    ]);

    if (sala.rows.length === 0) {
      throw Object.assign(new Error('no existe'), { codigo: 'SALA_NO_EXISTE' });
    }
    return {
      sala: sala.rows[0],
      mercados: mercados.rows,
      movimientos: movimientos.rows,
    };
  });

  app.post('/admin/salas/:id/cerrar', {
    schema: {
      ...doc('Forzar el cierre', 'salas.anular',
        'Los mercados balanceados quedan confirmados; los que no alcanzaron contraparte se anulan y devuelven el 100%.'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'salas.anular');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    return cerrarSala(id);
  });

  app.post('/admin/salas/:id/expirar', {
    schema: {
      ...doc('Expirar una sala vacía', 'salas.anular',
        'Para salas sin participantes suficientes. Devuelve todo lo retenido.'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'salas.anular');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    await expirarSala(id);
    return { ok: true };
  });

  app.post('/admin/salas/:id/anular', {
    schema: {
      ...doc('Anular una sala', 'salas.anular',
        'Devuelve el 100% a todos. La casa no cobra comisión: no hubo resultado.'),
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          motivo: {
            type: 'string',
            enum: ['PARTIDO_CANCELADO', 'PARTIDO_POSTERGADO', 'PARTIDO_ABANDONADO',
                   'DATO_NO_DISPONIBLE', 'ERROR_OPERATIVO'],
          },
        },
      },
    },
  }, async (peticion) => {
    await conPermiso(peticion, 'salas.anular');
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const { motivo } = z
      .object({
        motivo: z
          .enum(['PARTIDO_CANCELADO', 'PARTIDO_POSTERGADO', 'PARTIDO_ABANDONADO',
                 'DATO_NO_DISPONIBLE', 'ERROR_OPERATIVO'])
          .default('ERROR_OPERATIVO'),
      })
      .parse(peticion.body ?? {});

    const anulados = await anularPorMotivo(id, motivo);
    return { mercadosAnulados: anulados };
  });
}
