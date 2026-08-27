/**
 * Pruebas del MOTOR DE CASA.
 *
 * Sin base de datos: aritmética pura. Si el reparto está mal, aquí
 * falla — no en producción con dinero de alguien.
 *
 * Correr con:  npm run test:casa
 */

import {
  liquidarCasa,
  previsualizarContraCasa,
  type OpcionCasa,
  type ApuestaContraCasa,
} from '../dominio/casa.js';
import { ErrorLiquidacion } from '../dominio/liquidacion.js';

let pasadas = 0;
let fallidas = 0;

function prueba(nombre: string, fn: () => void): void {
  try {
    fn();
    pasadas++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallidas++;
    console.log(`  ✗ ${nombre}\n      ${e instanceof Error ? e.message : e}`);
  }
}

function grupo(n: string): void {
  console.log(`\n${n}`);
}

function igual<T>(real: T, esperado: T, ctx = ''): void {
  if (real !== esperado) {
    throw new Error(`${ctx}esperaba ${JSON.stringify(esperado)}, recibió ${JSON.stringify(real)}`);
  }
}

function debeFallar(codigo: string, fn: () => unknown): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErrorLiquidacion && e.codigo === codigo) return;
    throw new Error(`esperaba ${codigo}, recibió ${e instanceof Error ? e.message : e}`);
  }
  throw new Error(`esperaba que fallara con ${codigo}, pero pasó`);
}

/** El invariante que nunca puede romperse. */
function cuadra(
  opciones: OpcionCasa[],
  apuestas: ApuestaContraCasa[],
  ganadora: string,
  tasaCasa = 0.07,
): void {
  const r = liquidarCasa(opciones, apuestas, ganadora, tasaCasa);
  const entra =
    opciones.reduce((t, o) => t + o.presupuestoCentavos, 0) +
    apuestas.reduce((t, a) => t + a.montoCentavos, 0);
  const sale =
    r.pagoCasaCentavos +
    r.pagos.reduce((t, p) => t + p.pagoCentavos, 0) +
    r.comisionTotalCentavos;

  if (entra !== sale) {
    throw new Error(`entra ${entra}, sale ${sale}, diferencia ${entra - sale}`);
  }
}

// =====================================================================

console.log('Pruebas del MOTOR DE CASA\n' + '─'.repeat(56));

// El ejemplo real: S/800 repartidos en cuatro opciones.
const OPCIONES: OpcionCasa[] = [
  { opcionId: 'gana_A',    presupuestoCentavos: 20000 },
  { opcionId: 'mas_3_5',   presupuestoCentavos: 4000 },
  { opcionId: 'menos_1_5', presupuestoCentavos: 6000 },
  { opcionId: 'corners',   presupuestoCentavos: 50000 },
];

const LLENO: ApuestaContraCasa[] = [
  { usuarioId: 'ana',  opcionId: 'gana_A',    montoCentavos: 20000, tasaComision: 0.07, orden: 1 },
  { usuarioId: 'luis', opcionId: 'mas_3_5',   montoCentavos: 4000,  tasaComision: 0.07, orden: 2 },
  { usuarioId: 'juan', opcionId: 'menos_1_5', montoCentavos: 6000,  tasaComision: 0.04, orden: 3 },
  { usuarioId: 'mia',  opcionId: 'corners',   montoCentavos: 50000, tasaComision: 0.07, orden: 4 },
];

// ---------------------------------------------------------------------
grupo('La casa gana cuando la opción cara NO ocurre');
// ---------------------------------------------------------------------

prueba('ocurre la opción más barata: la casa cobra de las otras tres', () => {
  const r = liquidarCasa(OPCIONES, LLENO, 'gana_A', 0.07);

  // Paga S/200 a ana, cobra S/40 + S/60 + S/500 de los otros tres.
  igual(r.resultadoCasaBrutoCentavos, 40000, 'bruto: ');
  igual(r.comisionCasaCentavos, 2800, 'comisión de la casa: ');
  igual(r.pagoCasaCentavos, 117200, 'la casa recibe: ');
});

prueba('ana cobra su ganancia menos SU comisión', () => {
  const r = liquidarCasa(OPCIONES, LLENO, 'gana_A', 0.07);
  const ana = r.pagos.find((p) => p.usuarioId === 'ana')!;

  igual(ana.gananciaBrutaCentavos, 20000, 'ganancia bruta: ');
  igual(ana.comisionCentavos, 1400, 'comisión (7%): ');
  igual(ana.pagoCentavos, 38600, 'se lleva: ');
});

prueba('los otros tres no llevan movimiento', () => {
  // Su retención ya descontó al entrar. Un movimiento de pérdida
  // adicional descontaría el dinero dos veces.
  const r = liquidarCasa(OPCIONES, LLENO, 'gana_A', 0.07);
  igual(r.perdedores.length, 3, 'perdedores: ');
  igual(r.pagos.filter((p) => p.pagoCentavos > 0).length, 1, 'pagos: ');
});

// ---------------------------------------------------------------------
grupo('La casa pierde cuando ocurre la opción cara');
// ---------------------------------------------------------------------

prueba('ocurre la opción de S/500: la casa termina en negativo', () => {
  const r = liquidarCasa(OPCIONES, LLENO, 'corners', 0.07);

  // Paga S/500 a mia, cobra S/200 + S/40 + S/60.
  igual(r.resultadoCasaBrutoCentavos, -20000, 'bruto: ');
  igual(r.pagoCasaCentavos, 60000, 'recibe: ');
});

prueba('la casa NO paga comisión cuando pierde', () => {
  // La comisión sale de la ganancia, nunca del capital. Cobrarle a
  // quien perdió sería cobrar por perder.
  const r = liquidarCasa(OPCIONES, LLENO, 'corners', 0.07);
  igual(r.comisionCasaCentavos, 0, 'comisión: ');
});

prueba('la plataforma gana igual, pierda quien pierda', () => {
  const gana = liquidarCasa(OPCIONES, LLENO, 'gana_A', 0.07);
  const pierde = liquidarCasa(OPCIONES, LLENO, 'corners', 0.07);

  if (gana.comisionTotalCentavos <= 0) throw new Error('sin comisión al ganar la casa');
  if (pierde.comisionTotalCentavos <= 0) throw new Error('sin comisión al perder la casa');
});

// ---------------------------------------------------------------------
grupo('Liquidación parcial: corre con lo que se llenó');
// ---------------------------------------------------------------------

prueba('lo que nadie tomó vuelve a la casa sin riesgo', () => {
  const poco: ApuestaContraCasa[] = [
    { usuarioId: 'ana', opcionId: 'gana_A', montoCentavos: 5000, tasaComision: 0.07, orden: 1 },
  ];
  const r = liquidarCasa(OPCIONES, poco, 'gana_A', 0.07);

  igual(r.cubiertoTotalCentavos, 5000, 'cubierto: ');
  igual(r.liberadoCasaCentavos, 75000, 'liberado: ');
  // Puso S/800, solo S/50 corrieron riesgo, y los perdió.
  igual(r.pagoCasaCentavos, 75000, 'recibe: ');
});

prueba('si nadie apuesta, la casa recupera todo', () => {
  // Esto es lo que hace el modo casa viable: sin contraparte no hay
  // pérdida, solo el tiempo perdido.
  const r = liquidarCasa(OPCIONES, [], 'gana_A', 0.07);
  igual(r.pagoCasaCentavos, 80000, 'recibe: ');
  igual(r.cubiertoTotalCentavos, 0, 'cubierto: ');
  igual(r.comisionTotalCentavos, 0, 'comisión: ');
});

prueba('lo que no cabe se devuelve, sin correr riesgo', () => {
  // La casa puso S/200 en gana_A. Ana quiere poner S/300.
  const exceso: ApuestaContraCasa[] = [
    { usuarioId: 'ana', opcionId: 'gana_A', montoCentavos: 30000, tasaComision: 0.07, orden: 1 },
  ];
  const r = liquidarCasa(OPCIONES, exceso, 'corners', 0.07);
  const ana = r.pagos.find((p) => p.usuarioId === 'ana')!;

  igual(ana.cubiertoCentavos, 20000, 'cubierto: ');
  igual(ana.sobranteCentavos, 10000, 'sobrante: ');
  // Perdió solo lo cubierto; el sobrante vuelve entero.
  igual(ana.pagoCentavos, 10000, 'se lleva el sobrante: ');
});

prueba('el cupo se toma por orden de llegada', () => {
  // Por llegada y no a prorrata porque es lo único que la gente puede
  // verificar por su cuenta.
  const cola: ApuestaContraCasa[] = [
    { usuarioId: 'primero', opcionId: 'gana_A', montoCentavos: 15000, tasaComision: 0.07, orden: 1 },
    { usuarioId: 'segundo', opcionId: 'gana_A', montoCentavos: 15000, tasaComision: 0.07, orden: 2 },
  ];
  const r = liquidarCasa(OPCIONES, cola, 'gana_A', 0.07);

  const p1 = r.pagos.find((p) => p.usuarioId === 'primero')!;
  const p2 = r.pagos.find((p) => p.usuarioId === 'segundo')!;

  igual(p1.cubiertoCentavos, 15000, 'el primero entra completo: ');
  igual(p2.cubiertoCentavos, 5000, 'el segundo toma lo que queda: ');
  igual(p2.sobranteCentavos, 10000, 'y le devuelven el resto: ');
});

// ---------------------------------------------------------------------
grupo('Cada quien paga SU tasa');
// ---------------------------------------------------------------------

prueba('un suscriptor paga 4% y un usuario gratis 7%', () => {
  const mixto: ApuestaContraCasa[] = [
    { usuarioId: 'gratis', opcionId: 'gana_A', montoCentavos: 10000, tasaComision: 0.07, orden: 1 },
    { usuarioId: 'pro',    opcionId: 'gana_A', montoCentavos: 10000, tasaComision: 0.04, orden: 2 },
  ];
  const r = liquidarCasa(OPCIONES, mixto, 'gana_A', 0.07);

  igual(r.pagos.find((p) => p.usuarioId === 'gratis')!.comisionCentavos, 700, 'gratis: ');
  igual(r.pagos.find((p) => p.usuarioId === 'pro')!.comisionCentavos, 400, 'pro: ');
});

prueba('el suscriptor no le quita nada al usuario gratis', () => {
  // La tasa se aplica sobre la parte de CADA UNO. Si se calculara
  // sobre el bote, el usuario gratis subsidiaría al suscriptor.
  const mixto: ApuestaContraCasa[] = [
    { usuarioId: 'gratis', opcionId: 'gana_A', montoCentavos: 10000, tasaComision: 0.07, orden: 1 },
    { usuarioId: 'pro',    opcionId: 'gana_A', montoCentavos: 10000, tasaComision: 0.04, orden: 2 },
  ];
  const soloGratis: ApuestaContraCasa[] = [
    { usuarioId: 'gratis', opcionId: 'gana_A', montoCentavos: 10000, tasaComision: 0.07, orden: 1 },
  ];

  const conPro = liquidarCasa(OPCIONES, mixto, 'gana_A', 0.07);
  const sinPro = liquidarCasa(OPCIONES, soloGratis, 'gana_A', 0.07);

  igual(
    conPro.pagos.find((p) => p.usuarioId === 'gratis')!.pagoCentavos,
    sinPro.pagos.find((p) => p.usuarioId === 'gratis')!.pagoCentavos,
    'el pago al usuario gratis: ',
  );
});

prueba('la casa paga su propia tasa, sin trato especial', () => {
  const r4 = liquidarCasa(OPCIONES, LLENO, 'gana_A', 0.04);
  const r7 = liquidarCasa(OPCIONES, LLENO, 'gana_A', 0.07);
  igual(r4.comisionCasaCentavos, 1600, 'casa con plan pro: ');
  igual(r7.comisionCasaCentavos, 2800, 'casa con plan gratis: ');
});

// ---------------------------------------------------------------------
grupo('Errores que deben bloquearse');
// ---------------------------------------------------------------------

prueba('una casa sin opciones no se liquida', () => {
  debeFallar('SIN_POSICIONES', () => liquidarCasa([], [], 'x', 0.07));
});

prueba('una opción sin presupuesto se rechaza', () => {
  // Nadie podría apostar contra ella: sería ofrecer algo que no
  // se puede tomar.
  debeFallar('MONTO_INVALIDO', () =>
    liquidarCasa([{ opcionId: 'a', presupuestoCentavos: 0 }], [], 'a', 0.07));
});

prueba('un presupuesto con decimales se rechaza', () => {
  debeFallar('MONTO_NO_ENTERO', () =>
    liquidarCasa([{ opcionId: 'a', presupuestoCentavos: 100.5 }], [], 'a', 0.07));
});

prueba('una opción ganadora que no existe se rechaza', () => {
  debeFallar('MERCADO_NO_EXISTE', () =>
    liquidarCasa(OPCIONES, [], 'inventada', 0.07));
});

prueba('una apuesta contra una opción inexistente se rechaza', () => {
  debeFallar('MERCADO_NO_EXISTE', () =>
    liquidarCasa(OPCIONES, [
      { usuarioId: 'x', opcionId: 'no_existe', montoCentavos: 1000, tasaComision: 0.07, orden: 1 },
    ], 'gana_A', 0.07));
});

prueba('una tasa bajo el piso del 3% se rechaza', () => {
  debeFallar('TASA_FUERA_DE_RANGO', () =>
    liquidarCasa(OPCIONES, LLENO, 'gana_A', 0));
});

prueba('opciones repetidas se rechazan', () => {
  debeFallar('POSICION_DUPLICADA', () =>
    liquidarCasa([
      { opcionId: 'a', presupuestoCentavos: 1000 },
      { opcionId: 'a', presupuestoCentavos: 2000 },
    ], [], 'a', 0.07));
});

// ---------------------------------------------------------------------
grupo('El invariante nunca falla');
// ---------------------------------------------------------------------

prueba('cuadra al centavo en el caso completo', () => {
  for (const o of OPCIONES) cuadra(OPCIONES, LLENO, o.opcionId);
});

prueba('cuadra con liquidación parcial', () => {
  const parcial: ApuestaContraCasa[] = [
    { usuarioId: 'a', opcionId: 'gana_A',  montoCentavos: 7000,  tasaComision: 0.07, orden: 1 },
    { usuarioId: 'b', opcionId: 'corners', montoCentavos: 13000, tasaComision: 0.04, orden: 2 },
  ];
  for (const o of OPCIONES) cuadra(OPCIONES, parcial, o.opcionId);
});

prueba('cuadra con montos primos y división inexacta', () => {
  const primos: ApuestaContraCasa[] = [
    { usuarioId: 'a', opcionId: 'gana_A', montoCentavos: 7919, tasaComision: 0.07, orden: 1 },
    { usuarioId: 'b', opcionId: 'gana_A', montoCentavos: 6113, tasaComision: 0.04, orden: 2 },
    { usuarioId: 'c', opcionId: 'gana_A', montoCentavos: 4409, tasaComision: 0.07, orden: 3 },
  ];
  for (const o of OPCIONES) cuadra(OPCIONES, primos, o.opcionId);
});

prueba('barrido de 500 combinaciones aleatorias siempre cuadra', () => {
  let semilla = 20260826;
  const azar = (): number => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
  };

  for (let i = 0; i < 500; i++) {
    const cuantas = 2 + Math.floor(azar() * 4);
    const ops: OpcionCasa[] = Array.from({ length: cuantas }, (_, k) => ({
      opcionId: `o${k}`,
      presupuestoCentavos: 500 + Math.floor(azar() * 90000),
    }));

    const cuantos = Math.floor(azar() * 9);
    const aps: ApuestaContraCasa[] = Array.from({ length: cuantos }, (_, k) => ({
      usuarioId: `u${k}`,
      opcionId: `o${Math.floor(azar() * cuantas)}`,
      montoCentavos: 100 + Math.floor(azar() * 120000),
      tasaComision: azar() < 0.5 ? 0.07 : 0.04,
      orden: k,
    }));

    const ganadora = `o${Math.floor(azar() * cuantas)}`;
    const tasaCasa = azar() < 0.5 ? 0.07 : 0.04;
    cuadra(ops, aps, ganadora, tasaCasa);
  }
});

// ---------------------------------------------------------------------
grupo('Previsualización, antes de confirmar');
// ---------------------------------------------------------------------

prueba('avisa cuánto entra en juego y cuánto sobra', () => {
  const p = previsualizarContraCasa(30000, 20000, 0.07);
  igual(p.cubiertoCentavos, 20000, 'cubierto: ');
  igual(p.sobranteCentavos, 10000, 'sobrante: ');
  igual(p.siPierdeCentavos, 20000, 'solo se pierde lo cubierto: ');
});

prueba('el desglose muestra la comisión antes de apostar', () => {
  const p = previsualizarContraCasa(10000, 50000, 0.07);
  igual(p.comisionCentavos, 700, 'comisión: ');
  igual(p.siGanaCentavos, 19300, 'si gana: ');
  igual(p.cuotaEfectiva, 1.93, 'cuota efectiva: ');
});

prueba('sin cupo disponible, la previsualización no miente', () => {
  const p = previsualizarContraCasa(10000, 0, 0.07);
  igual(p.cubiertoCentavos, 0, 'cubierto: ');
  igual(p.siPierdeCentavos, 0, 'no arriesga nada: ');
  igual(p.sobranteCentavos, 10000, 'todo vuelve: ');
});

// ---------------------------------------------------------------------
console.log(`\n${'─'.repeat(56)}`);
console.log(`  ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas === 0) console.log('  Invariante verificado en toda liquidación ✓');
console.log(`${'─'.repeat(56)}\n`);

if (fallidas > 0) process.exit(1);
