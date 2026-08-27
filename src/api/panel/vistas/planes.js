/* ---------- Membresías ---------- */
VISTAS.planes = async () => {
  const r = await api('/planes');
  const activos = r.planes.filter(p => p.activo);

  render(cab('Membresías', 'La comisión se aplica sobre la ganancia, nunca sobre el capital',
    puede('comisiones.gestionar')
      ? `<button class="btn" onclick="nuevoPlan()">Crear membresía</button>` : '') + `
    <div class="marco"><table>
      <thead><tr><th>Membresía</th><th class="der">Precio</th><th class="der">Comisión</th>
        <th>Incluye</th><th class="der">Personas</th><th>Estado</th><th></th></tr></thead>
      <tbody>${r.planes.map(p => `<tr${p.activo ? '' : ' style="opacity:.55"'}>
        <td><strong>${esc(p.nombre)}</strong>
          <br><span class="num" style="color:var(--tenue);font-size:12px">${esc(p.codigo)}</span></td>
        <td class="der num">${p.precio_centavos > 0 ? plata(p.precio_centavos) + ' / mes' : 'Gratis'}</td>
        <td class="der num"><strong>${(Number(p.tasa_comision) * 100).toFixed(1)}%</strong></td>
        <td style="font-size:12px;color:var(--tenue)">
          ${[p.destacados_incluidos ? 'Destacados' : null,
             p.estadisticas_avanzadas ? 'Estadísticas' : null]
            .filter(Boolean).join(' · ') || '—'}</td>
        <td class="der num">${p.usuarios}</td>
        <td>${p.activo
          ? '<span class="etiqueta et-bien">A la venta</span>'
          : '<span class="etiqueta et-gris">Oculta</span>'}</td>
        <td class="der">${puede('comisiones.gestionar')
          ? `<button class="btn-plano btn-chico"
               onclick='editarPlan(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Editar</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>

    <p class="pista">
      Ninguna membresía puede bajar del 3%. Una sin comisión dejaría el ingreso
      capado justo en quienes más juegan: pagan una cuota fija y pueden mover
      cualquier cantidad sin aportar más.<br><br>
      <strong>${activos.length} a la venta.</strong> Cuatro escalones son muchos para
      arrancar: conviene lanzar con una sola de pago, medir cuántos la compran y
      cuánto juegan, y recién entonces abrir las demás. Ocultar una membresía no
      afecta a quien ya la tiene.</p>
  `);
};

function nuevoPlan() {
  modal('Crear membresía', `
    <div class="rejilla rejilla-2" style="margin:0">
      <div class="campo"><label for="pl_nombre">Nombre</label>
        <input id="pl_nombre" placeholder="Pro"></div>
      <div class="campo"><label for="pl_codigo">Código interno</label>
        <input id="pl_codigo" class="num" placeholder="PRO"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-Z_]/g,'')">
        <p class="pista">Solo letras y guion bajo, mínimo 3.
        Se escribe solo en mayúsculas y no se puede cambiar después.</p></div>
      <div class="campo"><label for="pl_precio_n">Precio mensual</label>
        <input id="pl_precio_n" class="num" type="number" min="0" value="2000">
        <p class="pista">En centavos. 2000 son S/20.00.</p></div>
      <div class="campo"><label for="pl_tasa_n">Comisión (%)</label>
        <input id="pl_tasa_n" class="num" type="number" step="0.1" min="3" max="20" value="4">
        <p class="pista">Entre 3% y 20%.</p></div>
    </div>
    <label style="margin-top:14px">Qué incluye</label>
    <div class="permiso"><input type="checkbox" id="pl_dest_n">
      <label for="pl_dest_n">Destacar salas sin costo
        <small>Aparecen arriba del muro. Normalmente cuesta S/2 por sala.</small></label></div>
    <div class="permiso"><input type="checkbox" id="pl_est_n">
      <label for="pl_est_n">Estadísticas avanzadas
        <small>Historial de rendimiento y comparativas.</small></label></div>
    <div class="permiso"><input type="checkbox" id="pl_act_n" checked>
      <label for="pl_act_n">Ponerla a la venta ya
        <small>Sin marcar, queda creada pero oculta.</small></label></div>
    <p class="pista" style="margin-top:14px">
      La diferencia entre membresías conviene cubrirla con beneficios que
      <strong>no cuestan porcentaje</strong>: destacados, estadísticas, torneos.</p>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="pedirConfirmarPlan()">Crear</button>`);
}

async function pedirConfirmarPlan() {
  const nombre = document.getElementById('pl_nombre').value.trim();
  const codigo = document.getElementById('pl_codigo').value.trim();
  const tasa = Number(document.getElementById('pl_tasa_n').value);
  const precio = Number(document.getElementById('pl_precio_n').value);

  // Se avisa aquí y no después de confirmar la identidad: descubrir
  // que el código era corto tras escribir la contraseña es tiempo
  // perdido dos veces.
  if (nombre.length < 2) return aviso('El nombre necesita al menos 2 letras.', 'mal');
  if (codigo.length < 3) return aviso('El código interno necesita al menos 3 letras.', 'mal');
  if (!(tasa >= 3 && tasa <= 20)) {
    return aviso('La comisión debe estar entre 3% y 20%.', 'mal');
  }
  if (!(precio >= 0)) return aviso('El precio no puede ser negativo.', 'mal');

  const datos = {
    nombre,
    codigo,
    precioCentavos: precio,
    tasaComision: tasa / 100,
    destacadosIncluidos: document.getElementById('pl_dest_n').checked,
    estadisticasAvanzadas: document.getElementById('pl_est_n').checked,
    activo: document.getElementById('pl_act_n').checked,
  };
  await intentar(
    cred => api('/planes', { method:'POST', body: JSON.stringify({ ...datos, ...cred }) }),
    { titulo:'Confirma tu identidad',
      aviso:'Crear una membresía define cuánto cobra la plataforma.',
      mensaje:'Membresía creada', ocupado:'Creando', despues: () => VISTAS.planes() });
}


function editarPlan(p) {
  modal(p.nombre, `
    <div class="campo"><label for="pl_nombre_e">Nombre</label>
      <input id="pl_nombre_e" value="${esc(p.nombre)}"></div>
    <div class="rejilla rejilla-2" style="margin:0">
      <div class="campo"><label for="pl_precio">Precio mensual</label>
        <input id="pl_precio" class="num" type="number" min="0" value="${p.precio_centavos}">
        <p class="pista">En centavos.</p></div>
      <div class="campo"><label for="pl_tasa">Comisión (%)</label>
        <input id="pl_tasa" class="num" type="number" step="0.1" min="3" max="20"
          value="${(Number(p.tasa_comision) * 100).toFixed(1)}">
        <p class="pista">Mínimo 3%.</p></div>
    </div>
    <label style="margin-top:14px">Qué incluye</label>
    <div class="permiso"><input type="checkbox" id="pl_dest" ${p.destacados_incluidos ? 'checked' : ''}>
      <label for="pl_dest">Destacar salas sin costo</label></div>
    <div class="permiso"><input type="checkbox" id="pl_est" ${p.estadisticas_avanzadas ? 'checked' : ''}>
      <label for="pl_est">Estadísticas avanzadas</label></div>
    <div class="permiso"><input type="checkbox" id="pl_act" ${p.activo ? 'checked' : ''}>
      <label for="pl_act">A la venta
        <small>Ocultarla no afecta a las ${p.usuarios} persona(s) que ya la tienen.</small></label></div>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="pedirConfirmarEditarPlan('${p.id}')">Guardar</button>`);
}

async function pedirConfirmarEditarPlan(id) {
  const datos = {
    nombre: document.getElementById('pl_nombre_e').value,
    tasaComision: Number(document.getElementById('pl_tasa').value) / 100,
    precioCentavos: Number(document.getElementById('pl_precio').value),
    destacadosIncluidos: document.getElementById('pl_dest').checked,
    estadisticasAvanzadas: document.getElementById('pl_est').checked,
    activo: document.getElementById('pl_act').checked,
  };
  await intentar(
    cred => api('/planes/' + id, { method:'PATCH', body: JSON.stringify({ ...datos, ...cred }) }),
    { titulo:'Confirma tu identidad',
      aviso:'Cambiar la comisión afecta el dinero de todas las salas que se liquiden desde ahora.',
      mensaje:'Membresía actualizada', ocupado:'Guardando', despues: () => VISTAS.planes() });
}
