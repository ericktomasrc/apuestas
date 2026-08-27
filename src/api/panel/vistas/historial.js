/* ---------- Historial ---------- */
VISTAS.historial = async () => {
  const r = await api('/historial?limite=100');

  render(cab('Historial', 'Quién cambió qué, desde el primer día') + `
    <div class="marco"><table>
      <thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th>
        <th>Acción</th><th>Campos</th></tr></thead>
      <tbody>${r.historial.map(h => `<tr>
        <td class="num" style="font-size:12px">${fecha(h.creado_en)}</td>
        <td>${esc(h.autor || 'sistema')}</td>
        <td><span class="num" style="font-size:12px">${esc(h.tabla)}</span></td>
        <td><span class="etiqueta ${h.operacion === 'BORRADO_LOGICO' ? 'et-aviso' : 'et-gris'}">${esc(h.operacion)}</span></td>
        <td style="font-size:12px;color:var(--tenue)">${esc((h.campos_cambiados || []).join(', '))}</td>
      </tr>`).join('')}</tbody></table></div>
    <p class="pista">Nada se borra de verdad: un borrado marca la fila y queda
    registrado aquí.</p>
  `);
};
