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
import {
  ZONA_HORARIA_AUTOMATIZACION,
  relojNegocio,
  siguienteEjecucionEnZona,
  reservarRanuraAutomatica,
  finalizarRanuraAutomatica,
} from './automatizacion-tiempo.servicio.js';

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
//  Automatización configurable de Deportes
// =====================================================================

interface ConfiguracionCargaPartidos {
  activo: boolean;
  hora: string;
  vecesPorDia: number;
}

export interface EstadoCargaPartidosAutomatica {
  ejecutando: boolean;
  ultimoIntento: string | null;
  ultimaFinalizacion: string | null;
  ultimaDuracionMs: number | null;
  ultimoOk: boolean | null;
  ultimoResultado: unknown | null;
  ultimoError: string | null;
  proximaEjecucion: string | null;
}

const estadoCargaPartidos: EstadoCargaPartidosAutomatica = {
  ejecutando: false,
  ultimoIntento: null,
  ultimaFinalizacion: null,
  ultimaDuracionMs: null,
  ultimoOk: null,
  ultimoResultado: null,
  ultimoError: null,
  proximaEjecucion: null,
};

export function obtenerEstadoCargaPartidosAutomatica(): EstadoCargaPartidosAutomatica {
  return { ...estadoCargaPartidos };
}

function calcularProximaCargaPartidos(
  horaInicial: string,
  vecesPorDia: number,
  desde = new Date(),
): string {
  return siguienteEjecucionEnZona(
    horariosCargaPartidos(horaInicial, vecesPorDia),
    desde,
  ) ?? new Date(desde.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

const VECES_PERMITIDAS = new Set([1, 2, 3, 4, 6]);

function booleanoConfiguracion(valor: unknown, defecto: boolean): boolean {
  if (typeof valor !== 'string') return defecto;
  const normalizado = valor.trim().toLowerCase();
  if (['true', '1', 'si', 'sí', 'on'].includes(normalizado)) return true;
  if (['false', '0', 'no', 'off'].includes(normalizado)) return false;
  return defecto;
}

function horaConfiguracion(valor: unknown, defecto = '04:00'): string {
  if (typeof valor !== 'string') return defecto;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(valor.trim()) ? valor.trim() : defecto;
}

function vecesConfiguracion(valor: unknown, defecto = 1): number {
  const n = Number(valor);
  return Number.isInteger(n) && VECES_PERMITIDAS.has(n) ? n : defecto;
}

/**
 * Lee la configuración persistente creada por 028_automatizacion_deportes.sql.
 *
 * Si la migración todavía no fue aplicada o la BD está temporalmente
 * inaccesible, conserva el comportamiento histórico: activo, 04:00, 1 vez/día.
 */
export async function obtenerConfiguracionCargaPartidos(): Promise<ConfiguracionCargaPartidos> {
  try {
    const r = await pool.query(
      `SELECT clave, valor
         FROM configuracion
        WHERE clave = ANY($1::text[])
          AND eliminado_en IS NULL`,
      [[
        'deportes_auto_activo',
        'deportes_auto_hora',
        'deportes_auto_veces',
      ]],
    );

    const valores = new Map<string, string>(
      r.rows.map((fila) => [String(fila.clave), String(fila.valor)]),
    );

    return {
      activo: booleanoConfiguracion(valores.get('deportes_auto_activo'), true),
      hora: horaConfiguracion(valores.get('deportes_auto_hora'), '04:00'),
      vecesPorDia: vecesConfiguracion(valores.get('deportes_auto_veces'), 1),
    };
  } catch (e) {
    console.error(
      '[automatizacion_partidos] no se pudo leer configuracion; se usan valores seguros',
      e instanceof Error ? e.message : String(e),
    );
    return { activo: true, hora: '04:00', vecesPorDia: 1 };
  }
}

function minutosDelDia(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calcula horas fijas y equidistantes. Reiniciar el servidor no desplaza
 * el horario porque siempre se vuelve a calcular desde la hora inicial.
 *
 * Ejemplo: 04:00 + 3/día => 04:00, 12:00, 20:00.
 */
export function horariosCargaPartidos(
  horaInicial: string,
  vecesPorDia: number,
): string[] {
  const hora = horaConfiguracion(horaInicial, '04:00');
  const veces = vecesConfiguracion(vecesPorDia, 1);
  const inicio = minutosDelDia(hora);
  const paso = (24 * 60) / veces;

  return Array.from({ length: veces }, (_, i) => {
    const total = Math.round((inicio + i * paso) % (24 * 60));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
}

/**
 * Ejecuta solamente la carga de partidos. Este es el proceso que controla
 * el switch "Carga automática de partidos".
 */
export async function ejecutarCargaPartidos(
  proveedor: ProveedorDeportes,
): Promise<ResultadoProceso[]> {
  if (estadoCargaPartidos.ejecutando) {
    return [{ nombre:'fixtures', ok:false, duracionMs:0, error:'La carga de partidos ya se está ejecutando.' }];
  }
  estadoCargaPartidos.ejecutando=true;
  estadoCargaPartidos.ultimoIntento=new Date().toISOString();
  const inicio=Date.now();
  try {
    const resultados=[await correr('fixtures',()=>sincronizarFixtures(proveedor,30))];
    const r=resultados[0];
    estadoCargaPartidos.ultimaFinalizacion=new Date().toISOString();
    estadoCargaPartidos.ultimaDuracionMs=Date.now()-inicio;
    estadoCargaPartidos.ultimoOk=r.ok;
    estadoCargaPartidos.ultimoResultado=r.detalle ?? null;
    estadoCargaPartidos.ultimoError=r.ok ? null : (r.error ?? 'Error no especificado');
    return resultados;
  } finally {
    estadoCargaPartidos.ejecutando=false;
  }
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
      else if (
        p.detalle
        && typeof p.detalle === 'object'
        && Object.values(p.detalle as Record<string, unknown>).some((v) => Number(v) > 0)
      ) {
        console.log(`[${p.nombre}] ${JSON.stringify(p.detalle)} (${p.duracionMs}ms)`);
      }
    }
  };

  const timers: NodeJS.Timeout[] = [
    setInterval(() => void cicloMinuto().then(registrar), 60_000),
    setInterval(() => void cicloCincoMinutos(proveedor).then(registrar), 5 * 60_000),
    setInterval(() => void cicloHora().then(registrar), 60 * 60_000),
  ];

  /*
   * La carga automática de partidos se comprueba cada minuto contra la
   * configuración guardada en PostgreSQL. Así:
   *
   * - ON/OFF se puede cambiar sin reiniciar el servidor.
   * - la hora se puede cambiar sin reiniciar.
   * - la cantidad de veces por día se puede cambiar sin reiniciar.
   * - reiniciar el servidor NO mueve las horas programadas.
   *
   * `ultimaRanuraPartidos` evita ejecutar dos veces la misma ranura mientras
   * esta instancia siga viva.
   */
  const revisarCargaAutomaticaPartidos = async (): Promise<void> => {
    const config = await obtenerConfiguracionCargaPartidos();
    if (!config.activo) {
      estadoCargaPartidos.proximaEjecucion = null;
      return;
    }

    estadoCargaPartidos.proximaEjecucion =
      calcularProximaCargaPartidos(config.hora, config.vecesPorDia);

    const reloj = relojNegocio();
    const horarios = horariosCargaPartidos(config.hora, config.vecesPorDia);
    if (!horarios.includes(reloj.hhmm)) return;

    const ranura = `${reloj.fecha}T${reloj.hhmm}`;
    const reservada = await reservarRanuraAutomatica('PARTIDOS', ranura);
    if (!reservada) return;

    const inicio = Date.now();
    try {
      const resultados = await ejecutarCargaPartidos(proveedor);
      const principal = resultados[0];
      await finalizarRanuraAutomatica('PARTIDOS', ranura, {
        estado: principal?.ok ? 'COMPLETADO' : 'ERROR',
        duracionMs: Date.now() - inicio,
        error: principal?.ok ? null : (principal?.error ?? 'Error no especificado'),
        detalle: principal?.detalle ?? null,
      });
      registrar(resultados);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await finalizarRanuraAutomatica('PARTIDOS', ranura, {
        estado: 'ERROR',
        duracionMs: Date.now() - inicio,
        error,
      }).catch(() => undefined);
      console.error(`[fixtures] ${error}`);
    }
  };
  timers.push(
    setInterval(
      () => void revisarCargaAutomaticaPartidos(),
      30_000,
    ),
  );

  /*
   * La conciliación sigue siendo independiente del switch de partidos.
   * Desactivar "Carga automática de partidos" NO debe desactivar controles
   * contables ni otros procesos del sistema.
   */
  let ultimaConciliacionDiaria = '';

  const revisarConciliacionDiaria = async (): Promise<void> => {
    const reloj = relojNegocio();
    if (reloj.hhmm !== '04:00') return;

    const fecha = reloj.fecha;
    if (fecha === ultimaConciliacionDiaria) return;
    ultimaConciliacionDiaria = fecha;

    registrar([await correr('conciliacion', () => conciliar())]);
  };

  timers.push(
    setInterval(
      () => void revisarConciliacionDiaria(),
      30_000,
    ),
  );

  /*
   * Al arrancar ya NO se fuerza una sincronización de fixtures.
   * La carga automática queda gobernada por su configuración y sus horas.
   * Los ciclos de 1 min, 5 min y 1 hora permanecen intactos.
   */
  const arranque = setTimeout(() => {
    void (async () => {
      const config = await obtenerConfiguracionCargaPartidos();
      const horarios = horariosCargaPartidos(config.hora, config.vecesPorDia);
      console.log(`  Zona horaria de automatización: ${ZONA_HORARIA_AUTOMATIZACION}`);
      console.log(
        config.activo
          ? `  Carga automática de partidos: ACTIVA (${horarios.join(', ')})`
          : '  Carga automática de partidos: DESACTIVADA',
      );

      // Si el servidor arrancó exactamente dentro de una ranura programada,
      // la revisión puede ejecutarla sin alterar el horario.
      await revisarCargaAutomaticaPartidos();
      await revisarConciliacionDiaria();
    })();
  }, 5_000);

  return () => {
    clearTimeout(arranque);
    timers.forEach((t) => {
      clearInterval(t);
      clearTimeout(t);
    });
  };
}
