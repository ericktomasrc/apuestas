/**
 * Servicio de PAÍSES y monedas.
 *
 * Especificación funcional v1.4, sección 12.
 *
 * ⚠️ Regla estructural: **una sala nunca mezcla monedas.**
 *
 * Si uno pone S/20 y otro $20, no hay forma limpia de decidir si el
 * mercado está balanceado sin fijar un tipo de cambio y un momento de
 * conversión. Se perdería la regla más simple del sistema: los dos
 * lados suman lo mismo.
 *
 * "Multi-moneda" aquí significa: cada país tiene la suya, y las salas
 * viven dentro de un país. Nunca conversión entre ellas.
 */

import { pool, type Cliente } from '../infraestructura/db.js';

export interface Pais {
  codigo: string;
  nombre: string;
  moneda: string;
  simbolo: string;
  /** No todas las monedas usan 2: el peso chileno usa 0, el dinar 3. */
  decimales: number;
  minimoApuesta: number;
  maximoApuesta: number;
  zonaHoraria: string;
  /** Convención del país: Perú usa coma para miles, Chile punto. */
  separadorMiles: string;
  separadorDecimal: string;
}

export class ErrorPais extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPais';
  }
}

let cache: { valor: Map<string, Pais>; expira: number } | null = null;

export async function paises(cliente?: Cliente): Promise<Map<string, Pais>> {
  if (cache && Date.now() < cache.expira) return cache.valor;

  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT codigo, nombre, moneda, simbolo, decimales,
            minimo_apuesta, maximo_apuesta, zona_horaria,
            separador_miles, separador_decimal
       FROM paises_habilitados
      WHERE eliminado_en IS NULL`,
  );

  const mapa = new Map<string, Pais>(
    rows.map((r) => [
      r.codigo,
      {
        codigo: r.codigo,
        nombre: r.nombre,
        moneda: r.moneda,
        simbolo: r.simbolo,
        decimales: Number(r.decimales),
        minimoApuesta: Number(r.minimo_apuesta),
        maximoApuesta: Number(r.maximo_apuesta),
        zonaHoraria: r.zona_horaria,
        separadorMiles: r.separador_miles ?? ',',
        separadorDecimal: r.separador_decimal ?? '.',
      },
    ]),
  );
  cache = { valor: mapa, expira: Date.now() + 60_000 };
  return mapa;
}

export function invalidarPaises(): void {
  cache = null;
}

export async function paisDe(codigo: string, cliente?: Cliente): Promise<Pais> {
  const p = (await paises(cliente)).get(codigo);
  if (!p) {
    throw new ErrorPais(
      'PAIS_NO_HABILITADO',
      `Por ahora no operamos en ${codigo}`,
    );
  }
  return p;
}

export async function paisDeUsuario(
  usuarioId: string,
  cliente?: Cliente,
): Promise<Pais> {
  const q = cliente ?? pool;
  const { rows } = await q.query(`SELECT pais FROM v_usuarios WHERE id = $1`, [
    usuarioId,
  ]);
  if (rows.length === 0) {
    throw new ErrorPais('USUARIO_NO_EXISTE', 'El usuario no existe');
  }
  return paisDe(rows[0].pais, cliente);
}

// =====================================================================
//  Formato
// =====================================================================

/**
 * Convierte la unidad mínima entera al texto que ve el usuario.
 *
 * El monto SIEMPRE viaja como entero. El formato es cosa de la
 * presentación, nunca del cálculo — en cuanto un importe se convierte a
 * decimal para operar, aparecen los descuadres.
 */
/**
 * Agrupa los miles a mano, sin `toLocaleString`.
 *
 * `toLocaleString` depende de los datos de idioma (ICU) que traiga la
 * instalación de Node: en una máquina devuelve "3.860" y en otra
 * "3860". El formato del dinero no puede depender del sistema operativo
 * donde corra el servidor.
 */
function agruparMiles(n: number, separador: string): string {
  const s = String(n);
  let salida = '';
  for (let i = 0; i < s.length; i++) {
    // Separador cada 3 dígitos contando desde la derecha
    if (i > 0 && (s.length - i) % 3 === 0) salida += separador;
    salida += s[i];
  }
  return salida;
}

export function formatear(unidades: number, pais: Pais): string {
  const signo = unidades < 0 ? '-' : '';
  const abs = Math.abs(unidades);

  if (pais.decimales === 0) {
    // CLP, JPY: no hay subdivisión, el entero YA es la moneda.
    // Dividir entre 100 aquí mostraría montos cien veces menores.
    return `${signo}${pais.simbolo}${agruparMiles(abs, pais.separadorMiles)}`;
  }

  const divisor = 10 ** pais.decimales;
  const entera = Math.floor(abs / divisor);
  const resto = String(abs % divisor).padStart(pais.decimales, '0');
  return (
    signo +
    pais.simbolo +
    agruparMiles(entera, pais.separadorMiles) +
    pais.separadorDecimal +
    resto
  );
}

/** Lo contrario: del texto que escribe el usuario al entero que guardamos. */
export function aUnidades(monto: number, pais: Pais): number {
  return Math.round(monto * 10 ** pais.decimales);
}

// =====================================================================
//  Validación
// =====================================================================

/** Los límites son POR PAÍS: un mínimo global no tiene sentido cuando
 *  las monedas son distintas. S/5 y $5 no son la misma cantidad. */
export async function validarMonto(
  usuarioId: string,
  unidades: number,
  cliente?: Cliente,
): Promise<Pais> {
  const pais = await paisDeUsuario(usuarioId, cliente);

  if (!Number.isInteger(unidades) || unidades <= 0) {
    throw new ErrorPais('MONTO_INVALIDO', 'El monto debe ser un entero positivo');
  }
  if (unidades < pais.minimoApuesta) {
    throw new ErrorPais(
      'MONTO_FUERA_DE_RANGO',
      `La apuesta más baja permitida es ${formatear(pais.minimoApuesta, pais)}`,
    );
  }
  if (unidades > pais.maximoApuesta) {
    throw new ErrorPais(
      'MONTO_FUERA_DE_RANGO',
      `El máximo es ${formatear(pais.maximoApuesta, pais)}`,
    );
  }
  return pais;
}

/**
 * El usuario y la sala deben ser del mismo país.
 *
 * La base también lo impide con un trigger: es la clase de regla que no
 * puede depender de que alguien se acuerde de comprobarla.
 */
export async function validarMismoPais(
  usuarioId: string,
  salaId: string,
  cliente?: Cliente,
): Promise<Pais> {
  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT u.pais AS pais_usuario, s.pais AS pais_sala
       FROM v_usuarios u, v_salas s
      WHERE u.id = $1 AND s.id = $2`,
    [usuarioId, salaId],
  );
  if (rows.length === 0) {
    throw new ErrorPais('SALA_NO_EXISTE', 'La sala no existe');
  }

  // El orden importa. Son dos situaciones distintas y merecen mensajes
  // distintos: "acá no operamos" no es lo mismo que "esta sala es de
  // otro país". Si se comparara primero, un usuario de un país sin
  // habilitar recibiría el mensaje equivocado.
  const catalogo = await paises(cliente);
  if (!catalogo.has(rows[0].pais_usuario)) {
    throw new ErrorPais(
      'PAIS_NO_HABILITADO',
      `Por ahora no operamos en ${rows[0].pais_usuario}`,
    );
  }
  if (rows[0].pais_usuario !== rows[0].pais_sala) {
    throw new ErrorPais(
      'PAIS_DISTINTO',
      'Esta sala es de otro país y usa otra moneda',
    );
  }
  return paisDe(rows[0].pais_usuario, cliente);
}
