'use strict';

/**
 * Entrada.
 *
 * Es la pantalla donde alguien decide si crea la cuenta o cierra la
 * pestaña, así que hace dos cosas a la vez: explica de qué se trata y
 * pide los datos.
 *
 * El argumento va a la izquierda y el formulario a la derecha. Al
 * revés —el formulario solo, como estaba— se le pide confianza a
 * alguien antes de haberle dado una sola razón.
 *
 * Se muestra registro y no ingreso porque quien llega sin cuenta es
 * mayoría al principio, y pedirle que busque el enlace de «crear
 * cuenta» es fricción sobre el que menos compromiso tiene.
 */
function pantallaEntrar(modo = 'registro') {
  const esRegistro = modo === 'registro';

  document.body.classList.add('pantalla-registro-activa');

  document.getElementById('app').innerHTML = `
    <div class="entrada entrada-tandabet">
      <div class="entrada-caja">

        <div class="entrada-formulario">
          <div class="entrada-form-head">
            <span class="entrada-user-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4"></circle>
                <path d="M4.5 20c.7-4.1 3.2-6.2 7.5-6.2s6.8 2.1 7.5 6.2"></path>
              </svg>
            </span>
            <div>
              <h2>${esRegistro ? 'Crea tu cuenta' : 'Hola de nuevo'}</h2>
              <p class="entrada-sub">${esRegistro
                ? 'Toma menos de un minuto.'
                : 'Entra para ver tus salas.'}</p>
            </div>
          </div>

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
              <input id="correo" type="email" required autocomplete="email"
                placeholder="tu@correo.pe">
            </div>

            ${campoClave('clave', 'Contraseña',
              esRegistro ? 'new-password' : 'current-password')}

            ${esRegistro ? `
              <div class="campo">
                <label for="nacimiento">Fecha de nacimiento</label>
                <input id="nacimiento" type="date" required>
                <p class="pista entrada-edad">Tienes que ser mayor de <b>18</b> años.</p>
              </div>` : ''}

            <div class="campo" id="campo-codigo" style="display:none">
              <label for="codigo">Código de verificación</label>
              <input id="codigo" class="num" inputmode="numeric" maxlength="8"
                placeholder="000000" autocomplete="one-time-code">
            </div>

            <button class="btn btn-favor btn-ancho entrada-cta" type="submit">
              ${esRegistro ? 'Únete a TandaBet' : 'Entrar'}
              <span aria-hidden="true">→</span>
            </button>
            <p class="pista" id="pista" style="text-align:center;min-height:18px"></p>
          </form>

          <p class="pista entrada-link" style="text-align:center;margin-top:14px">
            ${esRegistro
              ? `¿Ya tienes cuenta? <a href="#" onclick="event.preventDefault();pantallaEntrar('ingreso')">Entra aquí</a>`
              : `¿Primera vez? <a href="#" onclick="event.preventDefault();pantallaEntrar('registro')">Crea tu cuenta</a>`}
          </p>

          <p class="pista entrada-link" style="text-align:center;margin-top:8px">
            <a href="#muro" onclick="event.preventDefault();document.body.classList.remove('pantalla-registro-activa');ir('muro')">
              Seguir mirando salas sin cuenta</a>
          </p>
        </div>

      </div>
    </div>`;
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
    // Al salir del login, quitar siempre el estado visual de registro/ingreso.
    document.body.classList.remove('pantalla-registro-activa');
    await arrancarSesion();
  } catch (err) {
    pista.textContent = err.message;
    pista.style.color = 'var(--mal)';
  } finally {
    liberar();
  }
}
