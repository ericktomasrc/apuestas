/**
 * Pruebas de la API HTTP.
 *
 * Usa `app.inject()` de Fastify: no abre un puerto real, así que corre
 * rápido y sin conflictos de red. Las peticiones recorren el mismo
 * camino que en producción — enrutado, validación, autenticación,
 * manejador de errores.
 *
 * Correr con:  npm run test:api
 */

import type { FastifyInstance } from 'fastify';
import { crearServidor } from '../api/app.js';
import {
  hashearPassword,
  verificarPassword,
  firmarToken,
  verificarToken,
} from '../api/auth.js';
import { pool, cerrar } from '../infraestructura/db.js';
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

const P = `a${Date.now().toString(36)}`;

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
let deporteId: string;
let ligaId: string;
let n = 0;

interface Cuenta {
  token: string;
  id: string;
  alias: string;
}

async function registrar(saldo = 50000): Promise<Cuenta> {
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
  if (r.statusCode !== 201) throw new Error(`registro falló: ${r.body}`);
  const cuerpo = r.json();
  if (saldo > 0) await depositar(cuerpo.usuario.id, saldo, `${P}:dep:${i}`);
  return { token: cuerpo.token, id: cuerpo.usuario.id, alias: cuerpo.usuario.alias };
}

async function crearSalaConMercado(anfitrion: string): Promise<{
  salaId: string;
  mercadoId: string;
}> {
  const p = await pool.query(
    `INSERT INTO partidos (api_id, deporte_id, liga_id, equipo_local,
                           equipo_visitante, inicia_en, inicia_en_original)
     VALUES ($1,$2,$3,'Botafogo','Cienciano',
             now() + interval '3 hours', now() + interval '3 hours')
     RETURNING id`,
    [`${P}_p${++n}`, deporteId, ligaId],
  );
  const s = await pool.query(
    `INSERT INTO salas (codigo, partido_id, anfitrion_id, tope_participantes,
                        monto_minimo_centavos, descripcion)
     VALUES ($1,$2,$3,10,1000,'Sala de prueba') RETURNING id`,
    [`${P}${++n}`, p.rows[0].id, anfitrion],
  );
  const m = await pool.query(
    `INSERT INTO mercados (sala_id, tipo_mercado, linea, etiqueta_favor, etiqueta_contra)
     VALUES ($1,'TOTAL_GOLES',2.5,'Más de 2.5','Menos de 2.5') RETURNING id`,
    [s.rows[0].id],
  );
  return { salaId: s.rows[0].id, mercadoId: m.rows[0].id };
}

function conAuth(token: string, clave?: string): Record<string, string> {
  const h: Record<string, string> = { authorization: `Bearer ${token}` };
  if (clave) h['idempotency-key'] = clave;
  return h;
}

// =====================================================================

async function main(): Promise<void> {
  console.log('Pruebas de la API HTTP\n' + '─'.repeat(56));

  app = await crearServidor({ secreto: SECRETO , limitarPeticiones: false });
  await app.ready();

  deporteId = (await pool.query(`SELECT id FROM deportes WHERE clave='FUTBOL'`)).rows[0].id;
  ligaId = (
    await pool.query(
      `INSERT INTO ligas (deporte_id, api_id, nombre, pais)
     VALUES ($1,$2,'Liga API','PE') RETURNING id`,
      [deporteId, ligaApiPrueba()],
    )
  ).rows[0].id;

  // -------------------------------------------------------------------
  grupo('Contraseñas y tokens');
  // -------------------------------------------------------------------

  await prueba('el hash es distinto cada vez, aun con la misma clave', async () => {
    const a = await hashearPassword('misma-clave');
    const b = await hashearPassword('misma-clave');
    // Sal única por usuario: sin ella, una tabla precalculada rompería
    // todas las contraseñas iguales de una sola vez.
    if (a === b) throw new Error('los hashes coinciden: falta la sal');
    igual(await verificarPassword('misma-clave', a), true, 'verifica a: ');
    igual(await verificarPassword('misma-clave', b), true, 'verifica b: ');
  });

  await prueba('una contraseña incorrecta no pasa', async () => {
    const h = await hashearPassword('correcta');
    igual(await verificarPassword('incorrecta', h), false);
  });

  await prueba('un hash corrupto no revienta, devuelve false', async () => {
    igual(await verificarPassword('x', 'basura'), false);
    igual(await verificarPassword('x', 'scrypt$solo-sal'), false);
  });

  await prueba('un token firmado se verifica', async () => {
    const t = firmarToken({ usuarioId: 'abc', alias: 'juan' }, SECRETO);
    igual(verificarToken(t, SECRETO)?.usuarioId, 'abc');
  });

  await prueba('un token con otro secreto se rechaza', async () => {
    const t = firmarToken({ usuarioId: 'abc', alias: 'juan' }, SECRETO);
    igual(verificarToken(t, 'otro-secreto-completamente-distinto'), null);
  });

  await prueba('un token manipulado se rechaza', async () => {
    const t = firmarToken({ usuarioId: 'abc', alias: 'juan' }, SECRETO);
    const [cab, , firma] = t.split('.');
    const falso = Buffer.from(
      JSON.stringify({ usuarioId: 'HACKER', alias: 'x', expira: 9e9 }),
    )
      .toString('base64')
      .replace(/=+$/, '');
    igual(verificarToken(`${cab}.${falso}.${firma}`, SECRETO), null);
  });

  await prueba('un token vencido se rechaza', async () => {
    const t = firmarToken({ usuarioId: 'abc', alias: 'j' }, SECRETO, -1);
    igual(verificarToken(t, SECRETO), null);
  });

  // -------------------------------------------------------------------
  grupo('Registro e ingreso');
  // -------------------------------------------------------------------

  await prueba('registro exitoso devuelve token', async () => {
    const c = await registrar(0);
    if (!c.token) throw new Error('sin token');
    igual(verificarToken(c.token, SECRETO)?.usuarioId, c.id, 'token válido: ');
  });

  await prueba('un menor de edad no puede registrarse', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/auth/registro',
      payload: {
        alias: `${P}menor`,
        email: `${P}menor@t.pe`,
        password: 'contrasena123',
        fechaNacimiento: '2015-01-01',
      },
    });
    igual(r.statusCode, 403, 'estado: ');
    igual(r.json().error.codigo, 'MENOR_DE_EDAD', 'código: ');
  });

  await prueba('un alias repetido se rechaza con mensaje claro', async () => {
    const c = await registrar(0);
    const r = await app.inject({
      method: 'POST',
      url: '/auth/registro',
      payload: {
        alias: c.alias,
        email: `${P}otro${++n}@t.pe`,
        password: 'contrasena123',
        fechaNacimiento: '1990-01-01',
      },
    });
    igual(r.statusCode, 409, 'estado: ');
    igual(r.json().error.mensaje, 'Ese alias ya está en uso.', 'mensaje: ');
  });

  await prueba('datos inválidos devuelven qué campo falló', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/auth/registro',
      payload: { alias: 'ab', email: 'no-es-correo', password: '123', fechaNacimiento: 'ayer' },
    });
    igual(r.statusCode, 400, 'estado: ');
    const d = r.json().error.detalles;
    if (!Array.isArray(d) || d.length < 3) throw new Error('faltan detalles');
  });

  await prueba('ingreso con credenciales correctas', async () => {
    const i = ++n;
    await app.inject({
      method: 'POST',
      url: '/auth/registro',
      payload: {
        alias: `${P}log${i}`,
        email: `${P}log${i}@t.pe`,
        password: 'contrasena123',
        fechaNacimiento: '1990-01-01',
      },
    });
    const r = await app.inject({
      method: 'POST',
      url: '/auth/ingreso',
      payload: { email: `${P}log${i}@t.pe`, password: 'contrasena123' },
    });
    igual(r.statusCode, 200, 'estado: ');
    if (!r.json().token) throw new Error('sin token');
  });

  await prueba('correo inexistente y clave mala dan el MISMO error', async () => {
    const i = ++n;
    await app.inject({
      method: 'POST',
      url: '/auth/registro',
      payload: {
        alias: `${P}enum${i}`,
        email: `${P}enum${i}@t.pe`,
        password: 'contrasena123',
        fechaNacimiento: '1990-01-01',
      },
    });

    const noExiste = await app.inject({
      method: 'POST',
      url: '/auth/ingreso',
      payload: { email: `nadie${P}@t.pe`, password: 'contrasena123' },
    });
    const claveMala = await app.inject({
      method: 'POST',
      url: '/auth/ingreso',
      payload: { email: `${P}enum${i}@t.pe`, password: 'equivocada' },
    });

    // Distinguirlos permitiría averiguar qué correos están registrados.
    igual(noExiste.statusCode, claveMala.statusCode, 'mismo estado: ');
    igual(noExiste.json().error.mensaje, claveMala.json().error.mensaje, 'mismo mensaje: ');
  });

  // -------------------------------------------------------------------
  grupo('Autenticación de rutas protegidas');
  // -------------------------------------------------------------------

  await prueba('sin token devuelve 401', async () => {
    const r = await app.inject({ method: 'GET', url: '/yo' });
    igual(r.statusCode, 401, 'estado: ');
    igual(r.json().error.codigo, 'NO_AUTENTICADO', 'código: ');
  });

  await prueba('con token basura devuelve 401', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/yo',
      headers: { authorization: 'Bearer no.es.un.token' },
    });
    igual(r.statusCode, 401, 'estado: ');
  });

  await prueba('con token válido devuelve el perfil y el saldo', async () => {
    const c = await registrar(30000);
    const r = await app.inject({ method: 'GET', url: '/yo', headers: conAuth(c.token) });
    igual(r.statusCode, 200, 'estado: ');
    const b = r.json();
    igual(b.usuario.alias, c.alias, 'alias: ');
    igual(b.saldo.disponibleCentavos, 30000, 'saldo: ');
    igual(b.usuario.plan, 'GRATIS', 'plan: ');
  });

  // -------------------------------------------------------------------
  grupo('Idempotencia obligatoria en operaciones con dinero');
  // -------------------------------------------------------------------

  await prueba('apostar sin Idempotency-Key se rechaza', async () => {
    const c = await registrar();
    const { mercadoId } = await crearSalaConMercado(c.id);
    const r = await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token),
      payload: { lado: 'A_FAVOR', montoCentavos: 2000 },
    });
    // Sin la clave, un reintento por timeout de red cobraría dos veces.
    // La rechaza el esquema de la ruta (el mismo que documenta Swagger),
    // antes incluso de llegar al código.
    igual(r.statusCode, 400, 'estado: ');
    const campos = r.json().error.detalles.map((d: { campo: string }) => d.campo);
    igual(campos.includes('idempotency-key'), true, 'señala la cabecera: ');
  });

  await prueba('la misma clave dos veces no cobra dos veces', async () => {
    const c = await registrar();
    const { mercadoId } = await crearSalaConMercado(c.id);
    const clave = `${P}-idem-${++n}`;

    const uno = await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, clave),
      payload: { lado: 'A_FAVOR', montoCentavos: 2000 },
    });
    igual(uno.statusCode, 201, 'primera: ');

    const dos = await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, clave),
      payload: { lado: 'A_FAVOR', montoCentavos: 2000 },
    });
    igual(dos.statusCode, 409, 'segunda rechazada: ');

    const saldo = await app.inject({
      method: 'GET',
      url: '/yo/saldo',
      headers: conAuth(c.token),
    });
    igual(saldo.json().retenidoCentavos, 2000, 'retuvo una sola vez: ');
  });

  // -------------------------------------------------------------------
  grupo('Apostar por HTTP');
  // -------------------------------------------------------------------

  await prueba('apostar devuelve balance y saldo actualizados', async () => {
    const c = await registrar();
    const { mercadoId } = await crearSalaConMercado(c.id);
    const r = await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, `${P}-ap-${++n}`),
      payload: { lado: 'A_FAVOR', montoCentavos: 3000 },
    });
    igual(r.statusCode, 201, 'estado: ');
    const b = r.json();
    igual(b.balance.totalFavor, 3000, 'total a favor: ');
    igual(b.balance.falta.lado, 'EN_CONTRA', 'lado faltante: ');
    igual(b.balance.falta.centavos, 3000, 'faltan: ');
    igual(b.saldo.disponibleCentavos, 47000, 'disponible: ');
  });

  await prueba('sin saldo suficiente responde 402 y sugiere recargar', async () => {
    const c = await registrar(1000);
    const { mercadoId } = await crearSalaConMercado(c.id);
    const r = await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, `${P}-pobre-${++n}`),
      payload: { lado: 'A_FAVOR', montoCentavos: 5000 },
    });
    igual(r.statusCode, 402, 'estado: ');
    igual(r.json().error.accion, 'RECARGAR', 'acción sugerida: ');
    // El usuario nunca ve "SALDO_INSUFICIENTE"
    igual(r.json().error.mensaje, 'No te alcanza para esta apuesta.', 'mensaje: ');
  });

  await prueba('no se puede apostar en ambos lados', async () => {
    const c = await registrar();
    const { mercadoId } = await crearSalaConMercado(c.id);
    await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, `${P}-amb1-${++n}`),
      payload: { lado: 'A_FAVOR', montoCentavos: 2000 },
    });
    const r = await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, `${P}-amb2-${++n}`),
      payload: { lado: 'EN_CONTRA', montoCentavos: 2000 },
    });
    igual(r.statusCode, 409, 'estado: ');
    igual(r.json().error.codigo, 'POSICION_CONTRADICTORIA', 'código: ');
  });

  await prueba('monto negativo lo rechaza la validación de entrada', async () => {
    const c = await registrar();
    const { mercadoId } = await crearSalaConMercado(c.id);
    const r = await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, `${P}-neg-${++n}`),
      payload: { lado: 'A_FAVOR', montoCentavos: -5000 },
    });
    igual(r.statusCode, 400, 'estado: ');
  });

  await prueba('retirarse devuelve el dinero', async () => {
    const c = await registrar();
    const { mercadoId } = await crearSalaConMercado(c.id);
    await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, `${P}-ret1-${++n}`),
      payload: { lado: 'A_FAVOR', montoCentavos: 2000 },
    });
    const r = await app.inject({
      method: 'DELETE',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, `${P}-ret2-${++n}`),
    });
    igual(r.statusCode, 200, 'estado: ');
    igual(r.json().saldo.disponibleCentavos, 50000, 'recuperó todo: ');
    igual(r.json().saldo.retenidoCentavos, 0, 'sin retención: ');
  });

  // -------------------------------------------------------------------
  grupo('Muro y consultas');
  // -------------------------------------------------------------------

  await prueba('el muro lista salas abiertas con sus mercados', async () => {
    const c = await registrar();
    await crearSalaConMercado(c.id);
    const r = await app.inject({ method: 'GET', url: '/salas' });
    igual(r.statusCode, 200, 'estado: ');
    const salas = r.json().salas;
    if (!Array.isArray(salas) || salas.length === 0) throw new Error('muro vacío');
    if (!salas[0].mercados) throw new Error('sin mercados');
  });

  await prueba('el filtro de deporte funciona', async () => {
    const r = await app.inject({ method: 'GET', url: '/salas?deporte=BASQUET' });
    igual(r.statusCode, 200, 'estado: ');
    const salas = r.json().salas;
    igual(salas.every((s: { deporte: string }) => s.deporte === 'BASQUET'), true);
  });

  await prueba('"necesitan gente" solo trae salas sin balancear', async () => {
    const r = await app.inject({ method: 'GET', url: '/salas?soloNecesitanGente=true' });
    igual(r.statusCode, 200, 'estado: ');
    for (const s of r.json().salas) {
      const alguno = (s.mercados ?? []).some((m: { balanceado: boolean }) => !m.balanceado);
      igual(alguno, true, `sala ${s.codigo}: `);
    }
  });

  await prueba('una sala inexistente devuelve 404', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/salas/00000000-0000-0000-0000-000000000000',
    });
    igual(r.statusCode, 404, 'estado: ');
  });

  await prueba('un id mal formado devuelve 400, no 500', async () => {
    const r = await app.inject({ method: 'GET', url: '/salas/no-es-un-uuid' });
    igual(r.statusCode, 400, 'estado: ');
    igual(r.json().error.codigo, 'ENTRADA_INVALIDA', 'código: ');
  });

  await prueba('una entrada inválida nunca devuelve 500', async () => {
    // Un 500 significa "fallamos nosotros". Que el cliente mande datos
    // mal formados es culpa suya y debe decírsele, no ocultarse tras
    // un "algo falló de nuestro lado".
    const casos = [
      { method: 'POST' as const, url: '/auth/registro', payload: { alias: 'x' } },
      { method: 'POST' as const, url: '/auth/ingreso', payload: {} },
      { method: 'GET' as const, url: '/mercados/abc/balance' },
      { method: 'GET' as const, url: '/salas?maxMinimo=texto' },
    ];
    for (const caso of casos) {
      const r = await app.inject(caso);
      if (r.statusCode >= 500) {
        throw new Error(`${caso.url} devolvió ${r.statusCode}: ${r.body.slice(0, 80)}`);
      }
    }
  });

  await prueba('mis salas muestra mis posiciones y mi saldo', async () => {
    const c = await registrar();
    const { mercadoId } = await crearSalaConMercado(c.id);
    await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, `${P}-mis-${++n}`),
      payload: { lado: 'A_FAVOR', montoCentavos: 2000 },
    });
    const r = await app.inject({
      method: 'GET',
      url: '/yo/salas',
      headers: conAuth(c.token),
    });
    igual(r.statusCode, 200, 'estado: ');
    igual(r.json().salas.length, 1, 'una sala: ');
    igual(r.json().saldo.retenidoCentavos, 2000, 'retenido: ');
  });

  await prueba('mis movimientos lista el historial', async () => {
    const c = await registrar();
    const r = await app.inject({
      method: 'GET',
      url: '/yo/movimientos',
      headers: conAuth(c.token),
    });
    igual(r.statusCode, 200, 'estado: ');
    igual(r.json().movimientos[0].tipo, 'DEPOSITO', 'primer movimiento: ');
  });

  // -------------------------------------------------------------------
  grupo('Cerrar sala');
  // -------------------------------------------------------------------

  await prueba('el anfitrión inicia la regresiva, no cierra de golpe', async () => {
    const a = await registrar();
    const b = await registrar();
    const { salaId, mercadoId } = await crearSalaConMercado(a.id);
    await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(a.token, `${P}-c1-${++n}`),
      payload: { lado: 'A_FAVOR', montoCentavos: 2000 },
    });
    await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(b.token, `${P}-c2-${++n}`),
      payload: { lado: 'EN_CONTRA', montoCentavos: 2000 },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/salas/${salaId}/cerrar`,
      headers: conAuth(a.token),
    });
    igual(r.statusCode, 200, 'estado: ');
    igual(r.json().estado, 'CUENTA_REGRESIVA', 'nunca cierra de golpe: ');
  });

  await prueba('otro usuario no puede cerrar la sala ajena', async () => {
    const a = await registrar();
    const b = await registrar();
    const { salaId, mercadoId } = await crearSalaConMercado(a.id);
    await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(a.token, `${P}-d1-${++n}`),
      payload: { lado: 'A_FAVOR', montoCentavos: 2000 },
    });
    await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(b.token, `${P}-d2-${++n}`),
      payload: { lado: 'EN_CONTRA', montoCentavos: 2000 },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/salas/${salaId}/cerrar`,
      headers: conAuth(b.token),
    });
    igual(r.statusCode, 403, 'estado: ');
  });

  // -------------------------------------------------------------------
  grupo('Salud e integridad');
  // -------------------------------------------------------------------

  await prueba('/salud responde sin autenticación', async () => {
    const r = await app.inject({ method: 'GET', url: '/salud' });
    igual(r.statusCode, 200, 'estado: ');
    igual(r.json().estado, 'ok', 'estado del sistema: ');
  });

  await prueba('ningún endpoint filtra códigos técnicos al usuario', async () => {
    const c = await registrar(100);
    const { mercadoId } = await crearSalaConMercado(c.id);
    const r = await app.inject({
      method: 'POST',
      url: `/mercados/${mercadoId}/apostar`,
      headers: conAuth(c.token, `${P}-tec-${++n}`),
      payload: { lado: 'A_FAVOR', montoCentavos: 90000 },
    });
    const mensaje = r.json().error.mensaje;
    // El mensaje es para leer; el código es para que la app reaccione.
    if (/[A-Z_]{6,}/.test(mensaje)) {
      throw new Error(`el mensaje contiene un código técnico: ${mensaje}`);
    }
  });

  await prueba('todo sigue cuadrando después de las pruebas', async () => {
    const { rows } = await pool.query(`SELECT * FROM v_conciliacion_global`);
    igual(Number(rows[0].descuadre), 0, 'descuadre global: ');
    const d = await pool.query(`SELECT * FROM v_descuadres`);
    igual(d.rows.length, 0, 'mercados descuadrados: ');
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

main().catch(async (e) => {
  console.error('\nError fatal:', e);
  await limpiarDatosDePrueba();
  await cerrar();
  process.exit(1);
});
