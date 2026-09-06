'use strict';

const esc = t => String(t ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/**
 * Escapa para una cadena de JAVASCRIPT que además vive dentro de un
 * atributo HTML, como `onclick="f('AQUI')"`.
 *
 * ⚠️ `esc()` NO sirve para eso, y confundir los dos contextos fue un
 * agujero real. `esc()` convierte la comilla en `&#39;`, pero el
 * navegador decodifica las entidades del atributo ANTES de compilar el
 * JavaScript: la comilla vuelve, cierra la cadena, y lo que siga se
 * ejecuta.
 *
 * Aquí se usan escapes hexadecimales de JavaScript (`\x27`), que no son
 * entidades HTML y por tanto sobreviven a esa decodificación.
 *
 * La lista es blanca a propósito: se deja pasar solo lo inofensivo y se
 * escapa todo lo demás. Una lista negra siempre se queda corta.
 *
 * Aun así, la salida preferida es no meter datos en un atributo: usa
 * `addEventListener` o `dataset` cuando puedas. Esto es para lo que ya
 * está escrito así.
 */
function escJs(t) {
  return String(t ?? '').replace(/[^a-zA-Z0-9 _.-]/g, (c) => {
    const n = c.charCodeAt(0);
    return n < 256
      ? '\\x' + n.toString(16).padStart(2, '0')
      : '\\u' + n.toString(16).padStart(4, '0');
  });
}

/**
 * Formatea dinero según el país del usuario.
 *
 * El monto viaja SIEMPRE como entero en la unidad mínima. Dividir por
 * 100 a ciegas rompería el peso chileno, que no tiene decimales.
 */
function plata(unidades, conSimbolo = true) {
  const p = S.pais ?? { decimales: 2, simbolo: 'S/', separadorMiles: ',', separadorDecimal: '.' };
  const signo = unidades < 0 ? '-' : '';
  const abs = Math.abs(Number(unidades) || 0);
  const div = 10 ** p.decimales;
  const entera = String(Math.floor(abs / div))
    .replace(/\B(?=(\d{3})+(?!\d))/g, p.separadorMiles);
  const simbolo = conSimbolo ? p.simbolo : '';
  if (p.decimales === 0) return signo + simbolo + entera;
  return signo + simbolo + entera + p.separadorDecimal +
    String(abs % div).padStart(p.decimales, '0');
}

/** Del texto que escribe la persona al entero que se guarda. */
function aUnidades(texto) {
  const p = S.pais ?? { decimales: 2 };
  const n = Number(String(texto).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 10 ** p.decimales) : 0;
}

/**
 * Cuánto falta para el partido, en palabras.
 *
 * "en 3h 20m" dice más que una hora exacta: lo que importa es si da
 * tiempo a llenar la sala, no a qué hora es.
 */
function cuando(fecha) {
  const min = Math.round((new Date(fecha) - Date.now()) / 60000);
  if (min < 0) return 'empezó';
  if (min < 60) return `en ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `en ${h}h ${min % 60}m`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'mañana';
  if (d < 7) return `en ${d} días`;
  return new Date(fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}

function fechaCorta(f) {
  return f ? new Date(f).toLocaleString('es-PE',
    { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

function pintar(html) {
  document.getElementById('app').innerHTML = html;
  window.scrollTo(0, 0);
}

function cargando(texto = 'Cargando') {
  return `<div class="cargando"><span class="giro"></span><span>${esc(texto)}</span></div>`;
}

// ---------------------------------------------------------------------
//  Avisos
// ---------------------------------------------------------------------

function aviso(texto, tipo = '') {
  const d = document.createElement('div');
  d.className = 'aviso ' + tipo;
  d.textContent = texto;
  document.getElementById('avisos').append(d);
  // Los errores duran más: hay que alcanzar a leerlos.
  setTimeout(() => d.remove(), tipo === 'mal' ? 5000 : 3000);
}

// ---------------------------------------------------------------------
//  Hoja inferior
// ---------------------------------------------------------------------

/**
 * Hoja de contenido.
 *
 * En móvil sube desde abajo; en escritorio entra por la derecha y
 * ocupa toda la altura. Un formulario largo dentro de una hoja que
 * sube obliga a hacer scroll dentro de otro scroll, que es justo lo
 * que cansa.
 */
function hoja(titulo, subtitulo, cuerpo) {
  document.getElementById('velo').innerHTML = `
    <div class="hoja" onclick="event.stopPropagation()" role="dialog"
         aria-label="${esc(titulo)}">
      <button class="hoja-cerrar" onclick="cerrarHoja()" aria-label="Cerrar">×</button>
      <div class="hoja-interior">
        <div class="agarre"></div>
        <h2>${esc(titulo)}</h2>
        ${subtitulo ? `<p class="hoja-sub">${esc(subtitulo)}</p>` : ''}
        ${cuerpo}
      </div>
    </div>`;
  document.getElementById('velo').classList.add('visible');
  document.body.style.overflow = 'hidden';

  // Escape cierra: es lo que la gente intenta primero.
  document.addEventListener('keydown', escCierra);
}

function escCierra(e) {
  if (e.key === 'Escape') cerrarHoja();
}

function cerrarHoja() {
  document.getElementById('velo').classList.remove('visible');
  document.getElementById('velo').innerHTML = '';
  document.body.style.overflow = '';
  document.removeEventListener('keydown', escCierra);

  // "Agregar mercado" dentro de Sala reutiliza el selector de Crear.
  // Al cerrar por X, Escape o clic en el fondo, se elimina ese modo para
  // que al entrar luego a Crear nunca aparezca el editor de la sala.
  if (S?.datos?.modoEditorSala) {
    S.datos.modoEditorSala = false;
    S.datos.editorMercadosOriginales = null;
    S.datos.editorSalaMeta = null;
    S.datos.configurando = null;
    S.datos.nueva = null;
  }
}

// ---------------------------------------------------------------------
//  Botones ocupados
// ---------------------------------------------------------------------

/**
 * Sin señal de que algo está pasando, la gente pulsa dos veces. En
 * operaciones con dinero eso es justo lo que no puede ocurrir.
 */
function ocupar(boton, texto) {
  if (!boton) return () => {};
  const original = boton.innerHTML;
  boton.disabled = true;
  boton.innerHTML = `<span class="giro"></span>${esc(texto ?? 'Un momento')}`;
  return () => { boton.disabled = false; boton.innerHTML = original; };
}

async function accion(fn, exito, ocupado) {
  const liberar = ocupar(S.botonPulsado, ocupado);
  try {
    await fn();
    if (exito) aviso(exito, 'bien');
  } catch (e) {
    aviso(e.message, 'mal');
    // Si el error dice qué hacer, se lleva ahí.
    if (e.accion === 'RECARGAR') setTimeout(() => ir('billetera'), 900);
    if (e.accion === 'REFRESCAR') setTimeout(() => PANTALLAS[S.pantalla]?.(), 900);
  } finally {
    liberar();
  }
}

document.addEventListener('click', e => {
  const b = e.target.closest?.('button');
  if (b) S.botonPulsado = b;
}, true);

/**
 * Aviso de límite alcanzado.
 *
 * Se muestra cuando se choca con la restricción, no de antemano: una
 * advertencia permanente se deja de leer, y ver opciones apagadas sin
 * explicación se lee como un error de la app.
 */
/**
 * El escudo de un equipo, o sus iniciales si no hay.
 *
 * No todas las ligas traen escudo, así que la alternativa tiene que
 * verse bien: un hueco vacío desalinea la tarjeta entera.
 *
 * `loading="lazy"` porque el muro puede tener veinte partidos y no
 * hace falta descargar cuarenta imágenes de golpe. `onerror` cubre el
 * caso de que el CDN del proveedor no responda.
 */
function escudo(url, nombre) {
  const iniciales = String(nombre ?? '?')
    .split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();

  // Las iniciales viajan por `data-`, no dentro del `onerror`.
  //
  // Antes se incrustaban en una cadena de JavaScript dentro del
  // atributo, y el nombre del equipo lo pone el proveedor externo: una
  // comilla en él cerraba la cadena. Un atributo de datos no se
  // interpreta como código, así que el problema desaparece de raíz.
  return url
    ? `<img class="escudo" src="${esc(url)}" alt="" loading="lazy"
         data-iniciales="${esc(iniciales)}" onerror="escudoRoto(this)">`
    : `<span class="escudo escudo-letras">${esc(iniciales)}</span>`;
}

/** El CDN del proveedor no respondió: se cae a las iniciales. */
function escudoRoto(img) {
  const s = document.createElement('span');
  s.className = 'escudo escudo-letras';
  s.textContent = img.dataset.iniciales || '?';
  img.replaceWith(s);
}

/** Los dos escudos con el «vs» en medio. */
function escudosPartido(p) {
  return `
  <span class="escudos">
    ${escudo(p.logo_local, p.equipo_local)}
    ${escudo(p.logo_visitante, p.equipo_visitante)}
  </span>`;
}

function avisoTope(texto) {
  return `
  <div class="tope">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16.5v.01"/></svg>
    ${esc(texto)}
  </div>`;
}

function campoClave(id, etiqueta, autocomplete = 'current-password') {
  return `<div class="campo">
    <label for="${id}">${etiqueta}</label>
    <div class="con-ojo">
      <input id="${id}" type="password" autocomplete="${autocomplete}">
      <button type="button" class="ojo" onclick="verClave('${id}',this)"
        aria-label="Mostrar contraseña">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
          <circle cx="12" cy="12" r="3"/></svg>
      </button>
    </div>
  </div>`;
}

function verClave(id, boton) {
  const i = document.getElementById(id);
  const visible = i.type === 'text';
  i.type = visible ? 'password' : 'text';
  boton.style.color = visible ? '' : 'var(--favor)';
  i.focus();
}
