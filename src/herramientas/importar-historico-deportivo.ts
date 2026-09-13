/**
 * Importador histórico priorizado e incremental.
 *
 * Requiere los pasos 017, 018 y 019 ya instalados.
 * Trabaja únicamente con datos deportivos históricos.
 *
 * Objetivos:
 * - priorizar liga/temporada con más huecos;
 * - reutilizar cobertura almacenada cuando sigue vigente;
 * - no volver a pedir fixtures de temporadas ya completadas salvo que se solicite;
 * - descargar solo estadísticas/eventos pendientes;
 * - respetar límites globales de llamadas.
 *
 * Variables opcionales:
 *   HISTORICO_DESDE=2024   // opcional; si falta, usa año actual - 3
 *   HISTORICO_HASTA=2026   // opcional; si falta, usa año actual
 *   La carga histórica usa la cuota disponible del proveedor y respeta HISTORICO_RESERVA_CUOTA.
 *   HISTORICO_PAUSA_MS=350
 *   HISTORICO_COBERTURA_DIAS=30
 *   HISTORICO_REFRESCAR_FIXTURES=false
 *   HISTORICO_REINTENTAR_PARCIALES=false
 *   HISTORICO_RESERVA_CUOTA=10
 *   HISTORICO_EXIGIR_CUOTA_COMPLETA=true
 */

import 'dotenv/config';
import { pool } from '../infraestructura/db.js';
import { ProveedorApiFootball } from '../infraestructura/proveedores/apifootball.proveedor.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { estimarObjetivosImportacionHistorica } from '../servicios/estimacion-importacion-historica.servicio.js';

const ANIO_ACTUAL = new Date().getFullYear();
const DESDE = Number(process.env.HISTORICO_DESDE ?? (ANIO_ACTUAL - 3));
const HASTA = Number(process.env.HISTORICO_HASTA ?? ANIO_ACTUAL);
// La carga histórica ya no se corta por un tope artificial 60/60.
// La protección real es la cuota restante del proveedor menos HISTORICO_RESERVA_CUOTA.
const MAX_STATS = Number.MAX_SAFE_INTEGER;
const MAX_EVENTOS = Number.MAX_SAFE_INTEGER;
const PAUSA = Math.max(0, Number(process.env.HISTORICO_PAUSA_MS ?? 350));
const RESERVA_CUOTA = Math.max(0, Number(process.env.HISTORICO_RESERVA_CUOTA ?? 10));
const EXIGIR_CUOTA_COMPLETA = /^(1|true|si|sí)$/i.test(process.env.HISTORICO_EXIGIR_CUOTA_COMPLETA ?? 'true');
const COBERTURA_DIAS = Math.max(1, Number(process.env.HISTORICO_COBERTURA_DIAS ?? 30));
const REFRESCAR_FIXTURES = /^(1|true|si|sí)$/i.test(process.env.HISTORICO_REFRESCAR_FIXTURES ?? 'false');
const REINTENTAR_PARCIALES = /^(1|true|si|sí)$/i.test(process.env.HISTORICO_REINTENTAR_PARCIALES ?? 'false');
const FINALIZADOS = new Set(['FT', 'AET', 'PEN']);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string') {
    const n = Number(valor.replace('%', '').trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stat(equipo: any, tipo: string): number | null {
  const x = equipo?.statistics?.find((s: any) => s.type === tipo);
  return numero(x?.value);
}

type CoberturaSimple = {
  fixturesEstadisticas: boolean;
  fixturesEventos: boolean;
  consultadoEn: Date | null;
};

type Trabajo = {
  ligaApiId: string;
  liga: string;
  temporada: number;
  partidos: number;
  statsPendientes: number;
  eventosPendientes: number;
  camposParciales: number;
  importacionEstado: string | null;
  cobertura: CoberturaSimple | null;
  prioridad: number;
};

async function leerCobertura(ligaApiId: string, temporada: number): Promise<CoberturaSimple | null> {
  const { rows } = await pool.query(
    `SELECT fixtures_estadisticas, fixtures_eventos, consultado_en
       FROM cobertura_liga_temporada
      WHERE liga_api_id=$1 AND temporada=$2`,
    [ligaApiId, temporada],
  );
  if (!rows[0]) return null;
  return {
    fixturesEstadisticas: Boolean(rows[0].fixtures_estadisticas),
    fixturesEventos: Boolean(rows[0].fixtures_eventos),
    consultadoEn: rows[0].consultado_en ? new Date(rows[0].consultado_en) : null,
  };
}

function coberturaVigente(c: CoberturaSimple | null): boolean {
  if (!c?.consultadoEn || Number.isNaN(c.consultadoEn.getTime())) return false;
  return Date.now() - c.consultadoEn.getTime() <= COBERTURA_DIAS * 86_400_000;
}

async function guardarCobertura(c: Awaited<ReturnType<ProveedorApiFootball['coberturaTemporada']>>) {
  if (!c) return;
  await pool.query(
    `INSERT INTO cobertura_liga_temporada
      (liga_api_id, temporada, fixtures_eventos, fixtures_alineaciones,
       fixtures_estadisticas, jugadores_estadisticas, standings, jugadores,
       top_scorers, top_assists, top_cards, lesiones, predicciones, cuotas,
       payload, consultado_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,now())
     ON CONFLICT (liga_api_id, temporada)
     DO UPDATE SET fixtures_eventos=EXCLUDED.fixtures_eventos,
                   fixtures_alineaciones=EXCLUDED.fixtures_alineaciones,
                   fixtures_estadisticas=EXCLUDED.fixtures_estadisticas,
                   jugadores_estadisticas=EXCLUDED.jugadores_estadisticas,
                   standings=EXCLUDED.standings,
                   jugadores=EXCLUDED.jugadores,
                   top_scorers=EXCLUDED.top_scorers,
                   top_assists=EXCLUDED.top_assists,
                   top_cards=EXCLUDED.top_cards,
                   lesiones=EXCLUDED.lesiones,
                   predicciones=EXCLUDED.predicciones,
                   cuotas=EXCLUDED.cuotas,
                   payload=EXCLUDED.payload,
                   consultado_en=now()`,
    [
      c.ligaApiId, c.temporada, c.fixturesEventos, c.fixturesAlineaciones,
      c.fixturesEstadisticas, c.jugadoresEstadisticas, c.standings, c.jugadores,
      c.topScorers, c.topAssists, c.topCards, c.lesiones, c.predicciones, c.cuotas,
      JSON.stringify(c.raw ?? {}),
    ],
  );
}

async function guardarPartido(f: any): Promise<void> {
  await pool.query(
    `INSERT INTO partidos_historial_deportivo
      (fixture_api_id, liga_api_id, temporada, ronda, fecha, estado,
       equipo_local_api_id, equipo_visitante_api_id, equipo_local, equipo_visitante,
       logo_local, logo_visitante, goles_local, goles_visitante,
       goles_descanso_local, goles_descanso_visitante,
       goles_prorroga_local, goles_prorroga_visitante,
       penales_local, penales_visitante, payload_fixture, actualizado_en)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,now())
     ON CONFLICT (fixture_api_id)
     DO UPDATE SET liga_api_id=EXCLUDED.liga_api_id,
                   temporada=EXCLUDED.temporada,
                   ronda=EXCLUDED.ronda,
                   fecha=EXCLUDED.fecha,
                   estado=EXCLUDED.estado,
                   equipo_local_api_id=EXCLUDED.equipo_local_api_id,
                   equipo_visitante_api_id=EXCLUDED.equipo_visitante_api_id,
                   equipo_local=EXCLUDED.equipo_local,
                   equipo_visitante=EXCLUDED.equipo_visitante,
                   logo_local=COALESCE(EXCLUDED.logo_local, partidos_historial_deportivo.logo_local),
                   logo_visitante=COALESCE(EXCLUDED.logo_visitante, partidos_historial_deportivo.logo_visitante),
                   goles_local=EXCLUDED.goles_local,
                   goles_visitante=EXCLUDED.goles_visitante,
                   goles_descanso_local=EXCLUDED.goles_descanso_local,
                   goles_descanso_visitante=EXCLUDED.goles_descanso_visitante,
                   goles_prorroga_local=EXCLUDED.goles_prorroga_local,
                   goles_prorroga_visitante=EXCLUDED.goles_prorroga_visitante,
                   penales_local=EXCLUDED.penales_local,
                   penales_visitante=EXCLUDED.penales_visitante,
                   payload_fixture=EXCLUDED.payload_fixture,
                   actualizado_en=now()`,
    [
      String(f.fixture.id), String(f.league.id), Number(f.league.season),
      f.league.round ?? null, new Date(f.fixture.date), f.fixture.status.short,
      f.teams.home?.id == null ? null : String(f.teams.home.id),
      f.teams.away?.id == null ? null : String(f.teams.away.id),
      f.teams.home?.name ?? '', f.teams.away?.name ?? '',
      f.teams.home?.logo ?? null, f.teams.away?.logo ?? null,
      f.goals?.home ?? null, f.goals?.away ?? null,
      f.score?.halftime?.home ?? null, f.score?.halftime?.away ?? null,
      f.score?.extratime?.home ?? null, f.score?.extratime?.away ?? null,
      f.score?.penalty?.home ?? null, f.score?.penalty?.away ?? null,
      JSON.stringify(f),
    ],
  );
}

async function guardarStats(fixtureId: string, filas: any[]): Promise<boolean> {
  const validas = (filas ?? []).filter((e: any) => e?.team?.id != null);
  // Un fixture de fútbol debe devolver estadísticas para ambos equipos.
  // Si API-Football responde vacío/parcial, NO lo marcamos completo: queda pendiente.
  if (validas.length < 2) return false;

  for (let i = 0; i < validas.length; i++) {
    const e = validas[i];
    const equipoId = e.team?.id;
    if (equipoId == null) continue;
    await pool.query(
      `INSERT INTO estadisticas_partido_deportivo
        (fixture_api_id, equipo_api_id, equipo, es_local,
         tiros, tiros_arco, tiros_fuera, tiros_bloqueados, posesion, corners,
         faltas, amarillas, rojas, fueras_juego, pases, pases_correctos,
         precision_pases, atajadas, payload, actualizado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,now())
       ON CONFLICT (fixture_api_id, equipo_api_id)
       DO UPDATE SET equipo=EXCLUDED.equipo, es_local=EXCLUDED.es_local,
                     tiros=EXCLUDED.tiros, tiros_arco=EXCLUDED.tiros_arco,
                     tiros_fuera=EXCLUDED.tiros_fuera,
                     tiros_bloqueados=EXCLUDED.tiros_bloqueados,
                     posesion=EXCLUDED.posesion, corners=EXCLUDED.corners,
                     faltas=EXCLUDED.faltas, amarillas=EXCLUDED.amarillas,
                     rojas=EXCLUDED.rojas, fueras_juego=EXCLUDED.fueras_juego,
                     pases=EXCLUDED.pases, pases_correctos=EXCLUDED.pases_correctos,
                     precision_pases=EXCLUDED.precision_pases,
                     atajadas=EXCLUDED.atajadas, payload=EXCLUDED.payload,
                     actualizado_en=now()`,
      [
        fixtureId, String(equipoId), e.team?.name ?? '', i === 0,
        stat(e, 'Total Shots'), stat(e, 'Shots on Goal'), stat(e, 'Shots off Goal'),
        stat(e, 'Blocked Shots'), stat(e, 'Ball Possession'), stat(e, 'Corner Kicks'),
        stat(e, 'Fouls'), stat(e, 'Yellow Cards'), stat(e, 'Red Cards'),
        stat(e, 'Offsides'), stat(e, 'Total passes'), stat(e, 'Passes accurate'),
        stat(e, 'Passes %'), stat(e, 'Goalkeeper Saves'), JSON.stringify(e),
      ],
    );
  }
  await pool.query(
    `UPDATE partidos_historial_deportivo
        SET estadisticas_completas=true, actualizado_en=now()
      WHERE fixture_api_id=$1`,
    [fixtureId],
  );
  return true;
}

async function guardarEventos(fixtureId: string, eventos: any[]): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(`DELETE FROM eventos_partido_deportivo WHERE fixture_api_id=$1`, [fixtureId]);
    for (let i = 0; i < (eventos ?? []).length; i++) {
      const ev = eventos[i];
      await cliente.query(
        `INSERT INTO eventos_partido_deportivo
          (fixture_api_id, orden_evento, minuto, minuto_extra,
           equipo_api_id, equipo, jugador_api_id, jugador,
           asistente_api_id, asistente, tipo, detalle, comentarios,
           payload, actualizado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,now())`,
        [
          fixtureId, i, numero(ev.time?.elapsed), numero(ev.time?.extra),
          ev.team?.id == null ? null : String(ev.team.id), ev.team?.name ?? null,
          ev.player?.id == null ? null : String(ev.player.id), ev.player?.name ?? null,
          ev.assist?.id == null ? null : String(ev.assist.id), ev.assist?.name ?? null,
          ev.type ?? null, ev.detail ?? null, ev.comments ?? null, JSON.stringify(ev),
        ],
      );
    }
    await cliente.query(
      `UPDATE partidos_historial_deportivo
          SET eventos_completos=true, actualizado_en=now()
        WHERE fixture_api_id=$1`,
      [fixtureId],
    );
    await cliente.query('COMMIT');
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}

async function estadoTrabajo(ligaApiId: string, liga: string, temporada: number): Promise<Trabajo> {
  const [{ rows: r }, cobertura, { rows: imp }] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int partidos,
              COUNT(*) FILTER (WHERE NOT COALESCE(estadisticas_completas,false))::int stats_pendientes,
              COUNT(*) FILTER (WHERE NOT COALESCE(eventos_completos,false))::int eventos_pendientes,
              COUNT(e.*) FILTER (
                WHERE e.tiros IS NULL OR e.tiros_arco IS NULL OR e.corners IS NULL OR
                      e.amarillas IS NULL OR e.rojas IS NULL OR e.posesion IS NULL OR
                      e.faltas IS NULL OR e.fueras_juego IS NULL
              )::int campos_parciales
         FROM partidos_historial_deportivo p
    LEFT JOIN estadisticas_partido_deportivo e ON e.fixture_api_id=p.fixture_api_id
        WHERE p.liga_api_id=$1 AND p.temporada=$2
          AND p.estado IN ('FT','AET','PEN')`,
      [ligaApiId, temporada],
    ),
    leerCobertura(ligaApiId, temporada),
    pool.query(
      `SELECT estado FROM importaciones_historial_deportivo
        WHERE liga_api_id=$1 AND temporada=$2`,
      [ligaApiId, temporada],
    ),
  ]);

  const partidos = Number(r[0]?.partidos ?? 0);
  const statsPendientes = Number(r[0]?.stats_pendientes ?? 0);
  const eventosPendientes = Number(r[0]?.eventos_pendientes ?? 0);
  const camposParciales = Number(r[0]?.campos_parciales ?? 0);
  const importacionEstado = imp[0]?.estado ? String(imp[0].estado) : null;

  let prioridad = partidos === 0 ? 100 : 0;
  if (partidos > 0) {
    const statsAccionables = cobertura?.fixturesEstadisticas === false ? 0 : statsPendientes;
    const eventosAccionables = cobertura?.fixturesEventos === false ? 0 : eventosPendientes;
    prioridad += Math.round((statsAccionables / partidos) * 50);
    prioridad += Math.round((eventosAccionables / partidos) * 35);
    if (REINTENTAR_PARCIALES) prioridad += Math.min(10, Math.round((camposParciales / Math.max(1, partidos * 2)) * 10));
    if (importacionEstado !== 'COMPLETO') prioridad += 5;
  }
  if (!coberturaVigente(cobertura)) prioridad += 5;

  return {
    ligaApiId, liga, temporada, partidos, statsPendientes, eventosPendientes,
    camposParciales, importacionEstado, cobertura, prioridad: Math.min(100, prioridad),
  };
}

async function marcarImportacion(
  ligaApiId: string,
  temporada: number,
  estado: 'EN_PROCESO' | 'PARCIAL' | 'COMPLETO' | 'ERROR',
  fixturesGuardados: number,
  statsGuardadas: number,
  error: string | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO importaciones_historial_deportivo
      (liga_api_id, temporada, estado, fixtures_guardados, estadisticas_guardadas,
       error, iniciado_en, finalizado_en)
     VALUES ($1,$2,$3::text,$4,$5,$6,
             CASE WHEN $3::text='EN_PROCESO' THEN now() ELSE NULL END,
             CASE WHEN $3::text IN ('COMPLETO','PARCIAL','ERROR') THEN now() ELSE NULL END)
     ON CONFLICT (liga_api_id, temporada)
     DO UPDATE SET estado=EXCLUDED.estado,
                   fixtures_guardados=GREATEST(importaciones_historial_deportivo.fixtures_guardados, EXCLUDED.fixtures_guardados),
                   estadisticas_guardadas=GREATEST(importaciones_historial_deportivo.estadisticas_guardadas, EXCLUDED.estadisticas_guardadas),
                   error=EXCLUDED.error,
                   iniciado_en=CASE WHEN EXCLUDED.estado='EN_PROCESO' THEN now() ELSE importaciones_historial_deportivo.iniciado_en END,
                   finalizado_en=CASE WHEN EXCLUDED.estado IN ('COMPLETO','PARCIAL','ERROR') THEN now() ELSE importaciones_historial_deportivo.finalizado_en END`,
    [ligaApiId, temporada, estado, fixturesGuardados, statsGuardadas, error],
  );
}

class PausaImportacionPorCuota extends Error {
  constructor(public readonly restantes: number, public readonly reserva: number) {
    super(`Reserva de cuota alcanzada: quedan ${restantes} llamadas y se reservan ${reserva}`);
    this.name = 'PausaImportacionPorCuota';
  }
}

function asegurarReservaCuota(proveedor: ProveedorApiFootball, reserva = RESERVA_CUOTA): void {
  if (proveedor.restantes !== null && proveedor.restantes <= reserva) {
    throw new PausaImportacionPorCuota(proveedor.restantes, reserva);
  }
}

export type ObjetivoImportacionHistorica = { ligaApiId: string; temporada: number; liga?: string };

export type OpcionesImportacionHistorica = {
  objetivos?: ObjetivoImportacionHistorica[];
  maxStats?: number;
  maxEventos?: number;
  refrescarFixtures?: boolean;
  reintentarParciales?: boolean;
  reservaCuota?: number;
};

export async function ejecutarImportacionHistorica(opciones: OpcionesImportacionHistorica = {}): Promise<void> {
  if (!Number.isInteger(DESDE) || !Number.isInteger(HASTA) || DESDE > HASTA) {
    throw new Error('Rango HISTORICO_DESDE/HISTORICO_HASTA inválido');
  }

  const proveedor = new ProveedorApiFootball();
  const estado = await proveedor.estado();
  if (!estado.ok) throw new Error('API-Football no disponible o clave inválida');

  const plan: Trabajo[] = [];
  const objetivos = (opciones.objetivos ?? []).filter((x) => x?.ligaApiId && Number.isInteger(x.temporada));

  if (objetivos.length) {
    const unicos = new Map<string, ObjetivoImportacionHistorica>();
    for (const o of objetivos) unicos.set(`${o.ligaApiId}:${o.temporada}`, o);
    for (const o of unicos.values()) {
      let nombre = o.liga?.trim() || '';
      if (!nombre) {
        const { rows } = await pool.query(`SELECT nombre FROM v_ligas WHERE api_id::text=$1 LIMIT 1`, [o.ligaApiId]);
        nombre = rows[0]?.nombre ? String(rows[0].nombre) : `Liga ${o.ligaApiId}`;
      }
      plan.push(await estadoTrabajo(String(o.ligaApiId), nombre, Number(o.temporada)));
    }
  } else {
    const { rows: ligas } = await pool.query(
      `SELECT DISTINCT l.api_id, l.nombre
         FROM v_ligas l
         JOIN ligas bl ON bl.id = l.id
        WHERE bl.seleccionada_panel = TRUE
          AND bl.eliminado_en IS NULL
        ORDER BY l.nombre`,
    );
    for (const liga of ligas) {
      for (let temporada = DESDE; temporada <= HASTA; temporada++) {
        plan.push(await estadoTrabajo(String(liga.api_id), String(liga.nombre), temporada));
      }
    }
  }

  plan.sort((a, b) => b.prioridad - a.prioridad || b.temporada - a.temporada || a.liga.localeCompare(b.liga));

  const seleccion = objetivos.length
    ? plan
    : plan.filter((x) => x.prioridad > 0);

  const ligasEnPlan = new Set(plan.map((x) => x.ligaApiId)).size;
  console.log(`Ligas activas detectadas: ${ligasEnPlan}`);
  console.log(`Histórico priorizado · ${seleccion.length}/${plan.length} liga/temporada con trabajo`);
  console.table(seleccion.map((x) => ({
    liga: x.liga, temporada: x.temporada, prioridad: x.prioridad,
    partidos: x.partidos, stats: x.statsPendientes, eventos: x.eventosPendientes,
  })));

  const limiteStats = Math.max(0, opciones.maxStats ?? MAX_STATS);
  const limiteEventos = Math.max(0, opciones.maxEventos ?? MAX_EVENTOS);
  const refrescarFixtures = opciones.refrescarFixtures ?? REFRESCAR_FIXTURES;
  const reintentarParciales = opciones.reintentarParciales ?? REINTENTAR_PARCIALES;
  const reservaCuota = Math.max(0, opciones.reservaCuota ?? RESERVA_CUOTA);

  let statsConsumidas = 0;
  let eventosConsumidos = 0;
  let fixturesGuardadosTotal = 0;

  for (const tarea of seleccion) {
    const { ligaApiId, liga, temporada } = tarea;
    console.log(`\n[${tarea.prioridad}] ${liga} · ${temporada}`);
    let fixturesGuardados = 0;
    let statsGuardadas = 0;

    try {
      const estimacion = await estimarObjetivosImportacionHistorica(
        [{ ligaApiId, temporada, liga }],
        {
          refrescarFixtures,
          reintentarParciales,
          coberturaDias: COBERTURA_DIAS,
          reservaCuota,
          maxStats: Math.max(0, limiteStats - statsConsumidas),
          maxEventos: Math.max(0, limiteEventos - eventosConsumidos),
        },
      );
      const ei = estimacion.items[0];
      const restantesProveedor = proveedor.restantes;
      const disponiblesProveedor = restantesProveedor === null ? null : Math.max(0, restantesProveedor - reservaCuota);
      const necesariasCompletar = Number(ei?.llamadas?.totalParaCompletar ?? 0);
      const necesariasPlan = Number(ei?.llamadas?.totalPlanActual ?? 0);
      console.log(`  estimación API: completar=${necesariasCompletar} llamadas · plan actual=${necesariasPlan}${disponiblesProveedor===null?' · cuota desconocida':` · disponibles=${disponiblesProveedor}`}`);

      if (EXIGIR_CUOTA_COMPLETA && disponiblesProveedor !== null && necesariasCompletar > disponiblesProveedor) {
        const msg = `Cuota insuficiente estimada: se necesitan ${necesariasCompletar} llamadas para completar y hay ${disponiblesProveedor} disponibles después de la reserva`;
        console.warn(`  se pospone: ${msg}`);
        await marcarImportacion(ligaApiId, temporada, 'PARCIAL', tarea.partidos, 0, msg);
        continue;
      }
      if (!EXIGIR_CUOTA_COMPLETA && disponiblesProveedor !== null && necesariasPlan > disponiblesProveedor) {
        console.warn(`  aviso: el plan actual estima ${necesariasPlan} llamadas y hay ${disponiblesProveedor}; se procesará hasta alcanzar la reserva.`);
      }

      await marcarImportacion(ligaApiId, temporada, 'EN_PROCESO', tarea.partidos, 0);

      let cobertura = tarea.cobertura;
      if (!coberturaVigente(cobertura)) {
        asegurarReservaCuota(proveedor, reservaCuota);
        const nueva = await proveedor.coberturaTemporada(ligaApiId, temporada);
        await guardarCobertura(nueva);
        await dormir(PAUSA);
        if (!nueva) {
          console.log('  sin cobertura/temporada; se omite');
          await marcarImportacion(ligaApiId, temporada, 'COMPLETO', tarea.partidos, 0);
          continue;
        }
        cobertura = {
          fixturesEstadisticas: nueva.fixturesEstadisticas,
          fixturesEventos: nueva.fixturesEventos,
          consultadoEn: new Date(),
        };
      }

      const debeRefrescarFixtures = refrescarFixtures || tarea.partidos === 0;
      if (debeRefrescarFixtures) {
        asegurarReservaCuota(proveedor, reservaCuota);
        const fixtures = await proveedor.fixturesHistoricos(ligaApiId, temporada);
        await dormir(PAUSA);
        const finales = fixtures.filter((f: any) => FINALIZADOS.has(f.fixture?.status?.short));
        for (const f of finales) {
          await guardarPartido(f);
          fixturesGuardados++;
          fixturesGuardadosTotal++;
        }
        console.log(`  fixtures actualizados: ${finales.length}`);
      } else {
        console.log('  fixtures: reutilizados desde BD');
      }

      if (cobertura?.fixturesEstadisticas && statsConsumidas < limiteStats) {
        const parcialSql = reintentarParciales
          ? ` OR EXISTS (
                SELECT 1 FROM estadisticas_partido_deportivo e
                 WHERE e.fixture_api_id=p.fixture_api_id
                   AND (e.tiros IS NULL OR e.tiros_arco IS NULL OR e.corners IS NULL OR
                        e.amarillas IS NULL OR e.rojas IS NULL OR e.posesion IS NULL OR
                        e.faltas IS NULL OR e.fueras_juego IS NULL)
              )`
          : '';
        const { rows: pendientes } = await pool.query(
          `SELECT p.fixture_api_id
             FROM partidos_historial_deportivo p
            WHERE p.liga_api_id=$1 AND p.temporada=$2
              AND p.estado IN ('FT','AET','PEN')
              AND (NOT COALESCE(p.estadisticas_completas,false)${parcialSql})
            ORDER BY p.fecha DESC`,
          [ligaApiId, temporada],
        );
        for (const p of pendientes) {
          if (statsConsumidas >= limiteStats) break;
          asegurarReservaCuota(proveedor, reservaCuota);
          const filas = await proveedor.estadisticasHistoricas(String(p.fixture_api_id));
          const completa = await guardarStats(String(p.fixture_api_id), filas);
          statsConsumidas++;
          if (completa) statsGuardadas++;
          else console.warn(`  stats incompletas/vacías para fixture ${p.fixture_api_id}; queda pendiente`);
          await dormir(PAUSA);
        }
        console.log(`  stats completadas ahora: ${statsGuardadas}`);
      } else if (!cobertura?.fixturesEstadisticas) {
        console.log('  stats: N/D según coverage');
      }

      let eventosGuardados = 0;
      if (cobertura?.fixturesEventos && eventosConsumidos < limiteEventos) {
        const { rows: pendientes } = await pool.query(
          `SELECT fixture_api_id
             FROM partidos_historial_deportivo
            WHERE liga_api_id=$1 AND temporada=$2
              AND estado IN ('FT','AET','PEN')
              AND NOT COALESCE(eventos_completos,false)
            ORDER BY fecha DESC`,
          [ligaApiId, temporada],
        );
        for (const p of pendientes) {
          if (eventosConsumidos >= limiteEventos) break;
          asegurarReservaCuota(proveedor, reservaCuota);
          const eventos = await proveedor.eventosHistoricos(String(p.fixture_api_id));
          await guardarEventos(String(p.fixture_api_id), eventos);
          eventosConsumidos++;
          eventosGuardados++;
          await dormir(PAUSA);
        }
        console.log(`  eventos completados ahora: ${eventosGuardados}`);
      } else if (!cobertura?.fixturesEventos) {
        console.log('  eventos: N/D según coverage');
      }

      const despues = await estadoTrabajo(ligaApiId, liga, temporada);
      const statsAccionables = cobertura?.fixturesEstadisticas ? despues.statsPendientes : 0;
      const eventosAccionables = cobertura?.fixturesEventos ? despues.eventosPendientes : 0;
      const completa = statsAccionables === 0 && eventosAccionables === 0;
      await marcarImportacion(
        ligaApiId, temporada, completa ? 'COMPLETO' : 'PARCIAL',
        Math.max(tarea.partidos, fixturesGuardados), statsGuardadas,
      );

      console.log(`  estado: ${completa ? 'COMPLETO' : 'PARCIAL'} · pendientes stats=${statsAccionables} eventos=${eventosAccionables}`);
      console.log(`  consumo global: stats ${statsConsumidas} · eventos ${eventosConsumidos} · límite real: reserva de cuota API`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof PausaImportacionPorCuota) {
        console.warn(`  pausa preventiva: ${msg}`);
        await marcarImportacion(ligaApiId, temporada, 'PARCIAL', fixturesGuardados, statsGuardadas, msg).catch(() => undefined);
        console.warn('  Se detiene esta ejecución para conservar la reserva de API-Football.');
        break;
      }
      console.error(`  error: ${msg}`);
      await marcarImportacion(ligaApiId, temporada, 'ERROR', fixturesGuardados, statsGuardadas, msg).catch(() => undefined);
    }
  }

  console.log(`\nListo. Fixtures actualizados: ${fixturesGuardadosTotal}. Stats: ${statsConsumidas}. Eventos: ${eventosConsumidos}.`);
}

const ejecutadoDirectamente = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (ejecutadoDirectamente) {
  ejecutarImportacionHistorica().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  }).finally(async () => {
    await pool.end().catch(() => undefined);
  });
}
