/**
 * Trae el CATÁLOGO COMPLETO de ligas del proveedor.
 *
 *   npm run ligas
 *
 * Son más de mil —de todos los países, incluidas copas y mundiales— y
 * cuestan **una sola petición**. Se guardan todas y después se decide
 * cuáles mostrar desde Panel → Deportes.
 *
 * Registrar una liga NO la activa. Una liga sin mercados habilitados:
 *   - no aparece en la app
 *   - no consume cuota diaria
 *
 * Por eso conviene tener el catálogo entero: buscar una liga en el
 * panel es más cómodo que averiguar su identificador a mano, y no
 * cuesta nada tenerla ahí esperando.
 *
 * Es repetible: las que ya están se actualizan, no se duplican.
 */

import 'dotenv/config';
import { ProveedorApiFootball } from '../infraestructura/proveedores/apifootball.proveedor.js';
import { pool, enTransaccion } from '../infraestructura/db.js';

async function main(): Promise<void> {
  console.log('\n─────────────────────────────────────────────────');
  console.log('  Catálogo de ligas · API-Football');
  console.log('─────────────────────────────────────────────────\n');

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

  let nuevas = 0, actualizadas = 0;
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

      const r = await c.query(
        `INSERT INTO ligas (api_id, deporte_id, nombre, pais, tiene_estadisticas)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (api_id) WHERE eliminado_en IS NULL
         DO UPDATE SET nombre = EXCLUDED.nombre,
                       tiene_estadisticas = EXCLUDED.tiene_estadisticas
         RETURNING (xmax = 0) AS es_nueva`,
        [String(f.league.id), deporteId, nombre, pais, conStats],
      );
      if (r.rows[0]?.es_nueva) nuevas++; else actualizadas++;
    }
  }, undefined);

  console.log(`  ${nuevas} nuevas · ${actualizadas} actualizadas\n`);

  const top = [...porPais.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('  Países con más competiciones:');
  for (const [pais, n] of top) console.log(`    ${pais}  ${n}`);

  const habilitadas = await pool.query(
    `SELECT count(*)::int AS n FROM v_ligas l
      WHERE EXISTS (SELECT 1 FROM mercados_por_liga m
                     WHERE m.liga_id = l.id AND m.eliminado_en IS NULL)`,
  );

  console.log(`\n  Ligas con mercados habilitados: ${habilitadas.rows[0].n}`);
  console.log('\n  ⚠️  Registrar una liga NO la activa.');
  console.log('      Ve a Panel → Deportes y habilita los mercados de');
  console.log('      las que quieras mostrar. Solo esas se sincronizan');
  console.log('      y solo esas consumen cuota.\n');
  console.log(`  Quedan ${proveedor.restantes ?? '?'} peticiones hoy.\n`);

  await pool.end();
}

main().catch(async (e) => {
  console.error(`\n  ✗ ${e instanceof Error ? e.message : e}\n`);
  await pool.end();
  process.exit(1);
});
