import { evaluarControlRegresiones } from './control-regresiones-analisis.servicio.js';
import { obtenerEstadoCacheAnalisis } from './cache-analisis.servicio.js';
import { obtenerVersionAnalisis } from './versionado-analisis.servicio.js';

export type EstadoPreparacionAnalisis = 'LISTO' | 'LISTO_CON_ADVERTENCIAS' | 'NO_LISTO' | 'SIN_EVIDENCIA';

export type OpcionesEstadoPreparacion = {
  limite?: number;
  maxDerivaPct?: number;
  maxCriticos?: number;
};

export async function obtenerEstadoPreparacionAnalisis(opciones:OpcionesEstadoPreparacion={}) {
  const control:any = await evaluarControlRegresiones(opciones);
  const cache:any = obtenerEstadoCacheAnalisis();
  const version:any = await obtenerVersionAnalisis();

  let estado:EstadoPreparacionAnalisis='LISTO';
  const bloqueos:string[]=[];
  const advertencias:string[]=[];

  if(control.estado==='SIN_MUESTRA') {
    estado='SIN_EVIDENCIA';
    advertencias.push('No hay snapshots suficientes para certificar reproducibilidad.');
  } else if(control.estado==='BLOQUEADO') {
    estado='NO_LISTO';
    bloqueos.push(...(Array.isArray(control.razones) ? control.razones : ['El control de regresiones está bloqueado.']));
  } else if(control.estado==='ADVERTENCIA') {
    estado='LISTO_CON_ADVERTENCIAS';
    advertencias.push(...(Array.isArray(control.razones) ? control.razones : ['El control de regresiones presenta advertencias.']));
  }

  const ttl=Number(cache?.configuracion?.ttlSegundos ?? cache?.ttlSegundos ?? 0);
  const maxEntradas=Number(cache?.configuracion?.maxEntradas ?? cache?.maxEntradas ?? 0);
  if(ttl<=0 || maxEntradas<=0) {
    advertencias.push('La caché de análisis no reporta una configuración activa completa.');
    if(estado==='LISTO') estado='LISTO_CON_ADVERTENCIAS';
  }

  return {
    estado,
    listo:estado==='LISTO' || estado==='LISTO_CON_ADVERTENCIAS',
    generadoEn:new Date().toISOString(),
    version,
    controlRegresiones:control,
    cache:{
      entradas:Number(cache?.entradas ?? cache?.entradasActivas ?? 0),
      hits:Number(cache?.metricas?.hits ?? cache?.hits ?? 0),
      misses:Number(cache?.metricas?.misses ?? cache?.misses ?? 0),
      configuracion:cache?.configuracion ?? null,
    },
    bloqueos,
    advertencias,
    comprobaciones:{
      versionIdentificada:Boolean(version),
      reproducibilidadEvaluada:control.estado!=='SIN_MUESTRA',
      regresionesBloqueantes:control.estado==='BLOQUEADO',
      cacheOperativa:ttl>0 && maxEntradas>0,
    },
    criterio:'LISTO significa que las comprobaciones técnicas disponibles no presentan bloqueos. SIN_EVIDENCIA exige generar snapshots antes de considerar cerrada la validación.',
    aviso:'Este estado certifica trazabilidad, reproducibilidad y estabilidad técnica del análisis histórico; no mide resultados deportivos futuros ni genera recomendaciones.',
  };
}
