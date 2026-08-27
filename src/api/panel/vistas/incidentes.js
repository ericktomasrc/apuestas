/* ---------- Incidentes ---------- */

/**
 * Lo que el sistema no pudo resolver solo.
 *
 * Los descuadres contables van primero y en rojo: son dinero que no
 * cuadra, y cada hora que pasa hace más difícil reconstruir qué pasó.
 */
VISTAS.incidentes = async () => {
  const abiertos = S.datos.incidentesAbiertos !== false;
  const [r, salud] = await Promise.all([
    api('/incidentes?soloAbiertos=' + abiertos),
    api('/salud').catch(() => null),
  ]);

  const clase = { CRITICA:'et-mal', ALTA:'et-mal', MEDIA:'et-aviso', BAJA:'et-gris' };
  const criticos = r.incidentes.filter(
    i => !i.resuelto_en && ['CRITICA','ALTA'].includes(i.severidad)).length;

  render(cab('Incidentes', 'Lo que el sistema no pudo resolver solo',
    `<select onchange="S.datos.incidentesAbiertos=this.value==='true';VISTAS.incidentes()">
      <option value="true"${abiertos?' selected':''}>Sin resolver</option>
      <option value="false"${!abiertos?' selected':''}>Todos</option>
    </select>`) +

    (salud ? `<div class="rejilla rejilla-4">
      <div class="caja">
        <div class="dato-rotulo">Contabilidad</div>
        <div class="dato-cifra num" style="font-size:19px;padding-top:4px">
          ${salud.sano
            ? '<span class="etiqueta et-bien">Cuadra</span>'
            : '<span class="etiqueta et-mal">Descuadrada</span>'}</div>
        <div class="dato-nota">El dinero no se crea ni se destruye</div>
      </div>
      <div class="caja">
        <div class="dato-rotulo">Sin resolver</div>
        <div class="dato-cifra num">${salud.incidentesSinResolver}</div>
        <div class="dato-nota">${criticos > 0 ? `${criticos} de gravedad alta` : 'Ninguno urgente'}</div>
      </div>
      <div class="caja">
        <div class="dato-rotulo">Esperando resultado</div>
        <div class="dato-cifra num">${salud.mercadosEsperandoDato}</div>
        <div class="dato-nota">Mercados sin dato del proveedor</div>
      </div>
      <div class="caja">
        <div class="dato-rotulo">Salas abiertas</div>
        <div class="dato-cifra num">${salud.salasAbiertas}</div>
        <div class="dato-nota">Esperando que se llenen</div>
      </div>
    </div>` : '') +

    (r.incidentes.length ? `
    <div class="marco"><table>
      <thead><tr><th>Cuándo</th><th>Qué pasó</th><th>Gravedad</th>
        <th>Detalle</th><th></th></tr></thead>
      <tbody>${r.incidentes.map(i => `<tr>
        <td class="num" style="font-size:12px;white-space:nowrap">${fecha(i.fecha_crea)}</td>
        <td><span class="num" style="font-size:12.5px">${esc(i.tipo)}</span>
          <br><span style="font-size:11.5px;color:var(--tenue)">${esc(explicarIncidente(i.tipo))}</span></td>
        <td><span class="etiqueta ${clase[i.severidad] || 'et-gris'}">${esc(i.severidad)}</span></td>
        <td><button class="btn-plano btn-chico"
          onclick='verIncidente(${JSON.stringify(i).replace(/'/g, "&#39;")})'>Ver</button></td>
        <td class="der">${!i.resuelto_en && puede('incidentes.resolver')
          ? `<button class="btn-plano btn-chico" onclick="resolverIncidente('${i.id}')">Resolver</button>`
          : i.resuelto_en ? '<span class="etiqueta et-bien">Resuelto</span>' : ''}</td>
      </tr>`).join('')}</tbody></table></div>`
      : vacio(abiertos
          ? 'No hay incidentes sin resolver. El sistema está trabajando sin tropiezos.'
          : 'No se ha registrado ningún incidente.')) + `

    <p class="pista">Marcar como resuelto no arregla nada por sí solo: solo dice
    que alguien ya lo miró. Un <span class="num">DESCUADRE_CONTABLE</span> hay
    que investigarlo con <span class="num">sql/diagnostico.sql</span> antes de
    cerrarlo.</p>
  `);
};

/** Qué significa cada tipo, en una línea. */
function explicarIncidente(tipo) {
  return {
    DESCUADRE_CONTABLE:      'Hay dinero que el sistema no puede ubicar',
    MERCADOS_ATASCADOS:      'Mercados esperando un dato que no llega',
    PROCESO_FALLIDO:         'Un proceso automático reventó',
    UBICACION_PROVEEDOR_CAIDO:'El servicio de geolocalización no respondió',
    DATO_NO_DISPONIBLE:      'El proveedor nunca entregó el resultado',
    ACCION_CRITICA:          'Alguien cambió algo sensible del sistema',
  }[tipo] ?? 'Sin descripción';
}

function verIncidente(i) {
  modal(i.tipo, `
    <div class="caja" style="margin-bottom:16px">
      <div class="dato-rotulo">Qué es</div>
      <div style="font-size:14px">${esc(explicarIncidente(i.tipo))}</div>
      <div class="dato-nota" style="margin-top:8px">
        ${fecha(i.fecha_crea)} · Gravedad ${esc(i.severidad)}
        ${i.resuelto_en ? ` · Resuelto ${fecha(i.resuelto_en)}` : ''}</div>
    </div>

    <label>Detalle técnico</label>
    <div class="caja num" style="font-size:12px;white-space:pre-wrap;
      word-break:break-word;margin-top:6px">${esc(JSON.stringify(i.detalle, null, 2))}</div>

    ${i.mercado_id ? `<p class="pista" style="margin-top:12px">
      Mercado afectado: <span class="num">${esc(i.mercado_id)}</span></p>` : ''}`,
    `<button class="btn-plano" onclick="cerrarModal()">Cerrar</button>
     ${!i.resuelto_en && puede('incidentes.resolver')
       ? `<button class="btn" onclick="resolverIncidente('${i.id}')">Marcar resuelto</button>` : ''}`);
}

async function resolverIncidente(id) {
  await accion(async () => {
    await api('/incidentes/' + id, { method:'PATCH' });
    cerrarModal();
    VISTAS.incidentes();
  }, 'Incidente resuelto', 'Resolviendo');
}
