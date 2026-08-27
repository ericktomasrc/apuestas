/* ===== Utilidades, modales y confirmaciones ===== */

const esc = t => String(t ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Los montos viajan como enteros en la unidad mínima. Dividir por
 *  100 a ciegas rompería el peso chileno, que no tiene decimales. */
function plata(unidades, moneda = 'PEN') {
  const cfg = { PEN:[2,'S/',',','.'], CLP:[0,'$','.',','], USD:[2,'$',',','.'],
                BRL:[2,'R$','.',','] }[moneda] || [2,'',',','.'];
  const [dec, simbolo, miles, decimal] = cfg;
  const signo = unidades < 0 ? '-' : '';
  const abs = Math.abs(Number(unidades) || 0);
  const divisor = 10 ** dec;
  const entera = String(Math.floor(abs / divisor)).replace(/\B(?=(\d{3})+(?!\d))/g, miles);
  if (dec === 0) return signo + simbolo + entera;
  return signo + simbolo + entera + decimal + String(abs % divisor).padStart(dec, '0');
}

const fecha = f => f ? new Date(f).toLocaleString('es-PE',
  { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';

function render(html) { document.getElementById('contenido').innerHTML = html; }

function cab(titulo, subtitulo, acciones = '') {
  return `<div class="cabecera">
    <div><h1>${esc(titulo)}</h1><div class="subtitulo">${esc(subtitulo)}</div></div>
    <div class="fila-acciones">${acciones}</div>
  </div>`;
}

function vacio(mensaje, accion = '') {
  return `<div class="marco"><div class="vacio"><p>${esc(mensaje)}</p>${accion}</div></div>`;
}

/**
 * Confirmación con modal, en lugar de `confirm()`.
 *
 * El diálogo del navegador dice "localhost:3000 dice", no se puede dar
 * formato, y bloquea todo el hilo. Además su texto no puede explicar
 * la consecuencia de la acción, que es justo lo que hace falta antes
 * de algo irreversible.
 */
function confirmar(opciones) {
  const { titulo, mensaje, consecuencia, textoBoton = 'Confirmar',
          peligroso = false, alAceptar } = opciones;

  S.datos.alConfirmar = alAceptar;
  modal(titulo, `
    <p style="font-size:14.5px;line-height:1.6;margin-bottom:${consecuencia ? '14px' : '0'}">
      ${esc(mensaje)}</p>
    ${consecuencia ? `<div class="banda" style="margin:0">
      <p>${esc(consecuencia)}</p></div>` : ''}`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn${peligroso ? ' btn-mal' : ''}" onclick="ejecutarConfirmado()">
       ${esc(textoBoton)}</button>`);
}

async function ejecutarConfirmado() {
  const fn = S.datos.alConfirmar;
  if (fn) await fn();
}

function modal(titulo, cuerpo, pie) {
  document.getElementById('velo').innerHTML = `<div class="modal">
    <div class="modal-cab"><h2 style="margin:0">${esc(titulo)}</h2>
      <button class="btn-plano btn-chico" onclick="cerrarModal()">Cerrar</button></div>
    <div class="modal-cuerpo">${cuerpo}</div>
    <div class="modal-pie">${pie}</div></div>`;
  document.getElementById('velo').classList.add('visible');
}
function cerrarModal() {
  document.getElementById('velo').classList.remove('visible');
  document.getElementById('velo').innerHTML = '';
}

/**
 * Intenta la acción; si el servidor pide confirmar, la pide y reintenta.
 *
 * El servidor mantiene una ventana de confianza de unos minutos tras
 * la primera confirmación —como `sudo`—, así que en una tanda de
 * cambios solo se pregunta la primera vez. Preguntar en cada clic
 * parece más seguro pero no lo es: la gente acaba dejando la
 * contraseña en el portapapeles.
 */

/**
 * Pide la contraseña antes de una acción irreversible.
 *
 * No es fricción por gusto: cambiar una comisión mueve dinero de todos
 * y repartir permisos abre el sistema entero. Un token robado, o una
 * sesión abierta en una máquina compartida, no deberían bastar.
 */

function credencialesConfirmadas() {
  const pass = document.getElementById('cf_pass');
  const cod = document.getElementById('cf_cod');
  if (!pass?.value) throw new Error('Escribe tu contraseña.');
  return {
    confirmarPassword: pass.value,
    ...(cod?.value ? { confirmarCodigo: cod.value } : {}),
  };
}

/**
 * Marca un botón como ocupado mientras corre la acción.
 *
 * Devuelve la función que lo restaura. Guardar el texto original y
 * reponerlo evita que un fallo deje el botón en "Guardando…" para
 * siempre.
 */
function ocupar(boton, texto = 'Guardando') {
  if (!boton) return () => {};
  const original = boton.innerHTML;
  boton.dataset.ocupado = '1';
  boton.disabled = true;
  boton.innerHTML = `<span class="giro"></span>${esc(texto)}…`;

  const modal = boton.closest('.modal');
  if (modal) modal.dataset.ocupado = '1';

  return () => {
    delete boton.dataset.ocupado;
    boton.disabled = false;
    boton.innerHTML = original;
    if (modal) delete modal.dataset.ocupado;
  };
}

/**
 * Envuelve toda operación que escribe.
 *
 * Ocupa el botón pulsado, corre la acción y lo libera pase lo que
 * pase. Sin esto la gente pulsa dos veces al no ver respuesta — y en
 * operaciones con dinero eso es exactamente lo que no puede ocurrir.
 */
async function accion(fn, mensaje, textoOcupado) {
  const liberar = ocupar(S.botonPulsado, textoOcupado);
  try {
    await fn();
    if (mensaje) aviso(mensaje, 'bien');
  } catch (e) {
    aviso(e.message, 'mal');
  } finally {
    liberar();
  }
}

// Se recuerda el último botón pulsado para saber cuál ocupar. Usar
// document.activeElement no basta: al abrirse un modal, el foco se
// mueve antes de que la acción arranque.
document.addEventListener('click', e => {
  const b = e.target.closest?.('button');
  if (b) S.botonPulsado = b;
}, true);

/* ============================================================
   Vistas
   ============================================================ */
