/**
 * Contrato del proveedor de geolocalización por IP.
 *
 * Va detrás de una interfaz por la misma razón que la pasarela de pagos
 * y los datos deportivos: en local nunca se ve una IP real —todo llega
 * como 127.0.0.1— y cambiar de proveedor no debe tocar el resto del
 * sistema.
 *
 * Este archivo NO habla con la base de datos.
 */

export interface Ubicacion {
  /** Código ISO de dos letras, o null si no se pudo determinar. */
  pais: string | null;
  /** Alguna señal de que la IP viene de una VPN o proxy. */
  sospechosa: boolean;
  proveedor: string;
}

export interface ProveedorUbicacion {
  nombre: string;
  ubicar(ip: string): Promise<Ubicacion>;
}

/** IPs que nunca corresponden a un país: red local, loopback, privadas. */
export function esIpLocal(ip: string): boolean {
  if (!ip) return true;
  const limpia = ip.replace(/^::ffff:/, '');
  return (
    limpia === '127.0.0.1' ||
    limpia === '::1' ||
    limpia === 'localhost' ||
    limpia.startsWith('10.') ||
    limpia.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(limpia)
  );
}

// =====================================================================
//  Simulado — desarrollo local y pruebas
// =====================================================================

export class UbicacionSimulada implements ProveedorUbicacion {
  nombre = 'SIMULADO';

  private mapa = new Map<string, Ubicacion>();
  /** Qué devolver para IPs no registradas. En local todas caen aquí. */
  public porDefecto: string | null = null;
  public fallar = false;

  registrar(ip: string, pais: string, sospechosa = false): void {
    this.mapa.set(ip, { pais, sospechosa, proveedor: this.nombre });
  }

  limpiar(): void {
    this.mapa.clear();
    this.porDefecto = null;
    this.fallar = false;
  }

  async ubicar(ip: string): Promise<Ubicacion> {
    if (this.fallar) throw new Error('Proveedor de ubicación no disponible');
    const guardada = this.mapa.get(ip);
    if (guardada) return guardada;
    return { pais: this.porDefecto, sospechosa: false, proveedor: this.nombre };
  }
}

// =====================================================================
//  Real — ipinfo.io
// =====================================================================

/**
 * Implementación contra ipinfo.io.
 *
 * Se eligió por tener un plan gratuito suficiente para empezar y no
 * requerir descargar una base de datos. MaxMind es más preciso pero
 * exige mantener un archivo actualizado en el servidor.
 *
 * Cambiar de proveedor es escribir otra clase con este mismo contrato.
 */
export class UbicacionIpinfo implements ProveedorUbicacion {
  nombre = 'IPINFO';

  constructor(private token: string) {}

  async ubicar(ip: string): Promise<Ubicacion> {
    const respuesta = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${this.token}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!respuesta.ok) {
      throw new Error(`ipinfo respondió ${respuesta.status}`);
    }
    const datos = (await respuesta.json()) as {
      country?: string;
      privacy?: { vpn?: boolean; proxy?: boolean; tor?: boolean };
      bogon?: boolean;
    };

    return {
      pais: datos.country ?? null,
      // El detalle de privacidad solo viene en los planes de pago. Sin
      // él, `sospechosa` queda en false: es preferible no marcar a
      // nadie que marcar a todos.
      sospechosa: Boolean(
        datos.privacy?.vpn || datos.privacy?.proxy || datos.privacy?.tor,
      ),
      proveedor: this.nombre,
    };
  }
}
