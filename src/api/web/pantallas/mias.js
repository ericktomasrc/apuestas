'use strict';

/**
 * Mis salas
 * - 2 tabs reales: creadas / participo
 * - paginación independiente por filtro
 * - conserva filtros dinámicos por liga
 * - conserva publicación manual de salas propias
 */
PANTALLAS.mias = async () => {
  const r = await api('/yo/salas');
  const salas = r.salas ?? [];

  S.datos.misSalas = salas;
  S.datos.tipoMias = S.datos.tipoMias ?? 'CREADAS';
  S.datos.filtroLigaMias = 'TODAS';
  S.datos.paginaMias = 1;
  S.datos.porPaginaMias = S.datos.porPaginaMias ?? 10;
  S.datos.ligasMias = ligasDeMisSalas(salas);

  dibujarMisSalas();
};

function ligasDeMisSalas(salas) {
  const mapa = new Map();
  for (const s of salas) {
    const nombre = String(s.liga ?? '').trim() || 'Sin liga';
    const actual = mapa.get(nombre) ?? {
      nombre,
      cantidad: 0,
      logoUrl: s.liga_logo_url ?? null,
    };
    actual.cantidad++;
    if (!actual.logoUrl && s.liga_logo_url) actual.logoUrl = s.liga_logo_url;
    mapa.set(nombre, actual);
  }
  return [...mapa.values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity:'base' }));
}

function salasMiasPorTipo(salas, tipo) {
  return tipo === 'PARTICIPO'
    ? salas.filter(s => !s.soy_anfitrion)
    : salas.filter(s => s.soy_anfitrion);
}

function dibujarMisSalas() {
  const salas = S.datos.misSalas ?? [];

  if (salas.length === 0) {
    return pintar(armazon(`
      <section class="mias-pagina">
        <div class="mias-encabezado">
          <span class="mias-kicker">TU ACTIVIDAD</span>
          <h1 class="titulo">Todavía no tienes salas</h1>
          <p class="sub">Aquí aparecerán las salas que abras y aquellas donde participes.</p>
        </div>
        <div class="mias-vacio">
          <div class="mias-vacio-icono">+</div>
          <h3>Empieza con una sala</h3>
          <p>Busca una sala disponible o crea una nueva para compartirla.</p>
          <div class="mias-vacio-acciones">
            <button class="btn btn-favor" onclick="ir('muro')">Ver salas abiertas</button>
            <button class="btn btn-plano" onclick="ir('crear')">Crear una sala</button>
          </div>
        </div>
      </section>`));
  }

  const creadasTodas = salas.filter(s => s.soy_anfitrion);
  const participoTodas = salas.filter(s => !s.soy_anfitrion);
  const activasTodas = salas.filter(s =>
    ['ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO'].includes(s.estado));

  const sinPublicar = creadasTodas.filter(s =>
    ['ABIERTA','CUENTA_REGRESIVA'].includes(s.estado)
    && !s.es_del_sistema
    && !s.publicada_en);

  const tipo = S.datos.tipoMias ?? 'CREADAS';
  const filtro = S.datos.filtroLigaMias ?? 'TODAS';
  const baseTipo = salasMiasPorTipo(salas, tipo);
  const filtradas = filtro === 'TODAS'
    ? baseTipo
    : baseTipo.filter(s => (String(s.liga ?? '').trim() || 'Sin liga') === filtro);

  const porPagina = Number(S.datos.porPaginaMias ?? 10);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const pagina = Math.min(Math.max(1, Number(S.datos.paginaMias ?? 1)), totalPaginas);
  S.datos.paginaMias = pagina;

  const desde = (pagina - 1) * porPagina;
  const visibles = filtradas.slice(desde, desde + porPagina);

  const ligas = S.datos.ligasMias ?? [];
  const tabsLiga = [
    `<button type="button" class="mias-liga-tab ${filtro === 'TODAS' ? 'activo' : ''}"
      onclick="seleccionarLigaMias(-1)">
      <span class="mias-liga-logo-fallback">★</span>
      <span>Todas</span><b>${salas.length}</b>
    </button>`,
    ...ligas.map((l, i) => `
      <button type="button" class="mias-liga-tab ${filtro === l.nombre ? 'activo' : ''}"
        title="${esc(l.nombre)}" onclick="seleccionarLigaMias(${i})">
        ${l.logoUrl
          ? `<img class="mias-liga-logo" src="${esc(l.logoUrl)}" alt=""
               loading="lazy" onerror="this.style.display='none'">`
          : `<span class="mias-liga-logo-fallback">${esc(l.nombre.slice(0,1).toUpperCase())}</span>`}
        <span>${esc(l.nombre)}</span><b>${l.cantidad}</b>
      </button>`),
  ].join('');

  const tituloLista = tipo === 'CREADAS' ? 'Mis salas creadas' : 'Salas en las que participo';
  const subtituloLista = tipo === 'CREADAS'
    ? 'Salas que creaste y puedes administrar.'
    : 'Salas creadas por otros usuarios en las que ya participas.';

  const inicioMostrado = filtradas.length ? desde + 1 : 0;
  const finMostrado = Math.min(desde + porPagina, filtradas.length);

  pintar(armazon(`
    <section class="mias-pagina mias-pagina-tabs">
      <div class="mias-encabezado">
        <div>
          <span class="mias-kicker">TU ACTIVIDAD</span>
          <h1 class="titulo">Mis salas</h1>
          <p class="sub">Gestiona tus salas y revisa en cuáles participas.</p>
        </div>

        <div class="mias-resumen mias-resumen-tipos" aria-label="Resumen de mis salas">
          <div>
            <strong>${creadasTodas.length}</strong>
            <span>Creadas</span>
          </div>
          <div>
            <strong>${participoTodas.length}</strong>
            <span>En las que participas</span>
          </div>
          <div>
            <strong class="num">${plata(S.saldo?.retenidoCentavos ?? 0)}</strong>
            <span>En juego</span>
          </div>
        </div>
      </div>

      ${sinPublicar.length ? `
        <div class="mias-aviso">
          <span class="mias-aviso-punto"></span>
          <p>Tienes <strong>${sinPublicar.length}</strong> sala(s) propia(s) todavía sin publicar en Salas.</p>
        </div>` : ''}

      <div class="mias-filtros-wrap mias-filtros-tabs">
        <div class="mias-ligas-scroll" id="mias-ligas-scroll" aria-label="Filtrar mis salas por liga">
          ${tabsLiga}
        </div>
      </div>

      <div class="mias-tipo-tabs" role="tablist" aria-label="Tipo de salas">
        <button type="button"
          class="mias-tipo-tab ${tipo === 'CREADAS' ? 'activo' : ''}"
          role="tab" aria-selected="${tipo === 'CREADAS'}"
          onclick="seleccionarTipoMias('CREADAS')">
          <span class="mias-tipo-icono">♔</span>
          MIS SALAS CREADAS <b>(${creadasTodas.length})</b>
        </button>

        <button type="button"
          class="mias-tipo-tab mias-tipo-tab-participo ${tipo === 'PARTICIPO' ? 'activo' : ''}"
          role="tab" aria-selected="${tipo === 'PARTICIPO'}"
          onclick="seleccionarTipoMias('PARTICIPO')">
          <span class="mias-tipo-icono">♟</span>
          SALAS EN LAS QUE PARTICIPO <b>(${participoTodas.length})</b>
        </button>
      </div>

      <div class="mias-contenido-tabs">
        <main class="mias-listado-panel">
          <div class="mias-listado-cab mias-listado-cab-solo-meta">
            <div class="mias-listado-meta">
              <span>Mostrando ${inicioMostrado}–${finMostrado} de ${filtradas.length}</span>
              <span>Página ${pagina}/${totalPaginas}</span>
            </div>
          </div>

          ${visibles.length
            ? `<div class="mias-lista">${visibles.map(tarjetaMiaLista).join('')}</div>`
            : `<div class="mias-sin-resultados">${
                tipo === 'CREADAS'
                  ? 'No tienes salas creadas para este filtro.'
                  : 'No participas en salas para este filtro.'
              }</div>`}

          ${filtradas.length > porPagina ? paginadorMias(pagina, totalPaginas, porPagina) : ''}
        </main>

        <aside class="mias-ayuda">
          <section class="mias-ayuda-card">
            <h3>¿Cómo leer las salas?</h3>

            <div class="mias-ayuda-item verde">
              <span class="mias-ayuda-icono">♔</span>
              <div>
                <strong>TU SALA</strong>
                <p>Sala que creaste. Puedes administrarla, editar mercados y publicarla.</p>
              </div>
            </div>

            <div class="mias-ayuda-item azul">
              <span class="mias-ayuda-icono">♟</span>
              <div>
                <strong>PARTICIPAS</strong>
                <p>Sala creada por otra persona. Aquí ves tu posición sin controles de administración.</p>
              </div>
            </div>

            <div class="mias-ayuda-item">
              <span class="mias-ayuda-punto"></span>
              <div>
                <strong class="mias-ayuda-blanco">Abierta</strong>
                <p>La sala todavía está disponible antes de su cierre.</p>
              </div>
            </div>
          </section>

          <section class="mias-ayuda-card mias-regla-card">
            <div class="mias-regla-icono">◷</div>
            <div>
              <h3>Regla de cierre</h3>
              <p>Las salas se bloquean según el tiempo de cierre configurado antes del inicio del partido.</p>
            </div>
          </section>
        </aside>
      </div>
    </section>
  `));

  requestAnimationFrame(activarArrastreLigasMias);
}

function seleccionarTipoMias(tipo) {
  if (!['CREADAS','PARTICIPO'].includes(tipo)) return;
  S.datos.tipoMias = tipo;
  S.datos.paginaMias = 1;
  dibujarMisSalas();
}

function seleccionarLigaMias(indice) {
  if ((S.datos.bloquearClickLigaMiasHasta ?? 0) > Date.now()) return;
  const ligas = S.datos.ligasMias ?? [];
  S.datos.filtroLigaMias = indice < 0 ? 'TODAS' : (ligas[indice]?.nombre ?? 'TODAS');
  S.datos.paginaMias = 1;
  dibujarMisSalas();
}

function cambiarPaginaMias(pagina) {
  S.datos.paginaMias = Math.max(1, Number(pagina) || 1);
  dibujarMisSalas();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cambiarPorPaginaMias(valor) {
  const n = Number(valor);
  S.datos.porPaginaMias = [5,10,20].includes(n) ? n : 10;
  S.datos.paginaMias = 1;
  dibujarMisSalas();
}

function paginadorMias(pagina, totalPaginas, porPagina) {
  const paginas = Array.from({ length: totalPaginas }, (_, i) => i + 1);
  return `
    <div class="mias-paginador">
      <div class="mias-paginas">
        <button type="button" onclick="cambiarPaginaMias(${pagina - 1})"
          ${pagina <= 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
        ${paginas.slice(Math.max(0, pagina - 3), Math.min(totalPaginas, pagina + 2))
          .map(p => `<button type="button" class="${p === pagina ? 'activo' : ''}"
             onclick="cambiarPaginaMias(${p})">${p}</button>`).join('')}
        <button type="button" onclick="cambiarPaginaMias(${pagina + 1})"
          ${pagina >= totalPaginas ? 'disabled' : ''} aria-label="Página siguiente">›</button>
      </div>
      <label>Por página:
        <select onchange="cambiarPorPaginaMias(this.value)">
          ${[5,10,20].map(n => `<option value="${n}" ${n === porPagina ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
    </div>`;
}

function activarArrastreLigasMias() {
  const barra = document.getElementById('mias-ligas-scroll');
  if (!barra || barra.dataset.arrastre === '1') return;
  barra.dataset.arrastre = '1';

  let activo = false;
  let movio = false;
  let inicioX = 0;
  let inicioScroll = 0;

  barra.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    activo = true;
    movio = false;
    inicioX = e.clientX;
    inicioScroll = barra.scrollLeft;
  });

  barra.addEventListener('pointermove', e => {
    if (!activo) return;
    const dx = e.clientX - inicioX;
    if (Math.abs(dx) > 6) movio = true;
    if (!movio) return;
    barra.scrollLeft = inicioScroll - dx;
  });

  const terminar = () => {
    if (movio) S.datos.bloquearClickLigaMiasHasta = Date.now() + 180;
    activo = false;
  };
  barra.addEventListener('pointerup', terminar);
  barra.addEventListener('pointercancel', terminar);
  barra.addEventListener('pointerleave', () => { if (activo) terminar(); });

  barra.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    if (barra.scrollWidth <= barra.clientWidth) return;
    e.preventDefault();
    barra.scrollLeft += e.deltaY;
  }, { passive:false });
}

function estadoMia(s) {
  const estados = {
    ABIERTA:          ['estado-abierta',  'Abierta'],
    CUENTA_REGRESIVA: ['estado-cerrando', 'Cerrando'],
    CERRADA:          ['estado-espera',   'Esperando'],
    EN_JUEGO:         ['estado-juego',    'En juego'],
    LIQUIDADA:        ['estado-resuelta', 'Resuelta'],
    ANULADA:          ['estado-neutra',   'Anulada'],
    EXPIRADA:         ['estado-neutra',   'Expirada'],
  };
  return estados[s.estado] ?? ['estado-neutra', s.estado];
}

function tarjetaMiaLista(s) {
  const mias = s.misPosiciones ?? [];
  const comprometido = mias.reduce((t, p) => t + Number(p.montoCentavos ?? 0), 0);
  const [clase, texto] = estadoMia(s);
  const esPropia = Boolean(s.soy_anfitrion);
  const publicadaEnMuro = Boolean(s.es_del_sistema) || Boolean(s.publicada_en);
  const posicion = mias[0];
  const resultado = s.miResultadoCentavos;
  const hayResultado = resultado !== undefined && resultado !== null;

  return `
    <article class="mias-fila ${esPropia ? 'propia' : 'participa'}"
      onclick="ir('sala','${s.id}')" role="button" tabindex="0"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ir('sala','${s.id}')}"
      aria-label="Abrir sala ${esc(s.equipo_local)} contra ${esc(s.equipo_visitante)}">

      <div class="mias-fila-tipo">
        <span class="mias-fila-tipo-icono">${esPropia ? '♔' : '♟'}</span>
        <strong>${esPropia ? 'TU SALA' : 'PARTICIPAS'}</strong>
      </div>

      <div class="mias-fila-partido">
        <span class="mias-fila-liga">${esc(s.liga ?? '')}</span>
        <div class="mias-fila-equipos">
          <div class="mias-fila-equipo">
            ${escudo(s.logo_local ?? s.escudo_local, s.equipo_local)}
            <strong>${esc(s.equipo_local)}</strong>
          </div>
          <span class="mias-fila-vs">VS</span>
          <div class="mias-fila-equipo">
            ${escudo(s.logo_visitante ?? s.escudo_visitante, s.equipo_visitante)}
            <strong>${esc(s.equipo_visitante)}</strong>
          </div>
        </div>
      </div>

      <div class="mias-fila-datos">
        <div class="mias-fila-estados">
          <span class="mias-estado ${clase}">${esc(texto)}</span>
          <span class="mias-tiempo">${cuando(s.inicia_en)}</span>
        </div>

        ${!esPropia && s.anfitrion_alias
          ? `<span class="mias-fila-anfitrion">Anfitrión&nbsp; <strong>${esc(s.anfitrion_alias)}</strong></span>`
          : ''}

        <span class="mias-dato-linea">
          <svg class="mias-dato-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          ${s.participantes ?? 0} / ${s.tope_participantes} cupos
        </span>

        <span class="mias-dato-linea">
          <svg class="mias-dato-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/>
            <path d="M15.5 8.5c-.7-.7-1.8-1.1-3-1.1-1.8 0-3.1.9-3.1 2.2 0 1.5 1.4 2 3.1 2.4 1.7.4 3.1.9 3.1 2.4 0 1.4-1.4 2.3-3.2 2.3-1.4 0-2.7-.5-3.6-1.4"/>
            <path d="M12 5.5v13"/>
          </svg>
          ${comprometido > 0 ? `${plata(comprometido)} en juego` : 'Sin apuesta propia'}
        </span>

        <span class="mias-dato-linea">
          <svg class="mias-dato-icono mias-dato-icono-calendario" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
            stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2"/>
            <path d="M16 3v4M8 3v4M3 10h18"/>
          </svg>
          ${fechaCorta(s.inicia_en)}
        </span>
      </div>

      <div class="mias-fila-accion">
        ${esPropia && ['ABIERTA','CUENTA_REGRESIVA'].includes(s.estado)
          ? (publicadaEnMuro
              ? `<span class="mias-estado estado-publicada">Publicada</span>`
              : `<button type="button" class="mias-fila-publicar"
                   onclick="publicarSalaDesdeMisSalas(event,'${s.id}')">Publicar sala</button>`)
          : hayResultado
            ? `<strong class="num mias-resultado ${resultado > 0 ? 'positivo' : resultado < 0 ? 'negativo' : ''}">
                ${resultado > 0 ? '+' : ''}${plata(resultado)}
               </strong>`
            : posicion
              ? `<span class="mias-fila-posicion">Tu posición:<strong>${esc(posicion.etiqueta ?? posicion.lado ?? '')}</strong></span>`
              : `<span class="mias-fila-ver">Ver sala ›</span>`}
      </div>
    </article>`;
}

async function publicarSalaDesdeMisSalas(event, salaId) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  await accion(async () => {
    await api(`/salas/${salaId}/publicar`, { method: 'POST' });
    ir('mias');
  }, 'Sala publicada', 'Publicando');
}
