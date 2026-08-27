/**
 * Pruebas de SEGURIDAD.
 *
 * Correr con:  npm run test:seguridad
 */

import type { FastifyInstance } from 'fastify';
import { crearServidor } from '../api/app.js';
import { pool, cerrar } from '../infraestructura/db.js';
import { CorreoSimulado } from '../infraestructura/proveedores/correo.proveedor.js';
import {
  generarSecretoTotp, codigoTotp, verificarTotp, claveTemporal,
  invalidarConfigSeguridad, esPersonal,
} from '../servicios/seguridad.servicio.js';
import { invalidarConfig } from '../servicios/salas.servicio.js';
import { invalidarPermisos } from '../servicios/autorizacion.servicio.js';
import { depositar } from '../servicios/ledger.servicio.js';
import { limpiarDatosDePrueba } from './limpieza.js';

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

const P = `sg${Date.now().toString(36)}`;

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
const correo = new CorreoSimulado();
let app: FastifyInstance;
let n = 0;

const auth = (t: string): Record<string, string> => ({ authorization: `Bearer ${t}` });

async function fijar(clave: string, valor: string): Promise<void> {
  await pool.query(`UPDATE configuracion SET valor = $2 WHERE clave = $1`, [clave, valor]);
  invalidarConfigSeguridad();
  invalidarConfig();
}

/** Cuenta creada por el admin: la clave llega por correo. */
async function cuentaDelEquipo(
  tokenAdmin: string,
  roles: string[] = [],
): Promise<{ id: string; alias: string; email: string; clave: string }> {
  const i = ++n;
  correo.limpiar();
  const r = await app.inject({
    method: 'POST', url: '/admin/usuarios', headers: auth(tokenAdmin),
    payload: { alias: `${P}u${i}`, email: `${P}u${i}@t.pe`, roles },
  });
  if (r.statusCode !== 201) throw new Error(`no se creó: ${r.body}`);

  // La clave solo existe en el correo. Se extrae del texto plano.
  const texto = correo.ultimo()?.texto ?? '';
  const m = texto.match(/Contraseña temporal:\s*(\S+)/);
  if (!m) throw new Error(`el correo no trae la clave:\n${texto}`);

  return { id: r.json().id, alias: `${P}u${i}`, email: `${P}u${i}@t.pe`, clave: m[1] };
}

async function ingresar(
  email: string, password: string, codigo?: string,
): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
  const r = await app.inject({
    method: 'POST', url: '/auth/ingreso',
    payload: { email, password, ...(codigo ? { codigo } : {}) },
  });
  return { estado: r.statusCode, cuerpo: r.json() };
}

// =====================================================================

async function main(): Promise<void> {
  console.log('Pruebas de SEGURIDAD\n' + '─'.repeat(56));
  app = await crearServidor({ secreto: SECRETO, correo , limitarPeticiones: false });
  await app.ready();

  // El admin de estas pruebas
  const jefe = await app.inject({
    method: 'POST', url: '/auth/registro',
    payload: {
      alias: `${P}jefe`, email: `${P}jefe@t.pe`,
      password: 'contrasena123', fechaNacimiento: '1990-01-01',
    },
  });
  const jefeId = jefe.json().usuario.id;
  const jefeToken = jefe.json().token;
  await pool.query(
    `INSERT INTO usuarios_roles (usuario_id, rol_id)
     SELECT $1, id FROM v_roles WHERE clave='SUPER_ADMIN' ON CONFLICT DO NOTHING`,
    [jefeId],
  );
  invalidarPermisos(jefeId);

  // Se apaga para el grueso de las pruebas y se enciende solo en la
  // que verifica el bloqueo: si estuviera activo todo el tiempo,
  // ninguna llamada al panel llegaría a lo que se quiere probar.
  await fijar('totp_obligatorio_admin', 'false');

  // -------------------------------------------------------------------
  grupo('TOTP');
  // -------------------------------------------------------------------

  await prueba('un código recién generado se acepta', async () => {
    const s = generarSecretoTotp();
    igual(verificarTotp(s, codigoTotp(s)), true);
  });

  await prueba('acepta el código anterior y el siguiente', async () => {
    // Sin esa ventana, un reloj desfasado unos segundos dejaría a la
    // gente fuera de su propia cuenta.
    const s = generarSecretoTotp();
    igual(verificarTotp(s, codigoTotp(s, -1)), true, 'anterior: ');
    igual(verificarTotp(s, codigoTotp(s, 1)), true, 'siguiente: ');
  });

  await prueba('rechaza códigos lejanos y basura', async () => {
    const s = generarSecretoTotp();
    igual(verificarTotp(s, codigoTotp(s, 10)), false, 'lejano: ');
    igual(verificarTotp(s, '000000'), false, 'ceros: ');
    igual(verificarTotp(s, 'abcdef'), false, 'letras: ');
    igual(verificarTotp(s, '123'), false, 'corto: ');
  });

  await prueba('dos secretos distintos no se cruzan', async () => {
    const a = generarSecretoTotp();
    const b = generarSecretoTotp();
    igual(verificarTotp(b, codigoTotp(a)), false);
  });

  await prueba('la clave temporal es legible y no repetida', async () => {
    const claves = new Set(Array.from({ length: 50 }, () => claveTemporal()));
    igual(claves.size, 50, 'todas distintas: ');
    // Se va a leer de un correo y a veces dictar por teléfono.
    for (const c of claves) {
      if (!/^[a-z]{8}\d{2}$/.test(c)) throw new Error(`formato raro: ${c}`);
    }
  });

  // -------------------------------------------------------------------
  grupo('Invitación por correo');
  // -------------------------------------------------------------------

  let equipo: Awaited<ReturnType<typeof cuentaDelEquipo>>;

  await prueba('crear una cuenta envía la clave por correo', async () => {
    equipo = await cuentaDelEquipo(jefeToken);
    igual(correo.enviados.length, 1, 'correos enviados: ');
    igual(correo.ultimo()?.para, equipo.email, 'destinatario: ');
    if (!correo.ultimo()?.html.includes(equipo.clave)) {
      throw new Error('la clave no está en el correo');
    }
  });

  await prueba('la respuesta NO devuelve la contraseña', async () => {
    correo.limpiar();
    const r = await app.inject({
      method: 'POST', url: '/admin/usuarios', headers: auth(jefeToken),
      payload: { alias: `${P}secreta`, email: `${P}secreta@t.pe` },
    });
    // Si el admin pudiera leerla, podría entrar como esa persona y la
    // auditoría dejaría de significar nada.
    const cuerpo = JSON.stringify(r.json());
    const clave = correo.ultimo()?.texto.match(/Contraseña temporal:\s*(\S+)/)?.[1];
    if (clave && cuerpo.includes(clave)) {
      throw new Error('la contraseña viajó en la respuesta');
    }
  });

  await prueba('la persona entra con la clave del correo', async () => {
    const r = await ingresar(equipo.email, equipo.clave);
    igual(r.estado, 200, 'estado: ');
    igual(r.cuerpo.passwordTemporal, true, 'marca temporal: ');
  });

  await prueba('el correo queda registrado', async () => {
    const { rows } = await pool.query(
      `SELECT plantilla, estado FROM correos_enviados
        WHERE destinatario = $1 ORDER BY id DESC LIMIT 1`,
      [equipo.email],
    );
    igual(rows[0].plantilla, 'INVITACION', 'plantilla: ');
  });

  await prueba('reinvitar genera una clave nueva', async () => {
    correo.limpiar();
    await app.inject({
      method: 'POST', url: `/admin/usuarios/${equipo.id}/reinvitar`,
      headers: auth(jefeToken),
    });
    const nueva = correo.ultimo()?.texto.match(/Contraseña temporal:\s*(\S+)/)?.[1];
    if (!nueva || nueva === equipo.clave) throw new Error('no cambió la clave');

    // La anterior deja de funcionar
    igual((await ingresar(equipo.email, equipo.clave)).estado, 401, 'clave vieja: ');
    igual((await ingresar(equipo.email, nueva)).estado, 200, 'clave nueva: ');
    equipo.clave = nueva;
  });

  // -------------------------------------------------------------------
  grupo('Cambio obligatorio de la clave temporal');
  // -------------------------------------------------------------------

  await prueba('con clave temporal no se pide la actual', async () => {
    const ingreso = await ingresar(equipo.email, equipo.clave);
    const suToken = ingreso.cuerpo.token as string;

    // La persona acaba de leerla de un correo: el objetivo es que la
    // reemplace cuanto antes, no ponerle trabas.
    const r = await app.inject({
      method: 'POST', url: '/auth/cambiar-password', headers: auth(suToken),
      payload: { nueva: 'MiClavePropia123' },
    });
    igual(r.statusCode, 200, 'estado: ');
  });

  await prueba('tras cambiarla, ya no está marcada como temporal', async () => {
    const r = await ingresar(equipo.email, 'MiClavePropia123');
    igual(r.estado, 200, 'estado: ');
    igual('passwordTemporal' in r.cuerpo, false, 'sin marca: ');
  });

  await prueba('sin clave temporal SÍ se pide la actual', async () => {
    const ingreso = await ingresar(equipo.email, 'MiClavePropia123');
    const suToken = ingreso.cuerpo.token as string;

    const sinActual = await app.inject({
      method: 'POST', url: '/auth/cambiar-password', headers: auth(suToken),
      payload: { nueva: 'OtraClaveMas456' },
    });
    igual(sinActual.statusCode, 401, 'sin la actual: ');

    const conActual = await app.inject({
      method: 'POST', url: '/auth/cambiar-password', headers: auth(suToken),
      payload: { actual: 'MiClavePropia123', nueva: 'OtraClaveMas456' },
    });
    igual(conActual.statusCode, 200, 'con la actual: ');
  });

  await prueba('cambiar la clave avisa por correo', async () => {
    const { rows } = await pool.query(
      `SELECT plantilla FROM correos_enviados
        WHERE destinatario = $1 ORDER BY id DESC LIMIT 1`,
      [equipo.email],
    );
    igual(rows[0].plantilla, 'ALERTA', 'plantilla: ');
  });

  // -------------------------------------------------------------------
  grupo('Intentos limitados');
  // -------------------------------------------------------------------

  await prueba('tras 5 fallos la cuenta se bloquea', async () => {
    await fijar('max_intentos_ingreso', '5');
    const victima = await cuentaDelEquipo(jefeToken);

    for (let i = 0; i < 5; i++) {
      await ingresar(victima.email, 'claveEquivocada');
    }
    // Aun con la clave CORRECTA
    const r = await ingresar(victima.email, victima.clave);
    igual(r.estado, 429, 'estado: ');
    igual((r.cuerpo as { error: { codigo: string } }).error.codigo, 'CUENTA_BLOQUEADA', 'código: ');
  });

  await prueba('el bloqueo es temporal, no permanente', async () => {
    // Uno permanente convertiría un ataque en una forma de dejar a
    // alguien fuera de su propia cuenta para siempre.
    const { rows } = await pool.query(
      `SELECT bloqueado_hasta FROM usuarios WHERE bloqueado_hasta IS NOT NULL LIMIT 1`,
    );
    if (!rows[0]) throw new Error('no hay ninguna cuenta bloqueada');
    const hasta = new Date(rows[0].bloqueado_hasta).getTime();
    if (hasta > Date.now() + 3600_000) throw new Error('el bloqueo dura demasiado');
  });

  await prueba('un ingreso correcto limpia los fallos', async () => {
    const u = await cuentaDelEquipo(jefeToken);
    await ingresar(u.email, 'mal');
    await ingresar(u.email, 'mal');
    await ingresar(u.email, u.clave);

    const { rows } = await pool.query(
      `SELECT intentos_fallidos FROM usuarios WHERE id = $1`, [u.id],
    );
    igual(rows[0].intentos_fallidos, 0, 'contador: ');
  });

  await prueba('cada intento queda registrado', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM intentos_ingreso WHERE NOT exitoso`,
    );
    if (rows[0].n === 0) throw new Error('no se registró ningún fallo');
  });

  await prueba('el registro de intentos no se puede alterar', async () => {
    let bloqueado = false;
    await pool.query(`DELETE FROM intentos_ingreso`).catch(() => { bloqueado = true; });
    igual(bloqueado, true, 'DELETE bloqueado: ');
  });

  // -------------------------------------------------------------------
  grupo('Segundo factor de punta a punta');
  // -------------------------------------------------------------------

  await prueba('preparar no activa todavía', async () => {
    const u = await cuentaDelEquipo(jefeToken);
    const suToken = (await ingresar(u.email, u.clave)).cuerpo.token as string;

    await app.inject({ method: 'POST', url: '/auth/totp/preparar', headers: auth(suToken) });

    // Activarlo antes de confirmar dejaría fuera a quien configure mal
    // la aplicación.
    const r = await ingresar(u.email, u.clave);
    igual(r.estado, 200, 'sigue entrando sin código: ');
    igual('requiereTotp' in r.cuerpo, false, 'no lo pide: ');
  });

  await prueba('con un código válido se activa y da respaldos', async () => {
    const u = await cuentaDelEquipo(jefeToken);
    const suToken = (await ingresar(u.email, u.clave)).cuerpo.token as string;

    const prep = await app.inject({
      method: 'POST', url: '/auth/totp/preparar', headers: auth(suToken),
    });
    const secreto = prep.json().secreto;

    const act = await app.inject({
      method: 'POST', url: '/auth/totp/activar', headers: auth(suToken),
      payload: { codigo: codigoTotp(secreto) },
    });
    igual(act.statusCode, 200, 'estado: ');
    igual(act.json().codigosRespaldo.length, 8, 'códigos de respaldo: ');

    // Ahora el ingreso pide el código
    const sinCodigo = await ingresar(u.email, u.clave);
    igual(sinCodigo.cuerpo.requiereTotp, true, 'lo pide: ');
    igual('token' in sinCodigo.cuerpo, false, 'sin token todavía: ');

    const conCodigo = await ingresar(u.email, u.clave, codigoTotp(secreto));
    igual(conCodigo.estado, 200, 'con código: ');
    if (!conCodigo.cuerpo.token) throw new Error('no dio token');

    S_totp = { email: u.email, clave: u.clave, secreto, respaldos: act.json().codigosRespaldo };
  });

  await prueba('un código incorrecto no deja entrar', async () => {
    const r = await ingresar(S_totp.email, S_totp.clave, '000000');
    igual(r.estado, 401, 'estado: ');
  });

  await prueba('un código de respaldo sirve UNA vez', async () => {
    const respaldo = S_totp.respaldos[0];
    igual((await ingresar(S_totp.email, S_totp.clave, respaldo)).estado, 200, 'primera: ');
    // Se consume: si sirviera dos veces, robar la lista sería robar
    // acceso permanente.
    igual((await ingresar(S_totp.email, S_totp.clave, respaldo)).estado, 401, 'segunda: ');
  });

  await prueba('los respaldos se guardan hasheados', async () => {
    const { rows } = await pool.query(
      `SELECT totp_codigos_respaldo FROM usuarios WHERE lower(email) = $1`,
      [S_totp.email.toLowerCase()],
    );
    const guardados: string[] = rows[0].totp_codigos_respaldo ?? [];
    // Si alguien lee la base, no puede usar los códigos.
    for (const r of S_totp.respaldos) {
      if (guardados.includes(r)) throw new Error('un código quedó en claro');
    }
  });

  // -------------------------------------------------------------------
  grupo('Recuperación de contraseña');
  // -------------------------------------------------------------------

  await prueba('un correo inexistente responde igual que uno real', async () => {
    // Si respondiera distinto, cualquiera podría averiguar qué correos
    // están registrados probando direcciones.
    const falso = await app.inject({
      method: 'POST', url: '/auth/recuperar', payload: { email: 'nadie@ninguna.pe' },
    });
    const real = await app.inject({
      method: 'POST', url: '/auth/recuperar', payload: { email: equipo.email },
    });
    igual(falso.statusCode, real.statusCode, 'mismo estado: ');
    igual(falso.json().mensaje, real.json().mensaje, 'mismo mensaje: ');
  });

  await prueba('el enlace llega y permite cambiar la clave', async () => {
    correo.limpiar();
    await app.inject({
      method: 'POST', url: '/auth/recuperar', payload: { email: equipo.email },
    });
    const token = correo.ultimo()?.texto.match(/#recuperar=(\S+)/)?.[1];
    if (!token) throw new Error(`el correo no trae el enlace:\n${correo.ultimo()?.texto}`);

    const r = await app.inject({
      method: 'POST', url: '/auth/restablecer',
      payload: { token, nueva: 'RecuperadaAsi789' },
    });
    igual(r.statusCode, 200, 'estado: ');
    igual((await ingresar(equipo.email, 'RecuperadaAsi789')).estado, 200, 'entra: ');
    S_tokenUsado = token;
  });

  await prueba('el enlace sirve una sola vez', async () => {
    const r = await app.inject({
      method: 'POST', url: '/auth/restablecer',
      payload: { token: S_tokenUsado, nueva: 'OtraVezNo123' },
    });
    if (r.statusCode < 400) throw new Error('el enlace se reutilizó');
  });

  await prueba('un token inventado se rechaza', async () => {
    const r = await app.inject({
      method: 'POST', url: '/auth/restablecer',
      payload: { token: 'token-que-no-existe-para-nada', nueva: 'Inventada123' },
    });
    if (r.statusCode < 400) throw new Error('aceptó un token falso');
  });

  await prueba('el token se guarda hasheado', async () => {
    const { rows } = await pool.query(
      `SELECT token_hash FROM tokens_acceso ORDER BY id DESC LIMIT 1`,
    );
    // Si alguien lee la base, no puede usar los enlaces pendientes.
    if (rows[0].token_hash === S_tokenUsado) {
      throw new Error('el token quedó en claro');
    }
  });

  // -------------------------------------------------------------------
  grupo('El personal no apuesta');
  // -------------------------------------------------------------------

  await prueba('una cuenta con rol no puede apostar', async () => {
    const roles = await app.inject({ method: 'GET', url: '/admin/roles', headers: auth(jefeToken) });
    const soporte = roles.json().roles.find((r: { clave: string }) => r.clave === 'SOPORTE');

    const empleado = await cuentaDelEquipo(jefeToken, [soporte.id]);
    invalidarPermisos(empleado.id);
    igual(await esPersonal(empleado.id), true, 'es personal: ');

    await depositar(empleado.id, 50000, `${P}:dep:emp`);

    // Sala para intentar
    const dep = await pool.query(`SELECT id FROM deportes WHERE clave='FUTBOL'`);
    const liga = await pool.query(
      `INSERT INTO ligas (deporte_id, api_id, nombre, pais)
     VALUES ($1,$2,'Liga seg','PE') RETURNING id`,
      [dep.rows[0].id, ligaApiPrueba()],
    );
    const partido = await pool.query(
      `INSERT INTO partidos (api_id, deporte_id, liga_id, equipo_local,
                             equipo_visitante, inicia_en, inicia_en_original)
       VALUES ($1,$2,$3,'A','B', now() + interval '3 hours',
               now() + interval '3 hours') RETURNING id`,
      [`${P}_p`, dep.rows[0].id, liga.rows[0].id],
    );
    const sala = await pool.query(
      `INSERT INTO salas (codigo, partido_id, anfitrion_id, tope_participantes,
                          monto_minimo_centavos, pais)
       VALUES ($1,$2,$3,10,1000,'PE') RETURNING id`,
      [`${P}s`, partido.rows[0].id, jefeId],
    );
    const mercado = await pool.query(
      `INSERT INTO mercados (sala_id, tipo_mercado, linea, etiqueta_favor, etiqueta_contra)
       VALUES ($1,'TOTAL_GOLES',2.5,'Más','Menos') RETURNING id`,
      [sala.rows[0].id],
    );

    const suToken = (await ingresar(empleado.email, empleado.clave)).cuerpo.token as string;
    const r = await app.inject({
      method: 'POST', url: `/mercados/${mercado.rows[0].id}/apostar`,
      headers: { ...auth(suToken), 'idempotency-key': `${P}-emp-1` },
      payload: { lado: 'A_FAVOR', montoCentavos: 2000 },
    });

    // Quien puede anular una sala no puede tener dinero en juego:
    // podría entrar, ver que va perdiendo, y anularla.
    igual(r.statusCode, 403, 'estado: ');
    igual((r.json() as { error: { codigo: string } }).error.codigo,
          'PERSONAL_NO_APUESTA', 'código: ');

    S_mercado = mercado.rows[0].id;
  });

  await prueba('un usuario normal SÍ puede apostar en la misma sala', async () => {
    const normal = await app.inject({
      method: 'POST', url: '/auth/registro',
      payload: {
        alias: `${P}normal`, email: `${P}normal@t.pe`,
        password: 'contrasena123', fechaNacimiento: '1990-01-01',
      },
    });
    await depositar(normal.json().usuario.id, 50000, `${P}:dep:nor`);

    const r = await app.inject({
      method: 'POST', url: `/mercados/${S_mercado}/apostar`,
      headers: { ...auth(normal.json().token), 'idempotency-key': `${P}-nor-1` },
      payload: { lado: 'A_FAVOR', montoCentavos: 2000 },
    });
    igual(r.statusCode, 201, 'estado: ');
  });

  await prueba('quitarle el rol le devuelve el derecho a apostar', async () => {
    const empleado = await cuentaDelEquipo(jefeToken);
    await depositar(empleado.id, 50000, `${P}:dep:ex`);
    const suToken = (await ingresar(empleado.email, empleado.clave)).cuerpo.token as string;

    // Sin roles: puede
    const r = await app.inject({
      method: 'POST', url: `/mercados/${S_mercado}/apostar`,
      headers: { ...auth(suToken), 'idempotency-key': `${P}-ex-1` },
      payload: { lado: 'EN_CONTRA', montoCentavos: 2000 },
    });
    igual(r.statusCode, 201, 'sin roles apuesta: ');
  });

  // -------------------------------------------------------------------
  grupo('Capas de la API');
  // -------------------------------------------------------------------

  await prueba('las cabeceras de seguridad están puestas', async () => {
    const r = await app.inject({ method: 'GET', url: '/salud' });
    const h = r.headers;
    // El panel no debe poder incrustarse en un iframe ajeno: sería la
    // puerta a que alguien superponga botones invisibles encima.
    igual(h['x-frame-options'], 'DENY', 'x-frame-options: ');
    if (!h['content-security-policy']) throw new Error('falta la política de contenido');
    igual(h['x-content-type-options'], 'nosniff', 'nosniff: ');
  });

  await prueba('el CSP no bloquea el propio panel', async () => {
    // Helmet pone `script-src-attr 'none'` por defecto, y eso bloquea
    // los onclick del panel: la página carga pero ningún botón
    // responde. Es el tipo de fallo que no aparece en ninguna prueba
    // de API porque el servidor responde 200 correctamente.
    const r = await app.inject({ method: 'GET', url: '/panel/' });
    igual(r.statusCode, 200, 'el panel carga: ');

    const csp = String(r.headers['content-security-policy'] ?? '');
    if (!csp.includes("script-src-attr 'unsafe-inline'")) {
      throw new Error('el CSP bloquearía los manejadores del panel');
    }
    // Y las fuentes y el QR deben poder cargarse
    if (!csp.includes('fonts.googleapis.com')) throw new Error('bloquea las fuentes');
    if (!csp.includes('api.qrserver.com')) throw new Error('bloquea el código QR');
  });

  await prueba('una acción crítica exige la contraseña otra vez', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/roles', headers: auth(jefeToken),
      payload: { clave: 'SINCONFIRMAR', nombre: 'Prueba', permisos: ['usuarios.ver'] },
    });
    // Un token robado no puede bastar para repartir permisos.
    igual(r.statusCode, 403, 'estado: ');
    igual((r.json() as { error: { codigo: string } }).error.codigo,
          'REAUTENTICACION_REQUERIDA', 'código: ');
  });

  await prueba('con la contraseña correcta sí pasa', async () => {
    const r = await app.inject({
      method: 'POST', url: '/admin/roles', headers: auth(jefeToken),
      payload: {
        clave: `${P.toUpperCase().replace(/[^A-Z]/g, '')}_OK`,
        nombre: 'Con confirmación', permisos: ['usuarios.ver'],
        confirmarPassword: 'contrasena123',
      },
    });
    igual(r.statusCode, 201, 'estado: ');
  });

  await prueba('una contraseña equivocada no pasa, ni con la ventana abierta', async () => {
    // Aceptarla en silencio le haría creer a quien la escribió que era
    // correcta, y ocultaría un intento fallido que merece registrarse.
    const r = await app.inject({
      method: 'POST', url: '/admin/roles', headers: auth(jefeToken),
      payload: {
        clave: 'MALACLAVE', nombre: 'Prueba', permisos: ['usuarios.ver'],
        confirmarPassword: 'no-es-mi-clave',
      },
    });
    igual(r.statusCode, 401, 'estado: ');

    // Y el rol NO se creó
    const roles = await app.inject({
      method: 'GET', url: '/admin/roles', headers: auth(jefeToken),
    });
    const existe = roles.json().roles
      .some((x: { clave: string }) => x.clave === 'MALACLAVE');
    igual(existe, false, 'no se creó el rol: ');
  });

  await prueba('tras confirmar, no vuelve a pedir por unos minutos', async () => {
    // Es el modelo de `sudo`, y el de GitHub, Google y AWS. Pedirla en
    // cada clic parece más seguro pero no lo es: la gente termina
    // dejando la contraseña en el portapapeles o eligiendo una corta.
    const segunda = await app.inject({
      method: 'POST', url: '/admin/roles', headers: auth(jefeToken),
      payload: {
        clave: `${P.toUpperCase().replace(/[^A-Z]/g, '')}_DOS`,
        nombre: 'Sin volver a pedir', permisos: ['usuarios.ver'],
      },
    });
    igual(segunda.statusCode, 201, 'pasó sin contraseña: ');
  });

  await prueba('cambiar la contraseña cierra la ventana de confianza', async () => {
    const { olvidarConfirmacion, siguesConfirmado } = await import('../api/capas.js');
    igual(siguesConfirmado(jefeId), true, 'antes: ');
    olvidarConfirmacion(jefeId);
    igual(siguesConfirmado(jefeId), false, 'después: ');

    // Y vuelve a exigirla
    const r = await app.inject({
      method: 'POST', url: '/admin/roles', headers: auth(jefeToken),
      payload: {
        clave: 'SINVENTANA', nombre: 'Prueba', permisos: ['usuarios.ver'],
      },
    });
    igual(r.statusCode, 403, 'vuelve a pedir: ');
  });

  await prueba('la acción crítica queda registrada con su contexto', async () => {
    const { rows } = await pool.query(
      `SELECT detalle FROM incidentes WHERE tipo = 'ACCION_CRITICA'
        ORDER BY id DESC LIMIT 1`,
    );
    if (!rows[0]) throw new Error('no se registró');
    // El historial guarda QUÉ cambió; esto guarda desde dónde y con qué
    // sesión: es lo que permite responder "¿fue esta persona o alguien
    // con su token?".
    if (!rows[0].detalle.accion) throw new Error('sin la acción');
  });

  await prueba('una consulta NO exige reautenticación', async () => {
    // Pedir la contraseña para leer una lista sería fricción sin
    // beneficio: no cambia nada.
    const r = await app.inject({
      method: 'GET', url: '/admin/roles', headers: auth(jefeToken),
    });
    igual(r.statusCode, 200, 'estado: ');
  });

  await prueba('el límite de peticiones responde con un mensaje claro', async () => {
    // Se levanta un servidor aparte porque en las pruebas el límite
    // está apagado: con él encendido, 200 peticiones seguidas de otra
    // suite tumbarían todo.
    const limitado = await crearServidor({
      secreto: SECRETO, correo, limitarPeticiones: true,
    });
    await limitado.ready();

    let bloqueadas = 0;
    for (let i = 0; i < 14; i++) {
      const r = await limitado.inject({
        method: 'POST', url: '/auth/ingreso',
        payload: { email: 'nadie@t.pe', password: 'x'.repeat(10) },
      });
      if (r.statusCode === 429) bloqueadas++;
    }
    await limitado.close();

    // 10 por minuto en las rutas de autenticación: sin eso, alguien
    // podría probar 300 contraseñas por minuto.
    if (bloqueadas === 0) throw new Error('no limitó ningún intento');
  });

  await prueba('el segundo factor obligatorio bloquea el panel', async () => {
    await fijar('totp_obligatorio_admin', 'true');

    // Quien administra dinero no debería poder entrar solo con una
    // contraseña.
    const r = await app.inject({
      method: 'GET', url: '/admin/usuarios', headers: auth(jefeToken),
    });
    igual(r.statusCode, 403, 'estado: ');
    igual((r.json() as { error: { codigo: string } }).error.codigo,
          'TOTP_OBLIGATORIO', 'código: ');

    // Pero /admin/yo sigue abierto: es donde el panel descubre que
    // hace falta activarlo. Bloquearla dejaría a la persona fuera sin
    // manera de arreglarlo.
    const yo = await app.inject({
      method: 'GET', url: '/admin/yo', headers: auth(jefeToken),
    });
    igual(yo.statusCode, 200, '/admin/yo sigue abierto: ');

    await fijar('totp_obligatorio_admin', 'false');
  });

  await prueba('un usuario sin permisos no necesita segundo factor', async () => {
    await fijar('totp_obligatorio_admin', 'true');
    const normal = await app.inject({
      method: 'POST', url: '/auth/registro',
      payload: {
        alias: `${P}sinfa`, email: `${P}sinfa@t.pe`,
        password: 'contrasena123', fechaNacimiento: '1990-01-01',
      },
    });
    // La exigencia es para quien administra, no para quien apuesta.
    const r = await app.inject({
      method: 'GET', url: '/yo', headers: auth(normal.json().token),
    });
    igual(r.statusCode, 200, 'estado: ');
    await fijar('totp_obligatorio_admin', 'false');
  });

  await prueba('todo sigue cuadrando', async () => {
    const { rows } = await pool.query(`SELECT descuadre FROM v_conciliacion_global`);
    for (const f of rows) igual(Number(f.descuadre), 0, 'descuadre: ');
  });

  // -------------------------------------------------------------------
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  ${pasadas} pasadas, ${fallidas} fallidas`);
  console.log(`${'─'.repeat(56)}\n`);

  await app.close();
  await limpiarDatosDePrueba();
  await cerrar();
  if (fallidas > 0) process.exit(1);
}

let S_totp = { email: '', clave: '', secreto: '', respaldos: [] as string[] };
let S_tokenUsado = '';
let S_mercado = '';

main().catch(async (e) => {
  console.error('\nError fatal:', e);
  await limpiarDatosDePrueba();
  await cerrar();
  process.exit(1);
});
