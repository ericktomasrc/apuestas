'use strict';

let enCurso = 0;

/**
 * Llama a la API.
 *
 * El Content-Type solo se manda si hay cuerpo: un POST vacío que se
 * declara JSON lo rechaza el servidor.
 */
async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    ...opciones,
    headers: {
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
      ...(S.token ? { authorization: 'Bearer ' + S.token } : {}),
      ...(opciones.headers || {}),
    },
  });

  const texto = await r.text();
  const cuerpo = texto ? JSON.parse(texto) : {};

  if (!r.ok) {
    const e = cuerpo.error ?? {};

    // La sesión venció: no tiene sentido mostrar un error dentro de una
    // pantalla a la que ya no se puede entrar.
    if (e.codigo === 'NO_AUTENTICADO' || e.codigo === 'TOKEN_INVALIDO') {
      salir();
      throw new Error('Vuelve a entrar');
    }

    const campos = (e.detalles ?? []).map(d => `${d.campo}: ${d.problema}`).join(' · ');
    const err = new Error(
      [e.mensaje || 'No se pudo completar.', campos || e.detalle]
        .filter(Boolean).join(' — '),
    );
    err.codigo = e.codigo;
    err.accion = e.accion;
    throw err;
  }
  return cuerpo;
}

/**
 * Toda operación con dinero lleva su clave de idempotencia.
 *
 * Si la red falla a mitad y el cliente reintenta, la misma clave impide
 * que se cobre dos veces. Una acción nueva lleva clave nueva.
 */
function claveUnica(prefijo) {
  return `${prefijo}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}
