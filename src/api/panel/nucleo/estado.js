/* ===== Estado de la sesión en el navegador ===== */

const S = {
  token:null, permisos:new Set(), alias:'', seccion:'resumen',
  datos:{}, tiene2fa:false, tokenRecuperacion:null, botonPulsado:null,
};

/* ============================================================
   Comunicación con la API
   ============================================================ */
