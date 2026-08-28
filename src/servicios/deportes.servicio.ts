/**
 * Servicio de DEPORTES — sincronización con el proveedor de datos.
 *
 * Especificación funcional v1.4, sección 10.8.
 *
 * Dos servicios distintos, probablemente de dos proveedores distintos:
 *   - fixtures + estadísticas de resultado  (imprescindible, liquida)
 *   - cuotas                                 (opcional, calibra líneas)
 */

import { pool, enTransaccion, type Cliente } from '../infraestructura/db.js';
import type {
  ProveedorDeportes,
  ResultadoExterno,
  CuotaExterna,
} from '../infraestructura/proveedores/deportes.proveedor.js';
import { anularPorMotivo, config } from './salas.servicio.js';

// =====================================================================
//  Sincronización de fixtures
// =====================================================================

export interface ResumenSync {
  nuevos: number;
  actualizados: number;
  reprogramados: number;
  ignorados: number;
  /** Cargados a mano que el proveedor reconoció y ahora sí recibirán
   *  resultado. */
  adoptados: number;
  /** Partidos que fallaron. Antes cortaban la sincronización entera. */
  fallidos: number;
  errores: { apiId: string; partido: string; motivo: string }[];
}

/**
 * Trae los partidos de los próximos N días. Corre 1× al día.
 *
 * Los partidos de ligas que no están en `ligas` se ignoran: no se crean
 * a ciegas. Una liga solo entra al catálogo cuando se verificó que el
 * proveedor entrega para ella los datos que los mercados necesitan
 * (sec. 10.9); habilitar sin comprobar produce anulaciones masivas por
 * DATO_NO_DISPONIBLE.
 */
export async function sincronizarFixtures(
  proveedor: ProveedorDeportes,
  dias = 30,
): Promise<ResumenSync> {
  const desde = new Date();
  const hasta = new Date(Date.now() + dias * 24 * 3600 * 1000);

  const { rows: ligasRows } = await pool.query(
    // Solo las ligas CON MERCADOS HABILITADOS.
    //
    // Cada liga cuesta una petición diaria al proveedor, y el plan
    // gratuito da 100 al día. Sincronizar ligas que nadie puede usar
    // —porque no tienen mercados— gasta cuota en partidos que jamás
    // van a aparecer en el muro.
    //
    // Así se pueden registrar cientos de ligas y activar solo las que
    // se quieren mostrar, desde Panel → Deportes.
    `SELECT l.id, l.api_id, l.deporte_id
       -- La vista ya excluye las ocultas: una liga oculta no debe
       -- consumir cuota del proveedor ni traer partidos que nadie
       -- va a ver.
       FROM v_ligas l
      WHERE EXISTS (SELECT 1 FROM mercados_por_liga m
                     WHERE m.liga_id = l.id AND m.eliminado_en IS NULL)`,
  );

  if (ligasRows.length === 0) {
    // Ninguna liga habilitada todavía. No es un error: es el estado
    // inicial, y avisarlo evita que alguien crea que el proveedor
    // falló.
    return {
      nuevos: 0, actualizados: 0, reprogramados: 0,
      ignorados: 0, adoptados: 0, fallidos: 0,
      errores: [{
        apiId: '—', partido: '—',
        motivo: 'Ninguna liga tiene mercados habilitados. Actívalos en Panel → Deportes.',
      }],
    };
  }
  const porApiId = new Map<string, { id: string; deporteId: string }>(
    ligasRows.map((r) => [r.api_id, { id: r.id, deporteId: r.deporte_id }]),
  );

  // El proveedor pide identificadores numéricos. Una liga creada a
  // mano en el panel puede tener cualquier texto, y una sola así hace
  // que la API rechace la consulta ENTERA con «The League field must
  // contain an integer» — dejando sin partidos también a las válidas.
  const validas = [...porApiId.keys()].filter((k) => /^\d+$/.test(k));
  const invalidas = [...porApiId.keys()].filter((k) => !/^\d+$/.test(k));

  if (invalidas.length > 0) {
    console.warn(
      `  ⚠️  ${invalidas.length} liga(s) con identificador no numérico: ` +
      `${invalidas.join(', ')}\n` +
      '     El proveedor no las reconoce. Quítalas o corrige su api_id.',
    );
  }

  if (validas.length === 0) {
    return {
      nuevos: 0, actualizados: 0, reprogramados: 0, ignorados: invalidas.length,
      adoptados: 0, fallidos: 0,
      errores: [{
        apiId: '—', partido: '—',
        motivo: 'Ninguna liga activa tiene identificador del proveedor. '
          + 'Importa el catálogo con «npm run ligas» y habilita mercados ahí.',
      }],
    };
  }

  // El error del proveedor SE PROPAGA a propósito.
  //
  // `correr()` lo captura y deja un incidente PROCESO_FALLIDO. Si aquí
  // se devolviera un resumen vacío, el scheduler creería que todo fue
  // bien y nadie se enteraría de que el proveedor lleva días caído.
  //
  // Quien lo llama a mano —la ruta del panel— lo traduce a un mensaje
  // legible en vez de un 500.
  let fixtures;
  try {
    fixtures = await proveedor.fixtures(desde, hasta, validas);
  } catch (e) {
    console.error(
      `\n  ✗ El proveedor falló: ${e instanceof Error ? e.message : e}\n`,
    );
    throw e;
  }

  console.log(`  ${fixtures.length} partido(s) del proveedor en ${porApiId.size} liga(s)`);

  const resumen: ResumenSync = {
    nuevos: 0,
    actualizados: 0,
    reprogramados: 0,
    ignorados: 0,
    adoptados: 0,
    fallidos: 0,
    errores: [],
  };

  for (const f of fixtures) {
    const liga = porApiId.get(f.ligaApiId);
    if (!liga) {
      resumen.ignorados++;
      continue;
    }

    // Cada partido va en su propio try: uno que falle no puede cortar
    // la sincronización del día.
    //
    // Antes del índice natural esto no podía pasar. Ahora sí: si
    // alguien cargó a mano un partido que el proveedor también manda,
    // el INSERT choca, la excepción sube y el bucle termina — dejando
    // el catálogo a medias sin que nadie se entere.
    try {
    await enTransaccion(async (c) => {
      const existente = await c.query(
        `SELECT id, inicia_en, inicia_en_original, estado
           FROM v_partidos WHERE api_id = $1`,
        [f.apiId],
      );

      if (existente.rows.length === 0) {
        // ¿Existe ya cargado a mano? Mismos equipos, misma liga,
        // misma hora. Si es así se ADOPTA: se le pone el identificador
        // del proveedor en vez de insertar un duplicado.
        //
        // Eso resuelve solo el problema de fondo: un partido `manual:`
        // nunca recibiría resultado, y sus mercados se anularían a las
        // 72 horas. Al adoptarlo, empieza a recibirlo.
        const aMano = await c.query(
          `SELECT id FROM v_partidos
            WHERE liga_id = $1
              AND lower(trim(equipo_local)) = lower(trim($2))
              AND lower(trim(equipo_visitante)) = lower(trim($3))
              AND inicia_en = $4
              AND api_id LIKE 'manual:%'
            LIMIT 1`,
          [liga.id, f.equipoLocal, f.equipoVisitante, f.iniciaEn],
        );

        if (aMano.rows.length > 0) {
          await c.query(
            `UPDATE partidos SET api_id = $2 WHERE id = $1`,
            [aMano.rows[0].id, f.apiId],
          );
          resumen.adoptados++;
          return;
        }
      }

      if (existente.rows.length === 0) {
        // inicia_en_original se fija UNA vez y no se toca nunca más:
        // es la referencia contra la que se mide la ventana de 48h.
        await c.query(
          `INSERT INTO partidos
             (api_id, deporte_id, liga_id, equipo_local, equipo_visitante,
              logo_local, logo_visitante,
              inicia_en, inicia_en_original, estado)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9)`,
          [
            f.apiId,
            liga.deporteId,
            liga.id,
            f.equipoLocal,
            f.equipoVisitante,
            f.logoLocal ?? null,
            f.logoVisitante ?? null,
            f.iniciaEn,
            f.estado,
          ],
        );
        resumen.nuevos++;
        return;
      }

      const p = existente.rows[0];
      const cambioHora =
        new Date(p.inicia_en).getTime() !== f.iniciaEn.getTime();

      // Los escudos se refrescan también: el proveedor los cambia
      // cuando un club actualiza su imagen, y guardamos la URL
      // justamente para no quedarnos con una vieja.
      await c.query(
        `UPDATE partidos
            SET inicia_en = $2, estado = $3,
                logo_local     = COALESCE($4, logo_local),
                logo_visitante = COALESCE($5, logo_visitante)
          WHERE id = $1`,
        [p.id, f.iniciaEn, f.estado, f.logoLocal ?? null, f.logoVisitante ?? null],
      );

      if (cambioHora) resumen.reprogramados++;
      else resumen.actualizados++;
    });
    } catch (e) {
      // Se cuenta y se sigue. Un partido que falla no puede dejar el
      // catálogo del día a medias.
      const motivo = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ ${f.equipoLocal} vs ${f.equipoVisitante}: ${motivo.slice(0, 100)}`);
      resumen.fallidos++;
      resumen.errores.push({
        apiId: f.apiId,
        partido: `${f.equipoLocal} vs ${f.equipoVisitante}`,
        motivo: motivo.slice(0, 120),
      });
    }
  }

  return resumen;
}

// =====================================================================
//  Actualización de estados y estadísticas
// =====================================================================

export interface ResumenEstados {
  actualizados: number;
  finalizados: number;
  sinDato: number;
  anulados: number;
}

/**
 * Corre cada 5 minutos sobre los partidos que tienen salas vivas.
 *
 * No consulta todos los partidos del catálogo: solo aquellos donde hay
 * dinero esperando. Los demás no urgen y consumen cuota de la API.
 */
export async function actualizarEstados(
  proveedor: ProveedorDeportes,
): Promise<ResumenEstados> {
  const cfg = await config();
  const resumen: ResumenEstados = {
    actualizados: 0,
    finalizados: 0,
    sinDato: 0,
    anulados: 0,
  };

  const { rows } = await pool.query(
    `SELECT DISTINCT p.api_id, p.id, p.inicia_en_original
       FROM v_partidos p
       JOIN v_salas s ON s.partido_id = p.id
      WHERE s.estado IN ('ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO')
        AND p.estado NOT IN ('FINALIZADO','CANCELADO')
        AND p.inicia_en < now() + interval '6 hours'`,
  );
  if (rows.length === 0) return resumen;

  const porApiId = new Map<string, { id: string; original: Date }>(
    rows.map((r) => [r.api_id, { id: r.id, original: r.inicia_en_original }]),
  );

  let resultados: ResultadoExterno[];
  try {
    resultados = await proveedor.resultados([...porApiId.keys()]);
  } catch (e) {
    // El proveedor caído no es motivo para anular nada: se reintenta.
    // Solo se anula cuando el dato no llega tras 72h (sec. 7).
    await registrarIncidente('PROVEEDOR_CAIDO', {
      proveedor: proveedor.nombre,
      error: e instanceof Error ? e.message : String(e),
      partidos: rows.length,
    });
    resumen.sinDato = rows.length;
    return resumen;
  }

  for (const r of resultados) {
    const local = porApiId.get(r.apiId);
    if (!local) continue;

    await enTransaccion(async (c) => {
      await c.query(
        `UPDATE partidos
            SET estado = $2, inicia_en = $3,
                goles_local = COALESCE($4, goles_local),
                goles_visitante = COALESCE($5, goles_visitante),
                corners_local = COALESCE($6, corners_local),
                corners_visitante = COALESCE($7, corners_visitante),
                tarjetas_local = COALESCE($8, tarjetas_local),
                tarjetas_visitante = COALESCE($9, tarjetas_visitante),
                puntos_local = COALESCE($10, puntos_local),
                puntos_visitante = COALESCE($11, puntos_visitante),
                payload_crudo = $12,
                payload_recibido_en = now()
          WHERE id = $1`,
        [
          local.id,
          r.estado,
          r.iniciaEn,
          r.golesLocal ?? null,
          r.golesVisitante ?? null,
          r.cornersLocal ?? null,
          r.cornersVisitante ?? null,
          r.tarjetasLocal ?? null,
          r.tarjetasVisitante ?? null,
          r.puntosLocal ?? null,
          r.puntosVisitante ?? null,
          JSON.stringify(r.payload ?? null),
        ],
      );
    });

    resumen.actualizados++;
    if (r.estado === 'FINALIZADO') resumen.finalizados++;

    // Cancelado o postergado más allá de la ventana: se anula sin
    // esperar a que llegue la hora del partido, para que la gente
    // recupere su dinero cuanto antes.
    if (r.estado === 'CANCELADO') {
      resumen.anulados += await anularSalasDe(local.id, 'PARTIDO_CANCELADO');
    } else if (r.estado === 'POSTERGADO') {
      const horas =
        (r.iniciaEn.getTime() - new Date(local.original).getTime()) / 3_600_000;
      if (horas > cfg.horasVentanaReprogramacion) {
        resumen.anulados += await anularSalasDe(local.id, 'PARTIDO_POSTERGADO');
      }
    }
  }

  resumen.sinDato = rows.length - resultados.length;
  return resumen;
}

async function anularSalasDe(
  partidoId: string,
  motivo: 'PARTIDO_CANCELADO' | 'PARTIDO_POSTERGADO',
): Promise<number> {
  const { rows } = await pool.query(
    `SELECT id FROM v_salas
      WHERE partido_id = $1
        AND estado NOT IN ('LIQUIDADA','ANULADA','EXPIRADA')`,
    [partidoId],
  );
  for (const r of rows) {
    await anularPorMotivo(r.id, motivo);
  }
  return rows.length;
}

// =====================================================================
//  Mercados sin dato: reintento y anulación a las 72h
// =====================================================================

/**
 * Corre cada hora. Los mercados que llevan demasiado tiempo esperando
 * un dato que no llega se anulan y se devuelve el 100%.
 *
 * Es preferible devolver que dejar dinero congelado indefinidamente:
 * el usuario que no recupera su plata escribe a soporte al tercer día.
 */
export async function anularSinDato(horas = 72): Promise<number> {
  const { rows } = await pool.query(
    `SELECT m.id, m.sala_id
       FROM v_mercados m
       JOIN v_salas s    ON s.id = m.sala_id
       JOIN v_partidos p ON p.id = s.partido_id
      WHERE m.estado = 'ESPERANDO_DATO'
        AND p.inicia_en < now() - make_interval(hours => $1)`,
    [horas],
  );

  const { anularMercado } = await import('./../servicios/ledger.servicio.js');
  for (const r of rows) {
    await anularMercado(r.id, r.sala_id, 'DATO_NO_DISPONIBLE');
    await registrarIncidente('DATO_NO_DISPONIBLE', {
      mercadoId: r.id,
      salaId: r.sala_id,
      horasEsperando: horas,
    });
  }
  return rows.length;
}

// =====================================================================
//  Sugerencia de línea
// =====================================================================

/**
 * Elige la línea cuya probabilidad esté más cerca del 50/50.
 *
 * No sirve para liquidar —la cuota aquí siempre es 2.0— sino para que
 * la sala tenga chance real de llenarse: si el anfitrión propone una
 * línea 70/30, nadie va a tomar el lado malo y la sala muere vacía.
 * Es la diferencia entre una sala que corre y una que se anula.
 */
export function sugerirLinea(
  cuotas: CuotaExterna[],
  tipoMercado: string,
): { linea: number; probabilidadFavor: number } | null {
  const candidatas = cuotas.filter((c) => c.tipoMercado === tipoMercado);
  if (candidatas.length === 0) return null;

  let mejor = candidatas[0];
  for (const c of candidatas) {
    if (Math.abs(c.probabilidadFavor - 0.5) < Math.abs(mejor.probabilidadFavor - 0.5)) {
      mejor = c;
    }
  }
  return { linea: mejor.linea, probabilidadFavor: mejor.probabilidadFavor };
}

/** Una línea muy desbalanceada avisa, no bloquea: el anfitrión puede
 *  insistir, pero sabiendo que su sala probablemente no se llene. */
export function lineaEsRiesgosa(probabilidadFavor: number): boolean {
  return Math.abs(probabilidadFavor - 0.5) > 0.15;
}

// =====================================================================
//  Incidentes
// =====================================================================

export async function registrarIncidente(
  tipo: string,
  detalle: Record<string, unknown>,
  severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA' = 'MEDIA',
  cliente?: Cliente,
): Promise<void> {
  const q = cliente ?? pool;
  await q.query(
    `INSERT INTO incidentes (tipo, severidad, detalle) VALUES ($1,$2,$3)`,
    [tipo, severidad, JSON.stringify(detalle)],
  );
}
