/* ---------- Configuración ---------- */
VISTAS.config = async () => {
  const r = await api('/config');

  render(cab('Parámetros', 'Cambian el comportamiento del sistema sin desplegar código') + `
    <div class="marco"><table>
      <thead><tr><th>Parámetro</th><th class="der">Valor</th><th></th></tr></thead>
      <tbody>${r.config.map(c => `<tr>
        <td><span class="num">${esc(c.clave)}</span>
          <br><span style="color:var(--tenue);font-size:12px">${esc(c.descripcion || '')}</span></td>
        <td class="der num"><strong>${esc(c.valor)}</strong></td>
        <td class="der">${puede('config.gestionar')
          ? `<button class="btn-plano btn-chico"
                data-clave="${esc(c.clave)}"
                data-valor="${esc(c.valor)}"
                data-tipo="${esc(c.tipo)}"
                onclick="editarConfigDesdeBoton(this)">Cambiar</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>
    <p class="pista">Cuidado con bajar <span class="num">minutos_cierre_antes</span>:
    esos minutos existen para que nadie se salga de una sala al enterarse de la
    alineación.</p>
  `);
};

function editarConfigDesdeBoton(boton) {
  editarConfig(boton.dataset.clave, boton.dataset.valor, boton.dataset.tipo);
}

function editarConfig(clave, valor, tipo) {
  S.datos.configClaveActual = clave;
  modal(clave, `
    <div class="campo"><label for="c_valor">Valor</label>
      ${tipo === 'BOOLEAN'
        ? `<select id="c_valor"><option value="true"${valor==='true'?' selected':''}>Sí</option>
           <option value="false"${valor==='false'?' selected':''}>No</option></select>`
        : `<input id="c_valor" class="num" value="${esc(valor)}"
             ${tipo === 'NUMERO' ? 'type="number" step="any"' : ''}>`}
    </div>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarConfig('${escJs(clave)}')">Guardar</button>`);
}

async function guardarConfig() {
  const clave = S.datos.configClaveActual;
  if (!clave) throw new Error('No se pudo identificar el parámetro.');
  await accion(async () => {
    await api('/config/' + encodeURIComponent(clave), {
      method:'PATCH',
      body: JSON.stringify({ valor: String(document.getElementById('c_valor').value) }),
    });
    cerrarModal();
    VISTAS.config();
  }, 'Parámetro actualizado', 'Guardando');
}
