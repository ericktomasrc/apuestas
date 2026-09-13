import { calcularRendimientoAnalisis } from './rendimiento-analisis.servicio.js';
import { diagnosticarDataset } from './diagnostico-dataset.servicio.js';
import { obtenerResumenConsumoApiFootball } from './consumo-api-football.servicio.js';
import { listarHistorialImportaciones } from './control-importacion-historica.servicio.js';
import { obtenerEstadoMantenimientoHistoricoProgramado } from './mantenimiento-historico-programado.servicio.js';

export type EstadoSaludHistorico = 'LISTO' | 'PARCIAL' | 'REQUIERE_ATENCION';

export async function obtenerSaludHistorico(): Promise<any> {
  const [diagnostico, rendimiento, consumo, trabajos] = await Promise.all([
    diagnosticarDataset({ limite: 100 }),
    calcularRendimientoAnalisis({ muestra: 20, limite: 40 }),
    obtenerResumenConsumoApiFootball({ dias: 7 }),
    listarHistorialImportaciones(20),
  ]);
  const mantenimiento = obtenerEstadoMantenimientoHistoricoProgramado();
  const dr = diagnostico.resumen ?? {};
  const rr = rendimiento.resumen ?? {};
  const cr = consumo.resumen ?? {};
  const cuota = consumo.cuota ?? {};
  const activos = trabajos.filter((t: any) => t.estado === 'EN_COLA' || t.estado === 'EN_PROCESO');
  const fallidos = trabajos.filter((t: any) => ['ERROR', 'INTERRUMPIDO'].includes(String(t.estado)));
  const criticos = Number(dr.prioridadCritica ?? 0);
  const altos = Number(dr.prioridadAlta ?? 0);
  const statsPend = Number(dr.estadisticasPorCompletar ?? 0);
  const eventosPend = Number(dr.eventosPorCompletar ?? 0);
  const cobertura = Number(rr.coberturaPromedioPct ?? 0);
  const utilizables = Number(rr.utilizablesPct ?? 0);
  const cuotaEstado = String(cuota.estado ?? 'DESCONOCIDA');

  const motivos: string[] = [];
  let estado: EstadoSaludHistorico = 'LISTO';
  if (criticos > 0 || cuotaEstado === 'RESERVADA' || mantenimiento.ultimoResultado === 'ERROR') {
    estado = 'REQUIERE_ATENCION';
    if (criticos > 0) motivos.push(`${criticos} liga/temporada con prioridad crítica`);
    if (cuotaEstado === 'RESERVADA') motivos.push('cuota API en reserva');
    if (mantenimiento.ultimoResultado === 'ERROR') motivos.push('último mantenimiento con error');
  } else if (altos > 0 || statsPend > 0 || eventosPend > 0 || cobertura < 75 || utilizables < 75 || cuotaEstado === 'DESCONOCIDA' || activos.length > 0 || fallidos.length > 0) {
    estado = 'PARCIAL';
    if (altos > 0) motivos.push(`${altos} liga/temporada con prioridad alta`);
    if (statsPend + eventosPend > 0) motivos.push(`${statsPend + eventosPend} bloques de datos pendientes`);
    if (cobertura < 75) motivos.push(`cobertura histórica ${cobertura.toFixed(0)}%`);
    if (utilizables < 75) motivos.push(`reglas utilizables ${utilizables.toFixed(0)}%`);
    if (cuotaEstado === 'DESCONOCIDA') motivos.push('cuota API todavía desconocida');
    if (activos.length > 0) motivos.push(`${activos.length} importación(es) activa(s)`);
    if (fallidos.length > 0) motivos.push(`${fallidos.length} ejecución(es) reciente(s) con incidencia`);
  }
  if (!motivos.length) motivos.push('dataset, cobertura y servicios sin alertas relevantes');

  return {
    estado,
    generadoEn: new Date().toISOString(),
    motivos,
    dataset: {
      ligasTemporadas: Number(dr.ligasTemporadas ?? 0), partidos: Number(dr.partidos ?? 0),
      estadisticasPendientes: statsPend, eventosPendientes: eventosPend,
      prioridadCritica: criticos, prioridadAlta: altos,
    },
    analisis: {
      partidosProcesados: Number(rr.partidosProcesados ?? 0), reglasEvaluadas: Number(rr.reglasEvaluadas ?? 0),
      coberturaPromedioPct: cobertura, utilizablesPct: utilizables,
      limitadasPct: Number(rr.limitadasPct ?? 0), descartadasPct: Number(rr.descartadasPct ?? 0),
    },
    api: {
      estadoCuota: cuotaEstado, restantes: cuota.restantes ?? null, limite: cuota.limite ?? null,
      llamadas7d: Number(cr.llamadas ?? 0), errores7d: Number(cr.errores ?? 0), rateLimit7d: Number(cr.rateLimit ?? 0),
    },
    importaciones: { activas: activos.length, incidenciasRecientes: fallidos.length, ultimoTrabajo: trabajos[0] ?? null },
    mantenimiento,
    aviso: 'Estado técnico de salud del dataset y del motor histórico. No representa probabilidad deportiva ni recomendación.',
  };
}
