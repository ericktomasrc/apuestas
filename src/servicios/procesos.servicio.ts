/**
 * Módulo PROCESOS — el reloj del sistema.
 *
 * Especificación funcional v1.4, sección 16.
 *
 * Cada proceso corre aislado: si uno falla, los demás siguen. Un error
 * al sincronizar fixtures no puede impedir que se liquiden los mercados
 * que ya tienen resultado.
 */

import { pool } from './../infraestructura/db.js';
import { procesarCierres, procesarLiquidaciones } from './../servicios/salas.servicio.js';
import {sincronizarFixtures, actualizarEstados, anularSinDato, registrarIncidente, } from './../servicios/deportes.servicio.js';
import {ProveedorDeportes} from './../infraestructura/proveedores/deportes.proveedor.js';

export interface ResultadoProceso {
  nombre: string;
  ok: boolean;
  duracionMs: number;
  detalle?: unknown;
  error?: string;
}

/**
 * Ejecuta un proceso capturando cualquier error.
 *
 * Nunca relanza: un proceso que revienta no debe tumbar al scheduler ni
 * impedir que corran los siguientes. El error queda en `incidentes`
 * para que alguien lo vea.
 */
async function correr(
  nombre: string,
  fn: () => Promise<unknown>,
): Promise<ResultadoProceso> {
  const inicio = Date.now();
  try {
    const detalle = await fn();
    return { nombre, ok: true, duracionMs: Date.now() - inicio, detalle };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await registrarIncidente(
      'PROCESO_FALLIDO',
      { proceso: nombre, error },
      'ALTA',
    ).catch(() => {
      // Si ni el incidente se puede registrar, la base está caída.
      // No hay nada más que hacer aquí; el log queda en consola.
      console.error(`[${nombre}] no se pudo registrar el incidente`);
    });
    return { nombre, ok: false, duracionMs: Date.now() - inicio, error };
  }
}

// =====================================================================
//  Ciclos
// =====================================================================

/** Cada minuto: cerrar salas cuya regresiva venció o que llegaron al
 *  corte de 15 min antes del partido. */
export async function cicloMinuto(): Promise<ResultadoProceso[]> {
  return [await correr('cierres', () => procesarCierres())];
}

/** Cada 5 minutos: traer resultados y liquidar lo que ya se puede.
 *
 *  El orden importa: primero se actualizan los datos del partido,
 *  después se liquida. Al revés se liquidaría con información vieja. */
export async function cicloCincoMinutos(
  proveedor: ProveedorDeportes,
): Promise<ResultadoProceso[]> {
  return [
    await correr('estados', () => actualizarEstados(proveedor)),
    await correr('liquidaciones', () => procesarLiquidaciones()),
  ];
}

/** Cada hora: mercados que llevan demasiado esperando un dato. */
export async function cicloHora(): Promise<ResultadoProceso[]> {
  return [await correr('sin_dato', () => anularSinDato(72))];
}

/** Cada día: fixtures y conciliación contable. */
export async function cicloDiario(
  proveedor: ProveedorDeportes,
): Promise<ResultadoProceso[]> {
  return [
    await correr('fixtures', () => sincronizarFixtures(proveedor, 30)),
    await correr('conciliacion', () => conciliar()),
  ];
}

// =====================================================================
//  Conciliación
// =====================================================================

export interface Conciliacion {
  descuadresMercado: number;
  /** Por moneda. Sumar soles con pesos daría un número sin significado. */
  descuadrePorMoneda: Record<string, number>;
  mercadosAtascados: number;
  sano: boolean;
}

/**
 * Verifica los invariantes de la sección 8.7.
 *
 * Detectar un descuadre el mismo día es la diferencia con descubrirlo
 * en tres meses, cuando ya no hay forma de saber qué pasó.
 */
export async function conciliar(): Promise<Conciliacion> {
  const [porMercado, global, atascados] = await Promise.all([
    pool.query(`SELECT * FROM v_descuadres`),
    pool.query(`SELECT moneda, descuadre FROM v_conciliacion_global`),
    pool.query(
      `SELECT count(*)::int AS n
         FROM v_mercados m
         JOIN v_salas s    ON s.id = m.sala_id
         JOIN v_partidos p ON p.id = s.partido_id
        WHERE m.estado = 'ESPERANDO_DATO'
          AND p.inicia_en < now() - interval '24 hours'`,
    ),
  ]);

  // Hay que revisar TODAS las monedas, no solo la primera. Leer
  // rows[0] dejaría pasar en silencio un descuadre en cualquier moneda
  // que no fuera la de la primera fila.
  const descuadrePorMoneda: Record<string, number> = {};
  for (const fila of global.rows) {
    descuadrePorMoneda[fila.moneda] = Number(fila.descuadre);
  }
  const hayDescuadre = Object.values(descuadrePorMoneda).some((d) => d !== 0);

  const r: Conciliacion = {
    descuadresMercado: porMercado.rows.length,
    descuadrePorMoneda,
    mercadosAtascados: atascados.rows[0].n,
    sano: false,
  };
  r.sano =
    r.descuadresMercado === 0 && !hayDescuadre && r.mercadosAtascados === 0;

  if (r.descuadresMercado > 0 || hayDescuadre) {
    // Un descuadre es dinero creado o destruido. No hay severidad mayor.
    await registrarIncidente(
      'DESCUADRE_CONTABLE',
      { ...r, mercados: porMercado.rows },
      'CRITICA',
    );
  } else if (r.mercadosAtascados > 0) {
    await registrarIncidente('MERCADOS_ATASCADOS', { ...r }, 'ALTA');
  }

  return r;
}

// =====================================================================
//  Estado del sistema
// =====================================================================

export interface Salud {
  sano: boolean;
  conciliacion: Conciliacion;
  salasAbiertas: number;
  mercadosEsperandoDato: number;
  incidentesSinResolver: number;
  /** Por moneda: un total mezclado no significaría nada. */
  dineroRetenido: Record<string, number>;
}

/** Lo que miraría alguien al abrir el panel administrativo por la
 *  mañana para saber si algo se rompió durante la noche. */
export async function salud(): Promise<Salud> {
  const conciliacion = await conciliar();

  const [contadores, retenciones] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT count(*) FROM v_salas WHERE estado IN ('ABIERTA','CUENTA_REGRESIVA'))::int
          AS salas_abiertas,
        (SELECT count(*) FROM v_mercados WHERE estado = 'ESPERANDO_DATO')::int
          AS esperando_dato,
        (SELECT count(*) FROM incidentes WHERE resuelto_en IS NULL)::int
          AS incidentes
    `),
    // Una fila por moneda: el retenido en soles y en pesos son cifras
    // distintas que no se pueden sumar.
    pool.query(`SELECT moneda, retenido_abierto FROM v_conciliacion_global`),
  ]);

  const dineroRetenido: Record<string, number> = {};
  for (const fila of retenciones.rows) {
    dineroRetenido[fila.moneda] = Number(fila.retenido_abierto);
  }

  const r = contadores.rows[0];
  return {
    sano: conciliacion.sano,
    conciliacion,
    salasAbiertas: r.salas_abiertas,
    mercadosEsperandoDato: r.esperando_dato,
    incidentesSinResolver: r.incidentes,
    dineroRetenido,
  };
}

// =====================================================================
//  Scheduler
// =====================================================================

/**
 * Arranca todos los ciclos con setInterval.
 *
 * Para el beta local esto alcanza. En producción conviene BullMQ sobre
 * Redis: da reintentos, evita que dos instancias corran el mismo
 * proceso a la vez, y deja rastro de cada ejecución. Aquí no hace falta
 * todavía porque solo hay un proceso corriendo.
 */
export function iniciarScheduler(proveedor: ProveedorDeportes): () => void {
  const registrar = (r: ResultadoProceso[]): void => {
    for (const p of r) {
      if (!p.ok) console.error(`[${p.nombre}] ${p.error}`);
      else if (p.detalle && Object.values(p.detalle).some((v) => Number(v) > 0)) {
        console.log(`[${p.nombre}] ${JSON.stringify(p.detalle)} (${p.duracionMs}ms)`);
      }
    }
  };

  const timers: NodeJS.Timeout[] = [
    setInterval(() => void cicloMinuto().then(registrar), 60_000),
    setInterval(() => void cicloCincoMinutos(proveedor).then(registrar), 5 * 60_000),
    setInterval(() => void cicloHora().then(registrar), 60 * 60_000),
  ];

  // El ciclo diario se ancla a las 4 de la madrugada, no a las 24
  // horas del arranque.
  //
  // Con `setInterval` de 24h, la hora depende de cuándo se levantó el
  // servidor: reiniciar a las 3 de la tarde deja la sincronización a
  // esa hora para siempre. A las 4am no hay nadie apostando y los
  // fixtures del día ya están publicados.
  const programarDiario = (): void => {
    const ahora = new Date();
    const proxima = new Date(ahora);
    proxima.setHours(4, 0, 0, 0);
    if (proxima <= ahora) proxima.setDate(proxima.getDate() + 1);

    const faltan = proxima.getTime() - ahora.getTime();
    console.log(`  Próxima sincronización: ${proxima.toLocaleString('es-PE')}`);

    timers.push(setTimeout(() => {
      void cicloDiario(proveedor).then(registrar);
      programarDiario();   // se reprograma para el día siguiente
    }, faltan) as unknown as NodeJS.Timeout);
  };
  programarDiario();

  // El ciclo diario corre TAMBIÉN al arrancar, no solo 24 horas
  // después.
  //
  // Sin esto, levantar el servidor y no ver partidos parece un fallo:
  // el primer `setInterval` de 24h no se dispara hasta mañana. Y si el
  // servidor se reinicia a diario —lo normal en desarrollo— el ciclo
  // no llegaría a correr nunca.
  //
  // Se espera 5 segundos para que la base y el pool estén listos.
  const arranque = setTimeout(() => {
    void cicloDiario(proveedor).then((r) => {
      registrar(r);
      const sync = r.find((x) => x.nombre === 'sincronizarFixtures');
      if (sync?.ok && sync.detalle) {
        const n = Number((sync.detalle as Record<string, unknown>).nuevos ?? 0);
        console.log(n > 0
          ? `  ${n} partido(s) nuevos al arrancar`
          : '  Sin partidos nuevos. ¿Alguna liga tiene mercados habilitados?');
      }
    });
  }, 5_000);

  return () => {
    clearTimeout(arranque);
    timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
  };
}
