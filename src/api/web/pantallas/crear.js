'use strict';

/**
 * Crear una sala.
 *
 * Paso 1: elegir partido. Las ligas se muestran en una sola barra
 * horizontal desplazable y las tarjetas reutilizan la composición del Muro.
 * Paso 2 permanece intacto: "Define la apuesta".
 */
function limpiarEstadoEditorSalaEnCrear() {
  S.datos.modoEditorSala = false;
  S.datos.editorMercadosOriginales = null;
  S.datos.editorSalaMeta = null;
  S.datos.configurando = null;
  S.datos.nueva = null;
}

PANTALLAS.crear = async () => {
  // Si venimos de "Agregar mercado" dentro de una sala, no se permite
  // que ese estado contamine una creación nueva.
  limpiarEstadoEditorSalaEnCrear();

  const r = await api('/partidos?limite=30');
  const partidos = r.partidos ?? [];
  S.datos.partidos = partidos;

  if (partidos.length === 0) {
    return pintar(armazon(`
      <div class="crear-pagina crear-vacia">
        <span class="crear-kicker">Nueva sala</span>
        <h1 class="titulo">Elige el partido</h1>
        <p class="sub">Selecciona el encuentro. Después defines las apuestas.</p>
        <div class="vacio">
          <h3>No hay partidos disponibles</h3>
          <p>Todavía no hay eventos cargados sobre los que apostar,
          o los que hay empiezan muy pronto.</p>
          <button class="btn btn-plano" onclick="ir('muro')">Ver salas abiertas</button>
        </div>
      </div>`));
  }

  const ligas = [];
  const vistas = new Set();
  for (const p of partidos) {
    const liga = nombreLigaCrear(p);
    if (!vistas.has(liga)) {
      vistas.add(liga);
      ligas.push(liga);
    }
  }

  S.datos.ligasCrear = ligas;
  S.datos.ligaCrearIndice = Number.isInteger(S.datos.ligaCrearIndice)
    && S.datos.ligaCrearIndice >= -1
    && S.datos.ligaCrearIndice < ligas.length
      ? S.datos.ligaCrearIndice
      : -1;

  pintar(armazon(`
    <div class="crear-pagina">
      <div class="crear-encabezado">
        <div>
          <span class="crear-kicker">Nueva sala</span>
          <h1 class="titulo">Elige el partido</h1>
          <p class="sub">Selecciona el encuentro. Después defines las apuestas.</p>
        </div>
        <div class="crear-total">
          <strong>${partidos.length}</strong>
          <span>partidos disponibles</span>
        </div>
      </div>

      <div class="crear-ligas-wrap">
        <div class="crear-ligas" id="crear-ligas" aria-label="Filtrar partidos por liga">
          <button type="button" class="crear-liga-tab" data-indice="-1"
            onclick="clicLigaCrear(event,-1)">
            <span class="crear-liga-logo-fallback">★</span>
            <span>Todas</span><b>${partidos.length}</b>
          </button>
          ${ligas.map((liga, i) => {
            const info = infoLigaCrear(liga);
            return `
            <button type="button" class="crear-liga-tab" data-indice="${i}"
              title="${esc(liga)}" onclick="clicLigaCrear(event,${i})">
              ${info.logoUrl
                ? `<img class="crear-liga-logo" src="${esc(info.logoUrl)}" alt=""
                     loading="lazy" onerror="this.style.display='none'">`
                : `<span class="crear-liga-logo-fallback">${esc(liga.slice(0,1).toUpperCase())}</span>`}
              <span>${esc(liga)}</span><b>${info.cantidad}</b>
            </button>`;
          }).join('')}
        </div>
      </div>

      <div class="crear-listado-cab">
        <strong id="crear-liga-titulo"></strong>
        <span id="crear-liga-cantidad"></span>
      </div>

      <div class="rejilla-partidos-disponibles crear-rejilla" id="crear-partidos"></div>
    </div>
  `));

  pintarPartidosCrear();
  activarArrastreLigasCrear();
};

function nombreLigaCrear(p) {
  return String(p?.liga ?? '').trim() || 'Sin liga';
}

function infoLigaCrear(nombre) {
  const partidos = S.datos.partidos ?? [];
  const deLiga = partidos.filter(p => nombreLigaCrear(p) === nombre);
  return {
    cantidad: deLiga.length,
    logoUrl: deLiga.find(p => p.liga_logo_url)?.liga_logo_url ?? null,
  };
}

function clicLigaCrear(evento, indice) {
  // Si el gesto terminó siendo un arrastre horizontal, no se cambia
  // el filtro al soltar el mouse sobre un tab.
  if (S.datos.arrastroLigasCrear) {
    evento?.preventDefault();
    return;
  }
  seleccionarLigaCrear(indice);
}

function seleccionarLigaCrear(indice) {
  const ligas = S.datos.ligasCrear ?? [];
  const n = Number(indice);
  S.datos.ligaCrearIndice = Number.isInteger(n) && n >= 0 && n < ligas.length ? n : -1;
  pintarPartidosCrear();

  const activo = document.querySelector('.crear-liga-tab.activo');
  activo?.scrollIntoView?.({ behavior:'smooth', block:'nearest', inline:'nearest' });
}

function pintarPartidosCrear() {
  const contenedor = document.getElementById('crear-partidos');
  if (!contenedor) return;

  const partidos = S.datos.partidos ?? [];
  const ligas = S.datos.ligasCrear ?? [];
  const indice = Number.isInteger(S.datos.ligaCrearIndice) ? S.datos.ligaCrearIndice : -1;
  const liga = indice >= 0 && indice < ligas.length ? ligas[indice] : null;
  const visibles = liga ? partidos.filter(p => nombreLigaCrear(p) === liga) : partidos;

  document.querySelectorAll('.crear-liga-tab').forEach(b => {
    const activo = Number(b.dataset.indice) === indice;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-pressed', activo ? 'true' : 'false');
  });

  const titulo = document.getElementById('crear-liga-titulo');
  const cantidad = document.getElementById('crear-liga-cantidad');
  if (titulo) titulo.textContent = liga ?? 'Todos los partidos';
  if (cantidad) cantidad.textContent = `${visibles.length} partido${visibles.length === 1 ? '' : 's'}`;

  contenedor.innerHTML = visibles.map(p => `
    <article class="tarjeta oportunidad oportunidad-card-compacta crear-partido-card"
      onclick="elegirPartido('${p.id}')" role="button" tabindex="0"
      onkeydown="if(event.key==='Enter')elegirPartido('${p.id}')">
      <div class="t-cab">
        <span class="chip">${esc(nombreLigaCrear(p))}</span>
        <span class="chip-tiempo">${cuando(p.inicia_en)}</span>
      </div>

      <div class="match-visual match-visual-partido crear-match-visual">
        ${escudosPartido(p)}
        <span class="match-vs" aria-hidden="true">VS</span>
        <span class="match-nombre match-nombre-local">${esc(p.equipo_local)}</span>
        <span class="match-nombre match-nombre-visita">${esc(p.equipo_visitante)}</span>
      </div>

      <div class="t-pie partido-card-pie crear-partido-pie">
        <span>${(p.mercados ?? []).length} tipo(s) de apuesta</span>
        <span class="t-entrar">${p.salas_abiertas > 0
          ? `${p.salas_abiertas} sala(s) abierta(s)`
          : 'Sé el primero'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.4" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </span>
      </div>
    </article>`).join('');
}

function activarArrastreLigasCrear() {
  const rail = document.getElementById('crear-ligas');
  if (!rail || rail.dataset.arrastreListo === '1') return;
  rail.dataset.arrastreListo = '1';

  let presionado = false;
  let inicioX = 0;
  let inicioScroll = 0;

  rail.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    presionado = true;
    inicioX = e.clientX;
    inicioScroll = rail.scrollLeft;
    S.datos.arrastroLigasCrear = false;
  });

  window.addEventListener('mousemove', e => {
    if (!presionado) return;
    const dx = e.clientX - inicioX;
    if (!S.datos.arrastroLigasCrear && Math.abs(dx) < 7) return;
    S.datos.arrastroLigasCrear = true;
    rail.classList.add('arrastrando');
    rail.scrollLeft = inicioScroll - dx;
    e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    if (!presionado) return;
    presionado = false;
    rail.classList.remove('arrastrando');
    // El click se dispara después de mouseup. Se deja la marca activa
    // ese instante y se limpia en la siguiente tarea del navegador.
    setTimeout(() => { S.datos.arrastroLigasCrear = false; }, 0);
  });

  // Touch/trackpad usan el scroll nativo. Con rueda de mouse, la franja
  // también avanza horizontalmente cuando hay más ligas de las visibles.
  rail.addEventListener('wheel', e => {
    if (rail.scrollWidth <= rail.clientWidth) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    rail.scrollLeft += delta;
    e.preventDefault();
  }, { passive:false });
}

// ---------------------------------------------------------------------
//  Paso 2: definir las apuestas
// ---------------------------------------------------------------------

/**
 * Categorías del selector.
 *
 * «Populares» va primero porque el 90% de las salas usan uno de esos
 * tres. El resto existe para quien lo busca, no para estorbar.
 */
const CATEGORIAS = [
  // «Todas» primero: con cinco o seis tipos, filtrar es un paso de más.
  // Cuando el catálogo crezca, las categorías serán el atajo.
  { id: 'todas',     nombre: 'Todas',     tipos: null },
  { id: 'populares', nombre: 'Populares',
    tipos: ['TOTAL_GOLES', 'AMBOS_ANOTAN', 'DOBLE_OPORTUNIDAD'] },
  { id: 'goles',     nombre: 'Goles',     tipos: ['TOTAL_GOLES', 'AMBOS_ANOTAN'] },
  { id: 'resultado', nombre: 'Resultado', tipos: ['DOBLE_OPORTUNIDAD', 'GANADOR_DIRECTO'] },
  { id: 'corners',   nombre: 'Córners',   tipos: ['TOTAL_CORNERS'] },
  { id: 'tarjetas',  nombre: 'Tarjetas',  tipos: ['TOTAL_TARJETAS'] },
  { id: 'puntos',    nombre: 'Puntos',    tipos: ['TOTAL_PUNTOS'] },
];

function elegirPartido(id) {
  // La lista de partidos se puede mirar sin cuenta —es parte de
  // entender el producto— pero definir una apuesta ya es crear algo
  // que otros van a ver, y eso necesita un dueño.
  if (!exigeCuenta('Estabas por abrir una sala. Necesita una cuenta que sea la anfitriona.')) return;

  const p = S.datos.partidos.find(x => x.id === id);
  S.datos.nueva = { partido: p, mercados: [] };
  dibujarCreacion();
}

function dibujarCreacion() {
  const n = S.datos.nueva;
  const p = n.partido;
  const tope = S.limites?.maxMercadosPorSala ?? 3;
  const dec = S.pais?.decimales ?? 2;
  const minimo = S.pais?.minimoApuesta ?? 500;

  hoja('Define la apuesta',
    `${p.equipo_local} vs ${p.equipo_visitante} · empieza ${cuando(p.inicia_en)}`, `

    <div class="selector">
      <div class="buscador" style="grid-column:1/-1">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tenue)"
          stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input id="buscar_tipo" placeholder="Buscar: goles, córners, tarjetas…"
          oninput="filtrarTipos()" autocomplete="off">
      </div>

      <div class="selector-cats" id="cats"></div>
      <div class="selector-lista" id="lista"></div>
    </div>

    <div id="jugadas"></div>
    <div id="paso-dos"></div>
  `);

  S.datos.categoria = 'todas';
  pintarSelector();
}

/**
 * Dibuja categorías, lista y fichas.
 *
 * Se redibuja solo el interior, no la hoja entera: reabrir el panel
 * en cada clic perdería el texto del buscador y la posición del
 * desplazamiento.
 */
function pintarSelector() {
  const n = S.datos.nueva;
  const p = n.partido;
  const tope = S.limites?.maxMercadosPorSala ?? 3;
  const busca = (document.getElementById('buscar_tipo')?.value ?? '').trim().toLowerCase();
  const cat = S.datos.categoria ?? 'todas';

  const disponibles = CATEGORIAS.filter(c =>
    c.tipos === null || p.mercados.some(m => c.tipos.includes(m.tipo)));

  document.getElementById('cats').innerHTML = disponibles.map(c => {
    const cuantos = c.tipos === null
      ? p.mercados.length
      : p.mercados.filter(m => c.tipos.includes(m.tipo)).length;
    return `<button class="cat ${cat === c.id ? 'activa' : ''}"
      onclick="S.datos.categoria='${c.id}';pintarSelector()">
      ${esc(c.nombre)}${c.id === 'todas' ? ` <small>· ${cuantos}</small>` : ''}
    </button>`;
  }).join('');

  const def = CATEGORIAS.find(c => c.id === cat);
  let lista = def?.tipos === null
    ? p.mercados
    : p.mercados.filter(m => def.tipos.includes(m.tipo));

  // Buscar ignora la categoría: quien escribe «córner» quiere ese
  // mercado, no que le digan que está en otra pestaña.
  if (busca) {
    lista = p.mercados.filter(m => m.nombre.toLowerCase().includes(busca));
  }

  document.getElementById('lista').innerHTML = lista.length
    ? lista.map(m => {
        const puesta = n.mercados.find(x => x.tipo === m.tipo);
        const lleno = !puesta && n.mercados.length >= tope;
        const abierto = S.datos.configurando === m.tipo;
        return `
        <div>
          <button class="tipo ${puesta ? 'puesto' : ''} ${abierto ? 'abierto' : ''}"
            ${lleno ? 'disabled' : ''}
            onclick="${puesta ? `quitarPorTipo('${m.tipo}')` : `abrirTipo('${m.tipo}')`}">
            <span class="tipo-marca">${puesta ? '✓' : abierto ? '−' : '+'}</span>
            <span class="tipo-texto">
              <strong>${esc(m.nombre)}</strong>
              <small>${puesta ? esc(puesta.resumen) : m.necesitaLinea
                ? 'tú eliges el número'
                : m.necesitaEquipo ? 'local o visita' : 'sí o no'}</small>
            </span>
          </button>
          ${abierto ? panelTipo(m) : ''}
        </div>`;
      }).join('')
    : `<p class="pista" style="padding:10px">
         Nada coincide con «${esc(busca)}».</p>`;

  const vacio = n.mercados.length === 0;

  document.getElementById('jugadas').innerHTML = `
    <div class="caja-jugadas ${vacio ? 'vacia' : ''}">
      <div class="jugadas-cab">
        <span style="font-weight:600;letter-spacing:.05em;text-transform:uppercase;
          color:var(--tenue)">Jugadas seleccionadas</span>
        ${vacio ? '' : `<span>${n.mercados.length} de ${tope}</span>`}
      </div>
      ${vacio
        ? '<div class="jugadas-vacio">Todavía no elegiste ninguna</div>'
        : `<div class="puestas">${n.mercados.map((m, i) => `
            <span class="puesta">${esc(m.nombre)}
              <button onclick="quitarMercado(${i})" aria-label="Quitar">×</button>
            </span>`).join('')}</div>`}

      ${n.mercados.length >= tope ? avisoTope(
        `Llegaste al máximo de ${tope} apuestas por sala. Quita una para cambiarla.`)
        : ''}
    </div>`;

  // El editor de una sala reutiliza este MISMO selector. Solo cambia la
  // acción final: en vez de publicar una sala nueva, guarda altas/bajas
  // de mercados existentes.
  if (S.datos.modoEditorSala) {
    document.getElementById('paso-dos').innerHTML = bloqueQuienEntra();
  } else {
    // «Quién puede entrar» aparece con la primera jugada.
    document.getElementById('paso-dos').innerHTML = vacio ? '' : bloqueQuienEntra();
  }
}


function maxParticipantesSala() {
  const n = Number(S.limites?.maxParticipantesSala ?? 10);
  return Number.isInteger(n) && n >= 2 ? n : 10;
}

function bloqueQuienEntra() {
  const dec = S.pais?.decimales ?? 2;
  const meta = S.datos.modoEditorSala ? (S.datos.editorSalaMeta ?? {}) : {};
  const minimo = Number(meta.minimoCentavos ?? S.pais?.minimoApuesta ?? 500);
  const maxCupos = Number(meta.maxCupos ?? maxParticipantesSala());
  const cupos = Number(meta.cupos ?? 2);

  return `
  <div class="caja-jugadas">
    <div class="jugadas-cab">
      <span style="font-weight:600;letter-spacing:.05em;text-transform:uppercase;
        color:var(--tenue)">Quién puede entrar</span>
    </div>

    <div class="par">
      <div class="campo campo-informativo">
        <label for="minimo">Apuesta mínima</label>
        <input id="minimo" type="text"
          value="${(minimo / (10 ** dec)).toFixed(dec)}"
          readonly aria-readonly="true" tabindex="-1">
        <small class="campo-ayuda">Valor definido por la configuración.</small>
      </div>

      <div class="campo">
        <label for="tope">Cupos</label>
        <input id="tope" type="number" inputmode="numeric"
          min="2" max="${maxCupos}" step="1" value="${cupos}"
          ${S.datos.modoEditorSala
            ? 'readonly aria-readonly="true" tabindex="-1"'
            : 'oninput="limpiarCupos(this)" onblur="corregirCupos(this)"'}>
        <small class="campo-ayuda">Máximo permitido: ${maxCupos} cupos.</small>
      </div>
    </div>

    <p class="pista" id="aviso-entrada">
      Apuesta mínima ${plata(minimo)} · Cupos permitidos: de 2 a ${maxCupos}.</p>

    <div class="pie-fijo">
      ${S.datos.modoEditorSala ? `
        <button class="btn btn-favor btn-ancho" onclick="guardarMercadosSalaDesdeSelector()">
          Guardar cambios</button>
        <p class="pista" style="text-align:center">
          La apuesta mínima y los cupos son informativos al editar mercados.</p>
      ` : `
        <button class="btn btn-favor btn-ancho" onclick="publicarSala()">
          Crear sala</button>
        <p class="pista" style="text-align:center">
          Se crea con aporte 0. Aparecerá en Salas cuando el anfitrión tenga un aporte mayor a cero.</p>
      `}
    </div>
  </div>`;
}



/**
 * Se impide escribir el valor inválido, no solo se avisa después.
 *
 * Dejar teclear un cero y luego decir «no puede ser cero» es hacerle
 * perder el tiempo a alguien por algo que la app podía evitar.
 */
function limpiarMinimo(campo) {
  // Solo dígitos y un separador decimal. Además se limita la cantidad
  // de decimales a la moneda del país.
  const decimales = Number(S.pais?.decimales ?? 2);
  let v = String(campo.value ?? '').replace(/[^\d.,]/g, '').replace(',', '.');
  const punto = v.indexOf('.');
  if (punto >= 0) {
    v = v.slice(0, punto + 1) + v.slice(punto + 1).replace(/\./g, '');
    const [entero, dec = ''] = v.split('.');
    v = entero + '.' + dec.slice(0, decimales);
  }
  v = v.replace(/^0+(?=\d)/, '');
  if (v === '0') v = '';
  campo.value = v;
  validarEntrada();
}

/** Al salir del campo se repone el mínimo del país si quedó vacío o
 *  por debajo: un campo en blanco no puede publicarse. */
function corregirMinimo(campo) {
  const piso = S.pais?.minimoApuesta ?? 500;
  const dec = S.pais?.decimales ?? 2;
  if (aUnidades(campo.value) < piso) {
    campo.value = (piso / (10 ** dec)).toFixed(dec);
  }
  validarEntrada();
}

function limpiarCupos(campo) {
  const max = maxParticipantesSala();
  let v = String(campo.value ?? '').replace(/\D/g, '').replace(/^0+/, '');

  if (v === '') {
    campo.value = '';
    validarEntrada();
    return;
  }

  let n = Number(v);
  if (n > max) n = max;
  campo.value = String(n);
  validarEntrada();
}

function corregirCupos(campo) {
  const max = maxParticipantesSala();
  let v = Number(campo.value);

  if (!Number.isInteger(v) || v < 2) v = 2;
  if (v > max) v = max;

  campo.value = String(v);
  validarEntrada();
}

function validarEntrada() {
  const piso = S.pais?.minimoApuesta ?? 500;
  const monto = aUnidades(document.getElementById('minimo').value);
  const cupos = Number(document.getElementById('tope').value.replace(/\D/g, ''));
  const maxCupos = maxParticipantesSala();
  const nota = document.getElementById('aviso-entrada');
  const mal = t => `<span style="color:var(--mal)">${t}</span>`;

  // Los mensajes explican QUÉ pasa, no cómo se llama la regla.
  // «El mínimo permitido» era jerga mía: nadie sabe qué significa.
  if (monto <= 0 || monto < piso) {
    nota.innerHTML = mal(`No se pudo cargar la apuesta mínima configurada.`);
  } else if (cupos < 2) {
    nota.innerHTML = mal('El mínimo es 2 cupos.');
  } else if (cupos > maxCupos) {
    nota.innerHTML = mal(`El máximo permitido por configuración es ${maxCupos} cupos.`);
  } else {
    nota.innerHTML =
      `Apuesta mínima ${plata(monto)} · ${cupos} cupos · máximo permitido ${maxCupos}.`;
  }
}


function filtrarTipos() { pintarSelector(); }

/**
 * Abre la configuración DENTRO de la lista.
 *
 * Antes se abría otra hoja encima, y con varias apiladas cerrar una
 * dejaba a la persona sin saber dónde estaba. Aquí el número o el
 * equipo se eligen sin salir del sitio.
 */
function abrirTipo(tipo) {
  const p = S.datos.nueva.partido;
  const def = p.mercados.find(m => m.tipo === tipo);

  // Los que no necesitan configuración entran directo: abrir un panel
  // para no preguntar nada sería un paso de más.
  if (!def.necesitaLinea && !def.necesitaEquipo) {
    return agregarMercado(tipo, null, null);
  }

  S.datos.configurando = S.datos.configurando === tipo ? null : tipo;
  pintarSelector();
}

/** El panel que se despliega bajo el tipo elegido. */
function panelTipo(m) {
  const p = S.datos.nueva.partido;

  const lineas = m.tipo === 'TOTAL_CORNERS' ? [6.5, 7.5, 8.5, 9.5, 10.5, 11.5]
    : m.tipo === 'TOTAL_TARJETAS' ? [1.5, 2.5, 3.5, 4.5, 5.5]
    : m.tipo === 'TOTAL_PUNTOS' ? [150.5, 160.5, 170.5, 180.5, 190.5]
    : [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];

  const elegida = S.datos.lineaElegida ?? (m.tipo === 'TOTAL_CORNERS' ? 8.5 : 2.5);
  const equipo = S.datos.equipoElegido ?? p.equipo_local;

  return `
  <div class="panel-tipo">
    ${m.necesitaLinea ? `
      <div class="mini-rotulo">A partir de cuántos</div>
      <div class="lineas">
        ${lineas.map(v => `
          <button class="linea ${v === elegida ? 'activa' : ''}"
            onclick="S.datos.lineaElegida=${v};pintarSelector()">${v}</button>`).join('')}
      </div>
      <p class="pista">Siempre en .5: así el marcador nunca cae justo encima
      y nadie se queda sin ganar.</p>` : ''}

    ${m.necesitaEquipo ? `
      <div class="mini-rotulo">Sobre qué equipo</div>
      <div class="lineas">
        ${[p.equipo_local, p.equipo_visitante].map(e => `
          <button class="linea ${e === equipo ? 'activa' : ''}"
            onclick="S.datos.equipoElegido='${esc(e)}';pintarSelector()">${esc(e)}</button>`).join('')}
      </div>
      <p class="pista">Los lados serán «gana» y «no gana». El empate cuenta
      como «no gana», así que nunca queda sin resolver.</p>` : ''}

    <button class="btn btn-favor btn-chico btn-ancho" style="margin-top:8px"
      onclick="confirmarTipo('${m.tipo}')">Agregar</button>
  </div>`;
}

function confirmarTipo(tipo) {
  const p = S.datos.nueva.partido;
  const def = p.mercados.find(m => m.tipo === tipo);
  const linea = def.necesitaLinea
    ? (S.datos.lineaElegida ?? (tipo === 'TOTAL_CORNERS' ? 8.5 : 2.5)) : null;
  const equipo = def.necesitaEquipo
    ? (S.datos.equipoElegido ?? p.equipo_local) : null;

  S.datos.configurando = null;
  S.datos.lineaElegida = null;
  S.datos.equipoElegido = null;
  agregarMercado(tipo, linea, equipo);
}

function quitarPorTipo(tipo) {
  const i = S.datos.nueva.mercados.findIndex(m => m.tipo === tipo);
  if (i >= 0) quitarMercado(i);
}

function agregarMercado(tipo, linea, equipo) {
  const n = S.datos.nueva;
  const def = n.partido.mercados.find(m => m.tipo === tipo);

  const etiquetas = {
    TOTAL_GOLES:       [`Más de ${linea} goles`,    `Menos de ${linea} goles`],
    TOTAL_CORNERS:     [`Más de ${linea} córners`,  `Menos de ${linea} córners`],
    TOTAL_TARJETAS:    [`Más de ${linea} tarjetas`, `Menos de ${linea} tarjetas`],
    TOTAL_PUNTOS:      [`Más de ${linea} puntos`,   `Menos de ${linea} puntos`],
    AMBOS_ANOTAN:      ['Ambos anotan', 'No anotan ambos'],
    DOBLE_OPORTUNIDAD: [`Gana ${equipo}`, `No gana ${equipo}`],
    GANADOR_DIRECTO:   [`Gana ${equipo}`, `No gana ${equipo}`],
  };
  const [favor, contra] = etiquetas[tipo] ?? [def.nombre, `No: ${def.nombre}`];

  // Se guarda un resumen corto además de las etiquetas: en la lista
  // de la sala en construcción interesa "Más / menos de 2.5", no la
  // frase completa de cada lado.
  const resumenes = {
    TOTAL_GOLES:       `Más / menos de ${linea}`,
    TOTAL_CORNERS:     `Más / menos de ${linea}`,
    TOTAL_TARJETAS:    `Más / menos de ${linea}`,
    TOTAL_PUNTOS:      `Más / menos de ${linea}`,
    AMBOS_ANOTAN:      'Sí / no',
    DOBLE_OPORTUNIDAD: `${equipo} sí / no`,
    GANADOR_DIRECTO:   `${equipo} sí / no`,
  };

  n.mercados.push({
    tipo, linea, equipo,
    nombre: def.nombre,
    resumen: resumenes[tipo] ?? '',
    etiquetaFavor: favor,
    etiquetaContra: contra,
  });
  if (document.getElementById('lista')) pintarSelector();
  else dibujarCreacion();
}

function quitarMercado(indice) {
  S.datos.nueva.mercados.splice(indice, 1);
  // Solo se redibuja el interior: rehacer la hoja perdería el texto
  // del buscador y la posición del desplazamiento.
  if (document.getElementById('lista')) pintarSelector();
  else dibujarCreacion();
}

async function publicarSala() {
  const n = S.datos.nueva;
  const minimo = aUnidades(document.getElementById('minimo').value);
  const cupos = Number(document.getElementById('tope').value.replace(/\D/g, ''));
  const piso = S.pais?.minimoApuesta ?? 500;
  const maxCupos = maxParticipantesSala();

  if (minimo <= 0) return aviso('Escribe cuánto tiene que poner cada persona.', 'mal');
  if (minimo < piso) {
    return aviso(`La apuesta más baja permitida es ${plata(piso)}.`, 'mal');
  }
  if (!(cupos >= 2 && cupos <= maxCupos)) {
    return aviso(`Tienen que caber entre 2 y ${maxCupos} participantes.`, 'mal');
  }

  await accion(async () => {
    const r = await api('/salas', {
      method: 'POST',
      body: JSON.stringify({
        partidoId: n.partido.id,
        topeParticipantes: cupos,
        montoMinimoCentavos: minimo,
        mercados: n.mercados.map(m => ({
          tipo: m.tipo,
          ...(m.linea !== null ? { linea: m.linea } : {}),
          ...(m.equipo ? { equipo: m.equipo } : {}),
        })),
      }),
    });
    cerrarHoja();
    limpiarEstadoEditorSalaEnCrear();
    aviso(`Sala ${r.codigo} creada`, 'bien');
    ir('mias');
  }, null, 'Creando');
}
