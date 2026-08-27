/**
 * Limpieza tras las pruebas.
 *
 * Las suites crean ligas, partidos y salas propios. Antes se quedaban
 * en la base para siempre y aparecían mezclados con el catálogo real
 * del proveedor en el panel.
 *
 * La alternativa —crearlas ocultas— no sirve: el muro y «mis salas»
 * filtran por `v_ligas`, que excluye las ocultas, así que las propias
 * pruebas dejarían de ver sus datos. Y ese filtro es correcto: una
 * liga oculta no debe aparecerle a nadie.
 *
 * Así que se crean visibles y se ocultan al terminar.
 */

import { pool } from '../infraestructura/db.js';

/**
 * Oculta las ligas de prueba y anula lo que colgaba de ellas.
 *
 * Se ocultan en vez de borrarse porque puede haber movimientos
 * apuntando a sus salas, y el libro es la fuente de verdad del dinero:
 * borrar dejaría el libro señalando a la nada.
 *
 * Se reconocen por el identificador: el proveedor usa números del 1 al
 * ~1300, y las pruebas piden por encima de 900.000.000.
 */
export async function limpiarDatosDePrueba(): Promise<void> {
  try {
    await pool.query(
      `UPDATE ligas SET oculta = TRUE
        WHERE eliminado_en IS NULL
          AND NOT oculta
          AND api_id ~ '^\\d+$'
          AND api_id::BIGINT > 500000`,
    );

    // Sus mercados: una liga oculta con mercados seguiría contando
    // como activa y consumiría cuota del proveedor.
    await pool.query(
      `UPDATE mercados_por_liga m SET eliminado_en = now()
         FROM ligas l
        WHERE m.liga_id = l.id AND l.oculta AND m.eliminado_en IS NULL`,
    );

    // Y sus partidos futuros, salvo los que tengan dinero detrás.
    await pool.query(
      `UPDATE partidos p SET eliminado_en = now()
         FROM ligas l
        WHERE p.liga_id = l.id
          AND l.oculta
          AND p.eliminado_en IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM movimientos mo
              JOIN salas s ON s.id = mo.sala_id
             WHERE s.partido_id = p.id)`,
    );
    // Idiomas de prueba y sus traducciones.
    //
    // Se reconocen por el patrón `q0`…`q8`. Sin esto se acumulan en el
    // desplegable de Textos, y sus traducciones hacían fallar la
    // corrida siguiente.
    // Borrado lógico: `textos` e `idiomas` tienen un trigger que
    // bloquea DELETE. En este sistema nada se borra de verdad.
    await pool.query(
      `UPDATE textos SET eliminado_en = now()
        WHERE idioma ~ '^q[0-9]$' AND eliminado_en IS NULL`,
    );
    await pool.query(
      `UPDATE idiomas SET eliminado_en = now()
        WHERE codigo ~ '^q[0-9]$' AND eliminado_en IS NULL`,
    );
  } catch {
    // Una limpieza que falla no debe hacer fallar la suite: las
    // pruebas ya dijeron lo que tenían que decir.
  }
}
