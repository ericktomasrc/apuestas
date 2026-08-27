/* ---------- Textos ---------- */
VISTAS.textos = async () => {
  const idioma = S.datos.idioma || 'es';
  const r = await api('/textos?idioma=' + idioma);
  const esBase = idioma === 'es';

  const faltan = r.textos.filter(x => !x.traducido).length;
  const total = r.textos.length;
  const hechos = total - faltan;

  const grupos = {};
  for (const x of r.textos) (grupos[x.contexto || 'Otros'] ||= []).push(x);

  render(cab('Textos', 'Lo que lee el usuario. Se cambian sin desplegar código.',
    `<select onchange="S.datos.idioma=this.value;VISTAS.textos()">
      ${r.idiomas.map(i => `<option value="${i.codigo}"${i.codigo===idioma?' selected':''}>${esc(i.nombre)}</option>`).join('')}
    </select>
    <button class="btn-plano" onclick="nuevoIdioma()">Agregar idioma</button>`) +

    (esBase ? '' : `
    <div class="caja" style="margin-bottom:20px">
      <div class="dato-rotulo">Progreso de la traducción</div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:4px">
        <span class="dato-cifra num">${hechos}</span>
        <span style="color:var(--tenue);font-size:14px">de ${total}</span>
      </div>
      <div class="balance ${faltan === 0 ? 'bien' : ''}">
        <i style="width:${total ? Math.round(hechos / total * 100) : 0}%"></i></div>
      <div class="dato-nota">${faltan === 0
        ? 'Todo traducido.'
        : `Faltan ${faltan}. Mientras tanto se muestra el texto en español.`}</div>
    </div>`) +

    Object.entries(grupos).map(([contexto, lista]) => `
      <h2 style="margin-top:20px">${esc(contexto)}</h2>
      <div class="marco"><table><tbody>
        ${lista.map(x => `<tr>
          <td style="width:30%;vertical-align:top">
            <span class="num" style="font-size:11.5px;color:var(--tenue)">${esc(x.clave)}</span>
            ${esBase || x.traducido ? '' :
              '<br><span class="etiqueta et-aviso" style="margin-top:5px">Sin traducir</span>'}
          </td>
          <td>
            ${x.traducido || esBase
              ? esc(x.valor)
              : `<span style="color:var(--tenue)">${esc(x.base)}</span>`}
            ${esBase ? '' : `<br><span style="font-size:11.5px;color:var(--tenue)">
              Original: ${esc(x.base)}</span>`}
          </td>
          <td class="der" style="vertical-align:top">
            <button class="btn-plano btn-chico"
              onclick='editarTexto(${JSON.stringify({
                clave: x.clave, idioma, valor: x.valor ?? '', base: x.base,
              }).replace(/'/g, "&#39;")})'>
              ${esBase || x.traducido ? 'Editar' : 'Traducir'}</button>
          </td>
        </tr>`).join('')}
      </tbody></table></div>`).join('') + `

    <p class="pista">Las llaves entre corchetes se reemplazan solas:
    <span class="num">{monto}</span>, <span class="num">{lado}</span>,
    <span class="num">{minutos}</span>. Consérvalas al traducir o el texto
    saldrá incompleto.</p>
  `);
};

function editarTexto(x) {
  const esBase = x.idioma === 'es';
  modal(x.clave, `
    ${esBase ? '' : `<div class="campo">
      <label>Original en español</label>
      <div class="caja" style="padding:11px 14px;font-size:14px">${esc(x.base)}</div>
    </div>`}
    <div class="campo"><label for="t_valor">${esBase ? 'Texto' : 'Traducción'}</label>
      <textarea id="t_valor" rows="3" placeholder="${esc(x.base)}">${esc(x.valor)}</textarea>
      <p class="pista">Se muestra tal cual al usuario.</p></div>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarTexto('${esc(x.clave)}','${x.idioma}')">Guardar</button>`);

  // Las llaves entre corchetes deben sobrevivir a la traducción: sin
  // ellas el texto sale con un hueco donde iba el monto o el tiempo.
  S.datos.llavesEsperadas = (x.base.match(/\{\w+\}/g) || []);
}

async function guardarTexto(clave, idioma) {
  const valor = document.getElementById('t_valor').value;
  const faltan = (S.datos.llavesEsperadas || [])
    .filter(l => !valor.includes(l));

  if (faltan.length) {
    return aviso(`Falta ${faltan.join(', ')} en el texto. Sin eso saldría incompleto.`, 'mal');
  }

  await accion(async () => {
    await api('/textos/' + encodeURIComponent(clave), {
      method:'PUT',
      body: JSON.stringify({ idioma, valor }),
    });
    cerrarModal();
    VISTAS.textos();
  }, 'Texto guardado', 'Guardando');
}

function nuevoIdioma() {
  modal('Agregar idioma', `
    <div class="campo"><label for="i_codigo">Código</label>
      <input id="i_codigo" class="num" maxlength="2" placeholder="pt"
        oninput="this.value=this.value.toLowerCase().replace(/[^a-z]/g,'')">
      <p class="pista">Dos letras, como <span class="num">pt</span>,
      <span class="num">en</span> o <span class="num">qu</span>.</p></div>
    <div class="campo"><label for="i_nombre">Nombre</label>
      <input id="i_nombre" placeholder="Português"></div>
    <p class="pista">Al agregarlo aparecerá la lista completa de textos para
    traducir. Mientras falte alguno se muestra la versión en español, así que
    la app nunca queda con huecos.</p>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarIdioma()">Agregar</button>`);
}

async function guardarIdioma() {
  const codigo = document.getElementById('i_codigo').value.trim();
  const nombre = document.getElementById('i_nombre').value.trim();
  if (codigo.length !== 2) return aviso('El código son exactamente dos letras.', 'mal');
  if (nombre.length < 2) return aviso('Escribe el nombre del idioma.', 'mal');

  await accion(async () => {
    await api('/idiomas', { method:'POST', body: JSON.stringify({ codigo, nombre }) });
    cerrarModal();
    S.datos.idioma = codigo;   // se abre directo en el idioma nuevo
    VISTAS.textos();
  }, 'Idioma agregado', 'Agregando');
}
