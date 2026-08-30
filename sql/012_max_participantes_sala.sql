BEGIN;

-- Límite configurable de participantes por sala.
-- No se fija en frontend/backend: ambos leen esta clave desde configuracion.
INSERT INTO configuracion (clave, valor, tipo, descripcion)
SELECT
  'max_participantes_sala',
  '10',
  'NUMERO',
  'Máximo de participantes permitidos por sala'
WHERE NOT EXISTS (
  SELECT 1
    FROM configuracion
   WHERE clave = 'max_participantes_sala'
     AND eliminado_en IS NULL
);

-- Si la clave ya existía, se conserva el registro y se asegura el valor pedido.
UPDATE configuracion
   SET valor = '10',
       tipo = 'NUMERO',
       descripcion = 'Máximo de participantes permitidos por sala'
 WHERE clave = 'max_participantes_sala'
   AND eliminado_en IS NULL;

COMMIT;
