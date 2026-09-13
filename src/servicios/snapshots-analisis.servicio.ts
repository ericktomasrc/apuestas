import { randomUUID } from 'node:crypto';
import { pool } from '../infraestructura/db.js';
import { construirTrazabilidadAnalisis } from './trazabilidad-analisis.servicio.js';
import type { FamiliaDatasetEspecializado } from './dataset-especializado.servicio.js';

type Operador = { usuarioId?: string | null; alias?: string | null };

export async function crearSnapshotAnalisis(fixtureId:string, familia:FamiliaDatasetEspecializado, muestra=20, operador:Operador={}) {
  const snapshot = await construirTrazabilidadAnalisis(fixtureId, familia, muestra);
  if (!snapshot) return null;
  const id=randomUUID();
  const v:any=(snapshot as any).versionado ?? {};
  const integridad=String((snapshot as any).integridad?.temporal ?? 'REVISAR');
  await pool.query(`INSERT INTO snapshots_analisis_historico
    (id,fixture_id,familia,muestra,analisis_huella,version_huella,calibracion_huella,integridad_temporal,snapshot,creado_por_usuario_id,creado_por_alias)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,[
      id, fixtureId, familia, muestra, String(v.analisisHuella ?? ''), v.version?.huella ?? null,
      v.calibracionHuella ?? null, integridad, JSON.stringify(snapshot), operador.usuarioId ?? null, operador.alias ?? null,
    ]);
  return { id, fixtureId, familia, muestra, analisisHuella:v.analisisHuella ?? null, integridadTemporal:integridad, creadoEn:new Date().toISOString() };
}

export async function listarSnapshotsAnalisis(filtros:{fixtureId?:string; limite?:number}={}) {
  const limite=Math.max(1,Math.min(100,Number(filtros.limite ?? 30)));
  const vals:any[]=[]; const where:string[]=[];
  if(filtros.fixtureId){ vals.push(filtros.fixtureId); where.push(`fixture_id=$${vals.length}`); }
  vals.push(limite);
  const r=await pool.query(`SELECT id,fixture_id AS "fixtureId",familia,muestra,analisis_huella AS "analisisHuella",
    version_huella AS "versionHuella",calibracion_huella AS "calibracionHuella",integridad_temporal AS "integridadTemporal",
    creado_por_alias AS "creadoPorAlias",creado_en AS "creadoEn"
    FROM snapshots_analisis_historico ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY creado_en DESC LIMIT $${vals.length}`,vals);
  return r.rows;
}

export async function obtenerSnapshotAnalisis(id:string) {
  const r=await pool.query(`SELECT id,fixture_id AS "fixtureId",familia,muestra,analisis_huella AS "analisisHuella",
    version_huella AS "versionHuella",calibracion_huella AS "calibracionHuella",integridad_temporal AS "integridadTemporal",
    snapshot,creado_por_alias AS "creadoPorAlias",creado_en AS "creadoEn" FROM snapshots_analisis_historico WHERE id=$1`,[id]);
  return r.rows[0] ?? null;
}
