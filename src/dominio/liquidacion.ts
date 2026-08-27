/**
 * Módulo LEDGER — función de liquidación
 * Especificación funcional v1.4, secciones 3.2 y 3.5
 *
 * Reglas que esta función no negocia:
 *  1. Todo en centavos enteros. Nunca punto flotante.
 *  2. La comisión sale de la ganancia, jamás del capital ni de una devolución.
 *  3. La tasa se resuelve POR USUARIO GANADOR, no por sala.
 *  4. Primero se reparte la ganancia, después se aplica la tasa de cada quien.
 *     Al revés, el usuario gratis subsidia al suscriptor.
 *  5. suma(pagos) + comision == bote. Al centavo. Siempre.
 */

export type Lado = 'A_FAVOR' | 'EN_CONTRA';

export interface Posicion {
  usuarioId: string;
  lado: Lado;
  /** Aporte en centavos enteros. */
  montoCentavos: number;
  /** Tasa del plan del usuario al momento de liquidar. Ej: 0.07 | 0.04 */
  tasaComision: number;
}

export interface PagoUsuario {
  usuarioId: string;
  /** Lo que aportó. */
  aporteCentavos: number;
  /** Su parte del dinero del lado perdedor, antes de comisión. */
  gananciaBrutaCentavos: number;
  /** Comisión aplicada, según SU plan. */
  comisionCentavos: number;
  /** Lo que se le acredita: aporte + ganancia neta. */
  pagoCentavos: number;
  /** Tasa efectiva de retorno sobre lo apostado. */
  cuotaEfectiva: number;
}

export interface ResultadoLiquidacion {
  tipo: 'CON_GANADOR';
  ladoGanador: Lado;
  boteCentavos: number;
  gananciaBrutaCentavos: number;
  comisionTotalCentavos: number;
  pagos: PagoUsuario[];
  perdedores: { usuarioId: string; perdidaCentavos: number }[];
}

export interface ResultadoAnulacion {
  tipo: 'ANULADO';
  motivo: MotivoAnulacion;
  boteCentavos: number;
  comisionTotalCentavos: 0;
  devoluciones: { usuarioId: string; devolucionCentavos: number }[];
}

export type MotivoAnulacion =
  | 'SIN_CONTRAPARTE'
  | 'SALA_VACIA'
  | 'PARTIDO_CANCELADO'
  | 'PARTIDO_POSTERGADO'
  | 'PARTIDO_ABANDONADO'
  | 'DATO_NO_DISPONIBLE'
  | 'ERROR_OPERATIVO';

export class ErrorLiquidacion extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorLiquidacion';
  }
}

/** Piso de comisión de la sec. 3.5. Ningún plan puede llegar a 0%. */
export const TASA_MINIMA = 0.03;
export const TASA_MAXIMA = 0.20;

// ---------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------

function validar(posiciones: Posicion[]): void {
  if (posiciones.length === 0) {
    throw new ErrorLiquidacion('SIN_POSICIONES', 'El mercado no tiene posiciones');
  }

  const vistos = new Set<string>();
  for (const p of posiciones) {
    if (!Number.isInteger(p.montoCentavos)) {
      throw new ErrorLiquidacion(
        'MONTO_NO_ENTERO',
        `El monto de ${p.usuarioId} no es un entero de centavos: ${p.montoCentavos}`,
      );
    }
    if (p.montoCentavos <= 0) {
      throw new ErrorLiquidacion(
        'MONTO_INVALIDO',
        `El monto de ${p.usuarioId} debe ser positivo`,
      );
    }
    // Un usuario en ambos lados apuesta contra sí mismo: pérdida garantizada
    // por comisión y cero efecto útil. Validación 9.2.4 de la spec.
    const clave = `${p.usuarioId}`;
    if (vistos.has(clave)) {
      throw new ErrorLiquidacion(
        'POSICION_DUPLICADA',
        `${p.usuarioId} tiene más de una posición en el mercado`,
      );
    }
    vistos.add(clave);

    if (p.tasaComision < TASA_MINIMA || p.tasaComision > TASA_MAXIMA) {
      throw new ErrorLiquidacion(
        'TASA_FUERA_DE_RANGO',
        `Tasa ${p.tasaComision} de ${p.usuarioId} fuera del rango permitido`,
      );
    }
  }
}

function totalPorLado(posiciones: Posicion[], lado: Lado): number {
  return posiciones
    .filter((p) => p.lado === lado)
    .reduce((suma, p) => suma + p.montoCentavos, 0);
}

/**
 * ¿El mercado puede correr?
 * Regla estructural: dos lados, ninguno vacío, totales iguales.
 */
export function estaBalanceado(posiciones: Posicion[]): boolean {
  const a = totalPorLado(posiciones, 'A_FAVOR');
  const b = totalPorLado(posiciones, 'EN_CONTRA');
  return a > 0 && b > 0 && a === b;
}

// ---------------------------------------------------------------------
// Liquidación con ganador
// ---------------------------------------------------------------------

export function liquidar(
  posiciones: Posicion[],
  ladoGanador: Lado,
): ResultadoLiquidacion {
  validar(posiciones);

  const totalGanador = totalPorLado(posiciones, ladoGanador);
  const ladoPerdedor: Lado = ladoGanador === 'A_FAVOR' ? 'EN_CONTRA' : 'A_FAVOR';
  const gananciaBruta = totalPorLado(posiciones, ladoPerdedor);

  if (totalGanador === 0 || gananciaBruta === 0) {
    throw new ErrorLiquidacion(
      'LADO_VACIO',
      'Un lado del mercado está vacío: debió anularse, no liquidarse',
    );
  }
  if (totalGanador !== gananciaBruta) {
    throw new ErrorLiquidacion(
      'BALANCE_ROTO',
      `Los lados no están equilibrados: ${totalGanador} vs ${gananciaBruta}`,
    );
  }

  const bote = totalGanador + gananciaBruta;
  const ganadores = posiciones.filter((p) => p.lado === ladoGanador);

  const pagos: PagoUsuario[] = [];
  let comisionAcumulada = 0;
  let repartoAcumulado = 0;

  for (const g of ganadores) {
    // Paso 1: su parte proporcional de la ganancia bruta.
    //         Se trunca hacia abajo; el residuo se resuelve al final.
    const brutaUsuario = Math.floor(
      (gananciaBruta * g.montoCentavos) / totalGanador,
    );

    // Paso 2: SU tasa, sobre SU parte. Nunca una tasa promedio del bote.
    const comision = Math.floor(brutaUsuario * g.tasaComision);
    const netaUsuario = brutaUsuario - comision;

    pagos.push({
      usuarioId: g.usuarioId,
      aporteCentavos: g.montoCentavos,
      gananciaBrutaCentavos: brutaUsuario,
      comisionCentavos: comision,
      pagoCentavos: g.montoCentavos + netaUsuario,
      cuotaEfectiva:
        Math.round(((g.montoCentavos + netaUsuario) / g.montoCentavos) * 10000) /
        10000,
    });

    comisionAcumulada += comision;
    repartoAcumulado += brutaUsuario;
  }

  // Los centavos que se perdieron al truncar van a la casa.
  // Es la única forma de que el invariante cierre exacto.
  const residuo = gananciaBruta - repartoAcumulado;
  const comisionTotal = comisionAcumulada + residuo;

  const perdedores = posiciones
    .filter((p) => p.lado !== ladoGanador)
    .map((p) => ({ usuarioId: p.usuarioId, perdidaCentavos: p.montoCentavos }));

  const resultado: ResultadoLiquidacion = {
    tipo: 'CON_GANADOR',
    ladoGanador,
    boteCentavos: bote,
    gananciaBrutaCentavos: gananciaBruta,
    comisionTotalCentavos: comisionTotal,
    pagos,
    perdedores,
  };

  verificarInvariante(resultado);
  return resultado;
}

// ---------------------------------------------------------------------
// Anulación
// ---------------------------------------------------------------------

/**
 * Devolución del 100%. La casa no cobra nada, sin excepciones (sec. 7.2).
 * "No hubo resultado" no es lo mismo que "nadie acertó": lo segundo no
 * puede ocurrir en un mercado binario.
 */
export function anular(
  posiciones: Posicion[],
  motivo: MotivoAnulacion,
): ResultadoAnulacion {
  validar(posiciones);

  const bote = posiciones.reduce((s, p) => s + p.montoCentavos, 0);

  return {
    tipo: 'ANULADO',
    motivo,
    boteCentavos: bote,
    comisionTotalCentavos: 0,
    devoluciones: posiciones.map((p) => ({
      usuarioId: p.usuarioId,
      devolucionCentavos: p.montoCentavos, // íntegro, siempre
    })),
  };
}

// ---------------------------------------------------------------------
// Invariante
// ---------------------------------------------------------------------

/**
 * suma(pagos) + comision == bote.
 * Si esto falla, la transacción se revierte y se registra un incidente.
 * No hay margen de tolerancia: es al centavo.
 */
export function verificarInvariante(r: ResultadoLiquidacion): void {
  const sumaPagos = r.pagos.reduce((s, p) => s + p.pagoCentavos, 0);
  const total = sumaPagos + r.comisionTotalCentavos;

  if (total !== r.boteCentavos) {
    throw new ErrorLiquidacion(
      'DESCUADRE',
      `Descuadre de ${total - r.boteCentavos} centavos: ` +
        `pagos ${sumaPagos} + comisión ${r.comisionTotalCentavos} != bote ${r.boteCentavos}`,
    );
  }
}

// ---------------------------------------------------------------------
// Utilidades de presentación
// ---------------------------------------------------------------------

export function aSoles(centavos: number): string {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${signo}S/${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Desglose para la pantalla de apuesta (sec. 5.1 del documento de flujos).
 * Se muestra SIEMPRE antes de confirmar, incluso con tasa 0 en el beta.
 */
export function previsualizar(
  montoCentavos: number,
  totalMiLado: number,
  totalOtroLado: number,
  tasaComision: number,
): { siGano: number; comision: number; siPierdo: number } {
  const miLadoConMigo = totalMiLado + montoCentavos;
  const brutaEstimada = Math.floor(
    (totalOtroLado * montoCentavos) / miLadoConMigo,
  );
  const comision = Math.floor(brutaEstimada * tasaComision);
  return {
    siGano: montoCentavos + brutaEstimada - comision,
    comision,
    siPierdo: -montoCentavos,
  };
}
