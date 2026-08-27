/* ---------- Roles ---------- */
VISTAS.roles = async () => {
  const r = await api('/roles');

  render(cab('Roles', 'Un rol es una combinación de permisos. Crearlos no requiere programar.',
    `<button class="btn" onclick="nuevoRol()">Crear rol</button>`) + `
    <div class="marco"><table>
      <thead><tr><th>Rol</th><th class="der">Permisos</th>
        <th class="der">Personas</th><th></th></tr></thead>
      <tbody>${r.roles.map(x => `<tr>
        <td><strong>${esc(x.nombre)}</strong>
          ${x.esSistema ? ' <span class="etiqueta et-gris">Protegido</span>' : ''}
          <br><span style="color:var(--tenue);font-size:12px">${esc(x.descripcion || '')}</span></td>
        <td class="der num">${x.totalPermisos}</td>
        <td class="der num">${x.totalUsuarios}</td>
        <td class="der"><div class="fila-acciones">
          <button class="btn-plano btn-chico" onclick="editarRol('${x.id}','${esc(x.nombre)}',${x.esSistema})">
            ${x.esSistema ? 'Ver' : 'Editar'}</button>
          ${x.esSistema
            ? `<span class="pista-boton" title="Si se borrara, nadie podría volver a otorgarlo">Protegido</span>`
            : x.totalUsuarios > 0
              ? `<span class="pista-boton" title="Quítaselo a esas personas primero">En uso</span>`
              : `<button class="btn-plano btn-chico" onclick="borrarRol('${x.id}','${esc(x.nombre)}')">Eliminar</button>`}
        </div></td></tr>`).join('')}
      </tbody></table></div>
    <p class="pista">Los permisos son fijos porque cada uno protege una función del
    sistema. Lo que se configura es cómo agruparlos.</p>
  `);
};

async function formularioPermisos(seleccionados = [], soloLectura = false) {
  const { permisos } = await api('/permisos');
  const marcados = new Set(seleccionados);

  // Se agrupa por la PANTALLA que abre, no por el área interna.
  // Quien reparte permisos piensa en "que pueda entrar a Membresías",
  // no en "que tenga comisiones.ver".
  const porPantalla = {};
  for (const p of permisos) {
    const info = QUE_ABRE[p.clave] ?? { menu: p.area, abre: false };
    (porPantalla[info.menu] ||= []).push({ ...p, ...info });
  }

  // Las que abren pantalla primero; "—" (sin pantalla) al final.
  const orden = Object.keys(porPantalla).sort((a, b) =>
    a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b));

  return orden.map(pantalla => {
    const lista = porPantalla[pantalla].sort((a, b) => (b.abre ? 1 : 0) - (a.abre ? 1 : 0));
    return `
    <div class="area-permisos">
      <div class="area-titulo">
        ${pantalla === '—'
          ? 'Sin pantalla en el panel'
          : `<span class="chip-menu">${esc(pantalla)}</span>`}
      </div>
      ${lista.map(p => `<div class="permiso">
        <input type="checkbox" id="p_${p.clave}" value="${p.clave}"
          data-abre="${p.abre ? '1' : ''}" data-necesita="${NECESITA[p.clave] ?? ''}"
          ${marcados.has(p.clave) ? 'checked' : ''} ${soloLectura ? 'disabled' : ''}
          ${soloLectura ? '' : `onchange="revisarDependencia(this)"`}>
        <label for="p_${p.clave}">
          ${p.abre ? '<span class="marca-abre">Abre el menú</span> ' : ''}${esc(p.descripcion)}
          <small>${p.nota ? esc(p.nota) + ' · ' : ''}<span class="num">${esc(p.clave)}</span></small>
        </label>
      </div>`).join('')}
    </div>`;
  }).join('') + `
    <p class="pista" id="aviso-permisos" style="margin-top:4px"></p>`;
}

/**
 * Marcar un permiso de gestión sin el de lectura deja el menú
 * invisible: la persona tendría el permiso pero nunca vería la
 * pantalla donde usarlo. Se marca solo y se avisa por qué.
 */
function revisarDependencia(input) {
  const necesita = input.dataset.necesita;
  if (!input.checked || !necesita) { actualizarAvisoPermisos(); return; }

  const base = document.getElementById('p_' + necesita);
  if (base && !base.checked) {
    base.checked = true;
    aviso(`También marcamos «${necesita}»: sin él no vería la pantalla.`);
  }
  actualizarAvisoPermisos();
}

function actualizarAvisoPermisos() {
  const marcados = [...document.querySelectorAll('[id^=p_]:checked')];
  const abrenAlgo = marcados.some(i => i.dataset.abre === '1');
  const nota = document.getElementById('aviso-permisos');
  if (!nota) return;

  if (marcados.length === 0) {
    nota.innerHTML = 'Sin permisos, esta cuenta funciona como cualquier usuario: no ve el panel.';
  } else if (!abrenAlgo) {
    nota.innerHTML = `<span style="color:var(--aviso)">Ningún permiso marcado abre una
      pantalla. Quien tenga este rol entraría al panel y lo vería vacío.</span>`;
  } else {
    nota.innerHTML = `Verá: ${[...new Set(marcados
      .filter(i => i.dataset.abre === '1')
      .map(i => QUE_ABRE[i.value]?.menu ?? ''))].join(' · ')}`;
  }
}

async function nuevoRol() {
  modal('Crear rol', `
    <div class="campo"><label for="r_nombre">Nombre</label>
      <input id="r_nombre" placeholder="Soporte nocturno"></div>
    <div class="campo"><label for="r_clave">Clave interna</label>
      <input id="r_clave" class="num" placeholder="SOPORTE_NOCHE"
        oninput="this.value=this.value.toUpperCase().replace(/[^A-Z_]/g,'')">
      <p class="pista">Solo letras y guion bajo, mínimo 3. Se escribe sola en
      mayúsculas y no se puede cambiar después.</p></div>
    <div class="campo"><label for="r_desc">Para qué sirve</label>
      <input id="r_desc" placeholder="Atiende consultas fuera de horario"></div>
    <label style="margin-top:18px">Qué puede hacer</label>
    ${await formularioPermisos()}`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarNuevoRol()">Crear rol</button>`);
}

async function guardarNuevoRol() {
  const nombre = document.getElementById('r_nombre').value.trim();
  const clave = document.getElementById('r_clave').value.trim();

  // Se avisa antes de pedir la contraseña: descubrir que el nombre era
  // corto después de confirmar la identidad es una pérdida de tiempo.
  if (nombre.length < 3) return aviso('El nombre necesita al menos 3 letras.', 'mal');
  if (clave.length < 3) return aviso('La clave interna necesita al menos 3 letras.', 'mal');

  S.datos.pendiente = {
    nombre,
    clave,
    descripcion: document.getElementById('r_desc').value,
    permisos: [...document.querySelectorAll('[id^=p_]:checked')].map(i => i.value),
  };
  // Se intenta sin contraseña: dentro de la ventana de confianza pasa
  // directo y no se interrumpe a nadie.
  await intentar(
    cred => api('/roles', { method:'POST',
      body: JSON.stringify({ ...S.datos.pendiente, ...cred }) }),
    { titulo:'Confirma tu identidad',
      aviso:'Crear un rol reparte permisos sobre el sistema.',
      mensaje:'Rol creado', ocupado:'Creando', despues: () => VISTAS.roles() });
}


/**
 * Envía la petición. Si el servidor pide confirmar la identidad, abre
 * el modal y reintenta con las credenciales.
 *
 * El servidor mantiene una ventana de confianza de unos minutos tras
 * la primera confirmación —igual que `sudo`—, así que en una tanda de
 * cambios solo se pregunta una vez.
 */
async function intentar(enviar, opciones) {
  const { titulo, aviso: textoAviso, mensaje, ocupado, despues } = opciones;
  const boton = S.botonPulsado;

  const ejecutar = async cred => {
    const liberar = ocupar(boton, ocupado);
    try {
      await enviar(cred);
      cerrarModal();
      aviso(mensaje, 'bien');
      if (despues) despues();
      return true;
    } catch (e) {
      if (e.codigo === 'REAUTENTICACION_REQUERIDA') return false;
      aviso(e.message, 'mal');
      return true;
    } finally {
      liberar();
    }
  };

  if (await ejecutar({})) return;

  // Hizo falta confirmar: se pide y se reintenta con lo mismo.
  S.datos.reintento = ejecutar;
  modal(titulo, `
    <p class="pista" style="margin-bottom:16px">${esc(textoAviso)}</p>
    ${campoClave('cf_pass', 'Tu contraseña')}
    ${S.tiene2fa ? `<div class="campo"><label for="cf_cod">Código de dos pasos</label>
      <input id="cf_cod" class="num" inputmode="numeric" maxlength="8"
        placeholder="000000"></div>
      <p class="pista">Cambia cada 30 segundos. También sirve un código de respaldo.</p>` : ''}`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="reintentarConfirmado()">Confirmar</button>`);
}

async function reintentarConfirmado() {
  try {
    const cred = credencialesConfirmadas();
    await S.datos.reintento(cred);
  } catch (e) {
    aviso(e.message, 'mal');
  }
}

async function editarRol(id, nombre, esSistema) {
  const permisos = await api('/roles/' + id);
  modal(nombre,
    (esSistema
      ? '<p class="pista" style="margin-bottom:16px">Este rol está protegido: si se le quitaran permisos, nadie podría devolvérselos.</p>'
      : '') + await formularioPermisos(permisos.permisos, esSistema),
    esSistema
      ? `<button class="btn-plano" onclick="cerrarModal()">Cerrar</button>`
      : `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
         <button class="btn" onclick="guardarRol('${id}')">Guardar cambios</button>`);
}

async function guardarRol(id) {
  const permisos = [...document.querySelectorAll('[id^=p_]:checked')].map(i => i.value);
  await intentar(
    cred => api('/roles/' + id, { method:'PATCH',
      body: JSON.stringify({ permisos, ...cred }) }),
    { titulo:'Confirma tu identidad',
      aviso:'Cambiar los permisos de un rol afecta a todos los que lo tienen.',
      mensaje:'Rol actualizado', ocupado:'Guardando', despues: () => VISTAS.roles() });
}


function borrarRol(id, nombre) {
  confirmar({
    titulo: 'Eliminar rol',
    mensaje: `Se va a eliminar «${nombre}».`,
    consecuencia: 'Los permisos que agrupaba dejan de existir como conjunto. Puedes volver a crearlo después.',
    textoBoton: 'Eliminar',
    peligroso: true,
    alAceptar: async () => {
      await accion(async () => {
        await api('/roles/' + id, { method:'DELETE' });
        cerrarModal();
        VISTAS.roles();
      }, 'Rol eliminado', 'Eliminando');
    },
  });
}
