/* ---------- Resumen ---------- */
VISTAS.resumen = async () => {
  const [r, s] = await Promise.all([
    api('/reportes/resumen'),
    puede('incidentes.ver') ? api('/salud').catch(() => null) : null,
  ]);

  const tasa = r.tasaAnulacion;
  const claseTasa = tasa > 40 ? 'aviso' : tasa > 20 ? '' : 'bien';

  const monedas = r.porMoneda.map(m => `
    <div class="caja">
      <div class="dato-rotulo">Comisión cobrada · ${esc(m.moneda)}</div>
      <div class="dato-cifra num">${plata(m.comision_total || 0, m.moneda)}</div>
      <div class="dato-nota">Volumen apostado ${plata(m.volumen_apostado || 0, m.moneda)}</div>
    </div>`).join('') || '<div class="caja"><div class="dato-rotulo">Comisión</div><div class="dato-cifra num">—</div><div class="dato-nota">Todavía no hay movimientos</div></div>';

  render(cab('Resumen', 'Cómo va el sistema hoy') + `
    <div class="rejilla rejilla-4">
      <div class="caja">
        <div class="dato-rotulo">Usuarios</div>
        <div class="dato-cifra num">${r.usuarios}</div>
        <div class="dato-nota">${r.usuariosSemana} nuevos esta semana</div>
      </div>
      <div class="caja">
        <div class="dato-rotulo">Salas abiertas</div>
        <div class="dato-cifra num">${r.salasAbiertas}</div>
        <div class="dato-nota">Esperando que se llenen</div>
      </div>
      <div class="caja">
        <div class="dato-rotulo">Salas resueltas</div>
        <div class="dato-cifra num">${r.salasLiquidadas}</div>
        <div class="dato-nota">Con resultado y pagadas</div>
      </div>
      <div class="caja">
        <div class="dato-rotulo">Se anularon</div>
        <div class="dato-cifra num">${tasa}%</div>
        <div class="balance ${claseTasa}"><i style="width:${Math.min(tasa,100)}%"></i></div>
        <div class="dato-nota">Cada anulación es comisión que se fue</div>
      </div>
    </div>

    <h2>Dinero</h2>
    <div class="rejilla rejilla-2">${monedas}</div>

    ${s ? `<h2>Estado</h2>
    <div class="marco"><table>
      <tr><td>Conciliación contable</td><td class="der">
        ${s.sano
          ? '<span class="etiqueta et-bien">Todo cuadra</span>'
          : '<span class="etiqueta et-mal">Hay un descuadre</span>'}</td></tr>
      <tr><td>Incidentes sin resolver</td>
        <td class="der num">${s.incidentesSinResolver}</td></tr>
      <tr><td>Mercados esperando resultado</td>
        <td class="der num">${s.mercadosEsperandoDato}</td></tr>
      ${Object.entries(s.dineroRetenido || {}).map(([m, v]) =>
        `<tr><td>Comprometido en salas · ${esc(m)}</td>
             <td class="der num">${plata(v, m)}</td></tr>`).join('')}
    </table></div>` : ''}
  `);
};
