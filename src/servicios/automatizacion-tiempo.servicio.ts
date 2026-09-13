/**
 * Utilidades compartidas por los procesos automáticos.
 *
 * La hora de negocio NO depende de la zona horaria del servidor.
 * Por defecto se usa America/Lima; puede cambiarse con APP_TIMEZONE.
 *
 * Las ranuras automáticas se reservan en PostgreSQL para que un reinicio
 * o una segunda instancia no vuelva a ejecutar la misma ranura.
 */
import { pool } from '../infraestructura/db.js';

export const ZONA_HORARIA_AUTOMATIZACION =
  String(process.env.APP_TIMEZONE ?? process.env.TZ ?? 'America/Lima').trim() || 'America/Lima';

export type RelojNegocio = {
  fecha: string;
  hhmm: string;
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
};

function partesEnZona(fecha: Date, zona = ZONA_HORARIA_AUTOMATIZACION): RelojNegocio {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);

  const valor = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0);

  const anio = valor('year');
  const mes = valor('month');
  const dia = valor('day');
  const hora = valor('hour');
  const minuto = valor('minute');

  return {
    fecha: `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
    hhmm: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
    anio, mes, dia, hora, minuto,
  };
}

export function relojNegocio(fecha = new Date()): RelojNegocio {
  return partesEnZona(fecha);
}

export function claveRanuraAutomatica(hhmm: string, fecha = new Date()): string {
  return `${relojNegocio(fecha).fecha}T${hhmm}`;
}

/**
 * Busca la siguiente hora programada usando el reloj real y la zona de negocio.
 * Se avanza minuto a minuto como máximo 48h: es simple, determinista y evita
 * cálculos frágiles de offsets/DST.
 */
export function siguienteEjecucionEnZona(
  horarios: string[],
  desde = new Date(),
): string | null {
  if (!horarios.length) return null;
  const permitidos = new Set(horarios);
  const cursor = new Date(desde.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  for (let i = 0; i < 48 * 60; i += 1) {
    if (permitidos.has(relojNegocio(cursor).hhmm)) return cursor.toISOString();
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

/**
 * Reserva una ranura exactamente una vez en PostgreSQL.
 * ON CONFLICT protege contra:
 * - dos timers de la misma instancia,
 * - reinicio del servidor dentro del mismo minuto,
 * - múltiples instancias de Node.
 */
export async function reservarRanuraAutomatica(
  proceso: string,
  ranura: string,
): Promise<boolean> {
  const r = await pool.query(
    `INSERT INTO ejecuciones_procesos_automaticos(
       proceso, ranura, estado, iniciado_en, actualizado_en
     )
     VALUES($1,$2,'EJECUTANDO',now(),now())
     ON CONFLICT (proceso, ranura) DO NOTHING
     RETURNING proceso`,
    [proceso, ranura],
  );
  return r.rowCount === 1;
}

export async function finalizarRanuraAutomatica(
  proceso: string,
  ranura: string,
  datos: {
    estado: 'COMPLETADO' | 'ERROR' | 'OMITIDO';
    duracionMs?: number | null;
    error?: string | null;
    detalle?: unknown;
  },
): Promise<void> {
  await pool.query(
    `UPDATE ejecuciones_procesos_automaticos
        SET estado=$3,
            finalizado_en=now(),
            duracion_ms=$4,
            error=$5,
            detalle=$6::jsonb,
            actualizado_en=now()
      WHERE proceso=$1 AND ranura=$2`,
    [
      proceso,
      ranura,
      datos.estado,
      datos.duracionMs ?? null,
      datos.error ?? null,
      datos.detalle == null ? null : JSON.stringify(datos.detalle),
    ],
  );
}
