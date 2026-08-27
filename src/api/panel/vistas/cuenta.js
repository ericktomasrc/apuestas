/* ---------- Mi cuenta ---------- */
async function miCuenta() {
  const yo = await api('/yo');
  const tiene2fa = S.tiene2fa;

  modal('Mi cuenta', `
    <div class="caja" style="margin-bottom:16px">
      <div class="dato-rotulo">Sesión</div>
      <div style="font-size:15px;font-weight:600">${esc(yo.alias)}</div>
      <div class="dato-nota">${yo.roles.map(r => esc(r.nombre)).join(', ')}</div>
    </div>

    <label>Contraseña</label>
    <button class="btn-plano" style="margin:6px 0 20px"
      onclick="cerrarModal();pedirClaveNueva(false)">Cambiar contraseña</button>

    <label>Verificación en dos pasos</label>
    ${tiene2fa
      ? `<p class="pista" style="margin-top:6px">
           <span class="etiqueta et-bien">Activa</span>
           Tu cuenta pide un código además de la contraseña.</p>`
      : `<p class="pista" style="margin:6px 0 10px">
           Una contraseña robada no debería bastar para tocar la configuración
           de un sistema que maneja dinero.</p>
         <button class="btn" onclick="configurar2fa()">Activar</button>`}`,
    `<button class="btn-plano" onclick="cerrarModal()">Cerrar</button>`);
}

async function configurar2fa() {
  const r = await fetch('/auth/totp/preparar', {
    method:'POST', headers:{ authorization:'Bearer ' + S.token },
  }).then(x => x.json());

  // El QR se dibuja con un servicio externo solo para la imagen; el
  // secreto ya está en el servidor y nunca sale de aquí en claro.
  const qr = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' +
    encodeURIComponent(r.url);

  modal('Verificación en dos pasos', `
    <p class="pista" style="margin-bottom:12px">
      1. Abre Google Authenticator, Authy o similar<br>
      2. Escanea este código<br>
      3. Escribe los 6 dígitos que aparezcan</p>
    <img class="qr" src="${qr}" alt="Código QR">
    <p class="pista" style="text-align:center;margin-bottom:16px">
      ¿No puedes escanear? Escribe esta clave:<br>
      <span class="num" style="font-size:13px">${esc(r.secreto)}</span></p>
    <div class="campo"><label for="t_codigo">Código de 6 dígitos</label>
      <input id="t_codigo" class="num" inputmode="numeric" maxlength="6" placeholder="000000"></div>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="activar2fa()">Activar</button>`);
}

async function activar2fa() {
  await accion(async () => {
    const r = await fetch('/auth/totp/activar', {
      method:'POST',
      headers:{'Content-Type':'application/json', authorization:'Bearer ' + S.token},
      body: JSON.stringify({ codigo: document.getElementById('t_codigo').value }),
    }).then(async x => {
      const b = await x.json();
      if (!x.ok) throw new Error(b?.error?.mensaje || 'No se pudo activar.');
      return b;
    });

    S.tiene2fa = true;
    document.querySelectorAll('.banda-2fa').forEach(b => b.remove());
    modal('Guarda estos códigos', `
      <p class="pista" style="margin-bottom:8px">
        Son la única forma de entrar si pierdes el teléfono. Cada uno
        sirve una sola vez. También te los enviamos por correo.</p>
      <div class="codigos">${r.codigosRespaldo.map(c => `<span>${esc(c)}</span>`).join('')}</div>
      <p class="pista">No los guardes en el mismo teléfono donde tienes la
      aplicación de códigos.</p>`,
      `<button class="btn" onclick="terminar2fa()">Ya los guardé</button>`);
  }, null, 'Activando');
}

/**
 * Cierra el modal y recarga la sección.
 *
 * Sin esto, la pantalla que se quedó en «activa la verificación» sigue
 * ahí hasta que la persona pulse Reintentar. Acaba de hacer lo que se
 * le pidió: la app debería seguir sola.
 */
function terminar2fa() {
  cerrarModal();
  aviso('Verificación activada', 'bien');
  ir(S.seccion || 'resumen');
}
