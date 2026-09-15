import { pool } from '../infraestructura/db.js';
import { depositar, saldoDe } from '../servicios/ledger.servicio.js';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const montoTexto = process.argv[3]?.trim();

  if (!email || !montoTexto) {
    console.error(
      'Uso: npx tsx src/herramientas/cargar-saldo.ts correo@ejemplo.com 100'
    );
    process.exitCode = 1;
    return;
  }

  const monto = Number(montoTexto);

  if (!Number.isFinite(monto) || monto <= 0) {
    console.error('El monto debe ser mayor que 0.');
    process.exitCode = 1;
    return;
  }

  // TandaBet trabaja internamente con centavos.
  const montoCentavos = Math.round(monto * 100);

  const { rows } = await pool.query(
    `
      SELECT id, alias, email
      FROM usuarios
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email],
  );

  if (rows.length === 0) {
    console.error(`No existe un usuario con el correo: ${email}`);
    process.exitCode = 1;
    return;
  }

  const usuario = rows[0];

  // Cada ejecución genera una referencia diferente para que el ledger
  // pueda registrar una nueva carga DEV legítima.
  const claveIdempotencia =
    `DEV-CARGA-${usuario.id}-${Date.now()}`;

  await depositar(
    usuario.id,
    montoCentavos,
    claveIdempotencia,
  );

  const saldo = await saldoDe(usuario.id);

  console.log('');
  console.log('Saldo DEV cargado correctamente');
  console.log('--------------------------------');
  console.log(`Usuario : ${usuario.alias}`);
  console.log(`Correo  : ${usuario.email}`);
  console.log(`Carga   : ${saldo.simbolo}${monto.toFixed(2)}`);
  console.log(
    `Disponible: ${saldo.simbolo}${(saldo.disponibleCentavos / 100).toFixed(2)}`
  );
  console.log(
    `Retenido  : ${saldo.simbolo}${(saldo.retenidoCentavos / 100).toFixed(2)}`
  );
  console.log(
    `Total     : ${saldo.simbolo}${(saldo.totalCentavos / 100).toFixed(2)}`
  );
}

main()
  .catch((error) => {
    console.error('Error al cargar saldo DEV:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });