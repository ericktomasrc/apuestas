/**
 * Aplica todas las migraciones en orden.
 *
 *   npm run migrar
 *
 * Copia cada archivo al contenedor y lo ejecuta ahí, en vez de pasarlo
 * por tubería: PowerShell no manda UTF-8 y los acentos salen rotos.
 * Ese detalle ya rompió los textos del panel una vez.
 *
 * Todas son repetibles: correr esto dos veces no falla.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const BD = process.env.PGDATABASE ?? 'apuestas';
const USUARIO = process.env.PGUSER ?? 'postgres';

/** Ordenadas por su número: 002 va antes que 010. */
const migraciones = readdirSync('sql')
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .sort();

if (migraciones.length === 0) {
  console.error('\n  ✗ No hay migraciones en sql/\n');
  process.exit(1);
}

function docker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
}

console.log(`\n  ${migraciones.length} migraciones\n`);

for (const [i, archivo] of migraciones.entries()) {
  const destino = `/tmp/m${i + 1}.sql`;
  process.stdout.write(`  ${String(i + 1).padStart(2)}. ${archivo.padEnd(32)}`);

  try {
    docker(['compose', 'cp', `sql/${archivo}`, `db:${destino}`]);
    const salida = docker([
      'compose', 'exec', '-T', 'db',
      'psql', '-U', USUARIO, '-d', BD, '-v', 'ON_ERROR_STOP=1', '-f', destino,
    ]);

    // Los NOTICE no son errores: las migraciones los usan para
    // informar cuántas filas conservaron y por qué.
    const notas = salida.split('\n').filter((l) => l.startsWith('NOTICE:'));
    console.log('✓');
    for (const n of notas) console.log(`      ${n.replace('NOTICE:  ', '')}`);
  } catch (e) {
    console.log('✗\n');
    const err = e as { stdout?: string; stderr?: string };
    const detalle = `${err.stdout ?? ''}${err.stderr ?? ''}`
      .split('\n')
      .filter((l) => l.includes('ERROR') || l.includes('DETAIL') || l.includes('HINT'))
      .slice(0, 5);

    for (const l of detalle) console.error(`      ${l.trim()}`);
    console.error(`\n  Se detuvo en ${archivo}. Las anteriores sí se aplicaron.\n`);
    process.exit(1);
  }
}

console.log('\n  ✓ Todas aplicadas.\n');
console.log('  Siguiente:');
console.log('    npm run crear-admin -- alias correo clave');
console.log('    npm run ligas');
console.log('    npm run dev\n');
