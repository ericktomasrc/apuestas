/* ---------- Países ---------- */
VISTAS.paises = async () => {
  const r = await api('/paises');

  render(cab('Países', 'Cada país tiene su moneda. Una sala nunca mezcla monedas.',
    puede('paises.gestionar') ? `<button class="btn" onclick="nuevoPais()">Agregar país</button>` : '') + `
    <div class="marco"><table>
      <thead><tr><th>País</th><th>Moneda</th><th>Formato</th>
        <th class="der">Mínimo</th><th class="der">Máximo</th><th></th></tr></thead>
      <tbody>${r.paises.map(p => `<tr>
        <td><strong>${esc(p.nombre)}</strong>
          <span class="etiqueta et-gris">${esc(p.codigo)}</span></td>
        <td class="num">${esc(p.moneda)} ${esc(p.simbolo)}</td>
        <td class="num" style="color:var(--tenue)">${
          p.decimales === 0 ? '1' + p.separador_miles + '234'
          : '1' + p.separador_miles + '234' + p.separador_decimal + '56'}</td>
        <td class="der num">${plata(p.minimo_apuesta, p.moneda)}</td>
        <td class="der num">${plata(p.maximo_apuesta, p.moneda)}</td>
        <td class="der">${puede('paises.gestionar')
          ? `<button class="btn-plano btn-chico" onclick="editarLimites('${p.codigo}',${p.minimo_apuesta},${p.maximo_apuesta})">Límites</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>
    <p class="pista">Abrir un país nuevo es agregar una fila aquí. Lo único que
    requiere programar es la pasarela de pagos local.</p>
  `);
};

function nuevoPais() {
  modal('Agregar país', `
    <div class="rejilla rejilla-2" style="margin:0">
      <div class="campo"><label for="p_codigo">Código</label>
        <input id="p_codigo" class="num" maxlength="2" placeholder="BR"></div>
      <div class="campo"><label for="p_nombre">Nombre</label>
        <input id="p_nombre" placeholder="Brasil"></div>
      <div class="campo"><label for="p_moneda">Moneda</label>
        <input id="p_moneda" class="num" maxlength="3" placeholder="BRL"></div>
      <div class="campo"><label for="p_simbolo">Símbolo</label>
        <input id="p_simbolo" placeholder="R$"></div>
      <div class="campo"><label for="p_dec">Decimales</label>
        <select id="p_dec"><option value="2">2 — como el sol o el dólar</option>
        <option value="0">0 — como el peso chileno o el yen</option></select></div>
      <div class="campo"><label for="p_zona">Zona horaria</label>
        <input id="p_zona" placeholder="America/Sao_Paulo"></div>
      <div class="campo"><label for="p_miles">Separador de miles</label>
        <input id="p_miles" class="num" maxlength="1" value="."></div>
      <div class="campo"><label for="p_decimal">Separador decimal</label>
        <input id="p_decimal" class="num" maxlength="1" value=","></div>
      <div class="campo"><label for="p_min">Apuesta mínima</label>
        <input id="p_min" class="num" type="number" value="500"></div>
      <div class="campo"><label for="p_max">Apuesta máxima</label>
        <input id="p_max" class="num" type="number" value="50000"></div>
    </div>
    <p class="pista">Los montos van en la unidad mínima: 500 son S/5.00 si la moneda
    tiene 2 decimales, o $500 si tiene 0.</p>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarPais()">Agregar</button>`);
}

async function guardarPais() {
  await accion(async () => {
    await api('/paises', { method:'POST', body: JSON.stringify({
      codigo: document.getElementById('p_codigo').value,
      nombre: document.getElementById('p_nombre').value,
      moneda: document.getElementById('p_moneda').value,
      simbolo: document.getElementById('p_simbolo').value,
      decimales: Number(document.getElementById('p_dec').value),
      separadorMiles: document.getElementById('p_miles').value,
      separadorDecimal: document.getElementById('p_decimal').value,
      minimoApuesta: Number(document.getElementById('p_min').value),
      maximoApuesta: Number(document.getElementById('p_max').value),
      zonaHoraria: document.getElementById('p_zona').value,
    })});
    cerrarModal();
    VISTAS.paises();
  }, 'País agregado', 'Agregando');
}

function editarLimites(codigo, min, max) {
  modal('Límites de ' + codigo, `
    <div class="campo"><label for="l_min">Apuesta mínima</label>
      <input id="l_min" class="num" type="number" value="${min}"></div>
    <div class="campo"><label for="l_max">Apuesta máxima</label>
      <input id="l_max" class="num" type="number" value="${max}"></div>
    <p class="pista">En la unidad mínima de la moneda.</p>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarLimites('${codigo}')">Guardar</button>`);
}

async function guardarLimites(codigo) {
  await accion(async () => {
    await api('/paises/' + codigo, { method:'PATCH', body: JSON.stringify({
      minimoApuesta: Number(document.getElementById('l_min').value),
      maximoApuesta: Number(document.getElementById('l_max').value),
    })});
    cerrarModal();
    VISTAS.paises();
  }, 'Límites actualizados', 'Guardando');
}
