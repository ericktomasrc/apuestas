import { construirDatasetEspecializado, type FamiliaDatasetEspecializado } from './dataset-especializado.servicio.js';

export type EstadoTendencia = 'ESTABLE' | 'AUMENTANDO' | 'DISMINUYENDO' | 'IRREGULAR' | 'SIN_DATOS';

type Obs = { fecha: string; valores: Record<string, unknown> };
type Serie = { nombre?: string; contexto?: string; observaciones?: Obs[] };

const red = (v:number, d=3) => Number(v.toFixed(d));
const media = (xs:number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
const desv = (xs:number[]) => {
  if (xs.length < 2) return 0;
  const m=media(xs); return Math.sqrt(xs.reduce((s,x)=>s+(x-m)**2,0)/xs.length);
};

function tendenciaVariable(observaciones: Obs[], variable: string, ventana: number) {
  // El dataset llega del partido más reciente al más antiguo. Invertimos para regresión temporal.
  const puntos = observaciones
    .slice(0, ventana)
    .map(o => ({ fecha:o.fecha, valor: typeof o.valores?.[variable] === 'number' ? Number(o.valores[variable]) : null }))
    .filter((x): x is {fecha:string;valor:number} => x.valor !== null && Number.isFinite(x.valor))
    .reverse();

  if (puntos.length < 3) return { variable, estado:'SIN_DATOS' as const, muestra:puntos.length, pendiente:null, variabilidad:null, promedioReciente:null, promedioAnterior:null, cambioPct:null };
  const ys=puntos.map(p=>p.valor), n=ys.length;
  const xs=ys.map((_,i)=>i);
  const mx=media(xs), my=media(ys);
  const den=xs.reduce((s,x)=>s+(x-mx)**2,0);
  const pendiente=den ? xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/den : 0;
  const sd=desv(ys);
  const cv=Math.abs(my)>0.0001 ? sd/Math.abs(my) : sd;
  const normalizada=Math.abs(my)>0.0001 ? pendiente/Math.abs(my) : pendiente;

  const mitad=Math.max(1,Math.floor(n/2));
  const anterior=ys.slice(0,mitad), reciente=ys.slice(mitad);
  const pa=media(anterior), pr=media(reciente);
  const cambioPct=Math.abs(pa)>0.0001 ? ((pr-pa)/Math.abs(pa))*100 : null;

  let estado:EstadoTendencia;
  if (cv >= 0.75) estado='IRREGULAR';
  else if (Math.abs(normalizada) < 0.035) estado='ESTABLE';
  else estado=pendiente>0?'AUMENTANDO':'DISMINUYENDO';

  return { variable, estado, muestra:n, pendiente:red(pendiente), variabilidad:red(cv), promedioReciente:red(pr), promedioAnterior:red(pa), cambioPct:cambioPct===null?null:red(cambioPct,1) };
}

function analizarSerie(serie:Serie, ventana:number) {
  const obs=Array.isArray(serie.observaciones)?serie.observaciones:[];
  const variables=[...new Set(obs.flatMap(o=>Object.entries(o.valores??{}).filter(([,v])=>typeof v==='number').map(([k])=>k)))];
  const tendencias=variables.map(v=>tendenciaVariable(obs,v,ventana));
  const conDatos=tendencias.filter(t=>t.estado!=='SIN_DATOS');
  return {
    nombre:serie.nombre??null,
    contexto:serie.contexto??null,
    ventana,
    variablesAnalizadas:conDatos.length,
    resumen:{
      estables:conDatos.filter(t=>t.estado==='ESTABLE').length,
      aumentando:conDatos.filter(t=>t.estado==='AUMENTANDO').length,
      disminuyendo:conDatos.filter(t=>t.estado==='DISMINUYENDO').length,
      irregulares:conDatos.filter(t=>t.estado==='IRREGULAR').length,
    },
    tendencias,
  };
}

export async function analizarFormaReciente(
  fixtureId:string,
  familia:FamiliaDatasetEspecializado,
  muestra=20,
  ventana=8,
){
  const dataset=await construirDatasetEspecializado(fixtureId,familia,muestra);
  if(!dataset) return null;
  const s:any=dataset.series;
  return {
    fixtureId:dataset.fixtureId,
    fechaCorte:dataset.fechaCorte,
    familia,
    muestra,
    ventana,
    partido:dataset.partido,
    coberturaGeneralPct:dataset.coberturaGeneralPct,
    series:{
      localGeneral:analizarSerie(s.local,ventana),
      localEnCasa:analizarSerie(s.localEnCasa,ventana),
      visitanteGeneral:analizarSerie(s.visitante,ventana),
      visitanteFuera:analizarSerie(s.visitanteFuera,ventana),
    },
    criterio:{
      descripcion:'La dirección se calcula con una regresión lineal simple sobre la ventana reciente y se contrasta con su variabilidad.',
      estados:['ESTABLE','AUMENTANDO','DISMINUYENDO','IRREGULAR','SIN_DATOS'],
    },
    aviso:'AUMENTANDO o DISMINUYENDO describe la dirección histórica de la variable; no significa mejor/peor rendimiento ni constituye una predicción o recomendación.',
  };
}
