import { createHash } from 'node:crypto';

export const VERSION_MOTOR_ANALISIS = process.env.ANALISIS_VERSION_MOTOR?.trim() || '37.1.0';
export const VERSION_DATASET_ANALISIS = process.env.ANALISIS_VERSION_DATASET?.trim() || '28.1.0';
export const VERSION_REGLAS_ANALISIS = process.env.ANALISIS_VERSION_REGLAS?.trim() || '31.1.0';
export const VERSION_TRAZABILIDAD_ANALISIS = '37.1.0';

function estable(valor: unknown): string {
  if (valor === null || valor === undefined) return String(valor);
  if (typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
  const obj = valor as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${estable(obj[k])}`).join(',')}}`;
}

function huella(valor: unknown): string {
  return createHash('sha256').update(estable(valor)).digest('hex').slice(0, 24);
}

export type VersionAnalisis = {
  motor: string;
  dataset: string;
  reglas: string;
  trazabilidad: string;
  esquema: 'TANDABET_ANALISIS_V1';
  huella: string;
};

export function obtenerVersionAnalisis(): VersionAnalisis {
  const base = {
    motor: VERSION_MOTOR_ANALISIS,
    dataset: VERSION_DATASET_ANALISIS,
    reglas: VERSION_REGLAS_ANALISIS,
    trazabilidad: VERSION_TRAZABILIDAD_ANALISIS,
    esquema: 'TANDABET_ANALISIS_V1' as const,
  };
  return { ...base, huella: huella(base) };
}

export function crearIdentidadAnalisis(parametros: unknown, calibracionHuella?: string | null) {
  const version = obtenerVersionAnalisis();
  const parametrosHuella = huella(parametros ?? {});
  const identidad = {
    versionHuella: version.huella,
    parametrosHuella,
    calibracionHuella: calibracionHuella ?? null,
  };
  return {
    version,
    parametrosHuella,
    calibracionHuella: calibracionHuella ?? null,
    analisisHuella: huella(identidad),
  };
}
