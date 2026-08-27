/**
 * Repositorio del LEDGER — la capa que conecta la lógica con la base.
 *
 * Todo lo que mueve dinero pasa por aquí, y todo pasa dentro de UNA
 * transacción. Ningún otro módulo escribe en `movimientos`.
 */

import { enTransaccion, pool, type Cliente } from './../infraestructura/db.js';
import {
  liquidar,
  type Posicion,
  type Lado,
  type MotivoAnulacion,
  ErrorLiquidacion,
} from './../dominio/liquidacion.js';

export interface Saldo {
  disponibleCentavos: number;
  retenidoCentavos: number;
  totalCentavos: number;
  /** Sin esto la app no sabe si el número son soles o pesos. */
  moneda: string;
  simbolo: string;
  decimales: number;
}

export class ErrorSaldo extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorSaldo';
  }
}

// ---------------------------------------------------------------------
// Consulta de saldo
// ---------------------------------------------------------------------

export async function saldoDe(
  usuarioId: string,
  cliente?: Cliente,
): Promise<Saldo> {
  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT disponible_centavos, retenido_centavos, total_centavos,
            moneda, simbolo, decimales
       FROM v_saldos WHERE usuario_id = $1`,
    [usuarioId],
  );
  if (rows.length === 0) {
    throw new ErrorSaldo('USUARIO_NO_EXISTE', `No existe el usuario ${usuarioId}`);
  }
  // Number() defensivo: si alguna vista pierde el cast a BIGINT, el
  // driver devolvería NUMERIC como string y las comparaciones fallarían
  // en silencio.
  return {
    disponibleCentavos: Number(rows[0].disponible_centavos),
    retenidoCentavos: Number(rows[0].retenido_centavos),
    totalCentavos: Number(rows[0].total_centavos),
    moneda: rows[0].moneda ?? 'PEN',
    simbolo: rows[0].simbolo ?? 'S/',
    decimales: Number(rows[0].decimales ?? 2),
  };
}

// ---------------------------------------------------------------------
// Inserción de movimientos
// ---------------------------------------------------------------------

interface Movimiento {
  usuarioId: string | null;
  esCasa?: boolean;
  tipo: string;
  montoCentavos: number;
  /** Los saldos NUNCA se suman entre monedas distintas. */
  moneda?: string;
  mercadoId?: string | null;
  salaId?: string | null;
  /** Modo casa. Una casa vive fuera de la estructura de salas. */
  casaId?: string | null;
  claveIdempotencia: string;
  motivo?: string | null;
  operadorId?: string | null;
}

export async function insertarMovimiento(c: Cliente, m: Movimiento): Promise<void> {
  await c.query(
    `INSERT INTO movimientos
       (usuario_id, es_casa, tipo, monto_centavos, moneda,
        mercado_id, sala_id, casa_id, clave_idempotencia, motivo, operador_id)
     VALUES ($1,$2,$3,$4,
             COALESCE($5, (SELECT p.moneda FROM paises_habilitados p
                            JOIN usuarios u ON u.pais = p.codigo
                           WHERE u.id = $1), 'PEN'),
             $6,$7,$8,$9,$10,$11)`,
    [
      m.usuarioId,
      m.esCasa ?? false,
      m.tipo,
      m.montoCentavos,
      m.moneda ?? null,
      m.mercadoId ?? null,
      m.salaId ?? null,
      m.casaId ?? null,
      m.claveIdempotencia,
      m.motivo ?? null,
      m.operadorId ?? null,
    ],
  );
}

// ---------------------------------------------------------------------
// Depósito
// ---------------------------------------------------------------------

/**
 * Acredita saldo. Se llama SOLO cuando el proveedor de pago confirma
 * (estado CONFIRMADO), nunca antes.
 *
 * La clave de idempotencia debe venir de la referencia del proveedor:
 * si el webhook llega dos veces, el UNIQUE de la tabla rechaza el
 * segundo intento y el saldo no se duplica.
 */
export async function depositar(
  usuarioId: string,
  montoCentavos: number,
  claveIdempotencia: string,
): Promise<void> {
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new ErrorSaldo('MONTO_INVALIDO', 'El depósito debe ser un entero positivo');
  }
  await enTransaccion(async (c) => {
    await insertarMovimiento(c, {
      usuarioId,
      tipo: 'DEPOSITO',
      montoCentavos,
      claveIdempotencia,
    });
  }, usuarioId);
}

// ---------------------------------------------------------------------
// Entrar a un mercado
// ---------------------------------------------------------------------

/**
 * Compromete dinero en un mercado.
 *
 * El bloqueo de la fila del usuario es lo que impide que dos entradas
 * simultáneas gasten el mismo saldo: sin él, ambas leerían "disponible
 * S/30" y las dos pasarían la validación.
 */
export async function entrarAMercado(
  usuarioId: string,
  mercadoId: string,
  salaId: string,
  montoCentavos: number,
  claveIdempotencia: string,
  /**
   * Transacción en curso, si el llamador ya abrió una.
   *
   * Es lo que permite que apostar() retenga el dinero y cree la
   * posición en la MISMA transacción. Con transacciones separadas, un
   * fallo al crear la posición dejaba la retención hecha: dinero
   * comprometido sin nada que lo respaldara.
   */
  cliente?: Cliente,
): Promise<void> {
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new ErrorSaldo('MONTO_INVALIDO', 'El monto debe ser un entero positivo');
  }

  const trabajo = async (c: Cliente): Promise<void> => {
    // Sin este bloqueo, dos entradas simultáneas leerían el mismo
    // disponible y ambas pasarían la validación.
    await c.query('SELECT id FROM usuarios WHERE id = $1 FOR UPDATE', [usuarioId]);

    const saldo = await saldoDe(usuarioId, c);
    if (saldo.disponibleCentavos < montoCentavos) {
      throw new ErrorSaldo(
        'SALDO_INSUFICIENTE',
        `No te alcanza. Tienes ${(saldo.disponibleCentavos / 100).toFixed(2)} disponibles.`,
      );
    }

    await insertarMovimiento(c, {
      usuarioId,
      tipo: 'RETENCION',
      montoCentavos: -montoCentavos,
      mercadoId,
      salaId,
      claveIdempotencia,
    });
  };

  if (cliente) await trabajo(cliente);
  else await enTransaccion(trabajo, usuarioId);
}

// ---------------------------------------------------------------------
// Salir de un mercado
// ---------------------------------------------------------------------

/** Libera la retención. Sin cargo alguno: cobrar por salir sería un
 *  cargo sorpresa, y eso contradice todo el diseño. */
export async function salirDeMercado(
  usuarioId: string,
  mercadoId: string,
  salaId: string,
  montoCentavos: number,
  claveIdempotencia: string,
): Promise<void> {
  await enTransaccion(async (c) => {
    const { rows } = await c.query(
      `SELECT 1 FROM liquidaciones WHERE mercado_id = $1`,
      [mercadoId],
    );
    if (rows.length > 0) {
      throw new ErrorSaldo('YA_LIQUIDADO', 'El mercado ya se liquidó: no se puede salir');
    }

    await insertarMovimiento(c, {
      usuarioId,
      tipo: 'LIBERACION',
      montoCentavos,
      mercadoId,
      salaId,
      claveIdempotencia,
    });
  }, usuarioId);
}

// ---------------------------------------------------------------------
// Liquidación
// ---------------------------------------------------------------------

async function leerPosiciones(c: Cliente, mercadoId: string): Promise<Posicion[]> {
  const { rows } = await c.query(
    // Se cobra la tasa CONGELADA al apostar, no la de hoy.
    //
    // La persona vio ese número en el desglose antes de confirmar.
    // Cambiar una membresía no puede alterar apuestas ya hechas, y un
    // plan que vence mientras la sala está abierta tampoco.
    //
    // Se lee de `posiciones` sin JOIN a usuarios: alguien borrado
    // lógicamente con posiciones abiertas haría que los dos lados
    // dejaran de sumar igual y el mercado quedaría sin poder
    // liquidarse, con el dinero congelado.
    //
    // `tasa_mostrada` es NOT NULL y tiene CHECK de rango, así que no
    // hace falta defenderse de un nulo: no puede existir.
    `SELECT p.usuario_id, p.lado, p.monto_centavos, p.tasa_mostrada AS tasa
       FROM posiciones p
      WHERE p.mercado_id = $1
        AND p.eliminado_en IS NULL`,
    [mercadoId],
  );
  return rows.map((r) => ({
    usuarioId: r.usuario_id,
    lado: r.lado as Lado,
    montoCentavos: r.monto_centavos,
    tasaComision: Number(r.tasa),
  }));
}

/**
 * Liquida un mercado con ganador.
 *
 * Tres barreras contra el pago duplicado:
 *   1. FOR UPDATE sobre la fila del mercado: serializa dos procesos
 *      que intenten liquidar a la vez.
 *   2. La PK de `liquidaciones` se inserta ANTES de pagar. Si otra
 *      transacción ya lo hizo, esto revienta y todo se revierte.
 *   3. UNIQUE de clave_idempotencia en cada movimiento.
 */
export async function liquidarMercado(
  mercadoId: string,
  salaId: string,
  ladoGanador: Lado,
  payloadResultado: unknown = null,
): Promise<{ boteCentavos: number; comisionCentavos: number }> {
  return enTransaccion(async (c) => {
    await c.query(
      'SELECT id FROM mercados WHERE id = $1 FOR UPDATE',
      [mercadoId],
    );

    const yaLiquidado = await c.query(
      'SELECT 1 FROM liquidaciones WHERE mercado_id = $1',
      [mercadoId],
    );
    if (yaLiquidado.rows.length > 0) {
      throw new ErrorLiquidacion('YA_LIQUIDADO', `El mercado ${mercadoId} ya se liquidó`);
    }

    const posiciones = await leerPosiciones(c, mercadoId);
    const r = liquidar(posiciones, ladoGanador);   // valida el invariante

    // Se registra ANTES de pagar: si dos procesos llegaron juntos, el
    // segundo choca contra la PK y hace ROLLBACK sin haber pagado nada.
    await c.query(
      `INSERT INTO liquidaciones
         (mercado_id, sala_id, lado_ganador, bote_centavos,
          comision_centavos, payload_resultado)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        mercadoId,
        salaId,
        ladoGanador,
        r.boteCentavos,
        r.comisionTotalCentavos,
        payloadResultado ? JSON.stringify(payloadResultado) : null,
      ],
    );

    for (const p of r.pagos) {
      await insertarMovimiento(c, {
        usuarioId: p.usuarioId,
        tipo: 'PREMIO',
        montoCentavos: p.pagoCentavos,
        mercadoId,
        salaId,
        claveIdempotencia: `premio:${mercadoId}:${p.usuarioId}`,
      });
    }

    // Los perdedores NO llevan movimiento.
    //
    // Su RETENCION ya descontó el dinero al entrar. Ahora que el
    // mercado está en `liquidaciones`, la vista deja de contarlo como
    // retenido y simplemente no vuelve: eso ES la pérdida.
    //
    // Insertar aquí un PERDIDA le cobraba dos veces y hacía desaparecer
    // dinero del sistema. Ver migración 003.

    if (r.comisionTotalCentavos > 0) {
      // La comisión hereda la moneda de la sala: la casa lleva una
      // caja por moneda, no una sola mezclada.
      const { rows: mon } = await c.query(
        `SELECT p.moneda FROM salas s
           JOIN paises_habilitados p ON p.codigo = s.pais
          WHERE s.id = $1`,
        [salaId],
      );
      await insertarMovimiento(c, {
        usuarioId: null,
        esCasa: true,
        tipo: 'COMISION',
        montoCentavos: r.comisionTotalCentavos,
        moneda: mon[0]?.moneda ?? 'PEN',
        mercadoId,
        salaId,
        claveIdempotencia: `comision:${mercadoId}`,
      });
    }

    await c.query(
      `UPDATE mercados
          SET estado = 'LIQUIDADO', lado_ganador = $2, liquidado_en = now()
        WHERE id = $1`,
      [mercadoId, ladoGanador],
    );

    // Última red: preguntarle a la base si cuadra, no confiar en el
    // cálculo que acabamos de hacer en memoria.
    const chequeo = await c.query(
      'SELECT descuadre FROM v_conciliacion_mercados WHERE mercado_id = $1',
      [mercadoId],
    );
    const descuadre = Number(chequeo.rows[0]?.descuadre ?? 0);
    if (descuadre !== 0) {
      throw new ErrorLiquidacion(
        'DESCUADRE',
        `El mercado ${mercadoId} descuadra en ${descuadre} centavos`,
      );
    }

    return {
      boteCentavos: r.boteCentavos,
      comisionCentavos: r.comisionTotalCentavos,
    };
  });
}

// ---------------------------------------------------------------------
// Anulación
// ---------------------------------------------------------------------

/** Devolución del 100%. La casa no cobra: hay un CHECK en la tabla
 *  `liquidaciones` que lo impide aunque el código se equivoque. */
export async function anularMercado(
  mercadoId: string,
  salaId: string,
  motivo: MotivoAnulacion,
): Promise<{ devueltoCentavos: number }> {
  return enTransaccion(async (c) => {
    await c.query('SELECT id FROM mercados WHERE id = $1 FOR UPDATE', [mercadoId]);

    const ya = await c.query('SELECT 1 FROM liquidaciones WHERE mercado_id = $1', [
      mercadoId,
    ]);
    if (ya.rows.length > 0) {
      throw new ErrorLiquidacion('YA_LIQUIDADO', `El mercado ${mercadoId} ya se resolvió`);
    }

    // Se devuelve según lo que dice el LIBRO, no según las posiciones.
    //
    // El libro de movimientos es la fuente de verdad del dinero; las
    // posiciones son metadatos del juego. Si por cualquier razón
    // existiera una retención sin su posición, mirar `posiciones`
    // haría desaparecer ese dinero: el mercado quedaría liquidado, la
    // retención dejaría de contar como comprometida, y nadie la
    // recibiría de vuelta.
    const { rows: retenido } = await c.query(
      `SELECT usuario_id,
              -SUM(monto_centavos)::bigint AS comprometido
         FROM movimientos
        WHERE mercado_id = $1
          AND tipo IN ('RETENCION','LIBERACION')
        GROUP BY usuario_id
       HAVING -SUM(monto_centavos) > 0`,
      [mercadoId],
    );

    const bote = retenido.reduce((s, r) => s + Number(r.comprometido), 0);

    await c.query(
      `INSERT INTO liquidaciones
         (mercado_id, sala_id, motivo_anulacion, bote_centavos, comision_centavos)
       VALUES ($1,$2,$3,$4,0)`,
      [mercadoId, salaId, motivo, bote],
    );

    for (const d of retenido) {
      await insertarMovimiento(c, {
        usuarioId: d.usuario_id,
        tipo: 'DEVOLUCION',
        montoCentavos: Number(d.comprometido),
        mercadoId,
        salaId,
        claveIdempotencia: `devolucion:${mercadoId}:${d.usuario_id}`,
      });
    }

    await c.query(
      `UPDATE mercados
          SET estado = 'ANULADO', motivo_anulacion = $2, liquidado_en = now()
        WHERE id = $1`,
      [mercadoId, motivo],
    );

    return { devueltoCentavos: bote };
  });
}

// ---------------------------------------------------------------------
// Conciliación
// ---------------------------------------------------------------------

/** Debe devolver siempre un arreglo vacío. Cualquier fila es un bug
 *  con dinero de por medio. */
export async function descuadres(): Promise<
  { mercado_id: string; descuadre: number }[]
> {
  const { rows } = await pool.query('SELECT * FROM v_descuadres');
  return rows;
}
