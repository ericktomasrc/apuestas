import { pool } from '../infraestructura/db.js';
import { resolverEquipoApiIdNormalizado } from './normalizacion-equipos.servicio.js';

export interface ResumenEquipoHistorico {
  equipoApiId: string;
  equipo: string;
  partidosAnalizados: number;
  victorias: number;
  empates: number;
  derrotas: number;
  golesFavorPromedio: number | null;
  golesContraPromedio: number | null;
  mas15GolesPct: number | null;
  mas25GolesPct: number | null;
  mas35GolesPct: number | null;
  ambosMarcanPct: number | null;
  cornersFavorPromedio: number | null;
  cornersTotalesPromedio: number | null;
  tarjetasPromedio: number | null;
  tirosPromedio: number | null;
  tirosArcoPromedio: number | null;
  posesionPromedio: number | null;
  faltasPromedio: number | null;
  fuerasJuegoPromedio: number | null;
  rojasPromedio: number | null;
  golesPrimerTiempoFavorPromedio: number | null;
  golesPrimerTiempoContraPromedio: number | null;
  golesSegundoTiempoFavorPromedio: number | null;
  golesSegundoTiempoContraPromedio: number | null;
  partidosConEstadisticas: number;
  partidosConEventos: number;
  coberturaCampos: {
    golesFinales: number;
    descanso: number;
    corners: number;
    tarjetas: number;
    rojas: number;
    tiros: number;
    tirosArco: number;
    posesion: number;
    faltas: number;
    fuerasJuego: number;
    eventosCronologicos: number;
  };
}

export interface DatasetAnalisisHistorico {
  fixtureId: string;
  origenObjetivo: 'HISTORICO' | 'PROGRAMADO';
  fechaCorte: string;
  ligaApiId: string;
  temporada: number;
  partido: {
    local: { apiId: string; nombre: string; logo: string | null };
    visitante: { apiId: string; nombre: string; logo: string | null };
  };
  local: ResumenEquipoHistorico;
  visitante: ResumenEquipoHistorico;
  localEnCasa: ResumenEquipoHistorico;
  visitanteFuera: ResumenEquipoHistorico;
  enfrentamientosDirectos: {
    partidos: number;
    ganaLocalActual: number;
    empates: number;
    ganaVisitanteActual: number;
    golesPromedio: number | null;
    ambosMarcanPct: number | null;
  };
  calidad: {
    muestraObjetivoPorEquipo: number;
    muestraLocal: number;
    muestraVisitante: number;
    coberturaPartidosPct: number;
    coberturaEstadisticasPct: number;
    estado: 'SUFICIENTE' | 'LIMITADA' | 'INSUFICIENTE';
  };
}

type Fila = Record<string, any>;
const n = (v: unknown): number | null => v === null || v === undefined ? null : Number(v);
const red = (v: number | null, dec = 2): number | null => v === null || !Number.isFinite(v) ? null : Number(v.toFixed(dec));
const pct = (si: number, total: number): number | null => total ? red(si * 100 / total, 1) : null;

function resumen(equipoApiId: string, equipo: string, filas: Fila[]): ResumenEquipoHistorico {
  let v = 0, e = 0, d = 0, gf = 0, gc = 0, over15 = 0, over25 = 0, over35 = 0, btts = 0;
  let conGoles = 0, conStats = 0, cornersF = 0, cornersT = 0, tarjetas = 0, tiros = 0, tirosArco = 0;
  let posesion = 0, faltas = 0, fuerasJuego = 0, rojas = 0;
  let ptFavor = 0, ptContra = 0, stFavor = 0, stContra = 0;
  let cCornersF = 0, cCornersT = 0, cTarjetas = 0, cTiros = 0, cTirosArco = 0;
  let cPosesion = 0, cFaltas = 0, cFuerasJuego = 0, cRojas = 0, cDescanso = 0, cSegundoTiempo = 0, cEventos = 0;

  for (const f of filas) {
    const esLocal = String(f.equipo_local_api_id) === equipoApiId;
    const gl = n(f.goles_local), gv = n(f.goles_visitante);
    if (gl !== null && gv !== null) {
      const favor = esLocal ? gl : gv, contra = esLocal ? gv : gl;
      gf += favor; gc += contra; conGoles++;
      if (favor > contra) v++; else if (favor === contra) e++; else d++;
      const total = gl + gv;
      if (total >= 2) over15++;
      if (total >= 3) over25++;
      if (total >= 4) over35++;
      if (gl > 0 && gv > 0) btts++;
    }

    const htl = n(f.goles_descanso_local), htv = n(f.goles_descanso_visitante);
    if (htl !== null && htv !== null) {
      ptFavor += esLocal ? htl : htv;
      ptContra += esLocal ? htv : htl;
      cDescanso++;
      if (gl !== null && gv !== null) {
        stFavor += (esLocal ? gl : gv) - (esLocal ? htl : htv);
        stContra += (esLocal ? gv : gl) - (esLocal ? htv : htl);
        cSegundoTiempo++;
      }
    }

    if (f.estadisticas_completas) conStats++;
    if (f.eventos_completos) cEventos++;
    const cf = n(f.corners_favor), cc = n(f.corners_contra);
    if (cf !== null) { cornersF += cf; cCornersF++; }
    if (cf !== null && cc !== null) { cornersT += cf + cc; cCornersT++; }
    const am = n(f.amarillas_favor), rj = n(f.rojas_favor);
    if (am !== null || rj !== null) { tarjetas += (am ?? 0) + (rj ?? 0); cTarjetas++; }
    if (rj !== null) { rojas += rj; cRojas++; }
    const tr = n(f.tiros_favor); if (tr !== null) { tiros += tr; cTiros++; }
    const ta = n(f.tiros_arco_favor); if (ta !== null) { tirosArco += ta; cTirosArco++; }
    const po = n(f.posesion_favor); if (po !== null) { posesion += po; cPosesion++; }
    const fa = n(f.faltas_favor); if (fa !== null) { faltas += fa; cFaltas++; }
    const fj = n(f.fueras_juego_favor); if (fj !== null) { fuerasJuego += fj; cFuerasJuego++; }
  }
  return {
    equipoApiId, equipo, partidosAnalizados: filas.length, victorias: v, empates: e, derrotas: d,
    golesFavorPromedio: conGoles ? red(gf / conGoles) : null,
    golesContraPromedio: conGoles ? red(gc / conGoles) : null,
    mas15GolesPct: pct(over15, conGoles), mas25GolesPct: pct(over25, conGoles), mas35GolesPct: pct(over35, conGoles),
    ambosMarcanPct: pct(btts, conGoles), cornersFavorPromedio: cCornersF ? red(cornersF / cCornersF) : null,
    cornersTotalesPromedio: cCornersT ? red(cornersT / cCornersT) : null,
    tarjetasPromedio: cTarjetas ? red(tarjetas / cTarjetas) : null,
    tirosPromedio: cTiros ? red(tiros / cTiros) : null, tirosArcoPromedio: cTirosArco ? red(tirosArco / cTirosArco) : null,
    posesionPromedio: cPosesion ? red(posesion / cPosesion) : null,
    faltasPromedio: cFaltas ? red(faltas / cFaltas) : null,
    fuerasJuegoPromedio: cFuerasJuego ? red(fuerasJuego / cFuerasJuego) : null,
    rojasPromedio: cRojas ? red(rojas / cRojas) : null,
    golesPrimerTiempoFavorPromedio: cDescanso ? red(ptFavor / cDescanso) : null,
    golesPrimerTiempoContraPromedio: cDescanso ? red(ptContra / cDescanso) : null,
    golesSegundoTiempoFavorPromedio: cSegundoTiempo ? red(stFavor / cSegundoTiempo) : null,
    golesSegundoTiempoContraPromedio: cSegundoTiempo ? red(stContra / cSegundoTiempo) : null,
    partidosConEstadisticas: conStats,
    partidosConEventos: cEventos,
    coberturaCampos: {
      golesFinales: conGoles,
      descanso: cDescanso,
      corners: cCornersT,
      tarjetas: cTarjetas,
      rojas: cRojas,
      tiros: cTiros,
      tirosArco: cTirosArco,
      posesion: cPosesion,
      faltas: cFaltas,
      fuerasJuego: cFuerasJuego,
      eventosCronologicos: cEventos,
    },
  };
}

async function partidosEquipo(equipoId: string, antesDe: Date, limite: number, condicion = ''): Promise<Fila[]> {
  const { rows } = await pool.query(`
    SELECT p.*,
      sf.corners AS corners_favor, sc.corners AS corners_contra,
      sf.amarillas AS amarillas_favor, sf.rojas AS rojas_favor,
      sf.tiros AS tiros_favor, sf.tiros_arco AS tiros_arco_favor,
      sf.posesion AS posesion_favor, sf.faltas AS faltas_favor,
      sf.fueras_juego AS fueras_juego_favor
    FROM partidos_historial_deportivo p
    LEFT JOIN estadisticas_partido_deportivo sf ON sf.fixture_api_id=p.fixture_api_id AND sf.equipo_api_id=$1
    LEFT JOIN estadisticas_partido_deportivo sc ON sc.fixture_api_id=p.fixture_api_id AND sc.equipo_api_id = CASE WHEN p.equipo_local_api_id=$1 THEN p.equipo_visitante_api_id ELSE p.equipo_local_api_id END
    WHERE p.fecha < $2
      AND p.estado IN ('FT','AET','PEN','FINALIZADO')
      AND (p.equipo_local_api_id=$1 OR p.equipo_visitante_api_id=$1)
      ${condicion}
    ORDER BY p.fecha DESC
    LIMIT $3`, [equipoId, antesDe, limite]);
  return rows;
}

async function resolverPartidoObjetivo(fixtureId: string): Promise<{ partido: Fila; origen: 'HISTORICO' | 'PROGRAMADO' } | null> {
  const historico = await pool.query(
    `SELECT * FROM partidos_historial_deportivo WHERE fixture_api_id=$1`,
    [fixtureId],
  );
  if (historico.rowCount) return { partido: historico.rows[0], origen: 'HISTORICO' };

  // Para un partido futuro usamos el calendario actual como fecha de corte y
  // resolvemos los IDs de los equipos desde el histórico ya almacenado. No
  // llama al proveedor y nunca usa información posterior al inicio del partido.
  const actual = await pool.query(`
    SELECT p.api_id AS fixture_api_id,
           p.inicia_en AS fecha,
           l.api_id AS liga_api_id,
           EXTRACT(YEAR FROM p.inicia_en)::int AS temporada,
           p.equipo_local,
           p.equipo_visitante,
           p.logo_local,
           p.logo_visitante
      FROM v_partidos p
      JOIN v_ligas l ON l.id = p.liga_id
     WHERE p.api_id = $1
     LIMIT 1`, [fixtureId]);
  if (!actual.rowCount) return null;

  const p = actual.rows[0];
  const corte = new Date(p.fecha);
  const [localId, visitaId] = await Promise.all([
    resolverEquipoApiIdNormalizado(String(p.equipo_local), corte, String(p.liga_api_id ?? '')),
    resolverEquipoApiIdNormalizado(String(p.equipo_visitante), corte, String(p.liga_api_id ?? '')),
  ]);
  if (!localId || !visitaId) {
    throw new Error('No hay histórico suficiente para identificar uno o ambos equipos del partido programado');
  }
  p.equipo_local_api_id = localId;
  p.equipo_visitante_api_id = visitaId;
  return { partido: p, origen: 'PROGRAMADO' };
}

export async function construirDatasetAnalisis(fixtureId: string, muestra = 20): Promise<DatasetAnalisisHistorico | null> {
  const objetivo = await resolverPartidoObjetivo(fixtureId);
  if (!objetivo) return null;
  const p = objetivo.partido;
  const localId = String(p.equipo_local_api_id ?? '');
  const visitaId = String(p.equipo_visitante_api_id ?? '');
  if (!localId || !visitaId) throw new Error('El partido no tiene identificadores API de ambos equipos');
  const corte = new Date(p.fecha);

  const [fl, fv, casa, fuera, h2h] = await Promise.all([
    partidosEquipo(localId, corte, muestra),
    partidosEquipo(visitaId, corte, muestra),
    partidosEquipo(localId, corte, muestra, 'AND p.equipo_local_api_id=$1'),
    partidosEquipo(visitaId, corte, muestra, 'AND p.equipo_visitante_api_id=$1'),
    pool.query(`SELECT * FROM partidos_historial_deportivo WHERE fecha<$3 AND estado IN ('FT','AET','PEN','FINALIZADO') AND ((equipo_local_api_id=$1 AND equipo_visitante_api_id=$2) OR (equipo_local_api_id=$2 AND equipo_visitante_api_id=$1)) ORDER BY fecha DESC LIMIT 10`, [localId, visitaId, corte]),
  ]);

  let hl=0, he=0, hv=0, hg=0, hb=0, hc=0;
  for (const f of h2h.rows) {
    const gl=n(f.goles_local), gv=n(f.goles_visitante); if (gl===null || gv===null) continue;
    hc++; hg += gl+gv; if (gl>0 && gv>0) hb++;
    const localActualFueLocal=String(f.equipo_local_api_id)===localId;
    if (gl===gv) he++; else if ((gl>gv)===localActualFueLocal) hl++; else hv++;
  }
  const rl=resumen(localId,p.equipo_local,fl), rv=resumen(visitaId,p.equipo_visitante,fv);
  const totalMuestra=fl.length+fv.length;
  const totalStats=rl.partidosConEstadisticas+rv.partidosConEstadisticas;
  const coberturaPartidos=red(Math.min(100, totalMuestra*100/(muestra*2)),1) ?? 0;
  const coberturaStats=red(totalMuestra ? totalStats*100/totalMuestra : 0,1) ?? 0;
  const estado = coberturaPartidos >= 75 ? (coberturaStats >= 50 ? 'SUFICIENTE' : 'LIMITADA') : (coberturaPartidos >= 35 ? 'LIMITADA' : 'INSUFICIENTE');

  return {
    fixtureId, origenObjetivo:objetivo.origen, fechaCorte:corte.toISOString(), ligaApiId:String(p.liga_api_id), temporada:Number(p.temporada),
    partido:{local:{apiId:localId,nombre:p.equipo_local,logo:p.logo_local??null},visitante:{apiId:visitaId,nombre:p.equipo_visitante,logo:p.logo_visitante??null}},
    local:rl, visitante:rv, localEnCasa:resumen(localId,p.equipo_local,casa), visitanteFuera:resumen(visitaId,p.equipo_visitante,fuera),
    enfrentamientosDirectos:{partidos:hc,ganaLocalActual:hl,empates:he,ganaVisitanteActual:hv,golesPromedio:hc?red(hg/hc):null,ambosMarcanPct:pct(hb,hc)},
    calidad:{muestraObjetivoPorEquipo:muestra,muestraLocal:fl.length,muestraVisitante:fv.length,coberturaPartidosPct:coberturaPartidos,coberturaEstadisticasPct:coberturaStats,estado},
  };
}
