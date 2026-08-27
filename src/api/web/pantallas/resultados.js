'use strict';

/**
 * Resultados.
 *
 * Cómo le está yendo a la persona, calculado desde el LIBRO de
 * movimientos y no desde las posiciones. Es la única fuente que no se
 * puede reconstruir mal: los perdedores no llevan movimiento propio
 * —su retención ya descontó al entrar—, así que contar posiciones daría
 * un número distinto al dinero real.
 *
 * Para la cuenta de la casa muestra además el desglose de operación:
 * cuánto ofreció, cuánto llegó a estar en juego y cuánto pagó en
 * comisión.
 */
PANTALLAS.resultados = async () => {
  const dias = S.datos.diasResultados ?? 30;
  const r = await api('/yo/resultados?dias=' + dias);
  const s = r.resumen ?? {};

  const resultado = Number(s.resultado ?? 0);
  const eventos = Number(s.eventos ?? 0);
  const ganados = Number(s.ganados ?? 0);
  const perdidos = Number(s.perdidos ?? 0);

  pintar(armazon(`
    <h1 class="titulo">Mis resultados</h1>
    <p class="sub">Lo que realmente entró y salió de tu cuenta.</p>

    <div class="filtros">
      ${[[7,'7 días'], [30,'30 días'], [90,'3 meses'], [365,'Un año']]
        .map(([d, nombre]) => `
          <button class="filtro ${dias === d ? 'activo' : ''}"
            onclick="S.datos.diasResultados=${d};ir('resultados')">${nombre}</button>`).join('')}
    </div>

    ${eventos === 0 ? `
      <div class="vacio">
        <h3>Todavía no hay nada que mostrar</h3>
        <p>Cuando entres a una sala o a una casa, aquí vas a ver cómo te fue.</p>
        <button class="btn btn-favor" onclick="ir('muro')">Ver salas abiertas</button>
      </div>
    ` : `
      <div class="metricas">
        <div class="caja">
          <div class="dato-rotulo">Resultado</div>
          <div class="num" style="font-size:20px;font-weight:600;color:${
            resultado > 0 ? 'var(--favor)' : resultado < 0 ? 'var(--mal)' : 'var(--tinta)'}">
            ${resultado > 0 ? '+' : ''}${plata(resultado)}</div>
          <div class="pista" style="margin-top:2px">${dias} días</div>
        </div>
        <div class="caja">
          <div class="dato-rotulo">Ganaste</div>
          <div class="num" style="font-size:20px;font-weight:600;color:var(--favor)">
            ${plata(s.ganado ?? 0)}</div>
          <div class="pista" style="margin-top:2px">${ganados} vez(ces)</div>
        </div>
        <div class="caja">
          <div class="dato-rotulo">Perdiste</div>
          <div class="num" style="font-size:20px;font-weight:600;color:var(--mal)">
            ${plata(s.perdido ?? 0)}</div>
          <div class="pista" style="margin-top:2px">${perdidos} vez(ces)</div>
        </div>
        <div class="caja">
          <div class="dato-rotulo">Comisión</div>
          <div class="num" style="font-size:20px;font-weight:600">
            ${plata(s.comision ?? 0)}</div>
          <div class="pista" style="margin-top:2px">solo de lo ganado</div>
        </div>
      </div>

      <div class="caja">
        <div class="barra">
          <i class="b-favor" style="width:${eventos ? Math.round(ganados/eventos*100) : 0}%"></i>
          <i class="b-contra" style="width:${eventos ? Math.round(perdidos/eventos*100) : 0}%"></i>
        </div>
        <div class="pista" style="margin-top:6px">
          ${eventos > 0 ? `Aciertas ${Math.round(ganados / eventos * 100)}% en ${eventos} apuestas.` : ''}
          ${Number(s.como_casa) > 0 ? ` ${s.como_casa} como casa.` : ''}
          ${Number(s.devueltos) > 0 ? ` ${s.devueltos} anuladas con devolución.` : ''}
        </div>
      </div>

      ${graficaResultados(r.porDia ?? [])}

      <h2 style="margin:18px 0 9px">Una por una</h2>
      <div class="caja" style="padding:0">
        ${(r.eventos ?? []).map(filaResultado).join('')}
      </div>
    `}
  `));
};

/**
 * Acumulado día a día.
 *
 * Se muestra el acumulado y no el resultado suelto de cada día porque
 * lo que importa es la tendencia: un día malo dentro de una racha
 * buena no dice nada por sí solo.
 */
function graficaResultados(porDia) {
  if (porDia.length < 2) return '';

  let acumulado = 0;
  const puntos = porDia.map(d => {
    acumulado += Number(d.neto);
    return { dia: d.dia, valor: acumulado };
  });

  const valores = puntos.map(p => p.valor);
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const rango = Math.max(max - min, 1);
  const alto = 90;

  const coords = puntos.map((p, i) => {
    const x = (i / Math.max(puntos.length - 1, 1)) * 100;
    const y = alto - ((p.valor - min) / rango) * alto;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // La línea del cero: separa estar arriba de estar abajo.
  const cero = alto - ((0 - min) / rango) * alto;
  const final = puntos[puntos.length - 1].valor;

  return `
  <div class="caja">
    <div class="dato-rotulo" style="margin-bottom:7px">Acumulado</div>
    <svg viewBox="0 0 100 ${alto}" preserveAspectRatio="none"
      style="width:100%;height:78px;overflow:visible">
      <line x1="0" y1="${cero.toFixed(1)}" x2="100" y2="${cero.toFixed(1)}"
        stroke="var(--linea-fuerte)" stroke-width="0.4" stroke-dasharray="2 2"
        vector-effect="non-scaling-stroke"/>
      <polyline points="${coords}" fill="none"
        stroke="${final >= 0 ? 'var(--favor)' : 'var(--mal)'}"
        stroke-width="2" vector-effect="non-scaling-stroke"
        stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
    <div style="display:flex;justify-content:space-between;margin-top:6px">
      <span class="pista">${fechaCorta(puntos[0].dia).split(',')[0]}</span>
      <span class="pista num" style="color:${
        final >= 0 ? 'var(--favor)' : 'var(--mal)'};font-weight:600">
        ${final >= 0 ? '+' : ''}${plata(final)}</span>
    </div>
  </div>`;
}

function filaResultado(e) {
  const neto = Number(e.neto);
  const pendiente = ['ABIERTA', 'CUENTA_REGRESIVA', 'CERRADA', 'EN_JUEGO'].includes(e.estado);

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;
    padding:9px 13px;border-bottom:1px solid var(--linea);cursor:pointer"
    onclick="ir('${e.es_casa ? 'casa' : 'sala'}','${e.evento_id}')">
    <div style="min-width:0">
      <div style="font-size:13px;font-weight:500">
        ${esc(e.equipo_local ?? '')} vs ${esc(e.equipo_visitante ?? '')}</div>
      <div style="font-size:11px;color:var(--tenue);margin-top:1px">
        ${e.es_casa ? 'Casa' : 'Sala'} ${esc(e.codigo ?? '')} · ${fechaCorta(e.cuando)}
      </div>
    </div>
    <div class="num" style="font-weight:600;white-space:nowrap;color:${
      pendiente ? 'var(--tenue)' : neto > 0 ? 'var(--favor)' : neto < 0 ? 'var(--mal)' : 'var(--tenue)'}">
      ${pendiente
        ? 'en juego'
        : `${neto > 0 ? '+' : ''}${plata(neto)}`}
    </div>
  </div>`;
}
