/**
 * Convierte partidos recientes finalizados en histórico deportivo.
 * Pensado para ejecutarse periódicamente. No toca saldos ni lógica económica.
 */
import { pool } from '../infraestructura/db.js';
const BASE=(process.env.API_FOOTBALL_URL??'https://v3.football.api-sports.io').replace(/\/$/,'');
const KEY=process.env.API_FOOTBALL_KEY;if(!KEY)throw new Error('Falta API_FOOTBALL_KEY');
async function pedir(ruta:string,params:Record<string,string|number>){const q=new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)]));const r=await fetch(`${BASE}/${ruta}?${q}`,{headers:{'x-apisports-key':KEY!},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`API ${r.status}`);const j:any=await r.json();return j.response??[]}
async function main(){
 const {rows}=await pool.query(`SELECT DISTINCT l.api_id FROM v_ligas l WHERE EXISTS(SELECT 1 FROM mercados_por_liga m WHERE m.liga_id=l.id AND m.eliminado_en IS NULL)`);
 const fecha=new Date().toISOString().slice(0,10); let n=0;
 for(const l of rows){const fs:any[]=await pedir('fixtures',{league:l.api_id,date:fecha});for(const f of fs){if(!['FT','AET','PEN'].includes(f.fixture?.status?.short))continue;
  const liga=await pool.query(`SELECT id FROM v_ligas WHERE api_id=$1 LIMIT 1`,[String(f.league.id)]);
  await pool.query(`INSERT INTO partidos_historial_deportivo(fixture_api_id,liga_id,liga_api_id,temporada,ronda,fecha,estado,equipo_local_api_id,equipo_visitante_api_id,equipo_local,equipo_visitante,logo_local,logo_visitante,goles_local,goles_visitante,payload_fixture,actualizado_en)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now()) ON CONFLICT(fixture_api_id) DO UPDATE SET estado=EXCLUDED.estado,goles_local=EXCLUDED.goles_local,goles_visitante=EXCLUDED.goles_visitante,payload_fixture=EXCLUDED.payload_fixture,actualizado_en=now()`,[String(f.fixture.id),liga.rows[0]?.id??null,String(f.league.id),f.league.season,f.league.round??null,new Date(f.fixture.date),f.fixture.status.short,String(f.teams.home.id),String(f.teams.away.id),f.teams.home.name,f.teams.away.name,f.teams.home.logo??null,f.teams.away.logo??null,f.goals?.home??null,f.goals?.away??null,f]);n++;}}
 console.log(`✓ ${n} partidos finalizados incorporados/actualizados en el histórico deportivo.`);
}
main().then(()=>pool.end()).catch(async e=>{console.error(e);await pool.end();process.exit(1)});
