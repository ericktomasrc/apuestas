/**
 * Contrato del proveedor de datos deportivos.
 *
 * El proveedor va detrás de una interfaz por la misma razón que la
 * pasarela de pagos: se puede construir y probar todo el flujo sin
 * depender de una API externa, y cambiar de proveedor no toca el resto
 * del sistema.
 *
 * Este archivo NO habla con la base de datos: solo define el contrato y
 * una implementación simulada. La sincronización vive en el servicio.
 */

export type EstadoPartido =
  | 'PROGRAMADO'
  | 'EN_JUEGO'
  | 'FINALIZADO'
  | 'SUSPENDIDO'
  | 'POSTERGADO'
  | 'CANCELADO';

export interface FixtureExterno {
  apiId: string;
  ligaApiId: string;
  equipoLocal: string;
  equipoVisitante: string;
  iniciaEn: Date;
  estado: EstadoPartido;
}

export interface ResultadoExterno {
  apiId: string;
  estado: EstadoPartido;
  iniciaEn: Date;
  golesLocal?: number | null;
  golesVisitante?: number | null;
  cornersLocal?: number | null;
  cornersVisitante?: number | null;
  tarjetasLocal?: number | null;
  tarjetasVisitante?: number | null;
  puntosLocal?: number | null;
  puntosVisitante?: number | null;
  /** Respuesta cruda del proveedor. Es la evidencia ante un reclamo. */
  payload: unknown;
}

/** Cuota implícita del mercado según el proveedor. No se usa para
 *  liquidar —la cuota aquí siempre es 2.0— sino para sugerirle al
 *  anfitrión la línea que sí va a llenarse. */
export interface CuotaExterna {
  apiId: string;
  tipoMercado: string;
  linea: number;
  probabilidadFavor: number;
}

/**
 * Contexto de un partido: forma reciente e historial.
 *
 * ⚠️ Se devuelven los DATOS, nunca una probabilidad.
 *
 * Si la app mostrara «Botafogo 62%» con todo pagando 2.0x, estaría
 * publicando que un lado es matemáticamente mejor. La consecuencia no
 * es gente mejor informada: es que todos van al mismo lado y las salas
 * dejan de llenarse. El producto depende de que la gente no esté de
 * acuerdo.
 *
 * Los mismos datos sin veredicto informan igual y dejan que cada quien
 * saque su conclusión.
 */
export interface FormaEquipo {
  /** Últimos partidos, del más reciente al más antiguo. */
  ultimos: ('G' | 'E' | 'P')[];
  golesFavor: number;
  golesContra: number;
  partidos: number;
}

export interface ContextoPartido {
  local: FormaEquipo;
  visitante: FormaEquipo;
  /** Enfrentamientos directos recientes. */
  historial: {
    jugados: number;
    ganoLocal: number;
    ganoVisitante: number;
    empates: number;
  } | null;
}

export interface ProveedorDeportes {
  nombre: string;
  fixtures(desde: Date, hasta: Date, ligas: string[]): Promise<FixtureExterno[]>;
  resultados(apiIds: string[]): Promise<ResultadoExterno[]>;
  cuotas?(apiId: string): Promise<CuotaExterna[]>;
  /**
   * Opcional: no todos los proveedores lo dan, y la app funciona sin
   * esto. Si devuelve null, la interfaz simplemente no muestra el
   * bloque de contexto.
   */
  contexto?(apiId: string): Promise<ContextoPartido | null>;
}

export class ErrorProveedor extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorProveedor';
  }
}

// =====================================================================
//  Proveedor simulado — desarrollo local y pruebas
// =====================================================================

export class ProveedorSimulado implements ProveedorDeportes {
  nombre = 'SIMULADO';

  /**
   * Contexto inventado, estable por partido.
   *
   * Se deriva del identificador para que el mismo partido dé siempre
   * lo mismo: datos que cambian en cada recarga confunden más que no
   * tener datos.
   */
  async contexto(apiId: string): Promise<ContextoPartido | null> {
    let semilla = 0;
    for (const c of apiId) semilla = (semilla * 31 + c.charCodeAt(0)) % 100000;
    const azar = (): number => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla / 2147483648;
    };

    const forma = (): FormaEquipo => {
      const ultimos = Array.from({ length: 5 }, () => {
        const r = azar();
        return r < 0.45 ? 'G' : r < 0.7 ? 'E' : 'P';
      }) as ('G' | 'E' | 'P')[];
      return {
        ultimos,
        golesFavor: Number((0.6 + azar() * 2.2).toFixed(1)),
        golesContra: Number((0.5 + azar() * 1.8).toFixed(1)),
        partidos: 5,
      };
    };

    const jugados = Math.floor(azar() * 5);
    const ganoLocal = Math.floor(azar() * (jugados + 1));
    const empates = Math.floor(azar() * (jugados - ganoLocal + 1));

    return {
      local: forma(),
      visitante: forma(),
      historial: jugados > 0
        ? { jugados, ganoLocal, empates, ganoVisitante: jugados - ganoLocal - empates }
        : null,
    };
  }

  private fixturesGuardados = new Map<string, FixtureExterno>();
  private resultadosGuardados = new Map<string, ResultadoExterno>();
  /** Para probar el camino de error sin depender de la red */
  public fallar = false;

  cargarFixture(f: FixtureExterno): void {
    this.fixturesGuardados.set(f.apiId, f);
  }

  cargarResultado(r: ResultadoExterno): void {
    this.resultadosGuardados.set(r.apiId, r);
  }

  limpiar(): void {
    this.fixturesGuardados.clear();
    this.resultadosGuardados.clear();
    this.fallar = false;
  }

  async fixtures(desde: Date, hasta: Date, _ligas: string[]): Promise<FixtureExterno[]> {
    if (this.fallar) throw new ErrorProveedor('RED', 'Proveedor no disponible');
    // Deliberadamente NO se filtra por liga.
    //
    // Un proveedor real puede devolver ligas que no pediste, o aplicar
    // el filtro de forma aproximada. El guardia está en
    // sincronizarFixtures: si el simulador filtrara aquí, haría el
    // trabajo del guardia y la prueba no verificaría nada.
    return [...this.fixturesGuardados.values()].filter(
      (f) => f.iniciaEn >= desde && f.iniciaEn <= hasta,
    );
  }

  async resultados(apiIds: string[]): Promise<ResultadoExterno[]> {
    if (this.fallar) throw new ErrorProveedor('RED', 'Proveedor no disponible');
    return apiIds
      .map((id) => this.resultadosGuardados.get(id))
      .filter((r): r is ResultadoExterno => r !== undefined);
  }
}

