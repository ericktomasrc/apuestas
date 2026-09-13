-- =====================================================================
-- 027_configuracion_analisis_deportivo.sql
-- Persistencia del filtro de ligas de Análisis Deportivo por usuario.
--
-- La selección deja de vivir únicamente en memoria del navegador.
-- Al iniciar sesión desde otro navegador/equipo, el mismo administrador
-- recupera las ligas que dejó aplicadas en Análisis Deportivo.
-- =====================================================================

CREATE TABLE IF NOT EXISTS configuracion_analisis_deportivo (
    usuario_id      UUID PRIMARY KEY
                    REFERENCES usuarios(id) ON DELETE CASCADE,
    liga_api_ids    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE configuracion_analisis_deportivo IS
'Preferencias persistentes de trabajo del módulo Análisis Deportivo por usuario administrador.';

COMMENT ON COLUMN configuracion_analisis_deportivo.liga_api_ids IS
'API IDs de las ligas activas que el usuario dejó aplicadas en el filtro de Análisis Deportivo.';
