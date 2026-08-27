/**
 * Pruebas de PAÍSES y monedas.
 *
 * La regla que más importa aquí: **una sala nunca mezcla monedas.**
 *
 * Correr con:  npm run test:paises
 */

import { pool, cerrar } from '../infraestructura/db.js';
import { depositar, saldoDe } from '../servicios/ledger.servicio.js';
import { apostar, balanceDe } from '../servicios/salas.servicio.js';
import { limpiarDatosDePrueba } from './limpieza.js';
import {
  paises,
  paisDe,
  paisDeUsuario,
  formatear,
  aUnidades,
  invalidarPaises,
  ErrorPais,
  type Pais,
} from '../servicios/paises.servicio.js';

let pasadas = 0;
let fallidas = 0;

async function prueba(nombre: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
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

async function debeFallar(fn: () => Promise<unknown>, pista?: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (pista && !msg.toLowerCase().includes(pista.toLowerCase())) {
      throw new Error(`falló por otra razón: ${msg}`);
    }
    return;
  }
  throw new Error('esperaba que fallara, no falló');
}

// ---------------------------------------------------------------------

const P = `m${Date.now().toString(36)}`;

/**
 * Identificador de liga para las pruebas.
 *
 * Numérico y por encima de 900.000.000: el proveedor usa del 1 al
 * ~1300, así que nunca chocan. Y `ligas.api_id` tiene un CHECK que
 * solo admite dígitos —una liga con texto rompe la sincronización de
 * todas las demás—, así que un prefijo con letras ya no sirve.
 */
function ligaApiPrueba(): string {
  return String(900_000_000 + Math.floor(Math.random() * 99_000_000));
}
let planGratis: string;
let deporteId: string;
let ligaId: string;
let n = 0;

async function usuario(pais = 'PE', saldo = 50000): Promise<string> {
  const i = ++n;
  const { rows } = await pool.query(
    `INSERT INTO usuarios (alias, email, hash_password, fecha_nacimiento, plan_id, pais)
     VALUES ($1,$2,'x','1990-01-01',$3,$4) RETURNING id`,
    [`${P}_u${i}`, `${P}_u${i}@t.pe`, planGratis, pais],
  );
  if (saldo > 0) await depositar(rows[0].id, saldo, `${P}:dep:${i}`);
  return rows[0].id;
}

async function sala(
  anfitrion: string,
  pais = 'PE',
): Promise<{ salaId: string; mercadoId: string }> {
  const p = await pool.query(
    `INSERT INTO partidos (api_id, deporte_id, liga_id, equipo_local,
                           equipo_visitante, inicia_en, inicia_en_original)
     VALUES ($1,$2,$3,'A','B', now() + interval '3 hours',
             now() + interval '3 hours') RETURNING id`,
    [`${P}_p${++n}`, deporteId, ligaId],
  );
  const s = await pool.query(
    `INSERT INTO salas (codigo, partido_id, anfitrion_id, tope_participantes,
                        monto_minimo_centavos, pais)
     VALUES ($1,$2,$3,10,1000,$4) RETURNING id`,
    [`${P}${++n}`, p.rows[0].id, anfitrion, pais],
  );
  const m = await pool.query(
    `INSERT INTO mercados (sala_id, tipo_mercado, linea, etiqueta_favor, etiqueta_contra)
     VALUES ($1,'TOTAL_GOLES',2.5,'Más','Menos') RETURNING id`,
    [s.rows[0].id],
  );
  return { salaId: s.rows[0].id, mercadoId: m.rows[0].id };
}

const PEN: Pais = {
  codigo: 'PE', nombre: 'Perú', moneda: 'PEN', simbolo: 'S/',
  decimales: 2, minimoApuesta: 500, maximoApuesta: 100000,
  zonaHoraria: 'America/Lima',
  separadorMiles: ',', separadorDecimal: '.',
};
const CLP: Pais = {
  codigo: 'CL', nombre: 'Chile', moneda: 'CLP', simbolo: '$',
  decimales: 0, minimoApuesta: 1000, maximoApuesta: 500000,
  zonaHoraria: 'America/Santiago',
  separadorMiles: '.', separadorDecimal: ',',
};

// =====================================================================

async function main(): Promise<void> {
  console.log('Pruebas de PAÍSES y monedas\n' + '─'.repeat(56));

  planGratis = (await pool.query(`SELECT id FROM planes WHERE codigo='GRATIS'`)).rows[0].id;
  deporteId = (await pool.query(`SELECT id FROM deportes WHERE clave='FUTBOL'`)).rows[0].id;
  ligaId = (
    await pool.query(
      `INSERT INTO ligas (deporte_id, api_id, nombre, pais)
     VALUES ($1,$2,'Liga multimoneda','PE') RETURNING id`,
      [deporteId, ligaApiPrueba()],
    )
  ).rows[0].id;

  // -------------------------------------------------------------------
  grupo('Formato — el entero es el cálculo, el decimal es la pantalla');
  // -------------------------------------------------------------------

  await prueba('soles: 2 decimales, miles con coma', async () => {
    igual(formatear(3860, PEN), 'S/38.60');
    igual(formatear(100, PEN), 'S/1.00');
    igual(formatear(5, PEN), 'S/0.05');
    igual(formatear(-2000, PEN), '-S/20.00');
    igual(formatear(123456789, PEN), 'S/1,234,567.89');
  });

  await prueba('pesos chilenos: 0 decimales', async () => {
    // El peso chileno no tiene subdivisión: el entero YA es la moneda.
    // Dividir entre 100 aquí mostraría montos 100 veces menores.
    igual(formatear(3860, CLP), '$3.860');
    igual(formatear(1000, CLP), '$1.000');
    igual(formatear(50, CLP), '$50');
    igual(formatear(1234567, CLP), '$1.234.567');
  });

  await prueba('el formato no depende de la máquina', async () => {
    // `toLocaleString` usa los datos de idioma de la instalación de
    // Node: en una máquina devuelve "3.860" y en otra "3860". El
    // formato del dinero se calcula a mano justamente por eso.
    igual(formatear(1000000, PEN), 'S/10,000.00');
    igual(formatear(1000000, CLP), '$1.000.000');
  });

  await prueba('convertir de decimal a entero respeta la moneda', async () => {
    igual(aUnidades(38.6, PEN), 3860, 'PEN: ');
    igual(aUnidades(3860, CLP), 3860, 'CLP: ');
    // Sin el redondeo, 0.1 + 0.2 en punto flotante daría 30.000000000000004
    igual(aUnidades(0.3, PEN), 30, 'redondeo: ');
  });

  // -------------------------------------------------------------------
  grupo('Catálogo de países');
  // -------------------------------------------------------------------

  await prueba('Perú está habilitado con sus datos', async () => {
    invalidarPaises();
    const pe = await paisDe('PE');
    igual(pe.moneda, 'PEN', 'moneda: ');
    igual(pe.simbolo, 'S/', 'símbolo: ');
    igual(pe.decimales, 2, 'decimales: ');
    if (pe.minimoApuesta <= 0) throw new Error('mínimo inválido');
  });

  await prueba('un país no habilitado lanza error', async () => {
    await debeFallar(() => paisDe('XX'), 'no operamos');
  });

  await prueba('el país del usuario determina su moneda', async () => {
    const u = await usuario('PE');
    igual((await paisDeUsuario(u)).moneda, 'PEN');
  });

  await prueba('agregar un país es insertar una fila', async () => {
    await pool.query(
      `INSERT INTO paises_habilitados
         (codigo, nombre, moneda, simbolo, decimales,
          separador_miles, separador_decimal,
          minimo_apuesta, maximo_apuesta, zona_horaria)
       VALUES ('CL','Chile','CLP','$',0,'.',',',1000,500000,'America/Santiago')
       ON CONFLICT DO NOTHING`,
    );
    invalidarPaises();
    const cl = await paisDe('CL');
    igual(cl.decimales, 0, 'decimales: ');
    igual(cl.minimoApuesta, 1000, 'mínimo: ');
    // Los separadores son parte de los datos del país, no un detalle
    // opcional: sin ellos Chile hereda la convención peruana y muestra
    // $25,000 donde debería decir $25.000.
    igual(cl.separadorMiles, '.', 'separador de miles: ');
    igual(cl.separadorDecimal, ',', 'separador decimal: ');
    igual((await paises()).size >= 2, true, 'hay al menos 2 países: ');
  });

  // -------------------------------------------------------------------
  grupo('El saldo viene con su moneda');
  // -------------------------------------------------------------------

  await prueba('un usuario peruano ve soles', async () => {
    const u = await usuario('PE', 25000);
    const s = await saldoDe(u);
    igual(s.moneda, 'PEN', 'moneda: ');
    igual(s.simbolo, 'S/', 'símbolo: ');
    igual(s.decimales, 2, 'decimales: ');
    igual(s.disponibleCentavos, 25000, 'disponible: ');
  });

  await prueba('un usuario chileno ve pesos', async () => {
    const u = await usuario('CL', 25000);
    const s = await saldoDe(u);
    igual(s.moneda, 'CLP', 'moneda: ');
    igual(s.decimales, 0, 'decimales: ');
    // El mismo entero, distinta lectura: S/250.00 vs $25.000
    igual(formatear(s.disponibleCentavos, await paisDe('CL')), '$25.000');
  });

  await prueba('el movimiento guarda su moneda', async () => {
    const u = await usuario('CL', 10000);
    const { rows } = await pool.query(
      `SELECT moneda FROM movimientos WHERE usuario_id = $1 LIMIT 1`,
      [u],
    );
    igual(rows[0].moneda, 'CLP', 'moneda del depósito: ');
  });

  // -------------------------------------------------------------------
  grupo('Una sala NUNCA mezcla monedas');
  // -------------------------------------------------------------------

  await prueba('un peruano entra a una sala peruana', async () => {
    const a = await usuario('PE');
    const { mercadoId } = await sala(a, 'PE');
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    igual((await balanceDe(mercadoId)).totalFavor, 2000, 'entró: ');
  });

  await prueba('un chileno NO puede entrar a una sala peruana', async () => {
    const peruano = await usuario('PE');
    const chileno = await usuario('CL');
    const { mercadoId } = await sala(peruano, 'PE');

    // Si uno pone S/20 y otro $20, no hay forma de decidir si el
    // mercado está balanceado sin fijar un tipo de cambio.
    await debeFallar(() => apostar(chileno, mercadoId, 'EN_CONTRA', 2000), 'otro país');
  });

  await prueba('la base lo impide aunque el código se olvide', async () => {
    const peruano = await usuario('PE');
    const chileno = await usuario('CL');
    const { mercadoId } = await sala(peruano, 'PE');

    // Saltándose el servicio, insertando la posición directamente:
    // el trigger tiene que rechazarlo igual.
    await debeFallar(
      () =>
        pool.query(
          `INSERT INTO posiciones (mercado_id, usuario_id, lado, monto_centavos, tasa_mostrada)
           VALUES ($1,$2,'EN_CONTRA',2000,0.07)`,
          [mercadoId, chileno],
        ),
      'nunca mezcla monedas',
    );
  });

  await prueba('el balance de un mercado trae su moneda', async () => {
    const a = await usuario('PE');
    const { mercadoId } = await sala(a, 'PE');
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    const b = await balanceDe(mercadoId);
    igual(b.moneda, 'PEN', 'moneda: ');
    igual(b.simbolo, 'S/', 'símbolo: ');
  });

  // -------------------------------------------------------------------
  grupo('Límites por país');
  // -------------------------------------------------------------------

  await prueba('el mínimo peruano se aplica a peruanos', async () => {
    const a = await usuario('PE');
    const { mercadoId } = await sala(a, 'PE');
    // S/5 es el mínimo; S/3 debe rechazarse
    await debeFallar(() => apostar(a, mercadoId, 'A_FAVOR', 300), 'mínimo');
  });

  await prueba('el máximo se respeta', async () => {
    const a = await usuario('PE', 500000);
    const { mercadoId } = await sala(a, 'PE');
    await debeFallar(() => apostar(a, mercadoId, 'A_FAVOR', 200000), 'máximo');
  });

  await prueba('cada país tiene sus propios límites', async () => {
    const pe = await paisDe('PE');
    const cl = await paisDe('CL');
    // Un mínimo global no tendría sentido: S/5 y $5 no son lo mismo
    if (pe.minimoApuesta === cl.minimoApuesta && pe.moneda !== cl.moneda) {
      throw new Error('los mínimos deberían configurarse por separado');
    }
    igual(cl.minimoApuesta, 1000, 'mínimo chileno: ');
  });

  // -------------------------------------------------------------------
  grupo('Conciliación por moneda');
  // -------------------------------------------------------------------

  await prueba('los saldos NO se suman entre monedas', async () => {
    const { rows } = await pool.query(
      `SELECT moneda, descuadre FROM v_conciliacion_global ORDER BY moneda`,
    );
    // Sumar soles con pesos daría un número sin significado: el
    // invariante debe cumplirse DENTRO de cada moneda.
    if (rows.length < 2) throw new Error('esperaba al menos dos monedas');
    for (const r of rows) {
      igual(Number(r.descuadre), 0, `descuadre en ${r.moneda}: `);
    }
  });

  await prueba('ningún mercado quedó descuadrado', async () => {
    const { rows } = await pool.query(`SELECT * FROM v_descuadres`);
    igual(rows.length, 0, 'descuadrados: ');
  });

  // -------------------------------------------------------------------
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  ${pasadas} pasadas, ${fallidas} fallidas`);
  console.log(`${'─'.repeat(56)}\n`);

  await limpiarDatosDePrueba();
  await cerrar();
  if (fallidas > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error('\nError fatal:', e);
  await limpiarDatosDePrueba();
  await cerrar();
  process.exit(1);
});
