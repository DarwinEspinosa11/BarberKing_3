/**
 * ═══════════════════════════════════════════════════════════════
 * mis_citas.js — Página "Mis Citas" del cliente.
 *
 * Funcionalidades:
 *   1. Cargar y mostrar las citas del cliente (próximas + historial)
 *   2. Tabs para alternar entre "Próximas" y "Historial"
 *   3. Filtrar citas por estado (Pendiente, Confirmada, etc.)
 *   4. Cancelar una cita
 *   5. Modificar una cita (modal)
 *   6. Ver y editar perfil (modal)
 *   7. Cambiar contraseña (modal)
 *
 * API que usa:
 *   GET  /api/barberos                → Lista barberos (para el modal)
 *   GET  /api/servicios               → Lista servicios (para el modal)
 *   GET  /api/citas/mis-citas         → Citas del cliente
 *   POST /api/citas/:id/cancelar      → Cancelar cita
 *   PUT  /api/citas/:id/modificar     → Modificar cita
 *   GET  /api/auth/perfil             → Datos del perfil
 *   PUT  /api/auth/perfil             → Actualizar perfil
 *   POST /api/auth/cambiar-password   → Cambiar contraseña
 * ═══════════════════════════════════════════════════════════════
 */


// ═════════════════════════════════════════════════════════════
// CONSTANTES
// ═════════════════════════════════════════════════════════════

const HORA_APERTURA     = 9;
const HORA_CIERRE       = 19;
const ULTIMO_TURNO_HORA = 18;
const ULTIMO_TURNO_MIN  = 30;


// ═════════════════════════════════════════════════════════════
// ESTADO GLOBAL (cache de datos para no repetir peticiones)
// ═════════════════════════════════════════════════════════════

let todasLasCitas  = [];  // Todas las citas del cliente
let listaBarberos  = [];  // Para poblar el select del modal
let listaServicios = [];  // Para poblar el select del modal


// ═════════════════════════════════════════════════════════════
// UTILIDADES
// ═════════════════════════════════════════════════════════════

/** Convierte "2026-07-18 10:00:00" → "18/07/2026 a las 10:00" */
function formatearFechaHora(fechaHoraStr) {
  try {
    const d     = new Date(fechaHoraStr.replace(" ", "T"));
    const fecha = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    const hora  = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${fecha} a las ${hora}`;
  } catch {
    return fechaHoraStr;
  }
}

/** Muestra un mensaje en un elemento por ID. */
function mostrarMensajeEnElemento(id, texto, tipo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.className = `form-mensaje ${tipo}`;
}

/** Limpia el mensaje de un elemento. */
function limpiarMensaje(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ""; el.className = "form-mensaje"; }
}

/** Muestra/limpia error debajo de un campo de formulario. */
function mostrarErrorCampo(id, msg) {
  const errEl = document.getElementById(`error-${id}`);
  const inpEl = document.getElementById(id);
  if (errEl) errEl.textContent = msg;
  if (inpEl) {
    inpEl.classList.toggle("input--error", !!msg);
    inpEl.setAttribute("aria-invalid", msg ? "true" : "false");
  }
}


// ═════════════════════════════════════════════════════════════
// CARGA INICIAL: Barberos y Servicios (para los selects)
// ═════════════════════════════════════════════════════════════

async function cargarDatosAuxiliares() {
  try {
    const [resBarberos, resServicios] = await Promise.all([
      fetch("/api/barberos",  { credentials: "include" }),
      fetch("/api/servicios", { credentials: "include" }),
    ]);
    listaBarberos  = await resBarberos.json();
    listaServicios = await resServicios.json();
    poblarSelectsModal();
  } catch (err) {
    console.error("Error cargando datos auxiliares:", err);
  }
}

/** Rellena los <select> del modal de edición con barberos y servicios. */
function poblarSelectsModal() {
  const selBarbero  = document.getElementById("editBarbero");
  const selServicio = document.getElementById("editServicio");
  if (!selBarbero || !selServicio) return;

  selBarbero.innerHTML  = '<option value="">— Selecciona un barbero —</option>';
  selServicio.innerHTML = '<option value="">— Selecciona un servicio —</option>';

  listaBarberos.forEach(b => {
    const opt = document.createElement("option");
    opt.value       = b.id_barbero;
    opt.textContent = `${b.nombre} ${b.apellido}`;
    selBarbero.appendChild(opt);
  });

  listaServicios.forEach(s => {
    const opt = document.createElement("option");
    opt.value       = s.id_servicio;
    opt.textContent = `${s.nombre_servicio} — $${parseFloat(s.precio).toFixed(2)} (${s.duracion_min} min)`;
    selServicio.appendChild(opt);
  });
}


// ═════════════════════════════════════════════════════════════
// CARGAR Y SEPARAR CITAS
// ═════════════════════════════════════════════════════════════

/** Pide las citas al servidor y las separa en próximas/historial. */
async function cargarMisCitas() {
  document.getElementById("citasProximasLista").innerHTML  = '<p class="citas-cargando">Cargando...</p>';
  document.getElementById("citasHistorialLista").innerHTML = '<p class="citas-cargando">Cargando...</p>';

  try {
    const res = await fetch("/api/citas/mis-citas", { credentials: "include" });

    // Si la sesión expiró, redirigir al login
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }

    const citas = await res.json();
    if (!res.ok) {
      document.getElementById("citasProximasLista").innerHTML = `<p class="citas-error">${citas.error}</p>`;
      return;
    }

    todasLasCitas = citas;
    separarYRenderizar();

  } catch {
    document.getElementById("citasProximasLista").innerHTML = '<p class="citas-error">Error al cargar las citas.</p>';
  }
}

/**
 * Separa las citas en dos grupos y las renderiza:
 * - Próximas: estado Pendiente/Confirmada Y fecha futura
 * - Historial: estado Finalizada/Cancelada O fecha pasada
 */
function separarYRenderizar() {
  const ahora = new Date();

  const proximas = todasLasCitas.filter(c => {
    const esFutura = new Date(c.fecha_hora.replace(" ", "T")) >= ahora;
    return (c.estado === "Pendiente" || c.estado === "Confirmada") && esFutura;
  });

  const historial = todasLasCitas.filter(c => {
    const esPasada = new Date(c.fecha_hora.replace(" ", "T")) < ahora;
    return c.estado === "Finalizada" || c.estado === "Cancelada" || esPasada;
  });

  renderizarLista(proximas,  "citasProximasLista",  true);
  renderizarLista(historial, "citasHistorialLista", false);
}


// ═════════════════════════════════════════════════════════════
// RENDERIZAR TARJETAS DE CITAS
// ═════════════════════════════════════════════════════════════

/**
 * Genera las tarjetas HTML de citas y las inserta en el contenedor.
 * @param {Array} citas - Lista de citas a mostrar
 * @param {string} contenedorId - ID del elemento donde insertarlas
 * @param {boolean} esCancelable - Si se pueden cancelar/modificar
 */
function renderizarLista(citas, contenedorId, esCancelable) {
  const contenedor = document.getElementById(contenedorId);

  // Si no hay citas, mostrar mensaje vacío

   // <p data-i18n="vacio_Aviso">${esCancelable ? "No tienes citas próximas." : "No hay citas en el historial."}</p> copiar

  if (citas.length === 0) {
    contenedor.innerHTML = `
      <div class="citas-vacio">
        ${esCancelable ? '<p data-i18n="vacio_Aviso">No tienes citas próximas.</p>':'<p data-i18n="vacio_Aviso1">No hay citas en el historial.</p>'}
        ${esCancelable ? '<a href="/#agendar" class="btn btn--outline" style="margin-top:1rem"  data-i18n="vacio_agendar" >Agendar una cita</a>' : ""}
      </div>`;
    return;
  }

  // Generar una tarjeta por cada cita
  contenedor.innerHTML = "";
  citas.forEach(c => {
    const article = document.createElement("article");
    article.className    = "cita-card";
    article.dataset.id   = c.id_cita;
    article.dataset.estado = c.estado;

    // ¿Se puede cancelar/modificar? Solo si es futura y está en Pendiente/Confirmada
    const cancelable  = ["Pendiente", "Confirmada"].includes(c.estado) &&
                        new Date(c.fecha_hora.replace(" ", "T")) >= new Date();
    const modificable = cancelable;

    const barbero = `${c.barbero_nombre || "—"} ${c.barbero_apellido || ""}`.trim();
    const fecha   = formatearFechaHora(c.fecha_hora);

    // Estructura HTML de la tarjeta
    article.innerHTML = `
      <div class="cita-card__header">
        <span class="cita-card__id">Cita #${c.id_cita}</span>
        <span class="badge badge--${c.estado.toLowerCase()}">${c.estado}</span>
      </div>
      <div class="cita-card__body">
        <div class="cita-card__dato">
          <span class="cita-card__etiqueta"><i class="ti-calendar"></i> Fecha y hora</span>
          <span class="cita-card__valor"></span>
        </div>
        <div class="cita-card__dato">
          <span class="cita-card__etiqueta"><i class="ti-scissors"></i> Servicio</span>
          <span class="cita-card__valor"></span>
        </div>
        <div class="cita-card__dato">
          <span class="cita-card__etiqueta"><i class="ti-user"></i> Barbero</span>
          <span class="cita-card__valor"></span>
        </div>
        <div class="cita-card__dato">
          <span class="cita-card__etiqueta"><i class="ti-money"></i> Precio</span>
          <span class="cita-card__valor"></span>
        </div>
        ${c.observaciones ? `
        <div class="cita-card__dato cita-card__dato--full">
          <span class="cita-card__etiqueta"><i class="ti-notepad"></i> Observaciones</span>
          <span class="cita-card__valor"></span>
        </div>` : ""}
      </div>
      ${(modificable || cancelable) ? `
      <div class="cita-card__acciones">
        ${modificable ? `<button class="btn-accion btn-accion--edit" data-accion="editar">Modificar</button>` : ""}
        ${cancelable  ? `<button class="btn-accion btn-accion--danger" data-accion="cancelar">Cancelar</button>` : ""}
      </div>` : ""}
    `;

    // Insertar valores con textContent (seguro contra XSS)
    const valores = article.querySelectorAll(".cita-card__valor");
    valores[0].textContent = fecha;
    valores[1].textContent = c.nombre_servicio;
    valores[2].textContent = barbero;
    valores[3].textContent = `$${parseFloat(c.precio_cobrado).toFixed(2)}`;
    if (c.observaciones && valores[4]) valores[4].textContent = c.observaciones;

    // Eventos de los botones
    article.querySelector('[data-accion="editar"]')?.addEventListener("click", () => abrirModalEditar(c));
    article.querySelector('[data-accion="cancelar"]')?.addEventListener("click", (e) => cancelarCita(c.id_cita, e.currentTarget));

    contenedor.appendChild(article);
  });
}


// ═════════════════════════════════════════════════════════════
// TABS: Próximas / Historial
// ═════════════════════════════════════════════════════════════

function iniciarTabsCitas() {
  const tabProx   = document.getElementById("tabProximas");
  const tabHist   = document.getElementById("tabHistorial");
  const panelProx = document.getElementById("panelProximas");
  const panelHist = document.getElementById("panelHistorial");

  tabProx.addEventListener("click", () => {
    tabProx.classList.add("citas-tab--active");
    tabHist.classList.remove("citas-tab--active");
    panelProx.hidden = false;
    panelHist.hidden = true;
  });

  tabHist.addEventListener("click", () => {
    tabHist.classList.add("citas-tab--active");
    tabProx.classList.remove("citas-tab--active");
    panelHist.hidden = false;
    panelProx.hidden = true;
  });
}


// ═════════════════════════════════════════════════════════════
// FILTROS POR ESTADO (botones "Todas", "Pendiente", etc.)
// ═════════════════════════════════════════════════════════════

function iniciarFiltros() {
  ["filtrosEstadoProximas", "filtrosEstadoHistorial"].forEach(filtroId => {
    document.getElementById(filtroId)?.addEventListener("click", (e) => {
      const btn = e.target.closest(".filtro-btn");
      if (!btn) return;

      // Marcar el botón como activo
      document.querySelectorAll(`#${filtroId} .filtro-btn`).forEach(b => {
        b.classList.remove("filtro-btn--active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("filtro-btn--active");
      btn.setAttribute("aria-pressed", "true");

      // Filtrar y re-renderizar
      const estado     = btn.dataset.estado; // "" = todas
      const esProximas = filtroId === "filtrosEstadoProximas";
      const ahora      = new Date();

      const proximas = todasLasCitas.filter(c => {
        const esFutura = new Date(c.fecha_hora.replace(" ", "T")) >= ahora;
        return (c.estado === "Pendiente" || c.estado === "Confirmada") && esFutura;
      });
      const historial = todasLasCitas.filter(c => {
        const esPasada = new Date(c.fecha_hora.replace(" ", "T")) < ahora;
        return c.estado === "Finalizada" || c.estado === "Cancelada" || esPasada;
      });

      const lista     = esProximas ? proximas : historial;
      const filtradas = estado ? lista.filter(c => c.estado === estado) : lista;
      renderizarLista(filtradas, esProximas ? "citasProximasLista" : "citasHistorialLista", esProximas);
    });
  });
}


// ═════════════════════════════════════════════════════════════
// CANCELAR CITA
// ═════════════════════════════════════════════════════════════

async function cancelarCita(id_cita, btn) {
  if (!confirm(`¿Seguro que quieres cancelar la cita #${id_cita}?`)) return;

  const textoOriginal = btn.textContent;
  btn.textContent = "Cancelando...";
  btn.disabled = true;

  try {
    const res  = await fetch(`/api/citas/${id_cita}/cancelar`, { method: "POST", credentials: "include" });
    const data = await res.json();

    if (res.ok) {
      // Actualizar la cita en el cache local y re-renderizar
      todasLasCitas = todasLasCitas.map(c =>
        c.id_cita === id_cita ? { ...c, estado: "Cancelada" } : c
      );
      separarYRenderizar();
    } else {
      alert(data.error || "No se pudo cancelar.");
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }
  } catch {
    alert("Error de conexión.");
    btn.textContent = textoOriginal;
    btn.disabled = false;
  }
}


// ═════════════════════════════════════════════════════════════
// MODAL: MODIFICAR CITA
// ═════════════════════════════════════════════════════════════

/** Abre el modal de edición con los datos de la cita preseleccionados. */
function abrirModalEditar(cita) {
  const modal = document.getElementById("modalEditarCita");

  // Prellenar campos
  document.getElementById("editCitaId").value   = cita.id_cita;
  document.getElementById("editBarbero").value  = cita.id_barbero || "";
  document.getElementById("editServicio").value = cita.id_servicio || "";

  // Separar fecha y hora
  const fh = new Date(cita.fecha_hora.replace(" ", "T"));
  document.getElementById("editFecha").value = fh.toISOString().split("T")[0];
  document.getElementById("editHora").value  = `${String(fh.getHours()).padStart(2,"0")}:${String(fh.getMinutes()).padStart(2,"0")}`;
  document.getElementById("editObservaciones").value = cita.observaciones || "";

  // Fecha mínima = hoy
  document.getElementById("editFecha").setAttribute("min", new Date().toISOString().split("T")[0]);

  // Limpiar errores previos
  ["editBarbero", "editServicio", "editFecha", "editHora"].forEach(id => mostrarErrorCampo(id, ""));
  limpiarMensaje("editCitaMensaje");

  // Mostrar modal
  modal.hidden = false;
  document.body.classList.add("modal-abierto");
  document.getElementById("editBarbero").focus();
}

function cerrarModalCita() {
  document.getElementById("modalEditarCita").hidden = true;
  document.body.classList.remove("modal-abierto");
}

function iniciarModalEditarCita() {
  // Botones para cerrar
  document.getElementById("btnCerrarModalCita")?.addEventListener("click", cerrarModalCita);
  document.getElementById("btnCancelarModalCita")?.addEventListener("click", cerrarModalCita);

  // Cerrar al clic fuera del modal
  document.getElementById("modalEditarCita")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) cerrarModalCita();
  });

  // Envío del formulario de edición
  document.getElementById("formEditarCita")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    limpiarMensaje("editCitaMensaje");

    const id_cita       = document.getElementById("editCitaId").value;
    const id_barbero    = document.getElementById("editBarbero").value;
    const id_servicio   = document.getElementById("editServicio").value;
    const fecha         = document.getElementById("editFecha").value;
    const hora          = document.getElementById("editHora").value;
    const observaciones = document.getElementById("editObservaciones").value.trim();

    // Validar campos
    let ok = true;
    if (!id_barbero)  { mostrarErrorCampo("editBarbero",  "Selecciona un barbero.");  ok = false; }
    if (!id_servicio) { mostrarErrorCampo("editServicio", "Selecciona un servicio."); ok = false; }
    if (!fecha)       { mostrarErrorCampo("editFecha",    "La fecha es obligatoria."); ok = false; }
    if (!hora)        { mostrarErrorCampo("editHora",     "La hora es obligatoria.");  ok = false; }
    if (!ok) return;

    // Validar horario
    const [hh, mm] = hora.split(":").map(Number);
    if (hh < HORA_APERTURA) {
      mostrarErrorCampo("editHora", `Las citas empiezan a partir de las ${HORA_APERTURA}:00.`);
      return;
    }
    if (hh > ULTIMO_TURNO_HORA || (hh === ULTIMO_TURNO_HORA && mm > ULTIMO_TURNO_MIN)) {
      mostrarErrorCampo("editHora", `Último turno: ${ULTIMO_TURNO_HORA}:${String(ULTIMO_TURNO_MIN).padStart(2,"0")}.`);
      return;
    }

    // Enviar modificación al servidor
    const btn = document.getElementById("btnGuardarCita");
    btn.textContent = "Guardando...";
    btn.classList.add("btn--loading");

    try {
      const res = await fetch(`/api/citas/${id_cita}/modificar`, {
        method:      "PUT",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id_barbero, id_servicio, fecha_hora: `${fecha}T${hora}`, observaciones }),
      });
      const data = await res.json();

      if (res.ok) {
        mostrarMensajeEnElemento("editCitaMensaje", data.mensaje, "success");
        setTimeout(() => { cerrarModalCita(); cargarMisCitas(); }, 1000);
      } else {
        mostrarMensajeEnElemento("editCitaMensaje", data.error || "Error al modificar.", "error");
      }
    } catch {
      mostrarMensajeEnElemento("editCitaMensaje", "Error de conexión.", "error");
    } finally {
      btn.textContent = "Guardar cambios";
      btn.classList.remove("btn--loading");
    }
  });
}


// ═════════════════════════════════════════════════════════════
// MODAL: MI PERFIL (datos + cambio de contraseña)
// ═════════════════════════════════════════════════════════════

async function abrirModalPerfil() {
  const modal = document.getElementById("modalPerfil");
  limpiarMensaje("perfilMensaje");
  limpiarMensaje("passwordMensaje");

  // Cargar datos actuales del servidor
  try {
    const res  = await fetch("/api/auth/perfil", { credentials: "include" });
    const data = await res.json();
    if (res.ok && data.cliente) {
      document.getElementById("perfNombre").value   = data.cliente.nombre;
      document.getElementById("perfApellido").value = data.cliente.apellido;
      document.getElementById("perfTelefono").value = data.cliente.telefono || "";
      document.getElementById("perfEmail").value    = data.cliente.email;
      document.getElementsByClassName("perfil_nombre").value = data.cliente.nombre;
      document.getElementsByClassName("perfil_apellido").value = data.cliente.apellido;
    }
  } catch (err) {
    console.error("Error cargando perfil:", err);
  }

  modal.hidden = false;
  document.body.classList.add("modal-abierto");
  document.getElementById("perfNombre").focus();
}

function cerrarModalPerfil() {
  document.getElementById("modalPerfil").hidden = true;
  document.body.classList.remove("modal-abierto");
}

function iniciarModalPerfil() {
  // Abrir/cerrar modal
  document.getElementById("btnVerPerfil")?.addEventListener("click", abrirModalPerfil);
  document.getElementById("btnCerrarModalPerfil")?.addEventListener("click", cerrarModalPerfil);
  document.getElementById("modalPerfil")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) cerrarModalPerfil();
  });

  // ── Tabs internas: "Mis Datos" / "Contraseña" ──
  const tabDatos      = document.getElementById("tabDatos");
  const tabPassword   = document.getElementById("tabPassword");
  const panelDatos    = document.getElementById("panelDatos");
  const panelPassword = document.getElementById("panelPassword");

  tabDatos?.addEventListener("click", () => {
    tabDatos.classList.add("modal-tab--active");
    tabPassword.classList.remove("modal-tab--active");
    panelDatos.hidden = false;
    panelPassword.hidden = true;
  });

  tabPassword?.addEventListener("click", () => {
    tabPassword.classList.add("modal-tab--active");
    tabDatos.classList.remove("modal-tab--active");
    panelPassword.hidden = false;
    panelDatos.hidden = true;
    document.getElementById("formPassword").reset();
    limpiarMensaje("passwordMensaje");
  });

  // ── Formulario: Editar datos personales ──
  document.getElementById("formPerfil")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    limpiarMensaje("perfilMensaje");

    const nombre   = document.getElementById("perfNombre").value.trim();
    const apellido = document.getElementById("perfApellido").value.trim();
    const telefono = document.getElementById("perfTelefono").value.trim();

    // Validar
    let ok = true;
    if (!nombre || nombre.length < 2)   { mostrarErrorCampo("perfNombre",   "Mínimo 2 caracteres."); ok = false; }
    if (!apellido || apellido.length < 2){ mostrarErrorCampo("perfApellido", "Mínimo 2 caracteres."); ok = false; }
    if (!telefono)                       { mostrarErrorCampo("perfTelefono", "Obligatorio."); ok = false; }
    if (!ok) return;
    ["perfNombre", "perfApellido", "perfTelefono"].forEach(id => mostrarErrorCampo(id, ""));

    const btn = document.getElementById("btnGuardarPerfil");
    btn.textContent = "Guardando...";
    btn.classList.add("btn--loading");

    try {
      const res  = await fetch("/api/auth/perfil", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ nombre, apellido, telefono }),
      });
      const data = await res.json();
      if (res.ok) {
        mostrarMensajeEnElemento("perfilMensaje", data.mensaje, "success");
        actualizarHeaderSesion(); // Actualizar el "Hola, nombre" del header
      } else {
        mostrarMensajeEnElemento("perfilMensaje", data.error, "error");
      }
    } catch {
      mostrarMensajeEnElemento("perfilMensaje", "Error de conexión.", "error");
    } finally {
      btn.textContent = "Guardar cambios";
      btn.classList.remove("btn--loading");
    }
  });

  // ── Formulario: Cambiar contraseña ──
  document.getElementById("formPassword")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    limpiarMensaje("passwordMensaje");

    const pwdActual    = document.getElementById("pwdActual").value;
    const pwdNueva     = document.getElementById("pwdNueva").value;
    const pwdConfirmar = document.getElementById("pwdConfirmar").value;

    // Validar
    let ok = true;
    if (!pwdActual)                    { mostrarErrorCampo("pwdActual",    "Obligatoria."); ok = false; }
    if (pwdNueva.length < 6)           { mostrarErrorCampo("pwdNueva",     "Mínimo 6 caracteres."); ok = false; }
    if (pwdNueva !== pwdConfirmar)     { mostrarErrorCampo("pwdConfirmar", "No coinciden."); ok = false; }
    if (!ok) return;
    ["pwdActual", "pwdNueva", "pwdConfirmar"].forEach(id => mostrarErrorCampo(id, ""));

    const btn = document.getElementById("btnGuardarPassword");
    btn.textContent = "Cambiando...";
    btn.classList.add("btn--loading");

    try {
      const res = await fetch("/api/auth/cambiar-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pwd_actual: pwdActual, pwd_nueva: pwdNueva, pwd_confirmar: pwdConfirmar }),
      });
      const data = await res.json();
      if (res.ok) {
        mostrarMensajeEnElemento("passwordMensaje", data.mensaje, "success");
        document.getElementById("formPassword").reset();
      } else {
        mostrarMensajeEnElemento("passwordMensaje", data.error, "error");
      }
    } catch {
      mostrarMensajeEnElemento("passwordMensaje", "Error de conexión.", "error");
    } finally {
      btn.textContent = "Cambiar contraseña";
      btn.classList.remove("btn--loading");
    }
  });
}


// ═════════════════════════════════════════════════════════════
// TECLA ESCAPE: Cierra cualquier modal abierto
// ═════════════════════════════════════════════════════════════

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!document.getElementById("modalEditarCita")?.hidden) cerrarModalCita();
  if (!document.getElementById("modalPerfil")?.hidden) cerrarModalPerfil();
});


// ═════════════════════════════════════════════════════════════
// INICIALIZACIÓN (al cargar la página)
// ═════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  cargarDatosAuxiliares();   // Cargar barberos y servicios para los selects
  cargarMisCitas();          // Cargar las citas del cliente
  iniciarTabsCitas();        // Activar tabs Próximas/Historial
  iniciarFiltros();          // Activar filtros por estado
  iniciarModalEditarCita();  // Configurar modal de edición
  iniciarModalPerfil();      // Configurar modal de perfil
});
