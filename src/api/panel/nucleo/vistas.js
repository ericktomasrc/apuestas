/* ===== Registro de vistas =====

   Cada archivo de vistas/ se cuelga de este objeto. Se carga antes
   que ellos para que exista cuando se registren. */

const VISTAS = {};
/* ===== Opciones de juego — catálogo visual =====
 * Primera etapa: interfaz del catálogo. No crea endpoints ni cambia reglas del backend.
 */
const OPCIONES_DEMO = [
 {id:1,nombre:'Ganador del partido',cat:'Resultado',ejemplo:'Equipo A gana',cantidad:false,sala:true,casa:true,activa:true},
 {id:2,nombre:'Empate',cat:'Resultado',ejemplo:'El partido termina empatado',cantidad:false,sala:true,casa:true,activa:true},
 {id:3,nombre:'Gana o empata',cat:'Resultado',ejemplo:'Equipo A gana o empata',cantidad:false,sala:true,casa:true,activa:true},
 {id:4,nombre:'No empatan',cat:'Resultado',ejemplo:'El partido no termina empatado',cantidad:false,sala:true,casa:true,activa:true},
 {id:5,nombre:'Equipo no pierde',cat:'Resultado',ejemplo:'Equipo A no pierde',cantidad:false,sala:true,casa:true,activa:true},
 {id:6,nombre:'Marcador exacto',cat:'Resultado',ejemplo:'Equipo A gana 2 a 1',cantidad:true,sala:true,casa:true,activa:true},
 {id:7,nombre:'Equipo marca o más',cat:'Goles de equipo',ejemplo:'Equipo A marca 2 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:8,nombre:'Equipo marca exactamente',cat:'Goles de equipo',ejemplo:'Equipo A marca exactamente 2 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:9,nombre:'Equipo marca o menos',cat:'Goles de equipo',ejemplo:'Equipo A marca 2 goles o menos',cantidad:true,sala:true,casa:true,activa:true},
 {id:10,nombre:'Equipo no marca',cat:'Goles de equipo',ejemplo:'Equipo A no marca',cantidad:false,sala:true,casa:true,activa:true},
 {id:11,nombre:'Equipo marca',cat:'Goles de equipo',ejemplo:'Equipo A marca al menos 1 gol',cantidad:false,sala:true,casa:true,activa:true},
 {id:12,nombre:'Equipo marca más que el rival',cat:'Goles de equipo',ejemplo:'Equipo A marca más goles que Equipo B',cantidad:false,sala:true,casa:true,activa:true},
 {id:13,nombre:'Equipo marca igual que el rival',cat:'Goles de equipo',ejemplo:'Los dos equipos marcan la misma cantidad',cantidad:false,sala:true,casa:true,activa:true},
 {id:14,nombre:'Hay o más goles',cat:'Total de goles',ejemplo:'Hay 4 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:15,nombre:'Hay exactamente goles',cat:'Total de goles',ejemplo:'Hay exactamente 3 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:16,nombre:'Hay goles o menos',cat:'Total de goles',ejemplo:'Hay 2 goles o menos',cantidad:true,sala:true,casa:true,activa:true},
 {id:17,nombre:'Hay entre dos cantidades',cat:'Total de goles',ejemplo:'Hay entre 2 y 4 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:18,nombre:'No hay goles',cat:'Total de goles',ejemplo:'No hay goles',cantidad:false,sala:true,casa:true,activa:true},
 {id:19,nombre:'Hay al menos un gol',cat:'Total de goles',ejemplo:'Hay al menos 1 gol',cantidad:false,sala:true,casa:true,activa:true},
 {id:20,nombre:'Los dos equipos marcan',cat:'Ambos equipos',ejemplo:'Los dos equipos marcan',cantidad:false,sala:true,casa:true,activa:true},
 {id:21,nombre:'Los dos equipos marcan al menos',cat:'Ambos equipos',ejemplo:'Los dos equipos marcan al menos 2 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:22,nombre:'Solo un equipo marca',cat:'Ambos equipos',ejemplo:'Solo un equipo marca',cantidad:false,sala:true,casa:true,activa:true},
 {id:23,nombre:'Ningún equipo marca',cat:'Ambos equipos',ejemplo:'Ningún equipo marca',cantidad:false,sala:true,casa:true,activa:true},
 {id:24,nombre:'Al menos un equipo no marca',cat:'Ambos equipos',ejemplo:'Al menos un equipo no marca',cantidad:false,sala:true,casa:true,activa:true},
 {id:25,nombre:'Gana por o más goles',cat:'Diferencia',ejemplo:'Equipo A gana por 2 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:26,nombre:'Gana exactamente por',cat:'Diferencia',ejemplo:'Equipo A gana exactamente por 2 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:27,nombre:'Gana por o menos',cat:'Diferencia',ejemplo:'Equipo A gana por 2 goles o menos',cantidad:true,sala:true,casa:true,activa:true},
 {id:28,nombre:'Diferencia exacta de goles',cat:'Diferencia',ejemplo:'La diferencia final es exactamente 2 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:29,nombre:'Hay diferencia o más',cat:'Diferencia',ejemplo:'Hay 3 o más goles de diferencia',cantidad:true,sala:true,casa:true,activa:true},
 {id:30,nombre:'Gana y hay goles',cat:'Combinadas',ejemplo:'Equipo A gana y hay 3 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:31,nombre:'Gana y los dos marcan',cat:'Combinadas',ejemplo:'Equipo A gana y los dos equipos marcan',cantidad:false,sala:true,casa:true,activa:true},
 {id:32,nombre:'Gana y rival no marca',cat:'Combinadas',ejemplo:'Equipo A gana sin recibir goles',cantidad:false,sala:true,casa:true,activa:true},
 {id:33,nombre:'Gana y marca cantidad',cat:'Combinadas',ejemplo:'Equipo A gana y marca 2 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:34,nombre:'No pierde y marca cantidad',cat:'Combinadas',ejemplo:'Equipo A no pierde y marca 2 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:35,nombre:'Empate y los dos marcan',cat:'Combinadas',ejemplo:'Empatan y los dos equipos marcan',cantidad:false,sala:true,casa:true,activa:true},
 {id:36,nombre:'Empate y hay goles',cat:'Combinadas',ejemplo:'Empatan y hay 2 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:37,nombre:'Los dos marcan y hay goles',cat:'Combinadas',ejemplo:'Los dos equipos marcan y hay 3 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:38,nombre:'Gana por diferencia y hay goles',cat:'Combinadas',ejemplo:'Equipo A gana por 2 o más y hay 3 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:39,nombre:'Equipo marca y rival no marca',cat:'Combinadas',ejemplo:'Equipo A marca y Equipo B no marca',cantidad:false,sala:true,casa:true,activa:true},
 {id:40,nombre:'Gana el primer tiempo',cat:'Primer tiempo',ejemplo:'Equipo A gana el primer tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:41,nombre:'Empate al descanso',cat:'Primer tiempo',ejemplo:'El primer tiempo termina empatado',cantidad:false,sala:true,casa:true,activa:true},
 {id:42,nombre:'Hay goles en el primer tiempo',cat:'Primer tiempo',ejemplo:'Hay 2 o más goles en el primer tiempo',cantidad:true,sala:true,casa:true,activa:true},
 {id:43,nombre:'Equipo marca en el primer tiempo',cat:'Primer tiempo',ejemplo:'Equipo A marca en el primer tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:44,nombre:'Equipo marca cantidad en primer tiempo',cat:'Primer tiempo',ejemplo:'Equipo A marca 2 o más goles en el primer tiempo',cantidad:true,sala:true,casa:true,activa:true},
 {id:45,nombre:'Los dos marcan en el primer tiempo',cat:'Primer tiempo',ejemplo:'Los dos equipos marcan en el primer tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:46,nombre:'No hay goles en primer tiempo',cat:'Primer tiempo',ejemplo:'No hay goles en el primer tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:47,nombre:'Gana el segundo tiempo',cat:'Segundo tiempo',ejemplo:'Equipo A gana el segundo tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:48,nombre:'Empate en el segundo tiempo',cat:'Segundo tiempo',ejemplo:'El segundo tiempo termina empatado',cantidad:false,sala:true,casa:true,activa:true},
 {id:49,nombre:'Hay goles en el segundo tiempo',cat:'Segundo tiempo',ejemplo:'Hay 2 o más goles en el segundo tiempo',cantidad:true,sala:true,casa:true,activa:true},
 {id:50,nombre:'Equipo marca en el segundo tiempo',cat:'Segundo tiempo',ejemplo:'Equipo A marca en el segundo tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:51,nombre:'Marca en los dos tiempos',cat:'Segundo tiempo',ejemplo:'Equipo A marca en los dos tiempos',cantidad:false,sala:true,casa:true,activa:true},
 {id:52,nombre:'Hay goles en los dos tiempos',cat:'Segundo tiempo',ejemplo:'Hay goles en los dos tiempos',cantidad:false,sala:true,casa:true,activa:true},
 {id:53,nombre:'Marca primero',cat:'Eventos',ejemplo:'Equipo A marca primero',cantidad:false,sala:true,casa:true,activa:true},
 {id:54,nombre:'Marca último',cat:'Eventos',ejemplo:'Equipo A marca el último gol',cantidad:false,sala:true,casa:true,activa:true},
 {id:55,nombre:'Gol antes del minuto',cat:'Eventos',ejemplo:'Hay un gol antes del minuto 30',cantidad:true,sala:true,casa:true,activa:true},
 {id:56,nombre:'Gol después del minuto',cat:'Eventos',ejemplo:'Hay un gol después del minuto 75',cantidad:true,sala:true,casa:true,activa:true},
 {id:57,nombre:'Gol entre minutos',cat:'Eventos',ejemplo:'Hay un gol entre el minuto 60 y 75',cantidad:true,sala:true,casa:true,activa:true},
 {id:58,nombre:'Equipo marca antes del minuto',cat:'Eventos',ejemplo:'Equipo A marca antes del minuto 30',cantidad:true,sala:true,casa:true,activa:true},
 {id:59,nombre:'Equipo marca después del minuto',cat:'Eventos',ejemplo:'Equipo A marca después del minuto 75',cantidad:true,sala:true,casa:true,activa:true},
 {id:60,nombre:'Equipo remonta',cat:'Eventos',ejemplo:'Equipo A va perdiendo y termina ganando',cantidad:false,sala:true,casa:true,activa:true},
 {id:61,nombre:'Equipo recibe tarjeta',cat:'Tarjetas',ejemplo:'Equipo A recibe al menos 1 tarjeta',cantidad:false,sala:true,casa:true,activa:true},
 {id:62,nombre:'Equipo recibe o más tarjetas',cat:'Tarjetas',ejemplo:'Equipo A recibe 3 o más tarjetas',cantidad:true,sala:true,casa:true,activa:true},
 {id:63,nombre:'Hay o más tarjetas',cat:'Tarjetas',ejemplo:'Hay 5 o más tarjetas',cantidad:true,sala:true,casa:true,activa:true},
 {id:64,nombre:'Equipo recibe más tarjetas',cat:'Tarjetas',ejemplo:'Equipo A recibe más tarjetas que Equipo B',cantidad:false,sala:true,casa:true,activa:true},
 {id:65,nombre:'Los dos reciben tarjeta',cat:'Tarjetas',ejemplo:'Los dos equipos reciben al menos 1 tarjeta',cantidad:false,sala:true,casa:true,activa:true},
 {id:66,nombre:'Hay tarjeta roja',cat:'Tarjetas',ejemplo:'Hay al menos 1 tarjeta roja',cantidad:false,sala:true,casa:true,activa:true},
 {id:67,nombre:'Equipo recibe roja',cat:'Tarjetas',ejemplo:'Equipo A recibe una tarjeta roja',cantidad:false,sala:true,casa:true,activa:true},
 {id:68,nombre:'Hay o más córners',cat:'Córners',ejemplo:'Hay 9 o más córners',cantidad:true,sala:true,casa:true,activa:true},
 {id:69,nombre:'Hay córners o menos',cat:'Córners',ejemplo:'Hay 8 córners o menos',cantidad:true,sala:true,casa:true,activa:true},
 {id:70,nombre:'Equipo consigue o más córners',cat:'Córners',ejemplo:'Equipo A consigue 5 o más córners',cantidad:true,sala:true,casa:true,activa:true},
 {id:71,nombre:'Equipo consigue más córners',cat:'Córners',ejemplo:'Equipo A consigue más córners que Equipo B',cantidad:false,sala:true,casa:true,activa:true},
 {id:72,nombre:'Hay exactamente córners',cat:'Córners',ejemplo:'Hay exactamente 10 córners',cantidad:true,sala:true,casa:true,activa:true},
 {id:73,nombre:'Los dos consiguen córners',cat:'Córners',ejemplo:'Los dos equipos consiguen 3 o más córners',cantidad:true,sala:true,casa:true,activa:true},
 {id:74,nombre:'Equipo tiene o más tiros',cat:'Estadísticas',ejemplo:'Equipo A tiene 10 o más tiros',cantidad:true,sala:true,casa:true,activa:true},
 {id:75,nombre:'Equipo tiene o más tiros al arco',cat:'Estadísticas',ejemplo:'Equipo A tiene 5 o más tiros al arco',cantidad:true,sala:true,casa:true,activa:true},
 {id:76,nombre:'Equipo tiene más tiros',cat:'Estadísticas',ejemplo:'Equipo A tiene más tiros que Equipo B',cantidad:false,sala:true,casa:true,activa:true},
 {id:77,nombre:'Equipo tiene más posesión',cat:'Estadísticas',ejemplo:'Equipo A tiene más posesión que Equipo B',cantidad:false,sala:true,casa:true,activa:true},
 {id:78,nombre:'Equipo comete o más faltas',cat:'Estadísticas',ejemplo:'Equipo A comete 10 o más faltas',cantidad:true,sala:true,casa:true,activa:true},
 {id:79,nombre:'Equipo tiene o más fuera de juego',cat:'Estadísticas',ejemplo:'Equipo A tiene 3 o más fuera de juego',cantidad:true,sala:true,casa:true,activa:true}
];

S.opcionesJuego = S.opcionesJuego || {categoria:'Todas', buscar:'', estado:'todas', destino:'todos'};
let OPCIONES_CACHE = [];

function opjColor(cat){ if(['Resultado','Diferencia'].includes(cat))return 'azul'; if(['Ambos equipos','Combinadas'].includes(cat))return 'morado'; return 'verde'; }
function opjFiltradas(){const f=S.opcionesJuego;return OPCIONES_CACHE.filter(o=>(f.categoria==='Todas'||o.cat===f.categoria)&&(!f.buscar||(`${o.nombre} ${o.ejemplo}`).toLowerCase().includes(f.buscar.toLowerCase()))&&(f.estado==='todas'||(f.estado==='activas'?o.activa:!o.activa))&&(f.destino==='todos'||(f.destino==='sala'?o.sala:o.casa)));}
function opjDestinos(o){return `<div class="opj-destinos">${o.sala?'<span class="opj-chip verde">Crear sala</span>':''}${o.casa?'<span class="opj-chip azul">Casa</span>':''}</div>`;}
function opjEditar(id){const o=OPCIONES_CACHE.find(x=>x.id===id);abrirOpcion(o);}
function opjCambiarCategoria(cat){S.opcionesJuego.categoria=cat;dibujarOpciones();}
function opjBuscar(v){S.opcionesJuego.buscar=v;dibujarOpciones();}
function opjFiltro(k,v){S.opcionesJuego[k]=v;dibujarOpciones();}
function opjVistaPrevia(){const n=document.getElementById('opj-min')?.value||'2';const modo=document.querySelector('input[name=opj_modo]:checked')?.value||'o más';const p=document.getElementById('opj-preview-texto');if(p)p.textContent=`Equipo A marca ${n} ${modo} goles`;}


/* Tabs de categorías: scroll horizontal con rueda, arrastre y touch.
 * Se inyecta aquí porque esta vista no depende de un CSS propio del panel. */
function opjPrepararTabs(){
 const tabs=document.querySelector('.opj-tabs');
 if(!tabs)return;

 if(!document.getElementById('opj-tabs-scroll-style')){
  const st=document.createElement('style');
  st.id='opj-tabs-scroll-style';
  st.textContent=`
   .opj-tabs{
    display:flex!important;
    flex-wrap:nowrap!important;
    gap:10px;
    width:100%;
    max-width:100%;
    overflow-x:auto!important;
    overflow-y:hidden!important;
    -webkit-overflow-scrolling:touch;
    scrollbar-width:none;
    overscroll-behavior-x:contain;
    cursor:grab;
    user-select:none;
    touch-action:pan-x;
   }
   .opj-tabs::-webkit-scrollbar{display:none}
   .opj-tabs.opj-arrastrando{cursor:grabbing}
   .opj-tabs .opj-tab{flex:0 0 auto!important;white-space:nowrap}
  `;
  document.head.appendChild(st);
 }

 // Rueda del mouse -> desplazamiento horizontal.
 tabs.addEventListener('wheel',e=>{
  if(tabs.scrollWidth<=tabs.clientWidth)return;
  const d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
  if(!d)return;
  tabs.scrollLeft+=d;
  e.preventDefault();
 },{passive:false});

 // Click confiable por delegación. No depende del onclick del botón.
 tabs.addEventListener('click',e=>{
  const b=e.target.closest('.opj-tab');
  if(!b||!tabs.contains(b))return;
  const cat=b.dataset.opjCat;
  if(cat)opjCambiarCategoria(cat);
 });

 // Arrastre horizontal con mouse/lápiz.
 // Si fue un arrastre real, se suprime solo el click que genera ese arrastre.
 let activo=false, movido=false, x0=0, scroll0=0, pointerId=null;

 tabs.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'||e.button!==0)return;
  activo=true;
  movido=false;
  x0=e.clientX;
  scroll0=tabs.scrollLeft;
  pointerId=e.pointerId;
 });

 tabs.addEventListener('pointermove',e=>{
  if(!activo||e.pointerId!==pointerId)return;
  const dx=e.clientX-x0;
  if(Math.abs(dx)>=6){
   movido=true;
   tabs.classList.add('opj-arrastrando');
   tabs.scrollLeft=scroll0-dx;
   e.preventDefault();
  }
 });

 tabs.addEventListener('pointerup',e=>{
  if(!activo||e.pointerId!==pointerId)return;
  const fueArrastre=movido;
  activo=false;
  movido=false;
  pointerId=null;
  tabs.classList.remove('opj-arrastrando');

  if(fueArrastre){
   const bloquear=e2=>{
    e2.preventDefault();
    e2.stopPropagation();
   };
   tabs.addEventListener('click',bloquear,{capture:true,once:true});
  }
 });

 tabs.addEventListener('pointercancel',()=>{
  activo=false;
  movido=false;
  pointerId=null;
  tabs.classList.remove('opj-arrastrando');
 });

 requestAnimationFrame(()=>{
  tabs.querySelector('.opj-tab.activo')?.scrollIntoView({
   block:'nearest',
   inline:'nearest'
  });
 });
}

function abrirOpcion(o=null){
 const edit=!!o, cats=['Resultado','Goles de equipo','Total de goles','Ambos equipos','Diferencia','Combinadas','Primer tiempo','Segundo tiempo','Eventos','Tarjetas','Córners','Estadísticas'];
 modal(edit?'Editar opción':'Nueva opción', `
  <input id="opj-id" type="hidden" value="${esc(o?.id||'')}">
  <div class="opj-form-grid">
   <div class="campo ancho"><label>Nombre sencillo</label><input id="opj-nombre" value="${esc(o?.nombre||'')}" placeholder="Ej. Goles de un equipo"></div>
   <div class="campo"><label>Categoría</label><select id="opj-cat">${cats.map(c=>`<option ${o?.cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
   <div class="campo"><label>Ejemplo que verá el usuario</label><input id="opj-ejemplo" value="${esc(o?.ejemplo||'Equipo A marca 2 o más goles')}"></div>
   <div class="campo ancho"><label>¿El usuario elige una cantidad?</label><div class="opj-checks"><label class="opj-check"><input id="opj-cantidad" type="checkbox" ${o?.cantidad?'checked':''}> Sí, puede elegir cantidad</label></div></div>
   <div class="campo"><label>Cantidad mínima</label><input id="opj-min" type="number" min="0" max="999" value="${o?.cantidadMin??1}" oninput="opjVistaPrevia()"></div>
   <div class="campo"><label>Cantidad máxima</label><input id="opj-max" type="number" min="0" max="999" value="${o?.cantidadMax??10}"></div>
   <div class="campo ancho"><label>Formas permitidas</label><div class="opj-checks"><label class="opj-check"><input id="opj-exacto" type="checkbox" ${o?.exactamente===false?'':'checked'}> Exactamente</label><label class="opj-check"><input id="opj-mas" type="checkbox" ${o?.mas===false?'':'checked'}> O más</label><label class="opj-check"><input id="opj-menos" type="checkbox" ${o?.menos===false?'':'checked'}> O menos</label></div></div>
   <div class="campo"><label>Fuente para comprobar</label><select id="opj-fuente"><option value="RESULTADO" ${o?.fuenteValidacion==='RESULTADO'?'selected':''}>Resultado</option><option value="EVENTOS" ${o?.fuenteValidacion==='EVENTOS'?'selected':''}>Eventos</option><option value="ESTADISTICAS" ${o?.fuenteValidacion==='ESTADISTICAS'?'selected':''}>Estadísticas</option></select></div>
   <div class="campo ancho"><label>Dónde se mostrará</label><div class="opj-checks"><label class="opj-check"><input id="opj-sala" type="checkbox" ${o?.sala===false?'':'checked'}> Crear Sala</label><label class="opj-check"><input id="opj-casa" type="checkbox" ${o?.casa===false?'':'checked'}> Casa</label><label class="opj-check"><input id="opj-activa" type="checkbox" ${o?.activa===false?'':'checked'}> Activa</label></div></div>
  </div>
  <div class="opj-preview"><small>Así lo verán los usuarios</small><strong id="opj-preview-texto">${esc(o?.ejemplo||'Equipo A marca 2 o más goles')}</strong></div>`,
  `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button><button class="btn" onclick="opjGuardar()">Guardar opción</button>`);
}

async function opjGuardar(){
 const id=document.getElementById('opj-id').value; const usaCantidad=document.getElementById('opj-cantidad').checked;
 const body={nombre:document.getElementById('opj-nombre').value.trim(),categoria:document.getElementById('opj-cat').value,ejemplo:document.getElementById('opj-ejemplo').value.trim(),usaCantidad,cantidadMin:usaCantidad?Number(document.getElementById('opj-min').value):null,cantidadMax:usaCantidad?Number(document.getElementById('opj-max').value):null,permiteExactamente:document.getElementById('opj-exacto').checked,permiteMas:document.getElementById('opj-mas').checked,permiteMenos:document.getElementById('opj-menos').checked,mostrarSala:document.getElementById('opj-sala').checked,mostrarCasa:document.getElementById('opj-casa').checked,activa:document.getElementById('opj-activa').checked,fuenteValidacion:document.getElementById('opj-fuente').value,configuracion:{}};
 await accion(async()=>{await api('/opciones-juego'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(body)});cerrarModal();await VISTAS.opciones();},id?'Opción actualizada':'Opción creada','Guardando opción');
}

function dibujarOpciones(){
 const cats=['Todas','Resultado','Goles de equipo','Total de goles','Ambos equipos','Diferencia','Combinadas','Primer tiempo','Segundo tiempo','Eventos','Tarjetas','Córners','Estadísticas'];const f=S.opcionesJuego,rows=opjFiltradas();const conteo=c=>c==='Todas'?OPCIONES_CACHE.length:OPCIONES_CACHE.filter(o=>o.cat===c).length;
 document.getElementById('contenido').innerHTML=`<div class="opj-cab"><div><h1>Opciones de juego</h1><p>Catálogo guardado en la base de datos para Crear Sala y Casa.</p></div><button class="btn" onclick="abrirOpcion()">+ Nueva opción</button></div><div class="opj-ayuda"><strong>Textos fáciles de entender.</strong> Las pantallas consultan este catálogo; aquí decides qué reglas están activas y dónde aparecen.</div><div class="opj-tabs">${cats.map(c=>`<button class="opj-tab ${f.categoria===c?'activo':''}" data-opj-cat="${esc(c)}">${c}<b>${conteo(c)}</b></button>`).join('')}</div><div class="opj-barra"><input class="opj-buscar" placeholder="Buscar opción…" value="${esc(f.buscar)}" oninput="opjBuscar(this.value)"><select onchange="opjFiltro('estado',this.value)"><option value="todas">Todos los estados</option><option value="activas">Activas</option><option value="inactivas">Inactivas</option></select><select onchange="opjFiltro('destino',this.value)"><option value="todos">Mostrar en: Todos</option><option value="sala">Crear Sala</option><option value="casa">Casa</option></select></div><div class="opj-panel"><table class="opj-tabla"><thead><tr><th>#</th><th>Nombre</th><th>Categoría</th><th>Ejemplo</th><th>Cantidad</th><th>Mostrar en</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map((o,i)=>`<tr><td>${i+1}</td><td class="opj-nombre">${esc(o.nombre)}</td><td><span class="opj-chip ${opjColor(o.cat)}">${esc(o.cat)}</span></td><td class="opj-ejemplo">${esc(o.ejemplo)}</td><td>${o.cantidad?'La elige el usuario':'No necesita'}</td><td>${opjDestinos(o)}</td><td><span class="opj-estado ${o.activa?'':'inactiva'}">${o.activa?'Activa':'Inactiva'}</span></td><td><button class="opj-iconbtn" title="Editar" onclick="opjEditar('${o.id}')">✎</button></td></tr>`).join('')}</tbody></table><div class="opj-cards">${rows.map(o=>`<article class="opj-card"><div class="opj-card-top"><div><h3>${esc(o.nombre)}</h3><span class="opj-chip ${opjColor(o.cat)}">${esc(o.cat)}</span></div><button class="opj-iconbtn" onclick="opjEditar('${o.id}')">✎</button></div><p>${esc(o.ejemplo)}</p><div>${o.cantidad?'Cantidad: la elige el usuario':'No necesita cantidad'}</div><div class="opj-card-pie">${opjDestinos(o)}<span class="opj-estado ${o.activa?'':'inactiva'}">${o.activa?'Activa':'Inactiva'}</span></div></article>`).join('')}</div></div>`;
 opjPrepararTabs();
}

VISTAS.opciones=async function(){
 document.getElementById('contenido').innerHTML='<div class="cargando">Cargando opciones…</div>';
 try{const r=await api('/opciones-juego');OPCIONES_CACHE=r.reglas||[];dibujarOpciones();}
 catch(e){document.getElementById('contenido').innerHTML=`<div class="vacio"><strong>No se pudo cargar Opciones de juego</strong><p>${esc(e.message)}</p><p>Ejecuta primero la migración <code>sql/016_reglas_juego.sql</code>.</p></div>`;}
};


/* ===== Histórico deportivo ===== */
S.historicoDeportivo = S.historicoDeportivo || {ligaApiId:'', temporada:null, buscar:''};
let HD_LIGAS = [], HD_TEMPORADAS = [], HD_PARTIDOS = [];

function hdFecha(v){
 if(!v)return '—';
 try{return new Intl.DateTimeFormat('es-PE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}
 catch{return String(v);}
}
function hdNum(v){return v===null||v===undefined||v===''?'—':v;}
function hdEscAttr(v){return esc(String(v??'')).replace(/'/g,'&#39;');}

async function hdElegirLiga(id){
 S.historicoDeportivo.ligaApiId=String(id);
 S.historicoDeportivo.buscar='';
 const r=await api('/historico-deportivo/temporadas?ligaApiId='+encodeURIComponent(id));
 HD_TEMPORADAS=r.temporadas||[];
 S.historicoDeportivo.temporada=HD_TEMPORADAS[0]?.temporada??null;
 await hdCargarPartidos();
}
async function hdCambiarTemporada(v){
 S.historicoDeportivo.temporada=Number(v);
 await hdCargarPartidos();
}
async function hdBuscar(v){
 S.historicoDeportivo.buscar=v;
 clearTimeout(hdBuscar._t);
 hdBuscar._t=setTimeout(()=>hdCargarPartidos(),250);
}
async function hdCargarPartidos(){
 const f=S.historicoDeportivo;
 if(!f.ligaApiId||!f.temporada){HD_PARTIDOS=[];dibujarHistoricoDeportivo();return;}
 const qs=new URLSearchParams({ligaApiId:f.ligaApiId,temporada:String(f.temporada),limite:'150'});
 if(f.buscar)qs.set('buscar',f.buscar);
 const r=await api('/historico-deportivo/partidos?'+qs);
 HD_PARTIDOS=r.partidos||[];
 dibujarHistoricoDeportivo();
}
async function hdDetalle(fixtureId){
 const r=await api('/historico-deportivo/partidos/'+encodeURIComponent(fixtureId));
 const p=r.partido, st=r.estadisticas||[];
 const stat=(fila,campo)=>hdNum(fila?.[campo]);
 const local=st.find(x=>x.es_local) || st[0];
 const visita=st.find(x=>!x.es_local) || st[1];
 const filas=[
  ['Tiros','tiros'],['Tiros al arco','tiros_arco'],['Posesión %','posesion'],
  ['Córners','corners'],['Faltas','faltas'],['Amarillas','amarillas'],
  ['Rojas','rojas'],['Fuera de juego','fueras_juego'],['Pases','pases'],
  ['Pases correctos','pases_correctos'],['Precisión de pases %','precision_pases'],['Atajadas','atajadas']
 ];
 modal('Detalle del partido',`
  <div class="hd-detalle-cab">
   <div><strong>${esc(p.equipo_local)}</strong><span>${hdNum(p.goles_local)}</span></div>
   <b>—</b>
   <div><span>${hdNum(p.goles_visitante)}</span><strong>${esc(p.equipo_visitante)}</strong></div>
  </div>
  <div class="hd-meta">${esc(p.ronda||'')} · ${hdFecha(p.fecha)} · Temporada ${p.temporada}</div>
  ${st.length?`<div class="hd-stats">
   <div class="hd-stats-head"><b>${esc(p.equipo_local)}</b><span>Estadística</span><b>${esc(p.equipo_visitante)}</b></div>
   ${filas.map(([n,c])=>`<div class="hd-stat"><b>${stat(local,c)}</b><span>${n}</span><b>${stat(visita,c)}</b></div>`).join('')}
  </div>`:'<div class="hd-sin-stats">Este partido no tiene estadísticas detalladas almacenadas.</div>'}
 `,`<button class="btn" onclick="cerrarModal()">Cerrar</button>`);
}

function dibujarHistoricoDeportivo(){
 const f=S.historicoDeportivo;
 const liga=HD_LIGAS.find(x=>String(x.liga_api_id)===String(f.ligaApiId));
 const temp=HD_TEMPORADAS.find(x=>Number(x.temporada)===Number(f.temporada));
 document.getElementById('contenido').innerHTML=`
  <div class="hd-cab">
   <div><h1>Histórico deportivo</h1><p>Resultados y estadísticas guardados localmente, organizados por liga y temporada.</p></div>
   <button class="btn-plano" onclick="VISTAS.historicoDeportivo()">↻ Recargar</button>
  </div>
  ${HD_LIGAS.length?`
   <div class="hd-ligas">
    ${HD_LIGAS.map(l=>`<button class="hd-liga ${String(l.liga_api_id)===String(f.ligaApiId)?'activo':''}" onclick="hdElegirLiga('${hdEscAttr(l.liga_api_id)}')">
      ${l.logo_url?`<img src="${hdEscAttr(l.logo_url)}" alt="">`:''}
      <span>${esc(l.liga)}</span><b>${l.partidos}</b>
    </button>`).join('')}
   </div>
   <section class="hd-resumen">
    <div><small>Competición</small><strong>${esc(liga?.liga||'—')}</strong></div>
    <div><small>Partidos guardados</small><strong>${liga?.partidos??0}</strong></div>
    <div><small>Con estadísticas</small><strong>${liga?.con_estadisticas??0}</strong></div>
    <div><small>Última actualización</small><strong>${hdFecha(liga?.ultima_actualizacion)}</strong></div>
   </section>
   <div class="hd-filtros">
    <input placeholder="Buscar equipo o ronda…" value="${esc(f.buscar)}" oninput="hdBuscar(this.value)">
    <select onchange="hdCambiarTemporada(this.value)">
     ${HD_TEMPORADAS.map(t=>`<option value="${t.temporada}" ${Number(t.temporada)===Number(f.temporada)?'selected':''}>Temporada ${t.temporada} · ${t.partidos} partidos</option>`).join('')}
    </select>
   </div>
   <div class="hd-panel">
    <table class="hd-tabla">
     <thead><tr><th>Fecha</th><th>Local</th><th>Resultado</th><th>Visitante</th><th>Ronda</th><th>Datos</th><th></th></tr></thead>
     <tbody>${HD_PARTIDOS.map(p=>`<tr>
      <td>${hdFecha(p.fecha)}</td>
      <td class="hd-equipo">${p.logo_local?`<img src="${hdEscAttr(p.logo_local)}" alt="">`:''}${esc(p.equipo_local)}</td>
      <td><span class="hd-marcador">${hdNum(p.goles_local)} - ${hdNum(p.goles_visitante)}</span></td>
      <td class="hd-equipo">${p.logo_visitante?`<img src="${hdEscAttr(p.logo_visitante)}" alt="">`:''}${esc(p.equipo_visitante)}</td>
      <td>${esc(p.ronda||'—')}</td>
      <td><span class="hd-dato ${p.estadisticas_completas?'ok':''}">${p.estadisticas_completas?'Estadísticas':'Resultado'}</span></td>
      <td><button class="opj-iconbtn" title="Ver detalle" onclick="hdDetalle('${hdEscAttr(p.fixture_api_id)}')">⌕</button></td>
     </tr>`).join('')||'<tr><td colspan="7" class="hd-vacio">No hay partidos almacenados para esta selección.</td></tr>'}</tbody>
    </table>
    <div class="hd-cards">${HD_PARTIDOS.map(p=>`<article class="hd-card">
     <small>${hdFecha(p.fecha)} · ${esc(p.ronda||'')}</small>
     <div class="hd-card-partido"><span>${esc(p.equipo_local)}</span><b>${hdNum(p.goles_local)} - ${hdNum(p.goles_visitante)}</b><span>${esc(p.equipo_visitante)}</span></div>
     <button class="btn-plano" onclick="hdDetalle('${hdEscAttr(p.fixture_api_id)}')">Ver detalle</button>
    </article>`).join('')}</div>
   </div>
  `:`<div class="vacio"><strong>Aún no hay histórico deportivo almacenado</strong><p>Ejecuta la migración 017 y el importador histórico. Después esta pantalla se llenará automáticamente con las ligas importadas.</p></div>`}`;
}

VISTAS.historicoDeportivo=async function(){
 document.getElementById('contenido').innerHTML='<div class="cargando">Cargando histórico deportivo…</div>';
 try{
  const r=await api('/historico-deportivo/ligas');
  HD_LIGAS=r.ligas||[];
  if(HD_LIGAS.length){
   const actual=HD_LIGAS.some(x=>String(x.liga_api_id)===String(S.historicoDeportivo.ligaApiId))
    ?S.historicoDeportivo.ligaApiId:HD_LIGAS[0].liga_api_id;
   S.historicoDeportivo.ligaApiId=String(actual);
   const t=await api('/historico-deportivo/temporadas?ligaApiId='+encodeURIComponent(actual));
   HD_TEMPORADAS=t.temporadas||[];
   if(!HD_TEMPORADAS.some(x=>Number(x.temporada)===Number(S.historicoDeportivo.temporada)))
    S.historicoDeportivo.temporada=HD_TEMPORADAS[0]?.temporada??null;
   if(S.historicoDeportivo.temporada){
    const qs=new URLSearchParams({ligaApiId:String(actual),temporada:String(S.historicoDeportivo.temporada),limite:'150'});
    const p=await api('/historico-deportivo/partidos?'+qs);
    HD_PARTIDOS=p.partidos||[];
   }
  }
  dibujarHistoricoDeportivo();
 }catch(e){
  document.getElementById('contenido').innerHTML=`<div class="vacio"><strong>No se pudo cargar el histórico deportivo</strong><p>${esc(e.message)}</p><p>Verifica que ejecutaste <code>sql/017_historico_deportivo.sql</code>.</p></div>`;
 }
};
