import { pool } from '../infraestructura/db.js';
import { obtenerEstadoPreparacionAnalisis } from './estado-preparacion-analisis.servicio.js';
import { obtenerVersionAnalisis } from './versionado-analisis.servicio.js';

export type EstadoIntegridad = 'COMPLETO' | 'INCOMPLETO' | 'REVISAR';

type ObjetoEsperado = { tipo:'tabla'|'funcion'; nombre:string; obligatorio:boolean };

const OBJETOS:ObjetoEsperado[] = [
  {tipo:'tabla',nombre:'partidos_historial_deportivo',obligatorio:true},
  {tipo:'tabla',nombre:'estadisticas_partido_deportivo',obligatorio:true},
  {tipo:'tabla',nombre:'eventos_partido_deportivo',obligatorio:true},
  {tipo:'tabla',nombre:'cobertura_liga_temporada',obligatorio:true},
  {tipo:'tabla',nombre:'trabajos_importacion_historica',obligatorio:true},
  {tipo:'tabla',nombre:'objetivos_trabajo_importacion_historica',obligatorio:true},
  {tipo:'tabla',nombre:'consumo_api_football',obligatorio:true},
  {tipo:'tabla',nombre:'equipos_historicos',obligatorio:true},
  {tipo:'tabla',nombre:'alias_equipo_historico',obligatorio:true},
  {tipo:'tabla',nombre:'calibracion_calidad_reglas',obligatorio:true},
  {tipo:'tabla',nombre:'snapshots_analisis_historico',obligatorio:true},
  {tipo:'funcion',nombre:'normalizar_nombre_equipo',obligatorio:true},
];

async function existeObjeto(o:ObjetoEsperado):Promise<boolean> {
  if(o.tipo==='tabla') {
    const r=await pool.query(`SELECT to_regclass($1) IS NOT NULL AS existe`, [`public.${o.nombre}`]);
    return Boolean(r.rows[0]?.existe);
  }
  const r=await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1) AS existe`, [o.nombre]);
  return Boolean(r.rows[0]?.existe);
}

export async function verificarIntegridadAnalisis() {
  const comprobaciones=[] as Array<ObjetoEsperado & {existe:boolean}>;
  for(const o of OBJETOS) comprobaciones.push({...o,existe:await existeObjeto(o)});
  const faltantes=comprobaciones.filter(x=>x.obligatorio&&!x.existe).map(x=>`${x.tipo}:${x.nombre}`);
  const preparacion:any=await obtenerEstadoPreparacionAnalisis();
  const version:any=await obtenerVersionAnalisis();

  let estado:EstadoIntegridad='COMPLETO';
  if(faltantes.length) estado='INCOMPLETO';
  else if(preparacion?.estado==='NO_LISTO' || preparacion?.estado==='SIN_EVIDENCIA') estado='REVISAR';

  return {
    estado,
    generadoEn:new Date().toISOString(),
    version,
    esquema:{totalEsperados:comprobaciones.length,presentes:comprobaciones.filter(x=>x.existe).length,faltantes,comprobaciones},
    preparacion:{estado:preparacion?.estado??null,listo:Boolean(preparacion?.listo),bloqueos:preparacion?.bloqueos??[],advertencias:preparacion?.advertencias??[]},
    criterio:'COMPLETO exige que los objetos persistentes requeridos estén instalados. REVISAR indica que el esquema está completo pero todavía falta evidencia o existe una advertencia técnica de preparación.',
    aviso:'Esta verificación comprueba integridad técnica del módulo histórico; no evalúa resultados deportivos futuros ni genera recomendaciones.',
  };
}
