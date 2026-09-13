-- =====================================================================
-- 028_automatizacion_deportes.sql
-- TandaBet / QuickBet
--
-- Fase 1: configuración persistente de procesos automáticos de Deportes.
--
-- IMPORTANTE:
-- - No elimina ni modifica datos existentes.
-- - No activa procesos por sí sola.
-- - Es idempotente: puede ejecutarse nuevamente sin duplicar claves.
-- - Usa la tabla configuracion ya existente en el proyecto.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- CARGA AUTOMÁTICA DE PARTIDOS
-- ---------------------------------------------------------------------

INSERT INTO configuracion (clave, valor, tipo, descripcion)
VALUES
    (
        'deportes_auto_activo',
        'true',
        'BOOLEAN',
        'Activa o desactiva la sincronización automática de partidos de las ligas seleccionadas en el panel'
    ),
    (
        'deportes_auto_hora',
        '04:00',
        'TEXTO',
        'Hora inicial diaria para la sincronización automática de partidos, en formato HH:MM'
    ),
    (
        'deportes_auto_veces',
        '1',
        'NUMERO',
        'Cantidad de ejecuciones automáticas de carga de partidos por día'
    )
ON CONFLICT (clave) WHERE eliminado_en IS NULL
DO NOTHING;


-- ---------------------------------------------------------------------
-- ACTUALIZACIÓN AUTOMÁTICA DEL HISTÓRICO DEPORTIVO
-- ---------------------------------------------------------------------

INSERT INTO configuracion (clave, valor, tipo, descripcion)
VALUES
    (
        'historico_auto_activo',
        'false',
        'BOOLEAN',
        'Activa o desactiva el mantenimiento automático del histórico deportivo'
    ),
    (
        'historico_auto_hora',
        '05:00',
        'TEXTO',
        'Hora inicial diaria para el mantenimiento automático del histórico, en formato HH:MM'
    ),
    (
        'historico_auto_veces',
        '1',
        'NUMERO',
        'Cantidad de ejecuciones automáticas del mantenimiento histórico por día'
    )
ON CONFLICT (clave) WHERE eliminado_en IS NULL
DO NOTHING;

COMMIT;
