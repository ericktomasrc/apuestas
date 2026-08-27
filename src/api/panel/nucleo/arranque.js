/* ============================================================
   Arranque
   ============================================================ */
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id && id !== S.seccion) ir(id);
});

// Enlace de recuperación: llega como /panel/#recuperar=<token>
const recuperar = location.hash.match(/^#recuperar=(.+)$/);
if (recuperar) {
  S.tokenRecuperacion = recuperar[1];
  document.getElementById('form-ingreso').style.display = 'none';
  document.getElementById('form-restablecer').style.display = '';
  document.getElementById('sub-ingreso').textContent = 'Elige tu contraseña';
}

/**
 * La marca `hay-sesion` la pone el script del HTML antes de pintar,
 * para que quien ya entró no vea el login parpadear.
 *
 * Aquí se quita en los dos casos en que ya sabemos qué pasó: si el
 * token servía —el panel está dibujado— o si no servía y hay que
 * mostrar el formulario. Dejarla puesta ocultaría el login para
 * siempre.
 */
function yaSabemos() {
  document.documentElement.classList.remove('hay-sesion');
}

const guardado = localStorage.getItem('panel_token');
if (guardado && !recuperar) {
  S.token = guardado;
  arrancar()
    .then(yaSabemos)
    .catch(() => {
      localStorage.removeItem('panel_token');
      S.token = null;
      yaSabemos();
    });
} else {
  yaSabemos();
}
