/**
 * PROVEEDOR REAL — API-Football (api-sports.io)
 *
 * Implementa el mismo contrato que `ProveedorSimulado`, así que el
 * resto del sistema no se entera de cuál está corriendo.
 *
 * ⚠️ SOBRE EL LÍMITE DIARIO
 *
 * El plan gratuito da 100 peticiones al día. Eso alcanza de sobra
 * —sincronizar una vez al día y consultar resultados cada 5 minutos
 * son menos de 300 al mes— pero solo si no se pide de más.
 *
 * Por eso:
 *   - los resultados se piden POR LIGA Y FECHA, no uno por partido
 *   - las estadísticas solo se piden de partidos ya terminados
 *   - hay caché de 60 segundos para no repetir la misma consulta
 *
 * Sin esas tres cosas, un día de pruebas agota la cuota antes del
 * mediodía y el sistema deja de recibir resultados sin avisar.
 */

import {
  ErrorProveedor,
  type ProveedorDeportes,
  type FixtureExterno,
  type ResultadoExterno,
  type ContextoPartido,
  type FormaEquipo,
  type EstadoPartido,
} from './deportes.proveedor.js';

/**
 * Cómo se traducen los estados de la API a los nuestros.
 *
 * Los que no están aquí se tratan como PROGRAMADO, que es el estado
 * inofensivo: no dispara liquidaciones ni anulaciones.
 */
const ESTADOS: Record<string, EstadoPartido> = {
  TBD: 'PROGRAMADO',
  NS: 'PROGRAMADO',
  '1H': 'EN_JUEGO',
  HT: 'EN_JUEGO',
  '2H': 'EN_JUEGO',
  ET: 'EN_JUEGO',
  BT: 'EN_JUEGO',
  P: 'EN_JUEGO',
  LIVE: 'EN_JUEGO',
  FT: 'FINALIZADO',
  AET: 'FINALIZADO',
  PEN: 'FINALIZADO',
  // Suspendido e interrumpido NO son finalizados: el partido puede
  // reanudarse. Tratarlos como cancelados anularía salas que todavía
  // podrían resolverse.
  SUSP: 'SUSPENDIDO',
  INT: 'SUSPENDIDO',
  PST: 'POSTERGADO',
  CANC: 'CANCELADO',
  ABD: 'CANCELADO',
  AWD: 'CANCELADO',
  WO: 'CANCELADO',
};

interface RespuestaApi<T> {
  errors: unknown;
  results: number;
  response: T[];
}

export class ProveedorApiFootball implements ProveedorDeportes {
  nombre = 'API-FOOTBALL';

  private readonly base: string;
  private readonly clave: string;

  /** Caché corta: evita repetir la misma consulta en un mismo ciclo. */
  private cache = new Map<string, { valor: unknown; expira: number }>();

  /** Cuántas peticiones quedan hoy, según la última respuesta. */
  public restantes: number | null = null;

  constructor(clave?: string, base?: string) {
    const k = clave ?? process.env.API_FOOTBALL_KEY;
    if (!k) {
      throw new ErrorProveedor(
        'SIN_CREDENCIALES',
        'Falta API_FOOTBALL_KEY en el .env',
      );
    }
    this.clave = k;
    this.base = (base ?? process.env.API_FOOTBALL_URL
      ?? 'https://v3.football.api-sports.io').replace(/\/$/, '');
  }

  // -------------------------------------------------------------------
  //  Llamada base
  // -------------------------------------------------------------------

  private async pedir<T>(ruta: string, params: Record<string, string | number>): Promise<T[]> {
    const q = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    );
    const url = `${this.base}/${ruta}?${q}`;

    const enCache = this.cache.get(url);
    if (enCache && Date.now() < enCache.expira) return enCache.valor as T[];

    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        headers: { 'x-apisports-key': this.clave },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      // Un fallo de red no es un fallo del sistema: el proceso lo
      // registra como incidente y vuelve a intentar en el siguiente
      // ciclo.
      throw new ErrorProveedor(
        'SIN_RESPUESTA',
        `No se pudo contactar al proveedor: ${e instanceof Error ? e.message : e}`,
      );
    }

    // Cuántas peticiones quedan hoy. Se guarda para poder avisarlo
    // antes de que se agoten.
    const quedan = respuesta.headers.get('x-ratelimit-requests-remaining');
    if (quedan !== null) this.restantes = Number(quedan);

    if (respuesta.status === 429) {
      throw new ErrorProveedor(
        'CUOTA_AGOTADA',
        'Se agotaron las peticiones del día. El plan gratuito da 100.',
      );
    }
    if (!respuesta.ok) {
      throw new ErrorProveedor(
        'RESPUESTA_INVALIDA',
        `El proveedor respondió ${respuesta.status}`,
      );
    }

    const cuerpo = (await respuesta.json()) as RespuestaApi<T>;

    // La API devuelve 200 con `errors` lleno cuando la clave es mala o
    // un parámetro no le gusta. Sin esta comprobación, un error de
    // credenciales pasaría por «no hay partidos».
    if (cuerpo.errors && !Array.isArray(cuerpo.errors)
        && Object.keys(cuerpo.errors).length > 0) {
      const detalle = JSON.stringify(cuerpo.errors);

      // El más común con el plan gratuito, y el que menos se entiende
      // por sí solo.
      if (detalle.includes('do not have access to this season')) {
        throw new ErrorProveedor(
          'TEMPORADA_SIN_ACCESO',
          'El plan gratuito solo cubre las temporadas 2022-2024. '
          + 'Pon API_FOOTBALL_TEMPORADA=2023 en el .env para trabajar con '
          + 'partidos ya jugados, o sube al plan de pago para la temporada actual.',
        );
      }

      throw new ErrorProveedor(
        'RESPUESTA_INVALIDA',
        `El proveedor rechazó la consulta: ${detalle}`,
      );
    }

    this.cache.set(url, { valor: cuerpo.response, expira: Date.now() + 60_000 });
    return cuerpo.response;
  }

  // -------------------------------------------------------------------
  //  Partidos
  // -------------------------------------------------------------------

  async fixtures(desde: Date, hasta: Date, ligas: string[]): Promise<FixtureExterno[]> {
    const salida: FixtureExterno[] = [];

    // ⚠️ El plan gratuito solo da acceso a las temporadas 2022-2024.
    //
    // Pedir la actual devuelve: «Free plans do not have access to this
    // season, try from 2022 to 2024». No es un error del código.
    //
    // Con `API_FOOTBALL_TEMPORADA` se fija una temporada histórica y
    // el sistema trabaja con partidos ya jugados. Sirve para probar el
    // ciclo completo sin esperar a que se juegue nada: los resultados
    // están ahí desde el primer momento.
    const fijada = process.env.API_FOOTBALL_TEMPORADA;
    const temporada = fijada ? Number(fijada) : desde.getFullYear();

    // Con temporada histórica, el rango de «los próximos 14 días» no
    // encontraría nada: hay que pedir fechas de esa temporada.
    //
    // Tampoco se puede usar `last`: el plan gratuito lo rechaza con
    // «Free plans do not have access to the Last parameter». Solo
    // quedan `from` y `to`.
    const historica = Boolean(fijada);
    if (historica) {
      console.log(
        `  Modo histórico: temporada ${temporada}, partidos reprogramados a hoy`,
      );
    }

    for (const liga of ligas) {
      const filas = await this.pedir<any>('fixtures', {
        league: liga,
        season: temporada,
        // La temporada entera. Cada liga tiene su calendario —la
        // peruana va de febrero a diciembre, la europea de agosto a
        // mayo— así que un mes fijo caería en receso para algunas.
        // Se filtran después: la petición cuesta lo mismo.
        ...(historica
          ? { from: `${temporada}-01-01`, to: `${temporada}-12-31` }
          : {
              from: desde.toISOString().slice(0, 10),
              to: hasta.toISOString().slice(0, 10),
            }),
      });

      // En modo histórico se toman los ÚLTIMOS terminados: una
      // temporada entera son cientos de partidos y no hacen falta
      // tantos para probar. Los últimos porque tienen el resultado
      // completo, con córners y tarjetas.
      const aUsar = historica
        ? filas.filter((f: any) => f.fixture?.status?.short === 'FT').slice(-12)
        : filas;

      if (historica) {
        console.log(`     liga ${liga}: ${filas.length} en ${temporada}, se usan ${aUsar.length}`);
      }

      for (const [i, f] of aUsar.entries()) {
        // En modo histórico se reescriben la fecha y el estado.
        //
        // Un partido de 2023 ya terminado no se puede apostar: la sala
        // se cerraría al instante por estar fuera de plazo. Se lo
        // reprograma a las próximas horas y se marca PROGRAMADO, para
        // poder recorrer el ciclo entero —crear, apostar, cerrar,
        // liquidar— con equipos y resultados de verdad.
        //
        // El `api_id` sigue siendo el real, así que cuando llegue el
        // momento de liquidar el proveedor devuelve el marcador que ya
        // ocurrió. Es una simulación con datos auténticos.
        if (historica) {
          salida.push({
            apiId: String(f.fixture.id),
            ligaApiId: String(f.league.id),
            equipoLocal: f.teams.home.name,
            equipoVisitante: f.teams.away.name,
            // Escalonados cada 2 horas desde dentro de 1 hora.
            iniciaEn: new Date(Date.now() + (1 + i * 2) * 3600_000),
            estado: 'PROGRAMADO',
          });
          continue;
        }

        salida.push({
          apiId: String(f.fixture.id),
          ligaApiId: String(f.league.id),
          equipoLocal: f.teams.home.name,
          equipoVisitante: f.teams.away.name,
          iniciaEn: new Date(f.fixture.date),
          estado: ESTADOS[f.fixture.status.short] ?? 'PROGRAMADO',
        });
      }
    }
    return salida;
  }

  // -------------------------------------------------------------------
  //  Resultados
  // -------------------------------------------------------------------

  async resultados(apiIds: string[]): Promise<ResultadoExterno[]> {
    if (apiIds.length === 0) return [];

    // La API acepta hasta 20 identificadores por petición. Pedirlos
    // de a uno gastaría la cuota veinte veces más rápido.
    const salida: ResultadoExterno[] = [];
    for (let i = 0; i < apiIds.length; i += 20) {
      const lote = apiIds.slice(i, i + 20);
      const filas = await this.pedir<any>('fixtures', { ids: lote.join('-') });

      for (const f of filas) {
        const estado = ESTADOS[f.fixture.status.short] ?? 'PROGRAMADO';

        const r: ResultadoExterno = {
          apiId: String(f.fixture.id),
          estado,
          iniciaEn: new Date(f.fixture.date),
          golesLocal: f.goals?.home ?? null,
          golesVisitante: f.goals?.away ?? null,
          payload: f,
        };

        // Las estadísticas van en otra llamada y solo tienen sentido
        // si el partido terminó. Pedirlas antes gasta cuota para nada.
        if (estado === 'FINALIZADO') {
          const est = await this.estadisticas(String(f.fixture.id));
          Object.assign(r, est);
        }

        salida.push(r);
      }
    }
    return salida;
  }

  /**
   * Córners y tarjetas de un partido terminado.
   *
   * Si la liga no los cubre, la API devuelve la lista vacía y esto
   * devuelve nulos. El sistema lo trata como DATO_NO_DISPONIBLE y
   * anula solo esos mercados, no la sala entera.
   */
  private async estadisticas(fixtureId: string): Promise<Partial<ResultadoExterno>> {
    let filas: any[];
    try {
      filas = await this.pedir<any>('fixtures/statistics', { fixture: fixtureId });
    } catch {
      // Un fallo aquí no puede tumbar la liquidación de los goles,
      // que sí llegaron.
      return {};
    }
    if (filas.length < 2) return {};

    const leer = (equipo: any, tipo: string): number | null => {
      const s = equipo.statistics?.find((x: any) => x.type === tipo);
      const v = s?.value;
      return typeof v === 'number' ? v : null;
    };

    const [local, visita] = filas;

    // Las tarjetas vienen separadas en amarillas y rojas. El mercado
    // cuenta el total.
    const tarjetas = (e: any): number | null => {
      const a = leer(e, 'Yellow Cards');
      const r = leer(e, 'Red Cards');
      if (a === null && r === null) return null;
      return (a ?? 0) + (r ?? 0);
    };

    return {
      cornersLocal: leer(local, 'Corner Kicks'),
      cornersVisitante: leer(visita, 'Corner Kicks'),
      tarjetasLocal: tarjetas(local),
      tarjetasVisitante: tarjetas(visita),
    };
  }

  // -------------------------------------------------------------------
  //  Contexto — forma reciente e historial
  // -------------------------------------------------------------------

  /**
   * ⚠️ Devuelve DATOS, nunca una probabilidad.
   *
   * La API tiene un endpoint `predictions` que da porcentajes. No se
   * usa a propósito: publicar «Botafogo 62%» con todo pagando 2.0x
   * diría que un lado es matemáticamente mejor, todos irían ahí y las
   * salas dejarían de llenarse.
   */
  async contexto(apiId: string): Promise<ContextoPartido | null> {
    let partido: any;
    try {
      const filas = await this.pedir<any>('fixtures', { id: apiId });
      partido = filas[0];
    } catch {
      return null;
    }
    if (!partido) return null;

    const local = partido.teams.home.id;
    const visita = partido.teams.away.id;
    const liga = partido.league.id;
    const temporada = partido.league.season;

    const [formaLocal, formaVisita, h2h] = await Promise.all([
      this.forma(local, liga, temporada),
      this.forma(visita, liga, temporada),
      this.historial(local, visita),
    ]);

    if (!formaLocal || !formaVisita) return null;
    return { local: formaLocal, visitante: formaVisita, historial: h2h };
  }

  private async forma(
    equipo: number, liga: number, temporada: number,
  ): Promise<FormaEquipo | null> {
    try {
      const filas = await this.pedir<any>('teams/statistics', {
        team: equipo, league: liga, season: temporada,
      });
      const s = filas as any;
      if (!s?.form) return null;

      // `form` es una cadena tipo "WDLWW". Se toman los cinco últimos
      // y se traducen a nuestras letras.
      const mapa: Record<string, 'G' | 'E' | 'P'> = { W: 'G', D: 'E', L: 'P' };
      const ultimos = String(s.form).slice(-5).split('')
        .map((c) => mapa[c]).filter(Boolean).reverse() as ('G' | 'E' | 'P')[];

      const jugados = Number(s.fixtures?.played?.total ?? 0) || 1;
      return {
        ultimos,
        golesFavor: Number(((s.goals?.for?.total?.total ?? 0) / jugados).toFixed(1)),
        golesContra: Number(((s.goals?.against?.total?.total ?? 0) / jugados).toFixed(1)),
        partidos: ultimos.length,
      };
    } catch {
      return null;
    }
  }

  private async historial(
    local: number, visita: number,
  ): Promise<ContextoPartido['historial']> {
    try {
      const filas = await this.pedir<any>('fixtures/headtohead', {
        h2h: `${local}-${visita}`, last: 5,
      });
      const jugados = filas.filter((f) => f.fixture.status.short === 'FT');
      if (jugados.length === 0) return null;

      let ganoLocal = 0, ganoVisitante = 0, empates = 0;
      for (const f of jugados) {
        const gl = f.goals.home, gv = f.goals.away;
        // Ojo: en cada enfrentamiento el «local» puede ser distinto.
        // Se cuenta respecto al equipo local del partido ACTUAL.
        const localEsHome = f.teams.home.id === local;
        if (gl === gv) empates++;
        else if ((gl > gv) === localEsHome) ganoLocal++;
        else ganoVisitante++;
      }
      return { jugados: jugados.length, ganoLocal, ganoVisitante, empates };
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------
  //  Diagnóstico
  // -------------------------------------------------------------------

  /**
   * Qué ligas ofrece la API para un país.
   *
   * Se expone para la herramienta de importación: hace falta saber el
   * identificador antes de registrar nada, y buscarlo a mano en el
   * panel web es más lento y más propenso a equivocarse.
   */
  async ligasDe(pais?: string): Promise<unknown[]> {
    // Sin país: TODAS las ligas del mundo en una sola petición.
    if (!pais) return this.pedir<unknown>('leagues', {});
    // La API rechaza tildes. «Perú» da error de validación.
    const sinTilde = pais.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return this.pedir<unknown>('leagues', { country: sinTilde });
  }

  /**
   * TODAS las ligas del proveedor, de todos los países.
   *
   * Son más de mil y cuestan **una sola petición**. Por eso conviene
   * traerlas todas y decidir después: el catálogo se guarda una vez, y
   * la sincronización diaria solo toca las que tengan mercados
   * habilitados.
   */
  async todasLasLigas(): Promise<unknown[]> {
    return this.pedir<unknown>('leagues', {});
  }

  /**
   * Comprueba que la clave sirve y dice cuántas peticiones quedan.
   * No cuenta contra la cuota.
   */
  async estado(): Promise<{ ok: boolean; restantes: number | null; plan?: string }> {
    try {
      const r = await this.pedir<any>('status', {});
      const s = r as any;
      return {
        ok: true,
        restantes: s?.requests
          ? s.requests.limit_day - s.requests.current
          : this.restantes,
        plan: s?.subscription?.plan,
      };
    } catch {
      return { ok: false, restantes: null };
    }
  }
}
