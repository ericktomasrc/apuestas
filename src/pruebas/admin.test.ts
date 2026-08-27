/**
 * Pruebas del PANEL DE ADMINISTRACIÓN.
 *
 * Lo que más importa aquí no es que las funciones anden, sino que
 * **los permisos bloqueen de verdad**. Una ruta administrativa
 * accesible sin permiso es peor que no tenerla.
 *
 * Correr con:  npm run test:admin
 */

import type { FastifyInstance } from 'fastify';
import { crearServidor } from '../api/app.js';
import { pool, cerrar } from '../infraestructura/db.js';
import { CorreoSimulado } from '../infraestructura/proveedores/correo.proveedor.js';
import { invalidarConfigSeguridad } from '../servicios/seguridad.servicio.js';
import { limpiarDatosDePrueba } from './limpieza.js';
import {
  invalidarPermisos,
  permisosDe,
  texto,
  invalidarTextos,
} from '../servicios/autorizacion.servicio.js';

let pasadas = 0;
let fallidas = 0;

async function prueba(nombre: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    pasadas++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallidas++;
    console.log(`  ✗ ${nombre}\n      ${e instanceof Error ? e.message : e}`);
  }
}

function grupo(n: string): void {
  console.log(`\n${n}`);
}

function igual<T>(real: T, esperado: T, ctx = ''): void {
  if (real !== esperado) {
    throw new Error(`${ctx}esperaba ${JSON.stringify(esperado)}, recibió ${JSON.stringify(real)}`);
  }
}

// ---------------------------------------------------------------------

const P = `ad${Date.now().toString(36)}`;

/**
 * Identificador de liga para las pruebas.
 *
 * Numérico y por encima de 900.000.000: el proveedor usa del 1 al
 * ~1300, así que nunca chocan. Y `ligas.api_id` tiene un CHECK que
 * solo admite dígitos —una liga con texto rompe la sincronización de
 * todas las demás—, así que un prefijo con letras ya no sirve.
 */
function ligaApiPrueba(): string {
  return String(900_000_000 + Math.floor(Math.random() * 99_000_000));
}
const SECRETO = 'secreto-de-prueba-con-mas-de-treinta-y-dos-caracteres';
let app: FastifyInstance;
let n = 0;
const correo = new CorreoSimulado();

/** La clave solo existe en el correo: el admin nunca la ve. */
function claveDelCorreo(): string {
  const m = correo.ultimo()?.texto.match(/Contraseña temporal:\s*(\S+)/);
  if (!m) throw new Error('el correo no trae la clave');
  return m[1];
}

interface Cuenta { token: string; id: string; alias: string }

/** Acciones críticas exigen la contraseña de nuevo: un token robado no
 *  puede bastar para repartir permisos o cambiar comisiones. */
const CONFIRMAR = { confirmarPassword: 'contrasena123' };

async function cuenta(): Promise<Cuenta> {
  const i = ++n;
  const r = await app.inject({
    method: 'POST',
    url: '/auth/registro',
    payload: {
      alias: `${P}u${i}`,
      email: `${P}u${i}@t.pe`,
      password: 'contrasena123',
      fechaNacimiento: '1990-05-15',
    },
  });
  const b = r.json();
  return { token: b.token, id: b.usuario.id, alias: b.usuario.alias };
}

async function darRol(usuarioId: string, clave: string): Promise<void> {
  await pool.query(
    `INSERT INTO usuarios_roles (usuario_id, rol_id)
     SELECT $1, id FROM v_roles WHERE clave = $2 ON CONFLICT DO NOTHING`,
    [usuarioId, clave],
  );
  invalidarPermisos(usuarioId);
}

const auth = (t: string): Record<string, string> => ({ authorization: `Bearer ${t}` });

// =====================================================================

async function main(): Promise<void> {
  console.log('Pruebas del PANEL DE ADMINISTRACIÓN\n' + '─'.repeat(56));
  app = await crearServidor({ secreto: SECRETO, correo, limitarPeticiones: false });
  await app.ready();

  // Estas pruebas verifican roles y permisos, no el segundo factor.
  // Con `totp_obligatorio_admin` activo, todas darían 403 antes de
  // llegar a lo que se quiere probar. Que el bloqueo funciona se
  // comprueba en seguridad.test.ts, que es donde corresponde.
  await pool.query(
    `UPDATE configuracion SET valor = 'false' WHERE clave = 'totp_obligatorio_admin'`,
  );
  invalidarConfigSeguridad();

  // -------------------------------------------------------------------
  grupo('Los permisos bloquean de verdad');
  // -------------------------------------------------------------------

  await prueba('un usuario normal no ve nada del panel', async () => {
    const u = await cuenta();
    const yo = await app.inject({ method: 'GET', url: '/admin/yo', headers: auth(u.token) });
    igual(yo.json().esAdministrador, false, 'no es admin: ');
    igual(yo.json().permisos.length, 0, 'sin permisos: ');

    // Y las rutas rechazan, no solo el menú las esconde
    for (const url of ['/admin/usuarios', '/admin/roles', '/admin/paises', '/admin/config']) {
      const r = await app.inject({ method: 'GET', url, headers: auth(u.token) });
      igual(r.statusCode, 403, `${url}: `);
    }
  });

  await prueba('sin token, el panel entero devuelve 401', async () => {
    const r = await app.inject({ method: 'GET', url: '/admin/usuarios' });
    igual(r.statusCode, 401, 'estado: ');
  });

  await prueba('cada rol accede solo a lo suyo', async () => {
    const analista = await cuenta();
    await darRol(analista.id, 'ANALISTA');

    // ANALISTA tiene reportes.ver pero no usuarios.ver
    const reportes = await app.inject({
      method: 'GET', url: '/admin/reportes/resumen', headers: auth(analista.token),
    });
    igual(reportes.statusCode, 200, 'reportes: ');

    const usuarios = await app.inject({
      method: 'GET', url: '/admin/usuarios', headers: auth(analista.token),
    });
    igual(usuarios.statusCode, 403, 'usuarios: ');

    const roles = await app.inject({
      method: 'GET', url: '/admin/roles', headers: auth(analista.token),
    });
    igual(roles.statusCode, 403, 'roles: ');
  });

  await prueba('soporte ve cuentas pero no toca dinero', async () => {
    const soporte = await cuenta();
    await darRol(soporte.id, 'SOPORTE');

    igual(
      (await app.inject({ method: 'GET', url: '/admin/usuarios', headers: auth(soporte.token) })).statusCode,
      200, 'ver usuarios: ');
    igual(
      (await app.inject({ method: 'GET', url: '/admin/planes', headers: auth(soporte.token) })).statusCode,
      403, 'ver comisiones: ');
  });

  await prueba('el administrador general accede a todo', async () => {
    const jefe = await cuenta();
    await darRol(jefe.id, 'SUPER_ADMIN');
    for (const url of ['/admin/usuarios', '/admin/roles', '/admin/paises',
                       '/admin/planes', '/admin/config', '/admin/textos',
                       '/admin/incidentes', '/admin/historial']) {
      const r = await app.inject({ method: 'GET', url, headers: auth(jefe.token) });
      igual(r.statusCode, 200, `${url}: `);
    }
  });

  // -------------------------------------------------------------------
  grupo('Crear roles sin tocar código');
  // -------------------------------------------------------------------

  let jefe: Cuenta;

  await prueba('se crea un rol nuevo combinando permisos', async () => {
    jefe = await cuenta();
    await darRol(jefe.id, 'SUPER_ADMIN');

    const r = await app.inject({
      method: 'POST', url: '/admin/roles', headers: auth(jefe.token),
      payload: {
        clave: `${P.toUpperCase().replace(/[^A-Z]/g, '')}_NOCHE`,
        nombre: 'Soporte nocturno',
        descripcion: 'Atiende fuera de horario',
        permisos: ['usuarios.ver', 'incidentes.ver', 'salas.ver'],
        ...CONFIRMAR,
      },
    });
    igual(r.statusCode, 201, 'estado: ');

    const permisos = await app.inject({
      method: 'GET', url: `/admin/roles/${r.json().id}`, headers: auth(jefe.token),
    });
    igual(permisos.json().permisos.length, 3, 'permisos asignados: ');
    S_rolNuevo = r.json().id;
  });

  await prueba('quien recibe el rol nuevo puede usar sus permisos', async () => {
    const u = await cuenta();
    await app.inject({
      method: 'POST', url: `/admin/usuarios/${u.id}/roles`, headers: auth(jefe.token),
      payload: { rolId: S_rolNuevo, ...CONFIRMAR },
    });
    invalidarPermisos(u.id);

    igual(
      (await app.inject({ method: 'GET', url: '/admin/usuarios', headers: auth(u.token) })).statusCode,
      200, 'lo que sí puede: ');
    igual(
      (await app.inject({ method: 'GET', url: '/admin/planes', headers: auth(u.token) })).statusCode,
      403, 'lo que no puede: ');
  });

  await prueba('un permiso inventado se rechaza', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/roles', headers: auth(jefe.token),
      payload: {
        clave: 'INVENTADO', nombre: 'Prueba',
        permisos: ['usuarios.ver', 'permiso.que.no.existe'],
        ...CONFIRMAR,
      },
    });
    if (r.statusCode < 400) throw new Error('lo aceptó');
  });

  await prueba('quitar un permiso surte efecto de inmediato', async () => {
    const u = await cuenta();
    await app.inject({
      method: 'POST', url: `/admin/usuarios/${u.id}/roles`, headers: auth(jefe.token),
      payload: { rolId: S_rolNuevo, ...CONFIRMAR },
    });
    invalidarPermisos(u.id);
    igual(
      (await app.inject({ method: 'GET', url: '/admin/usuarios', headers: auth(u.token) })).statusCode,
      200, 'antes: ');

    await app.inject({
      method: 'PATCH', url: `/admin/roles/${S_rolNuevo}`, headers: auth(jefe.token),
      payload: { permisos: ['incidentes.ver'], ...CONFIRMAR },
    });
    // La caché de permisos se invalida al cambiar un rol: si tardara
    // minutos en aplicarse, quitarle el acceso a alguien no serviría.
    igual(
      (await app.inject({ method: 'GET', url: '/admin/usuarios', headers: auth(u.token) })).statusCode,
      403, 'después: ');
  });

  // -------------------------------------------------------------------
  grupo('Crear cuentas del equipo desde el panel');
  // -------------------------------------------------------------------

  let cuentaCreada = '';
  let claveCreada = '';

  await prueba('crear una cuenta envía la clave por correo', async () => {
    correo.limpiar();
    const r = await app.inject({
      method: 'POST', url: '/admin/usuarios', headers: auth(jefe.token),
      payload: { alias: `${P}nueva1`, email: `${P}nueva1@t.pe`, pais: 'PE' },
    });
    igual(r.statusCode, 201, 'estado: ');
    igual(r.json().correoEnviado, true, 'correo enviado: ');
    cuentaCreada = r.json().id;
    claveCreada = claveDelCorreo();

    // El admin nunca ve la clave: si pudiera, podría entrar como esa
    // persona y la auditoría dejaría de significar nada.
    if (JSON.stringify(r.json()).includes(claveCreada)) {
      throw new Error('la contraseña viajó en la respuesta');
    }

    const ingreso = await app.inject({
      method: 'POST', url: '/auth/ingreso',
      payload: { email: `${P}nueva1@t.pe`, password: claveCreada },
    });
    igual(ingreso.statusCode, 200, 'puede ingresar: ');
    igual(ingreso.json().passwordTemporal, true, 'marcada como temporal: ');
  });

  await prueba('una cuenta sin roles NO ve el panel', async () => {
    const ingreso = await app.inject({
      method: 'POST', url: '/auth/ingreso',
      payload: { email: `${P}nueva1@t.pe`, password: claveCreada },
    });
    const suToken = ingreso.json().token;

    const yo = await app.inject({ method: 'GET', url: '/admin/yo', headers: auth(suToken) });
    igual(yo.json().esAdministrador, false, 'no es admin: ');
    igual(
      (await app.inject({ method: 'GET', url: '/admin/usuarios', headers: auth(suToken) })).statusCode,
      403, 'no entra: ');
  });

  await prueba('se crea una cuenta ya con su rol', async () => {
    const roles = await app.inject({ method: 'GET', url: '/admin/roles', headers: auth(jefe.token) });
    const soporte = roles.json().roles.find((r: { clave: string }) => r.clave === 'SOPORTE');

    correo.limpiar();
    const r = await app.inject({
      method: 'POST', url: '/admin/usuarios', headers: auth(jefe.token),
      payload: {
        alias: `${P}soporte1`, email: `${P}soporte1@t.pe`, roles: [soporte.id],
        ...CONFIRMAR,
      },
    });
    igual(r.statusCode, 201, 'estado: ');

    // El correo le dice qué va a poder hacer
    if (!correo.ultimo()?.texto.includes('Soporte')) {
      throw new Error('el correo no menciona su rol');
    }

    const ingreso = await app.inject({
      method: 'POST', url: '/auth/ingreso',
      payload: { email: `${P}soporte1@t.pe`, password: claveDelCorreo() },
    });
    const suToken = ingreso.json().token;

    // Entra al panel y ve solo lo suyo
    igual(
      (await app.inject({ method: 'GET', url: '/admin/usuarios', headers: auth(suToken) })).statusCode,
      200, 've usuarios: ');
    igual(
      (await app.inject({ method: 'GET', url: '/admin/planes', headers: auth(suToken) })).statusCode,
      403, 'no ve comisiones: ');
  });

  await prueba('crear cuentas y dar roles son permisos distintos', async () => {
    // Alguien puede poder dar de alta cuentas de soporte sin poder
    // convertirlas en administradores.
    const rolLimitado = await app.inject({
      method: 'POST', url: '/admin/roles', headers: auth(jefe.token),
      payload: {
        clave: `${P.toUpperCase().replace(/[^A-Z]/g, '')}_ALTAS`,
        nombre: 'Solo altas',
        permisos: ['usuarios.ver', 'usuarios.crear'],
        ...CONFIRMAR,
      },
    });
    const reclutador = await cuenta();
    await app.inject({
      method: 'POST', url: `/admin/usuarios/${reclutador.id}/roles`, headers: auth(jefe.token),
      payload: { rolId: rolLimitado.json().id, ...CONFIRMAR },
    });
    invalidarPermisos(reclutador.id);

    // Sin roles: puede
    const sinRoles = await app.inject({
      method: 'POST', url: '/admin/usuarios', headers: auth(reclutador.token),
      payload: { alias: `${P}sinrol`, email: `${P}sinrol@t.pe` },
    });
    igual(sinRoles.statusCode, 201, 'crear sin roles: ');

    // Con roles: no puede
    const roles = await app.inject({ method: 'GET', url: '/admin/roles', headers: auth(jefe.token) });
    const superAdmin = roles.json().roles.find((r: { clave: string }) => r.clave === 'SUPER_ADMIN');
    const conRoles = await app.inject({
      method: 'POST', url: '/admin/usuarios', headers: auth(reclutador.token),
      payload: {
        alias: `${P}conrol`, email: `${P}conrol@t.pe`, roles: [superAdmin.id],
      },
    });
    igual(conRoles.statusCode, 403, 'crear con roles: ');
  });

  await prueba('un alias repetido se rechaza al crear', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/usuarios', headers: auth(jefe.token),
      payload: { alias: `${P}nueva1`, email: `${P}otro@t.pe` },
    });
    igual(r.statusCode, 409, 'estado: ');
  });

  await prueba('una acción sin cuerpo funciona igual', async () => {
    // Fastify rechaza con 400 un POST que se declara JSON y llega
    // vacío. El panel mandaba Content-Type siempre, así que reenviar
    // una invitación fallaba con un error que parecía del servidor.
    const r = await app.inject({
      method: 'POST', url: `/admin/usuarios/${cuentaCreada}/reinvitar`,
      headers: { ...auth(jefe.token), 'content-type': 'application/json' },
    });
    if (r.statusCode >= 400) {
      throw new Error(`falló con ${r.statusCode}: ${r.body.slice(0, 120)}`);
    }
  });

  await prueba('reinvitar genera una clave nueva y anula la anterior', async () => {
    correo.limpiar();
    const r = await app.inject({
      method: 'POST', url: `/admin/usuarios/${cuentaCreada}/reinvitar`,
      headers: auth(jefe.token),
    });
    igual(r.statusCode, 200, 'estado: ');

    const nueva = claveDelCorreo();
    if (nueva === claveCreada) throw new Error('la clave no cambió');

    const vieja = await app.inject({
      method: 'POST', url: '/auth/ingreso',
      payload: { email: `${P}nueva1@t.pe`, password: claveCreada },
    });
    igual(vieja.statusCode, 401, 'clave vieja: ');

    const conNueva = await app.inject({
      method: 'POST', url: '/auth/ingreso',
      payload: { email: `${P}nueva1@t.pe`, password: nueva },
    });
    igual(conNueva.statusCode, 200, 'clave nueva: ');
    claveCreada = nueva;
  });

  await prueba('la contraseña nunca queda en el historial', async () => {
    const { rows } = await pool.query(
      `SELECT datos_despues FROM historial
        WHERE tabla = 'usuarios' AND registro_id = $1
        ORDER BY id DESC LIMIT 1`,
      [cuentaCreada],
    );
    // La auditoría guarda la fila entera, así que el hash aparece.
    // Nunca la contraseña en claro: eso sí sería un problema.
    const texto = JSON.stringify(rows[0]?.datos_despues ?? {});
    if (texto.includes(claveCreada)) {
      throw new Error('la contraseña en claro quedó en el historial');
    }
  });

  // -------------------------------------------------------------------
  grupo('Barreras contra el error humano');
  // -------------------------------------------------------------------

  await prueba('el rol de sistema no se puede modificar', async () => {
    const roles = await app.inject({ method: 'GET', url: '/admin/roles', headers: auth(jefe.token) });
    const superAdmin = roles.json().roles.find((r: { clave: string }) => r.clave === 'SUPER_ADMIN');

    const r = await app.inject({
      method: 'PATCH', url: `/admin/roles/${superAdmin.id}`, headers: auth(jefe.token),
      payload: { permisos: ['usuarios.ver'], ...CONFIRMAR },
    });
    // Quitarle permisos a SUPER_ADMIN dejaría el sistema sin nadie
    // capaz de devolvérselos.
    if (r.statusCode < 400) throw new Error('permitió mutilar el rol de sistema');
  });

  await prueba('el rol de sistema no se puede eliminar', async () => {
    const roles = await app.inject({ method: 'GET', url: '/admin/roles', headers: auth(jefe.token) });
    const superAdmin = roles.json().roles.find((r: { clave: string }) => r.clave === 'SUPER_ADMIN');
    const r = await app.inject({
      method: 'DELETE', url: `/admin/roles/${superAdmin.id}`, headers: auth(jefe.token),
    });
    if (r.statusCode < 400) throw new Error('lo eliminó');
  });

  await prueba('un rol en uso no se puede eliminar', async () => {
    const r = await app.inject({
      method: 'DELETE', url: `/admin/roles/${S_rolNuevo}`, headers: auth(jefe.token),
    });
    if (r.statusCode < 400) throw new Error('eliminó un rol que alguien tiene');
  });

  await prueba('una comisión bajo el piso se rechaza', async () => {
    const planes = await app.inject({ method: 'GET', url: '/admin/planes', headers: auth(jefe.token) });
    const gratis = planes.json().planes.find((p: { codigo: string }) => p.codigo === 'GRATIS');

    const r = await app.inject({
      method: 'PATCH', url: `/admin/planes/${gratis.id}`, headers: auth(jefe.token),
      payload: { tasaComision: 0.01, ...CONFIRMAR },
    });
    // El CHECK de la tabla lo impide igual, pero el 400 da un mensaje
    // útil en vez de un error de base de datos.
    igual(r.statusCode, 400, 'estado: ');
  });

  await prueba('un parámetro numérico no acepta texto', async () => {
    const r = await app.inject({
      method: 'PATCH', url: '/admin/config/minutos_cierre_antes', headers: auth(jefe.token),
      payload: { valor: 'quince' },
    });
    // Sin esta validación, el código haría Number('quince'), obtendría
    // NaN, y usaría el valor por defecto sin avisar a nadie.
    if (r.statusCode < 400) throw new Error('aceptó un valor no numérico');

    const config = await app.inject({ method: 'GET', url: '/admin/config', headers: auth(jefe.token) });
    const p = config.json().config.find((c: { clave: string }) => c.clave === 'minutos_cierre_antes');
    igual(p.valor, '15', 'no se corrompió: ');
  });

  await prueba('no se puede quitar el último acceso total', async () => {
    // Se limpia para dejar a una sola persona con SUPER_ADMIN
    const roles = await app.inject({ method: 'GET', url: '/admin/roles', headers: auth(jefe.token) });
    const superAdmin = roles.json().roles.find((r: { clave: string }) => r.clave === 'SUPER_ADMIN');

    await pool.query(
      `UPDATE usuarios_roles SET eliminado_en = now()
        WHERE rol_id = $1 AND usuario_id <> $2 AND eliminado_en IS NULL`,
      [superAdmin.id, jefe.id],
    );
    invalidarPermisos();

    const r = await app.inject({
      method: 'DELETE',
      url: `/admin/usuarios/${jefe.id}/roles/${superAdmin.id}`,
      headers: auth(jefe.token),
    });
    // Quedarse sin ningún administrador dejaría el sistema sin nadie
    // capaz de volver a otorgarlo. No hay forma de salir de ahí salvo
    // tocando la base a mano.
    if (r.statusCode < 400) throw new Error('se quitó el último acceso total');
    igual(
      (await permisosDe(jefe.id)).size > 0, true, 'conserva sus permisos: ');
  });

  // -------------------------------------------------------------------
  grupo('Catálogo de deportes');
  // -------------------------------------------------------------------

  let ligaCreada = '';
  // El identificador se guarda para poder reintentarlo: la prueba
  // siguiente comprueba que un duplicado se rechace.
  let apiIdLiga = '';

  await prueba('el catálogo trae deportes y mercados disponibles', async () => {
    const r = await app.inject({
      method: 'GET', url: '/admin/deportes', headers: auth(jefe.token),
    });
    igual(r.statusCode, 200, 'estado: ');
    const b = r.json();
    if (!b.mercadosDisponibles?.FUTBOL) throw new Error('faltan los mercados de fútbol');
    // Es una lista cerrada: cada mercado tiene su regla de liquidación.
    igual(b.mercadosDisponibles.FUTBOL.length >= 4, true, 'mercados de fútbol: ');
  });

  await prueba('se agrega una liga', async () => {
    const cat = await app.inject({
      method: 'GET', url: '/admin/deportes', headers: auth(jefe.token),
    });
    const futbol = cat.json().deportes.find((d: { clave: string }) => d.clave === 'FUTBOL');

    // Se guarda para la prueba siguiente, que comprueba que un
    // identificador repetido se rechace. Con uno nuevo no habría
    // duplicado que detectar.
    apiIdLiga = ligaApiPrueba();

    const r = await app.inject({
      method: 'POST', url: '/admin/ligas', headers: auth(jefe.token),
      payload: {
        deporteId: futbol.id, apiId: apiIdLiga,
        nombre: 'Liga de prueba', pais: 'PE',
      },
    });
    igual(r.statusCode, 201, 'estado: ');
    ligaCreada = r.json().id;
  });

  await prueba('una liga con el mismo identificador se rechaza', async () => {
    const cat = await app.inject({
      method: 'GET', url: '/admin/deportes', headers: auth(jefe.token),
    });
    const futbol = cat.json().deportes.find((d: { clave: string }) => d.clave === 'FUTBOL');
    const r = await app.inject({
      method: 'POST', url: '/admin/ligas', headers: auth(jefe.token),
      payload: { deporteId: futbol.id, apiId: apiIdLiga, nombre: 'Otra' },
    });
    if (r.statusCode < 400) throw new Error('aceptó una liga duplicada');
  });

  await prueba('se habilitan mercados en una liga', async () => {
    const r = await app.inject({
      method: 'PUT', url: `/admin/ligas/${ligaCreada}/mercados`, headers: auth(jefe.token),
      payload: { mercados: ['TOTAL_GOLES', 'AMBOS_ANOTAN'], verificado: true },
    });
    igual(r.statusCode, 200, 'estado: ');

    const cat = await app.inject({
      method: 'GET', url: '/admin/deportes', headers: auth(jefe.token),
    });
    const liga = cat.json().ligas.find((l: { id: string }) => l.id === ligaCreada);
    igual(liga.mercados.length, 2, 'mercados habilitados: ');
  });

  await prueba('un mercado que el sistema no sabe liquidar se rechaza', async () => {
    // Habilitar uno sin regla de liquidación dejaría el dinero
    // atrapado hasta que alguien lo anulara a mano.
    const r = await app.inject({
      method: 'PUT', url: `/admin/ligas/${ligaCreada}/mercados`, headers: auth(jefe.token),
      payload: { mercados: ['PRIMER_GOLEADOR'] },
    });
    if (r.statusCode < 400) throw new Error('aceptó un mercado sin regla');
  });

  await prueba('un mercado de otro deporte se rechaza', async () => {
    const r = await app.inject({
      method: 'PUT', url: `/admin/ligas/${ligaCreada}/mercados`, headers: auth(jefe.token),
      payload: { mercados: ['TOTAL_PUNTOS'] },   // es de básquet
    });
    if (r.statusCode < 400) throw new Error('aceptó un mercado de otro deporte');
  });

  // -------------------------------------------------------------------
  grupo('Operación de salas');
  // -------------------------------------------------------------------

  await prueba('se listan las salas con su dinero en juego', async () => {
    const r = await app.inject({
      method: 'GET', url: '/admin/salas?limite=10', headers: auth(jefe.token),
    });
    igual(r.statusCode, 200, 'estado: ');
    for (const s of r.json().salas) {
      if (typeof s.comprometido !== 'number') throw new Error('falta el comprometido');
      if (typeof s.participantes !== 'number') throw new Error('faltan los participantes');
    }
  });

  await prueba('el detalle muestra quién apostó cuánto', async () => {
    const lista = await app.inject({
      method: 'GET', url: '/admin/salas?limite=5', headers: auth(jefe.token),
    });
    const conGente = lista.json().salas.find((s: { participantes: number }) => s.participantes > 0);
    if (!conGente) return;   // sin datos que revisar en esta corrida

    const r = await app.inject({
      method: 'GET', url: `/admin/salas/${conGente.id}`, headers: auth(jefe.token),
    });
    igual(r.statusCode, 200, 'estado: ');
    // Es lo que hace falta para atender un reclamo.
    if (!Array.isArray(r.json().mercados)) throw new Error('faltan los mercados');
    if (!Array.isArray(r.json().movimientos)) throw new Error('faltan los movimientos');
  });

  await prueba('una sala inexistente devuelve 404', async () => {
    const r = await app.inject({
      method: 'GET', url: '/admin/salas/00000000-0000-0000-0000-000000000000',
      headers: auth(jefe.token),
    });
    igual(r.statusCode, 404, 'estado: ');
  });

  await prueba('sin permiso no se ven las salas', async () => {
    const u = await cuenta();
    igual(
      (await app.inject({ method: 'GET', url: '/admin/salas', headers: auth(u.token) })).statusCode,
      403, 'estado: ');
  });

  // -------------------------------------------------------------------
  grupo('Membresías');
  // -------------------------------------------------------------------

  await prueba('vienen los cuatro escalones cargados', async () => {
    const r = await app.inject({ method: 'GET', url: '/admin/planes', headers: auth(jefe.token) });
    const codigos = r.json().planes.map((p: { codigo: string }) => p.codigo);
    for (const c of ['GRATIS', 'BASICO', 'PRO', 'ELITE']) {
      if (!codigos.includes(c)) throw new Error(`falta el plan ${c}`);
    }
  });

  await prueba('solo algunos están a la venta', async () => {
    // Cuatro escalones son muchos para arrancar: conviene lanzar con
    // una sola de pago, medir, y recién entonces abrir las demás.
    const r = await app.inject({ method: 'GET', url: '/admin/planes', headers: auth(jefe.token) });
    const activos = r.json().planes.filter((p: { activo: boolean }) => p.activo);
    if (activos.length === r.json().planes.length) {
      throw new Error('todos están activos: no se puede escalonar el lanzamiento');
    }
  });

  await prueba('se crea una membresía nueva', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/planes', headers: auth(jefe.token),
      payload: {
        codigo: `${P.toUpperCase().replace(/[^A-Z]/g, '')}_VIP`,
        nombre: 'VIP', precioCentavos: 5000, tasaComision: 0.035,
        destacadosIncluidos: true, estadisticasAvanzadas: true,
        ...CONFIRMAR,
      },
    });
    igual(r.statusCode, 201, 'estado: ');
  });

  await prueba('una membresía bajo el 3% se rechaza al crear', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/planes', headers: auth(jefe.token),
      payload: {
        codigo: 'GRATISTOTAL', nombre: 'Sin comisión',
        precioCentavos: 9900, tasaComision: 0,
        ...CONFIRMAR,
      },
    });
    // Un plan sin comisión dejaría el ingreso capado justo en los
    // usuarios de mayor volumen.
    igual(r.statusCode, 400, 'estado: ');
  });

  await prueba('un código repetido se rechaza', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/planes', headers: auth(jefe.token),
      payload: {
        codigo: 'PRO', nombre: 'Otro Pro',
        precioCentavos: 1000, tasaComision: 0.05, ...CONFIRMAR,
      },
    });
    igual(r.statusCode, 409, 'estado: ');
  });

  await prueba('ocultar una membresía no afecta a quien ya la tiene', async () => {
    const planes = await app.inject({ method: 'GET', url: '/admin/planes', headers: auth(jefe.token) });
    const pro = planes.json().planes.find((p: { codigo: string }) => p.codigo === 'PRO');

    // Alguien con el plan
    await pool.query(`UPDATE usuarios SET plan_id = $1 WHERE id = $2`, [pro.id, jefe.id]);

    await app.inject({
      method: 'PATCH', url: `/admin/planes/${pro.id}`, headers: auth(jefe.token),
      payload: { activo: false, ...CONFIRMAR },
    });

    const { rows } = await pool.query(
      `SELECT pl.codigo, pl.tasa_comision FROM v_usuarios u
         JOIN planes pl ON pl.id = u.plan_id WHERE u.id = $1`,
      [jefe.id],
    );
    igual(rows[0].codigo, 'PRO', 'conserva su plan: ');
    igual(Number(rows[0].tasa_comision), 0.04, 'y su comisión: ');

    await app.inject({
      method: 'PATCH', url: `/admin/planes/${pro.id}`, headers: auth(jefe.token),
      payload: { activo: true, ...CONFIRMAR },
    });
  });

  // -------------------------------------------------------------------
  grupo('Configurar un país nuevo, sin código');
  // -------------------------------------------------------------------

  await prueba('se agrega un país con su moneda y formato', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/paises', headers: auth(jefe.token),
      payload: {
        codigo: 'BR', nombre: 'Brasil', moneda: 'BRL', simbolo: 'R$',
        decimales: 2, separadorMiles: '.', separadorDecimal: ',',
        minimoApuesta: 500, maximoApuesta: 50000,
        zonaHoraria: 'America/Sao_Paulo',
      },
    });
    igual([201, 409].includes(r.statusCode), true, 'estado: ');

    const paises = await app.inject({ method: 'GET', url: '/paises' });
    const br = paises.json().paises.find((p: { codigo: string }) => p.codigo === 'BR');
    if (!br) throw new Error('no aparece en el catálogo público');
    igual(br.simbolo, 'R$', 'símbolo: ');
  });

  await prueba('separadores iguales se rechazan', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/paises', headers: auth(jefe.token),
      payload: {
        codigo: 'XZ', nombre: 'Prueba', moneda: 'XXX', simbolo: 'X',
        decimales: 2, separadorMiles: '.', separadorDecimal: '.',
        minimoApuesta: 100, maximoApuesta: 1000, zonaHoraria: 'UTC',
      },
    });
    if (r.statusCode < 400) throw new Error('aceptó separadores iguales');
  });

  await prueba('máximo menor que mínimo se rechaza', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/paises', headers: auth(jefe.token),
      payload: {
        codigo: 'XY', nombre: 'Prueba', moneda: 'YYY', simbolo: 'Y',
        decimales: 2, minimoApuesta: 5000, maximoApuesta: 100,
        zonaHoraria: 'UTC',
      },
    });
    if (r.statusCode < 400) throw new Error('aceptó un máximo menor que el mínimo');
  });

  // -------------------------------------------------------------------
  grupo('Textos: traducir es configurar');
  // -------------------------------------------------------------------

  await prueba('los textos base están cargados', async () => {
    const r = await app.inject({ method: 'GET', url: '/admin/textos', headers: auth(jefe.token) });
    igual(r.statusCode, 200, 'estado: ');
    if (r.json().textos.length < 20) throw new Error('faltan textos');
  });

  await prueba('editar un texto cambia lo que lee el usuario', async () => {
    await app.inject({
      method: 'PUT', url: '/admin/textos/error.SALDO_INSUFICIENTE',
      headers: auth(jefe.token),
      payload: { idioma: 'es', valor: 'Te falta saldo para esta apuesta.' },
    });
    invalidarTextos();
    igual(await texto('error.SALDO_INSUFICIENTE'), 'Te falta saldo para esta apuesta.');

    // se deja como estaba
    await app.inject({
      method: 'PUT', url: '/admin/textos/error.SALDO_INSUFICIENTE',
      headers: auth(jefe.token),
      payload: { idioma: 'es', valor: 'No te alcanza para esta apuesta.' },
    });
    invalidarTextos();
  });

  // Un código distinto en cada corrida.
  //
  // Con uno fijo, la corrida anterior dejaba el idioma creado Y sus
  // traducciones, así que «ninguno traducido todavía» fallaba la
  // segunda vez. Una prueba que solo pasa en base limpia engaña: da
  // verde por accidente.
  //
  // Dos dígitos para que el código quepa en CHAR(2).
  const cod = `q${Math.floor(Math.random() * 9)}`;

  await prueba('un idioma nuevo trae TODAS las claves para traducir', async () => {
    await app.inject({
      method: 'POST', url: '/admin/idiomas', headers: auth(jefe.token),
      payload: { codigo: cod, nombre: 'Idioma de prueba' },
    });

    const base = await app.inject({
      method: 'GET', url: '/admin/textos?idioma=es', headers: auth(jefe.token),
    });
    const nuevo = await app.inject({
      method: 'GET', url: `/admin/textos?idioma=${cod}`, headers: auth(jefe.token),
    });

    // Devolver solo lo ya traducido dejaba la pantalla en blanco: no
    // había desde dónde empezar a traducir.
    igual(nuevo.json().textos.length, base.json().textos.length, 'mismas claves: ');
    igual(nuevo.json().textos.every((x: { traducido: boolean }) => !x.traducido),
          true, 'ninguno traducido todavía: ');
    igual(nuevo.json().textos.every((x: { base: string }) => Boolean(x.base)),
          true, 'todos traen el original de referencia: ');
  });

  await prueba('al traducir uno, el resto sigue pendiente', async () => {
    await app.inject({
      method: 'PUT', url: '/admin/textos/error.CREDENCIALES', headers: auth(jefe.token),
      payload: { idioma: cod, valor: 'Mana allinchu' },
    });
    const r = await app.inject({
      method: 'GET', url: `/admin/textos?idioma=${cod}`, headers: auth(jefe.token),
    });
    const traducidos = r.json().textos.filter((x: { traducido: boolean }) => x.traducido);
    igual(traducidos.length, 1, 'traducidos: ');
    igual(traducidos[0].valor, 'Mana allinchu', 'valor: ');
  });

  await prueba('agregar un idioma es insertar una fila', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/idiomas', headers: auth(jefe.token),
      payload: { codigo: 'pt', nombre: 'Português' },
    });
    igual([201, 409].includes(r.statusCode), true, 'estado: ');
  });

  await prueba('si falta la traducción se usa el español', async () => {
    // Preferible mostrar el texto en español que dejar la pantalla
    // vacía o, peor, mostrar la clave interna.
    invalidarTextos();
    const enPortugues = await texto('error.SALDO_INSUFICIENTE', 'pt');
    igual(enPortugues, 'No te alcanza para esta apuesta.', 'respaldo: ');
  });

  await prueba('las variables se reemplazan', async () => {
    await app.inject({
      method: 'PUT', url: '/admin/textos/sala.falta_lado', headers: auth(jefe.token),
      payload: { idioma: 'es', valor: 'Faltan {monto} {lado}' },
    });
    invalidarTextos();
    igual(
      await texto('sala.falta_lado', 'es', { monto: 'S/20', lado: 'EN CONTRA' }),
      'Faltan S/20 EN CONTRA',
    );
  });

  // -------------------------------------------------------------------
  grupo('Reportes');
  // -------------------------------------------------------------------

  await prueba('el resumen trae las cifras del negocio', async () => {
    const r = await app.inject({
      method: 'GET', url: '/admin/reportes/resumen', headers: auth(jefe.token),
    });
    igual(r.statusCode, 200, 'estado: ');
    const b = r.json();
    igual(typeof b.usuarios, 'number', 'usuarios: ');
    igual(typeof b.tasaAnulacion, 'number', 'tasa de anulación: ');
    if (!Array.isArray(b.porMoneda)) throw new Error('falta el desglose por moneda');
  });

  await prueba('los ingresos vienen separados por moneda', async () => {
    const r = await app.inject({
      method: 'GET', url: '/admin/reportes/ingresos?agrupar=dia', headers: auth(jefe.token),
    });
    igual(r.statusCode, 200, 'estado: ');
    for (const p of r.json().periodos) {
      if (!p.moneda) throw new Error('un período sin moneda: no se pueden sumar');
    }
  });

  // -------------------------------------------------------------------
  grupo('Auditoría');
  // -------------------------------------------------------------------

  await prueba('cada cambio queda registrado con su autor', async () => {
    const antes = await app.inject({
      method: 'GET', url: '/admin/historial?tabla=configuracion', headers: auth(jefe.token),
    });
    const cuantos = antes.json().historial.length;

    await app.inject({
      method: 'PATCH', url: '/admin/config/max_salas_simultaneas',
      headers: auth(jefe.token), payload: { valor: '12' },
    });

    const despues = await app.inject({
      method: 'GET', url: '/admin/historial?tabla=configuracion', headers: auth(jefe.token),
    });
    const registros = despues.json().historial;
    if (registros.length <= cuantos) throw new Error('no registró el cambio');
    igual(registros[0].autor, jefe.alias, 'autor: ');

    await app.inject({
      method: 'PATCH', url: '/admin/config/max_salas_simultaneas',
      headers: auth(jefe.token), payload: { valor: '10' },
    });
  });

  await prueba('el panel se sirve como archivo estático', async () => {
    const r = await app.inject({ method: 'GET', url: '/panel/' });
    igual(r.statusCode, 200, 'estado: ');
    if (!r.body.includes('Panel de')) throw new Error('no es el panel');
  });

  await prueba('todo sigue cuadrando', async () => {
    const { rows } = await pool.query(`SELECT descuadre FROM v_conciliacion_global`);
    for (const f of rows) igual(Number(f.descuadre), 0, 'descuadre: ');
  });

  // -------------------------------------------------------------------
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  ${pasadas} pasadas, ${fallidas} fallidas`);
  console.log(`${'─'.repeat(56)}\n`);

  await pool.query(
    `UPDATE configuracion SET valor = 'true' WHERE clave = 'totp_obligatorio_admin'`,
  );
  invalidarConfigSeguridad();

  await app.close();
  await limpiarDatosDePrueba();
  await cerrar();
  if (fallidas > 0) process.exit(1);
}

let S_rolNuevo = '';

main().catch(async (e) => {
  console.error('\nError fatal:', e);
  await limpiarDatosDePrueba();
  await cerrar();
  process.exit(1);
});
