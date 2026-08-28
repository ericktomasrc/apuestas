/**
 * Rutas públicas de SALAS: lo que hace un usuario, no un administrador.
 *
 * Aquí vive la creación de salas. El anfitrión elige el partido y los
 * mercados, pero **no elige su ventaja**: la cuota siempre es la misma
 * para los dos lados y la línea siempre termina en `.5`. Lo único que
 * decide es sobre qué se apuesta.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';

import { pool, enTransaccion } from '../infraestructura/db.js';
import { ESQUEMA_ERROR } from './docs.js';
import { config, apostar } from '../servicios/salas.servicio.js';
import { paisDeUsuario, formatear } from '../servicios/paises.servicio.js';
import { exigirQueNoSeaPersonal } from '../servicios/seguridad.servicio.js';
import {
  ProveedorSimulado,
  type ProveedorDeportes,
} from '../infraestructura/proveedores/deportes.proveedor.js';
import type { Sesion } from './auth.js';

type ExigirSesion = (peticion: FastifyRequest) => Promise<Sesion>;

/**
 * Etiquetas de cada mercado.
 *
 * Viven aquí y no en la base porque son la mitad de la regla: cambiar
 * "Más de 2.5 goles" por otra cosa sin cambiar `resolverMercado` haría
 * que la sala pague al revés.
 */
const MERCADOS: Record<string, {
  nombre: string;
  linea: boolean;
  equipo: boolean;
  etiquetas: (linea: number | null, equipo: string | null) => [string, string];
}> = {
  TOTAL_GOLES: {
    nombre: 'Total de goles', linea: true, equipo: false,
    etiquetas: (l) => [`Más de ${l} goles`, `Menos de ${l} goles`],
  },
  TOTAL_CORNERS: {
    nombre: 'Total de córners', linea: true, equipo: false,
    etiquetas: (l) => [`Más de ${l} córners`, `Menos de ${l} córners`],
  },
  TOTAL_TARJETAS: {
    nombre: 'Total de tarjetas', linea: true, equipo: false,
    etiquetas: (l) => [`Más de ${l} tarjetas`, `Menos de ${l} tarjetas`],
  },
  AMBOS_ANOTAN: {
    nombre: 'Ambos anotan', linea: false, equipo: false,
    etiquetas: () => ['Ambos anotan', 'No anotan ambos'],
  },
  DOBLE_OPORTUNIDAD: {
    nombre: 'Quién gana', linea: false, equipo: true,
    etiquetas: (_l, e) => [`Gana ${e}`, `No gana ${e}`],
  },
  TOTAL_PUNTOS: {
    nombre: 'Total de puntos', linea: true, equipo: false,
    etiquetas: (l) => [`Más de ${l} puntos`, `Menos de ${l} puntos`],
  },
  GANADOR_DIRECTO: {
    nombre: 'Quién gana', linea: false, equipo: true,
    etiquetas: (_l, e) => [`Gana ${e}`, `No gana ${e}`],
  },
};

/** Código corto y legible: se dicta por teléfono y se manda por chat. */
function codigoSala(): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sin I ni O: se confunden con 1 y 0
  const n = randomBytes(3);
  return (
    letras[n[0] % letras.length] +
    letras[n[1] % letras.length] +
    String(n[2] % 100).padStart(2, '0')
  );
}

export function registrarRutasSalas(
  app: FastifyInstance,
  exigirSesion: ExigirSesion,
  proveedor: ProveedorDeportes = new ProveedorSimulado(),
): void {
  // ===================================================================
  //  Partidos sobre los que se puede apostar
  // ===================================================================

  app.get('/partidos', {
    schema: {
      tags: ['salas'],
      summary: 'Partidos disponibles',
      description:
        'Solo los que empiezan con margen suficiente y cuya liga tiene mercados habilitados. Un partido sin mercados no sirve: no habría sobre qué apostar.',
      querystring: {
        type: 'object',
        properties: {
          deporte: { type: 'string' },
          limite: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      },
    },
  }, async (peticion) => {
    const q = z
      .object({
        deporte: z.string().optional(),
        limite: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(peticion.query);

    const cfg = await config();

    const { rows } = await pool.query(
      `SELECT p.id, p.equipo_local, p.equipo_visitante, p.inicia_en,
              p.logo_local, p.logo_visitante,
              l.nombre AS liga, d.clave AS deporte, d.nombre AS deporte_nombre,
              COALESCE(array_agg(ml.tipo_mercado ORDER BY ml.tipo_mercado)
                       FILTER (WHERE ml.tipo_mercado IS NOT NULL), '{}') AS mercados,
              (SELECT count(*) FROM v_salas s
                WHERE s.partido_id = p.id
                  AND s.estado IN ('ABIERTA','CUENTA_REGRESIVA'))::int AS salas_abiertas
         FROM v_partidos p
         JOIN v_ligas l    ON l.id = p.liga_id
         JOIN v_deportes d ON d.id = p.deporte_id
         JOIN mercados_por_liga ml
              ON ml.liga_id = l.id AND ml.eliminado_en IS NULL
        WHERE p.estado = 'PROGRAMADO'
          AND p.inicia_en > now() + make_interval(mins => $1)
          AND ($2::text IS NULL OR d.clave = $2)
        GROUP BY p.id, p.equipo_local, p.equipo_visitante, p.inicia_en,
              p.logo_local, p.logo_visitante,
                 l.nombre, d.clave, d.nombre
        ORDER BY p.inicia_en ASC
        LIMIT $3`,
      [cfg.minutosCierreAntes, q.deporte ?? null, q.limite],
    );

    return {
      partidos: rows.map((p) => ({
        ...p,
        // Se manda el catálogo resuelto para que la app no tenga que
        // saber armar las etiquetas: si difirieran, la sala mostraría
        // una cosa y pagaría otra.
        mercados: (p.mercados as string[]).map((tipo) => ({
          tipo,
          nombre: MERCADOS[tipo]?.nombre ?? tipo,
          necesitaLinea: MERCADOS[tipo]?.linea ?? false,
          necesitaEquipo: MERCADOS[tipo]?.equipo ?? false,
        })),
      })),
    };
  });

  // ===================================================================
  //  Crear una sala
  // ===================================================================

  app.post('/salas', {
    schema: {
      tags: ['salas'],
      summary: 'Crear una sala',
      description: [
        'El anfitrión elige el partido, los mercados y el mínimo por persona.',
        '',
        'Lo que **no** elige: la cuota (siempre 2.0 para los dos lados) ni un lado con ventaja. Las líneas terminan siempre en `.5` para que nunca haya empate.',
        '',
        'Crear una sala no compromete dinero. Se aposta después, como todos.',
      ].join('\n'),
      security: [{ bearer: [] }],
      body: {
        type: 'object',
        properties: {
          partidoId: { type: 'string', format: 'uuid' },
          descripcion: { type: 'string', maxLength: 140 },
          topeParticipantes: { type: 'integer', minimum: 2, maximum: 20 },
          montoMinimoCentavos: { type: 'integer', minimum: 1 },
          mercados: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                tipo: { type: 'string' },
                linea: { type: 'number' },
                equipo: { type: 'string' },
              },
              required: ['tipo'],
            },
          },
        },
        required: ['partidoId', 'topeParticipantes', 'montoMinimoCentavos', 'mercados'],
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            codigo: { type: 'string', description: 'Corto, para compartir por chat' },
          },
        },
        400: ESQUEMA_ERROR, 401: ESQUEMA_ERROR, 403: ESQUEMA_ERROR, 409: ESQUEMA_ERROR,
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion);
    const d = z
      .object({
        partidoId: z.string().uuid(),
        descripcion: z.string().max(140).optional(),
        topeParticipantes: z.number().int().min(2).max(20),
        montoMinimoCentavos: z.number().int().positive(),
        mercados: z
          .array(z.object({
            tipo: z.string(),
            linea: z.number().optional(),
            equipo: z.string().max(60).optional(),
          }))
          .min(1),
      })
      .parse(peticion.body);

    // Quien puede anular una sala no puede crear ni entrar en ellas.
    await exigirQueNoSeaPersonal(sesion.usuarioId);

    const pais = await paisDeUsuario(sesion.usuarioId);
    const cfg = await config();

    if (d.mercados.length > cfg.maxMercadosPorSala) {
      throw Object.assign(new Error('mercados'), {
        codigo: 'MONTO_FUERA_DE_RANGO',
        mensajeUsuario: `Máximo ${cfg.maxMercadosPorSala} apuestas por sala.`,
      });
    }
    if (d.montoMinimoCentavos < pais.minimoApuesta) {
      throw Object.assign(new Error('minimo'), {
        codigo: 'MONTO_FUERA_DE_RANGO',
        mensajeUsuario: `La apuesta más baja permitida es ${formatear(pais.minimoApuesta, pais)}.`,
      });
    }

    const resultado = await enTransaccion(async (c) => {
      const partido = await c.query(
        `SELECT p.id, p.equipo_local, p.equipo_visitante, p.inicia_en,
              p.logo_local, p.logo_visitante, p.liga_id
           FROM v_partidos p
          WHERE p.id = $1 AND p.estado = 'PROGRAMADO'`,
        [d.partidoId],
      );
      if (partido.rows.length === 0) {
        throw Object.assign(new Error('partido'), {
          codigo: 'MERCADO_NO_EXISTE',
          mensajeUsuario: 'Ese partido ya no está disponible.',
        });
      }

      const faltan =
        (new Date(partido.rows[0].inicia_en).getTime() - Date.now()) / 60000;
      if (faltan < cfg.minutosCierreAntes) {
        throw Object.assign(new Error('tarde'), {
          codigo: 'CIERRE_INMINENTE',
          mensajeUsuario: 'Ese partido empieza muy pronto para abrir una sala.',
        });
      }

      // Cuántas salas tiene activas: el tope evita que alguien empapele
      // el muro con salas que no piensa llenar.
      const activas = await c.query(
        `SELECT count(*)::int AS n FROM v_salas
          WHERE anfitrion_id = $1
            AND estado IN ('ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO')`,
        [sesion.usuarioId],
      );
      if (activas.rows[0].n >= cfg.maxSalasSimultaneas) {
        throw Object.assign(new Error('limite'), {
          codigo: 'LIMITE_SALAS',
          mensajeUsuario: `Ya tienes ${cfg.maxSalasSimultaneas} salas abiertas. Espera a que alguna se resuelva.`,
        });
      }

      // Solo mercados habilitados para ESA liga: el proveedor no
      // entrega el dato en todas, y una sala sin dato nunca se liquida.
      const habilitados = await c.query(
        `SELECT tipo_mercado FROM mercados_por_liga
          WHERE liga_id = $1 AND eliminado_en IS NULL`,
        [partido.rows[0].liga_id],
      );
      const permitidos = new Set(habilitados.rows.map((r) => r.tipo_mercado));

      const codigo = codigoSala();
      const sala = await c.query(
        `INSERT INTO salas (codigo, partido_id, anfitrion_id, tope_participantes,
                            monto_minimo_centavos, descripcion, pais)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [codigo, d.partidoId, sesion.usuarioId, d.topeParticipantes,
         d.montoMinimoCentavos, d.descripcion ?? null, pais.codigo],
      );

      for (const m of d.mercados) {
        const def = MERCADOS[m.tipo];
        if (!def || !permitidos.has(m.tipo)) {
          throw Object.assign(new Error('mercado'), {
            codigo: 'MERCADO_NO_EXISTE',
            mensajeUsuario: `«${m.tipo}» no está disponible en esta liga.`,
          });
        }

        // La línea SIEMPRE en .5. Con una línea entera el marcador
        // podría caer justo encima y nadie ganaría.
        if (def.linea) {
          if (m.linea === undefined || m.linea === Math.floor(m.linea)) {
            throw Object.assign(new Error('linea'), {
              codigo: 'MONTO_FUERA_DE_RANGO',
              mensajeUsuario: 'La línea tiene que terminar en .5 para que no haya empate.',
            });
          }
        }

        const equipo = def.equipo
          ? (m.equipo === partido.rows[0].equipo_visitante
              ? partido.rows[0].equipo_visitante
              : partido.rows[0].equipo_local)
          : null;

        const [favor, contra] = def.etiquetas(m.linea ?? null, equipo);

        await c.query(
          `INSERT INTO mercados (sala_id, tipo_mercado, linea, equipo_referencia,
                                 etiqueta_favor, etiqueta_contra)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [sala.rows[0].id, m.tipo, def.linea ? m.linea : null, equipo, favor, contra],
        );
      }

      // Se publica en el muro de actividad. Es como se llenan las
      // salas: alguien ve que se abrió una de un partido que le
      // interesa y entra.
      await c.query(
        `INSERT INTO publicaciones (tipo, usuario_id, sala_id, datos)
         VALUES ('SALA_CREADA', $1, $2, $3)`,
        [sesion.usuarioId, sala.rows[0].id, JSON.stringify({
          codigo,
          local: partido.rows[0].equipo_local,
          visitante: partido.rows[0].equipo_visitante,
          mercados: d.mercados.length,
        })],
      );

      return { id: sala.rows[0].id as string, codigo };
    }, sesion.usuarioId);

    return respuesta.code(201).send(resultado);
  });

  // ===================================================================
  //  Salir de una sala entera
  // ===================================================================

  app.post('/salas/:id/salir', {
    schema: {
      tags: ['salas'],
      summary: 'Salir de todas mis apuestas de esta sala',
      description:
        'Devuelve el dinero **sin ningún cargo**. Solo mientras falten más de unos minutos para el partido: después nadie puede escaparse al ver la alineación.',
      security: [{ bearer: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: {
        200: { type: 'object', additionalProperties: true },
        401: ESQUEMA_ERROR, 409: ESQUEMA_ERROR,
      },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const { retirarse } = await import('../servicios/salas.servicio.js');

    const { rows } = await pool.query(
      `SELECT po.mercado_id FROM v_posiciones po
         JOIN v_mercados m ON m.id = po.mercado_id
        WHERE m.sala_id = $1 AND po.usuario_id = $2`,
      [id, sesion.usuarioId],
    );

    for (const r of rows) {
      await retirarse(sesion.usuarioId, r.mercado_id);
    }
    return { mercadosLiberados: rows.length };
  });

  app.get('/partidos/:id/contexto', {
    schema: {
      tags: ['salas'],
      summary: 'Cómo llegan los dos equipos',
      description: [
        'Forma reciente, goles y enfrentamientos directos.',
        '',
        '⚠️ Devuelve **datos, nunca una probabilidad**. Un porcentaje con todo pagando 2.0x diría que un lado es matemáticamente mejor, y entonces nadie tomaría el otro: las salas dejarían de llenarse. El producto depende de que la gente no esté de acuerdo.',
      ].join('\n'),
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (peticion) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);

    const { rows } = await pool.query(
      `SELECT api_id, equipo_local, equipo_visitante FROM v_partidos WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('no existe'), { codigo: 'MERCADO_NO_EXISTE' });
    }

    // Si el proveedor no da contexto, se devuelve null y la interfaz
    // simplemente no muestra el bloque. Es preferible a inventar.
    const contexto = proveedor.contexto
      ? await proveedor.contexto(rows[0].api_id).catch(() => null)
      : null;

    return {
      local: rows[0].equipo_local,
      visitante: rows[0].equipo_visitante,
      contexto,
    };
  });

  // ===================================================================
  //  Muro de actividad
  // ===================================================================

  app.get('/actividad', {
    schema: {
      tags: ['salas'],
      summary: 'Qué está pasando',
      description: [
        'Salas que se abrieron, salas que se llenaron, quién ganó.',
        '',
        '**Las derrotas no se publican.** Exponer las pérdidas de alguien es humillante y lo empuja a irse. Hay un `CHECK` en la tabla que impide siquiera insertarlas.',
      ].join('\n'),
    },
  }, async (peticion) => {
    const q = z
      .object({ limite: z.coerce.number().int().min(1).max(50).default(25) })
      .parse(peticion.query);

    const { rows } = await pool.query(
      `SELECT p.id, p.tipo, p.datos, p.fecha_crea,
              u.alias, s.id AS sala_id, s.estado AS estado_sala,
              pa.equipo_local, pa.equipo_visitante, pa.inicia_en,
              l.nombre AS liga
         FROM v_publicaciones p
    LEFT JOIN v_usuarios u  ON u.id = p.usuario_id
    LEFT JOIN v_salas s     ON s.id = p.sala_id
    LEFT JOIN v_partidos pa ON pa.id = s.partido_id
    LEFT JOIN v_ligas l     ON l.id = pa.liga_id
        ORDER BY p.fecha_crea DESC
        LIMIT $1`,
      [q.limite],
    );
    return { actividad: rows };
  });

  app.get('/ligas', {
    schema: {
      tags: ['salas'],
      summary: 'Ligas con partidos disponibles',
      description:
        'Solo las que tienen mercados habilitados y partidos por jugarse. Una liga sin mercados no sirve: no habría sobre qué apostar.',
    },
  }, async () => {
    const cfg = await config();
    const { rows } = await pool.query(
      `SELECT l.id, l.nombre, l.pais, d.nombre AS deporte, d.clave AS deporte_clave,
              count(DISTINCT p.id)::int AS partidos,
              count(DISTINCT s.id) FILTER (
                WHERE s.estado IN ('ABIERTA','CUENTA_REGRESIVA'))::int AS salas_abiertas
         FROM v_ligas l
         JOIN v_deportes d ON d.id = l.deporte_id
         JOIN mercados_por_liga ml
              ON ml.liga_id = l.id AND ml.eliminado_en IS NULL
    LEFT JOIN v_partidos p ON p.liga_id = l.id
              AND p.estado = 'PROGRAMADO'
              AND p.inicia_en > now() + make_interval(mins => $1)
    LEFT JOIN v_salas s ON s.partido_id = p.id
        GROUP BY l.id, l.nombre, l.pais, d.nombre, d.clave
       HAVING count(DISTINCT p.id) > 0
        ORDER BY count(DISTINCT s.id) DESC, l.nombre`,
      [cfg.minutosCierreAntes],
    );
    return { ligas: rows };
  });

  // ===================================================================
  //  Catálogo de mercados, para la pantalla de creación
  // ===================================================================

  app.get('/mercados/catalogo', {
    schema: {
      tags: ['salas'],
      summary: 'Tipos de apuesta y cómo se llaman',
      description:
        'Las etiquetas salen del servidor a propósito: si la app las armara por su cuenta y difirieran, la sala mostraría una cosa y pagaría otra.',
    },
  }, async () => ({
    mercados: Object.entries(MERCADOS).map(([tipo, def]) => ({
      tipo,
      nombre: def.nombre,
      necesitaLinea: def.linea,
      necesitaEquipo: def.equipo,
      ejemplo: def.etiquetas(2.5, 'Botafogo'),
    })),
  }));
}
