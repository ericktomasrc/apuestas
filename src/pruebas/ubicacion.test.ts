/**
 * Pruebas de VERIFICACIÓN DE UBICACIÓN.
 *
 * Lo que se comprueba aquí no es que la geolocalización acierte —eso
 * depende del proveedor— sino que **las tres políticas hagan lo que
 * dicen** y que nada bloquee registros por razones equivocadas.
 *
 * Correr con:  npm run test:ubicacion
 */

import type { FastifyInstance } from 'fastify';
import { crearServidor } from '../api/app.js';
import { pool, cerrar } from '../infraestructura/db.js';
import {
  UbicacionSimulada,
  esIpLocal,
} from '../infraestructura/proveedores/ubicacion.proveedor.js';
import {
  verificar,
  invalidarPolitica,
  politica,
  ipDe,
} from '../servicios/ubicacion.servicio.js';
import { invalidarConfig } from '../servicios/salas.servicio.js';
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

const P = `ub${Date.now().toString(36)}`;
const SECRETO = 'secreto-de-prueba-con-mas-de-treinta-y-dos-caracteres';
const prov = new UbicacionSimulada();
let app: FastifyInstance;
let n = 0;

async function fijarPolitica(valor: string): Promise<void> {
  await pool.query(
    `UPDATE configuracion SET valor = $1 WHERE clave = 'ubicacion_politica'`,
    [valor],
  );
  invalidarPolitica();
  invalidarConfig();
}

async function fijar(clave: string, valor: string): Promise<void> {
  await pool.query(`UPDATE configuracion SET valor = $2 WHERE clave = $1`, [clave, valor]);
  invalidarPolitica();
}

/** Registra pasando una IP concreta, como si viniera de un proxy. */
async function registrarDesde(
  ip: string,
  pais = 'PE',
): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
  const i = ++n;
  const r = await app.inject({
    method: 'POST',
    url: '/auth/registro',
    headers: { 'x-forwarded-for': ip },
    payload: {
      alias: `${P}u${i}`,
      email: `${P}u${i}@t.pe`,
      password: 'contrasena123',
      fechaNacimiento: '1990-05-15',
      pais,
    },
  });
  return { estado: r.statusCode, cuerpo: r.json() };
}

// =====================================================================

async function main(): Promise<void> {
  console.log('Pruebas de VERIFICACIÓN DE UBICACIÓN\n' + '─'.repeat(56));

  // confiarEnProxy activado para poder simular IPs desde las pruebas
  app = await crearServidor({
    secreto: SECRETO,
    ubicacion: prov,
    confiarEnProxy: true,
    limitarPeticiones: false,
  });
  await app.ready();

  await pool.query(
    `INSERT INTO paises_habilitados
       (codigo, nombre, moneda, simbolo, decimales, separador_miles,
        separador_decimal, minimo_apuesta, maximo_apuesta, zona_horaria)
     VALUES ('CL','Chile','CLP','$',0,'.',',',1000,500000,'America/Santiago')
     ON CONFLICT DO NOTHING`,
  );

  // -------------------------------------------------------------------
  grupo('IPs locales — no se verifica lo que no se puede verificar');
  // -------------------------------------------------------------------

  await prueba('reconoce las direcciones locales y privadas', async () => {
    for (const ip of ['127.0.0.1', '::1', '10.0.0.5', '192.168.1.100', '172.16.0.1']) {
      igual(esIpLocal(ip), true, `${ip}: `);
    }
    for (const ip of ['200.48.225.130', '8.8.8.8']) {
      igual(esIpLocal(ip), false, `${ip}: `);
    }
  });

  await prueba('en local nunca bloquea', async () => {
    // Durante el desarrollo todas las IPs son locales. Verificar ahí
    // solo bloquearía el trabajo propio.
    await fijarPolitica('BLOQUEAR');
    prov.limpiar();

    const v = await verificar(prov, {
      ip: '127.0.0.1', paisDeclarado: 'PE', momento: 'REGISTRO',
    });
    igual(v.resultado, 'SIN_DATO', 'resultado: ');
  });

  // -------------------------------------------------------------------
  grupo('Las tres políticas');
  // -------------------------------------------------------------------

  await prueba('PERMITIR deja pasar aunque no coincida', async () => {
    await fijarPolitica('PERMITIR');
    prov.limpiar();
    prov.registrar('200.1.1.1', 'CL');

    const v = await verificar(prov, {
      ip: '200.1.1.1', paisDeclarado: 'PE', momento: 'REGISTRO',
    });
    igual(v.resultado, 'PERMITIDO', 'resultado: ');
    igual(v.paisDetectado, 'CL', 'detectado: ');
  });

  await prueba('ADVERTIR deja pasar pero lo marca', async () => {
    await fijarPolitica('ADVERTIR');
    prov.limpiar();
    prov.registrar('200.2.2.2', 'CL');

    const v = await verificar(prov, {
      ip: '200.2.2.2', paisDeclarado: 'PE', momento: 'REGISTRO',
    });
    igual(v.resultado, 'ADVERTIDO', 'resultado: ');
  });

  await prueba('BLOQUEAR rechaza y dice de dónde viene', async () => {
    await fijarPolitica('BLOQUEAR');
    prov.limpiar();
    prov.registrar('200.3.3.3', 'CL');

    const v = await verificar(prov, {
      ip: '200.3.3.3', paisDeclarado: 'PE', momento: 'REGISTRO',
    });
    igual(v.resultado, 'BLOQUEADO', 'resultado: ');
    // El mensaje es accionable: dice qué hacer, no solo que no se puede
    if (!v.mensaje?.includes('Chile')) {
      throw new Error(`el mensaje no orienta: ${v.mensaje}`);
    }
  });

  await prueba('si coincide, pasa con cualquier política', async () => {
    await fijarPolitica('BLOQUEAR');
    prov.limpiar();
    prov.registrar('200.4.4.4', 'PE');

    const v = await verificar(prov, {
      ip: '200.4.4.4', paisDeclarado: 'PE', momento: 'REGISTRO',
    });
    igual(v.resultado, 'PERMITIDO', 'resultado: ');
  });

  // -------------------------------------------------------------------
  grupo('Cuando el proveedor no responde');
  // -------------------------------------------------------------------

  await prueba('un proveedor caído NO bloquea el registro', async () => {
    await fijarPolitica('BLOQUEAR');
    prov.limpiar();
    prov.fallar = true;

    const v = await verificar(prov, {
      ip: '200.5.5.5', paisDeclarado: 'PE', momento: 'REGISTRO',
    });
    prov.fallar = false;

    // Bloquear registros porque una API externa no responde sería peor
    // que el problema que se intenta evitar.
    igual(v.resultado, 'PROVEEDOR_CAIDO', 'resultado: ');
  });

  await prueba('el proveedor caído queda como incidente', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM incidentes
        WHERE tipo = 'UBICACION_PROVEEDOR_CAIDO'`,
    );
    if (rows[0].n === 0) throw new Error('no registró el incidente');
  });

  await prueba('sin dato de país tampoco bloquea', async () => {
    await fijarPolitica('BLOQUEAR');
    prov.limpiar();
    prov.porDefecto = null;

    const v = await verificar(prov, {
      ip: '200.6.6.6', paisDeclarado: 'PE', momento: 'REGISTRO',
    });
    igual(v.resultado, 'SIN_DATO', 'resultado: ');
  });

  // -------------------------------------------------------------------
  grupo('VPN y proxy');
  // -------------------------------------------------------------------

  await prueba('por defecto una VPN no bloquea', async () => {
    await fijarPolitica('PERMITIR');
    await fijar('ubicacion_bloquear_vpn', 'false');
    prov.limpiar();
    prov.registrar('200.7.7.7', 'PE', true);

    const v = await verificar(prov, {
      ip: '200.7.7.7', paisDeclarado: 'PE', momento: 'REGISTRO',
    });
    // Mucha gente usa VPN por costumbre o por trabajo. Bloquear a todos
    // dejaría fuera a usuarios legítimos.
    igual(v.resultado, 'PERMITIDO', 'resultado: ');
    igual(v.sospechosa, true, 'pero queda marcada: ');
  });

  await prueba('se puede activar el bloqueo de VPN', async () => {
    await fijar('ubicacion_bloquear_vpn', 'true');
    prov.limpiar();
    prov.registrar('200.8.8.8', 'PE', true);

    const v = await verificar(prov, {
      ip: '200.8.8.8', paisDeclarado: 'PE', momento: 'REGISTRO',
    });
    igual(v.resultado, 'BLOQUEADO', 'resultado: ');
    await fijar('ubicacion_bloquear_vpn', 'false');
  });

  // -------------------------------------------------------------------
  grupo('Registro por HTTP');
  // -------------------------------------------------------------------

  await prueba('registro con IP coincidente: sin aviso', async () => {
    await fijarPolitica('ADVERTIR');
    prov.limpiar();
    prov.registrar('200.10.1.1', 'PE');

    const r = await registrarDesde('200.10.1.1', 'PE');
    igual(r.estado, 201, 'estado: ');
    igual('aviso' in r.cuerpo, false, 'sin aviso: ');
  });

  await prueba('registro con IP de otro país: pasa pero avisa', async () => {
    await fijarPolitica('ADVERTIR');
    prov.limpiar();
    prov.registrar('200.10.2.2', 'CL');

    const r = await registrarDesde('200.10.2.2', 'PE');
    igual(r.estado, 201, 'estado: ');
    igual('aviso' in r.cuerpo, true, 'trae aviso: ');
  });

  await prueba('con BLOQUEAR, el registro se rechaza con 403', async () => {
    await fijarPolitica('BLOQUEAR');
    prov.limpiar();
    prov.registrar('200.10.3.3', 'CL');

    const r = await registrarDesde('200.10.3.3', 'PE');
    igual(r.estado, 403, 'estado: ');
    const error = (r.cuerpo as { error: { codigo: string; mensaje: string } }).error;
    igual(error.codigo, 'UBICACION_BLOQUEADA', 'código: ');
    if (!error.mensaje.includes('Chile')) {
      throw new Error(`el mensaje no orienta: ${error.mensaje}`);
    }
  });

  await prueba('la cuenta guarda lo que se detectó', async () => {
    await fijarPolitica('ADVERTIR');
    prov.limpiar();
    prov.registrar('200.10.4.4', 'CL');

    const r = await registrarDesde('200.10.4.4', 'PE');
    const id = (r.cuerpo as { usuario: { id: string } }).usuario.id;

    const { rows } = await pool.query(
      `SELECT pais, pais_detectado, ip_registro, pais_verificado_en
         FROM usuarios WHERE id = $1`,
      [id],
    );
    igual(rows[0].pais, 'PE', 'declarado: ');
    igual(rows[0].pais_detectado, 'CL', 'detectado: ');
    if (!rows[0].ip_registro) throw new Error('no guardó la IP');
    if (!rows[0].pais_verificado_en) throw new Error('no guardó la fecha');
  });

  await prueba('la discrepancia aparece en el panel', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM v_discrepancias_ubicacion
        WHERE pais_declarado <> pais_detectado`,
    );
    if (rows[0].n === 0) throw new Error('no aparece ninguna discrepancia');
  });

  // -------------------------------------------------------------------
  grupo('Registro de evidencia');
  // -------------------------------------------------------------------

  await prueba('cada verificación queda guardada', async () => {
    const { rows } = await pool.query(
      `SELECT resultado, count(*)::int AS n FROM verificaciones_ubicacion
        GROUP BY resultado`,
    );
    if (rows.length === 0) throw new Error('no se registró ninguna verificación');

    const tipos = new Set(rows.map((r) => r.resultado));
    for (const esperado of ['PERMITIDO', 'BLOQUEADO', 'ADVERTIDO', 'SIN_DATO']) {
      if (!tipos.has(esperado)) throw new Error(`falta el resultado ${esperado}`);
    }
  });

  await prueba('el registro de verificaciones no se puede alterar', async () => {
    // Es evidencia: si mañana hay que responderle a un regulador desde
    // dónde se conectó alguien, no puede haberse editado.
    let bloqueado = false;
    await pool
      .query(`UPDATE verificaciones_ubicacion SET resultado = 'PERMITIDO'`)
      .catch(() => { bloqueado = true; });
    igual(bloqueado, true, 'UPDATE bloqueado: ');

    bloqueado = false;
    await pool
      .query(`DELETE FROM verificaciones_ubicacion`)
      .catch(() => { bloqueado = true; });
    igual(bloqueado, true, 'DELETE bloqueado: ');
  });

  // -------------------------------------------------------------------
  grupo('De dónde se saca la IP');
  // -------------------------------------------------------------------

  await prueba('sin proxy se ignora x-forwarded-for', async () => {
    // Esa cabecera la puede falsificar cualquiera. Sin un proxy propio
    // que la reescriba, confiar en ella sería peor que ignorarla.
    igual(
      ipDe({ 'x-forwarded-for': '1.2.3.4' }, '200.9.9.9', false),
      '200.9.9.9',
    );
  });

  await prueba('con proxy se toma el primer valor de la lista', async () => {
    igual(
      ipDe({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }, '10.0.0.2', true),
      '1.2.3.4',
    );
  });

  await prueba('con proxy pero sin cabecera, cae al socket', async () => {
    igual(ipDe({}, '200.9.9.9', true), '200.9.9.9');
  });

  // -------------------------------------------------------------------
  grupo('La política se cambia sin desplegar');
  // -------------------------------------------------------------------

  await prueba('cambiar el parámetro cambia el comportamiento', async () => {
    prov.limpiar();
    prov.registrar('200.11.1.1', 'CL');

    await fijarPolitica('PERMITIR');
    igual(
      (await verificar(prov, { ip:'200.11.1.1', paisDeclarado:'PE', momento:'REGISTRO' })).resultado,
      'PERMITIDO', 'con PERMITIR: ');

    await fijarPolitica('BLOQUEAR');
    igual(
      (await verificar(prov, { ip:'200.11.1.1', paisDeclarado:'PE', momento:'REGISTRO' })).resultado,
      'BLOQUEADO', 'con BLOQUEAR: ');
  });

  await prueba('un valor inválido cae en ADVERTIR', async () => {
    // Ante configuración corrupta se elige el término medio: ni dejar
    // pasar todo ni bloquear a todos.
    await fijarPolitica('CUALQUIER_COSA');
    igual((await politica()).politica, 'ADVERTIR', 'política: ');
    await fijarPolitica('ADVERTIR');
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

main().catch(async (e) => {
  console.error('\nError fatal:', e);
  await limpiarDatosDePrueba();
  await cerrar();
  process.exit(1);
});
