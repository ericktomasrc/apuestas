'use strict';

/**
 * El muro.
 *
 * Lo que la gente viene a hacer es encontrar una sala que necesite su
 * lado. Por eso el filtro por defecto es "les falta gente": una sala
 * completa no se puede tomar, y mostrarla arriba es hacerle perder el
 * tiempo a quien busca dónde entrar.
 *
 * Debajo de las salas van los PARTIDOS SIN SALA. Es la mitad que
 * faltaba: con una sola sala abierta y catorce partidos disponibles,
 * la pantalla parecía vacía cuando en realidad había de sobra que
 * hacer. Una sala que nadie abrió todavía no es un hueco, es el turno
 * de alguien.
 *
 * Se ve con cuenta y sin ella. La cuenta se pide al apostar o al
 * crear, no al mirar — y se pide ahí, no con un aviso permanente
 * arriba: anunciarle un problema a alguien que todavía no lo tiene
 * solo estorba.
 */
PANTALLAS.muro = async () => {
  const filtro = S.datos.filtroMuro ?? 'faltan';
  const consulta = filtro === 'faltan' ? '?soloNecesitanGente=true' : '';

  // En paralelo: la lista de salas es lo que importa, lo demás
  // acompaña. Si la actividad, las ligas o los partidos fallan, el
  // muro se muestra igual.
  const [r, act, lig, par] = await Promise.all([
    api('/salas' + consulta),
    api('/actividad?limite=12').catch(() => ({ actividad: [] })),
    api('/ligas').catch(() => ({ ligas: [] })),
    api('/partidos?limite=30').catch(() => ({ partidos: [] })),
  ]);

  const salas = r.salas ?? [];
  const partidos = par.partidos ?? [];
  S.datos.actividad = act.actividad ?? [];
  S.datos.ligas = lig.ligas ?? [];

  // Un partido sin salas es una oportunidad; uno que ya tiene sala se
  // muestra arriba, en la lista de salas, y repetirlo aquí sería
  // ofrecer dos veces lo mismo.
  const libres = partidos.filter(p => !p.salas_abiertas);

  pintar(armazon(`
    ${portada(salas.length, libres.length)}

    <div class="filtros">
      ${[['faltan','Les falta gente'], ['todas','Todas']]
        .map(([id, nombre]) => `
          <button class="filtro ${filtro === id ? 'activo' : ''}"
            onclick="S.datos.filtroMuro='${id}';ir('muro')">${nombre}</button>`).join('')}
    </div>

    ${salas.length === 0
      ? vacioMuro(filtro, libres.length)
      : `<div class="rejilla-salas">${salas.map(tarjetaSala).join('')}</div>`}

    ${libres.length ? `
      <div class="seccion">
        <h2 class="seccion-titulo">Sin sala todavía</h2>
        <p class="seccion-sub">
          Nadie ha abierto una sala para estos partidos. Abrirla no cuesta
          nada y no te obliga a apostar.</p>
      </div>
      <div class="rejilla-salas">
        ${libres.slice(0, 6).map(tarjetaOportunidad).join('')}
      </div>
      ${libres.length > 6 ? `
        <button class="btn btn-plano btn-ancho" style="margin-top:12px"
          onclick="ir('crear')">Ver los ${libres.length} partidos</button>` : ''}
    ` : ''}

    <div class="solo-angosto" style="margin-top:22px">
      ${bloqueActividad(act.actividad ?? [], 4)}
    </div>
  `,
  `
    ${bloqueActividad(act.actividad ?? [], 5)}
    ${bloqueLigas(lig.ligas ?? [], 5)}
  `));
};

/**
 * La banda de portada.
 *
 * Antes ocupaba un tercio de la pantalla para decir dos frases y dos
 * números, y empujaba la primera sala fuera de la vista. Ahora es una
 * línea: la frase a la izquierda, las cifras a la derecha.
 *
 * Las cifras se quedan porque son las dos formas de participar —entrar
 * a una sala que existe, o abrir la que falta— y porque son la única
 * señal de que aquí está pasando algo.
 *
 * Ya no hay botón: «Crear» vive en el menú, dos centímetros más
 * arriba. Dos puertas a lo mismo, una encima de la otra, no duplican
 * las creaciones; solo ocupan alto.
 */
function portada(cuantasSalas, cuantosLibres) {
  return `
  <section class="portada">
    <h1>Apuesta con gente, no con una casa</h1>
    <div class="portada-cifras">
      <div>
        <b>${cuantasSalas}</b>
        <span>${cuantasSalas === 1 ? 'sala abierta' : 'salas abiertas'}</span>
      </div>
      <div>
        <b>${cuantosLibres}</b>
        <span>${cuantosLibres === 1 ? 'partido sin sala' : 'partidos sin sala'}</span>
      </div>
    </div>
  </section>`;
}

/**
 * Tarjeta de sala.
 *
 * Muestra un solo mercado —el que más lejos está de completarse— para
 * que la tarjeta quepa de un vistazo. El resto se ve al entrar.
 */
function tarjetaSala(s) {
  const mercados = s.mercados ?? [];
  const principal = [...mercados].sort((a, b) => {
    const da = Math.abs(Number(a.totalFavor) - Number(a.totalContra));
    const db = Math.abs(Number(b.totalFavor) - Number(b.totalContra));
    return db - da;
  })[0];

  const destacada = s.destacada_hasta && new Date(s.destacada_hasta) > new Date();
  const lleno = s.tope_participantes
    ? Math.round((s.participantes / s.tope_participantes) * 100) : 0;

  return `
  <article class="tarjeta ${destacada ? 'destacada' : ''}"
       onclick="ir('sala','${s.id}')" role="button" tabindex="0"
       onkeydown="if(event.key==='Enter')ir('sala','${s.id}')">
    ${destacada ? '<div class="marca-destacada">Destacada</div>' : ''}

    <div class="t-cab">
      <span class="chip">${esc(s.liga)}</span>
      <span class="chip-tiempo">${cuando(s.inicia_en)}</span>
    </div>

    <h3 class="t-partido">
      ${escudosPartido(s)}
      <span>${esc(s.equipo_local)} <em>vs</em> ${esc(s.equipo_visitante)}</span>
    </h3>

    <div class="t-meta">
      ${s.anfitrion ? `sala de <b>${esc(s.anfitrion)}</b> · ` : ''}
      ${s.participantes} de ${s.tope_participantes}
      <span class="t-lleno"><i style="width:${Math.min(lleno, 100)}%"></i></span>
    </div>

    ${principal ? barraBalance({
      total_favor: principal.totalFavor,
      total_contra: principal.totalContra,
      etiqueta_favor: principal.etiquetaFavor,
      etiqueta_contra: principal.etiquetaContra,
    }) : ''}

    <div class="t-pie">
      <span>Desde ${plata(s.monto_minimo_centavos)}${
        mercados.length > 1 ? ` · ${mercados.length} apuestas` : ''}</span>
      <span class="t-entrar">Entrar
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.4" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </span>
    </div>
  </article>`;
}

/**
 * Tarjeta de partido sin sala.
 *
 * Deliberadamente parecida a la de sala pero sin barra de balance: no
 * hay nada que balancear todavía. El hueco donde iría la barra lo
 * ocupa la invitación, que es lo único que puede pasar aquí.
 */
function tarjetaOportunidad(p) {
  return `
  <article class="tarjeta oportunidad"
       onclick="ir('crear')" role="button" tabindex="0"
       onkeydown="if(event.key==='Enter')ir('crear')">
    <div class="t-cab">
      <span class="chip">${esc(p.liga)}</span>
      <span class="chip-tiempo">${cuando(p.inicia_en)}</span>
    </div>

    <h3 class="t-partido">
      ${escudosPartido(p)}
      <span>${esc(p.equipo_local)} <em>vs</em> ${esc(p.equipo_visitante)}</span>
    </h3>

    <div class="invitacion">
      <span>Nadie ha abierto sala</span>
      <b>Sé el primero</b>
    </div>

    <div class="t-pie">
      <span>${(p.mercados ?? []).length} tipo(s) de apuesta</span>
      <span class="t-entrar">Abrir sala
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </span>
    </div>
  </article>`;
}

function vacioMuro(filtro, libres) {
  return `
  <div class="vacio">
    <h3>${filtro === 'faltan' ? 'Todas están completas' : 'Todavía no hay salas'}</h3>
    <p>${filtro === 'faltan'
      ? 'Nadie necesita contraparte ahora mismo.'
      : 'Sé el primero: elige un partido y define la apuesta.'}
      ${libres > 0
        ? ` Hay ${libres} partido(s) esperando que alguien abra la suya.`
        : ''}</p>
    <button class="btn btn-favor" onclick="ir('crear')">Crear una sala</button>
  </div>`;
}

// ---------------------------------------------------------------------
//  Columna lateral
// ---------------------------------------------------------------------

/**
 * Los bloques laterales siempre aparecen, tengan datos o no.
 *
 * Un hueco donde antes había algo se lee como un error. Y una columna
 * que aparece y desaparece hace saltar el resto de la página.
 *
 * Se muestran como máximo cinco filas y el resto vive detrás de «Ver
 * todas»: la columna tiene altura fija, así que una lista larga la
 * haría crecer hasta el final de la página.
 */
function bloqueActividad(lista, tope) {
  const agrupada = agruparActividad(lista);
  const hay = agrupada.length > 0;

  return `
  <div class="bloque">
    <h3>Qué está pasando ${hay ? `<span>${agrupada.length}</span>` : ''}</h3>
    ${hay
      ? agrupada.slice(0, tope).map(filaActividad).join('')
      : `<div class="bloque-vacio">
           Cuando alguien abra una sala o gane una apuesta, aparece aquí.
         </div>`}
    ${agrupada.length > tope
      ? `<button class="bloque-mas" onclick="verTodaActividad()">
           Ver las ${agrupada.length}
         </button>` : ''}
  </div>`;
}

/**
 * Junta los eventos repetidos en una sola línea.
 *
 * Alguien probando el sistema abre seis salas del mismo partido en dos
 * minutos, y la columna queda con seis filas idénticas que no dicen
 * nada nuevo. «erick abrió 6 salas de X» ocupa una y dice lo mismo.
 */
function agruparActividad(lista) {
  const salida = [];
  for (const a of lista) {
    const d = a.datos ?? {};
    const partido = a.equipo_local
      ? `${a.equipo_local} vs ${a.equipo_visitante}`
      : `${d.local ?? ''} vs ${d.visitante ?? ''}`;
    const clave = `${a.tipo}|${a.alias ?? ''}|${partido}`;

    const previo = salida.find(x => x.clave === clave);
    if (previo) { previo.veces++; continue; }
    salida.push({ ...a, clave, partido, veces: 1 });
  }
  return salida;
}

function bloqueLigas(lista, tope) {
  const hay = lista.length > 0;
  const partidos = lista.reduce((t, l) => t + l.partidos, 0);
  return `
  <div class="bloque">
    <h3>Dónde hay partidos ${hay ? `<span>${partidos}</span>` : ''}</h3>
    ${hay
      ? lista.slice(0, tope).map(filaLiga).join('')
      : `<div class="bloque-vacio">
           Todavía no hay ligas con partidos por jugarse.
         </div>`}
    ${lista.length > tope
      ? `<button class="bloque-mas" onclick="verTodasLigas()">
           Ver las ${lista.length} ligas
         </button>` : ''}
  </div>`;
}

function filaLiga(l) {
  return `
  <button class="bloque-fila" style="width:100%" onclick="ir('crear')">
    <span style="text-align:left;min-width:0">
      ${esc(l.nombre)}
      <small>${esc(l.deporte)}${l.pais ? ' · ' + esc(l.pais) : ''}</small>
    </span>
    <span style="text-align:right;flex-shrink:0">
      <b>${l.partidos}</b>
      <small>${l.salas_abiertas} sala(s)</small>
    </span>
  </button>`;
}

/**
 * Lista completa de actividad, con filtro por tipo.
 *
 * El filtro por tipo es el útil: quien busca dónde entrar quiere ver
 * salas nuevas, no quién ganó ayer.
 */
function verTodaActividad(filtro = 'todo') {
  const lista = agruparActividad(S.datos.actividad ?? []);
  const filtrada = filtro === 'todo' ? lista : lista.filter(a => a.tipo === filtro);

  const tipos = [
    ['todo', 'Todo'],
    ['SALA_CREADA', 'Salas nuevas'],
    ['SALA_BALANCEADA', 'Completas'],
    ['RESULTADO_GANADOR', 'Ganadores'],
  ].filter(([id]) => id === 'todo' || lista.some(a => a.tipo === id));

  hoja('Qué está pasando', `${lista.length} en las últimas horas`, `
    <div class="filtros">
      ${tipos.map(([id, nombre]) => `
        <button class="filtro ${filtro === id ? 'activo' : ''}"
          onclick="verTodaActividad('${id}')">${nombre}</button>`).join('')}
    </div>
    <div class="bloque" style="margin:0">
      ${filtrada.length
        ? filtrada.map(filaActividad).join('')
        : '<div class="bloque-vacio">Nada de este tipo por ahora.</div>'}
    </div>`);
}

/** Lista completa de ligas, con filtro por deporte. */
function verTodasLigas(filtro = 'todo') {
  const lista = S.datos.ligas ?? [];
  const filtrada = filtro === 'todo'
    ? lista : lista.filter(l => l.deporte_clave === filtro);

  const deportes = [...new Set(lista.map(l => l.deporte_clave))];

  hoja('Dónde hay partidos', `${lista.length} liga(s) con partidos por jugarse`, `
    ${deportes.length > 1 ? `
      <div class="filtros">
        <button class="filtro ${filtro === 'todo' ? 'activo' : ''}"
          onclick="verTodasLigas('todo')">Todos</button>
        ${deportes.map(d => {
          const nombre = lista.find(l => l.deporte_clave === d)?.deporte ?? d;
          return `<button class="filtro ${filtro === d ? 'activo' : ''}"
            onclick="verTodasLigas('${d}')">${esc(nombre)}</button>`;
        }).join('')}
      </div>` : ''}
    <div class="bloque" style="margin:0">
      ${filtrada.length
        ? filtrada.map(filaLiga).join('')
        : '<div class="bloque-vacio">Nada de este deporte por ahora.</div>'}
    </div>
    <p class="pista" style="margin-top:14px">
      El número grande son los partidos disponibles; abajo, cuántas salas
      hay abiertas para ellos.</p>`);
}

/**
 * Una línea del muro de actividad.
 *
 * Las derrotas NO aparecen: exponer las pérdidas de alguien es
 * humillante y lo empuja a irse. Hay un `CHECK` en la tabla que impide
 * siquiera insertarlas.
 */
function filaActividad(a) {
  const d = a.datos ?? {};
  const partido = a.partido ?? (a.equipo_local
    ? `${a.equipo_local} vs ${a.equipo_visitante}`
    : `${d.local ?? ''} vs ${d.visitante ?? ''}`);
  const veces = a.veces ?? 1;

  const textos = {
    SALA_CREADA: ['creada', '+',
      veces > 1
        ? `<strong>${esc(a.alias ?? 'Alguien')}</strong> abrió ${veces} salas de ${esc(partido)}`
        : `<strong>${esc(a.alias ?? 'Alguien')}</strong> abrió una sala de ${esc(partido)}`],
    SALA_BALANCEADA: ['llena', '=',
      `La sala de ${esc(partido)} se completó`],
    RESULTADO_GANADOR: ['gano', '★',
      `<strong>${esc(a.alias ?? 'Alguien')}</strong> ganó en ${esc(partido)}`],
    RACHA: ['gano', '★',
      `<strong>${esc(a.alias ?? 'Alguien')}</strong> lleva ${esc(d.racha ?? '')} seguidas`],
    RESUMEN_DIARIO: ['llena', '·', esc(d.texto ?? 'Resumen del día')],
  };
  const [clase, simbolo, texto] = textos[a.tipo] ?? ['creada', '·', esc(a.tipo)];

  const clic = a.sala_id
    ? `onclick="ir('sala','${a.sala_id}')" style="cursor:pointer"` : '';

  return `
  <div class="actividad" ${clic}>
    <div class="punto ${clase}">${simbolo}</div>
    <div class="actividad-texto">
      ${texto}
      <time>${cuandoPaso(a.fecha_crea)}</time>
    </div>
  </div>`;
}

/** "hace 5 min" dice más que una hora exacta para algo que acaba de pasar. */
function cuandoPaso(fecha) {
  const min = Math.round((Date.now() - new Date(fecha)) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}
