import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Sesion } from './auth.js';
import { pool, enTransaccion } from '../infraestructura/db.js';
import { construirDatasetAnalisis } from '../servicios/analisis-historico.servicio.js';
import { analizarDificultadHistorica } from '../servicios/motor-dificultad.servicio.js';
import { ejecutarBacktestCalidad } from '../servicios/backtesting-historico.servicio.js';
import { listarPartidosAnalizables, analizarLotePartidos } from '../servicios/seleccion-analisis.servicio.js';
import { analizarCompatibilidadReglas } from '../servicios/analisis-reglas.servicio.js';
import { obtenerCronologiaHistorica } from '../servicios/eventos-historicos.servicio.js';
import { calcularMetricasTecnicasReglas } from '../servicios/metricas-reglas.servicio.js';
import { calcularRendimientoAnalisis } from '../servicios/rendimiento-analisis.servicio.js';
import { diagnosticarDataset } from '../servicios/diagnostico-dataset.servicio.js';
import { crearTrabajoImportacionHistorica, obtenerTrabajoImportacionHistorica, listarHistorialImportaciones, reintentarTrabajoImportacionHistorica, reanudarTrabajosPendientesAlInicio } from '../servicios/control-importacion-historica.servicio.js';
import { obtenerResumenConsumoApiFootball } from '../servicios/consumo-api-football.servicio.js';
import { estimarObjetivosImportacionHistorica } from '../servicios/estimacion-importacion-historica.servicio.js';
import { planificarImportacionHistorica } from '../servicios/planificacion-importacion-historica.servicio.js';
import { iniciarMantenimientoHistoricoProgramado, obtenerEstadoMantenimientoHistoricoProgramado, ejecutarCicloMantenimientoHistoricoProgramado } from '../servicios/mantenimiento-historico-programado.servicio.js';
import { obtenerSaludHistorico } from '../servicios/salud-historico.servicio.js';
import { calcularCobertura79Reglas } from '../servicios/cobertura-reglas-historico.servicio.js';
import { calcularCoberturaCamposHistoricos } from '../servicios/cobertura-campos-historico.servicio.js';
import { obtenerResumenNormalizacionEquipos, listarEquiposNormalizados, sincronizarNormalizacionEquipos } from '../servicios/normalizacion-equipos.servicio.js';
import { construirDatasetEspecializado, construirTodosDatasetsEspecializados, FAMILIAS_DATASET_ESPECIALIZADO } from '../servicios/dataset-especializado.servicio.js';
import { construirDatasetPonderado } from '../servicios/ponderacion-antiguedad.servicio.js';
import { construirPerfilContextualLocalVisitante } from '../servicios/contexto-local-visitante.servicio.js';
import { analizarFormaReciente } from '../servicios/forma-reciente.servicio.js';
import { analizarConsistenciaVolatilidad } from '../servicios/consistencia-volatilidad.servicio.js';
import { ejecutarBacktesting79Reglas } from '../servicios/backtesting-reglas.servicio.js';
import { generarPropuestaCalibracionReglas, aplicarPropuestaCalibracionReglas, listarCalibracionReglasActiva } from '../servicios/calibracion-reglas.servicio.js';
import { compararTemporadasHistoricas } from '../servicios/comparacion-temporadas.servicio.js';
import { compararLigasHistoricas } from '../servicios/comparacion-ligas.servicio.js';
import { detectarAnomaliasHistoricas } from '../servicios/deteccion-anomalias-historicas.servicio.js';
import { cachearAnalisis, obtenerEstadoCacheAnalisis, limpiarCacheAnalisis } from '../servicios/cache-analisis.servicio.js';
import { construirTrazabilidadAnalisis } from '../servicios/trazabilidad-analisis.servicio.js';
import { obtenerVersionAnalisis } from '../servicios/versionado-analisis.servicio.js';
import { crearSnapshotAnalisis, listarSnapshotsAnalisis, obtenerSnapshotAnalisis } from '../servicios/snapshots-analisis.servicio.js';
import { verificarReproducibilidadSnapshot } from '../servicios/verificacion-reproducibilidad.servicio.js';
import { auditarReproducibilidadSnapshots } from '../servicios/auditoria-reproducibilidad.servicio.js';
import { evaluarControlRegresiones } from '../servicios/control-regresiones-analisis.servicio.js';
import { obtenerEstadoPreparacionAnalisis } from '../servicios/estado-preparacion-analisis.servicio.js';
import { verificarIntegridadAnalisis } from '../servicios/verificacion-integridad-analisis.servicio.js';
import { obtenerCierreTecnicoAnalisis } from '../servicios/cierre-tecnico-analisis.servicio.js';
import { obtenerConfiguracionFiltroAnalisis, guardarConfiguracionFiltroAnalisis } from '../servicios/configuracion-analisis.servicio.js';

type ConPermiso = (peticion: FastifyRequest, permiso: string) => Promise<Sesion>;

const paramsFixture = z.object({ fixtureId: z.string().min(1).max(40) });
const queryMuestra = z.object({
  muestra: z.coerce.number().int().min(5).max(50).default(20),
});

const queryDatasetEspecializado = z.object({
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  familia: z.enum(['RESULTADO','GOLES','TIEMPOS','CORNERS','TARJETAS','TIROS','POSESION','DISCIPLINA','EVENTOS']).default('GOLES'),
});
const queryDatasetsEspecializados = z.object({
  muestra: z.coerce.number().int().min(5).max(50).default(20),
});
const queryDatasetPonderado = z.object({
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  familia: z.enum(['RESULTADO','GOLES','TIEMPOS','CORNERS','TARJETAS','TIROS','POSESION','DISCIPLINA','EVENTOS']).default('GOLES'),
  vidaMediaDias: z.coerce.number().int().min(14).max(730).default(120),
  pesoMinimo: z.coerce.number().min(0).max(0.5).default(0.05),
});
const queryPerfilContextual = queryDatasetPonderado;
const queryFormaReciente = z.object({
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  familia: z.enum(['RESULTADO','GOLES','TIEMPOS','CORNERS','TARJETAS','TIROS','POSESION','DISCIPLINA','EVENTOS']).default('GOLES'),
  ventana: z.coerce.number().int().min(3).max(20).default(8),
});
const queryTrazabilidad = z.object({
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  familia: z.enum(['RESULTADO','GOLES','TIEMPOS','CORNERS','TARJETAS','TIROS','POSESION','DISCIPLINA','EVENTOS']).default('GOLES'),
});
const paramsSnapshot = z.object({ snapshotId: z.string().uuid() });
const querySnapshots = z.object({ fixtureId: z.string().min(1).max(40).optional(), limite: z.coerce.number().int().min(1).max(100).default(30) });
const queryAuditoriaReproducibilidad = z.object({ limite: z.coerce.number().int().min(1).max(50).default(20) });
const queryControlRegresiones = z.object({
  limite: z.coerce.number().int().min(1).max(50).default(20),
  maxDerivaPct: z.coerce.number().min(0).max(100).default(20),
  maxCriticos: z.coerce.number().int().min(0).max(50).default(0),
});
const queryEstadoPreparacion = queryControlRegresiones;

const queryConsistenciaVolatilidad = z.object({
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  familia: z.enum(['RESULTADO','GOLES','TIEMPOS','CORNERS','TARJETAS','TIROS','POSESION','DISCIPLINA','EVENTOS']).default('GOLES'),
  ventana: z.coerce.number().int().min(3).max(30).default(12),
});

const queryPartidos = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ligaApiId: z.string().min(1).max(40).optional(),
  buscar: z.string().max(120).optional(),
  limite: z.coerce.number().int().min(1).max(2000).default(500),
});


const bodyConfiguracionFiltro = z.object({
  ligaApiIds: z.array(z.string().min(1).max(40)).max(100).default([]),
});


const bodyConfiguracionProcesoHistorico = z.object({
  activo: z.boolean(),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  vecesPorDia: z.number().int().refine((n) => [1, 2, 3, 4, 6].includes(n), {
    message: 'vecesPorDia debe ser 1, 2, 3, 4 o 6',
  }),
});

const bodyLote = z.object({
  fixtureIds: z.array(z.string().min(1).max(40)).min(1).max(50),
  muestra: z.coerce.number().int().min(5).max(50).default(20),
});


const queryDiagnostico = z.object({
  ligaApiId: z.string().min(1).max(40).optional(),
  temporada: z.coerce.number().int().min(1900).max(2200).optional(),
  limite: z.coerce.number().int().min(1).max(300).default(100),
});


const bodyImportacionHistorica = z.object({
  objetivos: z.array(z.object({
    ligaApiId: z.string().min(1).max(40),
    temporada: z.coerce.number().int().min(1900).max(2200),
    liga: z.string().max(160).optional(),
  })).min(1).max(20),
});

const paramsTrabajoImportacion = z.object({ trabajoId: z.string().uuid() });
const queryHistorialImportacion = z.object({ limite: z.coerce.number().int().min(1).max(100).default(30) });
const queryConsumoApi = z.object({ dias: z.coerce.number().int().min(1).max(90).default(7) });
const bodyEstimacionImportacion = bodyImportacionHistorica;
const bodyPlanificacionImportacion = z.object({
  objetivos: z.array(z.object({
    ligaApiId: z.string().min(1).max(40),
    temporada: z.coerce.number().int().min(1900).max(2200),
    liga: z.string().max(160).optional(),
  })).max(100).optional(),
  maxObjetivos: z.coerce.number().int().min(1).max(20).default(20),
});


const queryCoberturaCampos = z.object({
  ligaApiId: z.string().min(1).max(40).optional(),
  temporada: z.coerce.number().int().min(1900).max(2200).optional(),
  limite: z.coerce.number().int().min(1).max(5000).default(1000),
});

const queryEquiposNormalizados = z.object({
  buscar: z.string().max(120).default(''),
  limite: z.coerce.number().int().min(1).max(300).default(100),
});

const queryCoberturaReglas = z.object({
  ligaApiId: z.string().min(1).max(40).optional(),
  temporada: z.coerce.number().int().min(1900).max(2200).optional(),
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  limite: z.coerce.number().int().min(1).max(100).default(40),
});

const queryRendimiento = z.object({
  ligaApiId: z.string().min(1).max(40).optional(),
  temporada: z.coerce.number().int().min(1900).max(2200).optional(),
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  limite: z.coerce.number().int().min(1).max(100).default(40),
});

const queryBacktest = z.object({
  ligaApiId: z.string().min(1).max(40).optional(),
  temporada: z.coerce.number().int().min(1900).max(2200).optional(),
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  limite: z.coerce.number().int().min(1).max(200).default(50),
});

const queryBacktestingReglas = z.object({
  ligaApiId: z.string().min(1).max(40).optional(),
  temporada: z.coerce.number().int().min(1900).max(2200).optional(),
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  limite: z.coerce.number().int().min(1).max(200).default(50),
});

const queryCalibracionReglas = queryBacktestingReglas;

const queryComparacionTemporadas = z.object({
  ligaApiId: z.string().min(1).max(40),
  temporadas: z.string().max(120).optional(),
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  limite: z.coerce.number().int().min(1).max(100).default(40),
  maxTemporadas: z.coerce.number().int().min(2).max(8).default(5),
});


const queryAnomaliasHistoricas = z.object({
  ligaApiId: z.string().min(1).max(40).optional(),
  temporada: z.coerce.number().int().min(1900).max(2200).optional(),
  limite: z.coerce.number().int().min(1).max(5000).default(1000),
  incluirExtremos: z.coerce.boolean().default(true),
});

const queryComparacionLigas = z.object({
  ligaApiIds: z.string().max(240).optional(),
  temporada: z.coerce.number().int().min(1900).max(2200).optional(),
  muestra: z.coerce.number().int().min(5).max(50).default(20),
  limite: z.coerce.number().int().min(1).max(100).default(40),
  maxLigas: z.coerce.number().int().min(2).max(10).default(5),
});

/**
 * Endpoints de análisis histórico.
 * Solo trabajan con datos deportivos guardados. No calculan cuotas,
 * montos, premios ni recomendaciones.
 */
export function registrarRutasAnalisisHistorico(app: FastifyInstance, conPermiso: ConPermiso): void {
  void reanudarTrabajosPendientesAlInicio()
    .then((r) => { if (r.reanudados > 0) app.log.info({ recuperacionImportacionHistorica: r }, 'Importaciones históricas reanudadas'); })
    .catch((e) => app.log.error({ err: e }, 'No se pudieron reanudar importaciones históricas pendientes'));
  iniciarMantenimientoHistoricoProgramado({ log: app.log as any });

  app.post('/admin/analisis-historico/:fixtureId/snapshot', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const q = queryTrazabilidad.parse(peticion.query);
    const snapshot = await crearSnapshotAnalisis(fixtureId, q.familia, q.muestra, { usuarioId: sesion.usuarioId, alias: sesion.alias });
    if (!snapshot) return respuesta.code(404).send({ error: 'Partido histórico no encontrado' });
    return respuesta.code(201).send({ snapshot });
  });

  app.get('/admin/analisis-historico/snapshots', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const q = querySnapshots.parse(peticion.query);
    return { snapshots: await listarSnapshotsAnalisis(q) };
  });


  app.get('/admin/analisis-historico/snapshots/auditoria/reproducibilidad', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const q = queryAuditoriaReproducibilidad.parse(peticion.query);
    return { auditoria: await auditarReproducibilidadSnapshots(q.limite) };
  });




  app.get('/admin/analisis-historico/cierre-tecnico', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    return { cierre: await obtenerCierreTecnicoAnalisis() };
  });

  app.get('/admin/analisis-historico/verificacion-integridad', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    return { integridad: await verificarIntegridadAnalisis() };
  });

  app.get('/admin/analisis-historico/estado-preparacion', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const query = queryEstadoPreparacion.parse(peticion.query);
    return { preparacion: await obtenerEstadoPreparacionAnalisis(query) };
  });

  app.get('/admin/analisis-historico/snapshots/auditoria/control-regresiones', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const query = queryControlRegresiones.parse(peticion.query);
    const control = await evaluarControlRegresiones(query);
    return { control };
  });

  app.get('/admin/analisis-historico/snapshots/:snapshotId', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { snapshotId } = paramsSnapshot.parse(peticion.params);
    const snapshot = await obtenerSnapshotAnalisis(snapshotId);
    if (!snapshot) return respuesta.code(404).send({ error: 'Snapshot no encontrado' });
    return { snapshot };
  });


  app.get('/admin/analisis-historico/snapshots/:snapshotId/verificar', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { snapshotId } = paramsSnapshot.parse(peticion.params);
    const verificacion = await verificarReproducibilidadSnapshot(snapshotId);
    if (!verificacion) return respuesta.code(404).send({ error: 'Snapshot no encontrado' });
    return { verificacion };
  });

  app.get('/admin/analisis-historico/version', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    return {
      version: obtenerVersionAnalisis(),
      nota: 'Identifica la versión técnica del motor, dataset, reglas y trazabilidad activa en esta instancia.',
    };
  });


  app.get('/admin/analisis-historico/configuracion-filtro', async (peticion: FastifyRequest) => {
    const sesion = await conPermiso(peticion, 'deportes.ver');
    const configuracion = await obtenerConfiguracionFiltroAnalisis(sesion.usuarioId);
    return { configuracion };
  });

  app.put('/admin/analisis-historico/configuracion-filtro', async (peticion: FastifyRequest) => {
    const sesion = await conPermiso(peticion, 'deportes.ver');
    const { ligaApiIds } = bodyConfiguracionFiltro.parse(peticion.body ?? {});
    const configuracion = await guardarConfiguracionFiltroAnalisis(sesion.usuarioId, ligaApiIds);
    return { configuracion };
  });

  app.get('/admin/analisis-historico/partidos-disponibles', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const filtros = queryPartidos.parse(peticion.query);
    const partidos = await listarPartidosAnalizables(filtros);
    return { partidos };
  });

  app.post('/admin/analisis-historico/lote', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureIds, muestra } = bodyLote.parse(peticion.body);
    const resultados = await analizarLotePartidos([...new Set(fixtureIds)], muestra);
    return {
      total: resultados.length,
      correctos: resultados.filter((x) => x.ok).length,
      fallidos: resultados.filter((x) => !x.ok).length,
      resultados,
    };
  });


  app.post('/admin/analisis-historico/estimacion-importacion', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const { objetivos } = bodyEstimacionImportacion.parse(peticion.body);
    const estimacion = await estimarObjetivosImportacionHistorica(objetivos);
    return { estimacion };
  });

  app.post('/admin/analisis-historico/planificacion-importacion', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const { objetivos, maxObjetivos } = bodyPlanificacionImportacion.parse(peticion.body ?? {});
    const plan = await planificarImportacionHistorica(objetivos, { maxObjetivos });
    return { plan };
  });




  app.get('/admin/analisis-historico/equipos-normalizados', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const { buscar, limite } = queryEquiposNormalizados.parse(peticion.query);
    const [resumen, equipos] = await Promise.all([
      obtenerResumenNormalizacionEquipos(),
      listarEquiposNormalizados(buscar, limite),
    ]);
    return { resumen, equipos };
  });

  app.post('/admin/analisis-historico/equipos-normalizados/sincronizar', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.gestionar');
    const resumen = await sincronizarNormalizacionEquipos();
    return { resumen };
  });

  app.get('/admin/analisis-historico/cobertura-campos', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const query = queryCoberturaCampos.parse(peticion.query);
    const cobertura = await calcularCoberturaCamposHistoricos(query);
    return { cobertura };
  });

  app.get('/admin/analisis-historico/cobertura-reglas', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const query = queryCoberturaReglas.parse(peticion.query);
    const cobertura = await calcularCobertura79Reglas(query);
    return { cobertura };
  });

  app.get('/admin/analisis-historico/salud-general', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const salud = await obtenerSaludHistorico();
    return { salud };
  });

  app.get('/admin/analisis-historico/mantenimiento-programado', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');

    const r = await pool.query(
      `SELECT clave, valor
         FROM configuracion
        WHERE clave = ANY($1::text[])
          AND eliminado_en IS NULL`,
      [[
        'historico_auto_activo',
        'historico_auto_hora',
        'historico_auto_veces',
      ]],
    );
    const valores = new Map<string, string>(
      r.rows.map((fila) => [String(fila.clave), String(fila.valor)]),
    );

    const activo = ['true', '1', 'si', 'sí', 'on'].includes(
      String(valores.get('historico_auto_activo') ?? 'false').toLowerCase(),
    );
    const hora = valores.get('historico_auto_hora') ?? '05:00';
    const veces = Number(valores.get('historico_auto_veces') ?? 1);
    const vecesPorDia = [1, 2, 3, 4, 6].includes(veces) ? veces : 1;

    const [h, m] = hora.split(':').map(Number);
    const inicio = h * 60 + m;
    const paso = (24 * 60) / vecesPorDia;
    const horarios = Array.from({ length: vecesPorDia }, (_, i) => {
      const total = Math.round((inicio + i * paso) % (24 * 60));
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    });

    return {
      configuracion: { activo, hora, vecesPorDia, horarios },
      mantenimiento: obtenerEstadoMantenimientoHistoricoProgramado(),
    };
  });

  app.put('/admin/analisis-historico/mantenimiento-programado', async (peticion: FastifyRequest) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const d = bodyConfiguracionProcesoHistorico.parse(peticion.body);

    await enTransaccion(async (c) => {
      const valores: Array<[string, string]> = [
        ['historico_auto_activo', String(d.activo)],
        ['historico_auto_hora', d.hora],
        ['historico_auto_veces', String(d.vecesPorDia)],
      ];

      for (const [clave, valor] of valores) {
        const actualizado = await c.query(
          `UPDATE configuracion
              SET valor = $2
            WHERE clave = $1
              AND eliminado_en IS NULL`,
          [clave, valor],
        );

        if (actualizado.rowCount === 0) {
          const tipo = clave.endsWith('_activo')
            ? 'BOOLEAN'
            : clave.endsWith('_veces')
              ? 'NUMERO'
              : 'TEXTO';
          await c.query(
            `INSERT INTO configuracion (clave, valor, tipo, descripcion)
             VALUES ($1,$2,$3,$4)`,
            [
              clave,
              valor,
              tipo,
              'Configuración de procesos automáticos del Histórico Deportivo',
            ],
          );
        }
      }
    }, sesion.usuarioId);

    return {
      ok: true,
      configuracion: d,
      mantenimiento: obtenerEstadoMantenimientoHistoricoProgramado(),
    };
  });

  app.post('/admin/analisis-historico/mantenimiento-programado/ejecutar', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.gestionar');
    const mantenimiento = await ejecutarCicloMantenimientoHistoricoProgramado('MANUAL');
    return respuesta.code(202).send({ mantenimiento });
  });


  app.get('/admin/analisis-historico/cache', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const cache = await obtenerEstadoCacheAnalisis();
    return { cache };
  });

  app.post('/admin/analisis-historico/cache/limpiar', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.gestionar');
    return { cache: limpiarCacheAnalisis() };
  });



  app.get('/admin/analisis-historico/:fixtureId/trazabilidad', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const q = queryTrazabilidad.parse(peticion.query);
    // No se cachea el resultado completo: incluye la calibración activa, que puede cambiar
    // independientemente de los datos históricos cacheados.
    const trazabilidad = await construirTrazabilidadAnalisis(fixtureId, q.familia, q.muestra);
    if (!trazabilidad) return respuesta.code(404).send({ error: 'Partido histórico no encontrado' });
    return { trazabilidad };
  });

  app.get('/admin/analisis-historico/:fixtureId/forma-reciente', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const q = queryFormaReciente.parse(peticion.query);
    const forma = await cachearAnalisis('forma-reciente', { fixtureId, ...q }, () => analizarFormaReciente(fixtureId, q.familia, q.muestra, q.ventana));
    if (!forma) return respuesta.code(404).send({ error: 'Partido no encontrado' });
    return { forma };
  });

  app.get('/admin/analisis-historico/:fixtureId/consistencia-volatilidad', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const q = queryConsistenciaVolatilidad.parse(peticion.query);
    const analisis = await cachearAnalisis('consistencia-volatilidad', { fixtureId, ...q }, () => analizarConsistenciaVolatilidad(fixtureId, q.familia, q.muestra, q.ventana));
    if (!analisis) return respuesta.code(404).send({ error: 'Partido no encontrado' });
    return { analisis };
  });

  app.get('/admin/analisis-historico/:fixtureId/perfil-contextual', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const q = queryPerfilContextual.parse(peticion.query);
    const perfil = await cachearAnalisis('perfil-contextual', { fixtureId, ...q }, () => construirPerfilContextualLocalVisitante(fixtureId, q.familia, q.muestra, q.vidaMediaDias, q.pesoMinimo));
    if (!perfil) return respuesta.code(404).send({ error: 'Partido no encontrado' });
    return { perfil };
  });

  app.get('/admin/analisis-historico/:fixtureId/dataset-ponderado', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const q = queryDatasetPonderado.parse(peticion.query);
    const dataset = await cachearAnalisis('dataset-ponderado', { fixtureId, ...q }, () => construirDatasetPonderado(fixtureId, q.familia, q.muestra, q.vidaMediaDias, q.pesoMinimo));
    if (!dataset) return respuesta.code(404).send({ error: 'Partido no encontrado' });
    return dataset;
  });

  app.get('/admin/analisis-historico/:fixtureId/dataset-especializado', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const { muestra, familia } = queryDatasetEspecializado.parse(peticion.query);
    const dataset = await cachearAnalisis('dataset-especializado', { fixtureId, familia, muestra }, () => construirDatasetEspecializado(fixtureId, familia, muestra));
    if (!dataset) return respuesta.code(404).send({ error: 'Partido histórico no encontrado' });
    return { dataset, familiasDisponibles: FAMILIAS_DATASET_ESPECIALIZADO };
  });

  app.get('/admin/analisis-historico/:fixtureId/datasets-especializados', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const { muestra } = queryDatasetsEspecializados.parse(peticion.query);
    const datasets = await cachearAnalisis('datasets-especializados', { fixtureId, muestra }, () => construirTodosDatasetsEspecializados(fixtureId, muestra));
    if (!datasets) return respuesta.code(404).send({ error: 'Partido histórico no encontrado' });
    return { datasets };
  });

  app.get('/admin/analisis-historico/:fixtureId', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const { muestra } = queryMuestra.parse(peticion.query);
    const dataset = await cachearAnalisis('dataset-base', { fixtureId, muestra }, () => construirDatasetAnalisis(fixtureId, muestra));
    if (!dataset) return respuesta.code(404).send({ error: 'Partido histórico no encontrado' });
    return { dataset };
  });




  app.get('/admin/analisis-historico/consumo-api-football', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const { dias } = queryConsumoApi.parse(peticion.query);
    const consumo = await obtenerResumenConsumoApiFootball({ dias });
    return { consumo };
  });

  app.get('/admin/analisis-historico/diagnostico-dataset', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const query = queryDiagnostico.parse(peticion.query);
    const diagnostico = await diagnosticarDataset(query);
    return { diagnostico };
  });


  app.post('/admin/analisis-historico/importacion-historica', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const { objetivos } = bodyImportacionHistorica.parse(peticion.body);
    const trabajo = await crearTrabajoImportacionHistorica(objetivos, { usuarioId: sesion.usuarioId, alias: sesion.alias });
    return respuesta.code(202).send({ trabajo });
  });

  app.get('/admin/analisis-historico/importacion-historica/historial', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const { limite } = queryHistorialImportacion.parse(peticion.query);
    const trabajos = await listarHistorialImportaciones(limite);
    return { trabajos };
  });

  app.post('/admin/analisis-historico/importacion-historica/:trabajoId/reintentar', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const { trabajoId } = paramsTrabajoImportacion.parse(peticion.params);
    try {
      const resultado = await reintentarTrabajoImportacionHistorica(trabajoId, { usuarioId: sesion.usuarioId, alias: sesion.alias });
      return respuesta.code(202).send(resultado);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      const noExiste = mensaje === 'Trabajo de importación no encontrado';
      return respuesta.code(noExiste ? 404 : 409).send({ error: mensaje });
    }
  });

  app.get('/admin/analisis-historico/importacion-historica/:trabajoId', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { trabajoId } = paramsTrabajoImportacion.parse(peticion.params);
    const trabajo = await obtenerTrabajoImportacionHistorica(trabajoId);
    if (!trabajo) return respuesta.code(404).send({ error: 'Trabajo de importación no encontrado' });
    return { trabajo };
  });

  app.get('/admin/analisis-historico/rendimiento/calidad', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const query = queryRendimiento.parse(peticion.query);
    const rendimiento = await calcularRendimientoAnalisis(query);
    return { rendimiento };
  });

  app.get('/admin/analisis-historico/backtesting/calidad', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const query = queryBacktest.parse(peticion.query);
    const backtest = await ejecutarBacktestCalidad(query);
    return { backtest };
  });

  app.get('/admin/analisis-historico/backtesting/reglas', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const query = queryBacktestingReglas.parse(peticion.query);
    const backtest = await ejecutarBacktesting79Reglas(query);
    return { backtest };
  });

  app.get('/admin/analisis-historico/comparacion-temporadas', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const q = queryComparacionTemporadas.parse(peticion.query);
    const temporadas = q.temporadas
      ? q.temporadas.split(',').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x))
      : undefined;
    const comparacion = await compararTemporadasHistoricas({
      ligaApiId: q.ligaApiId,
      temporadas,
      muestra: q.muestra,
      limite: q.limite,
      maxTemporadas: q.maxTemporadas,
    });
    return { comparacion };
  });



  app.get('/admin/analisis-historico/anomalias-historicas', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const q = queryAnomaliasHistoricas.parse(peticion.query);
    const diagnostico = await detectarAnomaliasHistoricas(q);
    return { diagnostico };
  });

  app.get('/admin/analisis-historico/comparacion-ligas', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const q = queryComparacionLigas.parse(peticion.query);
    const ligaApiIds = q.ligaApiIds
      ? q.ligaApiIds.split(',').map((x) => x.trim()).filter(Boolean)
      : undefined;
    const comparacion = await compararLigasHistoricas({
      ligaApiIds,
      temporada: q.temporada,
      muestra: q.muestra,
      limite: q.limite,
      maxLigas: q.maxLigas,
    });
    return { comparacion };
  });

  app.get('/admin/analisis-historico/calibracion-reglas/activa', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const calibracion = await listarCalibracionReglasActiva();
    return { calibracion };
  });

  app.get('/admin/analisis-historico/calibracion-reglas', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.ver');
    const query = queryCalibracionReglas.parse(peticion.query);
    const calibracion = await generarPropuestaCalibracionReglas(query);
    return { calibracion };
  });

  app.post('/admin/analisis-historico/calibracion-reglas/aplicar', async (peticion: FastifyRequest) => {
    await conPermiso(peticion, 'deportes.gestionar');
    const query = queryCalibracionReglas.parse(peticion.body ?? {});
    const calibracion = await aplicarPropuestaCalibracionReglas(query);
    return { calibracion };
  });

  app.get('/admin/analisis-historico/:fixtureId/eventos', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const cronologia = await obtenerCronologiaHistorica(fixtureId);
    if (!cronologia) return respuesta.code(404).send({ error: 'Partido histórico no encontrado' });
    return { cronologia };
  });

  app.get('/admin/analisis-historico/:fixtureId/reglas', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const { muestra } = queryMuestra.parse(peticion.query);
    const compatibilidad = await cachearAnalisis('reglas', { fixtureId, muestra }, () => analizarCompatibilidadReglas(fixtureId, muestra));
    if (!compatibilidad) return respuesta.code(404).send({ error: 'Partido histórico no encontrado' });
    return { compatibilidad };
  });


  app.get('/admin/analisis-historico/:fixtureId/metricas-reglas', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const { muestra } = queryMuestra.parse(peticion.query);
    const metricas = await cachearAnalisis('metricas-reglas', { fixtureId, muestra }, () => calcularMetricasTecnicasReglas(fixtureId, muestra));
    if (!metricas) return respuesta.code(404).send({ error: 'Partido histórico no encontrado' });
    return { metricas };
  });

  app.get('/admin/analisis-historico/:fixtureId/dificultad', async (peticion: FastifyRequest, respuesta: FastifyReply) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = paramsFixture.parse(peticion.params);
    const { muestra } = queryMuestra.parse(peticion.query);
    const analisis = await cachearAnalisis('dificultad', { fixtureId, muestra }, () => analizarDificultadHistorica(fixtureId, muestra));
    if (!analisis) return respuesta.code(404).send({ error: 'Partido histórico no encontrado' });
    return { analisis };
  });
}
