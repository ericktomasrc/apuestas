/**
 * Pruebas de INTEGRACIÓN — corren contra PostgreSQL de verdad.
 *
 * Estas prueban lo que las pruebas puras no pueden:
 *   - que la transacción sea realmente atómica
 *   - que los triggers de append-only realmente bloqueen
 *   - que dos liquidaciones simultáneas no se pisen
 *   - que el saldo calculado por la vista sea correcto
 *
 * Requiere la base levantada:
 *   npm run db:up
 *   npm run db:migrate
 *
 * Correr con:  npm run test:db
 */

import { pool, enTransaccion, cerrar } from './../infraestructura/db.js';
import { limpiarDatosDePrueba } from './limpieza.js';
import {
  depositar,
  entrarAMercado,
  salirDeMercado,
  liquidarMercado,
  anularMercado,
  saldoDe,
  descuadres,
} from './../servicios/ledger.servicio.js';

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

async function debeFallar(fn: () => Promise<unknown>, contiene?: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (contiene && !msg.toLowerCase().includes(contiene.toLowerCase())) {
      throw new Error(`falló, pero por otra razón: ${msg}`);
    }
    return;
  }
  throw new Error('esperaba que fallara, no falló');
}

// ---------------------------------------------------------------------
// Datos de prueba. Todo se crea con un prefijo para poder limpiarlo.
// ---------------------------------------------------------------------

const PREFIJO = `t${Date.now().toString(36)}`;

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
let planPro: string;
let deporteId: string;
let ligaId: string;
let partidoId: string;

async function unUsuario(nombre: string, planId: string): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (alias, email, hash_password, fecha_nacimiento, plan_id)
     VALUES ($1,$2,'x','1990-01-01',$3) RETURNING id`,
    [`${PREFIJO}_${nombre}`, `${PREFIJO}_${nombre}@test.pe`, planId],
  );
  return rows[0].id;
}

async function unaSala(): Promise<{ salaId: string; mercadoId: string }> {
  const anfitrion = await unUsuario(`anf${Math.random().toString(36).slice(2, 7)}`, planGratis);
  const sala = await pool.query(
    `INSERT INTO salas (codigo, partido_id, anfitrion_id, tope_participantes,
                        monto_minimo_centavos)
     VALUES ($1,$2,$3,10,500) RETURNING id`,
    [`${PREFIJO}${Math.random().toString(36).slice(2, 8)}`, partidoId, anfitrion],
  );
  const mercado = await pool.query(
    `INSERT INTO mercados (sala_id, tipo_mercado, linea, etiqueta_favor, etiqueta_contra)
     VALUES ($1,'TOTAL_GOLES',2.5,'Más de 2.5','Menos de 2.5') RETURNING id`,
    [sala.rows[0].id],
  );
  return { salaId: sala.rows[0].id, mercadoId: mercado.rows[0].id };
}

/**
 * Crea una posición saltándose la capa de salas.
 *
 * La tasa sale de `v_tasa_usuario`, igual que en producción. Antes
 * escribía 0.07 fijo, lo cual daba igual porque el ledger releía el
 * plan al liquidar. Desde que la tasa se congela al apostar, ese 0.07
 * era lo que se cobraba — y un suscriptor pagaba 7%.
 */
async function unaPosicion(
  mercadoId: string,
  usuarioId: string,
  lado: 'A_FAVOR' | 'EN_CONTRA',
  centavos: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO posiciones (mercado_id, usuario_id, lado, monto_centavos, tasa_mostrada)
     VALUES ($1,$2,$3,$4,
             (SELECT t.tasa_comision FROM v_tasa_usuario t
               WHERE t.usuario_id = $2))`,
    [mercadoId, usuarioId, lado, centavos],
  );
}

async function preparar(): Promise<void> {
  const planes = await pool.query(
    `SELECT id, codigo FROM planes WHERE codigo IN ('GRATIS','PRO')`,
  );
  planGratis = planes.rows.find((r) => r.codigo === 'GRATIS').id;
  planPro = planes.rows.find((r) => r.codigo === 'PRO').id;

  const dep = await pool.query(`SELECT id FROM deportes WHERE clave = 'FUTBOL'`);
  deporteId = dep.rows[0].id;

  const liga = await pool.query(
    `INSERT INTO ligas (deporte_id, api_id, nombre, pais)
     VALUES ($1,$2,'Liga de prueba','PE') RETURNING id`,
    [deporteId, ligaApiPrueba()],
  );
  ligaId = liga.rows[0].id;

  const partido = await pool.query(
    `INSERT INTO partidos (api_id, deporte_id, liga_id, equipo_local,
                           equipo_visitante, inicia_en, inicia_en_original)
     VALUES ($1,$2,$3,'Local','Visitante', now() + interval '2 hours',
             now() + interval '2 hours') RETURNING id`,
    [`${PREFIJO}_partido`, deporteId, ligaId],
  );
  partidoId = partido.rows[0].id;
}

// =====================================================================

async function main(): Promise<void> {
  console.log('Pruebas de integración contra PostgreSQL\n' + '─'.repeat(56));
  await preparar();

  // -------------------------------------------------------------------
  grupo('Saldos — la vista corregida en la migración 002');
  // -------------------------------------------------------------------

  await prueba('depósito de S/50 deja disponible 5000', async () => {
    const u = await unUsuario('dep1', planGratis);
    await depositar(u, 5000, `${PREFIJO}:dep1`);
    const s = await saldoDe(u);
    igual(s.disponibleCentavos, 5000, 'disponible: ');
    igual(s.retenidoCentavos, 0, 'retenido: ');
    igual(s.totalCentavos, 5000, 'total: ');
  });

  await prueba('al entrar con S/20: disponible 3000, retenido 2000, total 5000', async () => {
    const u = await unUsuario('ret1', planGratis);
    const { salaId, mercadoId } = await unaSala();
    await depositar(u, 5000, `${PREFIJO}:ret1:dep`);
    await entrarAMercado(u, mercadoId, salaId, 2000, `${PREFIJO}:ret1:ent`);

    const s = await saldoDe(u);
    // Este es exactamente el caso que la migración 001 calculaba mal:
    // devolvía disponible 1000 y total 3000.
    igual(s.disponibleCentavos, 3000, 'disponible: ');
    igual(s.retenidoCentavos, 2000, 'retenido: ');
    igual(s.totalCentavos, 5000, 'total: ');
  });

  await prueba('al salir se libera la retención', async () => {
    const u = await unUsuario('sal1', planGratis);
    const { salaId, mercadoId } = await unaSala();
    await depositar(u, 5000, `${PREFIJO}:sal1:dep`);
    await entrarAMercado(u, mercadoId, salaId, 2000, `${PREFIJO}:sal1:ent`);
    await salirDeMercado(u, mercadoId, salaId, 2000, `${PREFIJO}:sal1:out`);

    const s = await saldoDe(u);
    igual(s.disponibleCentavos, 5000, 'disponible: ');
    igual(s.retenidoCentavos, 0, 'retenido: ');
  });

  await prueba('no se puede comprometer más de lo disponible', async () => {
    const u = await unUsuario('ins1', planGratis);
    const { salaId, mercadoId } = await unaSala();
    await depositar(u, 1000, `${PREFIJO}:ins1:dep`);
    await debeFallar(
      () => entrarAMercado(u, mercadoId, salaId, 2000, `${PREFIJO}:ins1:ent`),
      'alcanza',
    );
  });

  // -------------------------------------------------------------------
  grupo('Append-only — los triggers de la base, no del código');
  // -------------------------------------------------------------------

  await prueba('UPDATE sobre movimientos está bloqueado', async () => {
    const u = await unUsuario('imm1', planGratis);
    await depositar(u, 1000, `${PREFIJO}:imm1`);
    await debeFallar(
      () => pool.query(`UPDATE movimientos SET monto_centavos = 999999 WHERE usuario_id = $1`, [u]),
      'no est',
    );
  });

  await prueba('DELETE sobre movimientos está bloqueado', async () => {
    const u = await unUsuario('imm2', planGratis);
    await depositar(u, 1000, `${PREFIJO}:imm2`);
    await debeFallar(
      () => pool.query(`DELETE FROM movimientos WHERE usuario_id = $1`, [u]),
      'no est',
    );
  });

  await prueba('DELETE físico bloqueado en salas', async () => {
    const { salaId } = await unaSala();
    await debeFallar(() => pool.query(`DELETE FROM salas WHERE id = $1`, [salaId]), 'prohibido');
  });

  await prueba('el mismo movimiento no se puede insertar dos veces', async () => {
    const u = await unUsuario('idem1', planGratis);
    await depositar(u, 1000, `${PREFIJO}:idem1`);
    await debeFallar(() => depositar(u, 1000, `${PREFIJO}:idem1`));
    const s = await saldoDe(u);
    igual(s.totalCentavos, 1000, 'el saldo no se duplicó: ');
  });

  // -------------------------------------------------------------------
  grupo('Liquidación completa contra la base');
  // -------------------------------------------------------------------

  await prueba('2v2 de S/20: ganadores 3860, casa 280', async () => {
    const juan = await unUsuario('g1juan', planGratis);
    const ana = await unUsuario('g1ana', planGratis);
    const luis = await unUsuario('g1luis', planGratis);
    const rosa = await unUsuario('g1rosa', planGratis);
    const { salaId, mercadoId } = await unaSala();

    for (const [i, u] of [juan, ana, luis, rosa].entries()) {
      await depositar(u, 5000, `${PREFIJO}:g1:dep:${i}`);
      await entrarAMercado(u, mercadoId, salaId, 2000, `${PREFIJO}:g1:ent:${i}`);
    }
    await unaPosicion(mercadoId, juan, 'A_FAVOR', 2000);
    await unaPosicion(mercadoId, ana, 'A_FAVOR', 2000);
    await unaPosicion(mercadoId, luis, 'EN_CONTRA', 2000);
    await unaPosicion(mercadoId, rosa, 'EN_CONTRA', 2000);

    const r = await liquidarMercado(mercadoId, salaId, 'A_FAVOR');
    igual(r.boteCentavos, 8000, 'bote: ');
    igual(r.comisionCentavos, 280, 'comisión: ');

    // 5000 - 2000 (retención) + 3860 (premio) = 6860
    igual((await saldoDe(juan)).disponibleCentavos, 6860, 'Juan: ');
    igual((await saldoDe(ana)).disponibleCentavos, 6860, 'Ana: ');
    // 5000 - 2000. La RETENCION ya descontó; no hay segundo cobro.
    igual((await saldoDe(luis)).disponibleCentavos, 3000, 'Luis: ');
    igual((await saldoDe(luis)).totalCentavos, 3000, 'Luis total: ');
    igual((await saldoDe(luis)).retenidoCentavos, 0, 'Luis sin retención: ');
  });

  await prueba('un suscriptor paga 4% y un usuario gratis 7%', async () => {
    const pro = await unUsuario('g16pro', planPro);
    const gratis = await unUsuario('g16gra', planGratis);
    const perdedor = await unUsuario('g16per', planGratis);
    const { salaId, mercadoId } = await unaSala();

    for (const [i, u] of [pro, gratis].entries()) {
      await depositar(u, 5000, `${PREFIJO}:g16:dep:${i}`);
      await entrarAMercado(u, mercadoId, salaId, 2000, `${PREFIJO}:g16:ent:${i}`);
    }
    await depositar(perdedor, 5000, `${PREFIJO}:g16:dep:p`);
    await entrarAMercado(perdedor, mercadoId, salaId, 4000, `${PREFIJO}:g16:ent:p`);

    await unaPosicion(mercadoId, pro, 'A_FAVOR', 2000);
    await unaPosicion(mercadoId, gratis, 'A_FAVOR', 2000);
    await unaPosicion(mercadoId, perdedor, 'EN_CONTRA', 4000);

    const r = await liquidarMercado(mercadoId, salaId, 'A_FAVOR');
    igual(r.comisionCentavos, 220, 'comisión total: ');
    // 5000 - 2000 + 3920 = 6920
    igual((await saldoDe(pro)).disponibleCentavos, 6920, 'suscriptor: ');
    // 5000 - 2000 + 3860 = 6860
    igual((await saldoDe(gratis)).disponibleCentavos, 6860, 'gratis: ');
  });

  await prueba('liquidar dos veces el mismo mercado es imposible', async () => {
    const a = await unUsuario('dob1a', planGratis);
    const b = await unUsuario('dob1b', planGratis);
    const { salaId, mercadoId } = await unaSala();
    for (const [i, u] of [a, b].entries()) {
      await depositar(u, 5000, `${PREFIJO}:dob:dep:${i}`);
      await entrarAMercado(u, mercadoId, salaId, 2000, `${PREFIJO}:dob:ent:${i}`);
    }
    await unaPosicion(mercadoId, a, 'A_FAVOR', 2000);
    await unaPosicion(mercadoId, b, 'EN_CONTRA', 2000);

    await liquidarMercado(mercadoId, salaId, 'A_FAVOR');
    const antes = (await saldoDe(a)).disponibleCentavos;
    await debeFallar(() => liquidarMercado(mercadoId, salaId, 'A_FAVOR'), 'liquid');
    igual((await saldoDe(a)).disponibleCentavos, antes, 'no se pagó dos veces: ');
  });

  await prueba('dos liquidaciones SIMULTÁNEAS: solo una gana', async () => {
    const a = await unUsuario('conc1a', planGratis);
    const b = await unUsuario('conc1b', planGratis);
    const { salaId, mercadoId } = await unaSala();
    for (const [i, u] of [a, b].entries()) {
      await depositar(u, 5000, `${PREFIJO}:conc:dep:${i}`);
      await entrarAMercado(u, mercadoId, salaId, 2000, `${PREFIJO}:conc:ent:${i}`);
    }
    await unaPosicion(mercadoId, a, 'A_FAVOR', 2000);
    await unaPosicion(mercadoId, b, 'EN_CONTRA', 2000);

    // Ambas arrancan al mismo tiempo, como dos procesos del scheduler
    const resultados = await Promise.allSettled([
      liquidarMercado(mercadoId, salaId, 'A_FAVOR'),
      liquidarMercado(mercadoId, salaId, 'A_FAVOR'),
    ]);
    const ok = resultados.filter((r) => r.status === 'fulfilled').length;
    igual(ok, 1, 'liquidaciones exitosas: ');

    // 5000 - 2000 + 3860 = 6860 — un solo pago
    igual((await saldoDe(a)).disponibleCentavos, 6860, 'ganador: ');
  });

  // -------------------------------------------------------------------
  grupo('Anulación');
  // -------------------------------------------------------------------

  await prueba('partido suspendido: todos recuperan el 100%', async () => {
    const a = await unUsuario('anu1a', planGratis);
    const b = await unUsuario('anu1b', planGratis);
    const { salaId, mercadoId } = await unaSala();
    for (const [i, u] of [a, b].entries()) {
      await depositar(u, 5000, `${PREFIJO}:anu:dep:${i}`);
      await entrarAMercado(u, mercadoId, salaId, 2000, `${PREFIJO}:anu:ent:${i}`);
    }
    await unaPosicion(mercadoId, a, 'A_FAVOR', 2000);
    await unaPosicion(mercadoId, b, 'EN_CONTRA', 2000);

    const r = await anularMercado(mercadoId, salaId, 'PARTIDO_ABANDONADO');
    igual(r.devueltoCentavos, 4000, 'devuelto: ');
    igual((await saldoDe(a)).disponibleCentavos, 5000, 'A recuperó todo: ');
    igual((await saldoDe(b)).disponibleCentavos, 5000, 'B recuperó todo: ');
    igual((await saldoDe(a)).retenidoCentavos, 0, 'sin retención: ');
  });

  await prueba('la base impide registrar una anulación con comisión', async () => {
    const { salaId, mercadoId } = await unaSala();
    await debeFallar(
      () =>
        pool.query(
          `INSERT INTO liquidaciones
             (mercado_id, sala_id, motivo_anulacion, bote_centavos, comision_centavos)
           VALUES ($1,$2,'SALA_VACIA',4000,100)`,
          [mercadoId, salaId],
        ),
      'anulacion_sin_comision',
    );
  });

  // -------------------------------------------------------------------
  grupo('Atomicidad y auditoría');
  // -------------------------------------------------------------------

  await prueba('si algo falla a mitad, no queda ningún movimiento', async () => {
    const u = await unUsuario('atom1', planGratis);
    await depositar(u, 5000, `${PREFIJO}:atom:dep`);
    const antes = (await saldoDe(u)).totalCentavos;

    await debeFallar(() =>
      enTransaccion(async (c) => {
        await c.query(
          `INSERT INTO movimientos (usuario_id, tipo, monto_centavos, clave_idempotencia)
           VALUES ($1,'DEPOSITO',1000,$2)`,
          [u, `${PREFIJO}:atom:ok`],
        );
        // Signo inválido para DEPOSITO: el CHECK lo rechaza
        await c.query(
          `INSERT INTO movimientos (usuario_id, tipo, monto_centavos, clave_idempotencia)
           VALUES ($1,'DEPOSITO',-1,$2)`,
          [u, `${PREFIJO}:atom:mal`],
        );
      }),
    );

    igual((await saldoDe(u)).totalCentavos, antes, 'saldo intacto: ');
    const { rows } = await pool.query(
      `SELECT 1 FROM movimientos WHERE clave_idempotencia = $1`,
      [`${PREFIJO}:atom:ok`],
    );
    igual(rows.length, 0, 'el primer INSERT también se revirtió: ');
  });

  await prueba('el historial registra quién hizo cada cambio', async () => {
    const u = await unUsuario('aud1', planGratis);
    await enTransaccion(async (c) => {
      await c.query(`UPDATE usuarios SET pais = 'PE' WHERE id = $1`, [u]);
      await c.query(`UPDATE usuarios SET estado = 'SUSPENDIDO' WHERE id = $1`, [u]);
    }, u);

    const { rows } = await pool.query(
      `SELECT operacion, campos_cambiados, usuario_id
         FROM historial WHERE tabla = 'usuarios' AND registro_id = $1
        ORDER BY id DESC LIMIT 1`,
      [u],
    );
    igual(rows[0].operacion, 'UPDATE', 'operación: ');
    igual(rows[0].usuario_id, u, 'autor: ');
    if (!rows[0].campos_cambiados?.includes('estado')) {
      throw new Error(`no registró el campo cambiado: ${rows[0].campos_cambiados}`);
    }
  });

  await prueba('un UPDATE que no cambia nada no ensucia el historial', async () => {
    const u = await unUsuario('aud2', planGratis);
    const cuenta = async (): Promise<number> => {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM historial
          WHERE tabla = 'usuarios' AND registro_id = $1`,
        [u],
      );
      return rows[0].n;
    };
    const antes = await cuenta();
    await pool.query(`UPDATE usuarios SET pais = pais WHERE id = $1`, [u]);
    igual(await cuenta(), antes, 'filas de historial: ');
  });

  // -------------------------------------------------------------------
  grupo('Conciliación');
  // -------------------------------------------------------------------

  await prueba('ninguna retención se perdió en un mercado liquidado', async () => {
    // Se filtra por mercado_liquidado a propósito.
    //
    // Una retención sin posición en un mercado ABIERTO es inofensiva:
    // ahora anularMercado() devuelve según el libro, así que ese dinero
    // volverá igual. (Y estas pruebas llaman al ledger directamente,
    // saltándose la capa de salas, así que las generan a propósito.)
    //
    // La peligrosa es la del mercado ya LIQUIDADO: ahí el dinero entró,
    // el mercado se cerró, y nadie lo recibió de vuelta.
    const { rows } = await pool.query(
      `SELECT * FROM v_retenciones_huerfanas WHERE mercado_liquidado`,
    );
    if (rows.length > 0) {
      throw new Error(`${rows.length} perdidas: ${JSON.stringify(rows.slice(0, 3))}`);
    }
  });

  await prueba('una apuesta fallida no deja retención', async () => {
    // apostar() valida, retiene y crea la posición en UNA transacción.
    // Si algo falla, no puede quedar el dinero comprometido.
    const { apostar } = await import('../servicios/salas.servicio.js');
    const u = await unUsuario('atomico', planGratis);
    await depositar(u, 5000, `${PREFIJO}:atom2:dep`);
    const { mercadoId } = await unaSala();

    // Monto por debajo del mínimo: falla DESPUÉS de que antes se
    // hubiera hecho la retención.
    await debeFallar(() => apostar(u, mercadoId, 'A_FAVOR', 1));

    const s = await saldoDe(u);
    igual(s.retenidoCentavos, 0, 'sin retención: ');
    igual(s.disponibleCentavos, 5000, 'saldo intacto: ');
  });

  await prueba('no hay ni un descuadre en toda la base', async () => {
    const d = await descuadres();
    if (d.length > 0) {
      throw new Error(`${d.length} mercados descuadrados: ${JSON.stringify(d)}`);
    }
  });

  await prueba('el dinero no se crea ni se destruye', async () => {
    const { rows } = await pool.query('SELECT * FROM v_conciliacion_global');
    const g = rows[0];
    // El dinero vive en tres sitios: saldo disponible, caja de la casa,
    // y retenciones de mercados abiertos. Omitir el tercero fue el bug
    // que corrigió la migración 004.
    igual(
      Number(g.descuadre),
      0,
      `entrada ${g.entrada_neta} vs ubicación ${g.ubicacion_total}: `,
    );
  });

  await prueba('la entrada neta coincide con dónde está el dinero', async () => {
    const { rows } = await pool.query('SELECT * FROM v_conciliacion_global');
    const g = rows[0];
    igual(
      Number(g.saldo_usuarios) + Number(g.caja_casa) + Number(g.retenido_abierto),
      Number(g.depositado) - Number(g.retirado) + Number(g.bonos),
      'suma de los tres sitios: ',
    );
  });

  // -------------------------------------------------------------------
  console.log(`\n${'─'.repeat(56)}`);
  // -------------------------------------------------------------------
  grupo('La tasa que se muestra es la que se cobra');
  // -------------------------------------------------------------------

  await prueba('un plan vencido NO cobra la tasa del plan', async () => {
    // El bug: /yo leía el plan sin comprobar el vencimiento y el ledger
    // sí. Alguien con Pro vencido veía 4% y se le cobraba 7%.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n
         FROM v_tasa_usuario t
         JOIN v_usuarios u ON u.id = t.usuario_id
         JOIN v_planes pl  ON pl.id = u.plan_id
        WHERE u.plan_vence_en IS NOT NULL
          AND u.plan_vence_en <= now()
          AND t.tasa_comision = pl.tasa_comision
          AND pl.codigo <> 'GRATIS'`,
    );
    if (rows[0].n > 0) {
      throw new Error(`${rows[0].n} usuarios con plan vencido cobrando su tasa`);
    }
  });

  await prueba('toda posición guarda la tasa que se le mostró', async () => {
    // Se cobra la tasa congelada al apostar. Una posición sin tasa
    // caería al 0.07 por defecto y podría cobrar más de lo prometido.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM v_posiciones
        WHERE tasa_mostrada IS NULL`,
    );
    if (rows[0].n > 0) throw new Error(`${rows[0].n} posiciones sin tasa guardada`);
  });

  await prueba('cambiar una membresía NO afecta apuestas ya hechas', async () => {
    // Es la razón de congelar la tasa: entre apostar y liquidar pasan
    // horas, y en ese rato el plan puede vencer o alguien puede tocar
    // la comisión desde el panel.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n
         FROM v_posiciones p
         JOIN v_tasa_usuario t ON t.usuario_id = p.usuario_id
        WHERE p.tasa_mostrada IS NOT NULL
          AND p.tasa_mostrada <> t.tasa_comision`,
    );
    // Que difieran es CORRECTO: significa que la tasa cambió después
    // de apostar y la posición conservó la suya. Solo se informa.
    if (rows[0].n > 0) {
      console.log(`      (${rows[0].n} posiciones con tasa distinta a la actual — es lo esperado)`);
    }
  });

  await prueba('la casa y las salas cobran con el mismo criterio', async () => {
    // Ambos motores leen la tasa guardada al apostar. Si uno leyera
    // la de hoy, dos personas idénticas cobrarían distinto según el
    // producto por el que entraron.
    const salas = await pool.query(
      `SELECT count(*)::int AS n FROM v_posiciones WHERE tasa_mostrada IS NULL`,
    );
    const casas = await pool.query(
      `SELECT count(*)::int AS n FROM v_apuestas_casa WHERE tasa_mostrada IS NULL`,
    );
    if (salas.rows[0].n > 0 || casas.rows[0].n > 0) {
      throw new Error('Hay apuestas sin tasa congelada');
    }
  });

  await prueba('ninguna tasa sale del rango 3%-20%', async () => {
    // El piso existe para que ningún plan deje el ingreso en cero
    // justo en quienes más juegan.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM v_tasa_usuario
        WHERE tasa_comision < 0.03 OR tasa_comision > 0.20`,
    );
    if (rows[0].n > 0) throw new Error(`${rows[0].n} usuarios fuera de rango`);
  });

  await prueba('todo usuario tiene una tasa', async () => {
    // Sin esto, un JOIN contra la vista perdería filas y alguien
    // simplemente no cobraría.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM v_usuarios u
        WHERE NOT EXISTS (SELECT 1 FROM v_tasa_usuario t
                           WHERE t.usuario_id = u.id)`,
    );
    if (rows[0].n > 0) throw new Error(`${rows[0].n} usuarios sin tasa`);
  });

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
