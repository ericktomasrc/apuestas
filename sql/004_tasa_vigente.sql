-- =====================================================================
--  Migración 004 — LA TASA VIGENTE, EN UN SOLO SITIO
--
--  La tasa se leía en cinco consultas distintas, y solo la de
--  liquidación comprobaba el vencimiento del plan:
--
--      AND (u.plan_vence_en IS NULL OR u.plan_vence_en > now())
--
--  Las otras cuatro no. Consecuencia: alguien con el plan Pro vencido
--  veía «Comisión 4.0%» en la hoja antes de apostar y al ganar se le
--  cobraba 7%. Es exactamente lo que la pantalla intenta evitar:
--  enterarse del descuento después de ganar.
--
--  La regla ahora vive en una vista. Quien la use no puede olvidarla.
-- =====================================================================

BEGIN;

DROP VIEW IF EXISTS v_tasa_usuario CASCADE;
CREATE VIEW v_tasa_usuario AS
SELECT
    u.id                       AS usuario_id,
    u.alias,
    u.plan_id,
    u.plan_vence_en,
    -- El plan cuenta solo si no ha vencido. Sin plan vigente, la tasa
    -- del plan gratuito; si tampoco existe, el 7% por defecto.
    COALESCE(
        CASE WHEN u.plan_vence_en IS NULL OR u.plan_vence_en > now()
             THEN pl.tasa_comision END,
        (SELECT g.tasa_comision FROM planes g
          WHERE g.codigo = 'GRATIS' AND g.eliminado_en IS NULL),
        0.07
    )::NUMERIC(5,4)            AS tasa_comision,
    -- Qué plan se está aplicando de verdad, para poder mostrarlo.
    CASE WHEN u.plan_vence_en IS NULL OR u.plan_vence_en > now()
         THEN pl.codigo ELSE 'GRATIS' END AS plan_vigente,
    (u.plan_id IS NOT NULL
     AND u.plan_vence_en IS NOT NULL
     AND u.plan_vence_en <= now())        AS plan_vencido
-- Se lee de `usuarios`, NO de `v_usuarios`.
--
-- `v_usuarios` filtra los borrados lógicamente. Si la vista los
-- excluyera, un JOIN interno desde `posiciones` perdería la fila de
-- alguien borrado con apuestas abiertas: los dos lados dejarían de
-- sumar igual, la liquidación lanzaría BALANCE_ROTO, y ese mercado
-- quedaría imposible de resolver con el dinero congelado.
--
-- Hoy ninguna ruta borra usuarios, solo los suspende. Pero el día que
-- alguien agregue «eliminar cuenta», esto es lo que evita que rompa
-- la liquidación.
FROM usuarios u
LEFT JOIN planes pl ON pl.id = u.plan_id AND pl.eliminado_en IS NULL;

COMMENT ON VIEW v_tasa_usuario IS
    'La tasa que se va a cobrar de verdad, con el vencimiento del plan ya aplicado. Usar SIEMPRE esta vista en vez de leer planes directo.';

-- ---------------------------------------------------------------------
-- Comprobación
--
--  Comparar la vista contra una copia de su propia fórmula no prueba
--  nada: si las dos están mal igual, pasa. Se comprueban en cambio las
--  propiedades que tienen que cumplirse pase lo que pase.
-- ---------------------------------------------------------------------
DO $$
DECLARE n INT; v NUMERIC;
BEGIN
    -- 1. Todo usuario activo tiene una tasa. Sin esto, un JOIN contra
    --    la vista perdería filas y alguien no cobraría.
    SELECT count(*) INTO n
      FROM usuarios u
     WHERE NOT EXISTS (SELECT 1 FROM v_tasa_usuario t WHERE t.usuario_id = u.id);
    IF n > 0 THEN
        RAISE EXCEPTION 'Hay % usuarios sin tasa en la vista', n;
    END IF;

    -- 2. Ninguna tasa fuera del rango permitido. El piso del 3% existe
    --    para que ningún plan deje el ingreso en cero justo en quienes
    --    más juegan.
    SELECT count(*) INTO n
      FROM v_tasa_usuario
     WHERE tasa_comision < 0.03 OR tasa_comision > 0.20;
    IF n > 0 THEN
        RAISE EXCEPTION 'Hay % usuarios con tasa fuera del rango 3%%-20%%', n;
    END IF;

    -- 3. Un plan vencido NO puede dar la tasa de ese plan. Es el bug
    --    que esta migración vino a cerrar: se veía 4% y se cobraba 7%.
    SELECT count(*) INTO n
      FROM v_tasa_usuario t
      JOIN usuarios u    ON u.id = t.usuario_id
      JOIN v_planes pl   ON pl.id = u.plan_id
     WHERE u.plan_vence_en IS NOT NULL
       AND u.plan_vence_en <= now()
       AND t.tasa_comision = pl.tasa_comision
       AND pl.codigo <> 'GRATIS';
    IF n > 0 THEN
        RAISE EXCEPTION 'Hay % usuarios con plan vencido cobrando la tasa del plan', n;
    END IF;

    -- 4. Un solo plan GRATIS activo. Con dos, la subconsulta de la
    --    vista devolvería más de una fila y reventaría al consultarla,
    --    no aquí — que es peor.
    SELECT count(*) INTO n FROM v_planes WHERE codigo = 'GRATIS';
    IF n <> 1 THEN
        RAISE EXCEPTION 'Debe haber exactamente 1 plan GRATIS activo, hay %', n;
    END IF;

    -- 5. La vista se puede leer sin explotar.
    SELECT max(tasa_comision) INTO v FROM v_tasa_usuario;
END $$;

COMMIT;
