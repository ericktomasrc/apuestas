/* ===== Avisos flotantes ===== */

const ICONOS = {
  bien: '<path d="M20 6L9 17l-5-5"/>',
  mal:  '<circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16.5v.01"/>',
  '':   '<circle cx="12" cy="12" r="10"/><path d="M12 16v-5M12 8v.01"/>',
};

/**
 * Aviso flotante.
 *
 * Los errores no se van solos: si desaparecen a los tres segundos, la
 * persona que estaba mirando otra cosa nunca se entera de qué falló.
 * Los éxitos sí, porque el resultado ya está a la vista.
 */
function aviso(texto, tipo = '') {
  const d = document.createElement('div');
  d.className = 'aviso ' + tipo;
  d.innerHTML = `
    <svg class="aviso-icono" width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${ICONOS[tipo] ?? ICONOS['']}
    </svg>
    <div class="aviso-texto">
      <strong>${tipo === 'mal' ? 'No se pudo completar' : tipo === 'bien' ? 'Listo' : 'Aviso'}</strong>
      <span>${esc(texto)}</span>
    </div>
    <button class="aviso-cerrar" aria-label="Cerrar">&times;</button>`;

  d.querySelector('.aviso-cerrar').onclick = () => d.remove();
  document.getElementById('avisos').append(d);

  if (tipo !== 'mal') setTimeout(() => d.remove(), 3800);
}

/* ============================================================
   Sesión
   ============================================================ */
