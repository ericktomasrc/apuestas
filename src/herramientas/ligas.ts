/**
 * Trae el CATÁLOGO COMPLETO de ligas del proveedor.
 *
 *   npm run ligas
 *
 * Son más de mil —de todos los países, incluidas copas y mundiales— y
 * cuestan una sola petición. Se guardan todas y después se decide cuáles
 * sincronizar desde Panel → Deportes mediante `ligas.seleccionada_panel`.
 *
 * Primera inicialización:
 *   - importa/actualiza todo el catálogo;
 *   - si todavía hay 0 ligas seleccionadas, marca las 36 competiciones
 *     iniciales elegidas para trabajar;
 *   - si ya existe al menos una selección, NO la modifica.
 *
 * Es repetible: las que ya están se actualizan, no se duplican, y las
 * selecciones manuales del administrador se conservan.
 */

import 'dotenv/config';
import { ProveedorApiFootball } from '../infraestructura/proveedores/apifootball.proveedor.js';
import { pool, enTransaccion, type Cliente } from '../infraestructura/db.js';

/**
 * SOLO DESARROLLO.
 *
 * Esta bandera crea/restaura mercados automáticamente para acelerar pruebas
 * locales. NO controla qué ligas se sincronizan: esa decisión pertenece a
 * `ligas.seleccionada_panel`.
 *
 * Para activarlo:
 *   DEV_AUTO_MERCADOS=true
 *
 * Incluso si alguien deja esa variable activa por error, NODE_ENV=production
 * impide la habilitación automática.
 */
const AUTO_MERCADOS_DEV =
  process.env.NODE_ENV !== 'production'
  && process.env.DEV_AUTO_MERCADOS === 'true';

/** Mercados que el sistema ya sabe liquidar para fútbol. */
const MERCADOS_DEV_BASE = [
  'DOBLE_OPORTUNIDAD',
  'TOTAL_GOLES',
  'AMBOS_ANOTAN',
] as const;

/**
 * Estos dependen de estadísticas por partido. Solo se habilitan cuando
 * API-Football declara statistics_fixtures=true para la temporada.
 */
const MERCADOS_DEV_ESTADISTICAS = [
  'TOTAL_CORNERS',
  'TOTAL_TARJETAS',
] as const;

type LigaInicial = {
  apiId?: string;
  nombre: string;
  pais?: string;
};

/**
 * Orden de preferencia para la selección inicial del panel.
 *
 * Cuando ya conocemos el api_id real del proveedor se usa como primera opción.
 * El nombre funciona como respaldo y contempla el formato con el que este
 * mismo importador guarda las ligas: "Liga (País)".
 *
 * Si alguna competición cambió de nombre en API-Football y no coincide, el
 * Las 14 competiciones excluidas permanecen en el catálogo y pueden activarse
 * manualmente después desde Panel → Deportes.
 */
const LIGAS_INICIALES: readonly LigaInicial[] = [
  // Inglaterra
  { apiId: '39', nombre: 'Premier League', pais: 'England' },
  { apiId: '40', nombre: 'Championship', pais: 'England' },
  { nombre: 'League One', pais: 'England' },
  { nombre: 'League Two', pais: 'England' },

  // España
  { apiId: '140', nombre: 'La Liga', pais: 'Spain' },
  { apiId: '141', nombre: 'Segunda División', pais: 'Spain' },

  // Italia
  { apiId: '135', nombre: 'Serie A', pais: 'Italy' },
  { apiId: '136', nombre: 'Serie B', pais: 'Italy' },

  // Alemania
  { apiId: '78', nombre: 'Bundesliga', pais: 'Germany' },
  { nombre: '2. Bundesliga', pais: 'Germany' },

  // Francia
  { apiId: '61', nombre: 'Ligue 1', pais: 'France' },
  { nombre: 'Ligue 2', pais: 'France' },

  // Europa
  { apiId: '94', nombre: 'Primeira Liga', pais: 'Portugal' },
  { apiId: '88', nombre: 'Eredivisie', pais: 'Netherlands' },

  // América
  { apiId: '128', nombre: 'Liga Profesional Argentina', pais: 'Argentina' },
  { apiId: '129', nombre: 'Primera Nacional', pais: 'Argentina' },
  { apiId: '71', nombre: 'Serie A', pais: 'Brazil' },
  { apiId: '72', nombre: 'Serie B', pais: 'Brazil' },
  { apiId: '281', nombre: 'Primera División', pais: 'Peru' },
  { apiId: '282', nombre: 'Segunda División', pais: 'Peru' },
  { apiId: '239', nombre: 'Primera A', pais: 'Colombia' },
  { apiId: '265', nombre: 'Primera División', pais: 'Chile' },
  { apiId: '242', nombre: 'Liga Pro', pais: 'Ecuador' },
  { apiId: '268', nombre: 'Primera División', pais: 'Uruguay' },
  { apiId: '250', nombre: 'Division Profesional', pais: 'Paraguay' },
  { nombre: 'Liga MX', pais: 'Mexico' },
  { nombre: 'Major League Soccer', pais: 'USA' },

  // Internacionales de clubes
  { apiId: '2', nombre: 'UEFA Champions League' },
  { apiId: '3', nombre: 'UEFA Europa League' },
  { nombre: 'UEFA Europa Conference League' },
  { apiId: '13', nombre: 'CONMEBOL Libertadores' },
  { apiId: '11', nombre: 'CONMEBOL Sudamericana' },

  // Selecciones / internacionales
  { apiId: '1', nombre: 'World Cup' },
  { nombre: 'Euro Championship' },
  { apiId: '9', nombre: 'Copa America' },
  { apiId: '15', nombre: 'FIFA Club World Cup' },
] as const;

async function inicializarSeleccionPanel(c: Cliente): Promise<number> {
  const actuales = await c.query(
    `SELECT count(*)::int AS n
       FROM ligas
      WHERE seleccionada_panel = TRUE
        AND eliminado_en IS NULL`,
  );

  const cantidadActual = Number(actuales.rows[0]?.n ?? 0);
  if (cantidadActual > 0) {
    console.log(`  ✓ Selección del panel conservada: ${cantidadActual} liga(s)`);
    return cantidadActual;
  }

  let seleccionadas = 0;

  for (const liga of LIGAS_INICIALES) {
    const nombreConPais = liga.pais
      ? `${liga.nombre} (${liga.pais})`
      : liga.nombre;

    const r = await c.query(
      `UPDATE ligas
          SET seleccionada_panel = TRUE
        WHERE id = (
          SELECT id
            FROM ligas
           WHERE eliminado_en IS NULL
             AND seleccionada_panel = FALSE
             AND (
                  ($1::text IS NOT NULL AND api_id = $1::text)
                  OR lower(nombre) = lower($2::text)
                  OR lower(nombre) = lower($3::text)
             )
           ORDER BY
             CASE WHEN $1::text IS NOT NULL AND api_id = $1::text THEN 0 ELSE 1 END,
             relevancia DESC,
             nombre,
             id
           LIMIT 1
        )
      RETURNING id`,
      [liga.apiId ?? null, liga.nombre, nombreConPais],
    );

    seleccionadas += r.rowCount ?? 0;
  }

  // La selección inicial acordada es de 36 ligas. No se rellena hasta 50:
  // así las 14 ligas retiradas permanecen desactivadas por defecto.
  const faltan = Math.max(0, 36 - seleccionadas);
  if (faltan > 0) {
    const r = await c.query(
      `WITH completar AS (
         SELECT id
           FROM ligas
          WHERE eliminado_en IS NULL
            AND seleccionada_panel = FALSE
            AND lower(nombre) NOT IN (
              'a-league (australia)',
              'allsvenskan (sweden)',
              'bundesliga (austria)',
              'ekstraklasa (poland)',
              'eliteserien (norway)',
              'j1 league (japan)',
              'k league 1 (south-korea)',
              'süper lig (turkey)',
              'superliga (denmark)',
              'super league (switzerland)',
              'super league 1 (greece)',
              'pro league (saudi-arabia)',
              'jupiler pro league (belgium)',
              'premiership (scotland)'
            )
          ORDER BY relevancia DESC NULLS LAST, nombre, id
          LIMIT $1
       )
       UPDATE ligas l
          SET seleccionada_panel = TRUE
         FROM completar c2
        WHERE l.id = c2.id`,
      [faltan],
    );
    seleccionadas += r.rowCount ?? 0;
  }

  const total = await c.query(
    `SELECT count(*)::int AS n
       FROM ligas
      WHERE seleccionada_panel = TRUE
        AND eliminado_en IS NULL`,
  );

  return Number(total.rows[0]?.n ?? seleccionadas);
}

async function main(): Promise<void> {
  console.log('\n─────────────────────────────────────────────────');
  console.log('  Catálogo de ligas · API-Football');
  console.log('─────────────────────────────────────────────────\n');

  if (AUTO_MERCADOS_DEV) {
    console.log('  ⚙ DEV_AUTO_MERCADOS=true');
    console.log('  ⚠ SOLO DEV: las ligas importadas recibirán mercados automáticamente.\n');
  } else {
    console.log('  Mercados automáticos DEV: desactivados.\n');
  }

  let proveedor: ProveedorApiFootball;
  try {
    proveedor = new ProveedorApiFootball();
  } catch {
    console.error('  ✗ Falta API_FOOTBALL_KEY en el .env\n');
    process.exit(1);
  }

  const estado = await proveedor.estado();
  if (!estado.ok) {
    console.error('  ✗ La clave no funciona. Revisa API_FOOTBALL_KEY.\n');
    process.exit(1);
  }
  console.log(`  ✓ Clave válida · ${estado.restantes ?? '?'} peticiones hoy\n`);

  console.log('  Trayendo el catálogo completo (1 petición)…');
  const filas = (await proveedor.todasLasLigas()) as any[];
  console.log(`  ✓ ${filas.length} ligas y copas\n`);

  // El deporte tiene que existir: el esquema lo crea, pero si alguien
  // aplicó una migración a medias es mejor decirlo ahora.
  const dep = await pool.query(`SELECT id FROM v_deportes WHERE clave = 'FUTBOL'`);
  if (dep.rows.length === 0) {
    console.error('  ✗ No existe el deporte FUTBOL. ¿Aplicaste el esquema?\n');
    await pool.end();
    process.exit(1);
  }
  const deporteId = dep.rows[0].id;

  let nuevas = 0;
  let actualizadas = 0;
  let mercadosDevHabilitados = 0;
  let seleccionadasPanel = 0;
  const porPais = new Map<string, number>();

  await enTransaccion(async (c) => {
    for (const f of filas) {
      const actual = f.seasons?.find((s: any) => s.current) ?? f.seasons?.at(-1);
      if (!actual) continue;

      // Si la liga cubre estadísticas por partido. Es lo que decide si
      // se pueden habilitar córners y tarjetas: sin ese dato, esos
      // mercados se anularían solos a las 72 horas.
      const conStats = actual.coverage?.fixtures?.statistics_fixtures === true;

      const pais = (f.country?.code ?? 'XX').slice(0, 2);
      porPais.set(pais, (porPais.get(pais) ?? 0) + 1);

      const nombre = `${f.league.name}${f.country?.name && f.country.name !== 'World'
        ? ` (${f.country.name})` : ''}`.slice(0, 120);

      // API-Football incluye el logo de la competición en league.logo.
      // Se guarda una sola vez en catálogo; el navegador lo reutiliza
      // después sin gastar peticiones adicionales del proveedor.
      const logoUrl = typeof f.league?.logo === 'string' && f.league.logo.trim()
        ? f.league.logo.trim().slice(0, 500)
        : null;

      const r = await c.query(
        `INSERT INTO ligas
           (api_id, deporte_id, nombre, pais, tiene_estadisticas, logo_url)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (api_id) WHERE eliminado_en IS NULL
         DO UPDATE SET nombre = EXCLUDED.nombre,
                       tiene_estadisticas = EXCLUDED.tiene_estadisticas,
                       logo_url = EXCLUDED.logo_url
         RETURNING id, (xmax = 0) AS es_nueva`,
        [String(f.league.id), deporteId, nombre, pais, conStats, logoUrl],
      );
      if (r.rows[0]?.es_nueva) nuevas++; else actualizadas++;

      if (AUTO_MERCADOS_DEV) {
        const ligaId = r.rows[0]?.id as string | undefined;
        if (!ligaId) throw new Error(`No se obtuvo id para la liga ${nombre}`);

        const mercados = [
          ...MERCADOS_DEV_BASE,
          ...(conStats ? MERCADOS_DEV_ESTADISTICAS : []),
        ];

        for (const tipo of mercados) {
          // Si existía pero estaba deshabilitado, lo restauramos en DEV.
          // Después INSERT cubre el caso de una liga que nunca tuvo ese mercado.
          const restaurado = await c.query(
            `UPDATE mercados_por_liga
                SET eliminado_en = NULL,
                    verificado_en = COALESCE(verificado_en, now())
              WHERE liga_id = $1
                AND tipo_mercado = $2
                AND eliminado_en IS NOT NULL`,
            [ligaId, tipo],
          );

          if (restaurado.rowCount === 0) {
            const insertado = await c.query(
              `INSERT INTO mercados_por_liga
                 (liga_id, tipo_mercado, verificado_en)
               VALUES ($1,$2,now())
               ON CONFLICT DO NOTHING`,
              [ligaId, tipo],
            );
            if ((insertado.rowCount ?? 0) > 0) mercadosDevHabilitados++;
          } else {
            mercadosDevHabilitados += restaurado.rowCount ?? 0;
          }
        }
      }
    }

    // IMPORTANTE: esta inicialización ocurre después de insertar/actualizar
    // el catálogo. Las migraciones 025/026 se ejecutan antes de `npm run ligas`
    // y, en una instalación nueva, todavía no tienen filas que seleccionar.
    seleccionadasPanel = await inicializarSeleccionPanel(c);
  }, undefined);

  console.log(`  ${nuevas} nuevas · ${actualizadas} actualizadas`);
  console.log(`  Ligas seleccionadas en panel: ${seleccionadasPanel}\n`);

  const top = [...porPais.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('  Países con más competiciones:');
  for (const [pais, n] of top) console.log(`    ${pais}  ${n}`);

  const habilitadas = await pool.query(
    `SELECT count(*)::int AS n FROM v_ligas l
      WHERE EXISTS (SELECT 1 FROM mercados_por_liga m
                     WHERE m.liga_id = l.id AND m.eliminado_en IS NULL)`,
  );

  console.log(`\n  Ligas con mercados habilitados: ${habilitadas.rows[0].n}`);

  if (AUTO_MERCADOS_DEV) {
    console.log(`  Mercados DEV habilitados/restaurados en esta ejecución: ${mercadosDevHabilitados}`);
    console.log('  ⚠ MODO DEV: esta habilitación automática está bloqueada con NODE_ENV=production.\n');
  } else {
    console.log('\n  La sincronización automática usa `seleccionada_panel`.');
    console.log('  Ve a Panel → Deportes para activar o desactivar ligas.');
    console.log('  Los mercados continúan administrándose por separado.\n');
  }

  console.log(`  Quedan ${proveedor.restantes ?? '?'} peticiones hoy.\n`);

  await pool.end();
}

main().catch(async (e) => {
  console.error(`\n  ✗ ${e instanceof Error ? e.message : e}\n`);
  await pool.end();
  process.exit(1);
});
