import { verificarIntegridadAnalisis } from './verificacion-integridad-analisis.servicio.js';
import { obtenerEstadoPreparacionAnalisis } from './estado-preparacion-analisis.servicio.js';
import { obtenerVersionAnalisis } from './versionado-analisis.servicio.js';

export type EstadoCierreTecnico = 'APTO_PARA_CIERRE' | 'PENDIENTE_VALIDACION' | 'BLOQUEADO';

export async function obtenerCierreTecnicoAnalisis() {
  const [integridad, preparacion] = await Promise.all([
    verificarIntegridadAnalisis(),
    obtenerEstadoPreparacionAnalisis(),
  ]);
  const version = obtenerVersionAnalisis();

  const bloqueos:string[] = [];
  const pendientes:string[] = [];

  if (integridad.estado === 'INCOMPLETO') {
    bloqueos.push(...integridad.esquema.faltantes.map((x:string) => `Falta ${x}.`));
  }
  if (preparacion.estado === 'NO_LISTO') {
    bloqueos.push(...(preparacion.bloqueos ?? []));
  }
  if (integridad.estado === 'REVISAR') pendientes.push('La verificación de integridad requiere revisión técnica.');
  if (preparacion.estado === 'SIN_EVIDENCIA') pendientes.push('Faltan snapshots suficientes para cerrar la validación de reproducibilidad.');
  if (preparacion.estado === 'LISTO_CON_ADVERTENCIAS') pendientes.push(...(preparacion.advertencias ?? []));

  const estado:EstadoCierreTecnico = bloqueos.length
    ? 'BLOQUEADO'
    : pendientes.length
      ? 'PENDIENTE_VALIDACION'
      : 'APTO_PARA_CIERRE';

  return {
    estado,
    completo: estado === 'APTO_PARA_CIERRE',
    generadoEn: new Date().toISOString(),
    version,
    resumen: {
      integridad: integridad.estado,
      preparacion: preparacion.estado,
      objetosEsperados: integridad.esquema.totalEsperados,
      objetosPresentes: integridad.esquema.presentes,
      bloqueos: bloqueos.length,
      pendientes: pendientes.length,
    },
    checklist: {
      esquemaPersistenteCompleto: integridad.estado !== 'INCOMPLETO',
      versionIdentificada: Boolean(version?.huella),
      reproducibilidadConEvidencia: preparacion.estado !== 'SIN_EVIDENCIA',
      sinRegresionesBloqueantes: preparacion.estado !== 'NO_LISTO',
      cacheConfigurada: Boolean(preparacion.comprobaciones?.cacheOperativa),
    },
    bloqueos,
    pendientes,
    criterio:'APTO_PARA_CIERRE exige esquema completo, evidencia de reproducibilidad y ausencia de regresiones técnicas bloqueantes.',
    aviso:'Este cierre certifica únicamente la preparación técnica del módulo de análisis histórico; no evalúa ni predice resultados deportivos.',
  };
}
