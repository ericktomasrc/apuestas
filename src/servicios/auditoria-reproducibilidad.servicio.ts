import { listarSnapshotsAnalisis } from './snapshots-analisis.servicio.js';
import { verificarReproducibilidadSnapshot } from './verificacion-reproducibilidad.servicio.js';

export type EstadoAuditoriaReproducibilidad = 'SALUDABLE' | 'CON_DERIVA' | 'REQUIERE_ATENCION' | 'SIN_MUESTRA';

export async function auditarReproducibilidadSnapshots(limite=20) {
  const max=Math.max(1,Math.min(50,Number(limite || 20)));
  const snapshots:any[]=await listarSnapshotsAnalisis({ limite:max });
  if(!snapshots.length) return {
    estado:'SIN_MUESTRA' as const,
    total:0,
    resumen:{ reproducibles:0, mismaDataVersionDistinta:0, cambiosDetectados:0, noReproducibles:0, errores:0 },
    resultados:[],
    criterio:'No existen snapshots para auditar.',
  };

  const resultados:any[]=[];
  for(const s of snapshots){
    try{
      const v:any=await verificarReproducibilidadSnapshot(String(s.id));
      resultados.push({
        snapshotId:s.id, fixtureId:s.fixtureId, familia:s.familia, creadoEn:s.creadoEn,
        estado:v?.estado ?? 'NO_REPRODUCIBLE',
        datosIguales:v?.datosIguales ?? false,
        versionIgual:v?.versionIgual ?? false,
        calibracionIgual:v?.calibracionIgual ?? false,
        diferencias:v?.diferencias?.total ?? null,
      });
    }catch(e:any){
      resultados.push({ snapshotId:s.id, fixtureId:s.fixtureId, familia:s.familia, creadoEn:s.creadoEn, estado:'ERROR', error:String(e?.message ?? e) });
    }
  }

  const resumen={
    reproducibles:resultados.filter(x=>x.estado==='REPRODUCIBLE').length,
    mismaDataVersionDistinta:resultados.filter(x=>x.estado==='DATOS_IGUALES_VERSION_DISTINTA').length,
    cambiosDetectados:resultados.filter(x=>x.estado==='CAMBIO_DETECTADO').length,
    noReproducibles:resultados.filter(x=>x.estado==='NO_REPRODUCIBLE').length,
    errores:resultados.filter(x=>x.estado==='ERROR').length,
  };
  const criticos=resumen.noReproducibles+resumen.errores;
  const deriva=resumen.cambiosDetectados+resumen.mismaDataVersionDistinta;
  const estado:EstadoAuditoriaReproducibilidad = criticos>0 ? 'REQUIERE_ATENCION' : deriva>0 ? 'CON_DERIVA' : 'SALUDABLE';
  const pctReproducible=Number(((resumen.reproducibles/resultados.length)*100).toFixed(1));
  return {
    estado,
    total:resultados.length,
    pctReproducible,
    resumen,
    resultados,
    criterio:'Audita snapshots recientes contra el motor actual para detectar deriva de datos, versión o imposibilidad de reconstrucción.',
    aviso:'Control técnico de reproducibilidad del análisis histórico; no mide resultados deportivos futuros ni genera recomendaciones.',
  };
}
