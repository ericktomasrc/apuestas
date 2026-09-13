import { pool } from './../infraestructura/db.js';
import { sincronizarHistoricoDeportivoReciente } from '../herramientas/sincronizar-historico-deportivo.js';
import {
  ZONA_HORARIA_AUTOMATIZACION,
  relojNegocio,
  siguienteEjecucionEnZona,
  reservarRanuraAutomatica,
  finalizarRanuraAutomatica,
} from './automatizacion-tiempo.servicio.js';
import { planificarImportacionHistorica } from './planificacion-importacion-historica.servicio.js';
import {
  crearTrabajoImportacionHistorica,
  listarHistorialImportaciones,
  type TrabajoImportacionHistorica,
} from './control-importacion-historica.servicio.js';

export type EstadoMantenimientoProgramado = {
  habilitado: boolean;
  ejecutando: boolean;
  cadaHoras: number;
  maxObjetivos: number;
  ejecutarConCuotaDesconocida: boolean;
  iniciadoEn: string | null;
  proximaEjecucionEn: string | null;
  ultimoIntentoEn: string | null;
  ultimaFinalizacionEn: string | null;
  ultimoResultado: 'SIN_EJECUTAR' | 'TRABAJO_CREADO' | 'SIN_PENDIENTES' | 'CUOTA_DESCONOCIDA' | 'TRABAJO_ACTIVO' | 'ERROR';
  ultimoTrabajoId: string | null;
  ultimoMensaje: string | null;
  ultimaDuracionMs: number | null;
  ultimoError: string | null;
};

type LoggerLigero = {
  info?: (obj: unknown, msg?: string) => void;
  warn?: (obj: unknown, msg?: string) => void;
  error?: (obj: unknown, msg?: string) => void;
};

const boolEnv = (nombre: string, defecto = false): boolean => {
  const v = String(process.env[nombre] ?? '').trim().toLowerCase();
  if (!v) return defecto;
  return ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(v);
};

const numEnv = (nombre: string, defecto: number, min: number, max: number): number => {
  const n = Number(process.env[nombre]);
  if (!Number.isFinite(n)) return defecto;
  return Math.max(min, Math.min(max, n));
};

const config = {
  // Estos valores siguen siendo fallback para instalaciones donde todavía
  // no se haya aplicado 028_automatizacion_deportes.sql.
  habilitado: boolEnv('HISTORICO_MANTENIMIENTO_AUTO', false),
  cadaHoras: numEnv('HISTORICO_MANTENIMIENTO_CADA_HORAS', 12, 1, 168),
  maxObjetivos: Math.trunc(numEnv('HISTORICO_MANTENIMIENTO_MAX_OBJETIVOS', 500, 1, 500)),
  ejecutarConCuotaDesconocida: boolEnv('HISTORICO_MANTENIMIENTO_CUOTA_DESCONOCIDA', false),
  hora: '05:00',
  vecesPorDia: 1,
};

const VECES_PERMITIDAS = new Set([1, 2, 3, 4, 6]);

function booleanoPersistido(valor: unknown, defecto: boolean): boolean {
  if (typeof valor !== 'string') return defecto;
  const v = valor.trim().toLowerCase();
  if (['1', 'true', 'si', 'sí', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defecto;
}

function horaPersistida(valor: unknown, defecto = '05:00'): string {
  if (typeof valor !== 'string') return defecto;
  const v = valor.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : defecto;
}

function vecesPersistidas(valor: unknown, defecto = 1): number {
  const n = Number(valor);
  return Number.isInteger(n) && VECES_PERMITIDAS.has(n) ? n : defecto;
}

async function refrescarConfiguracionPersistida(): Promise<void> {
  try {
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

    config.habilitado = booleanoPersistido(
      valores.get('historico_auto_activo'),
      config.habilitado,
    );
    config.hora = horaPersistida(
      valores.get('historico_auto_hora'),
      config.hora,
    );
    config.vecesPorDia = vecesPersistidas(
      valores.get('historico_auto_veces'),
      config.vecesPorDia,
    );

    // Mantiene compatibilidad con consumidores actuales del estado.
    config.cadaHoras = 24 / config.vecesPorDia;
  } catch (e) {
    logger?.error?.(
      { err: e },
      'No se pudo leer la configuración persistente del mantenimiento histórico',
    );
  }
}

function minutosDelDia(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function horariosHistorico(): string[] {
  const inicio = minutosDelDia(config.hora);
  const paso = (24 * 60) / config.vecesPorDia;

  return Array.from({ length: config.vecesPorDia }, (_, i) => {
    const total = Math.round((inicio + i * paso) % (24 * 60));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
}

function calcularSiguienteHorario(desde = new Date()): string | null {
  if (!config.habilitado) return null;
  return siguienteEjecucionEnZona(horariosHistorico(), desde);
}

let temporizador: NodeJS.Timeout | null = null;
let inicioProgramador: string | null = null;
let proximaEjecucionEn: string | null = null;
let ejecutando = false;
let ultimoIntentoEn: string | null = null;
let ultimaFinalizacionEn: string | null = null;
let ultimoResultado: EstadoMantenimientoProgramado['ultimoResultado'] = 'SIN_EJECUTAR';
let ultimoTrabajoId: string | null = null;
let ultimoMensaje: string | null = null;
let ultimaDuracionMs: number | null = null;
let ultimoError: string | null = null;
let logger: LoggerLigero | null = null;

function calcularProxima(desde = new Date()): string {
  return calcularSiguienteHorario(desde)
    ?? new Date(desde.getTime() + config.cadaHoras * 60 * 60 * 1000).toISOString();
}

async function existeTrabajoActivo(): Promise<TrabajoImportacionHistorica | null> {
  const recientes = await listarHistorialImportaciones(30);
  return recientes.find(t => t.estado === 'EN_COLA' || t.estado === 'EN_PROCESO') ?? null;
}

export function obtenerEstadoMantenimientoHistoricoProgramado(): EstadoMantenimientoProgramado {
  return {
    habilitado: config.habilitado,
    ejecutando,
    cadaHoras: config.cadaHoras,
    maxObjetivos: config.maxObjetivos,
    ejecutarConCuotaDesconocida: config.ejecutarConCuotaDesconocida,
    iniciadoEn: inicioProgramador,
    proximaEjecucionEn,
    ultimoIntentoEn,
    ultimaFinalizacionEn,
    ultimoResultado,
    ultimoTrabajoId,
    ultimoMensaje,
    ultimaDuracionMs,
    ultimoError,
  };
}

/**
 * Ejecuta un ciclo de mantenimiento. Primero verifica que no exista otra
 * importación activa, construye el plan con prioridad/cuota y solo crea un
 * trabajo cuando hay objetivos seguros para procesar.
 */
export async function ejecutarCicloMantenimientoHistoricoProgramado(
  motivo: 'PROGRAMADO' | 'MANUAL' = 'PROGRAMADO',
): Promise<EstadoMantenimientoProgramado> {
  if (ejecutando) return obtenerEstadoMantenimientoHistoricoProgramado();

  if (motivo === 'PROGRAMADO') {
    await refrescarConfiguracionPersistida();
    if (!config.habilitado) {
      proximaEjecucionEn = null;
      ultimoMensaje = 'Mantenimiento automático deshabilitado por configuración.';
      return obtenerEstadoMantenimientoHistoricoProgramado();
    }
  }

  ejecutando = true;
  ultimoIntentoEn = new Date().toISOString();
  ultimoMensaje = null;
  ultimoError = null;
  const inicioCiclo = Date.now();

  try {
    const activo = await existeTrabajoActivo();
    if (activo) {
      ultimoResultado = 'TRABAJO_ACTIVO';
      ultimoTrabajoId = activo.id;
      ultimoMensaje = `Se omitió el ciclo porque existe una importación ${activo.estado}.`;
      logger?.info?.({ trabajoId: activo.id, motivo }, 'Mantenimiento histórico omitido: trabajo activo');
      return obtenerEstadoMantenimientoHistoricoProgramado();
    }

    // Primero incorpora resultados recientes. Así, los partidos que acaban de
    // terminar ya existen en partidos_historial_deportivo cuando el planificador
    // calcula qué estadísticas/eventos faltan.
    let resumenRecientes: Awaited<ReturnType<typeof sincronizarHistoricoDeportivoReciente>> | null = null;
    let errorRecientes: string | null = null;
    try {
      resumenRecientes = await sincronizarHistoricoDeportivoReciente();
      logger?.info?.(
        { motivo, resumen: resumenRecientes },
        'Partidos finalizados recientes sincronizados con el histórico',
      );
    } catch (e) {
      errorRecientes = e instanceof Error ? e.message : String(e);
      logger?.warn?.(
        { err: e, motivo },
        'No se pudieron sincronizar los finalizados recientes; se continúa con los pendientes ya existentes',
      );
    }

    const plan = await planificarImportacionHistorica(undefined, { maxObjetivos: config.maxObjetivos });
    if (plan.resumen.cuotaDesconocida && !config.ejecutarConCuotaDesconocida) {
      ultimoResultado = 'CUOTA_DESCONOCIDA';
      ultimoTrabajoId = null;
      ultimoMensaje = 'La cuota de API-Football es desconocida; el ciclo automático no inicia importaciones.';
      logger?.warn?.({ motivo }, 'Mantenimiento histórico pospuesto: cuota desconocida');
      return obtenerEstadoMantenimientoHistoricoProgramado();
    }

    const objetivos = plan.seleccionados.map((i: any) => ({
      ligaApiId: String(i.ligaApiId),
      temporada: Number(i.temporada),
      liga: i.liga ? String(i.liga) : undefined,
    }));

    if (!objetivos.length) {
      ultimoResultado = 'SIN_PENDIENTES';
      ultimoTrabajoId = null;
      const recientes = resumenRecientes?.incorporadosOActualizados ?? 0;
      const prefijo = recientes > 0
        ? `${recientes} partido(s) finalizado(s) reciente(s) incorporado(s)/actualizado(s). `
        : '';
      const avisoSync = errorRecientes
        ? ` Sincronización reciente con error: ${errorRecientes}`
        : '';
      ultimoMensaje = prefijo + (
        plan.resumen.pospuestos > 0
          ? 'Hay pendientes, pero ninguno cabe de forma segura en la cuota disponible.'
          : 'No hay liga/temporada pendientes para este ciclo.'
      ) + avisoSync;
      logger?.info?.({ motivo, resumen: plan.resumen }, 'Mantenimiento histórico sin trabajo para crear');
      return obtenerEstadoMantenimientoHistoricoProgramado();
    }

    const trabajo = await crearTrabajoImportacionHistorica(objetivos, {
      usuarioId: null,
      alias: motivo === 'MANUAL' ? 'Mantenimiento manual' : 'Mantenimiento automático',
    });
    ultimoResultado = 'TRABAJO_CREADO';
    ultimoTrabajoId = trabajo.id;
    const recientes = resumenRecientes?.incorporadosOActualizados ?? 0;
    ultimoMensaje =
      `${recientes > 0 ? `${recientes} partido(s) reciente(s) incorporado(s)/actualizado(s). ` : ''}` +
      `Se creó un trabajo con ${trabajo.total} liga/temporada.` +
      `${errorRecientes ? ` Sincronización reciente con error: ${errorRecientes}` : ''}`;
    logger?.info?.({ trabajoId: trabajo.id, total: trabajo.total, motivo }, 'Mantenimiento histórico creó un trabajo');
    return obtenerEstadoMantenimientoHistoricoProgramado();
  } catch (e) {
    ultimoResultado = 'ERROR';
    ultimoMensaje = e instanceof Error ? e.message : String(e);
    ultimoError = ultimoMensaje;
    logger?.error?.({ err: e, motivo }, 'Error en mantenimiento histórico programado');
    return obtenerEstadoMantenimientoHistoricoProgramado();
  } finally {
    ejecutando = false;
    ultimaFinalizacionEn = new Date().toISOString();
    ultimaDuracionMs = Date.now() - inicioCiclo;
    if (config.habilitado) proximaEjecucionEn = calcularProxima();
  }
}

/** Inicia una sola vez por proceso el temporizador interno. */
export function iniciarMantenimientoHistoricoProgramado(
  opciones: { log?: LoggerLigero } = {},
): EstadoMantenimientoProgramado {
  if (opciones.log) logger = opciones.log;
  if (inicioProgramador) return obtenerEstadoMantenimientoHistoricoProgramado();

  inicioProgramador = new Date().toISOString();

  /*
   * Se revisa la configuración en PostgreSQL en cada vuelta. El intervalo
   * NO representa la frecuencia real del histórico: solamente comprueba si
   * ya llegó una de las horas fijas configuradas.
   *
   * Así, reiniciar el servidor no desplaza las ejecuciones y los cambios del
   * panel (ON/OFF, hora y veces/día) se aplican sin reiniciar.
   */
  const revisar = async (): Promise<void> => {
    await refrescarConfiguracionPersistida();

    if (!config.habilitado) {
      proximaEjecucionEn = null;
      ultimoMensaje = 'Mantenimiento automático deshabilitado por configuración.';
      return;
    }

    proximaEjecucionEn = calcularSiguienteHorario();

    const reloj = relojNegocio();
    if (!horariosHistorico().includes(reloj.hhmm)) return;

    const ranura = `${reloj.fecha}T${reloj.hhmm}`;
    const reservada = await reservarRanuraAutomatica('HISTORICO', ranura);
    if (!reservada) return;

    const inicio = Date.now();
    try {
      const estado = await ejecutarCicloMantenimientoHistoricoProgramado('PROGRAMADO');
      await finalizarRanuraAutomatica('HISTORICO', ranura, {
        estado: estado.ultimoResultado === 'ERROR' ? 'ERROR' : 'COMPLETADO',
        duracionMs: Date.now() - inicio,
        error: estado.ultimoError,
        detalle: {
          resultado: estado.ultimoResultado,
          trabajoId: estado.ultimoTrabajoId,
          mensaje: estado.ultimoMensaje,
        },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await finalizarRanuraAutomatica('HISTORICO', ranura, {
        estado: 'ERROR',
        duracionMs: Date.now() - inicio,
        error,
      }).catch(() => undefined);
      logger?.error?.({ err: e, ranura }, 'Error en ranura automática de histórico');
    }
  };

  // Primera lectura poco después del arranque; no fuerza una importación.
  setTimeout(() => { void revisar(); }, 5_000).unref?.();

  temporizador = setInterval(() => { void revisar(); }, 30_000);
  temporizador.unref?.();

  logger?.info?.(
    {
      horaInicial: config.hora,
      vecesPorDia: config.vecesPorDia,
      maxObjetivos: config.maxObjetivos,
      zonaHoraria: ZONA_HORARIA_AUTOMATIZACION,
    },
    'Programador de mantenimiento histórico preparado',
  );

  return obtenerEstadoMantenimientoHistoricoProgramado();
}
