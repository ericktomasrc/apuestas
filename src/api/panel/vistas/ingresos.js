/* ---------- Ingresos ---------- */
VISTAS.ingresos = async () => {
  const agrupar = S.datos.agrupar || 'dia';
  const r = await api('/reportes/ingresos?agrupar=' + agrupar);
  const motivos = await api('/reportes/salas').catch(() => ({ motivos:[] }));

  const filas = r.periodos.map(p => `<tr>
    <td class="num">${new Date(p.periodo).toLocaleDateString('es-PE',
      { day:'2-digit', month:'short', year:'2-digit' })}</td>
    <td><span class="etiqueta et-gris">${esc(p.moneda)}</span></td>
    <td class="der num">${p.apuestas}</td>
    <td class="der num">${plata(p.volumen || 0, p.moneda)}</td>
    <td class="der num">${plata(p.depositos || 0, p.moneda)}</td>
    <td class="der num"><strong>${plata(p.comision || 0, p.moneda)}</strong></td>
  </tr>`).join('');

  render(cab('Ingresos', 'Del libro contable, separado por moneda',
    `<select onchange="S.datos.agrupar=this.value;VISTAS.ingresos()">
      <option value="dia"${agrupar==='dia'?' selected':''}>Por día</option>
      <option value="semana"${agrupar==='semana'?' selected':''}>Por semana</option>
      <option value="mes"${agrupar==='mes'?' selected':''}>Por mes</option>
    </select>`) + (filas ? `
    <div class="marco"><table>
      <thead><tr><th>Período</th><th>Moneda</th><th class="der">Apuestas</th>
        <th class="der">Volumen</th><th class="der">Depósitos</th>
        <th class="der">Comisión</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>` : vacio('Todavía no hay movimientos en este período.')) + `

    <h2 style="margin-top:26px">Por qué se anulan las salas</h2>
    ${motivos.motivos.length ? `<div class="marco"><table>
      <thead><tr><th>Motivo</th><th class="der">Mercados</th></tr></thead>
      <tbody>${motivos.motivos.map(m => `<tr>
        <td>${esc(m.motivo)}</td><td class="der num">${m.total}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="pista">Si domina SIN_CONTRAPARTE, el problema es que las salas no
      se llenan. Si domina DATO_NO_DISPONIBLE, es el proveedor de datos.</p>`
      : vacio('No se ha anulado ninguna sala.')}
  `);
};
