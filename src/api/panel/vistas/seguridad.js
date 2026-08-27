/* ---------- Seguridad ---------- */
VISTAS.seguridad = async () => {
  const r = await api('/seguridad');

  render(cab('Seguridad', 'Intentos de ingreso y estado del equipo') + `
    <div class="rejilla rejilla-4">
      <div class="caja">
        <div class="dato-rotulo">Personas con acceso</div>
        <div class="dato-cifra num">${r.personal.length}</div>
        <div class="dato-nota">${r.personal.filter(p => p.tiene_segundo_factor).length} con doble verificación</div>
      </div>
      <div class="caja">
        <div class="dato-rotulo">Intentos sospechosos</div>
        <div class="dato-cifra num">${r.intentosSospechosos.length}</div>
        <div class="dato-nota">Última hora</div>
      </div>
      <div class="caja">
        <div class="dato-rotulo">Bloqueo tras</div>
        <div class="dato-cifra num">${r.politica.maxIntentos}</div>
        <div class="dato-nota">Intentos fallidos, ${r.politica.minutosBloqueo} min</div>
      </div>
      <div class="caja">
        <div class="dato-rotulo">Empleados apostando</div>
        <div class="dato-cifra num">${r.politica.adminPuedeApostar ? 'Sí' : 'No'}</div>
        <div class="dato-nota">${r.politica.adminPuedeApostar
          ? 'Riesgo: quien anula salas tiene dinero en juego'
          : 'Quien anula salas no puede apostar'}</div>
      </div>
    </div>

    <h2>Quiénes entran al panel</h2>
    <div class="marco"><table>
      <thead><tr><th>Cuenta</th><th class="der">Permisos</th>
        <th>Doble verificación</th></tr></thead>
      <tbody>${r.personal.map(p => `<tr>
        <td><strong>${esc(p.alias)}</strong>
          <br><span style="color:var(--tenue);font-size:12px">${esc(p.email)}</span></td>
        <td class="der num">${p.permisos}</td>
        <td>${p.tiene_segundo_factor
          ? '<span class="etiqueta et-bien">Activa</span>'
          : '<span class="etiqueta et-aviso">Sin activar</span>'}</td>
      </tr>`).join('')}</tbody></table></div>

    ${r.intentosSospechosos.length ? `
    <h2 style="margin-top:26px">Intentos fallidos recientes</h2>
    <div class="marco"><table>
      <thead><tr><th>Correo</th><th>Desde</th><th class="der">Intentos</th>
        <th>Último</th></tr></thead>
      <tbody>${r.intentosSospechosos.map(i => `<tr>
        <td>${esc(i.email)}</td>
        <td class="num" style="font-size:12px">${esc(i.ip || 'local')}</td>
        <td class="der num"><strong>${i.intentos}</strong></td>
        <td class="num" style="font-size:12px">${fecha(i.ultimo)}</td>
      </tr>`).join('')}</tbody></table></div>
    <p class="pista">Varios intentos desde la misma dirección pueden ser un
    ataque. La cuenta se bloquea sola tras ${r.politica.maxIntentos} fallos.</p>`
    : '<h2 style="margin-top:26px">Intentos fallidos recientes</h2>' +
      vacio('Ninguno en la última hora.')}

    <h2 style="margin-top:26px">Correos de los últimos 7 días</h2>
    ${r.correos.length ? `<div class="marco"><table>
      <thead><tr><th>Tipo</th><th>Estado</th><th class="der">Cantidad</th></tr></thead>
      <tbody>${r.correos.map(c => `<tr>
        <td>${esc(c.plantilla)}</td>
        <td><span class="etiqueta ${c.estado === 'ENVIADO' ? 'et-bien'
          : c.estado === 'FALLIDO' ? 'et-mal' : 'et-gris'}">${esc(c.estado)}</span></td>
        <td class="der num">${c.total}</td>
      </tr>`).join('')}</tbody></table></div>`
      : vacio('No se ha enviado ningún correo.')}
  `);
};
