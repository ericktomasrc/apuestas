'use strict';

/**
 * Muro principal.
 *
 * La navegación se separa en dos pestañas: salas ya creadas y partidos
 * disponibles para crear una. Así una lista grande no empuja la otra
 * sección cientos de tarjetas hacia abajo.
 */
PANTALLAS.muro = async () => {
  const seccion = S.datos.seccionMuro ?? 'salas';
  const filtro = 'faltan';
  const consulta = filtro === 'faltan' ? '?soloNecesitanGente=true' : '';
  const limiteSalas = S.datos.limiteSalas ?? 12;
  const limitePartidos = S.datos.limitePartidos ?? 12;
  const ligaSalas = S.datos.ligaSalasMuro ?? 'todas';
  const ligaPartidos = S.datos.ligaPartidosMuro ?? 'todas';

  const [r, act, lig, par] = await Promise.all([
    api('/salas' + consulta),
    api('/actividad?limite=12').catch(() => ({ actividad: [] })),
    api('/ligas').catch(() => ({ ligas: [] })),
    api('/partidos?limite=30').catch(() => ({ partidos: [] })),
  ]);

  const salas = r.salas ?? [];
  const partidos = par.partidos ?? [];
  const libres = partidos.filter(p => !p.salas_abiertas);
  S.datos.actividad = act.actividad ?? [];
  S.datos.ligas = lig.ligas ?? [];

  const ligasSalas = [...new Set(salas.map(s => s.liga).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const ligasPartidos = [...new Set(libres.map(p => p.liga).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));

  const salasFiltradas = ligaSalas === 'todas'
    ? salas
    : salas.filter(s => s.liga === ligaSalas);
  const libresFiltrados = ligaPartidos === 'todas'
    ? libres
    : libres.filter(p => p.liga === ligaPartidos);

  const contenidoSalas = salasFiltradas.length === 0
    ? vacioMuro(filtro, libres.length)
    : `
      <div class="muro-toolbar muro-toolbar-salas">
        <div class="muro-toolbar-izq">
          <div class="filtros muro-filtros">
            <button class="filtro activo" type="button">Con cupos</button>
          </div>
          ${selectorLigaMuro('salas', ligasSalas, ligaSalas)}
        </div>
        <span class="muro-contador">${Math.min(limiteSalas, salasFiltradas.length)} de ${salasFiltradas.length}</span>
      </div>
      <div class="rejilla-salas rejilla-muro rejilla-salas-abiertas">${salasFiltradas.slice(0, limiteSalas).map(tarjetaSala).join('')}</div>
      ${salasFiltradas.length > limiteSalas ? `
        <div class="muro-mas-wrap">
          <button class="btn btn-plano muro-mas" onclick="mostrarMasMuro('salas')">
            Ver más salas
          </button>
        </div>` : ''}`;

  const contenidoPartidos = libresFiltrados.length === 0
    ? `<div class="vacio muro-vacio">
         <h3>No hay partidos disponibles ahora</h3>
         <p>Cuando haya partidos habilitados para crear una sala, aparecerán aquí.</p>
       </div>`
    : `
      <div class="muro-toolbar">
        <div class="muro-toolbar-izq">
          <div>
            <h2 class="seccion-titulo">Partidos disponibles</h2>
            <p class="seccion-sub">Elige un partido y abre una sala.</p>
          </div>
          ${selectorLigaMuro('partidos', ligasPartidos, ligaPartidos)}
        </div>
        <span class="muro-contador">${Math.min(limitePartidos, libresFiltrados.length)} de ${libresFiltrados.length}</span>
      </div>
      <div class="rejilla-salas rejilla-muro rejilla-partidos-disponibles">${libresFiltrados.slice(0, limitePartidos).map(tarjetaOportunidad).join('')}</div>
      ${libresFiltrados.length > limitePartidos ? `
        <div class="muro-mas-wrap">
          <button class="btn btn-plano muro-mas" onclick="mostrarMasMuro('partidos')">
            Ver más partidos
          </button>
        </div>` : ''}`;

  pintar(armazon(`
    <div class="muro-premium">
      ${portada(salas.length, libres.length)}

      <div class="muro-tabs-compactos" role="tablist" aria-label="Explorar TandaBet">
        <button class="muro-tab-compacto ${seccion === 'salas' ? 'activo' : ''}"
          role="tab" aria-selected="${seccion === 'salas'}"
          onclick="cambiarSeccionMuro('salas')">
          Salas disponibles <b>${salas.length}</b>
        </button>
        <button class="muro-tab-compacto ${seccion === 'partidos' ? 'activo' : ''}"
          role="tab" aria-selected="${seccion === 'partidos'}"
          onclick="cambiarSeccionMuro('partidos')">
          Partidos disponibles <b>${libres.length}</b>
        </button>
      </div>

      <section class="muro-feed">
        ${seccion === 'salas' ? contenidoSalas : contenidoPartidos}
      </section>

      <div class="solo-angosto muro-actividad-movil">
        ${bloqueActividad(act.actividad ?? [], 3)}
      </div>

      ${franjaConfianza()}
    </div>
  `,
  `
    ${bloqueSaldoMuro()}
    ${bloqueActividad(act.actividad ?? [], 3)}
    ${bloqueLigas(lig.ligas ?? [], 5)}
    ${promoTandaBet()}
  `));
};


function selectorLigaMuro(tipo, ligas, seleccionada) {
  if (!ligas.length) return '';
  return `
    <label class="muro-liga-filtro">
      <span>Liga</span>
      <select onchange="cambiarLigaMuro('${tipo}', this.value)"
              aria-label="Filtrar por liga">
        <option value="todas"${seleccionada === 'todas' ? ' selected' : ''}>Todas las ligas</option>
        ${ligas.map(liga => `
          <option value="${esc(liga)}"${seleccionada === liga ? ' selected' : ''}>
            ${esc(liga)}
          </option>`).join('')}
      </select>
    </label>`;
}

function cambiarLigaMuro(tipo, liga) {
  if (tipo === 'salas') {
    S.datos.ligaSalasMuro = liga;
    S.datos.limiteSalas = 12;
  } else {
    S.datos.ligaPartidosMuro = liga;
    S.datos.limitePartidos = 12;
  }
  ir('muro');
}

function cambiarSeccionMuro(seccion) {
  S.datos.seccionMuro = seccion;
  S.datos.limiteSalas = 12;
  S.datos.limitePartidos = 12;
  ir('muro');
}

function cambiarFiltroSalas(filtro) {
  S.datos.filtroMuro = filtro;
  S.datos.limiteSalas = 12;
  ir('muro');
}

function mostrarMasMuro(tipo) {
  if (tipo === 'partidos') S.datos.limitePartidos = (S.datos.limitePartidos ?? 12) + 12;
  else S.datos.limiteSalas = (S.datos.limiteSalas ?? 12) + 12;
  ir('muro');
}

/** Portada deportiva: imagen aprobada en alta resolución. */
function portada() {
  return `
  <section class="portada portada-tandabet portada-imagen" aria-label="TandaBet · El fútbol se vive mejor cuando compites">
    <img src="hero-tandabet.png" alt="TandaBet · El fútbol se vive mejor cuando compites">
  </section>`;
}

/**
 * Tarjeta de sala.
 * Muestra el mercado con mayor diferencia para entender de un vistazo
 * dónde existe espacio disponible.
 */
function tarjetaSala(s) {
  const mercados = s.mercados ?? [];
  const principal = [...mercados].sort((a, b) => {
    const da = Math.abs(Number(a.totalFavor) - Number(a.totalContra));
    const db = Math.abs(Number(b.totalFavor) - Number(b.totalContra));
    return db - da;
  })[0];

  const destacada = s.destacada_hasta && new Date(s.destacada_hasta) > new Date();

  return `
  <article class="tarjeta sala-card-compacta ${destacada ? 'destacada' : ''}"
       onclick="ir('sala','${s.id}')" role="button" tabindex="0"
       onkeydown="if(event.key==='Enter')ir('sala','${s.id}')">
    ${destacada ? '<div class="marca-destacada">Destacada</div>' : ''}

    <div class="t-cab">
      <span class="chip">${esc(s.liga)}</span>
      <span class="chip-tiempo">${cuando(s.inicia_en)}</span>
    </div>

    <div class="match-visual match-visual-sala">
      ${escudosPartido(s)}
      <span class="match-vs" aria-hidden="true">VS</span>
      <span class="match-nombre match-nombre-local">${esc(s.equipo_local)}</span>
      <span class="match-nombre match-nombre-visita">${esc(s.equipo_visitante)}</span>
    </div>

    <div class="sala-card-info">
      <div class="sala-card-meta">
        ${s.anfitrion ? `Sala de <b>${esc(s.anfitrion)}</b> · ` : ''}
        ${s.participantes ?? 0} de ${s.tope_participantes}
      </div>

      ${principal ? `<div class="sala-card-balance">${barraBalance({
        total_favor: principal.totalFavor,
        total_contra: principal.totalContra,
        etiqueta_favor: principal.etiquetaFavor,
        etiqueta_contra: principal.etiquetaContra,
      })}</div>` : ''}

      <div class="t-pie">
        <span>Desde ${plata(s.monto_minimo_centavos)}${
          mercados.length > 1 ? ` · ${mercados.length} apuestas` : ''}</span>
        <span class="t-entrar">Entrar
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.4" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </span>
      </div>
    </div>
  </article>`;
}

/**
 * Tarjeta de partido disponible para abrir una sala.
 *
 * Deliberadamente parecida a la de sala pero sin barra de balance: no
 * hay nada que balancear todavía. El hueco donde iría la barra lo
 * ocupa la invitación, que es lo único que puede pasar aquí.
 */
function tarjetaOportunidad(p) {
  return `
  <article class="tarjeta oportunidad oportunidad-card-compacta"
       onclick="ir('crear')" role="button" tabindex="0"
       onkeydown="if(event.key==='Enter')ir('crear')">
    <div class="t-cab">
      <span class="chip">${esc(p.liga)}</span>
      <span class="chip-tiempo">${cuando(p.inicia_en)}</span>
    </div>

    <div class="match-visual match-visual-partido">
      ${escudosPartido(p)}
      <span class="match-vs" aria-hidden="true">VS</span>
      <span class="match-nombre match-nombre-local">${esc(p.equipo_local)}</span>
      <span class="match-nombre match-nombre-visita">${esc(p.equipo_visitante)}</span>
    </div>

    <div class="t-pie partido-card-pie">
      <span>${(p.mercados ?? []).length} tipo(s) de apuesta</span>
      <span class="t-entrar">Ver mercados
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.4" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </span>
    </div>
  </article>`;
}

function vacioMuro(filtro, libres) {
  return `
  <div class="vacio">
    <h3>${filtro === 'faltan' ? 'No hay salas con cupos ahora' : 'No hay salas disponibles'}</h3>
    <p>${filtro === 'faltan'
      ? 'Las salas visibles ya están completas o no admiten nuevas posiciones.'
      : 'Cuando haya salas abiertas, aparecerán aquí.'}
      ${libres > 0
        ? ` Hay ${libres} partido(s) disponibles para crear una sala.`
        : ''}</p>
    <button class="btn btn-favor" onclick="ir('crear')">Crear una sala</button>
  </div>`;
}


function bloqueSaldoMuro() {
  if (!haySesion()) {
    return `
    <div class="muro-wallet muro-wallet-visitante">
      <div class="login-note-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48"><circle cx="24" cy="15" r="8"/><path d="M9 42c1-12 7-18 15-18s14 6 15 18"/></svg>
      </div>
      <div><b>Inicia sesión</b><p>para consultar tu saldo.</p></div>
    </div>`;
  }
  const disponible = S.saldo?.disponibleCentavos ?? 0;
  const retenido = S.saldo?.retenidoCentavos ?? 0;
  return `
  <div class="muro-wallet">
    <div class="muro-wallet-cab">
      <span class="wallet-icono" aria-hidden="true">
        <svg viewBox="0 0 48 48"><path d="M7 14h28a5 5 0 0 1 5 5v19H9a5 5 0 0 1-5-5V11a5 5 0 0 1 5-5h25v8"/><path d="M31 22h12v10H31a5 5 0 0 1 0-10z"/><circle cx="34" cy="27" r="1.5"/></svg>
      </span>
      <div><small>Saldo disponible</small><strong>${plata(disponible)}</strong></div>
      <button class="wallet-recargar" onclick="ir('billetera')">+ Recargar</button>
    </div>
    <div class="wallet-enjuego">En juego: <b>${plata(retenido)}</b></div>
  </div>`;
}

function promoTandaBet() {
  return `
  <button class="muro-promo muro-promo-referencia" onclick="ir('crear')" aria-label="Crear sala ahora">
    <img src="promo-tandabet.png" alt="Tu juego, tus reglas, tu sala">
  </button>`;
}

function franjaConfianza() {
  return `<div class="muro-confianza-imagen"><img src="confianza-tandabet.png" alt="Seguridad, sin comisiones, pagos al instante, ranking y disponibilidad multidispositivo"></div>`;
}

function iconoTrust(tipo){
  const m={
    shield:'<svg viewBox="0 0 48 48"><path d="M24 5 39 11v11c0 10-6 17-15 21C15 39 9 32 9 22V11L24 5z"/><path d="m18 24 4 4 8-9"/></svg>',
    people:'<svg viewBox="0 0 48 48"><circle cx="18" cy="15" r="6"/><circle cx="31" cy="15" r="6"/><path d="M5 40c1-10 6-15 13-15s12 5 13 15M28 27c7 0 12 5 13 13"/></svg>',
    bolt:'<svg viewBox="0 0 48 48"><path d="M28 4 10 28h12l-2 16 18-25H26z"/></svg>',
    cup:'<svg viewBox="0 0 48 48"><path d="M16 7h16v11c0 8-4 13-8 13s-8-5-8-13V7z"/><path d="M16 11H8c0 9 4 14 10 14M32 11h8c0 9-4 14-10 14M24 31v7M16 41h16"/></svg>',
    devices:'<svg viewBox="0 0 48 48"><rect x="4" y="9" width="28" height="22" rx="2"/><path d="M14 38h8M18 31v7"/><rect x="30" y="17" width="14" height="25" rx="2"/></svg>'
  }; return `<span class="trust-icon">${m[tipo]}</span>`;
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
function bloqueActividad(lista, tope = 3) {
  const agrupada = agruparActividad(lista);
  const hay = agrupada.length > 0;
  const totalReal = lista.length;

  return `
  <div class="bloque">
    <h3><i class="side-title-icon pulse">⌁</i> Última jugada ${hay ? `<span>${totalReal}</span>` : ''}</h3>
    ${hay
      ? agrupada.slice(0, tope).map(filaActividad).join('')
      : `<div class="bloque-vacio">
           Cuando alguien abra una sala o gane una apuesta, aparece aquí.
         </div>`}
    ${totalReal > 3
      ? `<button class="bloque-mas bloque-mas-actividad" onclick="verTodaActividad()">
           Ver más
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
    <h3><i class="side-title-icon live">◉</i> Partidos en vivo ${hay ? `<span>${partidos}</span>` : ''}</h3>
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
  const lista = S.datos.actividad ?? [];
  const filtrada = filtro === 'todo' ? lista : lista.filter(a => a.tipo === filtro);

  const tipos = [
    ['todo', 'Todo'],
    ['SALA_CREADA', 'Salas nuevas'],
    ['SALA_BALANCEADA', 'Completas'],
    ['RESULTADO_GANADOR', 'Ganadores'],
  ].filter(([id]) => id === 'todo' || lista.some(a => a.tipo === id));

  hoja('Última jugada', `${lista.length} en las últimas horas`, `
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

  hoja('Partidos en vivo', `${lista.length} liga(s) con partidos por jugarse`, `
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

  // Balón de fútbol blanco/negro, sin caja exterior ni círculo verde.
  const balon = `<img class="actividad-balon" src="balon-futbol.png" alt="">`;

  return `
  <div class="actividad" ${clic}>
    <div class="actividad-icono" aria-hidden="true">${balon}</div>
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
