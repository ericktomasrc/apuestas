/* ---------- Salas ---------- */

/**
 * La pantalla de operación diaria.
 *
 * Lo que más se necesita aquí no es ver salas: es encontrar la que
 * está atascada. Por eso las que necesitan atención van primero.
 */
VISTAS.salas = async () => {
  const estado = S.datos.estadoSala || '';
  const r = await api('/salas?limite=60' + (estado ? '&estado=' + estado : ''));

  const clase = {
    ABIERTA:'et-gris', CUENTA_REGRESIVA:'et-aviso', CERRADA:'et-aviso',
    EN_JUEGO:'et-aviso', LIQUIDADA:'et-bien', ANULADA:'et-mal', EXPIRADA:'et-gris',
  };

  // Una sala cuyo partido ya empezó y sigue abierta es un problema:
  // el cierre automático no la alcanzó.
  const ahora = Date.now();
  const atascadas = r.salas.filter(s =>
    ['ABIERTA','CUENTA_REGRESIVA'].includes(s.estado) &&
    new Date(s.inicia_en).getTime() < ahora);

  render(cab('Salas', 'Qué está en juego ahora mismo',
    `<select onchange="S.datos.estadoSala=this.value;VISTAS.salas()">
      <option value=""${!estado ? ' selected' : ''}>Todas</option>
      ${['ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO','LIQUIDADA','ANULADA','EXPIRADA']
        .map(e => `<option value="${e}"${estado===e?' selected':''}>${e.replace('_',' ')}</option>`).join('')}
    </select>`) +

    (atascadas.length ? `<div class="banda">
      <p><strong>${atascadas.length} sala(s) con el partido ya empezado</strong>
      Siguen abiertas: el cierre automático no las alcanzó. Conviene cerrarlas
      o anularlas a mano.</p>
    </div>` : '') + `

    ${r.salas.length ? `<div class="marco"><table>
      <thead><tr><th>Sala</th><th>Partido</th><th>Estado</th>
        <th class="der">Gente</th><th class="der">En juego</th><th></th></tr></thead>
      <tbody>${r.salas.map(s => `<tr>
        <td><strong class="num">${esc(s.codigo)}</strong>
          <br><span style="color:var(--tenue);font-size:12px">${esc(s.anfitrion || 'del sistema')}</span></td>
        <td>${esc(s.equipo_local)} vs ${esc(s.equipo_visitante)}
          <br><span class="num" style="font-size:11.5px;color:var(--tenue)">${fecha(s.inicia_en)}</span></td>
        <td><span class="etiqueta ${clase[s.estado] || 'et-gris'}">${esc(s.estado.replace('_',' '))}</span>
          ${s.sin_balancear > 0 && ['ABIERTA','CUENTA_REGRESIVA'].includes(s.estado)
            ? `<br><span style="font-size:11.5px;color:var(--aviso)">${s.sin_balancear} sin completar</span>`
            : ''}
          ${s.motivo_anulacion
            ? `<br><span style="font-size:11.5px;color:var(--tenue)">${esc(s.motivo_anulacion)}</span>`
            : ''}</td>
        <td class="der num">${s.participantes}</td>
        <td class="der num">${plata(s.comprometido || 0, s.moneda)}</td>
        <td class="der"><button class="btn-plano btn-chico"
          onclick="verSala('${s.id}')">Ver</button></td>
      </tr>`).join('')}</tbody></table></div>`
      : vacio(estado
          ? `No hay salas en estado ${estado.replace('_',' ')}.`
          : 'Todavía no se ha creado ninguna sala.')}

    <p class="pista">El dinero <strong>en juego</strong> está retenido: no es de
    nadie hasta que el mercado se resuelva. Si una sala se anula, vuelve
    íntegro a cada participante y la casa no cobra nada.</p>
  `);
};

async function verSala(id) {
  const r = await api('/salas/' + id);
  const s = r.sala;
  const puedeIntervenir = puede('salas.anular');
  const viva = !['LIQUIDADA','ANULADA','EXPIRADA'].includes(s.estado);

  modal(`Sala ${s.codigo}`, `
    <div class="caja" style="margin-bottom:16px">
      <div style="font-size:15px;font-weight:600">
        ${esc(s.equipo_local)} vs ${esc(s.equipo_visitante)}</div>
      <div class="dato-nota">${fecha(s.inicia_en)} ·
        ${esc(s.estado_partido)}${s.goles_local !== null
          ? ` · <span class="num">${s.goles_local} - ${s.goles_visitante}</span>` : ''}</div>
      <div class="dato-nota" style="margin-top:6px">
        Anfitrión: ${esc(s.anfitrion || 'del sistema')} ·
        Mínimo ${plata(s.monto_minimo_centavos)} ·
        Hasta ${s.tope_participantes} personas</div>
    </div>

    ${r.mercados.map(m => `
      <div class="area-permisos">
        <div class="area-titulo">
          ${esc(m.etiqueta_favor)} · ${esc(m.linea ?? '')}
          <span class="etiqueta ${m.estado === 'LIQUIDADO' ? 'et-bien'
            : m.estado === 'ANULADO' ? 'et-mal' : 'et-gris'}"
            style="margin-left:6px">${esc(m.estado)}</span>
        </div>

        <div style="display:flex;gap:12px;font-size:13px;margin-bottom:10px">
          <div style="flex:1">
            <div class="dato-rotulo">${esc(m.etiqueta_favor)}</div>
            <div class="num" style="font-size:16px;font-weight:600">${plata(m.total_favor)}</div>
          </div>
          <div style="flex:1">
            <div class="dato-rotulo">${esc(m.etiqueta_contra)}</div>
            <div class="num" style="font-size:16px;font-weight:600">${plata(m.total_contra)}</div>
          </div>
        </div>
        <div class="balance ${m.balanceado ? 'bien' : 'aviso'}">
          <i style="width:${m.total_favor + m.total_contra
            ? Math.round(Math.min(m.total_favor, m.total_contra) /
                Math.max(m.total_favor, m.total_contra, 1) * 100)
            : 0}%"></i></div>
        <div class="dato-nota" style="margin-bottom:10px">
          ${m.balanceado
            ? 'Los dos lados suman lo mismo: puede correr.'
            : `Faltan ${plata(Math.abs(m.total_favor - m.total_contra))} del lado
               ${m.total_favor > m.total_contra ? esc(m.etiqueta_contra) : esc(m.etiqueta_favor)}.`}
          ${m.lado_ganador ? ` Ganó: ${esc(m.lado_ganador)}.` : ''}
          ${m.motivo_anulacion ? ` Anulado: ${esc(m.motivo_anulacion)}.` : ''}
        </div>

        ${m.posiciones.length ? `<table style="font-size:13px">
          <tbody>${m.posiciones.map(p => `<tr>
            <td style="padding:4px 0">${esc(p.alias)}</td>
            <td style="padding:4px 0;color:var(--tenue)">${
              p.lado === 'A_FAVOR' ? esc(m.etiqueta_favor) : esc(m.etiqueta_contra)}</td>
            <td class="der num" style="padding:4px 0">${plata(p.monto)}</td>
          </tr>`).join('')}</tbody></table>`
          : '<p class="pista">Nadie ha apostado en este mercado.</p>'}
      </div>`).join('')}

    ${r.movimientos.length ? `
      <h2 style="margin-top:18px;font-size:13px">Movimientos de dinero</h2>
      <table style="font-size:12.5px">
        <tbody>${r.movimientos.map(mv => `<tr>
          <td style="padding:3px 0"><span class="num">${esc(mv.tipo)}</span></td>
          <td class="der num" style="padding:3px 0;color:${
            mv.monto_centavos < 0 ? 'var(--tenue)' : 'var(--bien)'}">
            ${plata(mv.monto_centavos, mv.moneda)}</td>
        </tr>`).join('')}</tbody>
      </table>` : ''}`,

    `<button class="btn-plano" onclick="cerrarModal()">Cerrar</button>
     ${puedeIntervenir && viva ? `
       <button class="btn-plano" onclick="forzarCierre('${id}')">Forzar cierre</button>
       <button class="btn btn-mal" onclick="anularSala('${id}','${esc(s.codigo)}')">Anular</button>`
     : ''}`);
}

function forzarCierre(id) {
  confirmar({
    titulo: 'Forzar el cierre',
    mensaje: 'La sala deja de aceptar apuestas ahora mismo.',
    consecuencia: 'Los mercados que sumen igual en ambos lados quedan confirmados; los que no alcanzaron contraparte se anulan y devuelven el 100%.',
    textoBoton: 'Cerrar sala',
    alAceptar: async () => {
      await accion(async () => {
        const r = await api('/salas/' + id + '/cerrar', { method:'POST' });
        cerrarModal();
        aviso(`${r.confirmados} mercado(s) en pie, ${r.anulados} anulado(s).`, 'bien');
        VISTAS.salas();
      }, null, 'Cerrando');
    },
  });
}

function anularSala(id, codigo) {
  confirmar({
    titulo: `Anular la sala ${codigo}`,
    mensaje: 'Todos recuperan lo que pusieron, íntegro.',
    consecuencia: 'La casa no cobra comisión: no hubo resultado. Esto no se puede deshacer.',
    textoBoton: 'Anular y devolver',
    peligroso: true,
    alAceptar: async () => {
      await accion(async () => {
        const r = await api('/salas/' + id + '/anular', {
          method:'POST', body: JSON.stringify({ motivo: 'ERROR_OPERATIVO' }),
        });
        cerrarModal();
        aviso(`${r.mercadosAnulados} mercado(s) anulado(s). Todo devuelto.`, 'bien');
        VISTAS.salas();
      }, null, 'Anulando');
    },
  });
}
