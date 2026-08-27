/* ---------- Usuarios ---------- */
VISTAS.usuarios = async () => {
  const buscar = S.datos.buscar || '';
  const r = await api('/usuarios?limite=50' + (buscar ? '&buscar=' + encodeURIComponent(buscar) : ''));

  const filas = r.usuarios.map(u => `<tr>
    <td><strong>${esc(u.alias)}</strong><br>
        <span style="color:var(--tenue);font-size:12px">${esc(u.email)}</span></td>
    <td><span class="etiqueta et-gris">${esc(u.pais)}</span></td>
    <td>${u.estado === 'ACTIVO'
      ? '<span class="etiqueta et-bien">Activo</span>'
      : `<span class="etiqueta et-mal">${esc(u.estado)}</span>`}</td>
    <td class="der num">${plata(u.disponible_centavos || 0, u.moneda)}</td>
    <td class="der num">${plata(u.retenido_centavos || 0, u.moneda)}</td>
    <td class="der">${u.roles > 0
      ? `<span class="etiqueta et-gris">${u.roles} rol(es)</span>` : ''}</td>
    <td class="der"><div class="fila-acciones">
      ${puede('usuarios.roles')
        ? `<button class="btn-plano btn-chico" onclick="editarRolesDe('${u.id}','${esc(u.alias)}')">Roles</button>` : ''}
      ${puede('usuarios.crear')
        ? `<button class="btn-plano btn-chico" onclick="reinvitar('${u.id}','${esc(u.alias)}')">Reinvitar</button>` : ''}
      ${puede('usuarios.suspender')
        ? `<button class="btn-plano btn-chico" onclick="cambiarEstado('${u.id}','${u.estado === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO'}')">
             ${u.estado === 'ACTIVO' ? 'Suspender' : 'Reactivar'}</button>` : ''}
    </div></td>
  </tr>`).join('');

  render(cab('Usuarios', r.usuarios.length + ' cuentas',
    puede('usuarios.crear') ? `<button class="btn" onclick="nuevaCuenta()">Crear cuenta</button>` : '') + `
    <div class="filtros">
      <input placeholder="Buscar por alias o correo" value="${esc(buscar)}"
        oninput="S.datos.buscar=this.value" onkeydown="if(event.key==='Enter')VISTAS.usuarios()">
      <button class="btn-plano" onclick="VISTAS.usuarios()">Buscar</button>
    </div>
    ${filas ? `<div class="marco"><table>
      <thead><tr><th>Cuenta</th><th>País</th><th>Estado</th>
        <th class="der">Disponible</th><th class="der">En salas</th>
        <th class="der">Acceso</th><th></th></tr></thead>
      <tbody>${filas}</tbody></table></div>`
      : vacio(buscar ? 'Ninguna cuenta coincide con la búsqueda.' : 'Todavía no hay cuentas.')}
  `);
};

async function nuevaCuenta() {
  const roles = puede('usuarios.roles') ? await api('/roles') : { roles: [] };
  const paises = await api('/paises');

  modal('Crear cuenta', `
    <div class="campo"><label for="n_alias">Alias</label>
      <input id="n_alias" placeholder="maria_soporte">
      <p class="pista">Es el nombre que verán los demás.</p></div>
    <div class="campo"><label for="n_email">Correo</label>
      <input id="n_email" type="email" placeholder="maria@empresa.pe"></div>
    <p class="pista" style="margin-bottom:16px">
      La contraseña se genera sola y le llega por correo. Nadie más la ve.</p>
    <div class="campo"><label for="n_pais">País</label>
      <select id="n_pais">${paises.paises.map(p =>
        `<option value="${p.codigo}">${esc(p.nombre)} · ${esc(p.moneda)}</option>`).join('')}</select></div>
    ${roles.roles.length ? `<label style="margin-top:18px">Qué podrá hacer</label>
      <div class="area-permisos">
        ${roles.roles.map(r => `<div class="permiso">
          <input type="checkbox" id="nr_${r.id}">
          <label for="nr_${r.id}">${esc(r.nombre)}
            <small>${esc(r.descripcion || '')}</small></label></div>`).join('')}
      </div>
      <p class="pista">Sin ningún rol marcado, la cuenta funciona como la de
      cualquier usuario: no ve el panel.</p>` : ''}`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarCuenta()">Crear cuenta</button>`);
}

async function guardarCuenta() {
  await accion(async () => {
    const roles = [...document.querySelectorAll('[id^=nr_]:checked')]
      .map(i => i.id.slice(3));
    await api('/usuarios', { method:'POST', body: JSON.stringify({
      alias: document.getElementById('n_alias').value,
      email: document.getElementById('n_email').value,
      pais: document.getElementById('n_pais').value,
      roles,
    })});
    cerrarModal();
    VISTAS.usuarios();
  }, 'Cuenta creada. Le enviamos la invitación por correo.', 'Creando');
}

function reinvitar(id, alias) {
  confirmar({
    titulo: 'Reenviar invitación',
    mensaje: `Le llegará una contraseña temporal nueva a ${alias}.`,
    consecuencia: 'Su contraseña actual deja de funcionar de inmediato.',
    textoBoton: 'Enviar invitación',
    alAceptar: async () => {
      await accion(async () => {
        const r = await api('/usuarios/' + id + '/reinvitar', { method:'POST' });
        if (!r.correoEnviado) {
          throw new Error('La cuenta se actualizó, pero el correo no salió. Revisa la configuración de correo.');
        }
        cerrarModal();
      }, 'Invitación enviada', 'Enviando');
    },
  });
}

async function cambiarEstado(id, estado) {
  await accion(async () => {
    await api('/usuarios/' + id + '/estado', {
      method:'PATCH', body: JSON.stringify({ estado }),
    });
    VISTAS.usuarios();
  }, estado === 'ACTIVO' ? 'Cuenta reactivada' : 'Cuenta suspendida', 'Aplicando');
}

async function editarRolesDe(id, alias) {
  const [todos, suyos] = await Promise.all([
    api('/roles'), api('/usuarios/' + id + '/roles'),
  ]);
  const tiene = new Set(suyos.roles.map(r => r.id));

  modal('Roles de ' + alias,
    todos.roles.map(r => `<div class="permiso">
      <input type="checkbox" id="ur_${r.id}" ${tiene.has(r.id) ? 'checked' : ''}>
      <label for="ur_${r.id}">${esc(r.nombre)}
        <small>${esc(r.descripcion || '')}</small></label></div>`).join(''),
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarRolesDe('${id}')">Guardar</button>`);

  S.datos.rolesPrevios = tiene;
}

async function guardarRolesDe(id) {
  const cambios = [];
  const previos = S.datos.rolesPrevios;
  for (const input of document.querySelectorAll('[id^=ur_]')) {
    const rolId = input.id.slice(3);
    if (input.checked && !previos.has(rolId)) cambios.push({ rolId, dar:true });
    else if (!input.checked && previos.has(rolId)) cambios.push({ rolId, dar:false });
  }
  if (cambios.length === 0) { cerrarModal(); return; }

  await intentar(
    async cred => {
      for (const c of cambios) {
        if (c.dar) {
          await api('/usuarios/' + id + '/roles', {
            method:'POST', body: JSON.stringify({ rolId: c.rolId, ...cred }) });
        } else {
          await api('/usuarios/' + id + '/roles/' + c.rolId, { method:'DELETE' });
        }
      }
    },
    { titulo:'Confirma tu identidad',
      aviso:'Dar o quitar roles cambia a qué puede acceder esa persona.',
      mensaje:'Roles actualizados', ocupado:'Aplicando', despues: () => VISTAS.usuarios() });
}
