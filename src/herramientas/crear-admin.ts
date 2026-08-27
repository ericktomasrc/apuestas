/**
 * Crea el primer administrador, con su contraseña.
 *
 * Existe por un problema de arranque: el panel exige permisos para
 * otorgar permisos, así que sin esto nadie podría entrar nunca.
 *
 * De aquí en adelante las cuentas se crean **desde el panel**, en
 * Usuarios → Crear cuenta. Este script solo se usa una vez.
 *
 *   npm run crear-admin -- erick erick@empresa.pe MiClave123
 *
 * Si la cuenta ya existe, solo le da el rol (y actualiza la clave si
 * se pasó una).
 */

import { pool, enTransaccion, cerrar } from '../infraestructura/db.js';
import { hashearPassword } from '../api/auth.js';

function uso(): never {
  console.error('\n  npm run crear-admin -- <alias> <correo> <contraseña>\n');
  console.error('  Ejemplo:');
  console.error('  npm run crear-admin -- erick erick@empresa.pe MiClave123\n');
  process.exit(1);
}

async function main(): Promise<void> {
  const [alias, email, password] = process.argv.slice(2);
  if (!alias || !email || !password) uso();

  if (password.length < 8) {
    console.error('\n  La contraseña debe tener al menos 8 caracteres.\n');
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(alias)) {
    console.error('\n  El alias solo admite letras, números y guion bajo (3 a 20).\n');
    process.exit(1);
  }

  const rol = await pool.query(`SELECT id, nombre FROM v_roles WHERE clave = 'SUPER_ADMIN'`);
  if (rol.rows.length === 0) {
    console.error('\n  Falta el rol SUPER_ADMIN. ¿Aplicaste sql/001_esquema.sql?\n');
    await cerrar();
    process.exit(1);
  }

  const existente = await pool.query(
    `SELECT id, alias FROM v_usuarios WHERE lower(alias) = lower($1) OR lower(email) = lower($2)`,
    [alias, email],
  );

  const hash = await hashearPassword(password);
  let id: string;
  let creado = false;

  if (existente.rows.length > 0) {
    id = existente.rows[0].id;
    await enTransaccion(async (c) => {
      await c.query(`UPDATE usuarios SET hash_password = $2 WHERE id = $1`, [id, hash]);
    }, id);
  } else {
    const plan = await pool.query(`SELECT id FROM v_planes WHERE codigo = 'GRATIS'`);
    const nuevo = await pool.query(
      `INSERT INTO usuarios (alias, email, hash_password, fecha_nacimiento, plan_id, pais)
       VALUES ($1,$2,$3,'1990-01-01',$4,'PE') RETURNING id`,
      [alias, email.toLowerCase(), hash, plan.rows[0].id],
    );
    id = nuevo.rows[0].id;
    creado = true;
  }

  // Se registra a sí mismo como autor: al arrancar no hay nadie más.
  await enTransaccion(async (c) => {
    await c.query(
      `INSERT INTO usuarios_roles (usuario_id, rol_id, otorgado_por)
       VALUES ($1,$2,$1) ON CONFLICT DO NOTHING`,
      [id, rol.rows[0].id],
    );
  }, id);

  const permisos = await pool.query(
    `SELECT count(*)::int AS n FROM v_permisos_usuario WHERE usuario_id = $1`,
    [id],
  );

  console.log(`\n  ${creado ? 'Cuenta creada' : 'Cuenta actualizada'}`);
  console.log(`    Alias:      ${alias}`);
  console.log(`    Correo:     ${email}`);
  console.log(`    Contraseña: ${password}`);
  console.log(`    Rol:        ${rol.rows[0].nombre} (${permisos.rows[0].n} permisos)`);
  console.log('\n  Panel:  http://localhost:3000/panel');
  console.log('  Desde ahí puedes crear al resto del equipo.\n');

  await cerrar();
}

main().catch(async (e) => {
  console.error('\n  Error:', e instanceof Error ? e.message : e, '\n');
  await cerrar();
  process.exit(1);
});
