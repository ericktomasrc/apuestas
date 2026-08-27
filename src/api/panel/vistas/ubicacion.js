/* ---------- Ubicación ---------- */
VISTAS.ubicacion = async () => {
  const r = await api('/ubicacion');

  const claseResultado = {
    PERMITIDO:'et-bien', BLOQUEADO:'et-mal', ADVERTIDO:'et-aviso',
    SIN_DATO:'et-gris', PROVEEDOR_CAIDO:'et-aviso',
  };

  render(cab('Ubicación', 'Quién declaró un país distinto al de su conexión') + `
    <div class="rejilla rejilla-4">
      ${r.resumen.map(x => `<div class="caja">
        <div class="dato-rotulo">${esc(x.resultado.replace('_',' '))}</div>
        <div class="dato-cifra num">${x.total}</div>
        <div class="dato-nota">Últimos 30 días</div>
      </div>`).join('') || '<div class="caja"><div class="dato-rotulo">Verificaciones</div><div class="dato-cifra num">0</div><div class="dato-nota">Todavía ninguna</div></div>'}
    </div>

    <h2>Discrepancias</h2>
    ${r.discrepancias.length ? `<div class="marco"><table>
      <thead><tr><th>Cuenta</th><th>Declaró</th><th>Su IP dice</th>
        <th>Conexión</th><th class="der">Bloqueos</th><th>Cuándo</th></tr></thead>
      <tbody>${r.discrepancias.map(d => `<tr>
        <td><strong>${esc(d.alias)}</strong>
          <br><span style="color:var(--tenue);font-size:12px">${esc(d.email)}</span></td>
        <td><span class="etiqueta et-gris">${esc(d.pais_declarado)}</span></td>
        <td><span class="etiqueta et-aviso">${esc(d.pais_detectado)}</span></td>
        <td>${d.ubicacion_sospechosa
          ? '<span class="etiqueta et-aviso">Posible VPN</span>'
          : '<span class="etiqueta et-gris">Normal</span>'}</td>
        <td class="der num">${d.bloqueos}</td>
        <td class="num" style="font-size:12px">${fecha(d.registrado_en)}</td>
      </tr>`).join('')}</tbody></table></div>`
      : vacio('Nadie ha declarado un país distinto al de su conexión.')}

    <p class="pista">La IP <strong>no es prueba</strong>: una VPN la cambia en un clic
    y una red corporativa puede salir por otro país. Es la primera capa; el KYC es
    la que verifica de verdad.<br>
    La política se cambia en <a href="#config" onclick="ir('config')">Parámetros</a>,
    en <span class="num">ubicacion_politica</span>.</p>
  `);
};
