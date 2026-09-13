import { pool } from '../infraestructura/db.js';

export type SeveridadAnomalia = 'CRITICA' | 'ALTA' | 'MEDIA';
export type TipoAnomalia = 'IMPOSIBLE' | 'INCONSISTENTE' | 'EXTREMO';

export interface FiltrosDeteccionAnomalias {
  ligaApiId?: string;
  temporada?: number;
  limite?: number;
  incluirExtremos?: boolean;
}

interface PartidoRow {
  fixture_api_id: string;
  liga_api_id: string;
  temporada: number;
  fecha: Date | string;
  equipo_local: string;
  equipo_visitante: string;
  goles_local: number | null;
  goles_visitante: number | null;
  goles_descanso_local: number | null;
  goles_descanso_visitante: number | null;
  penales_local: number | null;
  penales_visitante: number | null;
}

interface EstadisticaRow {
  fixture_api_id: string;
  equipo_api_id: string | null;
  equipo: string | null;
  es_local: boolean | null;
  tiros: number | null;
  tiros_arco: number | null;
  tiros_fuera: number | null;
  tiros_bloqueados: number | null;
  posesion: number | null;
  corners: number | null;
  faltas: number | null;
  amarillas: number | null;
  rojas: number | null;
  fueras_juego: number | null;
  pases: number | null;
  pases_correctos: number | null;
  precision_pases: number | null;
  atajadas: number | null;
}

interface EventoResumenRow {
  fixture_api_id: string;
  eventos: number;
  minuto_min: number | null;
  minuto_max: number | null;
  minutos_negativos: number;
  extras_negativos: number;
}

interface Anomalia {
  fixtureId: string;
  ligaApiId: string;
  temporada: number;
  fecha: string;
  partido: string;
  tipo: TipoAnomalia;
  severidad: SeveridadAnomalia;
  campo: string;
  valor: number | string | null;
  esperado: string;
  detalle: string;
  equipo?: string | null;
}

const CAMPOS_ESTADISTICOS: Array<keyof Pick<EstadisticaRow,
  'tiros' | 'tiros_arco' | 'tiros_fuera' | 'tiros_bloqueados' | 'posesion' |
  'corners' | 'faltas' | 'amarillas' | 'rojas' | 'fueras_juego' | 'pases' |
  'pases_correctos' | 'precision_pases' | 'atajadas'
>> = [
  'tiros', 'tiros_arco', 'tiros_fuera', 'tiros_bloqueados', 'posesion',
  'corners', 'faltas', 'amarillas', 'rojas', 'fueras_juego', 'pases',
  'pases_correctos', 'precision_pases', 'atajadas',
];

const red = (n: number): number => Number(n.toFixed(1));

function cuantiles(xs: number[]): { q1: number; q3: number; iqr: number } | null {
  if (xs.length < 12) return null;
  const a = [...xs].sort((x, y) => x - y);
  const q = (p: number): number => {
    const pos = (a.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return a[lo]!;
    const f = pos - lo;
    return a[lo]! * (1 - f) + a[hi]! * f;
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  return { q1, q3, iqr: q3 - q1 };
}

function fechaIso(v: Date | string): string {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : String(v);
}

function n(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * Detecta anomalías de calidad en el histórico antes de que sus valores se
 * utilicen en análisis posteriores. Las reglas se mantienen deliberadamente
 * conservadoras para reducir falsos positivos:
 * - valores físicamente/imposiblemente inválidos;
 * - relaciones internas incoherentes;
 * - extremos estadísticos por IQR (solo con >=12 observaciones y 3*IQR).
 *
 * No corrige ni elimina registros automáticamente. Solo diagnostica.
 */
export async function detectarAnomaliasHistoricas(
  filtros: FiltrosDeteccionAnomalias = {},
): Promise<any> {
  const limite = Math.max(1, Math.min(5000, Number(filtros.limite ?? 1000)));
  const incluirExtremos = filtros.incluirExtremos !== false;
  const valores: unknown[] = [];
  const where = [`p.estado IN ('FT','AET','PEN','FINALIZADO')`];

  if (filtros.ligaApiId) {
    valores.push(String(filtros.ligaApiId));
    where.push(`p.liga_api_id = $${valores.length}`);
  }
  if (filtros.temporada != null) {
    valores.push(Number(filtros.temporada));
    where.push(`p.temporada = $${valores.length}`);
  }
  valores.push(limite);

  const partidosQ = await pool.query<PartidoRow>(`
    SELECT p.fixture_api_id, p.liga_api_id, p.temporada, p.fecha,
           p.equipo_local, p.equipo_visitante,
           p.goles_local, p.goles_visitante,
           p.goles_descanso_local, p.goles_descanso_visitante,
           p.penales_local, p.penales_visitante
      FROM partidos_historial_deportivo p
     WHERE ${where.join(' AND ')}
     ORDER BY p.fecha DESC
     LIMIT $${valores.length}
  `, valores);

  const partidos = partidosQ.rows;
  const fixtureIds = partidos.map((p) => String(p.fixture_api_id));
  if (!fixtureIds.length) {
    return {
      generadoEn: new Date().toISOString(),
      filtros: { ligaApiId: filtros.ligaApiId ?? null, temporada: filtros.temporada ?? null, limite, incluirExtremos },
      resumen: { partidosRevisados: 0, anomalias: 0, criticas: 0, altas: 0, medias: 0, partidosConAnomalias: 0 },
      campos: [], anomalias: [],
      aviso: 'Diagnóstico de calidad del histórico. No modifica registros automáticamente.',
    };
  }

  const [statsQ, eventosQ] = await Promise.all([
    pool.query<EstadisticaRow>(`
      SELECT fixture_api_id, equipo_api_id, equipo, es_local,
             tiros, tiros_arco, tiros_fuera, tiros_bloqueados, posesion,
             corners, faltas, amarillas, rojas, fueras_juego,
             pases, pases_correctos, precision_pases, atajadas
        FROM estadisticas_partido_deportivo
       WHERE fixture_api_id = ANY($1::varchar[])
    `, [fixtureIds]),
    pool.query<EventoResumenRow>(`
      SELECT fixture_api_id,
             COUNT(*)::int AS eventos,
             MIN(minuto)::int AS minuto_min,
             MAX(COALESCE(minuto,0) + COALESCE(minuto_extra,0))::int AS minuto_max,
             COUNT(*) FILTER (WHERE minuto < 0)::int AS minutos_negativos,
             COUNT(*) FILTER (WHERE minuto_extra < 0)::int AS extras_negativos
        FROM eventos_partido_deportivo
       WHERE fixture_api_id = ANY($1::varchar[])
       GROUP BY fixture_api_id
    `, [fixtureIds]),
  ]);

  const porFixtureStats = new Map<string, EstadisticaRow[]>();
  for (const s of statsQ.rows) {
    const k = String(s.fixture_api_id);
    const arr = porFixtureStats.get(k) ?? [];
    arr.push(s);
    porFixtureStats.set(k, arr);
  }
  const porFixtureEventos = new Map(eventosQ.rows.map((e) => [String(e.fixture_api_id), e] as const));
  const partidoPorId = new Map(partidos.map((p) => [String(p.fixture_api_id), p] as const));

  const anomalias: Anomalia[] = [];
  const push = (p: PartidoRow, a: Omit<Anomalia, 'fixtureId'|'ligaApiId'|'temporada'|'fecha'|'partido'>): void => {
    anomalias.push({
      fixtureId: String(p.fixture_api_id), ligaApiId: String(p.liga_api_id), temporada: Number(p.temporada),
      fecha: fechaIso(p.fecha), partido: `${p.equipo_local} vs ${p.equipo_visitante}`, ...a,
    });
  };

  // 1) Reglas imposibles/inconsistentes de marcador.
  for (const p of partidos) {
    for (const [campo, valor] of [
      ['goles_local', p.goles_local], ['goles_visitante', p.goles_visitante],
      ['goles_descanso_local', p.goles_descanso_local], ['goles_descanso_visitante', p.goles_descanso_visitante],
      ['penales_local', p.penales_local], ['penales_visitante', p.penales_visitante],
    ] as Array<[string, number | null]>) {
      if (valor != null && Number(valor) < 0) push(p, { tipo: 'IMPOSIBLE', severidad: 'CRITICA', campo, valor: Number(valor), esperado: '>= 0', detalle: 'Un marcador no puede ser negativo.' });
    }
    if (p.goles_local != null && p.goles_descanso_local != null && p.goles_descanso_local > p.goles_local) {
      push(p, { tipo: 'INCONSISTENTE', severidad: 'ALTA', campo: 'goles_descanso_local', valor: p.goles_descanso_local, esperado: `<= goles_local (${p.goles_local})`, detalle: 'El marcador del descanso supera el marcador final del local.' });
    }
    if (p.goles_visitante != null && p.goles_descanso_visitante != null && p.goles_descanso_visitante > p.goles_visitante) {
      push(p, { tipo: 'INCONSISTENTE', severidad: 'ALTA', campo: 'goles_descanso_visitante', valor: p.goles_descanso_visitante, esperado: `<= goles_visitante (${p.goles_visitante})`, detalle: 'El marcador del descanso supera el marcador final del visitante.' });
    }
  }

  // 2) Valores inválidos y consistencia entre campos por equipo.
  for (const s of statsQ.rows) {
    const p = partidoPorId.get(String(s.fixture_api_id));
    if (!p) continue;
    for (const campo of CAMPOS_ESTADISTICOS) {
      const valor = n(s[campo]);
      if (valor != null && valor < 0) push(p, { tipo: 'IMPOSIBLE', severidad: 'CRITICA', campo, valor, esperado: '>= 0', detalle: 'La estadística no puede ser negativa.', equipo: s.equipo });
    }
    const posesion = n(s.posesion);
    if (posesion != null && posesion > 100) push(p, { tipo: 'IMPOSIBLE', severidad: 'CRITICA', campo: 'posesion', valor: posesion, esperado: '0 a 100', detalle: 'La posesión individual supera 100%.', equipo: s.equipo });
    const precision = n(s.precision_pases);
    if (precision != null && precision > 100) push(p, { tipo: 'IMPOSIBLE', severidad: 'CRITICA', campo: 'precision_pases', valor: precision, esperado: '0 a 100', detalle: 'La precisión de pases supera 100%.', equipo: s.equipo });
    const pases = n(s.pases); const correctos = n(s.pases_correctos);
    if (pases != null && correctos != null && correctos > pases) push(p, { tipo: 'INCONSISTENTE', severidad: 'ALTA', campo: 'pases_correctos', valor: correctos, esperado: `<= pases (${pases})`, detalle: 'Los pases correctos superan el total de pases.', equipo: s.equipo });
    const tiros = n(s.tiros); const arco = n(s.tiros_arco);
    if (tiros != null && arco != null && arco > tiros) push(p, { tipo: 'INCONSISTENTE', severidad: 'ALTA', campo: 'tiros_arco', valor: arco, esperado: `<= tiros (${tiros})`, detalle: 'Los tiros al arco superan el total de tiros.', equipo: s.equipo });
  }

  // Posesión de ambos equipos: tolerancia amplia por redondeos/proveedor.
  for (const p of partidos) {
    const ss = porFixtureStats.get(String(p.fixture_api_id)) ?? [];
    if (ss.length === 2) {
      const a = n(ss[0]!.posesion), b = n(ss[1]!.posesion);
      if (a != null && b != null) {
        const total = a + b;
        if (total < 95 || total > 105) push(p, { tipo: 'INCONSISTENTE', severidad: 'MEDIA', campo: 'posesion_total', valor: red(total), esperado: 'aprox. 100% (95–105)', detalle: 'La suma de posesión de ambos equipos está fuera de la tolerancia.' });
      }
    }
  }

  // 3) Cronología de eventos.
  for (const e of eventosQ.rows) {
    const p = partidoPorId.get(String(e.fixture_api_id));
    if (!p) continue;
    if (Number(e.minutos_negativos) > 0) push(p, { tipo: 'IMPOSIBLE', severidad: 'CRITICA', campo: 'evento.minuto', valor: Number(e.minuto_min), esperado: '>= 0', detalle: 'Existen eventos con minuto negativo.' });
    if (Number(e.extras_negativos) > 0) push(p, { tipo: 'IMPOSIBLE', severidad: 'CRITICA', campo: 'evento.minuto_extra', valor: 'negativo', esperado: '>= 0', detalle: 'Existen eventos con tiempo añadido negativo.' });
    if (e.minuto_max != null && Number(e.minuto_max) > 150) push(p, { tipo: 'INCONSISTENTE', severidad: 'ALTA', campo: 'evento.minuto_total', valor: Number(e.minuto_max), esperado: '<= 150', detalle: 'La cronología contiene un minuto extraordinariamente superior a la duración esperable de un partido.' });
  }

  // 4) Extremos robustos por liga+temporada+campo. No son "errores": solo revisión.
  const camposResumen = new Map<string, { muestras: number; q1: number; q3: number; iqr: number; extremos: number }>();
  if (incluirExtremos) {
    const grupos = new Map<string, Array<{ row: EstadisticaRow; p: PartidoRow; valor: number }>>();
    for (const s of statsQ.rows) {
      const p = partidoPorId.get(String(s.fixture_api_id));
      if (!p) continue;
      for (const campo of CAMPOS_ESTADISTICOS) {
        const valor = n(s[campo]);
        if (valor == null || valor < 0) continue;
        const key = `${p.liga_api_id}|${p.temporada}|${campo}`;
        const arr = grupos.get(key) ?? [];
        arr.push({ row: s, p, valor });
        grupos.set(key, arr);
      }
    }
    for (const [key, obs] of grupos) {
      const qq = cuantiles(obs.map((x) => x.valor));
      if (!qq || qq.iqr <= 0) continue;
      const low = qq.q1 - 3 * qq.iqr;
      const high = qq.q3 + 3 * qq.iqr;
      let extremos = 0;
      for (const o of obs) {
        if (o.valor < low || o.valor > high) {
          extremos++;
          const campo = key.split('|')[2]!;
          push(o.p, { tipo: 'EXTREMO', severidad: 'MEDIA', campo, valor: red(o.valor), esperado: `${red(low)} a ${red(high)} (3×IQR)`, detalle: 'Valor extremo respecto de la misma liga y temporada. Requiere revisión; no se considera error automáticamente.', equipo: o.row.equipo });
        }
      }
      camposResumen.set(key, { muestras: obs.length, q1: red(qq.q1), q3: red(qq.q3), iqr: red(qq.iqr), extremos });
    }
  }

  const ordenSev: Record<SeveridadAnomalia, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2 };
  anomalias.sort((a, b) => ordenSev[a.severidad] - ordenSev[b.severidad] || b.fecha.localeCompare(a.fecha));
  const fixtureCon = new Set(anomalias.map((a) => a.fixtureId));

  return {
    generadoEn: new Date().toISOString(),
    filtros: { ligaApiId: filtros.ligaApiId ?? null, temporada: filtros.temporada ?? null, limite, incluirExtremos },
    resumen: {
      partidosRevisados: partidos.length,
      filasEstadisticasRevisadas: statsQ.rows.length,
      partidosConEventos: eventosQ.rows.length,
      anomalias: anomalias.length,
      criticas: anomalias.filter((a) => a.severidad === 'CRITICA').length,
      altas: anomalias.filter((a) => a.severidad === 'ALTA').length,
      medias: anomalias.filter((a) => a.severidad === 'MEDIA').length,
      imposibles: anomalias.filter((a) => a.tipo === 'IMPOSIBLE').length,
      inconsistentes: anomalias.filter((a) => a.tipo === 'INCONSISTENTE').length,
      extremos: anomalias.filter((a) => a.tipo === 'EXTREMO').length,
      partidosConAnomalias: fixtureCon.size,
      saludPct: partidos.length ? red(Math.max(0, (partidos.length - fixtureCon.size) * 100 / partidos.length)) : 0,
    },
    campos: [...camposResumen.entries()].map(([clave, x]) => {
      const [ligaApiId, temporada, campo] = clave.split('|');
      return { ligaApiId, temporada: Number(temporada), campo, ...x };
    }).filter((x) => x.extremos > 0),
    anomalias: anomalias.slice(0, 1000),
    aviso: 'Detector técnico de calidad. Los valores EXTREMO son señales para revisión y no se eliminan ni corrigen automáticamente. No genera pronósticos ni recomendaciones deportivas.',
  };
}
