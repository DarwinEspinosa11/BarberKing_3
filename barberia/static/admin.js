/**
 * admin.js — Panel de administración BarberKing.
 * Secciones: Resumen, Citas (con filtros + crear), Barberos, Servicios, Clientes (búsqueda + historial).
 */

const SECCIONES = ["resumen", "citas", "barberos", "servicios", "clientes"];
let todosLosServicios = [];
let todosLosBarberos  = [];

// ── Utilidades ────────────────────────────────────────────────

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

async function apiFetch(url, opts = {}) {
  return fetch(url, { credentials: "include", ...opts });
}

/** Toast en lugar de alert/confirm nativos */
function toast(texto, tipo = "success", duracion = 3500) {
  const el = document.getElementById("adminToast");
  if (!el) return;
  el.textContent = texto;
  el.className   = `admin-toast admin-toast--${tipo}`;
  el.hidden      = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, duracion);
}

function setMensaje(id, texto, tipo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.className   = `form-mensaje ${tipo}`;
  if (tipo === "success") setTimeout(() => { el.textContent = ""; el.className = "form-mensaje"; }, 4000);
}

/** Confirmar con Promise (evita alert nativo) */
function confirmar(msg) {
  return new Promise(resolve => resolve(window.confirm(msg)));
}

// ── Navegación entre secciones ────────────────────────────────

function mostrarSeccion(nombre) {
  SECCIONES.forEach(s => {
    document.getElementById(`seccion${cap(s)}`)?.classList.add("admin-seccion--oculta");
  });
  document.getElementById(`seccion${cap(nombre)}`)?.classList.remove("admin-seccion--oculta");
  document.querySelectorAll(".admin-nav-btn").forEach(btn => {
    btn.classList.toggle("admin-nav-btn--active", btn.dataset.seccion === nombre);
  });
  const loaders = {
    resumen:   cargarResumen,
    citas:     () => cargarCitas({}),
    barberos:  cargarBarberos,
    servicios: cargarServicios,
    clientes:  () => cargarClientes(""),
  };
  loaders[nombre]?.();
}

// ── RESUMEN ───────────────────────────────────────────────────

async function cargarResumen() {
  try {
    const res  = await apiFetch("/admin/api/resumen");
    const d    = await res.json();

    document.getElementById("resumenCards").innerHTML = `
      <div class="admin-card"><p class="admin-card__label">Citas hoy</p><p class="admin-card__valor">${d.citas_hoy}</p></div>
      <div class="admin-card"><p class="admin-card__label">Total citas</p><p class="admin-card__valor">${d.citas_total}</p></div>
      <div class="admin-card"><p class="admin-card__label">Pendientes</p><p class="admin-card__valor admin-card__valor--warn">${d.citas_pendientes}</p></div>
      <div class="admin-card"><p class="admin-card__label">Clientes</p><p class="admin-card__valor">${d.total_clientes}</p></div>
      <div class="admin-card"><p class="admin-card__label">Barberos activos</p><p class="admin-card__valor">${d.total_barberos}</p></div>
      <div class="admin-card"><p class="admin-card__label">Servicios</p><p class="admin-card__valor">${d.total_servicios}</p></div>
      <div class="admin-card admin-card--gold"><p class="admin-card__label">Ingresos este mes</p><p class="admin-card__valor">$${parseFloat(d.ingresos_mes).toFixed(2)}</p></div>
    `;

    // Citas del día
    const tbody = document.getElementById("citasHoyBody");
    if (!d.citas_hoy_lista?.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-tabla__cargando">No hay citas para hoy.</td></tr>';
    } else {
      tbody.innerHTML = d.citas_hoy_lista.map(c => {
        const hora = new Date(c.fecha_hora.replace(" ","T")).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"});
        return `<tr>
          <td>#${c.id_cita}</td>
          <td><strong>${hora}</strong></td>
          <td>${c.cliente} ${c.cliente_apellido}</td>
          <td>${c.barbero}</td>
          <td>${c.nombre_servicio}</td>
          <td><span class="badge badge--${c.estado.toLowerCase()}">${c.estado}</span></td>
        </tr>`;
      }).join("");
    }

    // Top servicios (barras simples)
    const chart = document.getElementById("topServiciosChart");
    if (d.top_servicios?.length) {
      const max = d.top_servicios[0].total;
      chart.innerHTML = d.top_servicios.map(s => `
        <div class="admin-chart__fila">
          <span class="admin-chart__label">${s.nombre_servicio}</span>
          <div class="admin-chart__barra-wrap">
            <div class="admin-chart__barra" style="width:${Math.round((s.total/max)*100)}%"></div>
          </div>
          <span class="admin-chart__num">${s.total}</span>
        </div>`).join("");
    } else {
      chart.innerHTML = '<p style="color:#666;font-size:0.85rem">Sin datos todavía.</p>';
    }
  } catch (err) { console.error("Error resumen:", err); }
}

// ── CITAS ─────────────────────────────────────────────────────

async function cargarCitas(filtros = {}) {
  const tbody = document.getElementById("citasBody");
  tbody.innerHTML = '<tr><td colspan="9" class="admin-tabla__cargando">Cargando...</td></tr>';

  const params = new URLSearchParams();
  if (filtros.fecha_desde) params.set("fecha_desde", filtros.fecha_desde);
  if (filtros.fecha_hasta) params.set("fecha_hasta", filtros.fecha_hasta);
  if (filtros.id_barbero)  params.set("id_barbero",  filtros.id_barbero);
  if (filtros.id_servicio) params.set("id_servicio", filtros.id_servicio);
  if (filtros.estado)      params.set("estado",      filtros.estado);

  try {
    const res   = await apiFetch(`/admin/api/citas?${params}`);
    const citas = await res.json();

    if (!citas.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="admin-tabla__cargando">No hay citas con esos filtros.</td></tr>';
      return;
    }

    const ESTADOS = ["Pendiente","Confirmada","Finalizada","Cancelada"];
    tbody.innerHTML = citas.map(c => {
      const opts = ESTADOS.map(e =>
        `<option value="${e}" ${c.estado===e?"selected":""}>${e}</option>`).join("");
      const obs = c.observaciones
        ? `<small style="color:#d97706;display:block;margin-top:2px;font-style:italic">Obs: ${c.observaciones}</small>` : "";
      return `<tr>
        <td>#${c.id_cita}</td>
        <td><div><strong>${c.cliente||"—"} ${c.cliente_apellido||""}</strong></div>${obs}</td>
        <td>${c.telefono||"—"}</td>
        <td>${c.fecha_hora}</td>
        <td>${c.nombre_servicio}</td>
        <td>$${c.precio_cobrado.toFixed(2)}</td>
        <td>${c.barbero?`${c.barbero} ${c.barbero_apellido}`:"—"}</td>
        <td>
          <select class="select-estado" aria-label="Cambiar estado cita #${c.id_cita}"
            onchange="cambiarEstadoCita(${c.id_cita},this.value,this)">${opts}</select>
        </td>
        <td>
          <button class="btn-accion btn-accion--danger"
            onclick="eliminarCita(${c.id_cita},this)">Eliminar</button>
        </td>
      </tr>`;
    }).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="9" class="admin-tabla__cargando">Error al cargar.</td></tr>';
  }
}

async function cambiarEstadoCita(id, estado, select) {
  select.disabled = true;
  try {
    const res = await apiFetch(`/admin/api/citas/${id}/estado`, {
      method:"PUT", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({estado})
    });
    if (res.ok) { toast(`Cita #${id} → ${estado}`); }
    else { const d = await res.json(); toast(d.error||"Error", "error"); select.disabled = false; }
  } catch { toast("Error de conexión","error"); select.disabled = false; }
}

async function eliminarCita(id, btn) {
  if (!await confirmar(`¿Eliminar la cita #${id}? Esta acción no se puede deshacer.`)) return;
  btn.textContent = "..."; btn.disabled = true;
  try {
    const res = await apiFetch(`/admin/api/citas/${id}`, {method:"DELETE"});
    if (res.ok) { btn.closest("tr").remove(); toast(`Cita #${id} eliminada`); }
    else { const d = await res.json(); toast(d.error||"Error","error"); btn.textContent="Eliminar"; btn.disabled=false; }
  } catch { toast("Error de conexión","error"); btn.textContent="Eliminar"; btn.disabled=false; }
}

function iniciarFiltrosCitas() {
  document.getElementById("btnAplicarFiltros")?.addEventListener("click", () => {
    cargarCitas({
      fecha_desde: document.getElementById("filtroFechaDesde").value,
      fecha_hasta: document.getElementById("filtroFechaHasta").value,
      id_barbero:  document.getElementById("filtroBarbero").value,
      id_servicio: document.getElementById("filtroServicio").value,
      estado:      document.getElementById("filtroEstado").value,
    });
  });
  document.getElementById("btnLimpiarFiltros")?.addEventListener("click", () => {
    ["filtroFechaDesde","filtroFechaHasta","filtroBarbero","filtroServicio","filtroEstado"]
      .forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
    cargarCitas({});
  });
}

function poblarFiltrosBarberoServicio() {
  const selB = document.getElementById("filtroBarbero");
  const selS = document.getElementById("filtroServicio");
  if (selB) todosLosBarberos.forEach(b => {
    const o = document.createElement("option");
    o.value = b.id_barbero; o.textContent = `${b.nombre} ${b.apellido}`;
    selB.appendChild(o);
  });
  if (selS) todosLosServicios.forEach(s => {
    const o = document.createElement("option");
    o.value = s.id_servicio; o.textContent = s.nombre_servicio;
    selS.appendChild(o);
  });
  // También para nueva cita
  const ncB = document.getElementById("ncBarbero");
  const ncS = document.getElementById("ncServicio");
  if (ncB) todosLosBarberos.forEach(b => {
    const o = document.createElement("option");
    o.value = b.id_barbero; o.textContent = `${b.nombre} ${b.apellido}`;
    ncB.appendChild(o);
  });
  if (ncS) todosLosServicios.forEach(s => {
    const o = document.createElement("option");
    o.value = s.id_servicio; o.textContent = `${s.nombre_servicio} ($${parseFloat(s.precio).toFixed(2)})`;
    ncS.appendChild(o);
  });
}

function iniciarNuevaCita() {
  const panel = document.getElementById("formNuevaCitaPanel");
  document.getElementById("btnNuevaCita")?.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
  document.getElementById("btnCancelarNuevaCita")?.addEventListener("click", () => {
    panel.style.display = "none";
  });

  document.getElementById("formNuevaCita")?.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = e.submitter;
    btn.textContent = "Creando..."; btn.classList.add("btn--loading");
    try {
      const res = await apiFetch("/admin/api/citas", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          id_cliente:   parseInt(document.getElementById("ncClienteId").value),
          id_barbero:   document.getElementById("ncBarbero").value,
          id_servicio:  document.getElementById("ncServicio").value,
          fecha_hora:   document.getElementById("ncFechaHora").value,
          observaciones: document.getElementById("ncObservaciones").value.trim(),
        })
      });
      const d = await res.json();
      if (res.ok) {
        setMensaje("nuevaCitaMensaje", d.mensaje, "success");
        document.getElementById("formNuevaCita").reset();
        cargarCitas({});
      } else {
        setMensaje("nuevaCitaMensaje", d.error||"Error al crear", "error");
      }
    } catch { setMensaje("nuevaCitaMensaje","Error de conexión","error"); }
    finally { btn.textContent="Crear Cita"; btn.classList.remove("btn--loading"); }
  });
}

// ── BARBEROS ──────────────────────────────────────────────────

async function cargarBarberos() {
  const tbody = document.getElementById("barberosBody");
  tbody.innerHTML = '<tr><td colspan="7" class="admin-tabla__cargando">Cargando...</td></tr>';
  try {
    const [resServ, resBarberos] = await Promise.all([
      apiFetch("/admin/api/servicios"),
      apiFetch("/admin/api/barberos"),
    ]);
    todosLosServicios = await resServ.json();
    const barberos    = await resBarberos.json();
    renderServiciosCheckboxList();

    if (!barberos.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="admin-tabla__cargando">No hay barberos.</td></tr>'; return;
    }
    tbody.innerHTML = barberos.map(b => {
      const esp  = b.servicios.map(s=>s.nombre_servicio).join(", ") || "—";
      const foto = b.foto_url
        ? `<img src="${b.foto_url}" style="width:44px;height:44px;border-radius:50%;object-fit:cover" alt="${b.nombre}" />`
        : `<div style="width:44px;height:44px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;font-size:1.2rem">👤</div>`;
      return `<tr>
        <td>#${b.id_barbero}</td>
        <td>${foto}</td>
        <td><strong>${b.nombre} ${b.apellido}</strong></td>
        <td>${b.telefono||"—"}</td>
        <td style="max-width:180px;font-size:0.82rem;color:#666">${esp}</td>
        <td><span class="badge badge--${b.activo?"activo":"inactivo"}">${b.activo?"Activo":"Inactivo"}</span></td>
        <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn-accion" onclick='abrirEditarBarbero(${JSON.stringify(b)})'>Editar</button>
          <button class="btn-accion btn-accion--danger"
            onclick="toggleBarbero(${b.id_barbero},${b.activo},this)">${b.activo?"Desactivar":"Activar"}</button>
          <button class="btn-accion btn-accion--danger" style="background:#dc2626"
            onclick="eliminarBarbero(${b.id_barbero},this)">Eliminar</button>
        </td>
      </tr>`;
    }).join("");
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" class="admin-tabla__cargando">Error al cargar.</td></tr>';
  }
}

function renderServiciosCheckboxList() {
  const c = document.getElementById("barberoServiciosCheckboxContainer");
  if (!c) return;
  
  if (!todosLosServicios || todosLosServicios.length === 0) {
    c.innerHTML = '<p style="color:#666;font-size:0.9rem">No hay especialidades disponibles</p>';
    return;
  }
  
  c.innerHTML = todosLosServicios.map(s => `
    <label class="admin-checkbox-label">
      <input type="checkbox" name="espServicios" value="${s.id_servicio}" />
      <span>${s.nombre_servicio}</span>
    </label>`).join("");
}

async function abrirFormBarbero(limpiar = true) {
  const p = document.getElementById("formBarberoPanel");
  
  // ASEGURAR que los servicios estén cargados antes de renderizar checkboxes
  if (!todosLosServicios || todosLosServicios.length === 0) {
    try {
      const res = await apiFetch("/admin/api/servicios");
      todosLosServicios = await res.json();
    } catch (error) {
      console.error("Error cargando servicios:", error);
      toast("Error al cargar especialidades", "error");
      return;
    }
  }
  
  renderServiciosCheckboxList();
  
  p.style.display = "block";
  p.scrollIntoView({behavior:"smooth",block:"start"});
  if (limpiar) {
    document.getElementById("formBarberoTitulo").textContent = "Nuevo Barbero";
    document.getElementById("formBarbero").reset();
    document.getElementById("barberoId").value = "";
    document.querySelectorAll('input[name="espServicios"]').forEach(cb => cb.checked = false);
  }
}

async function abrirEditarBarbero(b) {
  await abrirFormBarbero(false);
  document.getElementById("formBarberoTitulo").textContent = "Editar Barbero";
  document.getElementById("barberoId").value       = b.id_barbero;
  document.getElementById("barberoNombre").value   = b.nombre;
  document.getElementById("barberoApellido").value = b.apellido;
  document.getElementById("barberoTelefono").value = b.telefono || "";
  document.getElementById("barberoFoto").value     = b.foto_url || "";
  const ids = b.servicios.map(s=>s.id_servicio);
  document.querySelectorAll('input[name="espServicios"]').forEach(cb => {
    cb.checked = ids.includes(parseInt(cb.value));
  });
}

document.getElementById("formBarbero")?.addEventListener("submit", async e => {
  e.preventDefault();
  const id       = document.getElementById("barberoId").value;
  const servicios = [...document.querySelectorAll('input[name="espServicios"]:checked')].map(cb=>parseInt(cb.value));
  const datos = {
    nombre:   document.getElementById("barberoNombre").value.trim(),
    apellido: document.getElementById("barberoApellido").value.trim(),
    telefono: document.getElementById("barberoTelefono").value.trim(),
    foto_url: document.getElementById("barberoFoto").value.trim(),
    servicios,
  };
  
  const url = id ? `/admin/api/barberos/${id}` : "/admin/api/barberos";
  try {
    const res = await apiFetch(url, {method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(datos)});
    const d   = await res.json();
    if (res.ok) { setMensaje("barberoMensaje",d.mensaje,"success"); document.getElementById("formBarberoPanel").style.display="none"; cargarBarberos(); }
    else        { setMensaje("barberoMensaje",d.error,"error"); }
  } catch { setMensaje("barberoMensaje","Error de conexión","error"); }
});

async function toggleBarbero(id, activo, btn) {
  if (!await confirmar(`¿${activo?"Desactivar":"Activar"} al barbero #${id}?`)) return;
  try {
    const res = await apiFetch(`/admin/api/barberos/${id}/activo`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({activo:!activo})});
    if (res.ok) { toast(`Barbero #${id} ${activo?"desactivado":"activado"}`); cargarBarberos(); }
    else toast("Error al cambiar estado","error");
  } catch { toast("Error de conexión","error"); }
}

async function eliminarBarbero(id, btn) {
  if (!await confirmar(`¿Eliminar permanentemente al barbero #${id}? Esta acción no se puede deshacer. ADVERTENCIA: Si tiene citas asociadas, la eliminación fallará.`)) return;
  btn.textContent = "Eliminando...";
  btn.disabled = true;
  try {
    const res = await apiFetch(`/admin/api/barberos/${id}`, {method: "DELETE"});
    const d = await res.json();
    if (res.ok) {
      btn.closest("tr").remove();
      toast(`Barbero #${id} eliminado exitosamente`);
    } else {
      toast(d.error || "Error al eliminar barbero", "error");
      btn.textContent = "Eliminar";
      btn.disabled = false;
    }
  } catch {
    toast("Error de conexión", "error");
    btn.textContent = "Eliminar";
    btn.disabled = false;
  }
}

// ── SERVICIOS ─────────────────────────────────────────────────

async function cargarServicios() {
  const tbody = document.getElementById("serviciosBody");
  tbody.innerHTML = '<tr><td colspan="6" class="admin-tabla__cargando">Cargando...</td></tr>';
  try {
    const res       = await apiFetch("/admin/api/servicios");
    todosLosServicios = await res.json();
    if (!todosLosServicios.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-tabla__cargando">No hay servicios.</td></tr>'; return;
    }
    tbody.innerHTML = todosLosServicios.map(s => `
      <tr>
        <td>#${s.id_servicio}</td>
        <td><strong>${s.nombre_servicio}</strong></td>
        <td style="max-width:220px;font-size:0.82rem;color:#666">${s.descripcion||"—"}</td>
        <td>$${s.precio.toFixed(2)}</td>
        <td>${s.duracion_min} min</td>
        <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn-accion" onclick='abrirEditarServicio(${JSON.stringify(s)})'>Editar</button>
          <button class="btn-accion btn-accion--danger" onclick="eliminarServicio(${s.id_servicio},this)">Eliminar</button>
        </td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-tabla__cargando">Error al cargar.</td></tr>';
  }
}

function abrirFormServicio(limpiar=true) {
  const p = document.getElementById("formServicioPanel");
  p.style.display = "block";
  p.scrollIntoView({behavior:"smooth",block:"start"});
  if (limpiar) {
    document.getElementById("formServicioTitulo").textContent = "Nuevo Servicio";
    document.getElementById("formServicio").reset();
    document.getElementById("servicioId").value = "";
  }
}

function abrirEditarServicio(s) {
  abrirFormServicio(false);
  document.getElementById("formServicioTitulo").textContent  = "Editar Servicio";
  document.getElementById("servicioId").value          = s.id_servicio;
  document.getElementById("servicioNombre").value      = s.nombre_servicio;
  document.getElementById("servicioPrecio").value      = s.precio;
  document.getElementById("servicioDuracion").value    = s.duracion_min;
  document.getElementById("servicioDescripcion").value = s.descripcion || "";
}

document.getElementById("formServicio")?.addEventListener("submit", async e => {
  e.preventDefault();
  const id    = document.getElementById("servicioId").value;
  const datos = {
    nombre_servicio: document.getElementById("servicioNombre").value.trim(),
    precio:          parseFloat(document.getElementById("servicioPrecio").value),
    duracion_min:    parseInt(document.getElementById("servicioDuracion").value),
    descripcion:     document.getElementById("servicioDescripcion").value.trim(),
  };
  const url = id ? `/admin/api/servicios/${id}` : "/admin/api/servicios";
  try {
    const res = await apiFetch(url,{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(datos)});
    const d   = await res.json();
    if (res.ok) { setMensaje("servicioMensaje",d.mensaje,"success"); document.getElementById("formServicioPanel").style.display="none"; cargarServicios(); }
    else        { setMensaje("servicioMensaje",d.error,"error"); }
  } catch { setMensaje("servicioMensaje","Error de conexión","error"); }
});

async function eliminarServicio(id, btn) {
  if (!await confirmar(`¿Eliminar el servicio #${id}? Si tiene citas asociadas no se podrá eliminar.`)) return;
  btn.textContent="..."; btn.disabled=true;
  try {
    const res = await apiFetch(`/admin/api/servicios/${id}`,{method:"DELETE"});
    if (res.ok) { btn.closest("tr").remove(); toast("Servicio eliminado"); }
    else { const d=await res.json(); toast(d.error||"Error","error"); btn.textContent="Eliminar"; btn.disabled=false; }
  } catch { toast("Error de conexión","error"); btn.textContent="Eliminar"; btn.disabled=false; }
}

// ── CLIENTES ──────────────────────────────────────────────────

async function cargarClientes(q = "") {
  const tbody = document.getElementById("clientesBody");
  tbody.innerHTML = '<tr><td colspan="7" class="admin-tabla__cargando">Cargando...</td></tr>';
  try {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    const res    = await apiFetch(`/admin/api/clientes${params}`);
    const lista  = await res.json();
    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="admin-tabla__cargando">No se encontraron clientes.</td></tr>'; return;
    }
    tbody.innerHTML = lista.map(c => `
      <tr>
        <td>#${c.id_cliente}</td>
        <td><strong>${c.nombre} ${c.apellido}</strong></td>
        <td>${c.email}</td>
        <td>${c.telefono||"—"}</td>
        <td>${c.total_citas}</td>
        <td>${c.fecha_registro.slice(0,10)}</td>
        <td><button class="btn-accion btn-accion--edit" onclick="verHistorialCliente(${c.id_cliente},'${c.nombre} ${c.apellido}')">Ver citas</button></td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="admin-tabla__cargando">Error al cargar.</td></tr>';
  }
}

async function verHistorialCliente(id, nombre) {
  const modal   = document.getElementById("modalHistorialCliente");
  const content = document.getElementById("historialClienteContent");
  document.getElementById("tituloHistorialCliente").textContent = `Citas de ${nombre}`;
  content.innerHTML = '<p style="color:#666;padding:1rem">Cargando...</p>';
  modal.hidden = false;
  document.body.classList.add("modal-abierto");
  try {
    const res   = await apiFetch(`/admin/api/clientes/${id}/citas`);
    const citas = await res.json();
    if (!citas.length) { content.innerHTML = '<p style="color:#666;padding:1rem">Este cliente no tiene citas.</p>'; return; }
    content.innerHTML = `
      <table class="admin-tabla" style="margin-top:0.5rem">
        <thead><tr><th>#</th><th>Fecha</th><th>Estado</th><th>Barbero</th><th>Servicio</th><th>Precio</th></tr></thead>
        <tbody>${citas.map(c=>`
          <tr>
            <td>#${c.id_cita}</td>
            <td>${c.fecha_hora}</td>
            <td><span class="badge badge--${c.estado.toLowerCase()}">${c.estado}</span></td>
            <td>${c.barbero}</td>
            <td>${c.nombre_servicio}</td>
            <td>$${c.precio_cobrado.toFixed(2)}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
  } catch { content.innerHTML = '<p style="color:#e57373;padding:1rem">Error al cargar historial.</p>'; }
}

document.getElementById("btnCerrarHistorial")?.addEventListener("click", () => {
  document.getElementById("modalHistorialCliente").hidden = true;
  document.body.classList.remove("modal-abierto");
});
document.getElementById("modalHistorialCliente")?.addEventListener("click", e => {
  if (e.target === e.currentTarget) {
    e.currentTarget.hidden = true;
    document.body.classList.remove("modal-abierto");
  }
});

// ── Cerrar sesión ─────────────────────────────────────────────

document.getElementById("btnLogoutAdmin")?.addEventListener("click", async () => {
  if (!await confirmar("¿Cerrar sesión del panel de administración?")) return;
  await fetch("/admin/logout", {method:"POST", credentials:"include"});
  window.location.href = "/admin/login";
});

// ── Inicialización ────────────────────────────────────────────

async function cargarDatosGlobales() {
  try {
    const [resB, resS] = await Promise.all([
      apiFetch("/admin/api/barberos"),
      apiFetch("/admin/api/servicios"),
    ]);
    todosLosBarberos  = await resB.json();
    todosLosServicios = await resS.json();
    poblarFiltrosBarberoServicio();
  } catch (err) { console.error("Error cargando datos globales:", err); }
}

document.addEventListener("DOMContentLoaded", () => {
  // Navegación
  document.querySelectorAll(".admin-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => mostrarSeccion(btn.dataset.seccion));
  });

  // Barberos
  document.getElementById("btnNuevoBarbero")?.addEventListener("click", () => abrirFormBarbero(true));
  document.getElementById("btnCancelarBarbero")?.addEventListener("click", () => {
    document.getElementById("formBarberoPanel").style.display = "none";
  });

  // Servicios
  document.getElementById("btnNuevoServicio")?.addEventListener("click", () => abrirFormServicio(true));
  document.getElementById("btnCancelarServicio")?.addEventListener("click", () => {
    document.getElementById("formServicioPanel").style.display = "none";
  });

  // Clientes — búsqueda
  document.getElementById("btnBuscarCliente")?.addEventListener("click", () => {
    cargarClientes(document.getElementById("buscarCliente").value.trim());
  });
  document.getElementById("btnLimpiarBusqueda")?.addEventListener("click", () => {
    document.getElementById("buscarCliente").value = "";
    cargarClientes("");
  });
  document.getElementById("buscarCliente")?.addEventListener("keydown", e => {
    if (e.key === "Enter") cargarClientes(e.target.value.trim());
  });

  // Escape cierra modales
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const hist = document.getElementById("modalHistorialCliente");
    if (hist && !hist.hidden) { hist.hidden = true; document.body.classList.remove("modal-abierto"); }
  });

  // Iniciar todo
  iniciarFiltrosCitas();
  iniciarNuevaCita();
  cargarDatosGlobales();
  cargarResumen();
});
