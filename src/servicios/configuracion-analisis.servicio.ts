import { pool } from '../infraestructura/db.js';

export interface ConfiguracionFiltroAnalisis {
  ligaApiIds: string[];
  actualizadoEn: string | null;
}

/**
 * Devuelve únicamente ligas que siguen activas en Panel -> Deportes.
 * Así, una liga desactivada nunca reaparece en el filtro aunque hubiera
 * quedado guardada anteriormente para el usuario.
 */
export async function obtenerConfiguracionFiltroAnalisis(
  usuarioId: string,
): Promise<ConfiguracionFiltroAnalisis> {
  const { rows } = await pool.query<{
    liga_api_ids: string[];
    actualizado_en: Date | string;
  }>(
    `SELECT c.liga_api_ids, c.actualizado_en
       FROM configuracion_analisis_deportivo c
      WHERE c.usuario_id = $1`,
    [usuarioId],
  );

  if (!rows.length) {
    return { ligaApiIds: [], actualizadoEn: null };
  }

  const guardadas = [...new Set((rows[0].liga_api_ids ?? []).map(String).filter(Boolean))];
  if (!guardadas.length) {
    return {
      ligaApiIds: [],
      actualizadoEn: new Date(rows[0].actualizado_en).toISOString(),
    };
  }

  const activas = await pool.query<{ api_id: string }>(
    `SELECT api_id
       FROM ligas
      WHERE seleccionada_panel = TRUE
        AND eliminado_en IS NULL
        AND api_id = ANY($1::text[])`,
    [guardadas],
  );

  const validas = new Set(activas.rows.map((x) => String(x.api_id)));
  return {
    ligaApiIds: guardadas.filter((id) => validas.has(id)),
    actualizadoEn: new Date(rows[0].actualizado_en).toISOString(),
  };
}

/**
 * Guarda el filtro aplicado. No acepta como persistentes ligas que ya no
 * estén activas en Panel -> Deportes.
 */
export async function guardarConfiguracionFiltroAnalisis(
  usuarioId: string,
  ligaApiIds: string[],
): Promise<ConfiguracionFiltroAnalisis> {
  const solicitadas = [...new Set(ligaApiIds.map(String).map((x) => x.trim()).filter(Boolean))];

  let validas: string[] = [];
  if (solicitadas.length) {
    const { rows } = await pool.query<{ api_id: string }>(
      `SELECT api_id
         FROM ligas
        WHERE seleccionada_panel = TRUE
          AND eliminado_en IS NULL
          AND api_id = ANY($1::text[])`,
      [solicitadas],
    );
    const permitidas = new Set(rows.map((x) => String(x.api_id)));
    // Conserva el mismo orden que eligió el usuario.
    validas = solicitadas.filter((id) => permitidas.has(id));
  }

  const { rows } = await pool.query<{
    liga_api_ids: string[];
    actualizado_en: Date | string;
  }>(
    `INSERT INTO configuracion_analisis_deportivo
       (usuario_id, liga_api_ids, actualizado_en)
     VALUES ($1, $2::text[], NOW())
     ON CONFLICT (usuario_id)
     DO UPDATE SET
       liga_api_ids = EXCLUDED.liga_api_ids,
       actualizado_en = NOW()
     RETURNING liga_api_ids, actualizado_en`,
    [usuarioId, validas],
  );

  return {
    ligaApiIds: (rows[0]?.liga_api_ids ?? []).map(String),
    actualizadoEn: rows[0]?.actualizado_en
      ? new Date(rows[0].actualizado_en).toISOString()
      : null,
  };
}
