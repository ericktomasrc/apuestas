/**
 * Servicio de MODO CASA.
 *
 * Alguien pone dinero por adelantado, ofrece varias opciones sobre un
 * partido, y los demás apuestan contra ellas.
 *
 * La diferencia de fondo con el modo sala: allá, si al cerrar los dos
 * lados no suman lo mismo, se anula todo. Aquí eso sería una trampa
 * —la casa no controla cuánta gente entra—, así que **corre con lo que
 * se llenó y devuelve el resto**.
 *
 * Todo lo demás vale igual: enteros, comisión sobre la ganancia, y el
 * invariante verificado en cada liquidación.
 */

import { randomBytes } from 'node:crypto';
import { pool, enTransaccion, type Cliente } from '../infraestructura/db.js';
import {
  liquidarCasa,
  type OpcionCasa,
  type ApuestaContraCasa,
  type ResultadoCasa,
} from '../dominio/casa.js';
import { insertarMovimiento, saldoDe } from './ledger.servicio.js';
import { config as configSalas } from './salas.servicio.js';
import { paisDeUsuario, formatear } from './paises.servicio.js';
import { exigirQueNoSeaPersonal } from './seguridad.servicio.js';

/**
 * ¿Está disponible el modo casa para esta persona?
 *
 * Se comprueba en el SERVIDOR, no solo escondiendo el menú. Ocultar
 * una opción no impide llegar por la URL: quien tenga el enlace entra
 * igual, y sin esta barrera podría apostar contra una casa que ya
 * debería estar apagada.
 */
export async function exigirCasaDisponible(
  usuarioId?: string,
  cliente?: Cliente,
): Promise<void> {
  const cfg = await config(cliente);
  if (!cfg.habilitada) {
    throw new ErrorCasa(
      'CASA_NO_HABILITADA',
      'El modo casa no está disponible por ahora.',
    );
  }
  if (!usuarioId) return;
}

export class ErrorCasa extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCasa';
  }
}

// =====================================================================
//  Configuración
// =====================================================================

export interface ConfigCasa {
  habilitada: boolean;
  oficialActiva: boolean;
  /** Si solo las cuentas declaradas pueden operar casas. */
  soloDeclaradas: boolean;
  presupuestoMaximo: number;
  minOpciones: number;
  maxOpciones: number;
}

let cache: { valor: ConfigCasa; expira: number } | null = null;

export async function config(cliente?: Cliente): Promise<ConfigCasa> {
  if (cache && Date.now() < cache.expira) return cache.valor;

  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT clave, valor FROM configuracion
      WHERE clave LIKE 'casa_%' AND eliminado_en IS NULL`,
  );
  const m = new Map<string, string>(rows.map((r) => [r.clave, r.valor]));
  const num = (k: string, d: number): number => {
    const n = Number(m.get(k));
    return Number.isFinite(n) ? n : d;
  };

  const valor: ConfigCasa = {
    habilitada: m.get('casa_habilitada') === 'true',
    oficialActiva: m.get('casa_oficial_activa') === 'true',
    // Al arrancar conviene que solo la plataforma opere casas: es
    // dinero real y todavía no hay historial que respalde a nadie.
    // Se abre a los usuarios cuando el módulo esté probado.
    soloDeclaradas: m.get('casa_solo_declaradas') !== 'false',
    presupuestoMaximo: num('casa_presupuesto_maximo', 300000),
    minOpciones: num('casa_min_opciones', 2),
    maxOpciones: num('casa_max_opciones', 8),
  };
  cache = { valor, expira: Date.now() + 60_000 };
  return valor;
}

export function invalidarConfigCasa(): void {
  cache = null;
}

// =====================================================================
//  El libro
// =====================================================================

export type TipoLibro =
  | 'FINANCIAMIENTO' | 'RETIRO_FONDOS'
  | 'CASA_CREADA' | 'CASA_CERRADA' | 'CASA_LIQUIDADA' | 'CASA_ANULADA'
  | 'CASA_ACTIVADA' | 'CASA_DESACTIVADA'
  | 'CUENTA_MARCADA' | 'PARAMETRO_CAMBIADO';

/**
 * Registra una decisión de la casa.
 *
 * Los `movimientos` ya guardan el dinero; esto guarda el **porqué**.
 * Un auditor pregunta por qué se anuló una casa, no solo cuánto se
 * devolvió. Por eso el motivo es obligatorio.
 */
export async function anotarEnLibro(
  datos: {
    tipo: TipoLibro;
    motivo: string;
    casaId?: string;
    usuarioId?: string;
    montoCentavos?: number;
    moneda?: string;
    autorizadoPor?: string;
    ip?: string;
    detalle?: Record<string, unknown>;
  },
  cliente?: Cliente,
): Promise<void> {
  if (!datos.motivo?.trim()) {
    throw new ErrorCasa('MOTIVO_REQUERIDO', 'Toda anotación necesita un motivo.');
  }
  const q = cliente ?? pool;
  await q.query(
    `INSERT INTO libro_casa
       (tipo, casa_id, usuario_id, monto_centavos, moneda, motivo,
        autorizado_por, ip, detalle)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::inet,$9)`,
    [
      datos.tipo, datos.casaId ?? null, datos.usuarioId ?? null,
      datos.montoCentavos ?? null, datos.moneda ?? null, datos.motivo.trim(),
      datos.autorizadoPor ?? null,
      datos.ip && datos.ip !== '127.0.0.1' ? datos.ip : null,
      JSON.stringify(datos.detalle ?? {}),
    ],
  );
}

// =====================================================================
//  Crear una casa
// =====================================================================

function codigoCasa(): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sin I ni O
  const n = randomBytes(3);
  return 'C' + letras[n[0] % 24] + letras[n[1] % 24] + String(n[2] % 100).padStart(2, '0');
}

export interface OpcionNueva {
  tipoMercado: string;
  linea?: number | null;
  equipo?: string | null;
  etiqueta: string;
  presupuestoCentavos: number;
}

export async function crearCasa(
  operadorId: string,
  datos: {
    partidoId: string;
    descripcion?: string;
    opciones: OpcionNueva[];
  },
): Promise<{ id: string; codigo: string; presupuestoCentavos: number }> {
  const cfg = await config();
  if (!cfg.habilitada) {
    throw new ErrorCasa('CASA_NO_HABILITADA', 'El modo casa no está disponible por ahora.');
  }

  // Quien puede anular salas no puede operar una casa: podría anular
  // la suya al ver que va perdiendo.
  await exigirQueNoSeaPersonal(operadorId);

  if (cfg.soloDeclaradas) {
    const { rows } = await pool.query(
      `SELECT es_casa_oficial, financiada_por_plataforma
         FROM v_usuarios WHERE id = $1`,
      [operadorId],
    );
    if (!rows[0]?.es_casa_oficial && !rows[0]?.financiada_por_plataforma) {
      throw new ErrorCasa(
        'CASA_SOLO_DECLARADAS',
        'Por ahora solo la plataforma puede abrir casas. Pronto se habilita para todos.',
      );
    }
  }

  if (datos.opciones.length < cfg.minOpciones) {
    throw new ErrorCasa(
      'POCAS_OPCIONES',
      `Una casa necesita al menos ${cfg.minOpciones} opciones. Con una sola no habría nada que elegir.`,
    );
  }
  if (datos.opciones.length > cfg.maxOpciones) {
    throw new ErrorCasa('DEMASIADAS_OPCIONES', `Máximo ${cfg.maxOpciones} opciones.`);
  }

  const pais = await paisDeUsuario(operadorId);
  const total = datos.opciones.reduce((t, o) => t + o.presupuestoCentavos, 0);

  if (!Number.isInteger(total) || total <= 0) {
    throw new ErrorCasa('MONTO_INVALIDO', 'El presupuesto debe ser un entero positivo.');
  }
  if (total > cfg.presupuestoMaximo) {
    throw new ErrorCasa(
      'PRESUPUESTO_EXCEDIDO',
      `El máximo por casa es ${formatear(cfg.presupuestoMaximo, pais)}.`,
    );
  }
  for (const o of datos.opciones) {
    if (!Number.isInteger(o.presupuestoCentavos) || o.presupuestoCentavos <= 0) {
      throw new ErrorCasa(
        'MONTO_INVALIDO',
        'Cada opción necesita presupuesto: sin él, nadie podría apostar contra ella.',
      );
    }
    if (o.presupuestoCentavos < pais.minimoApuesta) {
      throw new ErrorCasa(
        'MONTO_FUERA_DE_RANGO',
        `Cada opción necesita al menos ${formatear(pais.minimoApuesta, pais)}.`,
      );
    }
  }

  return enTransaccion(async (c) => {
    // Bloqueo: sin esto, dos casas creadas a la vez leerían el mismo
    // disponible y ambas pasarían la validación.
    await c.query('SELECT id FROM usuarios WHERE id = $1 FOR UPDATE', [operadorId]);

    const saldo = await saldoDe(operadorId, c);
    if (saldo.disponibleCentavos < total) {
      throw new ErrorCasa(
        'SALDO_INSUFICIENTE',
        `No te alcanza. Necesitas ${formatear(total, pais)} y tienes ${formatear(saldo.disponibleCentavos, pais)}.`,
      );
    }

    const partido = await c.query(
      `SELECT id, inicia_en, equipo_local, equipo_visitante
         FROM v_partidos WHERE id = $1 AND estado = 'PROGRAMADO'`,
      [datos.partidoId],
    );
    if (partido.rows.length === 0) {
      throw new ErrorCasa('MERCADO_NO_EXISTE', 'Ese partido ya no está disponible.');
    }

    const cfgSalas = await configSalas(c);
    const faltan = (new Date(partido.rows[0].inicia_en).getTime() - Date.now()) / 60000;
    if (faltan < cfgSalas.minutosCierreAntes) {
      throw new ErrorCasa('CIERRE_INMINENTE', 'Ese partido empieza muy pronto.');
    }

    const usuario = await c.query(
      `SELECT u.estado, u.es_casa_oficial, t.tasa_comision AS tasa
         FROM v_usuarios u
         JOIN v_tasa_usuario t ON t.usuario_id = u.id
        WHERE u.id = $1`,
      [operadorId],
    );
    if (usuario.rows[0]?.estado !== 'ACTIVO') {
      throw new ErrorCasa('USUARIO_NO_HABILITADO', 'Cuenta no habilitada.');
    }

    const esOficial = usuario.rows[0].es_casa_oficial === true;
    if (esOficial && !cfg.oficialActiva) {
      throw new ErrorCasa(
        'CASA_OFICIAL_APAGADA',
        'La casa de la plataforma está desactivada.',
      );
    }

    const codigo = codigoCasa();
    const casa = await c.query(
      `INSERT INTO casas (codigo, partido_id, operador_id, pais, descripcion,
                          presupuesto_centavos, tasa_comision, es_oficial)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [codigo, datos.partidoId, operadorId, pais.codigo,
       datos.descripcion ?? null, total, usuario.rows[0].tasa, esOficial],
    );
    const casaId = casa.rows[0].id as string;

    for (const o of datos.opciones) {
      await c.query(
        `INSERT INTO opciones_casa
           (casa_id, tipo_mercado, linea, equipo_referencia, etiqueta,
            presupuesto_centavos)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [casaId, o.tipoMercado, o.linea ?? null, o.equipo ?? null,
         o.etiqueta, o.presupuestoCentavos],
      );
    }

    // El dinero se retiene al publicar, no al liquidar. Ofrecer algo
    // que no se puede respaldar sería prometer lo que no se tiene.
    await insertarMovimiento(c, {
      usuarioId: operadorId,
      tipo: 'RETENCION',
      montoCentavos: -total,
      casaId,
      claveIdempotencia: `casa:presupuesto:${casaId}`,
      motivo: `Presupuesto de la casa ${codigo}`,
    });

    await anotarEnLibro({
      tipo: 'CASA_CREADA',
      casaId,
      usuarioId: operadorId,
      montoCentavos: total,
      moneda: pais.moneda,
      motivo: `Casa ${codigo} sobre ${partido.rows[0].equipo_local} vs ${partido.rows[0].equipo_visitante}`,
      detalle: {
        opciones: datos.opciones.map((o) => ({
          etiqueta: o.etiqueta,
          presupuesto: o.presupuestoCentavos,
        })),
        esOficial,
      },
    }, c);

    return { id: casaId, codigo, presupuestoCentavos: total };
  }, operadorId);
}

// =====================================================================
//  Apostar contra la casa
// =====================================================================

export async function apostarContraCasa(
  usuarioId: string,
  opcionId: string,
  montoCentavos: number,
  claveIdempotencia: string,
): Promise<{ cubiertoCentavos: number; sobranteCentavos: number }> {
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new ErrorCasa('MONTO_INVALIDO', 'El monto debe ser un entero positivo.');
  }

  // Si el módulo se apagó, no se puede seguir apostando aunque la
  // pantalla siga abierta en el navegador de alguien.
  await exigirCasaDisponible(usuarioId);

  return enTransaccion(async (c) => {
    // Todo en UNA transacción: validar, retener y registrar. Repartido
    // en varias, un fallo dejaría dinero retenido sin apuesta detrás.
    const { rows } = await c.query(
      `SELECT o.id, o.casa_id, o.etiqueta, o.presupuesto_centavos,
              c.estado, c.operador_id, c.pais, c.codigo,
              p.inicia_en
         FROM v_opciones_casa o
         JOIN v_casas c    ON c.id = o.casa_id
         JOIN v_partidos p ON p.id = c.partido_id
        WHERE o.id = $1
        FOR UPDATE OF o`,
      [opcionId],
    );
    if (rows.length === 0) {
      throw new ErrorCasa('MERCADO_NO_EXISTE', 'Esa opción no existe.');
    }
    const op = rows[0];

    if (op.estado !== 'ABIERTA') {
      throw new ErrorCasa('SALA_CERRADA', 'Esta casa ya no admite apuestas.');
    }
    if (op.operador_id === usuarioId) {
      // Apostar contra la propia casa es mover dinero de un bolsillo
      // al otro pagando comisión.
      throw new ErrorCasa(
        'POSICION_CONTRADICTORIA',
        'No puedes apostar contra tu propia casa.',
      );
    }

    const cfgSalas = await configSalas(c);
    const faltan = (new Date(op.inicia_en).getTime() - Date.now()) / 60000;
    if (faltan < cfgSalas.minutosCierreAntes) {
      throw new ErrorCasa('CIERRE_INMINENTE', 'Falta muy poco para el partido.');
    }

    const pais = await paisDeUsuario(usuarioId, c);
    if (pais.codigo !== op.pais) {
      throw new ErrorCasa(
        'PAIS_DISTINTO',
        'Esta casa es de otro país y usa otra moneda.',
      );
    }
    if (montoCentavos < pais.minimoApuesta) {
      throw new ErrorCasa(
        'MONTO_FUERA_DE_RANGO',
        `La apuesta más baja permitida es ${formatear(pais.minimoApuesta, pais)}.`,
      );
    }

    await exigirQueNoSeaPersonal(usuarioId, c);

    const yaEsta = await c.query(
      `SELECT 1 FROM v_apuestas_casa WHERE opcion_id = $1 AND usuario_id = $2`,
      [opcionId, usuarioId],
    );
    if (yaEsta.rows.length > 0) {
      throw new ErrorCasa(
        'POSICION_DUPLICADA',
        'Ya apostaste a esta opción.',
      );
    }

    // Cuánto queda del presupuesto. Lo que no cabe se rechaza aquí en
    // vez de aceptarlo y devolverlo después: prometer un cupo que no
    // existe y devolverlo al liquidar confunde más que ayudar.
    const cupo = await c.query(
      `SELECT disponible_centavos FROM v_cupos_casa WHERE opcion_id = $1`,
      [opcionId],
    );
    const disponible = Number(cupo.rows[0]?.disponible_centavos ?? 0);
    if (disponible <= 0) {
      throw new ErrorCasa('CUPO_AGOTADO', 'Esa opción ya está completa.');
    }

    const cubierto = Math.min(montoCentavos, disponible);
    const sobrante = montoCentavos - cubierto;

    const usuario = await c.query(
      `SELECT u.estado, t.tasa_comision AS tasa
         FROM v_usuarios u
         JOIN v_tasa_usuario t ON t.usuario_id = u.id
        WHERE u.id = $1`,
      [usuarioId],
    );
    if (usuario.rows[0]?.estado !== 'ACTIVO') {
      throw new ErrorCasa('USUARIO_NO_HABILITADO', 'Cuenta no habilitada.');
    }

    await c.query('SELECT id FROM usuarios WHERE id = $1 FOR UPDATE', [usuarioId]);
    const saldo = await saldoDe(usuarioId, c);
    if (saldo.disponibleCentavos < cubierto) {
      throw new ErrorCasa(
        'SALDO_INSUFICIENTE',
        `No te alcanza. Tienes ${formatear(saldo.disponibleCentavos, pais)}.`,
      );
    }

    await c.query(
      `INSERT INTO apuestas_casa
         (opcion_id, usuario_id, monto_centavos, tasa_mostrada)
       VALUES ($1,$2,$3,$4)`,
      [opcionId, usuarioId, cubierto, usuario.rows[0].tasa],
    );

    await insertarMovimiento(c, {
      usuarioId,
      tipo: 'RETENCION',
      montoCentavos: -cubierto,
      casaId: op.casa_id,
      claveIdempotencia,
      motivo: `Apuesta contra ${op.etiqueta} · casa ${op.codigo}`,
    });

    return { cubiertoCentavos: cubierto, sobranteCentavos: sobrante };
  }, usuarioId);
}

// =====================================================================
//  Liquidar
// =====================================================================

export async function liquidarCasaPorId(
  casaId: string,
  opcionGanadoraId: string,
): Promise<ResultadoCasa> {
  return enTransaccion(async (c) => {
    const casa = await c.query(
      `SELECT id, codigo, estado, operador_id, pais, tasa_comision, es_oficial
         FROM v_casas WHERE id = $1 FOR UPDATE`,
      [casaId],
    );
    if (casa.rows.length === 0) {
      throw new ErrorCasa('SALA_NO_EXISTE', 'Esa casa no existe.');
    }
    if (casa.rows[0].estado === 'LIQUIDADA' || casa.rows[0].estado === 'ANULADA') {
      throw new ErrorCasa('YA_LIQUIDADO', 'Esta casa ya se resolvió.');
    }

    const opciones = await c.query(
      `SELECT id, etiqueta, presupuesto_centavos FROM v_opciones_casa
        WHERE casa_id = $1`,
      [casaId],
    );
    const apuestas = await c.query(
      `SELECT a.id, a.usuario_id, a.opcion_id, a.monto_centavos,
              a.tasa_mostrada, a.orden
         FROM v_apuestas_casa a
         JOIN v_opciones_casa o ON o.id = a.opcion_id
        WHERE o.casa_id = $1
        ORDER BY a.orden`,
      [casaId],
    );

    const ops: OpcionCasa[] = opciones.rows.map((o) => ({
      opcionId: o.id,
      presupuestoCentavos: Number(o.presupuesto_centavos),
    }));
    const aps: ApuestaContraCasa[] = apuestas.rows.map((a) => ({
      usuarioId: a.usuario_id,
      opcionId: a.opcion_id,
      montoCentavos: Number(a.monto_centavos),
      tasaComision: Number(a.tasa_mostrada),
      orden: Number(a.orden),
    }));

    // El motor verifica el invariante y lanza si no cuadra. Al estar
    // dentro de la transacción, un fallo revierte todo: es preferible
    // no pagar a pagar mal.
    const r = liquidarCasa(ops, aps, opcionGanadoraId, Number(casa.rows[0].tasa_comision));

    const pais = await paisDeUsuario(casa.rows[0].operador_id, c);

    // La foto: el estado exacto en el momento del pago. Sin esto,
    // auditar significaría reconstruir el pasado desde tablas que
    // pudieron cambiar después.
    const foto = {
      momento: new Date().toISOString(),
      casa: { id: casaId, codigo: casa.rows[0].codigo, esOficial: casa.rows[0].es_oficial },
      tasaCasa: Number(casa.rows[0].tasa_comision),
      opciones: opciones.rows.map((o) => ({
        id: o.id, etiqueta: o.etiqueta,
        presupuesto: Number(o.presupuesto_centavos),
        ocurrio: o.id === opcionGanadoraId,
      })),
      apuestas: apuestas.rows.map((a) => ({
        usuarioId: a.usuario_id, opcionId: a.opcion_id,
        monto: Number(a.monto_centavos), tasa: Number(a.tasa_mostrada),
        orden: Number(a.orden),
      })),
      resultado: r,
    };

    await c.query(
      `INSERT INTO liquidaciones_casa
         (casa_id, opcion_ganadora_id, presupuesto_centavos, cubierto_centavos,
          liberado_centavos, resultado_casa_centavos, comision_casa_centavos,
          comision_apostadores_centavos, pago_casa_centavos, foto)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [casaId, opcionGanadoraId, r.presupuestoTotalCentavos, r.cubiertoTotalCentavos,
       r.liberadoCasaCentavos, r.resultadoCasaBrutoCentavos, r.comisionCasaCentavos,
       r.comisionApostadoresCentavos, r.pagoCasaCentavos, JSON.stringify(foto)],
    );

    await c.query(
      `UPDATE opciones_casa SET ocurrio = (id = $2) WHERE casa_id = $1`,
      [casaId, opcionGanadoraId],
    );

    // --- pagar ---
    for (const p of r.pagos) {
      await insertarMovimiento(c, {
        usuarioId: p.usuarioId,
        tipo: p.gananciaBrutaCentavos > 0 ? 'PREMIO' : 'DEVOLUCION',
        montoCentavos: p.pagoCentavos,
        casaId,
        claveIdempotencia: `casa:pago:${casaId}:${p.usuarioId}:${p.opcionId}`,
        motivo: p.gananciaBrutaCentavos > 0 ? 'Ganó contra la casa' : 'Cupo no tomado',
      });

      if (p.comisionCentavos > 0) {
        await insertarMovimiento(c, {
          usuarioId: p.usuarioId,
          tipo: 'COMISION',
          montoCentavos: p.comisionCentavos,
          casaId,
          esCasa: true,
          claveIdempotencia: `casa:comision:${casaId}:${p.usuarioId}`,
          motivo: 'Comisión sobre la ganancia',
        });
      }
    }

    // La casa recibe: presupuesto liberado + lo cubierto + resultado,
    // menos su comisión.
    if (r.pagoCasaCentavos > 0) {
      await insertarMovimiento(c, {
        usuarioId: casa.rows[0].operador_id,
        tipo: r.resultadoCasaBrutoCentavos > 0 ? 'PREMIO' : 'DEVOLUCION',
        montoCentavos: r.pagoCasaCentavos,
        casaId,
        claveIdempotencia: `casa:operador:${casaId}`,
        motivo: r.resultadoCasaBrutoCentavos > 0
          ? 'Resultado a favor de la casa'
          : 'Presupuesto devuelto',
      });
    }

    if (r.comisionCasaCentavos > 0) {
      await insertarMovimiento(c, {
        usuarioId: casa.rows[0].operador_id,
        tipo: 'COMISION',
        montoCentavos: r.comisionCasaCentavos,
        casaId,
        esCasa: true,
        claveIdempotencia: `casa:comision-operador:${casaId}`,
        motivo: 'Comisión sobre la ganancia de la casa',
      });
    }

    await c.query(
      `UPDATE casas SET estado = 'LIQUIDADA', liquidada_en = now() WHERE id = $1`,
      [casaId],
    );

    await anotarEnLibro({
      tipo: 'CASA_LIQUIDADA',
      casaId,
      usuarioId: casa.rows[0].operador_id,
      montoCentavos: r.resultadoCasaBrutoCentavos,
      moneda: pais.moneda,
      motivo: `Ocurrió: ${opciones.rows.find((o) => o.id === opcionGanadoraId)?.etiqueta ?? '—'}`,
      detalle: {
        cubierto: r.cubiertoTotalCentavos,
        liberado: r.liberadoCasaCentavos,
        comisionTotal: r.comisionTotalCentavos,
      },
    }, c);

    return r;
    // Sin usuario de sesión: la liquidación la dispara el scheduler,
    // no una persona. Los triggers de auditoría lo registran como
    // automático.
  }, undefined);
}

// =====================================================================
//  Anular
// =====================================================================

export async function anularCasa(
  casaId: string,
  motivo: string,
): Promise<{ devueltoCentavos: number }> {
  if (!motivo?.trim()) {
    throw new ErrorCasa('MOTIVO_REQUERIDO', 'Una anulación necesita motivo.');
  }

  return enTransaccion(async (c) => {
    const casa = await c.query(
      `SELECT id, codigo, estado, operador_id, presupuesto_centavos, pais
         FROM v_casas WHERE id = $1 FOR UPDATE`,
      [casaId],
    );
    if (casa.rows.length === 0) {
      throw new ErrorCasa('SALA_NO_EXISTE', 'Esa casa no existe.');
    }
    if (['LIQUIDADA', 'ANULADA'].includes(casa.rows[0].estado)) {
      throw new ErrorCasa('YA_LIQUIDADO', 'Esta casa ya se resolvió.');
    }

    // Se devuelve según el LIBRO, no según las apuestas registradas.
    // El libro de movimientos es la fuente de verdad del dinero; las
    // apuestas son metadatos del juego.
    const { rows: retenido } = await c.query(
      `SELECT usuario_id, -SUM(monto_centavos)::bigint AS comprometido
         FROM movimientos
        WHERE casa_id = $1 AND tipo IN ('RETENCION','LIBERACION')
        GROUP BY usuario_id
       HAVING -SUM(monto_centavos) > 0`,
      [casaId],
    );

    let devuelto = 0;
    for (const d of retenido) {
      const monto = Number(d.comprometido);
      devuelto += monto;
      await insertarMovimiento(c, {
        usuarioId: d.usuario_id,
        tipo: 'DEVOLUCION',
        montoCentavos: monto,
        casaId,
        claveIdempotencia: `casa:anulacion:${casaId}:${d.usuario_id}`,
        motivo: `Casa anulada: ${motivo}`,
      });
    }

    await c.query(
      `INSERT INTO liquidaciones_casa
         (casa_id, presupuesto_centavos, cubierto_centavos, liberado_centavos,
          resultado_casa_centavos, comision_casa_centavos,
          comision_apostadores_centavos, pago_casa_centavos,
          motivo_anulacion, foto)
       VALUES ($1,$2,0,$2,0,0,0,$2,$3,$4)`,
      [casaId, casa.rows[0].presupuesto_centavos, motivo,
       JSON.stringify({ anulada: true, motivo, devuelto, momento: new Date().toISOString() })],
    );

    await c.query(
      `UPDATE casas SET estado = 'ANULADA', motivo_anulacion = $2,
                        liquidada_en = now()
        WHERE id = $1`,
      [casaId, motivo],
    );

    const pais = await paisDeUsuario(casa.rows[0].operador_id, c);
    await anotarEnLibro({
      tipo: 'CASA_ANULADA',
      casaId,
      usuarioId: casa.rows[0].operador_id,
      montoCentavos: devuelto,
      moneda: pais.moneda,
      // Nunca se cobra comisión en una anulación: no hubo resultado
      // que cobrar.
      motivo,
      detalle: { devoluciones: retenido.length },
    }, c);

    return { devueltoCentavos: devuelto };
  }, undefined);
}

// =====================================================================
//  Consultas
// =====================================================================

export async function casaConDetalle(casaId: string, yo?: string | null): Promise<unknown> {
  const casa = await pool.query(
    `SELECT c.*, p.equipo_local, p.equipo_visitante, p.inicia_en,
            p.estado AS estado_partido, l.nombre AS liga,
            u.alias AS operador, u.es_casa_oficial,
            (c.operador_id = $2::uuid) AS soy_operador
       FROM v_casas c
       JOIN v_partidos p ON p.id = c.partido_id
       JOIN v_ligas l    ON l.id = p.liga_id
       JOIN v_usuarios u ON u.id = c.operador_id
      WHERE c.id = $1`,
    [casaId, yo ?? null],
  );
  if (casa.rows.length === 0) {
    throw new ErrorCasa('SALA_NO_EXISTE', 'Esa casa no existe.');
  }

  const opciones = await pool.query(
    `SELECT o.id, o.tipo_mercado, o.linea, o.etiqueta, o.ocurrio,
            cu.presupuesto_centavos, cu.tomado_centavos,
            cu.disponible_centavos, cu.apostadores
       FROM v_opciones_casa o
       JOIN v_cupos_casa cu ON cu.opcion_id = o.id
      WHERE o.casa_id = $1
      ORDER BY cu.presupuesto_centavos DESC`,
    [casaId],
  );

  // Las apuestas contra la casa oficial son públicas: es lo que
  // permite verificar que no hay trato preferente.
  const apuestas = await pool.query(
    `SELECT a.opcion_id, a.monto_centavos, u.alias,
            (a.usuario_id = $2::uuid) AS soy_yo
       FROM v_apuestas_casa a
       JOIN v_usuarios u ON u.id = a.usuario_id
       JOIN v_opciones_casa o ON o.id = a.opcion_id
      WHERE o.casa_id = $1
      ORDER BY a.orden`,
    [casaId, yo ?? null],
  );

  return {
    casa: casa.rows[0],
    opciones: opciones.rows,
    apuestas: apuestas.rows,
    misApuestas: apuestas.rows.filter((a) => a.soy_yo),
  };
}

export async function casasAbiertas(pais = 'PE', limite = 40): Promise<unknown[]> {
  const { rows } = await pool.query(
    `SELECT c.id, c.codigo, c.estado, c.presupuesto_centavos, c.es_oficial,
            p.equipo_local, p.equipo_visitante, p.inicia_en,
            l.nombre AS liga, u.alias AS operador,
            (SELECT COALESCE(SUM(cu.disponible_centavos), 0)::bigint
               FROM v_cupos_casa cu
               JOIN v_opciones_casa o ON o.id = cu.opcion_id
              WHERE o.casa_id = c.id) AS disponible_centavos,
            (SELECT count(*)::int FROM v_opciones_casa o WHERE o.casa_id = c.id)
              AS total_opciones
       FROM v_casas c
       JOIN v_partidos p ON p.id = c.partido_id
       JOIN v_ligas l    ON l.id = p.liga_id
       JOIN v_usuarios u ON u.id = c.operador_id
      WHERE c.estado = 'ABIERTA' AND c.pais = $1
        AND p.inicia_en > now()
      ORDER BY c.es_oficial DESC, p.inicia_en ASC
      LIMIT $2`,
    [pais, limite],
  );
  return rows;
}
