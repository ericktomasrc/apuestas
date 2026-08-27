/**
 * Pruebas del módulo LEDGER
 * Cubre los guiones G1, G7, G8, G16 del documento de flujos
 * y los casos A, B, C de la sec. 3.3 de la especificación.
 *
 * Correr con:  npx tsx src/liquidacion.test.ts
 */

import {
  liquidar,
  anular,
  estaBalanceado,
  previsualizar,
  aSoles,
  ErrorLiquidacion,
  type Posicion,
} from './../dominio/liquidacion.js';

// ---------------------------------------------------------------------
// Arnés de pruebas mínimo (sin dependencias)
// ---------------------------------------------------------------------

let pasadas = 0;
let fallidas = 0;
const fallos: string[] = [];

function prueba(nombre: string, fn: () => void): void {
  try {
    fn();
    pasadas++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallidas++;
    const msg = e instanceof Error ? e.message : String(e);
    fallos.push(`${nombre}\n      ${msg}`);
    console.log(`  ✗ ${nombre}\n      ${msg}`);
  }
}

function grupo(nombre: string): void {
  console.log(`\n${nombre}`);
}

function igual<T>(real: T, esperado: T, contexto = ''): void {
  if (real !== esperado) {
    throw new Error(
      `${contexto}esperaba ${JSON.stringify(esperado)}, recibió ${JSON.stringify(real)}`,
    );
  }
}

function lanza(codigo: string, fn: () => unknown): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErrorLiquidacion) {
      igual(e.codigo, codigo, 'código de error: ');
      return;
    }
    throw e;
  }
  throw new Error(`esperaba que lanzara ${codigo}, no lanzó nada`);
}

const GRATIS = 0.07;
const PRO = 0.04;

function pos(
  usuarioId: string,
  lado: 'A_FAVOR' | 'EN_CONTRA',
  soles: number,
  tasa = GRATIS,
): Posicion {
  return { usuarioId, lado, montoCentavos: soles * 100, tasaComision: tasa };
}

/** El invariante se revisa en TODA liquidación, no solo donde se espera. */
function cuadra(r: ReturnType<typeof liquidar>): void {
  const suma =
    r.pagos.reduce((s, p) => s + p.pagoCentavos, 0) + r.comisionTotalCentavos;
  igual(suma, r.boteCentavos, 'invariante: ');
}

// =====================================================================
grupo('Caso A — Simétrico 2v2, S/20 cada uno (spec sec. 3.3)');
// =====================================================================

prueba('gana A FAVOR: cada ganador recibe S/38.60', () => {
  const r = liquidar(
    [
      pos('juan', 'A_FAVOR', 20),
      pos('ana', 'A_FAVOR', 20),
      pos('luis', 'EN_CONTRA', 20),
      pos('rosa', 'EN_CONTRA', 20),
    ],
    'A_FAVOR',
  );
  igual(r.boteCentavos, 8000);
  igual(r.gananciaBrutaCentavos, 4000);
  igual(r.comisionTotalCentavos, 280);
  igual(r.pagos.find((p) => p.usuarioId === 'juan')!.pagoCentavos, 3860);
  igual(r.pagos.find((p) => p.usuarioId === 'ana')!.pagoCentavos, 3860);
  igual(r.perdedores.length, 2);
  cuadra(r);
});

prueba('la cuota efectiva es 1.93x', () => {
  const r = liquidar(
    [pos('juan', 'A_FAVOR', 20), pos('luis', 'EN_CONTRA', 20)],
    'A_FAVOR',
  );
  igual(r.pagos[0].cuotaEfectiva, 1.93);
});

// =====================================================================
grupo('Caso B / G8 — Asimétrico 5v1 con montos igualados');
// =====================================================================

const cinco_v_uno: Posicion[] = [
  pos('u1', 'A_FAVOR', 20),
  pos('u2', 'A_FAVOR', 20),
  pos('u3', 'A_FAVOR', 20),
  pos('u4', 'A_FAVOR', 20),
  pos('u5', 'A_FAVOR', 20),
  pos('solo', 'EN_CONTRA', 100),
];

prueba('gana el grupo de 5: S/38.60 cada uno', () => {
  const r = liquidar(cinco_v_uno, 'A_FAVOR');
  igual(r.boteCentavos, 20000);
  igual(r.comisionTotalCentavos, 700);
  for (const p of r.pagos) igual(p.pagoCentavos, 3860, `${p.usuarioId}: `);
  cuadra(r);
});

prueba('gana el solitario: recibe S/193.00', () => {
  const r = liquidar(cinco_v_uno, 'EN_CONTRA');
  igual(r.pagos.length, 1);
  igual(r.pagos[0].pagoCentavos, 19300);
  igual(r.comisionTotalCentavos, 700);
  igual(r.perdedores.length, 5);
  cuadra(r);
});

prueba('ambos lados rinden 1.93x: la asimetría no crea ventaja', () => {
  const grupo5 = liquidar(cinco_v_uno, 'A_FAVOR');
  const solo1 = liquidar(cinco_v_uno, 'EN_CONTRA');
  igual(grupo5.pagos[0].cuotaEfectiva, 1.93);
  igual(solo1.pagos[0].cuotaEfectiva, 1.93);
});

// =====================================================================
grupo('Caso C / G7 — Reparto proporcional con montos distintos');
// =====================================================================

prueba('Juan S/30 y Ana S/15 reciben proporcionalmente', () => {
  const r = liquidar(
    [
      pos('juan', 'A_FAVOR', 30),
      pos('ana', 'A_FAVOR', 15),
      pos('luis', 'EN_CONTRA', 25),
      pos('pedro', 'EN_CONTRA', 20),
    ],
    'A_FAVOR',
  );
  igual(r.boteCentavos, 9000);
  igual(r.pagos.find((p) => p.usuarioId === 'juan')!.pagoCentavos, 5790);
  igual(r.pagos.find((p) => p.usuarioId === 'ana')!.pagoCentavos, 2895);
  igual(r.comisionTotalCentavos, 315);
  cuadra(r);
});

// =====================================================================
grupo('G1 — Sala feliz de principio a fin');
// =====================================================================

prueba('Juan S/20 + Ana S/10 contra Luis S/30', () => {
  const r = liquidar(
    [
      pos('juan', 'A_FAVOR', 20),
      pos('ana', 'A_FAVOR', 10),
      pos('luis', 'EN_CONTRA', 30),
    ],
    'A_FAVOR',
  );
  igual(r.pagos.find((p) => p.usuarioId === 'juan')!.pagoCentavos, 3860);
  igual(r.pagos.find((p) => p.usuarioId === 'ana')!.pagoCentavos, 1930);
  igual(r.comisionTotalCentavos, 210);
  igual(r.boteCentavos, 6000);
  cuadra(r);
});

// =====================================================================
grupo('G16 — Suscriptor y no suscriptor en el mismo mercado');
// =====================================================================

prueba('cada uno paga SU tasa sobre SU parte', () => {
  const r = liquidar(
    [
      pos('juan', 'A_FAVOR', 20, PRO),
      pos('ana', 'A_FAVOR', 20, GRATIS),
      pos('luis', 'EN_CONTRA', 40),
    ],
    'A_FAVOR',
  );
  const juan = r.pagos.find((p) => p.usuarioId === 'juan')!;
  const ana = r.pagos.find((p) => p.usuarioId === 'ana')!;

  igual(juan.comisionCentavos, 80, 'comisión Juan (4%): ');
  igual(ana.comisionCentavos, 140, 'comisión Ana (7%): ');
  igual(juan.pagoCentavos, 3920);
  igual(ana.pagoCentavos, 3860);
  igual(r.comisionTotalCentavos, 220);
  cuadra(r);
});

prueba('el suscriptor NO le quita nada al usuario gratis', () => {
  const conSuscriptor = liquidar(
    [
      pos('juan', 'A_FAVOR', 20, PRO),
      pos('ana', 'A_FAVOR', 20, GRATIS),
      pos('luis', 'EN_CONTRA', 40),
    ],
    'A_FAVOR',
  );
  const sinSuscriptor = liquidar(
    [
      pos('juan', 'A_FAVOR', 20, GRATIS),
      pos('ana', 'A_FAVOR', 20, GRATIS),
      pos('luis', 'EN_CONTRA', 40),
    ],
    'A_FAVOR',
  );
  // Ana recibe exactamente lo mismo en ambos escenarios.
  igual(
    conSuscriptor.pagos.find((p) => p.usuarioId === 'ana')!.pagoCentavos,
    sinSuscriptor.pagos.find((p) => p.usuarioId === 'ana')!.pagoCentavos,
  );
});

// =====================================================================
grupo('Anulaciones — devolución del 100%, comisión 0');
// =====================================================================

prueba('partido suspendido: todos recuperan íntegro', () => {
  const r = anular(
    [
      pos('juan', 'A_FAVOR', 20),
      pos('ana', 'A_FAVOR', 10),
      pos('luis', 'EN_CONTRA', 30),
    ],
    'PARTIDO_ABANDONADO',
  );
  igual(r.comisionTotalCentavos, 0);
  igual(r.boteCentavos, 6000);
  igual(r.devoluciones.find((d) => d.usuarioId === 'juan')!.devolucionCentavos, 2000);
  igual(r.devoluciones.find((d) => d.usuarioId === 'luis')!.devolucionCentavos, 3000);
  const suma = r.devoluciones.reduce((s, d) => s + d.devolucionCentavos, 0);
  igual(suma, r.boteCentavos, 'devuelto == bote: ');
});

prueba('sin contraparte: también devuelve todo', () => {
  const r = anular([pos('juan', 'A_FAVOR', 20)], 'SIN_CONTRAPARTE');
  igual(r.comisionTotalCentavos, 0);
  igual(r.devoluciones[0].devolucionCentavos, 2000);
});

// =====================================================================
grupo('Balance — la regla estructural');
// =====================================================================

prueba('lados iguales están balanceados', () => {
  igual(
    estaBalanceado([pos('a', 'A_FAVOR', 30), pos('b', 'EN_CONTRA', 30)]),
    true,
  );
});

prueba('un lado vacío NO está balanceado', () => {
  igual(estaBalanceado([pos('a', 'A_FAVOR', 30)]), false);
});

prueba('montos distintos NO están balanceados', () => {
  igual(
    estaBalanceado([pos('a', 'A_FAVOR', 30), pos('b', 'EN_CONTRA', 20)]),
    false,
  );
});

prueba('5v1 con montos igualados SÍ está balanceado', () => {
  igual(estaBalanceado(cinco_v_uno), true);
});

// =====================================================================
grupo('Errores que deben bloquearse');
// =====================================================================

prueba('liquidar con un lado vacío lanza LADO_VACIO', () => {
  lanza('LADO_VACIO', () => liquidar([pos('juan', 'A_FAVOR', 20)], 'A_FAVOR'));
});

prueba('liquidar desbalanceado lanza BALANCE_ROTO', () => {
  lanza('BALANCE_ROTO', () =>
    liquidar([pos('a', 'A_FAVOR', 30), pos('b', 'EN_CONTRA', 20)], 'A_FAVOR'),
  );
});

prueba('monto con decimales lanza MONTO_NO_ENTERO', () => {
  lanza('MONTO_NO_ENTERO', () =>
    liquidar(
      [
        { usuarioId: 'a', lado: 'A_FAVOR', montoCentavos: 20.5, tasaComision: GRATIS },
        pos('b', 'EN_CONTRA', 20),
      ],
      'A_FAVOR',
    ),
  );
});

prueba('usuario duplicado lanza POSICION_DUPLICADA', () => {
  lanza('POSICION_DUPLICADA', () =>
    liquidar(
      [
        pos('juan', 'A_FAVOR', 20),
        pos('juan', 'EN_CONTRA', 20),
      ],
      'A_FAVOR',
    ),
  );
});

prueba('tasa 0% lanza TASA_FUERA_DE_RANGO (piso de 3%)', () => {
  lanza('TASA_FUERA_DE_RANGO', () =>
    liquidar(
      [pos('a', 'A_FAVOR', 20, 0), pos('b', 'EN_CONTRA', 20)],
      'A_FAVOR',
    ),
  );
});

prueba('mercado vacío lanza SIN_POSICIONES', () => {
  lanza('SIN_POSICIONES', () => liquidar([], 'A_FAVOR'));
});

// =====================================================================
grupo('Redondeo — el residuo va a la casa, el invariante nunca falla');
// =====================================================================

prueba('tres ganadores con división inexacta cuadra al centavo', () => {
  // 3 personas repartiendo S/10 => 333.33 centavos cada una
  const r = liquidar(
    [
      pos('a', 'A_FAVOR', 10),
      pos('b', 'A_FAVOR', 10),
      pos('c', 'A_FAVOR', 10),
      pos('d', 'EN_CONTRA', 30),
    ],
    'A_FAVOR',
  );
  cuadra(r);
});

prueba('montos primos no rompen el invariante', () => {
  const r = liquidar(
    [
      { usuarioId: 'a', lado: 'A_FAVOR', montoCentavos: 733, tasaComision: GRATIS },
      { usuarioId: 'b', lado: 'A_FAVOR', montoCentavos: 1279, tasaComision: PRO },
      { usuarioId: 'c', lado: 'EN_CONTRA', montoCentavos: 2012, tasaComision: GRATIS },
    ],
    'A_FAVOR',
  );
  cuadra(r);
});

prueba('barrido de 400 combinaciones aleatorias siempre cuadra', () => {
  let semilla = 12345;
  const rnd = (max: number) => {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
    return (semilla % max) + 1;
  };
  for (let i = 0; i < 400; i++) {
    const nA = rnd(5);
    const aportes: number[] = [];
    let total = 0;
    for (let j = 0; j < nA; j++) {
      const m = rnd(50000);
      aportes.push(m);
      total += m;
    }
    const posiciones: Posicion[] = aportes.map((m, j) => ({
      usuarioId: `a${j}`,
      lado: 'A_FAVOR' as const,
      montoCentavos: m,
      tasaComision: j % 2 === 0 ? GRATIS : PRO,
    }));
    // Lado contrario: mismo total, repartido entre 1 a 3 personas
    const nB = rnd(3);
    let restante = total;
    for (let j = 0; j < nB; j++) {
      const m = j === nB - 1 ? restante : Math.max(1, Math.floor(restante / (nB - j)));
      restante -= m;
      if (m > 0) {
        posiciones.push({
          usuarioId: `b${j}`,
          lado: 'EN_CONTRA',
          montoCentavos: m,
          tasaComision: GRATIS,
        });
      }
    }
    if (!estaBalanceado(posiciones)) continue;
    cuadra(liquidar(posiciones, 'A_FAVOR'));
    cuadra(liquidar(posiciones, 'EN_CONTRA'));
  }
});

// =====================================================================
grupo('Previsualización para la pantalla de apuesta');
// =====================================================================

prueba('desglose de S/20 en sala 2v2 muestra S/38.60', () => {
  // Ya hay S/20 en mi lado y S/40 en el otro; entro con S/20
  const p = previsualizar(2000, 2000, 4000, GRATIS);
  igual(p.siGano, 3860);
  igual(p.comision, 140);
  igual(p.siPierdo, -2000);
});

prueba('el suscriptor ve una comisión menor', () => {
  const gratis = previsualizar(2000, 2000, 4000, GRATIS);
  const pro = previsualizar(2000, 2000, 4000, PRO);
  igual(gratis.comision, 140);
  igual(pro.comision, 80);
  igual(pro.siGano - gratis.siGano, 60);
});

// =====================================================================
grupo('Formato');
// =====================================================================

prueba('centavos a soles', () => {
  igual(aSoles(3860), 'S/38.60');
  igual(aSoles(100), 'S/1.00');
  igual(aSoles(5), 'S/0.05');
  igual(aSoles(-2000), '-S/20.00');
});

// =====================================================================

console.log(`\n${'─'.repeat(56)}`);
console.log(`  ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) {
  console.log('\nFallos:');
  fallos.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
console.log('  Invariante verificado en toda liquidación ✓');
console.log(`${'─'.repeat(56)}\n`);
