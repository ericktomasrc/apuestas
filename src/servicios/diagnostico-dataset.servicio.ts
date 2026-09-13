import { pool } from '../infraestructura/db.js';

export interface FiltrosDiagnosticoDataset { ligaApiId?: string; temporada?: number; limite?: number; }
export type PrioridadDataset = 'CRITICA' | 'ALTA' | 'MEDIA' | 'OK';
export interface DiagnosticoLigaTemporada {
  ligaApiId: string; liga: string; temporada: number; partidos: number;
  estadisticasPendientes: number; eventosPendientes: number;
  camposEstadisticosIncompletos: number; filasEstadisticas: number;
  coberturaApi: { estadisticas: boolean; eventos: boolean };
  faltantes: string[]; prioridad: PrioridadDataset; puntajePrioridad: number;
}

const n=(v:unknown)=>Number(v??0);
function prioridad(stats:number,eventos:number,campos:number,partidos:number):{prioridad:PrioridadDataset;puntaje:number}{
  if(!partidos)return {prioridad:'OK',puntaje:0};
  const ps=stats/partidos, pe=eventos/partidos;
  const puntaje=Math.min(100,Math.round(ps*55+pe*35+Math.min(1,campos/Math.max(1,partidos*2))*10));
  return {prioridad:puntaje>=60?'CRITICA':puntaje>=30?'ALTA':puntaje>0?'MEDIA':'OK',puntaje};
}

/** Detecta huecos del dataset ya almacenado. No hace llamadas externas ni modifica datos. */
export async function diagnosticarDataset(f:FiltrosDiagnosticoDataset={}):Promise<{resumen:any;items:DiagnosticoLigaTemporada[];aviso:string}>{
  const vals:unknown[]=[]; const where:string[]=["p.estado IN ('FT','AET','PEN','FINALIZADO')"];
  if(f.ligaApiId){vals.push(f.ligaApiId);where.push(`p.liga_api_id=$${vals.length}`);}
  if(f.temporada!==undefined){vals.push(f.temporada);where.push(`p.temporada=$${vals.length}`);}
  vals.push(Math.max(1,Math.min(300,Math.trunc(f.limite??100))));
  const {rows}=await pool.query(`
    SELECT p.liga_api_id, COALESCE(l.nombre,p.liga_api_id) liga, p.temporada,
           COUNT(*)::int partidos,
           COUNT(*) FILTER (WHERE NOT p.estadisticas_completas)::int estadisticas_pendientes,
           COUNT(*) FILTER (WHERE NOT COALESCE(p.eventos_completos,false))::int eventos_pendientes,
           COALESCE(c.fixtures_estadisticas,false) cobertura_stats,
           COALESCE(c.fixtures_eventos,false) cobertura_eventos,
           COUNT(e.*)::int filas_estadisticas,
           COUNT(e.*) FILTER (WHERE e.tiros IS NULL OR e.tiros_arco IS NULL OR e.corners IS NULL OR e.amarillas IS NULL OR e.rojas IS NULL OR e.posesion IS NULL OR e.faltas IS NULL OR e.fueras_juego IS NULL)::int campos_incompletos
      FROM partidos_historial_deportivo p
 LEFT JOIN ligas l ON l.api_id::text=p.liga_api_id
 LEFT JOIN cobertura_liga_temporada c ON c.liga_api_id=p.liga_api_id AND c.temporada=p.temporada
 LEFT JOIN estadisticas_partido_deportivo e ON e.fixture_api_id=p.fixture_api_id
     WHERE ${where.join(' AND ')}
  GROUP BY p.liga_api_id,l.nombre,p.temporada,c.fixtures_estadisticas,c.fixtures_eventos
  ORDER BY p.temporada DESC, liga
     LIMIT $${vals.length}`,vals);

  const items:DiagnosticoLigaTemporada[]=rows.map((r:any)=>{
    const partidos=n(r.partidos), stats=n(r.estadisticas_pendientes), eventos=n(r.eventos_pendientes), campos=n(r.campos_incompletos);
    const faltantes:string[]=[];
    if(stats>0) faltantes.push(r.cobertura_stats?'Estadísticas de partidos':'Estadísticas no disponibles según cobertura API');
    if(eventos>0) faltantes.push(r.cobertura_eventos?'Cronología de eventos':'Eventos no disponibles según cobertura API');
    if(campos>0) faltantes.push('Campos estadísticos parciales');
    const accionStats=r.cobertura_stats?stats:0, accionEventos=r.cobertura_eventos?eventos:0;
    const pr=prioridad(accionStats,accionEventos,campos,partidos);
    return {ligaApiId:String(r.liga_api_id),liga:String(r.liga),temporada:n(r.temporada),partidos,
      estadisticasPendientes:stats,eventosPendientes:eventos,camposEstadisticosIncompletos:campos,filasEstadisticas:n(r.filas_estadisticas),
      coberturaApi:{estadisticas:Boolean(r.cobertura_stats),eventos:Boolean(r.cobertura_eventos)},faltantes,prioridad:pr.prioridad,puntajePrioridad:pr.puntaje};
  }).sort((a,b)=>b.puntajePrioridad-a.puntajePrioridad||b.temporada-a.temporada||a.liga.localeCompare(b.liga));
  const total=items.reduce((s,x)=>s+x.partidos,0), sp=items.reduce((s,x)=>s+(x.coberturaApi.estadisticas?x.estadisticasPendientes:0),0), ep=items.reduce((s,x)=>s+(x.coberturaApi.eventos?x.eventosPendientes:0),0);
  return {resumen:{ligasTemporadas:items.length,partidos:total,estadisticasPorCompletar:sp,eventosPorCompletar:ep,prioridadCritica:items.filter(x=>x.prioridad==='CRITICA').length,prioridadAlta:items.filter(x=>x.prioridad==='ALTA').length},items,
    aviso:'Diagnóstico de integridad del dataset. Solo identifica datos históricos faltantes y los prioriza; no genera predicciones ni recomendaciones.'};
}
