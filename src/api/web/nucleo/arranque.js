'use strict';

/**
 * Arranque.
 *
 * La app abre SIEMPRE en el muro, haya cuenta o no.
 *
 * Antes lo primero que veía alguien sin sesión era un formulario de
 * registro. Quien llega desde un enlace de WhatsApp no sabe todavía de
 * qué se trata, y pedirle sus datos antes de mostrarle nada es pedirle
 * confianza sin haberle dado ninguna razón. Ahora mira las salas, ve
 * cómo funciona, y la cuenta se le pide recién cuando intenta hacer
 * algo con dinero.
 */
async function arrancarSesion() {
  if (S.token) {
    try {
      await cargarSesion();
    } catch {
      // El token existe pero ya no vale. Se descarta sin ruido y se
      // sigue como visitante: sacar a alguien de la pantalla porque
      // venció un token no arregla nada.
      localStorage.removeItem('token');
      S.token = null;
      S.usuario = null;
    }
  }

  const [id, dato] = location.hash.slice(1).split('/');
  const pantalla = PANTALLAS[id] ? id : 'muro';

  // La clase del formulario solo debe existir mientras se muestra entrar/registro.
  // Evita que una capa/estilo del login quede encima del muro tras iniciar sesión.
  if (pantalla !== 'entrar') {
    document.body.classList.remove('pantalla-registro-activa');
  }

  ir(pantalla, dato);
}

(async () => {
  S.token = localStorage.getItem('token');
  await arrancarSesion();
})();
