/**
 * Servicio de VERIFICACIÓN DE UBICACIÓN.
 *
 * Cierra un hueco concreto: hasta ahora el país lo declaraba el cliente
 * y nadie comprobaba nada. Alguien de otro país podía declarar 'PE' y
 * entrar a salas peruanas.
 *
 * Importa porque la licencia autoriza a operar en un país concreto.
 * Aceptar jugadores de otra jurisdicción es operar sin licencia allá,
 * aunque el servidor esté en Lima.
 *
 * ⚠️ La IP **no es prueba**. Una VPN la cambia en un clic, y una red
 * corporativa puede salir por otro país. Es la primera capa, no la
 * última: en producción el KYC es lo que realmente verifica.
 */

import { pool, enTransaccion, type Cliente } from '../infraestructura/db.js';
import {
  esIpLocal,
  type ProveedorUbicacion,
  type Ubicacion,
} from '../infraestructura/proveedores/ubicacion.proveedor.js';
import { config } from './salas.servicio.js';
import { paises } from './paises.servicio.js';

export type Politica = 'PERMITIR' | 'ADVERTIR' | 'BLOQUEAR';
export type Momento = 'REGISTRO' | 'INGRESO' | 'APUESTA';
export type Resultado =
  | 'PERMITIDO'
  | 'BLOQUEADO'
  | 'ADVERTIDO'
  | 'SIN_DATO'
  | 'PROVEEDOR_CAIDO';

export interface Veredicto {
  resultado: Resultado;
  paisDetectado: string | null;
  sospechosa: boolean;
  /** Solo cuando resultado es BLOQUEADO. Listo para mostrar. */
  mensaje?: string;
}

export class ErrorUbicacion extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorUbicacion';
  }
}

// ---------------------------------------------------------------------

interface PoliticaCompleta {
  politica: Politica;
  verificarIngreso: boolean;
  bloquearVpn: boolean;
}

let cache: { valor: PoliticaCompleta; expira: number } | null = null;

export async function politica(cliente?: Cliente): Promise<PoliticaCompleta> {
  if (cache && Date.now() < cache.expira) return cache.valor;

  const q = cliente ?? pool;
  const { rows } = await q.query(
    `SELECT clave, valor FROM configuracion
      WHERE clave LIKE 'ubicacion_%' AND eliminado_en IS NULL`,
  );
  const m = new Map<string, string>(rows.map((r) => [r.clave, r.valor]));
  const cruda = m.get('ubicacion_politica') ?? 'ADVERTIR';

  const valor: PoliticaCompleta = {
    politica: (['PERMITIR', 'ADVERTIR', 'BLOQUEAR'].includes(cruda)
      ? cruda
      : 'ADVERTIR') as Politica,
    verificarIngreso: m.get('ubicacion_verificar_ingreso') === 'true',
    bloquearVpn: m.get('ubicacion_bloquear_vpn') === 'true',
  };
  cache = { valor, expira: Date.now() + 60_000 };
  return valor;
}

export function invalidarPolitica(): void {
  cache = null;
}

// =====================================================================
//  Verificación
// =====================================================================

/**
 * Compara el país declarado con el que dice la IP.
 *
 * Nunca lanza por culpa del proveedor: si el servicio de ubicación está
 * caído, se registra el incidente y se deja pasar. Bloquear registros
 * porque una API externa no responde sería peor que el problema que se
 * intenta evitar.
 */
export async function verificar(
  proveedor: ProveedorUbicacion,
  datos: {
    ip: string;
    paisDeclarado: string;
    momento: Momento;
    usuarioId?: string;
  },
): Promise<Veredicto> {
  const reglas = await politica();

  // En desarrollo todas las IPs son locales. Verificar ahí solo
  // bloquearía el trabajo propio.
  if (esIpLocal(datos.ip)) {
    await registrar(datos, null, 'SIN_DATO', false, 'LOCAL');
    return { resultado: 'SIN_DATO', paisDetectado: null, sospechosa: false };
  }

  let ubicacion: Ubicacion;
  try {
    ubicacion = await proveedor.ubicar(datos.ip);
  } catch (e) {
    await registrarIncidenteProveedor(proveedor.nombre, e);
    await registrar(datos, null, 'PROVEEDOR_CAIDO', false, proveedor.nombre);
    return { resultado: 'PROVEEDOR_CAIDO', paisDetectado: null, sospechosa: false };
  }

  const detectado = ubicacion.pais;
  const sospechosa = ubicacion.sospechosa;

  if (sospechosa && reglas.bloquearVpn) {
    await registrar(datos, detectado, 'BLOQUEADO', true, proveedor.nombre);
    return {
      resultado: 'BLOQUEADO',
      paisDetectado: detectado,
      sospechosa: true,
      mensaje: 'No podemos verificar desde dónde te conectas. Desactiva la VPN e inténtalo de nuevo.',
    };
  }

  if (!detectado) {
    await registrar(datos, null, 'SIN_DATO', sospechosa, proveedor.nombre);
    return { resultado: 'SIN_DATO', paisDetectado: null, sospechosa };
  }

  const coinciden = detectado === datos.paisDeclarado;
  if (coinciden) {
    await registrar(datos, detectado, 'PERMITIDO', sospechosa, proveedor.nombre);
    return { resultado: 'PERMITIDO', paisDetectado: detectado, sospechosa };
  }

  // No coinciden. Qué hacer depende de la política, que se cambia desde
  // el panel sin desplegar.
  if (reglas.politica === 'BLOQUEAR') {
    const catalogo = await paises();
    const nombre = catalogo.get(detectado)?.nombre ?? detectado;
    await registrar(datos, detectado, 'BLOQUEADO', sospechosa, proveedor.nombre);
    return {
      resultado: 'BLOQUEADO',
      paisDetectado: detectado,
      sospechosa,
      mensaje: catalogo.has(detectado)
        ? `Tu conexión viene de ${nombre}. Regístrate con ese país.`
        : `Por ahora no operamos en ${nombre}.`,
    };
  }

  const resultado: Resultado =
    reglas.politica === 'ADVERTIR' ? 'ADVERTIDO' : 'PERMITIDO';
  await registrar(datos, detectado, resultado, sospechosa, proveedor.nombre);
  return { resultado, paisDetectado: detectado, sospechosa };
}

async function registrar(
  datos: { ip: string; paisDeclarado: string; momento: Momento; usuarioId?: string },
  detectado: string | null,
  resultado: Resultado,
  sospechosa: boolean,
  proveedor: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO verificaciones_ubicacion
       (usuario_id, momento, ip, pais_declarado, pais_detectado,
        coinciden, sospechosa, resultado, proveedor)
     VALUES ($1,$2,$3::inet,$4,$5,$6,$7,$8,$9)`,
    [
      datos.usuarioId ?? null,
      datos.momento,
      esIpLocal(datos.ip) ? null : datos.ip,
      datos.paisDeclarado,
      detectado,
      detectado === null ? null : detectado === datos.paisDeclarado,
      sospechosa,
      resultado,
      proveedor,
    ],
  );
}

async function registrarIncidenteProveedor(
  proveedor: string,
  error: unknown,
): Promise<void> {
  await pool
    .query(
      `INSERT INTO incidentes (tipo, severidad, detalle) VALUES ($1,$2,$3)`,
      [
        'UBICACION_PROVEEDOR_CAIDO',
        'MEDIA',
        JSON.stringify({
          proveedor,
          error: error instanceof Error ? error.message : String(error),
        }),
      ],
    )
    .catch(() => undefined);
}

/** Guarda en la cuenta lo que se detectó. Se llama tras crear el usuario. */
export async function guardarEnUsuario(
  usuarioId: string,
  ip: string,
  veredicto: Veredicto,
): Promise<void> {
  await enTransaccion(async (c) => {
    await c.query(
      `UPDATE usuarios
          SET ip_registro = $2::inet,
              pais_detectado = $3,
              ubicacion_sospechosa = $4,
              pais_verificado_en = now()
        WHERE id = $1`,
      [
        usuarioId,
        esIpLocal(ip) ? null : ip,
        veredicto.paisDetectado,
        veredicto.sospechosa,
      ],
    );
  }, usuarioId);
}

// =====================================================================
//  Consulta para el panel
// =====================================================================

export async function discrepancias(limite = 100): Promise<unknown[]> {
  const { rows } = await pool.query(
    `SELECT * FROM v_discrepancias_ubicacion LIMIT $1`,
    [limite],
  );
  return rows;
}

export async function resumenVerificaciones(): Promise<{
  resultado: string;
  total: number;
}[]> {
  const { rows } = await pool.query(
    `SELECT resultado, count(*)::int AS total
       FROM verificaciones_ubicacion
      WHERE creado_en > now() - interval '30 days'
      GROUP BY resultado ORDER BY total DESC`,
  );
  return rows;
}

/**
 * Saca la IP real del visitante.
 *
 * Detrás de un proxy o balanceador, `socket.remoteAddress` es la del
 * proxy, no la del usuario. La verdadera viene en `x-forwarded-for`,
 * y ahí el primer valor de la lista es el cliente original.
 *
 * ⚠️ Esa cabecera la puede falsificar cualquiera. Solo es de fiar si el
 * servidor está detrás de un proxy propio que la reescriba (Cloudflare,
 * nginx). Sin proxy, hay que ignorarla.
 */
export function ipDe(
  cabeceras: Record<string, string | string[] | undefined>,
  socket: string,
  confiarEnProxy = false,
): string {
  if (confiarEnProxy) {
    const reenviada = cabeceras['x-forwarded-for'];
    const cruda = Array.isArray(reenviada) ? reenviada[0] : reenviada;
    if (cruda) return cruda.split(',')[0].trim();
  }
  return socket;
}
