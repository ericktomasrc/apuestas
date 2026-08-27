'use strict';

/**
 * Estado de la aplicación.
 *
 * Vive en memoria salvo el token, que va a localStorage para no pedir
 * la contraseña en cada visita.
 */
const S = {
  token: null,
  usuario: null,
  saldo: null,
  pais: null,
  pantalla: 'muro',
  datos: {},
  modulos: {},
  botonPulsado: null,
};
