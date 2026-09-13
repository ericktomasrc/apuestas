import { pool } from '../infraestructura/db.js';
import { analizarCompatibilidadReglas, type EstadoDatosRegla } from './analisis-reglas.servicio.js';

export type EstadoCoberturaRegla = 'LISTA' | 'PARCIAL' | 'NECESITA_DATOS' | 'SIN_MUESTRA';

export interface FiltrosCoberturaReglas {
  ligaApiId?: string;
  temporada?: number;
  muestra?: number;
  limite?: number;
}

interface FixtureBase {
  fixture_api_id: string;
  liga_api_id: string;
  temporada: number;
}

export interface CoberturaReglaHistorica {
  codigo: string;
  nombre: string;
  categoria: string;
  evaluaciones: number;
  utilizables: number;
  limitadas: number;
  descartadas: number;
  noImplementadas: number;
  utilizablesPct: number;
  coberturaPromedioPct: number;
  coberturaMinPct: number;
  coberturaMaxPct: number;
  estado: EstadoCoberturaRegla;
  senales: string[];
}

const pct = (n: number, d: number): number => d > 0 ? Number((n * 100 / d).toFixed(1)) : 0;
const red = (n: number): number => Number(n.toFixed(1));

function estadoRegla(x: CoberturaReglaHistorica): EstadoCoberturaRegla {
  if (!x.evaluaciones) return 'SIN_MUESTRA';
  if (x.utilizablesPct >= 75 && x.coberturaPromedioPct >= 70 && x.noImplementadas === 0) return 'LISTA';
  if (x.utilizablesPct >= 40 || x.coberturaPromedioPct >= 40) return 'PARCIAL';
  return 'NECESITA_DATOS';
}

export async function calcularCobertura79Reglas(
  filtros: FiltrosCoberturaReglas = {},
): Promise<any> {
  const muestra = Math.max(5, Math.min(50, Number(filtros.muestra ?? 20)));
  const limite = Math.max(1, Math.min(100, Number(filtros.limite ?? 40)));
  const valores: unknown[] = [];
  const where = [`p.estado IN ('FT','AET','PEN','FINALIZADO')`, 'p.fecha < NOW()'];

  if (filtros.ligaApiId) {
    valores.push(String(filtros.ligaApiId));
    where.push(`p.liga_api_id = $${valores.length}`);
  }
  if (filtros.temporada != null) {
    valores.push(Number(filtros.temporada));
    where.push(`p.temporada = $${valores.length}`);
  }
  valores.push(limite);

  const { rows } = await pool.query<FixtureBase>(`
    SELECT p.fixture_api_id, p.liga_api_id, p.temporada
      FROM partidos_historial_deportivo p
     WHERE ${where.join(' AND ')}
     ORDER BY p.fecha DESC
     LIMIT $${valores.length}
  `, valores);

  const mapa = new Map<string, {
    codigo: string; nombre: string; categoria: string; evaluaciones: number;
    utilizables: number; limitadas: number; descartadas: number; noImplementadas: number;
    sumaCobertura: number; minCobertura: number; maxCobertura: number; senales: Set<string>;
  }>();
  let procesados = 0;
  let omitidos = 0;

  // Secuencial a propósito: evita ráfagas de consultas al analizar muchos partidos.
  for (const f of rows) {
    try {
      const r = await analizarCompatibilidadReglas(String(f.fixture_api_id), muestra);
      if (!r) { omitidos++; continue; }
      procesados++;
      for (const regla of r.reglas) {
        let x = mapa.get(regla.codigo);
        if (!x) {
          x = {
            codigo: regla.codigo, nombre: regla.nombre, categoria: regla.categoria,
            evaluaciones: 0, utilizables: 0, limitadas: 0, descartadas: 0, noImplementadas: 0,
            sumaCobertura: 0, minCobertura: 100, maxCobertura: 0, senales: new Set<string>(),
          };
          mapa.set(regla.codigo, x);
        }
        x.evaluaciones++;
        x.sumaCobertura += Number(regla.coberturaPct || 0);
        x.minCobertura = Math.min(x.minCobertura, Number(regla.coberturaPct || 0));
        x.maxCobertura = Math.max(x.maxCobertura, Number(regla.coberturaPct || 0));
        for (const s of regla.senales || []) x.senales.add(String(s));
        const e: EstadoDatosRegla = regla.estadoDatos;
        if (e === 'UTILIZABLE') x.utilizables++;
        else if (e === 'LIMITADO') x.limitadas++;
        else if (e === 'DESCARTADO') x.descartadas++;
        else x.noImplementadas++;
      }
    } catch {
      omitidos++;
    }
  }

  const reglas: CoberturaReglaHistorica[] = [...mapa.values()].map((x) => {
    const base: CoberturaReglaHistorica = {
      codigo: x.codigo,
      nombre: x.nombre,
      categoria: x.categoria,
      evaluaciones: x.evaluaciones,
      utilizables: x.utilizables,
      limitadas: x.limitadas,
      descartadas: x.descartadas,
      noImplementadas: x.noImplementadas,
      utilizablesPct: pct(x.utilizables, x.evaluaciones),
      coberturaPromedioPct: x.evaluaciones ? red(x.sumaCobertura / x.evaluaciones) : 0,
      coberturaMinPct: x.evaluaciones ? red(x.minCobertura) : 0,
      coberturaMaxPct: x.evaluaciones ? red(x.maxCobertura) : 0,
      estado: 'SIN_MUESTRA',
      senales: [...x.senales],
    };
    base.estado = estadoRegla(base);
    return base;
  }).sort((a, b) => a.codigo.localeCompare(b.codigo));

  const categorias = [...new Set(reglas.map((r) => r.categoria))].sort().map((categoria) => {
    const rr = reglas.filter((r) => r.categoria === categoria);
    return {
      categoria,
      reglas: rr.length,
      listas: rr.filter((r) => r.estado === 'LISTA').length,
      parciales: rr.filter((r) => r.estado === 'PARCIAL').length,
      necesitanDatos: rr.filter((r) => r.estado === 'NECESITA_DATOS').length,
      coberturaPromedioPct: rr.length ? red(rr.reduce((s, r) => s + r.coberturaPromedioPct, 0) / rr.length) : 0,
      utilizablesPct: rr.length ? red(rr.reduce((s, r) => s + r.utilizablesPct, 0) / rr.length) : 0,
    };
  });

  return {
    generadoEn: new Date().toISOString(),
    filtros: { ligaApiId: filtros.ligaApiId ?? null, temporada: filtros.temporada ?? null, muestra, limite },
    resumen: {
      partidosSolicitados: rows.length,
      partidosProcesados: procesados,
      partidosOmitidos: omitidos,
      reglas: reglas.length,
      listas: reglas.filter((r) => r.estado === 'LISTA').length,
      parciales: reglas.filter((r) => r.estado === 'PARCIAL').length,
      necesitanDatos: reglas.filter((r) => r.estado === 'NECESITA_DATOS').length,
      sinMuestra: reglas.filter((r) => r.estado === 'SIN_MUESTRA').length,
      coberturaPromedioPct: reglas.length ? red(reglas.reduce((s, r) => s + r.coberturaPromedioPct, 0) / reglas.length) : 0,
    },
    categorias,
    reglas,
    aviso: 'Matriz técnica de cobertura histórica por regla. LISTA significa cobertura de datos suficiente para el análisis descriptivo; no representa probabilidad ni recomendación deportiva.',
  };
}
