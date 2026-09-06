/**
 * Importación histórica masiva de TODAS las competiciones habilitadas en TandaBet.
 * Solo datos deportivos. No toca saldos, ledger, salas ni liquidaciones.
 *
 * Uso:
 *   HISTORICO_DESDE=2024 HISTORICO_HASTA=2026 npm run historico:importar
 *
 * Reanudable/idempotente: fixture_api_id es único y cada UPSERT actualiza sin duplicar.
 */
import { pool } from '../infraestructura/db.js';

const BASE = (process.env.API_FOOTBALL_URL ?? 'https://v3.football.api-sports.io').replace(/\/$/, '');
const KEY = process.env.API_FOOTBALL_KEY;
const DESDE = Number(process.env.HISTORICO_DESDE ?? 2024);
const HASTA = Number(process.env.HISTORICO_HASTA ?? new Date().getFullYear());
const PAUSA_MS = Math.max(100, Number(process.env.HISTORICO_PAUSA_MS ?? 350));
if (!KEY) throw new Error('Falta API_FOOTBALL_KEY');

const dormir = (ms:number) => new Promise(r => setTimeout(r, ms));
async function pedir(ruta:string, params:Record<string,string|number>) {
  const q = new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)]));
  const r = await fetch(`${BASE}/${ruta}?${q}`, { headers:{'x-apisports-key':KEY!}, signal:AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`API-Football ${r.status} en ${ruta}`);
  const j:any = await r.json();
  if (j.errors && !Array.isArray(j.errors) && Object.keys(j.errors).length) throw new Error(JSON.stringify(j.errors));
  return j.response ?? [];
}
const num=(v:any):number|null=> typeof v==='number' ? v : (typeof v==='string' && v.trim() && !Number.isNaN(Number(v.replace('%',''))) ? Number(v.replace('%','')) : null);
function stat(stats:any[], nombre:string){ return num(stats?.find((x:any)=>x.type===nombre)?.value); }

async function guardarFixture(f:any, ligaId:string|null) {
  await pool.query(`INSERT INTO partidos_historial_deportivo
    (fixture_api_id,liga_id,liga_api_id,temporada,ronda,fecha,estado,
     equipo_local_api_id,equipo_visitante_api_id,equipo_local,equipo_visitante,logo_local,logo_visitante,
     goles_local,goles_visitante,goles_descanso_local,goles_descanso_visitante,
     goles_prorroga_local,goles_prorroga_visitante,penales_local,penales_visitante,payload_fixture,actualizado_en)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,now())
    ON CONFLICT (fixture_api_id) DO UPDATE SET
      estado=EXCLUDED.estado, fecha=EXCLUDED.fecha, goles_local=EXCLUDED.goles_local,
      goles_visitante=EXCLUDED.goles_visitante, goles_descanso_local=EXCLUDED.goles_descanso_local,
      goles_descanso_visitante=EXCLUDED.goles_descanso_visitante,
      goles_prorroga_local=EXCLUDED.goles_prorroga_local,goles_prorroga_visitante=EXCLUDED.goles_prorroga_visitante,
      penales_local=EXCLUDED.penales_local,penales_visitante=EXCLUDED.penales_visitante,
      payload_fixture=EXCLUDED.payload_fixture,actualizado_en=now()`, [
    String(f.fixture.id),ligaId,String(f.league.id),Number(f.league.season),f.league.round??null,new Date(f.fixture.date),f.fixture.status.short,
    String(f.teams.home.id),String(f.teams.away.id),f.teams.home.name,f.teams.away.name,f.teams.home.logo??null,f.teams.away.logo??null,
    f.goals?.home??null,f.goals?.away??null,f.score?.halftime?.home??null,f.score?.halftime?.away??null,
    f.score?.extratime?.home??null,f.score?.extratime?.away??null,f.score?.penalty?.home??null,f.score?.penalty?.away??null,f
  ]);
}
async function guardarEstadisticas(fixtureId:string) {
  const equipos:any[] = await pedir('fixtures/statistics',{fixture:fixtureId});
  if (equipos.length < 1) return 0;
  const h=await pool.query(`SELECT equipo_local_api_id FROM partidos_historial_deportivo WHERE fixture_api_id=$1`,[fixtureId]);
  const localId=String(h.rows[0]?.equipo_local_api_id??'');
  for(const e of equipos){
    const s=e.statistics??[]; const eid=String(e.team.id);
    await pool.query(`INSERT INTO estadisticas_partido_deportivo
      (fixture_api_id,equipo_api_id,equipo,es_local,tiros,tiros_arco,tiros_fuera,tiros_bloqueados,posesion,corners,faltas,amarillas,rojas,fueras_juego,pases,pases_correctos,precision_pases,atajadas,payload,actualizado_en)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
      ON CONFLICT(fixture_api_id,equipo_api_id) DO UPDATE SET
       tiros=EXCLUDED.tiros,tiros_arco=EXCLUDED.tiros_arco,tiros_fuera=EXCLUDED.tiros_fuera,tiros_bloqueados=EXCLUDED.tiros_bloqueados,
       posesion=EXCLUDED.posesion,corners=EXCLUDED.corners,faltas=EXCLUDED.faltas,amarillas=EXCLUDED.amarillas,rojas=EXCLUDED.rojas,
       fueras_juego=EXCLUDED.fueras_juego,pases=EXCLUDED.pases,pases_correctos=EXCLUDED.pases_correctos,precision_pases=EXCLUDED.precision_pases,
       atajadas=EXCLUDED.atajadas,payload=EXCLUDED.payload,actualizado_en=now()`,[
      fixtureId,eid,e.team.name,eid===localId,stat(s,'Total Shots'),stat(s,'Shots on Goal'),stat(s,'Shots off Goal'),stat(s,'Blocked Shots'),
      stat(s,'Ball Possession'),stat(s,'Corner Kicks'),stat(s,'Fouls'),stat(s,'Yellow Cards'),stat(s,'Red Cards'),stat(s,'Offsides'),
      stat(s,'Total passes'),stat(s,'Passes accurate'),stat(s,'Passes %'),stat(s,'Goalkeeper Saves'),e
    ]);
  }
  await pool.query(`UPDATE partidos_historial_deportivo SET estadisticas_completas=true, actualizado_en=now() WHERE fixture_api_id=$1`,[fixtureId]);
  return equipos.length;
}

async function main(){
  if(!Number.isInteger(DESDE)||!Number.isInteger(HASTA)||DESDE>HASTA) throw new Error('Rango HISTORICO_DESDE/HASTA inválido');
  const {rows:ligas}=await pool.query(`SELECT l.id,l.api_id,l.nombre FROM v_ligas l
    WHERE EXISTS (SELECT 1 FROM mercados_por_liga m WHERE m.liga_id=l.id AND m.eliminado_en IS NULL)
    ORDER BY l.nombre`);
  console.log(`Histórico deportivo ${DESDE}-${HASTA}: ${ligas.length} competiciones habilitadas`);
  for(const liga of ligas){
    for(let temporada=DESDE;temporada<=HASTA;temporada++){
      console.log(`\n${liga.nombre} · ${temporada}`);
      await pool.query(`INSERT INTO importaciones_historial_deportivo(liga_api_id,temporada,estado,iniciado_en)
        VALUES($1,$2,'EN_PROCESO',now()) ON CONFLICT(liga_api_id,temporada) DO UPDATE SET estado='EN_PROCESO',error=NULL,iniciado_en=now()`,[liga.api_id,temporada]);
      try{
        const fixtures:any[]=await pedir('fixtures',{league:liga.api_id,season:temporada});
        let guardados=0, stats=0;
        for(const f of fixtures){
          const final=['FT','AET','PEN'].includes(f.fixture?.status?.short);
          if(!final) continue;
          await guardarFixture(f,liga.id); guardados++;
          await dormir(PAUSA_MS);
          try { stats += await guardarEstadisticas(String(f.fixture.id)); } catch(e){ console.warn(`  stats ${f.fixture.id}: ${e instanceof Error?e.message:e}`); }
          await dormir(PAUSA_MS);
        }
        await pool.query(`UPDATE importaciones_historial_deportivo SET estado='COMPLETO',fixtures_guardados=$3,estadisticas_guardadas=$4,finalizado_en=now() WHERE liga_api_id=$1 AND temporada=$2`,[liga.api_id,temporada,guardados,stats]);
        console.log(`  ✓ ${guardados} partidos; ${stats} filas de estadísticas`);
      }catch(e){
        const msg=e instanceof Error?e.message:String(e);
        await pool.query(`UPDATE importaciones_historial_deportivo SET estado='ERROR',error=$3,finalizado_en=now() WHERE liga_api_id=$1 AND temporada=$2`,[liga.api_id,temporada,msg.slice(0,1000)]);
        console.error(`  ✗ ${msg}`);
      }
    }
  }
}
main().then(()=>pool.end()).catch(async e=>{console.error(e);await pool.end();process.exit(1)});
