import { construirDatasetEspecializado, type FamiliaDatasetEspecializado } from './dataset-especializado.servicio.js';

export type NivelVolatilidad = 'BAJA' | 'MEDIA' | 'ALTA' | 'MUY_ALTA' | 'SIN_DATOS';
export type NivelConsistencia = 'ALTA' | 'MEDIA' | 'BAJA' | 'MUY_BAJA' | 'SIN_DATOS';

type Obs = { fecha: string; valores: Record<string, unknown> };
type Serie = { nombre?: string; contexto?: string; observaciones?: Obs[] };

const red = (v:number, d=3) => Number(v.toFixed(d));
const media = (xs:number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
const mediana = (xs:number[]) => {
  if (!xs.length) return 0;
  const s=[...xs].sort((a,b)=>a-b), m=Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
};
const desv = (xs:number[]) => {
  if (xs.length < 2) return 0;
  const m=media(xs);
  return Math.sqrt(xs.reduce((s,x)=>s+(x-m)**2,0)/xs.length);
};
const percentil = (xs:number[], p:number) => {
  if(!xs.length) return 0;
  const s=[...xs].sort((a,b)=>a-b);
  const pos=(s.length-1)*p;
  const lo=Math.floor(pos), hi=Math.ceil(pos);
  return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(pos-lo);
};

function valoresNumericos(observaciones:Obs[], variable:string, ventana:number):number[] {
  return observaciones.slice(0,ventana)
    .map(o=>o.valores?.[variable])
    .filter((v):v is number=>typeof v==='number' && Number.isFinite(v));
}

function clasificarVolatilidad(cv:number, iqrRel:number):NivelVolatilidad {
  const indice=Math.max(cv,iqrRel);
  if(indice < 0.22) return 'BAJA';
  if(indice < 0.45) return 'MEDIA';
  if(indice < 0.75) return 'ALTA';
  return 'MUY_ALTA';
}
function clasificarConsistencia(puntaje:number):NivelConsistencia {
  if(puntaje >= 80) return 'ALTA';
  if(puntaje >= 60) return 'MEDIA';
  if(puntaje >= 40) return 'BAJA';
  return 'MUY_BAJA';
}

function analizarVariable(observaciones:Obs[], variable:string, ventana:number) {
  const xs=valoresNumericos(observaciones,variable,ventana);
  if(xs.length < 3) return {
    variable,muestra:xs.length,promedio:null,mediana:null,desviacion:null,coeficienteVariacion:null,
    rangoIntercuartil:null,iqrRelativo:null,consistenciaPuntaje:null,consistencia:'SIN_DATOS' as NivelConsistencia,
    volatilidad:'SIN_DATOS' as NivelVolatilidad,minimo:null,maximo:null,
  };
  const m=media(xs), md=mediana(xs), sd=desv(xs), q1=percentil(xs,.25), q3=percentil(xs,.75), iqr=q3-q1;
  const escala=Math.max(Math.abs(m),1);
  const cv=sd/escala;
  const iqrRel=iqr/escala;
  // Puntaje descriptivo: penaliza dispersión estándar e intercuartil. No es probabilidad.
  const penalizacion=Math.min(100, (Math.min(cv,1.5)*58 + Math.min(iqrRel,1.5)*42) / 1.5);
  const puntaje=Math.max(0,100-penalizacion);
  return {
    variable,muestra:xs.length,promedio:red(m),mediana:red(md),desviacion:red(sd),coeficienteVariacion:red(cv),
    rangoIntercuartil:red(iqr),iqrRelativo:red(iqrRel),consistenciaPuntaje:red(puntaje,1),
    consistencia:clasificarConsistencia(puntaje),volatilidad:clasificarVolatilidad(cv,iqrRel),
    minimo:red(Math.min(...xs)),maximo:red(Math.max(...xs)),
  };
}

function analizarSerie(serie:Serie, ventana:number) {
  const observaciones=Array.isArray(serie.observaciones)?serie.observaciones:[];
  const variables=[...new Set(observaciones.flatMap(o=>Object.entries(o.valores??{})
    .filter(([,v])=>typeof v==='number' && Number.isFinite(v))
    .map(([k])=>k)))];
  const metricas=variables.map(v=>analizarVariable(observaciones,v,ventana));
  const validas=metricas.filter(m=>m.consistencia!=='SIN_DATOS');
  const promedioConsistencia=validas.length
    ? red(validas.reduce((s,m)=>s+(m.consistenciaPuntaje??0),0)/validas.length,1)
    : null;
  return {
    nombre:serie.nombre??null,
    contexto:serie.contexto??null,
    ventana,
    variablesAnalizadas:validas.length,
    consistenciaPromedio:promedioConsistencia,
    resumen:{
      consistenciaAlta:validas.filter(m=>m.consistencia==='ALTA').length,
      consistenciaMedia:validas.filter(m=>m.consistencia==='MEDIA').length,
      consistenciaBaja:validas.filter(m=>m.consistencia==='BAJA').length,
      consistenciaMuyBaja:validas.filter(m=>m.consistencia==='MUY_BAJA').length,
      volatilidadAltaOMuyAlta:validas.filter(m=>m.volatilidad==='ALTA'||m.volatilidad==='MUY_ALTA').length,
    },
    metricas,
  };
}

export async function analizarConsistenciaVolatilidad(
  fixtureId:string,
  familia:FamiliaDatasetEspecializado,
  muestra=20,
  ventana=12,
){
  const dataset=await construirDatasetEspecializado(fixtureId,familia,muestra);
  if(!dataset)return null;
  const s:any=dataset.series;
  const series={
    localGeneral:analizarSerie(s.local,ventana),
    localEnCasa:analizarSerie(s.localEnCasa,ventana),
    visitanteGeneral:analizarSerie(s.visitante,ventana),
    visitanteFuera:analizarSerie(s.visitanteFuera,ventana),
  };
  const promedios=Object.values(series).map((x:any)=>x.consistenciaPromedio).filter((x):x is number=>typeof x==='number');
  return {
    fixtureId:dataset.fixtureId,
    fechaCorte:dataset.fechaCorte,
    familia,
    muestra,
    ventana,
    partido:dataset.partido,
    coberturaGeneralPct:dataset.coberturaGeneralPct,
    consistenciaGeneral:promedios.length?red(promedios.reduce((a,b)=>a+b,0)/promedios.length,1):null,
    series,
    criterio:{
      descripcion:'La consistencia se calcula con dispersión histórica: desviación estándar, coeficiente de variación y rango intercuartil.',
      consistencia:['ALTA','MEDIA','BAJA','MUY_BAJA','SIN_DATOS'],
      volatilidad:['BAJA','MEDIA','ALTA','MUY_ALTA','SIN_DATOS'],
      minimoObservaciones:3,
    },
    aviso:'Consistencia y volatilidad describen estabilidad histórica de los datos. No son probabilidades, pronósticos ni recomendaciones.',
  };
}
