/* ===== Comunicación con la API ===== */

let peticionesEnCurso = 0;

function progreso(activo) {
  peticionesEnCurso += activo ? 1 : -1;
  const barra = document.getElementById('progreso');
  if (!barra) return;
  if (peticionesEnCurso > 0) {
    barra.className = 'activo';
  } else {
    peticionesEnCurso = 0;
    barra.className = 'fin';
    setTimeout(() => { if (peticionesEnCurso === 0) barra.className = ''; }, 450);
  }
}

async function api(ruta, opciones = {}) {
  progreso(true);
  try {
    return await peticion(ruta, opciones);
  } finally {
    progreso(false);
  }
}

async function peticion(ruta, opciones = {}) {
  // El Content-Type solo va si hay cuerpo.
  //
  // Fastify rechaza con 400 un POST que se declara JSON y llega vacío
  // (FST_ERR_CTP_EMPTY_JSON_BODY). Mandarlo siempre rompía todas las
  // acciones sin datos, como reenviar una invitación.
  const r = await fetch('/admin' + ruta, {
    ...opciones,
    headers: {
      ...(opciones.body ? { 'Content-Type':'application/json' } : {}),
      ...(S.token ? { authorization:'Bearer ' + S.token } : {}),
      ...(opciones.headers || {}),
    },
  });
  const texto = await r.text();
  const cuerpo = texto ? JSON.parse(texto) : {};

  if (!r.ok) {
    const codigo = cuerpo?.error?.codigo;

    // La sesión venció: no tiene sentido mostrar el error dentro de un
    // panel al que ya no se puede entrar.
    if (codigo === 'SESION_VENCIDA' || codigo === 'TOKEN_INVALIDO') {
      localStorage.removeItem('panel_token');
      location.reload();
      throw new Error('Sesión vencida');
    }

    // Falta activar el segundo factor: se lleva directo a hacerlo.
    if (codigo === 'TOTP_OBLIGATORIO') {
      configurar2fa();
      throw new Error(cuerpo.error.mensaje);
    }

    // El servidor manda el mensaje ya redactado para leer. Si además
    // trae detalle técnico o campos concretos, se muestran: un "revisa
    // los datos" sin decir cuáles obliga a adivinar.
    const e = cuerpo?.error ?? {};
    const campos = (e.detalles ?? [])
      .map(d => `${d.campo}: ${d.problema}`).join(' · ');
    const err = new Error(
      [e.mensaje || 'No se pudo completar la acción.', campos || e.detalle]
        .filter(Boolean).join(' — '),
    );
    err.codigo = e.codigo;   // para poder reaccionar, no solo mostrar
    throw err;
  }
  return cuerpo;
}
