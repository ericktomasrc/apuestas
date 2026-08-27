/**
 * MOTOR DE LIQUIDACIÓN — MODO CASA
 *
 * En una sala normal los dos lados tienen que sumar lo mismo o la sala
 * se anula. En modo casa eso sería una trampa: la casa financia por
 * adelantado y no controla cuánta gente entra, así que exigir balance
 * exacto anularía casi todo.
 *
 * La regla aquí es otra: **corre con lo que se llenó y devuelve el
 * resto**. Si la casa puso S/500 en una opción y entraron S/300, se
 * juegan S/300 contra S/300 y los otros S/200 vuelven a la casa sin
 * haber corrido riesgo.
 *
 * Ese es el único cambio real respecto al modo sala. Todo lo demás
 * —enteros, comisión sobre la ganancia, el invariante al centavo— vale
 * exactamente igual.
 *
 * Este archivo NO habla con la base de datos.
 */

import { ErrorLiquidacion } from './liquidacion.js';

/** Una opción que la casa ofrece, con lo que está dispuesta a perder. */
export interface OpcionCasa {
  opcionId: string;
  /** Lo que la casa asignó. Es su tope de pérdida en esta opción. */
  presupuestoCentavos: number;
}

/** Alguien que apostó contra una opción de la casa. */
export interface ApuestaContraCasa {
  usuarioId: string;
  opcionId: string;
  montoCentavos: number;
  /** Tasa del plan del apostador, para cuando gana. */
  tasaComision: number;
  /**
   * Orden de llegada. Importa: si entra más dinero del que la casa
   * puso, los primeros toman el cupo y a los últimos se les devuelve.
   * Por llegada y no a prorrata porque es lo único que la gente puede
   * verificar por su cuenta.
   */
  orden: number;
}

export interface PagoCasa {
  usuarioId: string;
  opcionId: string;
  /** Lo que puso. */
  aporteCentavos: number;
  /** La parte que entró en juego. El resto nunca corrió riesgo. */
  cubiertoCentavos: number;
  /** Lo que se le devuelve por no haber cabido. */
  sobranteCentavos: number;
  gananciaBrutaCentavos: number;
  comisionCentavos: number;
  /** Lo que se le acredita en total. */
  pagoCentavos: number;
}

export interface ResultadoCasa {
  tipo: 'CASA';
  opcionGanadoraId: string;

  /** Lo que la casa había comprometido en todas las opciones. */
  presupuestoTotalCentavos: number;
  /** La parte del presupuesto que llegó a tener contraparte. */
  cubiertoTotalCentavos: number;
  /** Presupuesto que nunca corrió riesgo. Vuelve entero. */
  liberadoCasaCentavos: number;

  /** Lo que la casa gana (positivo) o pierde (negativo), antes de comisión. */
  resultadoCasaBrutoCentavos: number;
  /** Comisión que paga la casa. Solo si ganó. */
  comisionCasaCentavos: number;
  /** Lo que se le acredita a la casa en total. */
  pagoCasaCentavos: number;

  /** Comisión que pagan los apostadores que ganaron. */
  comisionApostadoresCentavos: number;
  comisionTotalCentavos: number;

  pagos: PagoCasa[];
  /** Quienes perdieron. No llevan movimiento: su retención ya descontó. */
  perdedores: { usuarioId: string; opcionId: string; perdidaCentavos: number }[];
}

// =====================================================================

/**
 * Liquida una casa.
 *
 * `tasaComisionCasa` es la del plan de quien opera la casa. Se cobra
 * sobre SU ganancia, igual que a cualquiera: la casa no tiene trato
 * especial.
 */
export function liquidarCasa(
  opciones: OpcionCasa[],
  apuestas: ApuestaContraCasa[],
  opcionGanadoraId: string,
  tasaComisionCasa: number,
): ResultadoCasa {
  validarEntrada(opciones, apuestas, opcionGanadoraId, tasaComisionCasa);

  const pagos: PagoCasa[] = [];
  const perdedores: ResultadoCasa['perdedores'] = [];

  let presupuestoTotal = 0;
  let cubiertoTotal = 0;
  let liberadoCasa = 0;
  let resultadoCasaBruto = 0;
  let comisionApostadores = 0;

  for (const opcion of opciones) {
    presupuestoTotal += opcion.presupuestoCentavos;

    // Por orden de llegada: los primeros toman el cupo.
    const contra = apuestas
      .filter((a) => a.opcionId === opcion.opcionId)
      .sort((a, b) => a.orden - b.orden);

    // Cuánto de cada apuesta cabe dentro del presupuesto.
    let cupoRestante = opcion.presupuestoCentavos;
    const cubiertos: { apuesta: ApuestaContraCasa; cubierto: number }[] = [];

    for (const a of contra) {
      const cubierto = Math.min(a.montoCentavos, cupoRestante);
      cupoRestante -= cubierto;
      cubiertos.push({ apuesta: a, cubierto });
    }

    const cubiertoOpcion = opcion.presupuestoCentavos - cupoRestante;
    cubiertoTotal += cubiertoOpcion;

    // El presupuesto que nadie tomó vuelve a la casa sin haber corrido
    // riesgo: no estaba en juego.
    liberadoCasa += cupoRestante;

    // La opción OCURRIÓ: gana quien apostó a ella, y la casa paga con
    // el presupuesto que había puesto ahí.
    //
    // En las demás opciones pasa lo contrario: no ocurrieron, así que
    // quien apostó a ellas pierde y ese dinero es de la casa.
    const ocurrio = opcion.opcionId === opcionGanadoraId;

    for (const { apuesta, cubierto } of cubiertos) {
      const sobrante = apuesta.montoCentavos - cubierto;

      if (ocurrio) {
        // El apostador acertó: recupera lo suyo más otro tanto del
        // presupuesto de la casa, menos su comisión.
        const comision = Math.floor(cubierto * apuesta.tasaComision);
        comisionApostadores += comision;
        resultadoCasaBruto -= cubierto;

        pagos.push({
          usuarioId: apuesta.usuarioId,
          opcionId: apuesta.opcionId,
          aporteCentavos: apuesta.montoCentavos,
          cubiertoCentavos: cubierto,
          sobranteCentavos: sobrante,
          gananciaBrutaCentavos: cubierto,
          comisionCentavos: comision,
          // Aporte completo + ganancia − comisión. El sobrante ya está
          // dentro del aporte: nunca salió de su bolsillo.
          pagoCentavos: apuesta.montoCentavos + cubierto - comision,
        });
      } else {
        // No ocurrió: el apostador pierde lo que llegó a tener
        // contraparte, y recupera lo que no cupo.
        if (cubierto > 0) {
          perdedores.push({
            usuarioId: apuesta.usuarioId,
            opcionId: apuesta.opcionId,
            perdidaCentavos: cubierto,
          });
        }
        resultadoCasaBruto += cubierto;

        if (sobrante > 0) {
          pagos.push({
            usuarioId: apuesta.usuarioId,
            opcionId: apuesta.opcionId,
            aporteCentavos: apuesta.montoCentavos,
            cubiertoCentavos: cubierto,
            sobranteCentavos: sobrante,
            gananciaBrutaCentavos: 0,
            comisionCentavos: 0,
            pagoCentavos: sobrante,
          });
        }
      }
    }
  }

  // La casa paga comisión solo si ganó, y solo sobre la ganancia. Es
  // la misma regla que para cualquiera: nunca sobre el capital.
  const comisionCasa = resultadoCasaBruto > 0
    ? Math.floor(resultadoCasaBruto * tasaComisionCasa)
    : 0;

  const pagoCasa = liberadoCasa + cubiertoTotal + resultadoCasaBruto - comisionCasa;

  const resultado: ResultadoCasa = {
    tipo: 'CASA',
    opcionGanadoraId,
    presupuestoTotalCentavos: presupuestoTotal,
    cubiertoTotalCentavos: cubiertoTotal,
    liberadoCasaCentavos: liberadoCasa,
    resultadoCasaBrutoCentavos: resultadoCasaBruto,
    comisionCasaCentavos: comisionCasa,
    pagoCasaCentavos: pagoCasa,
    comisionApostadoresCentavos: comisionApostadores,
    comisionTotalCentavos: comisionCasa + comisionApostadores,
    pagos,
    perdedores,
  };

  verificarInvariante(resultado, apuestas);
  return resultado;
}

// =====================================================================
//  Validación
// =====================================================================

function validarEntrada(
  opciones: OpcionCasa[],
  apuestas: ApuestaContraCasa[],
  opcionGanadoraId: string,
  tasaComisionCasa: number,
): void {
  if (opciones.length === 0) {
    throw new ErrorLiquidacion('SIN_POSICIONES', 'La casa no tiene opciones');
  }
  if (!opciones.some((o) => o.opcionId === opcionGanadoraId)) {
    throw new ErrorLiquidacion(
      'MERCADO_NO_EXISTE',
      `La opción ganadora ${opcionGanadoraId} no pertenece a esta casa`,
    );
  }

  const ids = new Set<string>();
  for (const o of opciones) {
    if (ids.has(o.opcionId)) {
      throw new ErrorLiquidacion('POSICION_DUPLICADA', `Opción repetida: ${o.opcionId}`);
    }
    ids.add(o.opcionId);

    if (!Number.isInteger(o.presupuestoCentavos)) {
      throw new ErrorLiquidacion(
        'MONTO_NO_ENTERO',
        `El presupuesto debe ser entero: ${o.presupuestoCentavos}`,
      );
    }
    if (o.presupuestoCentavos <= 0) {
      throw new ErrorLiquidacion(
        'MONTO_INVALIDO',
        'Una opción sin presupuesto no puede ofrecerse: nadie podría apostar contra ella',
      );
    }
  }

  for (const a of apuestas) {
    if (!ids.has(a.opcionId)) {
      throw new ErrorLiquidacion(
        'MERCADO_NO_EXISTE',
        `Hay una apuesta contra la opción ${a.opcionId}, que no existe`,
      );
    }
    if (!Number.isInteger(a.montoCentavos)) {
      throw new ErrorLiquidacion('MONTO_NO_ENTERO', `Monto no entero: ${a.montoCentavos}`);
    }
    if (a.montoCentavos <= 0) {
      throw new ErrorLiquidacion('MONTO_INVALIDO', 'Una apuesta debe ser positiva');
    }
    // El piso existe para que ningún plan pueda dejar el ingreso en
    // cero justo en quienes más juegan.
    if (a.tasaComision < 0.03 || a.tasaComision > 0.2) {
      throw new ErrorLiquidacion(
        'TASA_FUERA_DE_RANGO',
        `Tasa fuera de rango: ${a.tasaComision}`,
      );
    }
  }

  if (tasaComisionCasa < 0.03 || tasaComisionCasa > 0.2) {
    throw new ErrorLiquidacion(
      'TASA_FUERA_DE_RANGO',
      `Tasa de la casa fuera de rango: ${tasaComisionCasa}`,
    );
  }
}

/**
 * El invariante: el dinero no se crea ni se destruye.
 *
 *   presupuesto + apuestas == pagos + comisión + pérdidas
 *
 * Se verifica en TODA liquidación, no solo en las pruebas. Si falla,
 * la transacción se revierte y queda un incidente: es preferible no
 * pagar a pagar mal.
 */
function verificarInvariante(r: ResultadoCasa, apuestas: ApuestaContraCasa[]): void {
  const entra =
    r.presupuestoTotalCentavos +
    apuestas.reduce((t, a) => t + a.montoCentavos, 0);

  const sale =
    r.pagoCasaCentavos +
    r.pagos.reduce((t, p) => t + p.pagoCentavos, 0) +
    r.comisionTotalCentavos +
    r.perdedores.reduce((t, p) => t + p.perdidaCentavos, 0);

  // Las pérdidas de los apostadores ya están dentro del pago a la
  // casa: se cuentan una vez, no dos.
  const saleReal = sale - r.perdedores.reduce((t, p) => t + p.perdidaCentavos, 0);

  if (entra !== saleReal) {
    throw new ErrorLiquidacion(
      'INVARIANTE_ROTO',
      `Entra ${entra} pero sale ${saleReal}. Diferencia: ${entra - saleReal}`,
    );
  }
}

// =====================================================================
//  Previsualización, para la pantalla
// =====================================================================

/**
 * Qué pasa si apuesto X contra esta opción.
 *
 * El desglose se muestra ANTES de confirmar. Enterarse de la comisión
 * después de ganar es la forma más rápida de perder a alguien.
 */
export function previsualizarContraCasa(
  montoCentavos: number,
  cupoDisponibleCentavos: number,
  tasaComision: number,
): {
  cubiertoCentavos: number;
  sobranteCentavos: number;
  siGanaCentavos: number;
  comisionCentavos: number;
  siPierdeCentavos: number;
  cuotaEfectiva: number;
} {
  const cubierto = Math.min(montoCentavos, Math.max(0, cupoDisponibleCentavos));
  const sobrante = montoCentavos - cubierto;
  const comision = Math.floor(cubierto * tasaComision);
  const siGana = montoCentavos + cubierto - comision;

  return {
    cubiertoCentavos: cubierto,
    sobranteCentavos: sobrante,
    siGanaCentavos: siGana,
    comisionCentavos: comision,
    // Solo se pierde lo que llegó a tener contraparte.
    siPierdeCentavos: cubierto,
    cuotaEfectiva: cubierto > 0
      ? Number(((cubierto * 2 - comision) / cubierto).toFixed(4))
      : 1,
  };
}
