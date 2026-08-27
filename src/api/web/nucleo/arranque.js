'use strict';

/**
 * Arranque.
 *
 * Decide entre la pantalla de entrada y la app. Si hay token guardado
 * se intenta usarlo: pedir la contraseña en cada visita es la forma
 * más rápida de que alguien deje de abrir la app.
 */
async function arrancarSesion() {
  try {
    await cargarSesion();
  } catch {
    // El token existe pero ya no vale. Se descarta sin ruido: no hay
    // nada que la persona pueda hacer al respecto.
    localStorage.removeItem('token');
    S.token = null;
    return pantallaEntrar('ingreso');
  }

  const [id, dato] = location.hash.slice(1).split('/');
  ir(PANTALLAS[id] ? id : 'muro', dato);
}

(async () => {
  S.token = localStorage.getItem('token');

  if (!S.token) {
    // Un enlace a una sala compartida por WhatsApp lleva a alguien sin
    // cuenta. Se le muestra el registro, no el ingreso.
    return pantallaEntrar(location.hash.startsWith('#sala/') ? 'registro' : 'registro');
  }
  await arrancarSesion();
})();
