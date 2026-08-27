/**
 * Conexión a PostgreSQL y ayudante de transacciones.
 */

import pg from 'pg';

// pg devuelve BIGINT como string para no perder precisión con números
// grandes. Como todos nuestros montos son centavos que caben de sobra
// en un entero de JS, los convertimos aquí y trabajamos con number.
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => parseInt(v, 10));

export const pool = new pg.Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? 'apuestas',
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'local123',
  max: 10,
});

export type Cliente = pg.PoolClient;

/**
 * Ejecuta una función dentro de UNA transacción.
 *
 * Esto es lo que garantiza la regla más importante del ledger: al
 * liquidar un mercado, o entran todos los movimientos o no entra
 * ninguno. Nunca puede ocurrir que se le cobre al perdedor y falle el
 * pago al ganador.
 *
 * @param usuarioId  se fija en la sesión para que los triggers de
 *                   auditoría sepan quién hizo el cambio. Los procesos
 *                   automáticos pasan null.
 */
export async function enTransaccion<T>(
  fn: (c: Cliente) => Promise<T>,
  usuarioId: string | null = null,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // SET LOCAL dura solo hasta el COMMIT o ROLLBACK: no se filtra a
    // la siguiente operación que reutilice esta conexión del pool.
    if (usuarioId) {
      await cliente.query('SELECT set_config($1, $2, true)', [
        'app.usuario_id',
        usuarioId,
      ]);
    }

    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}

export async function cerrar(): Promise<void> {
  await pool.end();
}
