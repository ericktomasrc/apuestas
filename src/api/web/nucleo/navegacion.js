'use strict';

const PANTALLAS = {};

/**
 * El menú.
 *
 * `si` es una condición: si devuelve false, la opción no aparece.
 * Mostrar un menú que lleva a una pantalla vacía es peor que no
 * mostrarlo — la persona hace clic, no encuentra nada, y concluye que
 * la app está rota.
 *
 * `privada` marca las que no tienen sentido sin cuenta: no es que
 * fallen, es que no habría nada que mostrar. A un visitante se le
 * ocultan y, si llega por la URL, se le explica en vez de rebotarlo.
 */

/**
 * La cuenta que opera la casa NO ve las salas.
 *
 * Una casa que además apuesta en salas normales es la plataforma
 * jugando contra sus propios usuarios por dos vías. Mostrarle esas
 * opciones invitaría a algo que el servidor ya bloquea.
 */
const esCasa = () => S.usuario?.es_casa_oficial === true;

const NAV = [
  { id:'muro',      nombre:'Salas',      si: () => !esCasa(),
    icono:'<path d="M3 12h18M3 6h18M3 18h18"/>' },
  { id:'casas',     nombre:'Casas',      si: () => S.modulos?.casa === true,
    icono:'<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
  { id:'crear',     nombre:'Crear',      si: () => !esCasa(),
    icono:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>' },
  { id:'mias',      nombre:'Mis salas',  privada: true, si: () => !esCasa(),
    icono:'<path d="M20 7l-8-4-8 4v10l8 4 8-4V7z"/><path d="M12 3v18"/>' },
  { id:'resultados', nombre:'Resultados', privada: true,
    icono:'<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>' },
  { id:'billetera', nombre:'Billetera',  privada: true,
    icono:'<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M17 14h.01"/>' },
];

/** Qué se le explica a un visitante que llega a una pantalla privada. */
const PORQUE_CUENTA = {
  mias:       'Aquí van las salas que abras y aquellas donde apuestes.',
  resultados: 'Aquí verás cuánto ganaste y cuánto perdiste.',
  billetera:  'Aquí vive tu saldo y el detalle de cada movimiento.',
  casas:      'Las casas de la plataforma necesitan una cuenta para entrar.',
};

function armazon(contenido, lateral) {
  const iniciales = (S.usuario?.alias ?? '??').slice(0, 2);
  const visible = NAV.filter(n =>
    (!n.si || n.si()) && (haySesion() || !n.privada));

  return `
  <header class="superior">
    <div class="superior-fila">
      <button class="marca" onclick="ir('muro')" aria-label="Inicio">
        <img class="marca-logo-referencia" src="logo-tandabet.png" alt="TandaBet">
      </button>

      <nav class="nav-escritorio" aria-label="Navegación principal">
        ${visible.map(n => `
          <a href="#${n.id}" class="${S.pantalla === n.id ? 'activo' : ''}"
             onclick="event.preventDefault();ir('${n.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round">${n.icono}</svg>
            ${n.nombre}
          </a>`).join('')}
      </nav>

      <div class="superior-der">
        ${haySesion() ? `
          <button class="saldo-chip saldo-chip-simple" id="saldo-chip"
            onclick="ir('billetera')" aria-label="Ver billetera">
            <svg class="saldo-chip-icono" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
              stroke-linejoin="round" aria-hidden="true">
              <rect x="2.5" y="6" width="19" height="13" rx="2"/>
              <path d="M2.5 9.5h19"/>
              <path d="M16.5 13h3v3h-3z"/>
            </svg>
            <strong>${plata(S.saldo?.disponibleCentavos ?? 0)}</strong>
          </button>
          <button class="saldo-recargar" onclick="ir('billetera')">
            + Recargar
          </button>
          <button class="yo" onclick="menuCuenta(event)"
            aria-label="Mi cuenta" title="${esc(S.usuario?.alias ?? '')}">
            ${esc(iniciales)}
          </button>`
        : `
          <button class="btn-entrar plano" onclick="pantallaEntrar('ingreso')">Entrar</button>
          <button class="btn-entrar" onclick="pantallaEntrar('registro')">Crear cuenta</button>`}
      </div>
    </div>
  </header>

  <nav class="inferior">
    <div class="nav-fila">
      ${visible.map(n => `
        <a href="#${n.id}" class="${S.pantalla === n.id ? 'activo' : ''}"
           onclick="event.preventDefault();ir('${n.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round">${n.icono}</svg>
          ${n.nombre}
        </a>`).join('')}
    </div>
  </nav>

  <main>
    ${lateral
      ? `<div class="doble">
           <div>${contenido}</div>
           <aside class="lateral">${lateral}</aside>
         </div>`
      : `<div class="envoltura">${contenido}</div>`}
  </main>`;
}

/**
 * Menú de cuenta.
 *
 * Vive detrás del avatar porque cerrar sesión no compite por atención
 * con el trabajo del día, pero tiene que estar donde la gente lo busca.
 */
function menuCuenta(e) {
  e.stopPropagation();
  if (document.querySelector('.menu-cuenta')) return cerrarMenuCuenta();

  const d = document.createElement('div');
  d.className = 'menu-cuenta';
  d.innerHTML = `
    <div class="quien">
      <span class="menu-avatar">${esc(String(S.usuario?.alias ?? '?').slice(0, 2).toUpperCase())}</span>
      <div class="menu-identidad">
        <strong>${esc(S.usuario?.alias ?? '')}</strong>
        <small>${esc(S.usuario?.email ?? '')}</small>
      </div>
    </div>
    <button onclick="cerrarMenuCuenta();ir('billetera')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/>
        <path d="M2 10h20"/></svg>
      Mi billetera
    </button>
    <button onclick="cerrarMenuCuenta();ir('mias')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2"><path d="M20 7l-8-4-8 4v10l8 4 8-4V7z"/></svg>
      Mis salas
    </button>
    <button class="salir" onclick="salir()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <path d="M16 17l5-5-5-5M21 12H9"/></svg>
      Cerrar sesión
    </button>`;
  document.body.append(d);
  setTimeout(() => document.addEventListener('click', cerrarMenuCuenta, { once: true }), 0);
}

function cerrarMenuCuenta() {
  document.querySelector('.menu-cuenta')?.remove();
}

/**
 * Pantalla de una sección privada vista por un visitante.
 *
 * Se explica qué habría ahí y se ofrece la cuenta. Rebotarlo al muro
 * sin decir nada haría parecer que el enlace está roto.
 */
function pantallaPrivada(id) {
  pintar(armazon(`
    <div class="vacio">
      <h3>Esto es tuyo, pero necesitas una cuenta</h3>
      <p>${esc(PORQUE_CUENTA[id] ?? 'Esta sección es de cada persona.')}</p>
      <button class="btn btn-favor" onclick="pantallaEntrar('registro')">Crear mi cuenta</button>
      <button class="btn btn-plano" style="margin-top:9px"
        onclick="pantallaEntrar('ingreso')">Ya tengo cuenta</button>
      <button class="btn-plano btn-chico" style="margin-top:14px"
        onclick="ir('muro')">Seguir mirando salas</button>
    </div>`));
}

/**
 * El parámetro de la ruta, saneado.
 *
 * Todas las pantallas lo usan como identificador: `#sala/<uuid>`,
 * `#casa/<uuid>`. Cualquier cosa que no tenga esa forma es basura o un
 * intento de inyección, y en los dos casos lo correcto es descartarla.
 *
 * Es la segunda barrera, no la única: el arreglo de fondo es que el
 * parámetro nunca se incruste en HTML. Esto lo detiene antes de llegar
 * a ninguna parte.
 */
function parametroDeRuta(bruto) {
  if (bruto === undefined || bruto === null || bruto === '') return undefined;
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(bruto)) ? String(bruto) : undefined;
}

function ir(id, datos) {
  if (!PANTALLAS[id]) return;

  // Punto único de saneo: cubre el hash, el arranque y cualquier
  // llamada interna. Filtrar en cada llamador es olvidarse en alguno.
  datos = parametroDeRuta(datos);

  const opcion = NAV.find(n => n.id === id);

  // Si el módulo se apagó mientras la persona estaba dentro, no basta
  // con esconder el menú: hay que sacarla de la pantalla.
  if (opcion?.si && !opcion.si()) {
    aviso('Esa sección ya no está disponible.');
    id = esCasa() ? 'casas' : 'muro';
    datos = undefined;
  }

  S.pantalla = id;
  document.body.classList.toggle('muro-activo',
    ['muro','crear','mias','resultados','billetera','casas','casa'].includes(id));
  document.body.classList.toggle('crear-activa', id === 'crear');
  document.body.classList.toggle('mias-activa', id === 'mias');
  document.body.classList.toggle('resultados-activa', id === 'resultados');
  document.body.classList.toggle('billetera-activa', id === 'billetera');
  document.body.classList.toggle('casas-activa', id === 'casas');
  document.body.classList.toggle('casa-activa', id === 'casa');
  document.body.classList.toggle('sala-activa', id === 'sala');
  document.body.classList.remove('pantalla-registro-activa');
  S.datos.parametro = datos;
  location.hash = datos ? `${id}/${datos}` : id;
  cerrarMenuCuenta();

  // Privada y sin cuenta: se explica en vez de fallar. La URL ya
  // quedó fijada arriba, así que al registrarse se vuelve justo aquí.
  if (opcion?.privada && !haySesion()) return pantallaPrivada(id);

  pintar(armazon(cargando()));

  PANTALLAS[id](datos).catch(e => {
    if (e.codigo === 'SIN_CUENTA') return pantallaPrivada(id);
    pintar(armazon(`
      <div class="vacio">
        <h3>No se pudo cargar</h3>
        <p>${esc(e.message)}</p>
        <button class="btn btn-plano" id="btn-reintentar">Reintentar</button>
      </div>`));

    // El parámetro NO se incrusta en el HTML: viaja por la clausura.
    //
    // Antes iba dentro de un `onclick="ir('...','...')"`, y como sale
    // de la URL, bastaba un enlace con una comilla para que el texto
    // se compilara como código. Esta pantalla es justo la que ve
    // alguien al abrir un enlace roto, así que era el camino más
    // corto para el ataque.
    document.getElementById('btn-reintentar')
      ?.addEventListener('click', () => ir(id, datos));
  });
}

window.addEventListener('hashchange', () => {
  const [id, dato] = location.hash.slice(1).split('/');
  if (id && (id !== S.pantalla || dato !== S.datos.parametro)) ir(id, dato);
});
