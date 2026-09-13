import { pool } from '../infraestructura/db.js';
import { construirDatasetAnalisis } from './analisis-historico.servicio.js';

export type FamiliaDatasetEspecializado =
  | 'RESULTADO'
  | 'GOLES'
  | 'TIEMPOS'
  | 'CORNERS'
  | 'TARJETAS'
  | 'TIROS'
  | 'POSESION'
  | 'DISCIPLINA'
  | 'EVENTOS';

export const FAMILIAS_DATASET_ESPECIALIZADO: FamiliaDatasetEspecializado[] = [
  'RESULTADO','GOLES','TIEMPOS','CORNERS','TARJETAS','TIROS','POSESION','DISCIPLINA','EVENTOS',
];

type Fila = Record<string, any>;
const num = (v: unknown): number | null => v === null || v === undefined || v === '' ? null : Number(v);
const red = (v: number | null, dec = 2): number | null => v === null || !Number.isFinite(v) ? null : Number(v.toFixed(dec));
const pct = (n: number, d: number): number | null => d > 0 ? red(n * 100 / d, 1) : null;
const prom = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? red(v.reduce((a,b)=>a+b,0)/v.length) : null;
};

function resultadoEquipo(f: Fila, equipoApiId: string): 'V'|'E'|'D'|null {
  const gl=num(f.goles_local), gv=num(f.goles_visitante); if(gl===null||gv===null)return null;
  const local=String(f.equipo_local_api_id)===equipoApiId;
  const gf=local?gl:gv, gc=local?gv:gl;
  return gf>gc?'V':gf===gc?'E':'D';
}
function parGoles(f:Fila,equipoApiId:string){
  const gl=num(f.goles_local),gv=num(f.goles_visitante); if(gl===null||gv===null)return {favor:null,contra:null};
  const local=String(f.equipo_local_api_id)===equipoApiId;
  return {favor:local?gl:gv,contra:local?gv:gl};
}
function parDescanso(f:Fila,equipoApiId:string){
  const gl=num(f.goles_descanso_local),gv=num(f.goles_descanso_visitante); if(gl===null||gv===null)return {favor:null,contra:null};
  const local=String(f.equipo_local_api_id)===equipoApiId;
  return {favor:local?gl:gv,contra:local?gv:gl};
}

async function serieEquipo(equipoApiId:string, equipo:string, fechaCorte:Date, muestra:number, contexto:'GENERAL'|'CASA'|'FUERA', familia:FamiliaDatasetEspecializado){
  const extra=contexto==='CASA'?'AND p.equipo_local_api_id=$1':contexto==='FUERA'?'AND p.equipo_visitante_api_id=$1':'';
  const {rows}=await pool.query(`
    SELECT p.fixture_api_id,p.fecha,p.equipo_local_api_id,p.equipo_visitante_api_id,p.equipo_local,p.equipo_visitante,
           p.goles_local,p.goles_visitante,p.goles_descanso_local,p.goles_descanso_visitante,p.eventos_completos,
           sf.corners AS corners_favor, sc.corners AS corners_contra,
           sf.amarillas AS amarillas_favor, sc.amarillas AS amarillas_contra,
           sf.rojas AS rojas_favor, sc.rojas AS rojas_contra,
           sf.tiros AS tiros_favor, sc.tiros AS tiros_contra,
           sf.tiros_arco AS tiros_arco_favor, sc.tiros_arco AS tiros_arco_contra,
           sf.tiros_fuera AS tiros_fuera_favor, sc.tiros_fuera AS tiros_fuera_contra,
           sf.tiros_bloqueados AS tiros_bloqueados_favor, sc.tiros_bloqueados AS tiros_bloqueados_contra,
           sf.posesion AS posesion_favor, sc.posesion AS posesion_contra,
           sf.faltas AS faltas_favor, sc.faltas AS faltas_contra,
           sf.fueras_juego AS fueras_juego_favor, sc.fueras_juego AS fueras_juego_contra,
           sf.pases AS pases_favor, sc.pases AS pases_contra,
           sf.pases_correctos AS pases_correctos_favor, sc.pases_correctos AS pases_correctos_contra,
           sf.precision_pases AS precision_pases_favor, sc.precision_pases AS precision_pases_contra,
           sf.atajadas AS atajadas_favor, sc.atajadas AS atajadas_contra,
           ev.eventos_favor,ev.eventos_contra,ev.goles_evento_favor,ev.goles_evento_contra,ev.tarjetas_evento_favor,ev.tarjetas_evento_contra
      FROM partidos_historial_deportivo p
      LEFT JOIN estadisticas_partido_deportivo sf ON sf.fixture_api_id=p.fixture_api_id AND sf.equipo_api_id=$1
      LEFT JOIN estadisticas_partido_deportivo sc ON sc.fixture_api_id=p.fixture_api_id AND sc.equipo_api_id=CASE WHEN p.equipo_local_api_id=$1 THEN p.equipo_visitante_api_id ELSE p.equipo_local_api_id END
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE e.equipo_api_id=$1)::int AS eventos_favor,
               COUNT(*) FILTER (WHERE e.equipo_api_id<>$1)::int AS eventos_contra,
               COUNT(*) FILTER (WHERE e.equipo_api_id=$1 AND lower(coalesce(e.tipo,'')) LIKE '%goal%')::int AS goles_evento_favor,
               COUNT(*) FILTER (WHERE e.equipo_api_id<>$1 AND lower(coalesce(e.tipo,'')) LIKE '%goal%')::int AS goles_evento_contra,
               COUNT(*) FILTER (WHERE e.equipo_api_id=$1 AND lower(coalesce(e.tipo,'')) LIKE '%card%')::int AS tarjetas_evento_favor,
               COUNT(*) FILTER (WHERE e.equipo_api_id<>$1 AND lower(coalesce(e.tipo,'')) LIKE '%card%')::int AS tarjetas_evento_contra
          FROM eventos_partido_deportivo e WHERE e.fixture_api_id=p.fixture_api_id
      ) ev ON true
     WHERE p.fecha<$2 AND p.estado IN ('FT','AET','PEN','FINALIZADO')
       AND (p.equipo_local_api_id=$1 OR p.equipo_visitante_api_id=$1) ${extra}
     ORDER BY p.fecha DESC LIMIT $3`,[equipoApiId,fechaCorte,muestra]);

  const observaciones=rows.map((f:Fila)=>{
    const esLocal=String(f.equipo_local_api_id)===equipoApiId;
    const rival=esLocal?String(f.equipo_visitante):String(f.equipo_local);
    const rivalApiId=String(esLocal?f.equipo_visitante_api_id:f.equipo_local_api_id);
    const gf=parGoles(f,equipoApiId), ht=parDescanso(f,equipoApiId);
    const base:any={fixtureId:String(f.fixture_api_id),fecha:new Date(f.fecha).toISOString(),rivalApiId,rival,condicion:esLocal?'CASA':'FUERA',valores:{}};
    switch(familia){
      case 'RESULTADO': base.valores={resultado:resultadoEquipo(f,equipoApiId),golesFavor:gf.favor,golesContra:gf.contra}; break;
      case 'GOLES': base.valores={golesFavor:gf.favor,golesContra:gf.contra,total:gf.favor!==null&&gf.contra!==null?gf.favor+gf.contra:null,ambosMarcan:gf.favor!==null&&gf.contra!==null?gf.favor>0&&gf.contra>0:null}; break;
      case 'TIEMPOS': base.valores={primerTiempoFavor:ht.favor,primerTiempoContra:ht.contra,segundoTiempoFavor:gf.favor!==null&&ht.favor!==null?gf.favor-ht.favor:null,segundoTiempoContra:gf.contra!==null&&ht.contra!==null?gf.contra-ht.contra:null}; break;
      case 'CORNERS': base.valores={favor:num(f.corners_favor),contra:num(f.corners_contra),total:num(f.corners_favor)!==null&&num(f.corners_contra)!==null?Number(f.corners_favor)+Number(f.corners_contra):null}; break;
      case 'TARJETAS': base.valores={amarillasFavor:num(f.amarillas_favor),amarillasContra:num(f.amarillas_contra),rojasFavor:num(f.rojas_favor),rojasContra:num(f.rojas_contra)}; break;
      case 'TIROS': base.valores={tirosFavor:num(f.tiros_favor),tirosContra:num(f.tiros_contra),arcoFavor:num(f.tiros_arco_favor),arcoContra:num(f.tiros_arco_contra),fueraFavor:num(f.tiros_fuera_favor),bloqueadosFavor:num(f.tiros_bloqueados_favor)}; break;
      case 'POSESION': base.valores={posesionFavor:num(f.posesion_favor),posesionContra:num(f.posesion_contra),pasesFavor:num(f.pases_favor),pasesCorrectosFavor:num(f.pases_correctos_favor),precisionPasesFavor:num(f.precision_pases_favor)}; break;
      case 'DISCIPLINA': base.valores={faltasFavor:num(f.faltas_favor),faltasContra:num(f.faltas_contra),fuerasJuegoFavor:num(f.fueras_juego_favor),fuerasJuegoContra:num(f.fueras_juego_contra),atajadasFavor:num(f.atajadas_favor)}; break;
      case 'EVENTOS': base.valores={eventosCompletos:Boolean(f.eventos_completos),eventosFavor:num(f.eventos_favor),eventosContra:num(f.eventos_contra),golesEventoFavor:num(f.goles_evento_favor),golesEventoContra:num(f.goles_evento_contra),tarjetasEventoFavor:num(f.tarjetas_evento_favor),tarjetasEventoContra:num(f.tarjetas_evento_contra)}; break;
    }
    return base;
  });

  const utiles=observaciones.filter((o:any)=>Object.values(o.valores).some(v=>v!==null&&v!==undefined)).length;
  const metricas:any={};
  const valores=(k:string)=>observaciones.map((o:any)=>typeof o.valores[k]==='number'?o.valores[k]:null);
  if(familia==='RESULTADO'){
    const rs=observaciones.map((o:any)=>o.valores.resultado).filter(Boolean); metricas.victorias=rs.filter(x=>x==='V').length;metricas.empates=rs.filter(x=>x==='E').length;metricas.derrotas=rs.filter(x=>x==='D').length;metricas.puntosPromedio=rs.length?red(rs.reduce((s:number,x:string)=>s+(x==='V'?3:x==='E'?1:0),0)/rs.length):null;
  } else if(familia==='GOLES'){
    metricas.golesFavorPromedio=prom(valores('golesFavor'));metricas.golesContraPromedio=prom(valores('golesContra'));metricas.totalGolesPromedio=prom(valores('total'));const valid=observaciones.filter((o:any)=>typeof o.valores.ambosMarcan==='boolean');metricas.ambosMarcanPct=pct(valid.filter((o:any)=>o.valores.ambosMarcan).length,valid.length);
  } else if(familia==='TIEMPOS'){
    metricas.primerTiempoFavorPromedio=prom(valores('primerTiempoFavor'));metricas.primerTiempoContraPromedio=prom(valores('primerTiempoContra'));metricas.segundoTiempoFavorPromedio=prom(valores('segundoTiempoFavor'));metricas.segundoTiempoContraPromedio=prom(valores('segundoTiempoContra'));
  } else {
    const llaves=[...new Set(observaciones.flatMap((o:any)=>Object.keys(o.valores)))];
    for(const k of llaves){const xs=valores(k);if(xs.some(v=>v!==null))metricas[`${k}Promedio`]=prom(xs);}
  }
  return {equipoApiId,nombre:equipo,contexto,muestraSolicitada:muestra,muestraReal:rows.length,observacionesUtiles:utiles,coberturaPct:pct(utiles,rows.length)??0,metricas,observaciones};
}

export async function construirDatasetEspecializado(fixtureId:string,familia:FamiliaDatasetEspecializado,muestra=20){
  const base=await construirDatasetAnalisis(fixtureId,muestra); if(!base)return null;
  const corte=new Date(base.fechaCorte);
  const [local,visitante,localEnCasa,visitanteFuera]=await Promise.all([
    serieEquipo(base.partido.local.apiId,base.partido.local.nombre,corte,muestra,'GENERAL',familia),
    serieEquipo(base.partido.visitante.apiId,base.partido.visitante.nombre,corte,muestra,'GENERAL',familia),
    serieEquipo(base.partido.local.apiId,base.partido.local.nombre,corte,muestra,'CASA',familia),
    serieEquipo(base.partido.visitante.apiId,base.partido.visitante.nombre,corte,muestra,'FUERA',familia),
  ]);
  const coberturas=[local.coberturaPct,visitante.coberturaPct,localEnCasa.coberturaPct,visitanteFuera.coberturaPct];
  return {
    fixtureId:base.fixtureId,origenObjetivo:base.origenObjetivo,fechaCorte:base.fechaCorte,ligaApiId:base.ligaApiId,temporada:base.temporada,
    partido:base.partido,familia,
    datosRequeridos:familia==='RESULTADO'?['marcador final']:familia==='GOLES'?['marcador final']:familia==='TIEMPOS'?['descanso','marcador final']:familia==='CORNERS'?['corners']:familia==='TARJETAS'?['amarillas','rojas']:familia==='TIROS'?['tiros','tiros al arco','tiros fuera','tiros bloqueados']:familia==='POSESION'?['posesión','pases']:familia==='DISCIPLINA'?['faltas','fueras de juego','atajadas']:['eventos cronológicos'],
    coberturaGeneralPct:red(coberturas.reduce((a,b)=>a+b,0)/coberturas.length,1)??0,
    series:{local,visitante,localEnCasa,visitanteFuera},
    aviso:'Dataset deportivo descriptivo especializado por familia. No representa probabilidad ni recomendación.',
  };
}

export async function construirTodosDatasetsEspecializados(fixtureId:string,muestra=20){
  const resultados=[] as any[];
  for(const familia of FAMILIAS_DATASET_ESPECIALIZADO){
    const dataset=await construirDatasetEspecializado(fixtureId,familia,muestra);
    if(!dataset)return null;
    resultados.push(dataset);
  }
  return {fixtureId,muestra,familias:resultados.map(x=>({familia:x.familia,coberturaGeneralPct:x.coberturaGeneralPct,datosRequeridos:x.datosRequeridos})),datasets:resultados,aviso:'Cada familia utiliza únicamente los campos históricos que necesita.'};
}
