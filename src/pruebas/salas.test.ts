/**
 * Pruebas del módulo ROOMS contra PostgreSQL.
 *
 * Cubre las secciones 5, 6, 9 y 10 de la especificación:
 * máquina de estados, validaciones, balance y procesos automáticos.
 *
 * Correr con:  npm run test:salas
 */

import { pool, cerrar } from './../infraestructura/db.js';
import { depositar, saldoDe } from './../servicios/ledger.servicio.js';
import {
  apostar,
  retirarse,
  balanceDe,
  salaBalanceada,
  iniciarCuentaRegresiva,
  cerrarSala,
  expirarSala,
  procesarCierres,
  procesarLiquidaciones,
  resolverMercado,
  config,
  invalidarConfig,
} from './../servicios/salas.servicio.js';
import { invalidarPaises } from './../servicios/paises.servicio.js';
import { limpiarDatosDePrueba } from './limpieza.js';

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

async function lanza(codigo: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    // Se comprueba la propiedad `codigo`, no la clase del error.
    //
    // Las validaciones de sala lanzan ErrorSala y las de país lanzan
    // ErrorPais, pero ambas cargan el mismo `codigo` y la capa HTTP las
    // traduce igual. Atarse a la clase haría que agregar un módulo
    // nuevo rompiera pruebas que no tienen nada que ver con él.
    if (typeof e === 'object' && e !== null && 'codigo' in e) {
      igual(String((e as { codigo: unknown }).codigo), codigo, 'código: ');
      return;
    }
    throw e;
  }
  throw new Error(`esperaba ${codigo}, no lanzó nada`);
}

// ---------------------------------------------------------------------

const P = `s${Date.now().toString(36)}`;

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

async function usuario(saldo = 50000): Promise<string> {
  const i = ++n;
  const { rows } = await pool.query(
    `INSERT INTO usuarios (alias, email, hash_password, fecha_nacimiento, plan_id)
     VALUES ($1,$2,'x','1990-01-01',$3) RETURNING id`,
    [`${P}_u${i}`, `${P}_u${i}@t.pe`, planGratis],
  );
  const id = rows[0].id;
  if (saldo > 0) await depositar(id, saldo, `${P}:dep:${i}`);
  return id;
}

/** @param minutos cuánto falta para que empiece el partido */
async function partido(minutos = 180): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO partidos (api_id, deporte_id, liga_id, equipo_local,
                           equipo_visitante, inicia_en, inicia_en_original)
     VALUES ($1,$2,$3,'Local','Visita',
             now() + make_interval(mins => $4),
             now() + make_interval(mins => $4)) RETURNING id`,
    [`${P}_p${++n}`, deporteId, ligaId, minutos],
  );
  return rows[0].id;
}

async function sala(
  anfitrion: string,
  partidoId: string,
  opts: { minimo?: number; tope?: number } = {},
): Promise<{ salaId: string; mercadoId: string }> {
  const s = await pool.query(
    `INSERT INTO salas (codigo, partido_id, anfitrion_id, tope_participantes,
                        monto_minimo_centavos)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [`${P}${++n}`, partidoId, anfitrion, opts.tope ?? 10, opts.minimo ?? 1000],
  );
  const m = await pool.query(
    `INSERT INTO mercados (sala_id, tipo_mercado, linea, etiqueta_favor, etiqueta_contra)
     VALUES ($1,'TOTAL_GOLES',2.5,'Más de 2.5','Menos de 2.5') RETURNING id`,
    [s.rows[0].id],
  );
  return { salaId: s.rows[0].id, mercadoId: m.rows[0].id };
}

async function estadoSala(salaId: string): Promise<string> {
  const { rows } = await pool.query(`SELECT estado FROM salas WHERE id = $1`, [salaId]);
  return rows[0].estado;
}

async function estadoMercado(mercadoId: string): Promise<string> {
  const { rows } = await pool.query(`SELECT estado FROM mercados WHERE id = $1`, [mercadoId]);
  return rows[0].estado;
}

// =====================================================================

async function main(): Promise<void> {
  console.log('Pruebas del módulo ROOMS\n' + '─'.repeat(56));

  planGratis = (await pool.query(`SELECT id FROM planes WHERE codigo='GRATIS'`)).rows[0].id;
  deporteId = (await pool.query(`SELECT id FROM deportes WHERE clave='FUTBOL'`)).rows[0].id;
  ligaId = (
    await pool.query(
      `INSERT INTO ligas (deporte_id, api_id, nombre, pais)
     VALUES ($1,$2,'Liga test','PE') RETURNING id`,
      [deporteId, ligaApiPrueba()],
    )
  ).rows[0].id;

  // -------------------------------------------------------------------
  grupo('Configuración leída de la base, no escrita en el código');
  // -------------------------------------------------------------------

  await prueba('los valores por defecto están cargados', async () => {
    invalidarConfig();
    const c = await config();
    igual(c.minutosCierreAntes, 15, 'cierre: ');
    igual(c.minutosRegresiva, 5, 'regresiva: ');
    igual(c.maxMercadosPorSala, 3, 'mercados: ');
    igual(c.minimoPlataformaCentavos, 500, 'mínimo: ');
  });

  await prueba('cambiar la configuración cambia el comportamiento', async () => {
    await pool.query(
      `UPDATE configuracion SET valor='20' WHERE clave='minutos_cierre_antes'`,
    );
    invalidarConfig();
    igual((await config()).minutosCierreAntes, 20, 'nuevo valor: ');
    await pool.query(
      `UPDATE configuracion SET valor='15' WHERE clave='minutos_cierre_antes'`,
    );
    invalidarConfig();
  });

  // -------------------------------------------------------------------
  grupo('Balance — el sistema iguala dinero, no personas');
  // -------------------------------------------------------------------

  await prueba('mercado vacío no está balanceado', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    const b = await balanceDe(mercadoId);
    igual(b.balanceado, false, 'balanceado: ');
    igual(b.participantes, 0, 'participantes: ');
  });

  await prueba('con un solo lado indica cuánto falta y de qué lado', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 3000);
    const b = await balanceDe(mercadoId);
    igual(b.balanceado, false, 'balanceado: ');
    igual(b.falta?.lado, 'EN_CONTRA', 'lado faltante: ');
    igual(b.falta?.centavos, 3000, 'centavos faltantes: ');
  });

  await prueba('2 contra 1 con montos igualados SÍ balancea', async () => {
    const a = await usuario();
    const b = await usuario();
    const c = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await apostar(b, mercadoId, 'A_FAVOR', 2000);
    await apostar(c, mercadoId, 'EN_CONTRA', 3000);

    const bal = await balanceDe(mercadoId);
    igual(bal.balanceado, true, 'balanceado: ');
    igual(bal.participantes, 3, 'participantes: ');
    igual(bal.falta, null, 'falta: ');
    igual(await estadoMercado(mercadoId), 'BALANCEADO', 'estado: ');
  });

  await prueba('el faltante es exactamente lo que hay que poner', async () => {
    const a = await usuario();
    const b = await usuario();
    const c = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 2500);
    await apostar(b, mercadoId, 'EN_CONTRA', 1000);

    const falta = (await balanceDe(mercadoId)).falta!;
    igual(falta.centavos, 1500, 'faltan: ');
    // Esto es exactamente lo que hace el botón "Completar": el monto
    // exacto, del lado correcto, sin que el usuario calcule nada.
    await apostar(c, mercadoId, falta.lado, falta.centavos);
    igual((await balanceDe(mercadoId)).balanceado, true, 'quedó balanceado: ');
  });

  // -------------------------------------------------------------------
  grupo('Validaciones al apostar (sec. 9.2)');
  // -------------------------------------------------------------------

  await prueba('no se puede estar en ambos lados del mismo mercado', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await lanza('POSICION_CONTRADICTORIA', () =>
      apostar(a, mercadoId, 'EN_CONTRA', 1000),
    );
  });

  await prueba('no se puede apostar dos veces en el mismo lado', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await lanza('POSICION_DUPLICADA', () => apostar(a, mercadoId, 'A_FAVOR', 1000));
  });

  await prueba('se respeta el mínimo de la sala', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido(), { minimo: 2000 });
    await lanza('MONTO_FUERA_DE_RANGO', () => apostar(a, mercadoId, 'A_FAVOR', 1000));
  });

  await prueba('se respeta el mínimo de plataforma', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido(), { minimo: 100 });
    await lanza('MONTO_FUERA_DE_RANGO', () => apostar(a, mercadoId, 'A_FAVOR', 300));
  });

  await prueba('el tope de participantes se respeta', async () => {
    const a = await usuario();
    const b = await usuario();
    const c = await usuario();
    const { mercadoId } = await sala(a, await partido(), { tope: 2 });
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await apostar(b, mercadoId, 'EN_CONTRA', 1000);
    await lanza('SALA_LLENA', () => apostar(c, mercadoId, 'A_FAVOR', 1000));
  });

  await prueba('no se puede entrar a menos de 15 min del partido', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido(10));
    await lanza('CIERRE_INMINENTE', () => apostar(a, mercadoId, 'A_FAVOR', 1000));
  });

  await prueba('un usuario autoexcluido no puede apostar', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await pool.query(`UPDATE usuarios SET estado='AUTOEXCLUIDO' WHERE id=$1`, [a]);
    await lanza('USUARIO_AUTOEXCLUIDO', () => apostar(a, mercadoId, 'A_FAVOR', 1000));
    await pool.query(`UPDATE usuarios SET estado='ACTIVO' WHERE id=$1`, [a]);
  });

  await prueba('un usuario de país no habilitado no puede apostar', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    // 'XX' no existe en el catálogo: ahí no operamos en absoluto.
    await pool.query(`UPDATE usuarios SET pais='XX' WHERE id=$1`, [a]);
    await lanza('PAIS_NO_HABILITADO', () => apostar(a, mercadoId, 'A_FAVOR', 1000));
    await pool.query(`UPDATE usuarios SET pais='PE' WHERE id=$1`, [a]);
  });

  await prueba('un usuario de OTRO país habilitado tampoco puede', async () => {
    await pool.query(
      `INSERT INTO paises_habilitados
         (codigo, nombre, moneda, simbolo, decimales,
          separador_miles, separador_decimal,
          minimo_apuesta, maximo_apuesta, zona_horaria)
       VALUES ('CL','Chile','CLP','$',0,'.',',',1000,500000,'America/Santiago')
       ON CONFLICT DO NOTHING`,
    );
    invalidarPaises();

    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await pool.query(`UPDATE usuarios SET pais='CL' WHERE id=$1`, [a]);
    // Situación distinta a la anterior: Chile SÍ está habilitado, pero
    // una sala nunca mezcla monedas. Merece su propio mensaje.
    await lanza('PAIS_DISTINTO', () => apostar(a, mercadoId, 'A_FAVOR', 1000));
    await pool.query(`UPDATE usuarios SET pais='PE' WHERE id=$1`, [a]);
  });

  await prueba('apostar retiene el dinero en el ledger', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    const s = await saldoDe(a);
    igual(s.disponibleCentavos, 48000, 'disponible: ');
    igual(s.retenidoCentavos, 2000, 'retenido: ');
  });

  // -------------------------------------------------------------------
  grupo('Salir de un mercado (sec. 9.3)');
  // -------------------------------------------------------------------

  await prueba('salir libera el dinero sin cargo', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    await retirarse(a, mercadoId);
    const s = await saldoDe(a);
    igual(s.disponibleCentavos, 50000, 'recuperó todo: ');
    igual(s.retenidoCentavos, 0, 'sin retención: ');
  });

  await prueba('salir sin posición falla', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await lanza('SIN_POSICION', () => retirarse(a, mercadoId));
  });

  await prueba('no se puede salir a menos de 15 min del partido', async () => {
    const a = await usuario();
    const b = await usuario();
    const p = await partido(20);
    const { mercadoId } = await sala(a, p);
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await apostar(b, mercadoId, 'EN_CONTRA', 1000);

    // El partido se acerca: ahora faltan 10 minutos
    await pool.query(
      `UPDATE partidos SET inicia_en = now() + make_interval(mins => 10) WHERE id = $1`,
      [p],
    );
    await lanza('CIERRE_INMINENTE', () => retirarse(a, mercadoId));
  });

  await prueba('salir después de salir permite volver a entrar', async () => {
    const a = await usuario();
    const { mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await retirarse(a, mercadoId);
    // El índice único es PARCIAL: la posición borrada no bloquea.
    // Y la clave de idempotencia es nueva, porque entrar de nuevo es
    // una acción distinta, no el reintento de la anterior.
    await apostar(a, mercadoId, 'EN_CONTRA', 1000);
    igual((await balanceDe(mercadoId)).totalContra, 1000, 'nueva posición: ');
  });

  await prueba('reintentar la MISMA petición no cobra dos veces', async () => {
    const a = await usuario();
    const b = await usuario();
    const { mercadoId } = await sala(a, await partido());
    const clave = `prueba:reintento:${P}`;

    await apostar(a, mercadoId, 'A_FAVOR', 2000, clave);
    const tras1 = (await saldoDe(a)).retenidoCentavos;

    // El cliente no recibió la respuesta y reintenta con la misma clave
    let fallo = false;
    await apostar(a, mercadoId, 'A_FAVOR', 2000, clave).catch(() => {
      fallo = true;
    });

    igual(fallo, true, 'el reintento fue rechazado: ');
    igual((await saldoDe(a)).retenidoCentavos, tras1, 'no se retuvo de nuevo: ');
    igual((await balanceDe(mercadoId)).totalFavor, 2000, 'una sola posición: ');
    await retirarse(b, mercadoId).catch(() => {});
  });

  // -------------------------------------------------------------------
  grupo('Cierre de sala — el anfitrión no controla el gatillo (sec. 5.3)');
  // -------------------------------------------------------------------

  await prueba('cerrar arranca una regresiva, no cierra de golpe', async () => {
    const a = await usuario();
    const b = await usuario();
    const { salaId, mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await apostar(b, mercadoId, 'EN_CONTRA', 1000);

    await iniciarCuentaRegresiva(salaId, a);
    igual(await estadoSala(salaId), 'CUENTA_REGRESIVA', 'estado: ');
  });

  await prueba('solo el anfitrión puede iniciar la regresiva', async () => {
    const a = await usuario();
    const b = await usuario();
    const { salaId, mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await apostar(b, mercadoId, 'EN_CONTRA', 1000);
    await lanza('SIN_PERMISO', () => iniciarCuentaRegresiva(salaId, b));
  });

  await prueba('no se puede cerrar una sala sin balancear', async () => {
    const a = await usuario();
    const { salaId, mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await lanza('NADA_QUE_CERRAR', () => iniciarCuentaRegresiva(salaId, a));
  });

  await prueba('si alguien sale durante la regresiva, se cancela', async () => {
    const a = await usuario();
    const b = await usuario();
    const { salaId, mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await apostar(b, mercadoId, 'EN_CONTRA', 1000);
    await iniciarCuentaRegresiva(salaId, a);
    igual(await estadoSala(salaId), 'CUENTA_REGRESIVA', 'antes: ');

    await retirarse(b, mercadoId);
    // Nadie puede quedar encerrado en una sala que ya no va a correr
    igual(await estadoSala(salaId), 'ABIERTA', 'después: ');
  });

  await prueba('cerrar confirma los balanceados', async () => {
    const a = await usuario();
    const b = await usuario();
    const { salaId, mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await apostar(b, mercadoId, 'EN_CONTRA', 1000);

    const r = await cerrarSala(salaId);
    igual(r.confirmados, 1, 'confirmados: ');
    igual(r.anulados, 0, 'anulados: ');
    igual(await estadoSala(salaId), 'CERRADA', 'estado: ');
    igual(await estadoMercado(mercadoId), 'CONFIRMADO', 'mercado: ');
  });

  await prueba('un mercado sin contraparte se anula sin arrastrar a los demás', async () => {
    const a = await usuario();
    const b = await usuario();
    const c = await usuario();
    const p = await partido();
    const { salaId, mercadoId } = await sala(a, p);

    // Segundo mercado en la misma sala, que quedará sin contraparte
    const m2 = (
      await pool.query(
        `INSERT INTO mercados (sala_id, tipo_mercado, linea, etiqueta_favor, etiqueta_contra)
         VALUES ($1,'TOTAL_CORNERS',8.5,'Más de 8.5','Menos de 8.5') RETURNING id`,
        [salaId],
      )
    ).rows[0].id;

    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await apostar(b, mercadoId, 'EN_CONTRA', 1000);
    await apostar(c, m2, 'A_FAVOR', 2000);      // nadie del otro lado

    const antes = (await saldoDe(c)).disponibleCentavos;
    const r = await cerrarSala(salaId);

    igual(r.confirmados, 1, 'confirmados: ');
    igual(r.anulados, 1, 'anulados: ');
    igual(await estadoMercado(mercadoId), 'CONFIRMADO', 'mercado 1: ');
    igual(await estadoMercado(m2), 'ANULADO', 'mercado 2: ');
    igual((await saldoDe(c)).disponibleCentavos, antes + 2000, 'C recuperó todo: ');
    // Y el mercado 1 no se vio afectado
    igual((await saldoDe(a)).retenidoCentavos, 1000, 'A sigue comprometido: ');
  });

  await prueba('si ningún mercado queda en pie, la sala se anula', async () => {
    const a = await usuario();
    const { salaId, mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    const r = await cerrarSala(salaId);
    igual(r.confirmados, 0, 'confirmados: ');
    igual(await estadoSala(salaId), 'ANULADA', 'estado: ');
    igual((await saldoDe(a)).disponibleCentavos, 50000, 'devolución total: ');
  });

  await prueba('una sala vacía expira, no se borra', async () => {
    const a = await usuario();
    const { salaId } = await sala(a, await partido());
    await expirarSala(salaId);
    igual(await estadoSala(salaId), 'EXPIRADA', 'estado: ');
    const { rows } = await pool.query(`SELECT 1 FROM salas WHERE id=$1`, [salaId]);
    igual(rows.length, 1, 'la fila sigue existiendo: ');
  });

  // -------------------------------------------------------------------
  grupo('Procesos automáticos');
  // -------------------------------------------------------------------

  await prueba('procesarCierres cierra las regresivas vencidas', async () => {
    const a = await usuario();
    const b = await usuario();
    const { salaId, mercadoId } = await sala(a, await partido());
    await apostar(a, mercadoId, 'A_FAVOR', 1000);
    await apostar(b, mercadoId, 'EN_CONTRA', 1000);
    await iniciarCuentaRegresiva(salaId, a);

    // La regresiva ya venció
    await pool.query(
      `UPDATE salas SET regresiva_termina_en = now() - interval '1 minute'
        WHERE id = $1`,
      [salaId],
    );
    await procesarCierres();
    igual(await estadoSala(salaId), 'CERRADA', 'estado: ');
  });

  await prueba('procesarCierres expira las salas con 1 participante', async () => {
    const a = await usuario();
    const p = await partido(60);
    const { salaId, mercadoId } = await sala(a, p);
    await apostar(a, mercadoId, 'A_FAVOR', 1000);

    // El partido entra en la ventana de cierre
    await pool.query(
      `UPDATE partidos SET inicia_en = now() + make_interval(mins => 5) WHERE id=$1`,
      [p],
    );
    await procesarCierres();
    igual(await estadoSala(salaId), 'EXPIRADA', 'estado: ');
    igual((await saldoDe(a)).disponibleCentavos, 50000, 'recuperó todo: ');
  });

  // -------------------------------------------------------------------
  grupo('Resolución de mercados (sec. 10)');
  // -------------------------------------------------------------------

  await prueba('TOTAL_GOLES 2.5 con 2-1 gana A FAVOR', async () => {
    igual(
      resolverMercado('TOTAL_GOLES', 2.5, { goles_local: 2, goles_visitante: 1 }),
      'A_FAVOR',
    );
  });

  await prueba('TOTAL_GOLES 2.5 con 1-1 gana EN CONTRA', async () => {
    igual(
      resolverMercado('TOTAL_GOLES', 2.5, { goles_local: 1, goles_visitante: 1 }),
      'EN_CONTRA',
    );
  });

  await prueba('la línea en .5 hace imposible el empate', async () => {
    // Ningún marcador puede dar 2.5 goles: siempre hay un lado ganador
    for (let l = 0; l <= 4; l++) {
      for (let v = 0; v <= 4; v++) {
        const r = resolverMercado('TOTAL_GOLES', 2.5, {
          goles_local: l,
          goles_visitante: v,
        });
        if (r === null) throw new Error(`${l}-${v} no se pudo resolver`);
      }
    }
  });

  await prueba('DOBLE_OPORTUNIDAD manda el empate a EN CONTRA', async () => {
    igual(
      resolverMercado('DOBLE_OPORTUNIDAD', null, { goles_local: 1, goles_visitante: 1 }),
      'EN_CONTRA',
      'empate: ',
    );
    igual(
      resolverMercado('DOBLE_OPORTUNIDAD', null, { goles_local: 2, goles_visitante: 1 }),
      'A_FAVOR',
      'gana local: ',
    );
    igual(
      resolverMercado('DOBLE_OPORTUNIDAD', null, { goles_local: 0, goles_visitante: 1 }),
      'EN_CONTRA',
      'gana visita: ',
    );
  });

  await prueba('AMBOS_ANOTAN con 0-0 gana EN CONTRA', async () => {
    igual(
      resolverMercado('AMBOS_ANOTAN', null, { goles_local: 0, goles_visitante: 0 }),
      'EN_CONTRA',
    );
  });

  await prueba('sin dato, el mercado no se resuelve', async () => {
    igual(
      resolverMercado('TOTAL_CORNERS', 8.5, {
        corners_local: null,
        corners_visitante: null,
      }),
      null,
    );
  });

  // -------------------------------------------------------------------
  grupo('Ciclo completo: crear, apostar, cerrar, liquidar');
  // -------------------------------------------------------------------

  await prueba('una sala 2v2 recorre todo el ciclo y paga bien', async () => {
    const juan = await usuario();
    const ana = await usuario();
    const luis = await usuario();
    const rosa = await usuario();
    const p = await partido();
    const { salaId, mercadoId } = await sala(juan, p);

    await apostar(juan, mercadoId, 'A_FAVOR', 2000);
    await apostar(ana, mercadoId, 'A_FAVOR', 2000);
    await apostar(luis, mercadoId, 'EN_CONTRA', 2000);
    await apostar(rosa, mercadoId, 'EN_CONTRA', 2000);

    igual(await salaBalanceada(salaId), true, 'balanceada: ');
    await cerrarSala(salaId);
    igual(await estadoMercado(mercadoId), 'CONFIRMADO', 'confirmado: ');

    // El partido termina 2-1: tres goles, gana "más de 2.5"
    await pool.query(
      `UPDATE partidos
          SET estado='FINALIZADO', goles_local=2, goles_visitante=1,
              payload_crudo='{"fuente":"prueba"}'::jsonb
        WHERE id=$1`,
      [p],
    );
    const r = await procesarLiquidaciones();
    if (r.liquidados < 1) throw new Error('no liquidó ningún mercado');

    igual(await estadoMercado(mercadoId), 'LIQUIDADO', 'mercado: ');
    igual(await estadoSala(salaId), 'LIQUIDADA', 'sala: ');

    // 50000 - 2000 + 3860 = 51860
    igual((await saldoDe(juan)).disponibleCentavos, 51860, 'Juan: ');
    igual((await saldoDe(ana)).disponibleCentavos, 51860, 'Ana: ');
    // 50000 - 2000, la retención ya descontó
    igual((await saldoDe(luis)).disponibleCentavos, 48000, 'Luis: ');
    igual((await saldoDe(luis)).retenidoCentavos, 0, 'Luis liberado: ');
  });

  await prueba('un partido suspendido devuelve el 100%', async () => {
    const a = await usuario();
    const b = await usuario();
    const p = await partido();
    const { salaId, mercadoId } = await sala(a, p);
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    await apostar(b, mercadoId, 'EN_CONTRA', 2000);
    await cerrarSala(salaId);

    await pool.query(`UPDATE partidos SET estado='SUSPENDIDO' WHERE id=$1`, [p]);
    const r = await procesarLiquidaciones();
    igual(r.anulados >= 1, true, 'anuló: ');
    igual((await saldoDe(a)).disponibleCentavos, 50000, 'A recuperó todo: ');
    igual((await saldoDe(b)).disponibleCentavos, 50000, 'B recuperó todo: ');
  });

  await prueba('reprogramación dentro de 48h NO anula', async () => {
    const a = await usuario();
    const b = await usuario();
    const p = await partido();
    const { salaId, mercadoId } = await sala(a, p);
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    await apostar(b, mercadoId, 'EN_CONTRA', 2000);
    await cerrarSala(salaId);

    await pool.query(
      `UPDATE partidos SET estado='POSTERGADO',
              inicia_en = inicia_en_original + interval '24 hours'
        WHERE id=$1`,
      [p],
    );
    await procesarLiquidaciones();
    igual(await estadoMercado(mercadoId), 'CONFIRMADO', 'sigue en pie: ');
  });

  await prueba('reprogramación más allá de 48h SÍ anula', async () => {
    const a = await usuario();
    const b = await usuario();
    const p = await partido();
    const { salaId, mercadoId } = await sala(a, p);
    await apostar(a, mercadoId, 'A_FAVOR', 2000);
    await apostar(b, mercadoId, 'EN_CONTRA', 2000);
    await cerrarSala(salaId);

    await pool.query(
      `UPDATE partidos SET estado='POSTERGADO',
              inicia_en = inicia_en_original + interval '72 hours'
        WHERE id=$1`,
      [p],
    );
    await procesarLiquidaciones();
    igual(await estadoMercado(mercadoId), 'ANULADO', 'anulado: ');
    igual((await saldoDe(a)).disponibleCentavos, 50000, 'devolución: ');
  });

  await prueba('sin el dato, el mercado queda esperando', async () => {
    const a = await usuario();
    const b = await usuario();
    const p = await partido();
    const s = await pool.query(
      `INSERT INTO salas (codigo, partido_id, anfitrion_id, tope_participantes,
                          monto_minimo_centavos)
       VALUES ($1,$2,$3,10,1000) RETURNING id`,
      [`${P}${++n}`, p, a],
    );
    const m = await pool.query(
      `INSERT INTO mercados (sala_id, tipo_mercado, linea, etiqueta_favor, etiqueta_contra)
       VALUES ($1,'TOTAL_CORNERS',8.5,'Más','Menos') RETURNING id`,
      [s.rows[0].id],
    );
    await apostar(a, m.rows[0].id, 'A_FAVOR', 2000);
    await apostar(b, m.rows[0].id, 'EN_CONTRA', 2000);
    await cerrarSala(s.rows[0].id);

    // Partido terminado pero la API nunca entregó los córners
    await pool.query(
      `UPDATE partidos SET estado='FINALIZADO', goles_local=1, goles_visitante=0
        WHERE id=$1`,
      [p],
    );
    await procesarLiquidaciones();
    igual(await estadoMercado(m.rows[0].id), 'ESPERANDO_DATO', 'estado: ');
  });

  // -------------------------------------------------------------------
  grupo('Integridad después de todo el trajín');
  // -------------------------------------------------------------------

  await prueba('ni un solo mercado descuadrado', async () => {
    const { rows } = await pool.query(`SELECT * FROM v_descuadres`);
    if (rows.length > 0) {
      throw new Error(`${rows.length} descuadrados: ${JSON.stringify(rows)}`);
    }
  });

  await prueba('el dinero global sigue cuadrando', async () => {
    const { rows } = await pool.query(`SELECT * FROM v_conciliacion_global`);
    igual(
      Number(rows[0].descuadre),
      0,
      `entrada ${rows[0].entrada_neta} vs ubicación ${rows[0].ubicacion_total}: `,
    );
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
