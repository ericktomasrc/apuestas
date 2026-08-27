-- =====================================================================
--  Diagnóstico de descuadre contable
--
--  Se ejecuta cuando `v_conciliacion_global` reporta un descuadre
--  distinto de cero. Cada consulta descarta una hipótesis.
--
--  Correr con:
--    Get-Content sql\diagnostico.sql | docker compose exec -T db psql -U postgres -d apuestas
-- =====================================================================

\echo '=== 1. El descuadre, por moneda ==='
SELECT moneda, entrada_neta, ubicacion_total, descuadre
  FROM v_conciliacion_global
 WHERE descuadre <> 0;

\echo ''
\echo '=== 2. Mercados liquidados que no cuadran ==='
-- Debe estar vacío: cada mercado tiene su propio invariante.
SELECT * FROM v_descuadres;

\echo ''
\echo '=== 3. Retenciones huérfanas ==='
-- Un mercado que entró en `liquidaciones` pero cuyas retenciones nunca
-- recibieron ni PREMIO ni DEVOLUCION. Ese dinero desaparecería.
SELECT m.mercado_id,
       -SUM(m.monto_centavos) FILTER (WHERE m.tipo = 'RETENCION') AS retenido,
       SUM(m.monto_centavos) FILTER (WHERE m.tipo IN ('PREMIO','DEVOLUCION')) AS devuelto,
       SUM(m.monto_centavos) FILTER (WHERE m.tipo = 'LIBERACION') AS liberado
  FROM movimientos m
 WHERE m.mercado_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM liquidaciones l WHERE l.mercado_id = m.mercado_id)
 GROUP BY m.mercado_id
HAVING COALESCE(-SUM(m.monto_centavos) FILTER (WHERE m.tipo = 'RETENCION'), 0)
     <> COALESCE(SUM(m.monto_centavos) FILTER (
          WHERE m.tipo IN ('PREMIO','DEVOLUCION','COMISION','LIBERACION')), 0)
 LIMIT 20;

\echo ''
\echo '=== 4. Usuarios con movimientos en más de una moneda ==='
-- Si el país de alguien cambió después de tener movimientos, sus
-- retenciones y sus devoluciones podrían haber quedado en monedas
-- distintas. Cada una cuadraría a medias.
SELECT m.usuario_id, u.alias, u.pais,
       array_agg(DISTINCT m.moneda) AS monedas,
       count(*)::int AS movimientos
  FROM movimientos m
  JOIN usuarios u ON u.id = m.usuario_id
 GROUP BY m.usuario_id, u.alias, u.pais
HAVING count(DISTINCT m.moneda) > 1
 LIMIT 20;

\echo ''
\echo '=== 5. Salas cuyo país no coincide con el de sus apostadores ==='
SELECT DISTINCT s.id AS sala_id, s.pais AS pais_sala, u.pais AS pais_usuario
  FROM movimientos m
  JOIN salas s    ON s.id = m.sala_id
  JOIN usuarios u ON u.id = m.usuario_id
 WHERE s.pais <> u.pais
 LIMIT 20;

\echo ''
\echo '=== 6. Mercados abiertos con dinero retenido ==='
-- Esto NO es un error: es dinero comprometido esperando resultado.
-- Solo sirve para contrastar la cifra.
SELECT m.moneda,
       -SUM(m.monto_centavos)::bigint AS retenido_abierto,
       count(DISTINCT m.mercado_id)::int AS mercados
  FROM movimientos m
 WHERE m.tipo IN ('RETENCION','LIBERACION')
   AND m.mercado_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM liquidaciones l WHERE l.mercado_id = m.mercado_id)
 GROUP BY m.moneda;

\echo ''
\echo '=== 7. Comisiones sin su mercado ==='
SELECT moneda, SUM(monto_centavos)::bigint AS total, count(*)::int AS movimientos
  FROM movimientos
 WHERE es_casa AND mercado_id IS NULL
 GROUP BY moneda;
