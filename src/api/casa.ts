/**
 * Rutas del MODO CASA.
 *
 * Dos grupos separados a propósito:
 *
 *   - Públicas: crear una casa, apostar contra ella, mirarla. Las usa
 *     cualquier usuario.
 *
 *   - Administración: financiar la casa oficial, encenderla, apagarla
 *     y exportar el libro. Exigen permiso.
 *
 * Hay además rutas de **transparencia** que no piden sesión: todo lo
 * que hace la casa de la plataforma es público. Es lo único que
 * permite responder «está arreglado» con datos.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { pool, enTransaccion } from '../infraestructura/db.js';
import { ESQUEMA_ERROR } from './docs.js';
import {
  crearCasa, apostarContraCasa, anularCasa, casaConDetalle,
  casasAbiertas, anotarEnLibro, config as configCasa,
  invalidarConfigCasa, exigirCasaDisponible,
} from '../servicios/casa.servicio.js';
import { previsualizarContraCasa } from '../dominio/casa.js';
import { paisDeUsuario } from '../servicios/paises.servicio.js';
import { insertarMovimiento } from '../servicios/ledger.servicio.js';
import { ipDe } from '../servicios/ubicacion.servicio.js';
import type { Sesion } from './auth.js';

type ExigirSesion = (peticion: FastifyRequest) => Promise<Sesion>;
type SesionOpcional = (peticion: FastifyRequest) => Promise<Sesion | null>;
type ConPermiso = (peticion: FastifyRequest, permiso: string) => Promise<Sesion>;

export function registrarRutasCasa(
  app: FastifyInstance,
  exigirSesion: ExigirSesion,
  sesionOpcional: SesionOpcional,
  conPermiso: ConPermiso,
  doc: (summary: string, permiso: string, description?: string) => object,
): void {
  // ===================================================================
  //  Públicas
  // ===================================================================

  app.get('/casas', {
    schema: {
      tags: ['casa'],
      summary: 'Casas abiertas',
      description:
        'Alguien pone dinero por adelantado y ofrece varias opciones. Tú eliges una y apuestas contra ella. Todo paga 1 a 1.',
    },
  }, async (peticion) => {
    // Ocultar el menú no basta: quien tenga la URL entra igual.
    await exigirCasaDisponible();
    const sesion = await sesionOpcional(peticion);
    const pais = sesion ? (await paisDeUsuario(sesion.usuarioId)).codigo : 'PE';
    return { casas: await casasAbiertas(pais) };
  });

  app.get('/casas/:id', {
    schema: {
      tags: ['casa'],
      summary: 'Detalle de una casa',
      description:
        'Incluye quién apostó a cada opción y cuánto cupo queda. Las posiciones son públicas: es lo que permite verificar que no hay trato preferente.',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: { 404: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    await exigirCasaDisponible();
    const sesion = await sesionOpcional(peticion);
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    return casaConDetalle(id, sesion?.usuarioId ?? null);
  });

  app.post('/casas', {
    schema: {
      tags: ['casa'],
      summary: 'Crear una casa',
      description: [
        'Eliges el partido, armas las opciones y asignas presupuesto a cada una.',
        '',
        'El dinero **se retiene al publicar**: ofrecer S/500 en una opción sin tenerlos sería prometer lo que no se tiene.',
        '',
        'Lo que nadie tome vuelve entero al liquidar, sin haber corrido riesgo.',
      ].join('\n'),
      security: [{ bearer: [] }],
      body: {
        type: 'object',
        properties: {
          partidoId: { type: 'string', format: 'uuid' },
          descripcion: { type: 'string', maxLength: 140 },
          opciones: {
            type: 'array',
            minItems: 2,
            items: {
              type: 'object',
              properties: {
                tipoMercado: { type: 'string' },
                linea: { type: 'number' },
                equipo: { type: 'string' },
                etiqueta: { type: 'string', minLength: 3, maxLength: 80 },
                presupuestoCentavos: { type: 'integer', minimum: 1 },
              },
              required: ['tipoMercado', 'etiqueta', 'presupuestoCentavos'],
            },
          },
        },
        required: ['partidoId', 'opciones'],
      },
      response: {
        201: { type: 'object', additionalProperties: true },
        400: ESQUEMA_ERROR, 401: ESQUEMA_ERROR, 402: ESQUEMA_ERROR, 403: ESQUEMA_ERROR,
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion);
    const d = z
      .object({
        partidoId: z.string().uuid(),
        descripcion: z.string().max(140).optional(),
        opciones: z
          .array(z.object({
            tipoMercado: z.string(),
            linea: z.number().optional(),
            equipo: z.string().max(60).optional(),
            etiqueta: z.string().min(3).max(80),
            presupuestoCentavos: z.number().int().positive(),
          }))
          .min(2),
      })
      .parse(peticion.body);

    const r = await crearCasa(sesion.usuarioId, {
      partidoId: d.partidoId,
      descripcion: d.descripcion,
      opciones: d.opciones.map((o) => ({
        tipoMercado: o.tipoMercado,
        linea: o.linea ?? null,
        equipo: o.equipo ?? null,
        etiqueta: o.etiqueta,
        presupuestoCentavos: o.presupuestoCentavos,
      })),
    });
    return respuesta.code(201).send(r);
  });

  app.post('/casas/opciones/:id/apostar', {
    schema: {
      tags: ['casa'],
      summary: 'Apostar contra una opción',
      description:
        'Solo se acepta lo que quepa en el cupo restante. Si pides más, se rechaza en el momento en vez de aceptarlo y devolverlo al liquidar.',
      security: [{ bearer: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      headers: {
        type: 'object',
        properties: {
          'idempotency-key': {
            type: 'string',
            minLength: 8,
            description: 'La genera el cliente. Reintentar con la misma no cobra dos veces.',
          },
        },
        required: ['idempotency-key'],
      },
      body: {
        type: 'object',
        properties: { montoCentavos: { type: 'integer', minimum: 1 } },
        required: ['montoCentavos'],
      },
      response: {
        201: { type: 'object', additionalProperties: true },
        400: ESQUEMA_ERROR, 401: ESQUEMA_ERROR, 402: ESQUEMA_ERROR, 409: ESQUEMA_ERROR,
      },
    },
  }, async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion);
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const { montoCentavos } = z
      .object({ montoCentavos: z.number().int().positive() })
      .parse(peticion.body);
    const clave = String(peticion.headers['idempotency-key']);

    const r = await apostarContraCasa(sesion.usuarioId, id, montoCentavos, clave);
    return respuesta.code(201).send(r);
  });

  app.get('/casas/opciones/:id/previsualizar', {
    schema: {
      tags: ['casa'],
      summary: 'Qué pasa si apuesto X',
      description:
        'El desglose se muestra ANTES de confirmar. Enterarse de la comisión después de ganar es la forma más rápida de perder a alguien.',
      security: [{ bearer: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: { monto: { type: 'integer', minimum: 1 } },
        required: ['monto'],
      },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const { monto } = z
      .object({ monto: z.coerce.number().int().positive() })
      .parse(peticion.query);

    const { rows } = await pool.query(
      `SELECT cu.disponible_centavos, t.tasa_comision AS tasa
         FROM v_cupos_casa cu
         CROSS JOIN v_tasa_usuario t
        WHERE cu.opcion_id = $1 AND t.usuario_id = $2`,
      [id, sesion.usuarioId],
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('no existe'), { codigo: 'MERCADO_NO_EXISTE' });
    }

    return previsualizarContraCasa(
      monto,
      Number(rows[0].disponible_centavos),
      Number(rows[0].tasa),
    );
  });

  app.post('/casas/:id/anular', {
    schema: {
      tags: ['casa'],
      summary: 'Anular mi casa',
      description:
        'Devuelve el 100% a todos, incluido el operador. **Sin comisión**: no hubo resultado que cobrar.',
      security: [{ bearer: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: { motivo: { type: 'string', minLength: 5, maxLength: 200 } },
        required: ['motivo'],
      },
      response: { 200: { type: 'object', additionalProperties: true }, 403: ESQUEMA_ERROR },
    },
  }, async (peticion) => {
    const sesion = await exigirSesion(peticion);
    const { id } = z.object({ id: z.string().uuid() }).parse(peticion.params);
    const { motivo } = z
      .object({ motivo: z.string().min(5).max(200) })
      .parse(peticion.body);

    const { rows } = await pool.query(
      `SELECT operador_id, es_oficial FROM v_casas WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('no existe'), { codigo: 'SALA_NO_EXISTE' });
    }
    if (rows[0].operador_id !== sesion.usuarioId) {
      throw Object.assign(new Error('ajena'), {
        codigo: 'NO_ES_ANFITRION',
        mensajeUsuario: 'Solo quien la creó puede anularla.',
      });
    }
    // La casa oficial NO puede anular sus propias casas.
    //
    // Si pudiera, podría retirarse al ver que va perdiendo — que es
    // exactamente la sospecha que este módulo intenta desactivar.
    if (rows[0].es_oficial) {
      throw Object.assign(new Error('oficial'), {
        codigo: 'CASA_OFICIAL_NO_ANULA',
        mensajeUsuario:
          'La casa de la plataforma no puede anular sus propias casas. Corre hasta el final, gane o pierda.',
      });
    }

    return anularCasa(id, motivo);
  });

  // ===================================================================
  //  Transparencia — sin sesión, a propósito
  // ===================================================================

  app.get('/transparencia/casa', {
    schema: {
      tags: ['casa'],
      summary: 'Qué hizo la casa de la plataforma',
      description: [
        'Público y sin sesión. Cada casa que operó la plataforma, con su resultado.',
        '',
        'Existe porque el problema es asimétrico: cuando la casa pierde nadie dice nada, y cuando gana varias veces seguidas alguien va a decir que está arreglado. Esto permite responder con datos.',
      ].join('\n'),
    },
  }, async () => {
    const [balance, casas, cuentas] = await Promise.all([
      pool.query(`SELECT * FROM v_balance_casa_oficial`),
      pool.query(`SELECT * FROM v_casa_oficial_publico LIMIT 100`),
      // Sin correo: esta ruta es pública y el correo es dato personal.
      // Para identificar la cuenta al financiarla, el panel usa
      // /admin/casa, que sí exige permiso.
      pool.query(`SELECT alias, es_casa_oficial, financiada_por_plataforma,
                         nota_transparencia, fecha_crea
                    FROM v_cuentas_declaradas`),
    ]);

    return {
      balance: balance.rows[0],
      casas: casas.rows,
      // Que esta lista exista y esté completa es lo que hace creíble
      // al resto. Una cuenta financiada sin declarar la invalida toda.
      cuentasDeclaradas: cuentas.rows,
      nota: 'Todas las cuentas financiadas por la plataforma están declaradas aquí.',
    };
  });

  // ===================================================================
  //  Administración
  // ===================================================================

  app.get('/admin/casa', {
    schema: doc('Estado de la casa oficial', 'casa.ver'),
  }, async (peticion) => {
    await conPermiso(peticion, 'casa.ver');

    const [cfg, balance, saldo, libro, abiertas] = await Promise.all([
      configCasa(),
      pool.query(`SELECT * FROM v_balance_casa_oficial`),
      // Todas las cuentas declaradas, con correo.
      //
      // El alias no basta para identificar a alguien al acreditarle
      // dinero: dos personas pueden elegir nombres parecidos, y aquí
      // se mueve capital real.
      pool.query(
        `SELECT u.id, u.alias, u.email,
                u.es_casa_oficial, u.financiada_por_plataforma,
                u.nota_transparencia,
                COALESCE(s.disponible_centavos, 0) AS disponible_centavos,
                COALESCE(s.retenido_centavos, 0)   AS retenido_centavos,
                s.moneda, s.simbolo, s.decimales
           FROM v_usuarios u
      LEFT JOIN v_saldos s ON s.usuario_id = u.id
          WHERE u.es_casa_oficial OR u.financiada_por_plataforma
          ORDER BY u.es_casa_oficial DESC, u.alias`,
      ),
      pool.query(
        `SELECT l.*, u.alias, a.alias AS autorizo
           FROM libro_casa l
      LEFT JOIN v_usuarios u ON u.id = l.usuario_id
      LEFT JOIN v_usuarios a ON a.id = l.autorizado_por
          ORDER BY l.momento DESC LIMIT 60`,
      ),
      pool.query(
        `SELECT count(*)::int AS n FROM v_casas
          WHERE es_oficial AND estado IN ('ABIERTA','CERRADA')`,
      ),
    ]);

    return {
      config: cfg,
      balance: balance.rows[0],
      cuentas: saldo.rows,
      abiertas: abiertas.rows[0].n,
      libro: libro.rows,
    };
  });

  app.post('/admin/casa/financiar', {
    schema: {
      ...doc('Financiar la casa oficial', 'casa.gestionar',
        'Acredita saldo a la cuenta de la casa. Queda en el libro con su motivo: un auditor pregunta por qué, no solo cuánto.'),
      body: {
        type: 'object',
        properties: {
          usuarioId: { type: 'string', format: 'uuid' },
          montoCentavos: { type: 'integer', minimum: 1 },
          motivo: { type: 'string', minLength: 5, maxLength: 200 },
          confirmarPassword: { type: 'string' },
          confirmarCodigo: { type: 'string' },
        },
        required: ['usuarioId', 'montoCentavos', 'motivo'],
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'casa.gestionar');
    const d = z
      .object({
        usuarioId: z.string().uuid(),
        montoCentavos: z.number().int().positive(),
        motivo: z.string().min(5).max(200),
        confirmarPassword: z.string().optional(),
        confirmarCodigo: z.string().optional(),
      })
      .parse(peticion.body);

    const pais = await paisDeUsuario(d.usuarioId);
    const ip = ipDe(peticion.headers, peticion.ip, process.env.CONFIAR_EN_PROXY === 'true');

    await enTransaccion(async (c) => {
      const { rows } = await c.query(
        `SELECT es_casa_oficial, financiada_por_plataforma
           FROM v_usuarios WHERE id = $1`,
        [d.usuarioId],
      );
      if (rows.length === 0) {
        throw Object.assign(new Error('no existe'), { codigo: 'USUARIO_NO_EXISTE' });
      }
      // Financiar una cuenta sin declararla es la casa disfrazada.
      if (!rows[0].es_casa_oficial && !rows[0].financiada_por_plataforma) {
        throw Object.assign(new Error('sin declarar'), {
          codigo: 'CUENTA_NO_DECLARADA',
          mensajeUsuario:
            'Esa cuenta no está declarada como financiada por la plataforma. Márcala primero: es lo primero que audita un regulador.',
        });
      }

      await insertarMovimiento(c, {
        usuarioId: d.usuarioId,
        tipo: 'DEPOSITO',
        montoCentavos: d.montoCentavos,
        claveIdempotencia: `financiar:${Date.now()}:${d.usuarioId}`,
        motivo: d.motivo,
        operadorId: sesion.usuarioId,
      });

      await anotarEnLibro({
        tipo: 'FINANCIAMIENTO',
        usuarioId: d.usuarioId,
        montoCentavos: d.montoCentavos,
        moneda: pais.moneda,
        motivo: d.motivo,
        autorizadoPor: sesion.usuarioId,
        ip,
      }, c);
    }, sesion.usuarioId);

    return { ok: true };
  });

  app.post('/admin/casa/interruptor', {
    schema: {
      ...doc('Encender o apagar la casa oficial', 'casa.gestionar',
        'Apagarla es el interruptor para retirarse cuando ya haya usuarios suficientes. Las casas abiertas siguen su curso: apagar no anula lo que ya está corriendo.'),
      body: {
        type: 'object',
        properties: {
          activa: { type: 'boolean' },
          motivo: { type: 'string', minLength: 5, maxLength: 200 },
          confirmarPassword: { type: 'string' },
          confirmarCodigo: { type: 'string' },
        },
        required: ['activa', 'motivo'],
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'casa.gestionar');
    const d = z
      .object({
        activa: z.boolean(),
        motivo: z.string().min(5).max(200),
        confirmarPassword: z.string().optional(),
        confirmarCodigo: z.string().optional(),
      })
      .parse(peticion.body);

    const ip = ipDe(peticion.headers, peticion.ip, process.env.CONFIAR_EN_PROXY === 'true');

    await enTransaccion(async (c) => {
      await c.query(
        `UPDATE configuracion SET valor = $1 WHERE clave = 'casa_oficial_activa'`,
        [String(d.activa)],
      );
      await anotarEnLibro({
        tipo: d.activa ? 'CASA_ACTIVADA' : 'CASA_DESACTIVADA',
        motivo: d.motivo,
        autorizadoPor: sesion.usuarioId,
        ip,
      }, c);
    }, sesion.usuarioId);

    invalidarConfigCasa();
    return { activa: d.activa };
  });

  app.post('/admin/casa/declarar', {
    schema: {
      ...doc('Declarar una cuenta como financiada', 'casa.gestionar',
        'Una cuenta financiada por la plataforma que NO se declara es la casa disfrazada, y anula la credibilidad de todo el registro.'),
      body: {
        type: 'object',
        properties: {
          usuarioId: { type: 'string', format: 'uuid' },
          esCasaOficial: { type: 'boolean' },
          financiada: { type: 'boolean' },
          nota: { type: 'string', maxLength: 200 },
          motivo: { type: 'string', minLength: 5, maxLength: 200 },
          confirmarPassword: { type: 'string' },
          confirmarCodigo: { type: 'string' },
        },
        required: ['usuarioId', 'motivo'],
      },
    },
  }, async (peticion) => {
    const sesion = await conPermiso(peticion, 'casa.gestionar');
    const d = z
      .object({
        usuarioId: z.string().uuid(),
        esCasaOficial: z.boolean().default(false),
        financiada: z.boolean().default(false),
        nota: z.string().max(200).optional(),
        motivo: z.string().min(5).max(200),
        confirmarPassword: z.string().optional(),
        confirmarCodigo: z.string().optional(),
      })
      .parse(peticion.body);

    const ip = ipDe(peticion.headers, peticion.ip, process.env.CONFIAR_EN_PROXY === 'true');

    await enTransaccion(async (c) => {
      await c.query(
        `UPDATE usuarios
            SET es_casa_oficial = $2,
                financiada_por_plataforma = $3,
                nota_transparencia = $4
          WHERE id = $1`,
        [d.usuarioId, d.esCasaOficial, d.financiada || d.esCasaOficial, d.nota ?? null],
      );
      await anotarEnLibro({
        tipo: 'CUENTA_MARCADA',
        usuarioId: d.usuarioId,
        motivo: d.motivo,
        autorizadoPor: sesion.usuarioId,
        ip,
        detalle: { esCasaOficial: d.esCasaOficial, financiada: d.financiada },
      }, c);
    }, sesion.usuarioId);

    return { ok: true };
  });

  // ===================================================================
  //  Exportación
  // ===================================================================

  app.get('/admin/casa/exportar', {
    schema: {
      ...doc('Descargar el libro y las liquidaciones', 'casa.exportar',
        'Genera un CSV que Excel abre directamente. Es lo que se entrega en una auditoría.'),
      querystring: {
        type: 'object',
        properties: {
          que: { type: 'string', enum: ['libro', 'liquidaciones', 'apuestas'] },
          desde: { type: 'string' },
          hasta: { type: 'string' },
        },
      },
    },
  }, async (peticion, respuesta) => {
    await conPermiso(peticion, 'casa.exportar');
    const q = z
      .object({
        que: z.enum(['libro', 'liquidaciones', 'apuestas']).default('libro'),
        desde: z.string().optional(),
        hasta: z.string().optional(),
      })
      .parse(peticion.query);

    const desde = q.desde ? new Date(q.desde) : new Date(Date.now() - 90 * 86400_000);
    const hasta = q.hasta ? new Date(q.hasta) : new Date();

    const { filas, cabeceras, nombre } = await armarExportacion(q.que, desde, hasta);

    respuesta
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition',
        `attachment; filename="${nombre}-${hasta.toISOString().slice(0, 10)}.csv"`);

    return aCsv(cabeceras, filas);
  });
}

// =====================================================================
//  Exportación a CSV
// =====================================================================

/**
 * CSV con separador de punto y coma y BOM.
 *
 * Excel en español interpreta la coma como separador decimal, así que
 * un CSV con comas le mete todo en una sola columna. El BOM es lo que
 * hace que respete los acentos: sin él, "Botafogo" sale bien pero
 * "Anulación" no.
 */
function aCsv(cabeceras: string[], filas: unknown[][]): string {
  const escapar = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [
    cabeceras.join(';'),
    ...filas.map((f) => f.map(escapar).join(';')),
  ];
  return '\uFEFF' + lineas.join('\r\n');
}

/** Los montos se exportan en unidades decimales, no en centavos: quien
 *  audita lee soles, no la representación interna. */
function aDecimal(centavos: unknown, decimales = 2): string {
  const n = Number(centavos ?? 0);
  return (n / 10 ** decimales).toFixed(decimales).replace('.', ',');
}

async function armarExportacion(
  que: string,
  desde: Date,
  hasta: Date,
): Promise<{ filas: unknown[][]; cabeceras: string[]; nombre: string }> {
  if (que === 'liquidaciones') {
    const { rows } = await pool.query(
      `SELECT l.creado_en, c.codigo, c.es_oficial, u.alias AS operador,
              p.equipo_local, p.equipo_visitante,
              o.etiqueta AS ocurrio,
              l.presupuesto_centavos, l.cubierto_centavos, l.liberado_centavos,
              l.resultado_casa_centavos, l.comision_casa_centavos,
              l.comision_apostadores_centavos, l.pago_casa_centavos,
              l.motivo_anulacion
         FROM liquidaciones_casa l
         JOIN v_casas c    ON c.id = l.casa_id
         JOIN v_usuarios u ON u.id = c.operador_id
         JOIN v_partidos p ON p.id = c.partido_id
    LEFT JOIN opciones_casa o ON o.id = l.opcion_ganadora_id
        WHERE l.creado_en BETWEEN $1 AND $2
        ORDER BY l.creado_en DESC`,
      [desde, hasta],
    );
    return {
      nombre: 'liquidaciones-casa',
      cabeceras: ['Fecha', 'Código', 'Oficial', 'Operador', 'Partido', 'Qué ocurrió',
        'Presupuesto', 'En juego', 'Liberado', 'Resultado', 'Comisión casa',
        'Comisión apostadores', 'Pago a la casa', 'Anulación'],
      filas: rows.map((r) => [
        r.creado_en?.toISOString?.().slice(0, 19).replace('T', ' '),
        r.codigo, r.es_oficial ? 'Sí' : 'No', r.operador,
        `${r.equipo_local} vs ${r.equipo_visitante}`,
        r.ocurrio ?? '—',
        aDecimal(r.presupuesto_centavos), aDecimal(r.cubierto_centavos),
        aDecimal(r.liberado_centavos), aDecimal(r.resultado_casa_centavos),
        aDecimal(r.comision_casa_centavos), aDecimal(r.comision_apostadores_centavos),
        aDecimal(r.pago_casa_centavos), r.motivo_anulacion ?? '',
      ]),
    };
  }

  if (que === 'apuestas') {
    const { rows } = await pool.query(
      `SELECT a.fecha_crea, c.codigo, c.es_oficial, u.alias,
              o.etiqueta, a.monto_centavos, a.tasa_mostrada,
              o.ocurrio, p.equipo_local, p.equipo_visitante
         FROM v_apuestas_casa a
         JOIN v_opciones_casa o ON o.id = a.opcion_id
         JOIN v_casas c    ON c.id = o.casa_id
         JOIN v_usuarios u ON u.id = a.usuario_id
         JOIN v_partidos p ON p.id = c.partido_id
        WHERE a.fecha_crea BETWEEN $1 AND $2
        ORDER BY a.fecha_crea DESC`,
      [desde, hasta],
    );
    return {
      nombre: 'apuestas-contra-casa',
      cabeceras: ['Fecha', 'Casa', 'Oficial', 'Apostador', 'Partido', 'Opción',
        'Monto', 'Tasa', 'Ocurrió'],
      filas: rows.map((r) => [
        r.fecha_crea?.toISOString?.().slice(0, 19).replace('T', ' '),
        r.codigo, r.es_oficial ? 'Sí' : 'No', r.alias,
        `${r.equipo_local} vs ${r.equipo_visitante}`,
        r.etiqueta, aDecimal(r.monto_centavos),
        `${(Number(r.tasa_mostrada) * 100).toFixed(1)}%`,
        r.ocurrio === null ? 'pendiente' : r.ocurrio ? 'Sí' : 'No',
      ]),
    };
  }

  const { rows } = await pool.query(
    `SELECT l.momento, l.tipo, l.motivo, l.monto_centavos, l.moneda,
            u.alias, a.alias AS autorizo, c.codigo, l.ip, l.detalle
       FROM libro_casa l
  LEFT JOIN v_usuarios u ON u.id = l.usuario_id
  LEFT JOIN v_usuarios a ON a.id = l.autorizado_por
  LEFT JOIN v_casas c    ON c.id = l.casa_id
      WHERE l.momento BETWEEN $1 AND $2
      ORDER BY l.momento DESC`,
    [desde, hasta],
  );
  return {
    nombre: 'libro-casa',
    cabeceras: ['Momento', 'Tipo', 'Casa', 'Cuenta', 'Monto', 'Moneda',
      'Motivo', 'Autorizado por', 'Desde', 'Detalle'],
    filas: rows.map((r) => [
      r.momento?.toISOString?.().slice(0, 19).replace('T', ' '),
      r.tipo, r.codigo ?? '', r.alias ?? '',
      r.monto_centavos === null ? '' : aDecimal(r.monto_centavos),
      r.moneda ?? '', r.motivo, r.autorizo ?? 'sistema',
      r.ip ?? '', JSON.stringify(r.detalle),
    ]),
  };
}
