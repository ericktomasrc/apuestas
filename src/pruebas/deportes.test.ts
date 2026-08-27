/**
 * Pruebas de DEPORTES y PROCESOS contra PostgreSQL.
 *
 * Correr con:  npm run test:deportes
 */

import { pool, cerrar } from './../infraestructura/db.js';
import { depositar, saldoDe } from './../servicios/ledger.servicio.js';
import { apostar, cerrarSala, config } from './../servicios/salas.servicio.js';
import {sincronizarFixtures, actualizarEstados, anularSinDato, sugerirLinea, lineaEsRiesgosa, } from './../servicios/deportes.servicio.js';
import {ProveedorSimulado, FixtureExterno, ResultadoExterno} from './../infraestructura/proveedores/deportes.proveedor.js';
import { limpiarDatosDePrueba } from './limpieza.js';
import {
  cicloMinuto,
  cicloCincoMinutos,
  cicloDiario,
  conciliar,
  salud,
} from './../servicios/procesos.servicio.js';

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

// ---------------------------------------------------------------------

const P = `d${Date.now().toString(36)}`;

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
const prov = new ProveedorSimulado();
let planGratis: string;
let deporteId: string;
let ligaApiId: string;
let n = 0;

const enMinutos = (m: number): Date => new Date(Date.now() + m * 60_000);

async function usuario(saldo = 50000): Promise<string> {
  const i = ++n;
  const { rows } = await pool.query(
    `INSERT INTO usuarios (alias, email, hash_password, fecha_nacimiento, plan_id)
     VALUES ($1,$2,'x','1990-01-01',$3) RETURNING id`,
    [`${P}_u${i}`, `${P}_u${i}@t.pe`, planGratis],
  );
  if (saldo > 0) await depositar(rows[0].id, saldo, `${P}:dep:${i}`);
  return rows[0].id;
}

function fixture(apiId: string, minutos: number, estado: FixtureExterno['estado'] = 'PROGRAMADO'): FixtureExterno {
  return {
    apiId,
    ligaApiId,
    equipoLocal: 'Local',
    equipoVisitante: 'Visita',
    iniciaEn: enMinutos(minutos),
    estado,
  };
}

async function idDe(apiId: string): Promise<string> {
  const { rows } = await pool.query(`SELECT id FROM v_partidos WHERE api_id=$1`, [apiId]);
  if (rows.length === 0) throw new Error(`no se sincronizó ${apiId}`);
  return rows[0].id;
}

async function salaCon(
  anfitrion: string,
  partidoId: string,
): Promise<{ salaId: string; mercadoId: string }> {
  const s = await pool.query(
    `INSERT INTO salas (codigo, partido_id, anfitrion_id, tope_participantes,
                        monto_minimo_centavos)
     VALUES ($1,$2,$3,10,1000) RETURNING id`,
    [`${P}${++n}`, partidoId, anfitrion],
  );
  const m = await pool.query(
    `INSERT INTO mercados (sala_id, tipo_mercado, linea, etiqueta_favor, etiqueta_contra)
     VALUES ($1,'TOTAL_GOLES',2.5,'Más','Menos') RETURNING id`,
    [s.rows[0].id],
  );
  return { salaId: s.rows[0].id, mercadoId: m.rows[0].id };
}

async function estadoSala(id: string): Promise<string> {
  return (await pool.query(`SELECT estado FROM salas WHERE id=$1`, [id])).rows[0].estado;
}
async function estadoMercado(id: string): Promise<string> {
  return (await pool.query(`SELECT estado FROM mercados WHERE id=$1`, [id])).rows[0].estado;
}

// =====================================================================

async function main(): Promise<void> {
  console.log('Pruebas de DEPORTES y PROCESOS\n' + '─'.repeat(56));

  planGratis = (await pool.query(`SELECT id FROM planes WHERE codigo='GRATIS'`)).rows[0].id;
  deporteId = (await pool.query(`SELECT id FROM deportes WHERE clave='FUTBOL'`)).rows[0].id;
  ligaApiId = ligaApiPrueba();
  const liga = await pool.query(
    `INSERT INTO ligas (deporte_id, api_id, nombre, pais)
     VALUES ($1,$2,'Liga test','PE') RETURNING id`,
    [deporteId, ligaApiId],
  );

  // La liga necesita mercados habilitados para que se sincronice.
  //
  // Sin esto no llegan partidos: cada liga cuesta una petición diaria
  // al proveedor, así que solo se piden los de las ligas que alguien
  // puede usar de verdad. Una liga sin mercados no aparece en la app.
  for (const tipo of ['TOTAL_GOLES', 'AMBOS_ANOTAN', 'DOBLE_OPORTUNIDAD',
                      'TOTAL_CORNERS', 'TOTAL_TARJETAS']) {
    await pool.query(
      `INSERT INTO mercados_por_liga (liga_id, tipo_mercado, verificado_en)
       VALUES ($1,$2,now()) ON CONFLICT DO NOTHING`,
      [liga.rows[0].id, tipo],
    );
  }

  // -------------------------------------------------------------------
  grupo('Sincronización de fixtures');
  // -------------------------------------------------------------------

  await prueba('trae los partidos nuevos', async () => {
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_f1`, 180));
    prov.cargarFixture(fixture(`${P}_f2`, 300));

    const r = await sincronizarFixtures(prov);
    igual(r.nuevos, 2, 'nuevos: ');
    igual(r.ignorados, 0, 'ignorados: ');
  });

  await prueba('volver a sincronizar no duplica', async () => {
    const r = await sincronizarFixtures(prov);
    igual(r.nuevos, 0, 'nuevos: ');
    igual(r.actualizados, 2, 'actualizados: ');

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM v_partidos WHERE api_id = $1`,
      [`${P}_f1`],
    );
    igual(rows[0].n, 1, 'una sola fila: ');
  });

  await prueba('ignora ligas que no están en el catálogo', async () => {
    prov.limpiar();
    // Mezcla de una liga conocida y una que no: solo debe entrar la
    // conocida. Una liga solo se habilita tras comprobar que el
    // proveedor entrega los datos que sus mercados necesitan (sec. 10.9);
    // crear partidos a ciegas produce anulaciones por DATO_NO_DISPONIBLE.
    prov.cargarFixture(fixture(`${P}_conocida`, 200));
    prov.cargarFixture({ ...fixture(`${P}_ajeno`, 180), ligaApiId: 'liga_desconocida' });

    const r = await sincronizarFixtures(prov);
    igual(r.nuevos, 1, 'nuevos: ');
    igual(r.ignorados, 1, 'ignorados: ');

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM v_partidos WHERE api_id = $1`,
      [`${P}_ajeno`],
    );
    igual(rows[0].n, 0, 'el ajeno no se creó: ');
  });

  await prueba('inicia_en_original no cambia al reprogramar', async () => {
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_repro`, 180));
    await sincronizarFixtures(prov);

    const antes = await pool.query(
      `SELECT inicia_en, inicia_en_original FROM v_partidos WHERE api_id=$1`,
      [`${P}_repro`],
    );

    // El proveedor mueve el partido 3 horas
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_repro`, 360));
    const r = await sincronizarFixtures(prov);
    igual(r.reprogramados, 1, 'reprogramados: ');

    const despues = await pool.query(
      `SELECT inicia_en, inicia_en_original FROM v_partidos WHERE api_id=$1`,
      [`${P}_repro`],
    );

    // inicia_en_original es la referencia contra la que se mide la
    // ventana de 48h: si se moviera, un partido podría reprogramarse
    // indefinidamente sin llegar nunca a anularse.
    igual(
      new Date(despues.rows[0].inicia_en_original).getTime(),
      new Date(antes.rows[0].inicia_en_original).getTime(),
      'original intacto: ',
    );
    if (
      new Date(despues.rows[0].inicia_en).getTime() ===
      new Date(antes.rows[0].inicia_en).getTime()
    ) {
      throw new Error('inicia_en no se actualizó');
    }
  });

  await prueba('si el proveedor falla, no revienta el sistema', async () => {
    prov.limpiar();
    prov.fallar = true;
    let hubo = false;
    await sincronizarFixtures(prov).catch(() => {
      hubo = true;
    });
    igual(hubo, true, 'propagó el error: ');
    prov.fallar = false;
  });

  // -------------------------------------------------------------------
  grupo('Actualización de estados');
  // -------------------------------------------------------------------

  await prueba('trae el resultado y lo guarda con su payload', async () => {
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_res1`, 60));
    await sincronizarFixtures(prov);
    const pid = await idDe(`${P}_res1`);

    const a = await usuario();
    const b = await usuario();
    const { mercadoId } = await salaCon(a, pid);
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    await apostar(b, mercadoId, 'EN_CONTRA', 2000);

    const resultado: ResultadoExterno = {
      apiId: `${P}_res1`,
      estado: 'FINALIZADO',
      iniciaEn: enMinutos(60),
      golesLocal: 2,
      golesVisitante: 1,
      payload: { fuente: 'simulado', marcador: '2-1' },
    };
    prov.cargarResultado(resultado);

    const r = await actualizarEstados(prov);
    igual(r.finalizados, 1, 'finalizados: ');

    const { rows } = await pool.query(
      `SELECT goles_local, goles_visitante, payload_crudo, payload_recibido_en
         FROM v_partidos WHERE id=$1`,
      [pid],
    );
    igual(rows[0].goles_local, 2, 'goles local: ');
    // El payload crudo es la evidencia si alguien reclama la liquidación
    igual(rows[0].payload_crudo.marcador, '2-1', 'payload: ');
    if (!rows[0].payload_recibido_en) throw new Error('no guardó la hora de recepción');
  });

  await prueba('un partido cancelado anula sus salas de inmediato', async () => {
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_canc`, 120));
    await sincronizarFixtures(prov);
    const pid = await idDe(`${P}_canc`);

    const a = await usuario();
    const b = await usuario();
    const { salaId, mercadoId } = await salaCon(a, pid);
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    await apostar(b, mercadoId, 'EN_CONTRA', 2000);

    prov.cargarResultado({
      apiId: `${P}_canc`,
      estado: 'CANCELADO',
      iniciaEn: enMinutos(120),
      payload: { motivo: 'cancelado' },
    });
    const r = await actualizarEstados(prov);
    igual(r.anulados, 1, 'salas anuladas: ');
    igual(await estadoSala(salaId), 'ANULADA', 'estado: ');
    // No hay que esperar a la hora del partido para devolver el dinero
    igual((await saldoDe(a)).disponibleCentavos, 50000, 'A recuperó: ');
    igual((await saldoDe(b)).disponibleCentavos, 50000, 'B recuperó: ');
  });

  await prueba('postergado dentro de 48h NO anula', async () => {
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_post1`, 120));
    await sincronizarFixtures(prov);
    const pid = await idDe(`${P}_post1`);

    const a = await usuario();
    const b = await usuario();
    const { salaId, mercadoId } = await salaCon(a, pid);
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    await apostar(b, mercadoId, 'EN_CONTRA', 2000);

    prov.cargarResultado({
      apiId: `${P}_post1`,
      estado: 'POSTERGADO',
      iniciaEn: enMinutos(120 + 24 * 60),
      payload: {},
    });
    const r = await actualizarEstados(prov);
    igual(r.anulados, 0, 'anuladas: ');
    igual(await estadoSala(salaId), 'ABIERTA', 'sigue viva: ');
  });

  await prueba('postergado más de 48h SÍ anula', async () => {
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_post2`, 120));
    await sincronizarFixtures(prov);
    const pid = await idDe(`${P}_post2`);

    const a = await usuario();
    const b = await usuario();
    const { salaId, mercadoId } = await salaCon(a, pid);
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    await apostar(b, mercadoId, 'EN_CONTRA', 2000);

    prov.cargarResultado({
      apiId: `${P}_post2`,
      estado: 'POSTERGADO',
      iniciaEn: enMinutos(120 + 72 * 60),
      payload: {},
    });
    const r = await actualizarEstados(prov);
    igual(r.anulados, 1, 'anuladas: ');
    igual(await estadoSala(salaId), 'ANULADA', 'estado: ');
    igual((await saldoDe(a)).disponibleCentavos, 50000, 'devolución: ');
  });

  await prueba('proveedor caído registra incidente y no anula nada', async () => {
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_caido`, 60));
    await sincronizarFixtures(prov);
    const pid = await idDe(`${P}_caido`);

    const a = await usuario();
    const b = await usuario();
    const { salaId, mercadoId } = await salaCon(a, pid);
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    await apostar(b, mercadoId, 'EN_CONTRA', 2000);

    prov.fallar = true;
    const r = await actualizarEstados(prov);
    prov.fallar = false;

    igual(r.anulados, 0, 'no anuló nada: ');
    // Que el proveedor esté caído no es motivo para anular: se reintenta
    igual(await estadoSala(salaId), 'ABIERTA', 'sala intacta: ');

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM incidentes WHERE tipo='PROVEEDOR_CAIDO'`,
    );
    if (rows[0].n === 0) throw new Error('no registró el incidente');
  });

  // -------------------------------------------------------------------
  grupo('Mercados sin dato');
  // -------------------------------------------------------------------

  await prueba('a las 72h sin dato se anula y se devuelve todo', async () => {
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_sindato`, 60));
    await sincronizarFixtures(prov);
    const pid = await idDe(`${P}_sindato`);

    const a = await usuario();
    const b = await usuario();
    const s = await pool.query(
      `INSERT INTO salas (codigo, partido_id, anfitrion_id, tope_participantes,
                          monto_minimo_centavos)
       VALUES ($1,$2,$3,10,1000) RETURNING id`,
      [`${P}${++n}`, pid, a],
    );
    const m = await pool.query(
      `INSERT INTO mercados (sala_id, tipo_mercado, linea, etiqueta_favor, etiqueta_contra)
       VALUES ($1,'TOTAL_CORNERS',8.5,'Más','Menos') RETURNING id`,
      [s.rows[0].id],
    );
    await apostar(a, m.rows[0].id, 'A_FAVOR', 2000);
    await apostar(b, m.rows[0].id, 'EN_CONTRA', 2000);
    await cerrarSala(s.rows[0].id);
    await pool.query(`UPDATE mercados SET estado='ESPERANDO_DATO' WHERE id=$1`, [
      m.rows[0].id,
    ]);
    // El partido fue hace 4 días y el dato nunca llegó
    await pool.query(
      `UPDATE partidos SET inicia_en = now() - interval '96 hours' WHERE id=$1`,
      [pid],
    );

    const anulados = await anularSinDato(72);
    igual(anulados >= 1, true, 'anuló: ');
    igual(await estadoMercado(m.rows[0].id), 'ANULADO', 'estado: ');
    // Preferible devolver que dejar el dinero congelado para siempre
    igual((await saldoDe(a)).disponibleCentavos, 50000, 'A recuperó: ');
  });

  // -------------------------------------------------------------------
  grupo('Sugerencia de línea');
  // -------------------------------------------------------------------

  await prueba('elige la línea más cercana al 50/50', async () => {
    const r = sugerirLinea(
      [
        { apiId: 'x', tipoMercado: 'TOTAL_GOLES', linea: 1.5, probabilidadFavor: 0.78 },
        { apiId: 'x', tipoMercado: 'TOTAL_GOLES', linea: 2.5, probabilidadFavor: 0.52 },
        { apiId: 'x', tipoMercado: 'TOTAL_GOLES', linea: 3.5, probabilidadFavor: 0.28 },
      ],
      'TOTAL_GOLES',
    );
    igual(r?.linea, 2.5, 'línea sugerida: ');
  });

  await prueba('sin cuotas del tipo pedido devuelve null', async () => {
    igual(
      sugerirLinea(
        [{ apiId: 'x', tipoMercado: 'TOTAL_GOLES', linea: 2.5, probabilidadFavor: 0.5 }],
        'TOTAL_CORNERS',
      ),
      null,
    );
  });

  await prueba('una línea 70/30 se marca como riesgosa', async () => {
    igual(lineaEsRiesgosa(0.7), true, '70%: ');
    igual(lineaEsRiesgosa(0.52), false, '52%: ');
    igual(lineaEsRiesgosa(0.3), true, '30%: ');
  });

  // -------------------------------------------------------------------
  grupo('Procesos y salud del sistema');
  // -------------------------------------------------------------------

  await prueba('un proceso que falla no tumba a los demás', async () => {
    prov.fallar = true;
    const r = await cicloCincoMinutos(prov);
    prov.fallar = false;

    igual(r.length, 2, 'corrieron los dos: ');
    // actualizarEstados captura el fallo del proveedor internamente,
    // así que reporta ok; lo importante es que liquidaciones corrió.
    igual(r[1].nombre, 'liquidaciones', 'segundo proceso: ');
    igual(r[1].ok, true, 'liquidaciones corrió igual: ');
  });

  await prueba('cicloMinuto procesa los cierres', async () => {
    const r = await cicloMinuto();
    igual(r[0].nombre, 'cierres', 'nombre: ');
    igual(r[0].ok, true, 'ok: ');
  });

  await prueba('cicloDiario sincroniza y concilia', async () => {
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_diario`, 500));
    const r = await cicloDiario(prov);
    igual(r.length, 2, 'dos procesos: ');
    igual(r.every((p) => p.ok), true, 'todos ok: ');
  });

  await prueba('la conciliación revisa TODAS las monedas', async () => {
    const c = await conciliar();
    igual(c.descuadresMercado, 0, 'descuadres por mercado: ');

    const monedas = Object.keys(c.descuadrePorMoneda);
    if (monedas.length === 0) throw new Error('no revisó ninguna moneda');
    // Mirar solo la primera dejaría pasar en silencio un descuadre en
    // cualquier otra moneda.
    for (const m of monedas) {
      igual(c.descuadrePorMoneda[m], 0, `descuadre en ${m}: `);
    }
  });

  await prueba('salud devuelve el panorama completo', async () => {
    const s = await salud();
    igual(typeof s.salasAbiertas, 'number', 'salas abiertas: ');
    igual(typeof s.dineroRetenido, 'object', 'retenido por moneda: ');

    for (const [moneda, monto] of Object.entries(s.dineroRetenido)) {
      if (monto < 0) throw new Error(`retenido negativo en ${moneda}`);
    }
    for (const d of Object.values(s.conciliacion.descuadrePorMoneda)) {
      igual(d, 0, 'sin descuadre: ');
    }
  });

  // -------------------------------------------------------------------
  grupo('Ciclo completo con el proveedor');
  // -------------------------------------------------------------------

  await prueba('de fixture a pago, sin tocar nada a mano', async () => {
    prov.limpiar();
    prov.cargarFixture(fixture(`${P}_e2e`, 60));
    await sincronizarFixtures(prov);
    const pid = await idDe(`${P}_e2e`);

    const juan = await usuario();
    const luis = await usuario();
    const { salaId, mercadoId } = await salaCon(juan, pid);
    await apostar(juan, mercadoId, 'A_FAVOR', 2000);
    await apostar(luis, mercadoId, 'EN_CONTRA', 2000);
    await cerrarSala(salaId);

    prov.cargarResultado({
      apiId: `${P}_e2e`,
      estado: 'FINALIZADO',
      iniciaEn: enMinutos(60),
      golesLocal: 3,
      golesVisitante: 0,
      payload: { marcador: '3-0' },
    });

    // El scheduler hace el resto: trae el resultado y liquida
    const r = await cicloCincoMinutos(prov);
    igual(r.every((p) => p.ok), true, 'sin errores: ');

    igual(await estadoMercado(mercadoId), 'LIQUIDADO', 'mercado: ');
    igual(await estadoSala(salaId), 'LIQUIDADA', 'sala: ');
    // 50000 - 2000 + 3860 = 51860
    igual((await saldoDe(juan)).disponibleCentavos, 51860, 'Juan cobró: ');
    igual((await saldoDe(luis)).disponibleCentavos, 48000, 'Luis perdió: ');
  });

  await prueba('todo sigue cuadrando al final', async () => {
    const { rows } = await pool.query(`SELECT * FROM v_conciliacion_global`);
    igual(
      Number(rows[0].descuadre),
      0,
      `entrada ${rows[0].entrada_neta} vs ubicación ${rows[0].ubicacion_total}: `,
    );
    const d = await pool.query(`SELECT * FROM v_descuadres`);
    igual(d.rows.length, 0, 'mercados descuadrados: ');
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
