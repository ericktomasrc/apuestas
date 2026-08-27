'use strict';

/**
 * Entrada.
 *
 * Se muestra registro primero, no ingreso: quien llega sin cuenta es
 * mayoría al principio, y pedirle que busque el enlace de "crear
 * cuenta" es fricción sobre el que menos compromiso tiene.
 */
function pantallaEntrar(modo = 'registro') {
  const esRegistro = modo === 'registro';

  document.getElementById('app').innerHTML = `
    <main style="padding-top:52px">
      <div class="envoltura" style="max-width:400px">
        <div class="marca" style="font-size:30px;margin-bottom:6px">salas<span>.</span></div>
        <h1 class="titulo" style="font-size:23px">
          ${esRegistro ? 'Apuesta con tus amigos' : 'Hola de nuevo'}</h1>
        <p class="sub">
          ${esRegistro
            ? 'Sin casa de apuestas de por medio. Uno contra otro, y el que acierta se lleva todo.'
            : 'Entra para ver tus salas.'}</p>

        <form onsubmit="${esRegistro ? 'registrarse' : 'ingresar'}(event)">
          ${esRegistro ? `
            <div class="campo">
              <label for="alias">Cómo te van a ver</label>
              <input id="alias" required minlength="3" maxlength="20"
                placeholder="juanp" autocomplete="username"
                oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9_]/g,'')">
            </div>` : ''}

          <div class="campo">
            <label for="correo">Correo</label>
            <input id="correo" type="email" required autocomplete="email">
          </div>

          ${campoClave('clave', 'Contraseña',
            esRegistro ? 'new-password' : 'current-password')}

          ${esRegistro ? `
            <div class="campo">
              <label for="nacimiento">Fecha de nacimiento</label>
              <input id="nacimiento" type="date" required>
              <p class="pista">Tienes que ser mayor de 18 años.</p>
            </div>` : ''}

          <div class="campo" id="campo-codigo" style="display:none">
            <label for="codigo">Código de verificación</label>
            <input id="codigo" class="num" inputmode="numeric" maxlength="8"
              placeholder="000000" autocomplete="one-time-code">
          </div>

          <button class="btn btn-favor btn-ancho" type="submit">
            ${esRegistro ? 'Crear mi cuenta' : 'Entrar'}</button>
          <p class="pista" id="pista" style="text-align:center;min-height:18px"></p>
        </form>

        <p class="pista" style="text-align:center;margin-top:20px">
          ${esRegistro
            ? `¿Ya tienes cuenta? <a href="#" onclick="event.preventDefault();pantallaEntrar('ingreso')">Entra aquí</a>`
            : `¿Primera vez? <a href="#" onclick="event.preventDefault();pantallaEntrar('registro')">Crea tu cuenta</a>`}
        </p>
      </div>
    </main>`;
}

async function registrarse(e) {
  e.preventDefault();
  const pista = document.getElementById('pista');
  pista.textContent = '';
  const liberar = ocupar(e.target.querySelector('button'), 'Creando tu cuenta');

  try {
    const r = await fetch('/auth/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alias: document.getElementById('alias').value,
        email: document.getElementById('correo').value,
        password: document.getElementById('clave').value,
        fechaNacimiento: document.getElementById('nacimiento').value,
      }),
    });
    const b = await r.json();
    if (!r.ok) {
      const campos = (b.error?.detalles ?? []).map(d => d.problema).join('. ');
      throw new Error(campos || b.error?.mensaje || 'No se pudo crear la cuenta.');
    }

    S.token = b.token;
    localStorage.setItem('token', S.token);
    if (b.aviso) aviso(b.aviso);
    await arrancarSesion();
  } catch (err) {
    pista.textContent = err.message;
    pista.style.color = 'var(--mal)';
  } finally {
    liberar();
  }
}

async function ingresar(e) {
  e.preventDefault();
  const pista = document.getElementById('pista');
  pista.textContent = '';
  const liberar = ocupar(e.target.querySelector('button'), 'Entrando');

  try {
    const cuerpo = {
      email: document.getElementById('correo').value,
      password: document.getElementById('clave').value,
    };
    const codigo = document.getElementById('codigo').value.trim();
    if (codigo) cuerpo.codigo = codigo;

    const r = await fetch('/auth/ingreso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error?.mensaje || 'No se pudo entrar.');

    // Sin token todavía: falta el segundo factor.
    if (b.requiereTotp) {
      document.getElementById('campo-codigo').style.display = '';
      document.getElementById('codigo').focus();
      pista.textContent = 'Escribe el código de tu aplicación.';
      pista.style.color = 'var(--tenue)';
      return;
    }

    S.token = b.token;
    localStorage.setItem('token', S.token);
    await arrancarSesion();
  } catch (err) {
    pista.textContent = err.message;
    pista.style.color = 'var(--mal)';
  } finally {
    liberar();
  }
}
