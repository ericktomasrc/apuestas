/* ===== Navegación y permisos ===== */

const puede = p => S.permisos.has(p);

/* ============================================================
   Navegación — solo se muestra lo que la persona puede usar.
   Un menú con opciones que van a fallar es peor que no tenerlas.
   ============================================================ */
/**
 * Qué pantalla abre cada permiso.
 *
 * Sin esto, elegir permisos es adivinar: alguien marca
 * `comisiones.gestionar` esperando que la persona pueda editar
 * membresías, pero sin `comisiones.ver` el menú ni aparece.
 */
const QUE_ABRE = {
  'reportes.ver':         { menu: 'Resumen · Ingresos', abre: true },
  'reportes.exportar':    { menu: 'Ingresos', abre: false, nota: 'Descargar los reportes' },
  'usuarios.ver':         { menu: 'Usuarios · Ubicación', abre: true },
  'usuarios.crear':       { menu: 'Usuarios', abre: false, nota: 'Botón Crear cuenta' },
  'usuarios.suspender':   { menu: 'Usuarios', abre: false, nota: 'Botón Suspender' },
  'usuarios.roles':       { menu: 'Usuarios', abre: false, nota: 'Botón Roles' },
  'roles.gestionar':      { menu: 'Roles', abre: true },
  'paises.ver':           { menu: 'Países', abre: true },
  'paises.gestionar':     { menu: 'Países', abre: false, nota: 'Agregar y editar' },
  'comisiones.ver':       { menu: 'Membresías', abre: true },
  'comisiones.gestionar': { menu: 'Membresías', abre: false, nota: 'Crear y editar' },
  'config.ver':           { menu: 'Parámetros · Historial', abre: true },
  'config.gestionar':     { menu: 'Parámetros', abre: false, nota: 'Cambiar valores' },
  'textos.gestionar':     { menu: 'Textos', abre: true },
  'incidentes.ver':       { menu: 'Incidentes', abre: true },
  'incidentes.resolver':  { menu: 'Incidentes', abre: false, nota: 'Marcar resueltos' },
  'seguridad.ver':        { menu: 'Seguridad', abre: true },
  'deportes.ver':         { menu: 'Deportes', abre: true },
  'deportes.gestionar':   { menu: 'Deportes', abre: false, nota: 'Agregar ligas y habilitar mercados' },
  'salas.ver':            { menu: 'Salas', abre: true },
  'salas.anular':         { menu: 'Salas', abre: false, nota: 'Forzar cierre y anular' },
  'ajustes.crear':        { menu: '—', abre: false, nota: 'Solo por API. Correcciones contables.' },
};

/** El permiso de lectura que hace falta para que el menú aparezca. */
const NECESITA = {
  'comisiones.gestionar': 'comisiones.ver',
  'paises.gestionar':     'paises.ver',
  'config.gestionar':     'config.ver',
  'deportes.gestionar':   'deportes.ver',
  'incidentes.resolver':  'incidentes.ver',
  'salas.anular':         'salas.ver',
  'usuarios.crear':       'usuarios.ver',
  'usuarios.suspender':   'usuarios.ver',
  'usuarios.roles':       'usuarios.ver',
  'reportes.exportar':    'reportes.ver',
};

/**
 * Iconos del menú.
 *
 * Trazos simples de 24×24, sin relleno. En una barra de quince
 * opciones ayudan a encontrar la sección de memoria sin leer cada
 * palabra.
 */
/**
 * Iconos del menú.
 *
 * Se llama ICONOS_MENU y no ICONOS porque avisos.js ya declara uno con
 * ese nombre. Los archivos del panel comparten el ámbito global —no
 * hay módulos— así que dos constantes iguales rompen la carga entera
 * con «Identifier already declared».
 */
const ICONOS_MENU = {
  resumen:    '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
  ingresos:   '<path d="M12 2v20"/><path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3 5 1.4 5 3.2-2.2 3.3-5 3.3-5-1.2-5-3.1"/>',
  usuarios:   '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6"/><path d="M17 8a3.2 3.2 0 100-6.4"/><path d="M18 14.6c2.1.5 3.5 2 3.5 4.2"/>',
  roles:      '<path d="M12 2.5l7.5 3v5.4c0 4.4-3.1 8.4-7.5 10.1-4.4-1.7-7.5-5.7-7.5-10.1V5.5z"/><path d="M9 12l2 2 4-4.5"/>',
  deportes:   '<circle cx="12" cy="12" r="9.2"/><path d="M12 6.6l3.6 2.6-1.4 4.2H9.8L8.4 9.2z"/><path d="M12 2.8v3.8M4.5 8.6l3.9.6M19.5 8.6l-3.9.6M7.5 20l2.3-6.6M16.5 20l-2.3-6.6"/>',
  paises:     '<circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4"/><path d="M12 2.8c2.4 2.6 3.7 5.8 3.7 9.2s-1.3 6.6-3.7 9.2c-2.4-2.6-3.7-5.8-3.7-9.2S9.6 5.4 12 2.8z"/>',
  planes:     '<path d="M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.1l-5.6 2.9 1.1-6.2L2.9 9.4l6.3-.9z"/>',
  config:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>',
  textos:     '<path d="M4 6.5V4.5h16v2"/><path d="M12 4.5v15"/><path d="M8.5 19.5h7"/>',
  casa:       '<path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6.5H9V21H4a1 1 0 01-1-1z"/>',
  salas:      '<rect x="2.8" y="4.5" width="18.4" height="15" rx="2"/><path d="M2.8 9.5h18.4M9 9.5v10"/>',
  ubicacion:  '<path d="M12 21.5s7-5.6 7-11.1a7 7 0 10-14 0c0 5.5 7 11.1 7 11.1z"/><circle cx="12" cy="10.2" r="2.6"/>',
  incidentes: '<path d="M10.3 3.6L1.9 18a2 2 0 001.7 3h16.8a2 2 0 001.7-3L13.7 3.6a2 2 0 00-3.4 0z"/><path d="M12 9.5v4M12 17.4v.01"/>',
  historial:  '<circle cx="12" cy="12" r="9.2"/><path d="M12 6.8V12l3.4 2"/>',
  seguridad:  '<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 018 0v3.5"/>',
  cuenta:     '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-3.9 3.4-6.4 7.5-6.4s7.5 2.5 7.5 6.4"/>',
};

const SECCIONES = [
  { grupo:'Negocio' },
  { id:'resumen',    nombre:'Resumen',       permiso:'reportes.ver' },
  { id:'ingresos',   nombre:'Ingresos',      permiso:'reportes.ver' },
  { grupo:'Gente' },
  { id:'usuarios',   nombre:'Usuarios',      permiso:'usuarios.ver' },
  { id:'roles',      nombre:'Roles',         permiso:'roles.gestionar' },
  { grupo:'Catálogo' },
  { id:'deportes',   nombre:'Deportes',      permiso:'deportes.ver' },
  { grupo:'Configuración' },
  { id:'paises',     nombre:'Países',        permiso:'paises.ver' },
  { id:'planes',     nombre:'Membresías',    permiso:'comisiones.ver' },
  { id:'config',     nombre:'Parámetros',    permiso:'config.ver' },
  { id:'textos',     nombre:'Textos',        permiso:'textos.gestionar' },
  { grupo:'Operación' },
  { id:'casa',       nombre:'Casa',          permiso:'casa.ver' },
  { id:'salas',      nombre:'Salas',         permiso:'salas.ver' },
  { id:'ubicacion',  nombre:'Ubicación',     permiso:'usuarios.ver' },
  { id:'incidentes', nombre:'Incidentes',    permiso:'incidentes.ver' },
  { id:'historial',  nombre:'Historial',     permiso:'config.ver' },
  { id:'seguridad',  nombre:'Seguridad',     permiso:'seguridad.ver' },
];

/** El SVG de una sección, o vacío si no tiene icono. */
function icono(id) {
  const d = ICONOS_MENU[id];
  return d
    ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
         stroke-linejoin="round">${d}</svg>`
    : '';
}

function dibujarMenu() {
  const menu = document.getElementById('menu');
  menu.innerHTML = '';
  let grupoPendiente = null;

  for (const s of SECCIONES) {
    if (s.grupo) { grupoPendiente = s.grupo; continue; }
    if (!puede(s.permiso)) continue;

    if (grupoPendiente) {
      const g = document.createElement('div');
      g.className = 'nav-grupo';
      g.textContent = grupoPendiente;
      menu.append(g);
      grupoPendiente = null;
    }
    const a = document.createElement('a');
    a.href = '#' + s.id;
    // innerHTML y no textContent: el icono es SVG. El nombre va
    // escapado porque viene de esta misma lista, pero se mantiene la
    // costumbre por si algún día se traduce desde la base.
    a.innerHTML = icono(s.id) + `<span>${esc(s.nombre)}</span>`;
    a.dataset.id = s.id;
    a.onclick = ev => { ev.preventDefault(); ir(s.id); };
    menu.append(a);
  }
}

function ir(id) {
  const seccion = SECCIONES.find(s => s.id === id);
  if (!seccion || !puede(seccion.permiso)) {
    const primera = SECCIONES.find(s => s.id && puede(s.permiso));
    if (!primera) {
      // Tiene permisos pero ninguno abre pantalla. Antes esto dejaba el
      // panel en blanco sin explicación.
      document.getElementById('contenido').innerHTML = `
        <div class="cargando-vista">
          <p style="max-width:420px;line-height:1.6">
            <strong style="color:var(--tinta)">Tu rol no abre ninguna sección.</strong><br>
            Tienes ${S.permisos.size} permiso(s), pero ninguno de lectura.
            Por ejemplo, para editar membresías hace falta además
            <span class="num">comisiones.ver</span>.<br><br>
            Pídele a quien administra que revise tu rol.</p>
        </div>`;
      return;
    }
    id = primera.id;
  }
  S.seccion = id;
  location.hash = id;
  document.querySelectorAll('#menu a').forEach(a =>
    a.classList.toggle('activo', a.dataset.id === id));
  document.getElementById('contenido').innerHTML =
    '<div class="cargando-vista"><span class="giro"></span>Cargando</div>';

  // Si la vista falla, la pantalla no puede quedarse girando para
  // siempre: se muestra qué pasó y cómo reintentar.
  VISTAS[id]().catch(err => {
    document.getElementById('contenido').innerHTML = `
      <div class="cargando-vista">
        <p>No se pudo cargar esta sección.<br>
        <span style="color:var(--mal)">${esc(err.message)}</span></p>
        <button class="btn-plano btn-chico" onclick="ir('${id}')">Reintentar</button>
      </div>`;
  });
}

/* ============================================================
   Utilidades
   ============================================================ */
/**
 * Campo de contraseña con botón para mostrarla.
 *
 * Se usa en todos lados: ingresar, cambiar, restablecer y confirmar.
 * Un solo sitio donde arreglarlo si algo cambia.
 */
function campoClave(id, etiqueta, opciones = {}) {
  const { pista = '', autocomplete = 'current-password', minlength = '' } = opciones;
  return `<div class="campo">
    <label for="${id}">${etiqueta}</label>
    <div class="con-ojo">
      <input id="${id}" type="password" autocomplete="${autocomplete}"
        ${minlength ? `minlength="${minlength}"` : ''}>
      <button type="button" class="ojo" onclick="alternarClave('${id}', this)"
        aria-label="Mostrar contraseña" title="Mostrar contraseña">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </div>
    ${pista ? `<p class="pista">${pista}</p>` : ''}
  </div>`;
}

function alternarClave(id, boton) {
  const input = document.getElementById(id);
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  boton.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  boton.setAttribute('title', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  boton.innerHTML = visible
    ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
         <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
         <circle cx="12" cy="12" r="3"/></svg>`
    : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
         <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/>
         <path d="M16.7 16.7A9.9 9.9 0 0 1 12 18c-6.5 0-10-7-10-7a17 17 0 0 1 4.1-5"/>
         <path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.3 3.3"/>
         <path d="M3 3l18 18"/></svg>`;
  input.focus();
}
