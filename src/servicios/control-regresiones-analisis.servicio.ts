import { auditarReproducibilidadSnapshots } from './auditoria-reproducibilidad.servicio.js';

export type EstadoControlRegresiones = 'APROBADO' | 'ADVERTENCIA' | 'BLOQUEADO' | 'SIN_MUESTRA';

export type OpcionesControlRegresiones = {
  limite?: number;
  maxDerivaPct?: number;
  maxCriticos?: number;
};

const pct = (n:number, total:number) => total ? Number(((n/total)*100).toFixed(1)) : 0;

export async function evaluarControlRegresiones(opciones:OpcionesControlRegresiones={}) {
  const limite=Math.max(1,Math.min(50,Number(opciones.limite ?? 20)));
  const maxDerivaPct=Math.max(0,Math.min(100,Number(opciones.maxDerivaPct ?? 20)));
  const maxCriticos=Math.max(0,Math.min(50,Number(opciones.maxCriticos ?? 0)));
  const auditoria:any=await auditarReproducibilidadSnapshots(limite);

  if(!auditoria?.total) return {
    estado:'SIN_MUESTRA' as const,
    aprobado:false,
    total:0,
    umbrales:{ maxDerivaPct, maxCriticos },
    razones:['No existen snapshots suficientes para ejecutar el control de regresiones.'],
    auditoria,
    criterio:'El control no aprueba cambios sin una muestra reproducible que pueda compararse.',
  };

  const r=auditoria.resumen ?? {};
  const criticos=Number(r.noReproducibles ?? 0)+Number(r.errores ?? 0);
  const deriva=Number(r.cambiosDetectados ?? 0)+Number(r.mismaDataVersionDistinta ?? 0);
  const derivaPct=pct(deriva, auditoria.total);
  const cambioDatos=Number(r.cambiosDetectados ?? 0);
  const razones:string[]=[];

  if(criticos>maxCriticos) razones.push(`Casos críticos ${criticos} > máximo permitido ${maxCriticos}.`);
  if(derivaPct>maxDerivaPct) razones.push(`Deriva ${derivaPct}% > máximo permitido ${maxDerivaPct}%.`);
  if(cambioDatos>0) razones.push(`${cambioDatos} snapshot(s) presentan cambios en la estructura trazable de datos.`);

  let estado:EstadoControlRegresiones='APROBADO';
  if(criticos>maxCriticos || derivaPct>maxDerivaPct) estado='BLOQUEADO';
  else if(deriva>0 || cambioDatos>0) estado='ADVERTENCIA';

  return {
    estado,
    aprobado:estado==='APROBADO',
    total:auditoria.total,
    metricas:{
      reproducibles:Number(r.reproducibles ?? 0),
      deriva,
      derivaPct,
      criticos,
      cambiosDatos:cambioDatos,
    },
    umbrales:{ maxDerivaPct, maxCriticos },
    razones:razones.length ? razones : ['No se detectaron regresiones técnicas por encima de los umbrales configurados.'],
    auditoria,
    criterio:'Puerta de calidad técnica basada en reproducibilidad. BLOQUEADO significa que el cambio debe revisarse antes de considerarlo estable; este servicio no modifica ni despliega código automáticamente.',
    aviso:'Este control valida estabilidad del motor y sus datos históricos; no evalúa resultados deportivos futuros ni genera recomendaciones.',
  };
}
