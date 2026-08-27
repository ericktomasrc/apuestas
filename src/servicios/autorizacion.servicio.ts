/**
 * Servicio de AUTORIZACIÓN — roles, permisos y textos.
 *
 * La idea que gobierna este módulo: **los permisos son código, los
 * roles son configuración.**
 *
 * Cada permiso protege un endpoint concreto, así que existe en el
 * código. Pero un rol es solo una combinación de permisos, y esas se
 * crean desde el panel. El día que haga falta un "usuario de soporte
 * que solo ve reportes y anula salas atascadas", se crea marcando
 * casillas — sin desplegar nada.
 */

import { pool, type Cliente } from '../infraestructura/db.js';

export class ErrorPermiso extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPermiso';
  }
}

export interface Permiso {
  clave: string;
  area: string;
  descripcion: string;
}

export interface Rol {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  esSistema: boolean;
  totalPermisos: number;
  totalUsuarios: number;
}

// =====================================================================
//  Permisos de una persona
// =====================================================================

/**
 * Caché corto por usuario.
 *
 * 30 segundos es un compromiso deliberado: se consulta en cada
 * petición, pero si a alguien se le quita un permiso no puede tardar
 * minutos en aplicarse. Al cambiar roles se invalida a mano.
 */
const cache = new Map<string, { permisos: Set<string>; expira: number }>();

export async function permisosDe(
  usuarioId: string,
  cliente?: Cliente,
): Promise<Set<string>> {
  const guardado = cache.get(usuarioId);
  if (guardado && Date.now() < guardado.expira) return guardado.permisos;

  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT permiso FROM v_permisos_usuario WHERE usuario_id = $1`,
    [usuarioId],
  );
  const permisos = new Set<string>(rows.map((r) => r.permiso));
  cache.set(usuarioId, { permisos, expira: Date.now() + 30_000 });
  return permisos;
}

export function invalidarPermisos(usuarioId?: string): void {
  if (usuarioId) cache.delete(usuarioId);
  else cache.clear();
}

export async function tienePermiso(
  usuarioId: string,
  permiso: string,
): Promise<boolean> {
  return (await permisosDe(usuarioId)).has(permiso);
}

export async function exigirPermiso(
  usuarioId: string,
  permiso: string,
): Promise<void> {
  if (!(await tienePermiso(usuarioId, permiso))) {
    throw new ErrorPermiso('SIN_PERMISO', 'No tienes acceso a esta sección.');
  }
}

export async function esAdministrador(usuarioId: string): Promise<boolean> {
  return (await permisosDe(usuarioId)).size > 0;
}

// =====================================================================
//  Catálogo
// =====================================================================

export async function listarPermisos(): Promise<Permiso[]> {
  const { rows } = await pool.query(
    `SELECT clave, area, descripcion FROM v_permisos ORDER BY area, clave`,
  );
  return rows.map((r) => ({
    clave: r.clave,
    area: r.area,
    descripcion: r.descripcion,
  }));
}

export async function listarRoles(): Promise<Rol[]> {
  const { rows } = await pool.query(
    `SELECT * FROM v_roles_detalle ORDER BY es_sistema DESC, nombre`,
  );
  return rows.map((r) => ({
    id: r.id,
    clave: r.clave,
    nombre: r.nombre,
    descripcion: r.descripcion,
    esSistema: r.es_sistema,
    totalPermisos: Number(r.total_permisos),
    totalUsuarios: Number(r.total_usuarios),
  }));
}

export async function permisosDeRol(rolId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT p.clave
       FROM roles_permisos rp
       JOIN permisos p ON p.id = rp.permiso_id AND p.eliminado_en IS NULL
      WHERE rp.rol_id = $1 AND rp.eliminado_en IS NULL
      ORDER BY p.area, p.clave`,
    [rolId],
  );
  return rows.map((r) => r.clave);
}

// =====================================================================
//  Gestión de roles
// =====================================================================

export async function crearRol(
  datos: { clave: string; nombre: string; descripcion?: string; permisos: string[] },
  autorId: string,
): Promise<string> {
  const { enTransaccion } = await import('../infraestructura/db.js');

  return enTransaccion(async (c) => {
    const rol = await c.query(
      `INSERT INTO roles (clave, nombre, descripcion, es_sistema)
       VALUES ($1,$2,$3,FALSE) RETURNING id`,
      [datos.clave.toUpperCase(), datos.nombre, datos.descripcion ?? null],
    );
    await asignarPermisos(c, rol.rows[0].id, datos.permisos);
    return rol.rows[0].id as string;
  }, autorId);
}

async function asignarPermisos(
  c: Cliente,
  rolId: string,
  claves: string[],
): Promise<void> {
  // Borrado lógico de lo que ya no está, alta de lo nuevo. Nunca DELETE:
  // el historial debe poder responder "quién le quitó este permiso".
  await c.query(
    `UPDATE roles_permisos SET eliminado_en = now()
      WHERE rol_id = $1 AND eliminado_en IS NULL`,
    [rolId],
  );

  if (claves.length === 0) return;

  const { rows } = await c.query(
    `SELECT id, clave FROM permisos WHERE clave = ANY($1) AND eliminado_en IS NULL`,
    [claves],
  );
  if (rows.length !== claves.length) {
    const validos = new Set(rows.map((r) => r.clave));
    const malos = claves.filter((k) => !validos.has(k));
    throw new ErrorPermiso(
      'PERMISO_NO_EXISTE',
      `Estos permisos no existen: ${malos.join(', ')}`,
    );
  }

  for (const p of rows) {
    // Si la fila ya existía borrada lógicamente, se reactiva en vez de
    // duplicarla: el índice único parcial lo exige.
    await c.query(
      `INSERT INTO roles_permisos (rol_id, permiso_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [rolId, p.id],
    );
  }
}

export async function actualizarRol(
  rolId: string,
  datos: { nombre?: string; descripcion?: string; permisos?: string[] },
  autorId: string,
): Promise<void> {
  const { enTransaccion } = await import('../infraestructura/db.js');

  await enTransaccion(async (c) => {
    const { rows } = await c.query(
      `SELECT clave, es_sistema FROM v_roles WHERE id = $1`,
      [rolId],
    );
    if (rows.length === 0) {
      throw new ErrorPermiso('ROL_NO_EXISTE', 'Ese rol no existe.');
    }
    // Quitarle permisos a SUPER_ADMIN dejaría el sistema sin nadie
    // capaz de devolvérselos.
    if (rows[0].es_sistema && datos.permisos) {
      throw new ErrorPermiso(
        'ROL_PROTEGIDO',
        'Los permisos del administrador general no se pueden cambiar.',
      );
    }

    if (datos.nombre || datos.descripcion !== undefined) {
      await c.query(
        `UPDATE roles SET nombre = COALESCE($2, nombre),
                          descripcion = COALESCE($3, descripcion)
          WHERE id = $1`,
        [rolId, datos.nombre ?? null, datos.descripcion ?? null],
      );
    }
    if (datos.permisos) await asignarPermisos(c, rolId, datos.permisos);
  }, autorId);

  invalidarPermisos();
}

export async function eliminarRol(rolId: string, autorId: string): Promise<void> {
  const { enTransaccion } = await import('../infraestructura/db.js');

  await enTransaccion(async (c) => {
    const { rows } = await c.query(
      `SELECT es_sistema FROM v_roles WHERE id = $1`,
      [rolId],
    );
    if (rows.length === 0) {
      throw new ErrorPermiso('ROL_NO_EXISTE', 'Ese rol no existe.');
    }
    if (rows[0].es_sistema) {
      throw new ErrorPermiso(
        'ROL_PROTEGIDO',
        'El administrador general no se puede eliminar.',
      );
    }
    const enUso = await c.query(
      `SELECT count(*)::int AS n FROM usuarios_roles
        WHERE rol_id = $1 AND eliminado_en IS NULL`,
      [rolId],
    );
    if (enUso.rows[0].n > 0) {
      throw new ErrorPermiso(
        'ROL_EN_USO',
        `${enUso.rows[0].n} persona(s) tienen este rol. Quítaselo primero.`,
      );
    }
    await c.query(`UPDATE roles SET eliminado_en = now() WHERE id = $1`, [rolId]);
  }, autorId);

  invalidarPermisos();
}

// =====================================================================
//  Roles de una persona
// =====================================================================

export async function rolesDe(usuarioId: string): Promise<Rol[]> {
  const { rows } = await pool.query(
    `SELECT rd.*
       FROM usuarios_roles ur
       JOIN v_roles_detalle rd ON rd.id = ur.rol_id
      WHERE ur.usuario_id = $1 AND ur.eliminado_en IS NULL`,
    [usuarioId],
  );
  return rows.map((r) => ({
    id: r.id,
    clave: r.clave,
    nombre: r.nombre,
    descripcion: r.descripcion,
    esSistema: r.es_sistema,
    totalPermisos: Number(r.total_permisos),
    totalUsuarios: Number(r.total_usuarios),
  }));
}

export async function otorgarRol(
  usuarioId: string,
  rolId: string,
  autorId: string,
): Promise<void> {
  const { enTransaccion } = await import('../infraestructura/db.js');
  await enTransaccion(async (c) => {
    await c.query(
      `INSERT INTO usuarios_roles (usuario_id, rol_id, otorgado_por)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [usuarioId, rolId, autorId],
    );
  }, autorId);
  invalidarPermisos(usuarioId);
}

export async function quitarRol(
  usuarioId: string,
  rolId: string,
  autorId: string,
): Promise<void> {
  const { enTransaccion } = await import('../infraestructura/db.js');

  await enTransaccion(async (c) => {
    const { rows } = await c.query(
      `SELECT es_sistema FROM v_roles WHERE id = $1`,
      [rolId],
    );

    // Quedarse sin ningún administrador general deja el sistema sin
    // nadie capaz de volver a otorgarlo. No hay forma de salir de ahí
    // salvo tocando la base a mano.
    if (rows[0]?.es_sistema) {
      const quedan = await c.query(
        `SELECT count(*)::int AS n FROM usuarios_roles
          WHERE rol_id = $1 AND usuario_id <> $2 AND eliminado_en IS NULL`,
        [rolId, usuarioId],
      );
      if (quedan.rows[0].n === 0) {
        throw new ErrorPermiso(
          'ULTIMO_ADMIN',
          'Es la única persona con acceso total. Nombra a otra antes de quitárselo.',
        );
      }
    }

    await c.query(
      `UPDATE usuarios_roles SET eliminado_en = now()
        WHERE usuario_id = $1 AND rol_id = $2 AND eliminado_en IS NULL`,
      [usuarioId, rolId],
    );
  }, autorId);

  invalidarPermisos(usuarioId);
}

// =====================================================================
//  Textos
// =====================================================================

const cacheTextos = new Map<string, { valor: Map<string, string>; expira: number }>();

export async function textosDe(idioma = 'es'): Promise<Map<string, string>> {
  const guardado = cacheTextos.get(idioma);
  if (guardado && Date.now() < guardado.expira) return guardado.valor;

  const { rows } = await pool.query(
    `SELECT clave, valor FROM v_textos WHERE idioma = $1`,
    [idioma],
  );
  const mapa = new Map<string, string>(rows.map((r) => [r.clave, r.valor]));
  cacheTextos.set(idioma, { valor: mapa, expira: Date.now() + 60_000 });
  return mapa;
}

export function invalidarTextos(): void {
  cacheTextos.clear();
}

/**
 * Busca un texto, con respaldo en español.
 *
 * Si falta la traducción es preferible mostrar el texto en español que
 * dejar la pantalla vacía o, peor, mostrar la clave interna.
 */
export async function texto(
  clave: string,
  idioma = 'es',
  variables: Record<string, string | number> = {},
): Promise<string> {
  let valor = (await textosDe(idioma)).get(clave);
  if (valor === undefined && idioma !== 'es') {
    valor = (await textosDe('es')).get(clave);
  }
  if (valor === undefined) return clave;

  return valor.replace(/\{(\w+)\}/g, (coincidencia, nombre: string) =>
    nombre in variables ? String(variables[nombre]) : coincidencia,
  );
}

export async function guardarTexto(
  clave: string,
  idioma: string,
  valor: string,
  autorId: string,
): Promise<void> {
  const { enTransaccion } = await import('../infraestructura/db.js');
  await enTransaccion(async (c) => {
    await c.query(
      `INSERT INTO textos (clave, idioma, valor) VALUES ($1,$2,$3)
       ON CONFLICT (clave, idioma) WHERE eliminado_en IS NULL
       DO UPDATE SET valor = EXCLUDED.valor`,
      [clave, idioma, valor],
    );
  }, autorId);
  invalidarTextos();
}

export interface TextoParaTraducir {
  clave: string;
  contexto: string | null;
  /** Texto en el idioma pedido. null si todavía no está traducido. */
  valor: string | null;
  /** El original en español, como referencia al traducir. */
  base: string;
  traducido: boolean;
}

/**
 * Todas las claves, con su traducción si existe.
 *
 * Se parte SIEMPRE de la lista en español y se le pega la traducción
 * del idioma pedido. Devolver solo lo ya traducido dejaba un idioma
 * nuevo con la pantalla en blanco: no había desde dónde empezar.
 */
export async function listarTextos(
  idioma = 'es',
): Promise<TextoParaTraducir[]> {
  const { rows } = await pool.query(
    `SELECT b.clave,
            b.contexto,
            t.valor         AS valor,
            b.valor         AS base,
            (t.valor IS NOT NULL) AS traducido
       FROM v_textos b
  LEFT JOIN v_textos t ON t.clave = b.clave AND t.idioma = $1
      WHERE b.idioma = 'es'
      ORDER BY (t.valor IS NOT NULL), b.contexto NULLS LAST, b.clave`,
    [idioma],
  );
  return rows.map((r) => ({
    clave: r.clave,
    contexto: r.contexto,
    valor: r.valor,
    base: r.base,
    traducido: r.traducido,
  }));
}

export async function idiomas(): Promise<{ codigo: string; nombre: string }[]> {
  const { rows } = await pool.query(
    `SELECT codigo, nombre FROM v_idiomas WHERE activo ORDER BY nombre`,
  );
  return rows;
}
