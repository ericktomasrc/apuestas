/**
 * Módulo ROOMS — salas, mercados y posiciones.
 *
 * Especificación funcional v1.4, secciones 5, 6, 9 y 10.
 *
 * Este módulo NO escribe en `movimientos`: para eso llama al repositorio
 * del ledger. La separación es deliberada — un solo módulo toca dinero.
 */

import { randomUUID } from 'node:crypto';
import { pool, enTransaccion, type Cliente } from './../infraestructura/db.js';
import { entrarAMercado, salirDeMercado, liquidarMercado, anularMercado } from './../servicios/ledger.servicio.js';
import type { Lado, MotivoAnulacion } from './../dominio/liquidacion.js';
import { validarMismoPais, formatear } from './paises.servicio.js';
import { exigirQueNoSeaPersonal } from './seguridad.servicio.js';

export type EstadoSala =
  | 'ABIERTA'
  | 'CUENTA_REGRESIVA'
  | 'CERRADA'
  | 'EN_JUEGO'
  | 'LIQUIDADA'
  | 'ANULADA'
  | 'EXPIRADA';

export type EstadoMercado =
  | 'PROPUESTO'
  | 'BALANCEADO'
  | 'CONFIRMADO'
  | 'ESPERANDO_DATO'
  | 'LIQUIDADO'
  | 'ANULADO';

export class ErrorSala extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorSala';
  }
}

// =====================================================================
//  Configuración — se lee de la base, nunca se escribe en el código
// =====================================================================

export interface Configuracion {
  minutosCierreAntes: number;
  minutosRegresiva: number;
  horasVentanaReprogramacion: number;
  maxSalasSimultaneas: number;
  maxMercadosPorSala: number;
  minimoPlataformaCentavos: number;
}

let cache: { valor: Configuracion; expira: number } | null = null;

/** Se cachea 60 s: la configuración cambia poco y se consulta en cada
 *  validación. Para forzar la relectura tras un cambio: invalidarConfig(). */
export async function config(cliente?: Cliente): Promise<Configuracion> {
  if (cache && Date.now() < cache.expira) return cache.valor;

  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT clave, valor FROM configuracion WHERE eliminado_en IS NULL`,
  );
  const m = new Map<string, string>(rows.map((r) => [r.clave, r.valor]));
  const num = (k: string, porDefecto: number): number => {
    const v = m.get(k);
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : porDefecto;
  };

  const valor: Configuracion = {
    minutosCierreAntes: num('minutos_cierre_antes', 15),
    minutosRegresiva: num('minutos_regresiva', 5),
    horasVentanaReprogramacion: num('horas_ventana_reprogramacion', 48),
    maxSalasSimultaneas: num('max_salas_simultaneas', 10),
    maxMercadosPorSala: num('max_mercados_por_sala', 3),
    minimoPlataformaCentavos: num('minimo_plataforma_centavos', 500),
  };
  cache = { valor, expira: Date.now() + 60_000 };
  return valor;
}

export function invalidarConfig(): void {
  cache = null;
}

// =====================================================================
//  Balance — la regla estructural
// =====================================================================

export interface BalanceMercado {
  mercadoId: string;
  totalFavor: number;
  totalContra: number;
  participantes: number;
  balanceado: boolean;
  /** Cuánto falta y de qué lado. null si ya está balanceado. */
  falta: { lado: Lado; centavos: number } | null;
  moneda: string;
  simbolo: string;
}

export async function balanceDe(
  mercadoId: string,
  cliente?: Cliente,
): Promise<BalanceMercado> {
  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT b.total_favor, b.total_contra, b.participantes, b.balanceado,
            COALESCE(pa.moneda, 'PEN') AS moneda,
            COALESCE(pa.simbolo, 'S/') AS simbolo
       FROM v_balance_mercados b
       JOIN v_salas s ON s.id = b.sala_id
  LEFT JOIN paises_habilitados pa ON pa.codigo = s.pais
      WHERE b.mercado_id = $1`,
    [mercadoId],
  );
  if (rows.length === 0) {
    throw new ErrorSala('MERCADO_NO_EXISTE', `No existe el mercado ${mercadoId}`);
  }
  const favor = Number(rows[0].total_favor);
  const contra = Number(rows[0].total_contra);

  // "Falta" es lo que hay que agregar para igualar los totales.
  // Es el dato que la interfaz muestra como "Faltan S/20 EN CONTRA" y
  // lo que alimenta el botón Completar: la gente piensa en personas,
  // pero el sistema balancea dinero.
  let falta: BalanceMercado['falta'] = null;
  if (favor !== contra) {
    falta =
      favor > contra
        ? { lado: 'EN_CONTRA', centavos: favor - contra }
        : { lado: 'A_FAVOR', centavos: contra - favor };
  } else if (favor === 0) {
    falta = { lado: 'A_FAVOR', centavos: 0 };
  }

  return {
    mercadoId,
    totalFavor: favor,
    totalContra: contra,
    participantes: Number(rows[0].participantes),
    balanceado: rows[0].balanceado === true,
    falta,
    moneda: rows[0].moneda,
    simbolo: rows[0].simbolo,
  };
}

/** Una sala solo puede cerrarse si TODOS sus mercados con dinero están
 *  balanceados. Un mercado vacío no bloquea: se anulará al cerrar. */
export async function salaBalanceada(
  salaId: string,
  cliente?: Cliente,
): Promise<boolean> {
  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT balanceado, total_favor, total_contra
       FROM v_balance_mercados
      WHERE sala_id = $1 AND estado IN ('PROPUESTO','BALANCEADO')`,
    [salaId],
  );
  const conDinero = rows.filter(
    (r) => Number(r.total_favor) > 0 || Number(r.total_contra) > 0,
  );
  return conDinero.length > 0 && conDinero.every((r) => r.balanceado === true);
}

// =====================================================================
//  Validaciones (sec. 9)
// =====================================================================

interface DatosSala {
  id: string;
  estado: EstadoSala;
  partidoId: string;
  iniciaEn: Date;
  topeParticipantes: number;
  montoMinimoCentavos: number;
  anfitrionId: string | null;
  pais: string;
}

async function leerSala(c: Cliente | typeof pool, salaId: string): Promise<DatosSala> {
  const { rows } = await c.query(
    `SELECT s.id, s.estado, s.partido_id, s.tope_participantes,
            s.monto_minimo_centavos, s.anfitrion_id, s.pais, p.inicia_en
       FROM v_salas s
       JOIN v_partidos p ON p.id = s.partido_id
      WHERE s.id = $1`,
    [salaId],
  );
  if (rows.length === 0) {
    throw new ErrorSala('SALA_NO_EXISTE', `No existe la sala ${salaId}`);
  }
  const r = rows[0];
  return {
    id: r.id,
    estado: r.estado,
    partidoId: r.partido_id,
    iniciaEn: r.inicia_en,
    topeParticipantes: Number(r.tope_participantes),
    montoMinimoCentavos: Number(r.monto_minimo_centavos),
    anfitrionId: r.anfitrion_id,
    pais: r.pais,
  };
}

function minutosHasta(fecha: Date): number {
  return (fecha.getTime() - Date.now()) / 60000;
}

/**
 * Validaciones comunes a entrar y salir.
 *
 * El corte de 15 minutos es lo que tapa la salida oportunista: las
 * alineaciones confirmadas salen entre 60 y 30 minutos antes, así que
 * sin este límite alguien podría leer la noticia y escaparse dejando a
 * los demás sin apuesta.
 */
async function verificarSalaOperable(
  c: Cliente,
  salaId: string,
): Promise<DatosSala> {
  const sala = await leerSala(c, salaId);
  const cfg = await config(c);

  if (sala.estado !== 'ABIERTA' && sala.estado !== 'CUENTA_REGRESIVA') {
    throw new ErrorSala('SALA_CERRADA', 'La sala ya no acepta cambios');
  }
  if (minutosHasta(sala.iniciaEn) < cfg.minutosCierreAntes) {
    throw new ErrorSala(
      'CIERRE_INMINENTE',
      `Ya no se puede: faltan menos de ${cfg.minutosCierreAntes} min para el partido`,
    );
  }
  return sala;
}

// =====================================================================
//  Entrar a un mercado (sec. 9.2)
// =====================================================================

/**
 * @param claveIdempotencia La genera quien ORIGINA la acción (la petición
 *   HTTP), no este módulo. Reintentar la misma petición debe reusar la
 *   misma clave para no cobrar dos veces; una acción nueva lleva clave
 *   nueva.
 *
 *   Derivarla de mercado+usuario era un error: impedía que alguien que
 *   salió de una sala pudiera volver a entrar, porque la clave chocaba
 *   con la de su entrada anterior.
 *
 *   Si se omite se genera una al vuelo. Eso hace la llamada segura de
 *   usar, pero NO protege contra reintentos: la capa de API debe pasar
 *   siempre el identificador de su petición.
 */
export async function apostar(
  usuarioId: string,
  mercadoId: string,
  lado: Lado,
  montoCentavos: number,
  claveIdempotencia: string = `apuesta:${randomUUID()}`,
): Promise<void> {
  const cfg = await config();

  // TODO en una sola transacción: validar, retener y crear la posición.
  //
  // Antes esto eran tres transacciones separadas, y si la creación de
  // la posición fallaba, la retención ya estaba hecha: quedaba dinero
  // comprometido sin nada que lo respaldara. Cualquier operación con
  // dinero entra completa o no entra.
  await enTransaccion(async (c) => {
    const { rows } = await c.query(
      `SELECT sala_id, estado FROM v_mercados WHERE id = $1`,
      [mercadoId],
    );
    if (rows.length === 0) {
      throw new ErrorSala('MERCADO_NO_EXISTE', `No existe el mercado ${mercadoId}`);
    }
    const sala = await verificarSalaOperable(c, rows[0].sala_id);

    // El usuario y la sala deben compartir país: una sala nunca mezcla
    // monedas, porque no habría forma de decidir si está balanceada.
    const pais = await validarMismoPais(usuarioId, sala.id, c);

    if (montoCentavos < sala.montoMinimoCentavos) {
      throw new ErrorSala(
        'MONTO_FUERA_DE_RANGO',
        `El mínimo de esta sala es ${formatear(sala.montoMinimoCentavos, pais)}`,
      );
    }
    // Los límites son POR PAÍS: un mínimo global no tiene sentido
    // cuando las monedas son distintas. S/5 y $5 no son lo mismo.
    if (montoCentavos < pais.minimoApuesta) {
      throw new ErrorSala(
        'MONTO_FUERA_DE_RANGO',
        `La apuesta más baja permitida es ${formatear(pais.minimoApuesta, pais)}`,
      );
    }
    if (montoCentavos > pais.maximoApuesta) {
      throw new ErrorSala(
        'MONTO_FUERA_DE_RANGO',
        `El máximo es ${formatear(pais.maximoApuesta, pais)}`,
      );
    }

    // Cupos: se cuentan participantes de la SALA, no del mercado.
    const cupos = await c.query(
      `SELECT count(DISTINCT p.usuario_id)::int AS n
         FROM v_posiciones p
         JOIN v_mercados m ON m.id = p.mercado_id
        WHERE m.sala_id = $1`,
      [sala.id],
    );
    const yaEsta = await c.query(
      `SELECT lado FROM v_posiciones WHERE mercado_id = $1 AND usuario_id = $2`,
      [mercadoId, usuarioId],
    );

    if (yaEsta.rows.length > 0) {
      // Estar en ambos lados es apostar contra uno mismo: pérdida
      // garantizada por comisión y ningún efecto útil.
      if (yaEsta.rows[0].lado !== lado) {
        throw new ErrorSala(
          'POSICION_CONTRADICTORIA',
          `Ya estás ${yaEsta.rows[0].lado === 'A_FAVOR' ? 'A FAVOR' : 'EN CONTRA'} en este mercado`,
        );
      }
      throw new ErrorSala(
        'POSICION_DUPLICADA',
        // No prometer lo que no existe: no hay forma de aumentar una
        // apuesta. Decir que la hay manda a la persona a buscar un
        // botón que no está.
        'Ya apostaste en este mercado. Para cambiar el monto, sal de la sala y vuelve a entrar.',
      );
    }

    if (cupos.rows[0].n >= sala.topeParticipantes) {
      throw new ErrorSala('SALA_LLENA', 'La sala se llenó mientras decidías');
    }

    const activas = await c.query(
      `SELECT count(DISTINCT m.sala_id)::int AS n
         FROM v_posiciones p
         JOIN v_mercados m ON m.id = p.mercado_id
         JOIN v_salas s    ON s.id = m.sala_id
        WHERE p.usuario_id = $1
          AND s.estado IN ('ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO')`,
      [usuarioId],
    );
    if (activas.rows[0].n >= cfg.maxSalasSimultaneas) {
      throw new ErrorSala(
        'LIMITE_SALAS',
        `Ya estás en ${cfg.maxSalasSimultaneas} salas. Espera a que alguna se resuelva.`,
      );
    }

    const usuario = await c.query(
      `SELECT estado FROM v_usuarios WHERE id = $1`,
      [usuarioId],
    );
    if (usuario.rows.length === 0) {
      throw new ErrorSala('USUARIO_NO_EXISTE', 'El usuario no existe');
    }
    if (usuario.rows[0].estado === 'AUTOEXCLUIDO') {
      throw new ErrorSala('USUARIO_AUTOEXCLUIDO', 'Cuenta autoexcluida');
    }
    if (usuario.rows[0].estado !== 'ACTIVO') {
      throw new ErrorSala('USUARIO_NO_HABILITADO', 'Cuenta no habilitada');
    }

    // Quien puede anular una sala no puede tener dinero en juego:
    // podría entrar, ver que va perdiendo, y anularla para recuperarlo.
    // No hace falta mala fe — basta la posibilidad para que el sistema
    // deje de ser creíble.
    await exigirQueNoSeaPersonal(usuarioId, c);

    // El ledger retiene el dinero dentro de ESTA misma transacción.
    await entrarAMercado(usuarioId, mercadoId, sala.id, montoCentavos,
                         claveIdempotencia, c);

    await c.query(
      // La tasa se CONGELA aquí, con el valor que la persona acaba de
      // ver en el desglose.
      //
      // Entre apostar y liquidar pasan horas o días, y en ese rato el
      // plan puede vencer o alguien puede cambiar la comisión desde
      // Membresías. Si se leyera al liquidar, alguien vería 4% al
      // confirmar y se le cobraría 7% al ganar — justo lo que el
      // desglose previo intenta evitar.
      //
      // Es lo mismo que ya hace el modo casa.
      `INSERT INTO posiciones
         (mercado_id, usuario_id, lado, monto_centavos, tasa_mostrada)
       VALUES ($1,$2,$3,$4,
               (SELECT t.tasa_comision FROM v_tasa_usuario t
                 WHERE t.usuario_id = $2))`,
      [mercadoId, usuarioId, lado, montoCentavos],
    );

    await refrescarEstadoMercado(c, mercadoId);
  }, usuarioId);
}

// =====================================================================
//  Salir de un mercado (sec. 9.3)
// =====================================================================

export async function retirarse(
  usuarioId: string,
  mercadoId: string,
  claveIdempotencia: string = `salida:${randomUUID()}`,
): Promise<void> {
  const datos = await enTransaccion(async (c) => {
    const { rows } = await c.query(
      `SELECT p.monto_centavos, m.sala_id
         FROM v_posiciones p
         JOIN v_mercados m ON m.id = p.mercado_id
        WHERE p.mercado_id = $1 AND p.usuario_id = $2`,
      [mercadoId, usuarioId],
    );
    if (rows.length === 0) {
      throw new ErrorSala('SIN_POSICION', 'No tienes posición en este mercado');
    }
    await verificarSalaOperable(c, rows[0].sala_id);
    return {
      salaId: rows[0].sala_id as string,
      monto: Number(rows[0].monto_centavos),
    };
  }, usuarioId);

  // Sin cargo por salir: sería un cobro sorpresa, y eso contradice el
  // principio de que solo se cobra cuando hay resultado.
  await salirDeMercado(usuarioId, mercadoId, datos.salaId, datos.monto, claveIdempotencia);

  await enTransaccion(async (c) => {
    await c.query(
      `UPDATE posiciones SET eliminado_en = now()
        WHERE mercado_id = $1 AND usuario_id = $2 AND eliminado_en IS NULL`,
      [mercadoId, usuarioId],
    );
    await refrescarEstadoMercado(c, mercadoId);

    // Si el balance se rompió, la cuenta regresiva se cancela: nadie
    // puede quedar encerrado en una sala que ya no va a correr.
    if (!(await salaBalanceada(datos.salaId, c))) {
      await c.query(
        `UPDATE salas SET estado = 'ABIERTA', regresiva_termina_en = NULL
          WHERE id = $1 AND estado = 'CUENTA_REGRESIVA'`,
        [datos.salaId],
      );
    }
  }, usuarioId);
}

// =====================================================================
//  Máquina de estados del mercado
// =====================================================================

async function refrescarEstadoMercado(c: Cliente, mercadoId: string): Promise<void> {
  const b = await balanceDe(mercadoId, c);
  await c.query(
    `UPDATE mercados
        SET total_favor_centavos = $2,
            total_contra_centavos = $3,
            estado = CASE
                       WHEN estado IN ('PROPUESTO','BALANCEADO')
                       THEN (CASE WHEN $4 THEN 'BALANCEADO' ELSE 'PROPUESTO' END)::estado_mercado
                       ELSE estado
                     END
      WHERE id = $1`,
    [mercadoId, b.totalFavor, b.totalContra, b.balanceado],
  );
}

// =====================================================================
//  Cierre de sala (sec. 5.3)
// =====================================================================

/**
 * Arranca la cuenta regresiva. NO cierra de inmediato.
 *
 * Si el anfitrión pudiera cerrar en el instante que quiera, tendría
 * ventaja estructural: al llegar una noticia que mejora su lado cierra
 * y encierra a todos; si la empeora, no cierra y se retira él mismo.
 * Elige el momento con información que todos tienen, pero solo él tiene
 * el botón. Por eso el cierre siempre pasa por la regresiva.
 */
export async function iniciarCuentaRegresiva(
  salaId: string,
  solicitanteId: string | null = null,
): Promise<Date> {
  return enTransaccion(async (c) => {
    const sala = await leerSala(c, salaId);
    const cfg = await config(c);

    if (sala.estado !== 'ABIERTA') {
      throw new ErrorSala('ESTADO_INVALIDO', `La sala está ${sala.estado}`);
    }
    if (solicitanteId && sala.anfitrionId !== solicitanteId) {
      throw new ErrorSala('SIN_PERMISO', 'Solo el anfitrión puede cerrar la sala');
    }
    if (!(await salaBalanceada(salaId, c))) {
      throw new ErrorSala('NADA_QUE_CERRAR', 'Ningún mercado está balanceado todavía');
    }

    const termina = new Date(Date.now() + cfg.minutosRegresiva * 60_000);
    await c.query(
      `UPDATE salas SET estado = 'CUENTA_REGRESIVA', regresiva_termina_en = $2
        WHERE id = $1`,
      [salaId, termina],
    );
    return termina;
  }, solicitanteId);
}

/**
 * Cierra la sala definitivamente.
 *
 * Los mercados balanceados quedan CONFIRMADOS; los que no alcanzaron
 * contraparte se anulan y devuelven el 100%. La anulación de un mercado
 * no arrastra a los demás.
 */
export async function cerrarSala(salaId: string): Promise<{
  confirmados: number;
  anulados: number;
}> {
  const mercados = await enTransaccion(async (c) => {
    const sala = await leerSala(c, salaId);
    if (sala.estado !== 'ABIERTA' && sala.estado !== 'CUENTA_REGRESIVA') {
      throw new ErrorSala('ESTADO_INVALIDO', `La sala está ${sala.estado}`);
    }
    const { rows } = await c.query(
      `SELECT b.mercado_id, b.balanceado, b.total_favor, b.total_contra
         FROM v_balance_mercados b
        WHERE b.sala_id = $1 AND b.estado IN ('PROPUESTO','BALANCEADO')`,
      [salaId],
    );
    return rows.map((r) => ({
      id: r.mercado_id as string,
      balanceado: r.balanceado === true,
      vacio: Number(r.total_favor) === 0 && Number(r.total_contra) === 0,
    }));
  });

  let confirmados = 0;
  const paraAnular: string[] = [];

  for (const m of mercados) {
    if (m.balanceado) {
      await enTransaccion(async (c) => {
        await c.query(`UPDATE mercados SET estado = 'CONFIRMADO' WHERE id = $1`, [m.id]);
      });
      confirmados++;
    } else {
      paraAnular.push(m.id);
    }
  }

  for (const id of paraAnular) {
    await anularMercado(id, salaId, 'SIN_CONTRAPARTE');
  }

  await enTransaccion(async (c) => {
    // Si ningún mercado quedó en pie, la sala entera se anula.
    await c.query(
      `UPDATE salas
          SET estado = $2::estado_sala,
              cerrada_en = now(),
              regresiva_termina_en = NULL,
              motivo_anulacion = CASE WHEN $2 = 'ANULADA'
                                 THEN 'SIN_CONTRAPARTE'::motivo_anulacion END
        WHERE id = $1`,
      [salaId, confirmados > 0 ? 'CERRADA' : 'ANULADA'],
    );
  });

  return { confirmados, anulados: paraAnular.length };
}

/** Sala con 0 o 1 participante al llegar la hora. Nunca se borra:
 *  el registro hace falta para el ledger, el fraude y las métricas. */
export async function expirarSala(salaId: string): Promise<void> {
  const mercados = await enTransaccion(async (c) => {
    const { rows } = await c.query(
      `SELECT mercado_id FROM v_balance_mercados
        WHERE sala_id = $1 AND estado IN ('PROPUESTO','BALANCEADO')`,
      [salaId],
    );
    return rows.map((r) => r.mercado_id as string);
  });

  for (const id of mercados) {
    await anularMercado(id, salaId, 'SALA_VACIA');
  }

  await enTransaccion(async (c) => {
    await c.query(
      `UPDATE salas SET estado = 'EXPIRADA', cerrada_en = now() WHERE id = $1`,
      [salaId],
    );
  });
}

// =====================================================================
//  Procesos automáticos
// =====================================================================

/**
 * Corre cada minuto. Es lo que hace que las salas se cierren solas.
 *
 * Tres cosas, en este orden:
 *   1. Regresivas vencidas -> cerrar
 *   2. Salas con 0 o 1 participante al llegar el corte -> expirar
 *   3. Salas abiertas que llegan al corte -> cerrar (o anular)
 */
export async function procesarCierres(): Promise<{
  cerradas: number;
  expiradas: number;
}> {
  const cfg = await config();
  let cerradas = 0;
  let expiradas = 0;

  const vencidas = await pool.query(
    `SELECT id FROM v_salas
      WHERE estado = 'CUENTA_REGRESIVA' AND regresiva_termina_en <= now()`,
  );
  for (const r of vencidas.rows) {
    await cerrarSala(r.id);
    cerradas++;
  }

  const enCorte = await pool.query(
    `SELECT s.id,
            (SELECT count(DISTINCT p.usuario_id)
               FROM v_posiciones p
               JOIN v_mercados m ON m.id = p.mercado_id
              WHERE m.sala_id = s.id)::int AS participantes
       FROM v_salas s
       JOIN v_partidos p ON p.id = s.partido_id
      WHERE s.estado IN ('ABIERTA','CUENTA_REGRESIVA')
        AND p.inicia_en - make_interval(mins => $1) <= now()`,
    [cfg.minutosCierreAntes],
  );

  for (const r of enCorte.rows) {
    if (Number(r.participantes) <= 1) {
      await expirarSala(r.id);
      expiradas++;
    } else {
      await cerrarSala(r.id);
      cerradas++;
    }
  }

  return { cerradas, expiradas };
}

/**
 * Corre cada 5 minutos. Liquida los mercados cuyo partido terminó.
 *
 * La regla de liquidación de cada tipo de mercado vive aquí, no en la
 * API: el proveedor entrega números (goles, córners), el mercado es la
 * comparación que hacemos con esos números.
 */
export function resolverMercado(
  tipo: string,
  linea: number | null,
  datos: Record<string, number | null>,
): Lado | null {
  const suma = (a: string, b: string): number | null => {
    const x = datos[a];
    const y = datos[b];
    return x === null || x === undefined || y === null || y === undefined
      ? null
      : x + y;
  };

  switch (tipo) {
    case 'TOTAL_GOLES': {
      const t = suma('goles_local', 'goles_visitante');
      return t === null || linea === null ? null : t > linea ? 'A_FAVOR' : 'EN_CONTRA';
    }
    case 'TOTAL_CORNERS': {
      const t = suma('corners_local', 'corners_visitante');
      return t === null || linea === null ? null : t > linea ? 'A_FAVOR' : 'EN_CONTRA';
    }
    case 'TOTAL_TARJETAS': {
      const t = suma('tarjetas_local', 'tarjetas_visitante');
      return t === null || linea === null ? null : t > linea ? 'A_FAVOR' : 'EN_CONTRA';
    }
    case 'TOTAL_PUNTOS': {
      const t = suma('puntos_local', 'puntos_visitante');
      return t === null || linea === null ? null : t > linea ? 'A_FAVOR' : 'EN_CONTRA';
    }
    case 'AMBOS_ANOTAN': {
      const l = datos.goles_local;
      const v = datos.goles_visitante;
      if (l === null || l === undefined || v === null || v === undefined) return null;
      return l > 0 && v > 0 ? 'A_FAVOR' : 'EN_CONTRA';
    }
    case 'DOBLE_OPORTUNIDAD': {
      // "Gana el local" vs "no gana el local" (empate incluido).
      // Dos lados que cubren los tres resultados: el empate deja de ser
      // un problema sin necesidad de un tercer lado que nadie tomaría.
      const l = datos.goles_local;
      const v = datos.goles_visitante;
      if (l === null || l === undefined || v === null || v === undefined) return null;
      return l > v ? 'A_FAVOR' : 'EN_CONTRA';
    }
    case 'GANADOR_DIRECTO': {
      const l = datos.puntos_local;
      const v = datos.puntos_visitante;
      if (l === null || l === undefined || v === null || v === undefined) return null;
      if (l === v) return null;   // no debería ocurrir en deportes sin empate
      return l > v ? 'A_FAVOR' : 'EN_CONTRA';
    }
    default:
      return null;
  }
}

export async function procesarLiquidaciones(): Promise<{
  liquidados: number;
  anulados: number;
}> {
  const cfg = await config();
  let liquidados = 0;
  let anulados = 0;

  const { rows } = await pool.query(
    `SELECT m.id AS mercado_id, m.sala_id, m.tipo_mercado, m.linea,
            p.estado AS estado_partido, p.inicia_en, p.inicia_en_original,
            p.goles_local, p.goles_visitante,
            p.corners_local, p.corners_visitante,
            p.tarjetas_local, p.tarjetas_visitante,
            p.puntos_local, p.puntos_visitante,
            p.payload_crudo
       FROM v_mercados m
       JOIN v_salas s    ON s.id = m.sala_id
       JOIN v_partidos p ON p.id = s.partido_id
      WHERE m.estado IN ('CONFIRMADO','ESPERANDO_DATO')`,
  );

  for (const r of rows) {
    if (r.estado_partido === 'CANCELADO') {
      await anularMercado(r.mercado_id, r.sala_id, 'PARTIDO_CANCELADO');
      anulados++;
      continue;
    }

    if (r.estado_partido === 'POSTERGADO') {
      const horas =
        (new Date(r.inicia_en).getTime() - new Date(r.inicia_en_original).getTime()) /
        3_600_000;
      if (horas > cfg.horasVentanaReprogramacion) {
        await anularMercado(r.mercado_id, r.sala_id, 'PARTIDO_POSTERGADO');
        anulados++;
      }
      continue;   // dentro de la ventana: se espera al nuevo horario
    }

    if (r.estado_partido === 'SUSPENDIDO') {
      await anularMercado(r.mercado_id, r.sala_id, 'PARTIDO_ABANDONADO');
      anulados++;
      continue;
    }

    if (r.estado_partido !== 'FINALIZADO') continue;

    const ganador = resolverMercado(r.tipo_mercado, r.linea === null ? null : Number(r.linea), {
      goles_local: r.goles_local,
      goles_visitante: r.goles_visitante,
      corners_local: r.corners_local,
      corners_visitante: r.corners_visitante,
      tarjetas_local: r.tarjetas_local,
      tarjetas_visitante: r.tarjetas_visitante,
      puntos_local: r.puntos_local,
      puntos_visitante: r.puntos_visitante,
    });

    if (ganador === null) {
      // Falta el dato: se reintenta. La anulación por DATO_NO_DISPONIBLE
      // la decide el proceso de reintentos a las 72h, no aquí.
      await pool.query(
        `UPDATE mercados SET estado = 'ESPERANDO_DATO' WHERE id = $1`,
        [r.mercado_id],
      );
      continue;
    }

    await liquidarMercado(r.mercado_id, r.sala_id, ganador, r.payload_crudo);
    liquidados++;
  }

  // Una sala queda LIQUIDADA cuando ninguno de sus mercados sigue vivo.
  await pool.query(
    `UPDATE salas s SET estado = 'LIQUIDADA'
      WHERE s.estado IN ('CERRADA','EN_JUEGO')
        AND NOT EXISTS (
            SELECT 1 FROM v_mercados m
             WHERE m.sala_id = s.id
               AND m.estado NOT IN ('LIQUIDADO','ANULADO'))`,
  );

  return { liquidados, anulados };
}

export async function anularPorMotivo(
  salaId: string,
  motivo: MotivoAnulacion,
): Promise<number> {
  const { rows } = await pool.query(
    `SELECT id FROM v_mercados
      WHERE sala_id = $1 AND estado NOT IN ('LIQUIDADO','ANULADO')`,
    [salaId],
  );
  for (const r of rows) {
    await anularMercado(r.id, salaId, motivo);
  }
  await pool.query(
    `UPDATE salas SET estado = 'ANULADA', motivo_anulacion = $2 WHERE id = $1`,
    [salaId, motivo],
  );
  return rows.length;
}
