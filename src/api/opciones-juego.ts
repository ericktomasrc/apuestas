import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool, enTransaccion } from '../infraestructura/db.js';
import type { Sesion } from './auth.js';

type ConPermiso = (peticion: FastifyRequest, permiso: string) => Promise<Sesion>;

type Fila = {
  id: string; codigo: string; nombre: string; categoria: string; ejemplo: string;
  usa_cantidad: boolean; cantidad_min: number | null; cantidad_max: number | null;
  permite_exactamente: boolean; permite_mas: boolean; permite_menos: boolean;
  mostrar_sala: boolean; mostrar_casa: boolean; activa: boolean;
  fuente_validacion: string; configuracion: unknown;
};

const salida = (r: Fila) => ({
  id:r.id, codigo:r.codigo, nombre:r.nombre, cat:r.categoria, ejemplo:r.ejemplo,
  cantidad:r.usa_cantidad, cantidadMin:r.cantidad_min, cantidadMax:r.cantidad_max,
  exactamente:r.permite_exactamente, mas:r.permite_mas, menos:r.permite_menos,
  sala:r.mostrar_sala, casa:r.mostrar_casa, activa:r.activa,
  fuenteValidacion:r.fuente_validacion, configuracion:r.configuracion,
});

const cuerpo = z.object({
  codigo: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/).optional(),
  nombre: z.string().trim().min(2).max(120),
  categoria: z.string().trim().min(2).max(60),
  ejemplo: z.string().trim().min(2).max(220),
  usaCantidad: z.boolean().default(false),
  cantidadMin: z.number().int().min(0).max(999).nullable().optional(),
  cantidadMax: z.number().int().min(0).max(999).nullable().optional(),
  permiteExactamente: z.boolean().default(true),
  permiteMas: z.boolean().default(true),
  permiteMenos: z.boolean().default(true),
  mostrarSala: z.boolean().default(true),
  mostrarCasa: z.boolean().default(true),
  activa: z.boolean().default(true),
  fuenteValidacion: z.enum(['RESULTADO','EVENTOS','ESTADISTICAS']).default('RESULTADO'),
  configuracion: z.record(z.string(), z.unknown()).default({}),
});

export function registrarRutasOpcionesJuego(app: FastifyInstance, conPermiso: ConPermiso): void {
  // Catálogo de solo lectura para las pantallas de creación. No ejecuta ni liquida jugadas.
  app.get('/reglas-juego', async (peticion) => {
    const q = z.object({ destino:z.enum(['SALA','CASA']).optional(), categoria:z.string().max(60).optional() }).parse(peticion.query);
    const filtros = ['activa = true']; const valores: unknown[] = [];
    if (q.destino === 'SALA') filtros.push('mostrar_sala = true');
    if (q.destino === 'CASA') filtros.push('mostrar_casa = true');
    if (q.categoria) { valores.push(q.categoria); filtros.push(`categoria = $${valores.length}`); }
    const r = await pool.query(`SELECT * FROM reglas_juego WHERE ${filtros.join(' AND ')} ORDER BY orden, nombre`, valores);
    return { reglas:r.rows.map(salida) };
  });

  app.get('/admin/opciones-juego', async (peticion) => {
    await conPermiso(peticion, 'deportes.ver');
    const r = await pool.query('SELECT * FROM reglas_juego ORDER BY orden, nombre');
    return { reglas:r.rows.map(salida) };
  });

  app.post('/admin/opciones-juego', async (peticion, respuesta) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const d = cuerpo.parse(peticion.body);
    const codigo = d.codigo ?? ('REGLA_' + Date.now());
    const id = await enTransaccion(async c => {
      const r = await c.query(`INSERT INTO reglas_juego
        (codigo,nombre,categoria,ejemplo,usa_cantidad,cantidad_min,cantidad_max,permite_exactamente,permite_mas,permite_menos,mostrar_sala,mostrar_casa,activa,fuente_validacion,configuracion,creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16) RETURNING id`,
        [codigo,d.nombre,d.categoria,d.ejemplo,d.usaCantidad,d.usaCantidad?d.cantidadMin??1:null,d.usaCantidad?d.cantidadMax??10:null,d.permiteExactamente,d.permiteMas,d.permiteMenos,d.mostrarSala,d.mostrarCasa,d.activa,d.fuenteValidacion,JSON.stringify(d.configuracion),sesion.usuarioId]);
      return r.rows[0].id as string;
    }, sesion.usuarioId);
    return respuesta.code(201).send({id});
  });

  app.put('/admin/opciones-juego/:id', async (peticion) => {
    const sesion = await conPermiso(peticion, 'deportes.gestionar');
    const {id}=z.object({id:z.string().uuid()}).parse(peticion.params); const d=cuerpo.parse(peticion.body);
    await enTransaccion(async c => {
      await c.query(`UPDATE reglas_juego SET nombre=$2,categoria=$3,ejemplo=$4,usa_cantidad=$5,cantidad_min=$6,cantidad_max=$7,
        permite_exactamente=$8,permite_mas=$9,permite_menos=$10,mostrar_sala=$11,mostrar_casa=$12,activa=$13,fuente_validacion=$14,configuracion=$15::jsonb,actualizado_en=now()
        WHERE id=$1`,[id,d.nombre,d.categoria,d.ejemplo,d.usaCantidad,d.usaCantidad?d.cantidadMin??1:null,d.usaCantidad?d.cantidadMax??10:null,d.permiteExactamente,d.permiteMas,d.permiteMenos,d.mostrarSala,d.mostrarCasa,d.activa,d.fuenteValidacion,JSON.stringify(d.configuracion)]);
    },sesion.usuarioId);
    return {ok:true};
  });
}
