/* ===== Ingreso, recuperación y contraseña ===== */

async function ingresar(e) {
  e.preventDefault();
  const pista = document.getElementById('pista-ingreso');
  pista.textContent = '';
  const liberar = ocupar(e.target.querySelector('button[type=submit]'), 'Entrando');
  try {
    const cuerpo = {
      email: document.getElementById('correo').value,
      password: document.getElementById('clave').value,
    };
    const codigo = document.getElementById('totp').value.trim();
    if (codigo) cuerpo.codigo = codigo;

    const r = await fetch('/auth/ingreso', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(cuerpo),
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error?.mensaje || 'No se pudo entrar.');

    // Sin token todavía: falta el segundo factor.
    if (b.requiereTotp) {
      document.getElementById('campo-totp').style.display = '';
      document.getElementById('totp').focus();
      pista.textContent = 'Ingresa el código de tu aplicación.';
      return;   // el `finally` libera el botón igual
    }

    S.token = b.token;
    localStorage.setItem('panel_token', S.token);

    // La clave temporal se cambia antes de entrar a nada.
    if (b.passwordTemporal) {
      pedirClaveNueva(true);
      return;
    }
    await arrancar();
  } catch (err) {
    pista.textContent = err.message;
  } finally {
    liberar();
  }
}

function verRecuperar(e) {
  if (e) e.preventDefault();
  document.getElementById('form-ingreso').style.display = 'none';
  document.getElementById('form-restablecer').style.display = 'none';
  document.getElementById('form-recuperar').style.display = '';
  document.getElementById('sub-ingreso').textContent = 'Recuperar acceso';
}

function verIngreso(e) {
  if (e) e.preventDefault();
  document.getElementById('form-recuperar').style.display = 'none';
  document.getElementById('form-restablecer').style.display = 'none';
  document.getElementById('form-ingreso').style.display = '';
  document.getElementById('sub-ingreso').textContent = 'Salas de apuestas P2P';
}

async function pedirRecuperacion(e) {
  e.preventDefault();
  const pista = document.getElementById('pista-recuperar');
  const liberar = ocupar(e.target.querySelector('button[type=submit]'), 'Enviando');
  try {
    await fetch('/auth/recuperar', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email: document.getElementById('rec-correo').value }),
    });
  } finally {
    liberar();
  }
  // La misma respuesta exista o no la cuenta: si dijera algo distinto,
  // cualquiera podría averiguar qué correos están registrados.
  pista.textContent = 'Si esa dirección tiene una cuenta, le llegará un enlace en unos minutos.';
}

async function restablecer(e) {
  e.preventDefault();
  const pista = document.getElementById('pista-restablecer');
  pista.textContent = '';
  const liberar = ocupar(e.target.querySelector('button[type=submit]'), 'Guardando');
  try {
    const r = await fetch('/auth/restablecer', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        token: S.tokenRecuperacion,
        nueva: document.getElementById('res-clave').value,
      }),
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error?.mensaje || 'No se pudo cambiar.');
    location.hash = '';
    verIngreso();
    document.getElementById('pista-ingreso').textContent =
      'Contraseña cambiada. Ya puedes entrar.';
  } catch (err) {
    pista.textContent = err.message;
  } finally {
    liberar();
  }
}

function pedirClaveNueva(obligatorio) {
  modal(obligatorio ? 'Elige tu contraseña' : 'Cambiar contraseña', `
    ${obligatorio ? `<p class="pista" style="margin-bottom:16px">
      Estás usando una contraseña temporal. Elige una propia para continuar.</p>`
      : campoClave('pw_actual', 'Contraseña actual')}
    ${campoClave('pw_nueva', 'Contraseña nueva', {
      pista: 'Mínimo 8 caracteres.', autocomplete: 'new-password', minlength: 8 })}
    ${campoClave('pw_repite', 'Repítela', { autocomplete: 'new-password', minlength: 8 })}`,
    `${obligatorio ? '' : '<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>'}
     <button class="btn" onclick="guardarClaveNueva(${obligatorio})">Guardar</button>`);
}

async function guardarClaveNueva(obligatorio) {
  const nueva = document.getElementById('pw_nueva').value;
  if (nueva !== document.getElementById('pw_repite').value) {
    aviso('Las contraseñas no coinciden.', 'mal');
    return;
  }
  await accion(async () => {
    const cuerpo = { nueva };
    const actual = document.getElementById('pw_actual');
    if (actual) cuerpo.actual = actual.value;

    await fetch('/auth/cambiar-password', {
      method:'POST',
      headers:{'Content-Type':'application/json', authorization:'Bearer ' + S.token},
      body: JSON.stringify(cuerpo),
    }).then(async r => {
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.mensaje || 'No se pudo cambiar.');
    });
    cerrarModal();
    if (obligatorio) await arrancar();
  }, 'Contraseña cambiada', 'Cambiando');
}

function salir() {
  localStorage.removeItem('panel_token');
  location.reload();
}

async function arrancar() {
  const yo = await api('/yo');
  if (!yo.esAdministrador) {
    document.getElementById('pista-ingreso').textContent =
      'Esta cuenta no tiene acceso al panel.';
    localStorage.removeItem('panel_token');
    return;
  }
  S.permisos = new Set(yo.permisos);
  S.alias = yo.alias;
  S.tiene2fa = yo.tieneSegundoFactor === true;

  document.getElementById('ingreso').style.display = 'none';
  document.getElementById('panel').classList.add('visible');
  document.getElementById('inicial').textContent = yo.alias.slice(0, 2);
  document.getElementById('yo-alias').textContent = yo.alias;
  document.getElementById('yo-rol').textContent =
    yo.roles.map(r => r.nombre).join(', ') || 'Sin rol';

  dibujarMenu();
  ir(location.hash.slice(1) || 'resumen');

  // Quien administra dinero no debería poder entrar solo con una
  // contraseña. Se avisa dentro del panel, no bloqueando el ingreso:
  // así puede activarlo en vez de quedarse fuera.
  if (!S.tiene2fa) {
    setTimeout(() => {
      const main = document.getElementById('contenido');
      if (S.tiene2fa) return;   // pudo activarse mientras cargaba
      const banda = document.createElement('div');
      banda.className = 'banda banda-2fa';
      banda.innerHTML = `<p><strong>Falta tu verificación en dos pasos</strong>
        Una contraseña robada no debería bastar para tocar la configuración.</p>
        <button class="btn" onclick="configurar2fa()">Activar ahora</button>`;
      main.prepend(banda);
    }, 400);
  }
}
