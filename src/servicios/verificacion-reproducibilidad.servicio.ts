import { createHash } from 'node:crypto';
import { obtenerSnapshotAnalisis } from './snapshots-analisis.servicio.js';
import { construirTrazabilidadAnalisis } from './trazabilidad-analisis.servicio.js';
import type { FamiliaDatasetEspecializado } from './dataset-especializado.servicio.js';

function estable(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
  const o=v as Record<string,unknown>;
  return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${estable(o[k])}`).join(',')}}`;
}
function huella(v:unknown){ return createHash('sha256').update(estable(v)).digest('hex').slice(0,24); }

function normalizarTrazabilidad(t:any){
  if(!t) return null;
  const series=t.dataset?.series ?? {};
  const normalizarSerie=(s:any)=>({
    equipoApiId:s?.equipoApiId ?? null,
    contexto:s?.contexto ?? null,
    muestraSolicitada:s?.muestraSolicitada ?? 0,
    muestraReal:s?.muestraReal ?? 0,
    observacionesUtiles:s?.observacionesUtiles ?? 0,
    coberturaPct:s?.coberturaPct ?? 0,
    partidosHistoricos:(s?.partidosHistoricos ?? []).map((p:any)=>({fixtureId:p.fixtureId,fecha:p.fecha,condicion:p.condicion})),
    campos:(s?.campos ?? []).map((c:any)=>({campo:c.campo,valoresUsados:c.valoresUsados,valoresDescartados:c.valoresDescartados})),
    integridadTemporal:s?.integridadTemporal?.estado ?? null,
  });
  return {
    fixtureId:t.fixtureId,
    familia:t.familia,
    muestra:t.muestra,
    fechaCorte:t.fechaCorte,
    objetivo:{ ligaApiId:t.objetivo?.ligaApiId ?? null, temporada:t.objetivo?.temporada ?? null, partido:t.objetivo?.partido ?? null },
    dataset:{
      coberturaGeneralPct:t.dataset?.coberturaGeneralPct ?? null,
      datosRequeridos:t.dataset?.datosRequeridos ?? null,
      partidosHistoricosUnicos:t.dataset?.partidosHistoricosUnicos ?? 0,
      series:{
        localGeneral:normalizarSerie(series.localGeneral),
        localEnCasa:normalizarSerie(series.localEnCasa),
        visitanteGeneral:normalizarSerie(series.visitanteGeneral),
        visitanteFuera:normalizarSerie(series.visitanteFuera),
      },
    },
    calibracionHuella:t.calibracionActiva?.huella ?? t.versionado?.calibracionHuella ?? null,
    integridadTemporal:t.integridad?.temporal ?? null,
  };
}

function diferencias(a:any,b:any,path='$',out:string[]=[]):string[]{
  if(out.length>=100) return out;
  if(Object.is(a,b)) return out;
  if(typeof a!==typeof b || a===null || b===null){ out.push(path); return out; }
  if(Array.isArray(a)||Array.isArray(b)){
    if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length){ out.push(path); return out; }
    for(let i=0;i<a.length;i++) diferencias(a[i],b[i],`${path}[${i}]`,out);
    return out;
  }
  if(typeof a==='object'){
    const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
    for(const k of keys) diferencias(a[k],b[k],`${path}.${k}`,out);
    return out;
  }
  out.push(path); return out;
}

export async function verificarReproducibilidadSnapshot(snapshotId:string){
  const guardado:any=await obtenerSnapshotAnalisis(snapshotId);
  if(!guardado) return null;
  const snapshot:any=guardado.snapshot;
  const actual:any=await construirTrazabilidadAnalisis(String(guardado.fixtureId), guardado.familia as FamiliaDatasetEspecializado, Number(guardado.muestra));
  if(!actual) return {
    snapshotId, estado:'NO_REPRODUCIBLE' as const, motivo:'El fixture ya no puede reconstruirse con el dataset actual.',
    guardado:{ fixtureId:guardado.fixtureId, familia:guardado.familia, muestra:guardado.muestra },
  };
  const a=normalizarTrazabilidad(snapshot), b=normalizarTrazabilidad(actual);
  const dif=diferencias(a,b);
  const versionIgual=(snapshot?.versionado?.version?.huella ?? guardado.versionHuella ?? null)===(actual?.versionado?.version?.huella ?? null);
  const calibracionIgual=(snapshot?.calibracionActiva?.huella ?? guardado.calibracionHuella ?? null)===(actual?.calibracionActiva?.huella ?? null);
  const datosIguales=dif.length===0;
  const estado=datosIguales && versionIgual ? 'REPRODUCIBLE' : datosIguales ? 'DATOS_IGUALES_VERSION_DISTINTA' : 'CAMBIO_DETECTADO';
  return {
    snapshotId,
    estado,
    datosIguales,
    versionIgual,
    calibracionIgual,
    huellas:{ guardada:huella(a), actual:huella(b) },
    diferencias:{ total:dif.length, rutas:dif.slice(0,100), truncadas:dif.length>100 },
    versiones:{ guardada:snapshot?.versionado?.version ?? null, actual:actual?.versionado?.version ?? null },
    calibracion:{ guardada:snapshot?.calibracionActiva?.huella ?? null, actual:actual?.calibracionActiva?.huella ?? null },
    integridadTemporal:{ guardada:snapshot?.integridad?.temporal ?? null, actual:actual?.integridad?.temporal ?? null },
    criterio:'La comparación excluye campos volátiles como generadoEn y compara la estructura trazable del dataset, partidos usados, cobertura, campos e integridad.',
    aviso:'Verificación técnica de reproducibilidad y deriva del análisis histórico; no es una predicción ni recomendación deportiva.',
  };
}
