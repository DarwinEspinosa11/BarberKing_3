/**
 * ═══════════════════════════════════════════════════════════════
 * main.js — Lógica de la página principal (index.html).
 *
 * Se encarga de:
 *   1. Cargar y mostrar la lista de SERVICIOS (cards + select)
 *   2. Cargar y mostrar la lista de BARBEROS (cards + select)
 *   3. Detectar si el usuario está logueado:
 *      - Sí → mostrar formulario de agendar cita
 *      - No → mostrar banner "Inicia sesión para reservar"
 *   4. Validar y enviar el formulario de nueva cita
 *   5. Menú hamburguesa para móvil
 *
 * API que usa:
 *   GET  /api/servicios  → Lista de servicios (público)
 *   GET  /api/barberos   → Lista de barberos (público)
 *   POST /api/citas      → Crear cita (requiere sesión)
 * ═══════════════════════════════════════════════════════════════
 */


// ═════════════════════════════════════════════════════════════
// CONSTANTES: Horario de la barbería
// ═════════════════════════════════════════════════════════════

const HORA_APERTURA     = 9;   // Abre a las 9:00
const HORA_CIERRE       = 19;  // Cierra a las 19:00
const ULTIMO_TURNO_HORA = 18;  // Último turno: 18:30
const ULTIMO_TURNO_MIN  = 30;

// Iconos decorativos para las tarjetas de servicios
const ICONOS_SERVICIOS = {
  "corte clásico":   "✂",
  "afeitado navaja": "🪒",
  "corte + barba":   "💈",
  "tinte":           "🎨",
  "degradado fade":  "⚡",
  "corte infantil":  "👦",
};

/** Busca un icono que coincida con el nombre del servicio. */
function obtenerIcono(nombreServicio) {
  const nombre = nombreServicio.toLowerCase();
  for (const [clave, icono] of Object.entries(ICONOS_SERVICIOS)) {
    if (nombre.includes(clave)) return icono;
  }
  return "✂"; // Icono por defecto
}


// ═════════════════════════════════════════════════════════════
// CARGAR SERVICIOS (público, no necesita sesión)
// ═════════════════════════════════════════════════════════════

async function cargarServicios() {
  try {
    const res  = await fetch("/api/servicios");
    const data = await res.json();

    // 1. Renderizar las tarjetas visuales
    const grid = document.getElementById("serviciosGrid");
    if (grid) {
      grid.innerHTML = "";
      data.forEach(s => {
        const card = document.createElement("article");
        card.className = "servicio-card";
        card.setAttribute("role", "listitem");

        // Estructura HTML de la tarjeta (los datos se insertan con textContent por seguridad)
        card.innerHTML = `
          <span class="servicio-card__icon" aria-hidden="true">${obtenerIcono(s.nombre_servicio)}</span>
          <h3></h3>
          <p></p>
          <span class="servicio-card__precio"></span>
          <span class="servicio-card__duracion"></span>
        `;
        card.querySelector("h3").textContent = s.nombre_servicio;
        card.querySelector("p").textContent  = s.descripcion || "";
        card.querySelector(".servicio-card__precio").textContent   = `$${parseFloat(s.precio).toFixed(2)}`;
        card.querySelector(".servicio-card__duracion").textContent = `${s.duracion_min} min`;
        grid.appendChild(card);
      });
    }

    // 2. Poblar el <select> del formulario de agendar
    const select = document.getElementById("servicio");
    if (select) {
      select.innerHTML = '<option value="">— Selecciona un servicio —</option>';
      data.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id_servicio;
        opt.textContent = `${s.nombre_servicio} — $${parseFloat(s.precio).toFixed(2)} (${s.duracion_min} min)`;
        select.appendChild(opt);
      });
    }

  } catch (err) {
    console.error("Error cargando servicios:", err);
    const grid = document.getElementById("serviciosGrid");
    if (grid) grid.innerHTML = '<p style="color:#888;padding:2rem">No se pudieron cargar los servicios.</p>';
  }
}


// ═════════════════════════════════════════════════════════════
// CARGAR BARBEROS (público, no necesita sesión)
// ═════════════════════════════════════════════════════════════

async function cargarBarberos() {
  try {
    const res  = await fetch("/api/barberos");
    const data = await res.json();

    // 1. Renderizar las tarjetas visuales
    const grid = document.getElementById("barberosGrid");
    if (grid) {
      grid.innerHTML = "";
      data.forEach(b => {
        const card = document.createElement("article");
        card.className = "barbero-card";
        card.setAttribute("role", "listitem");

        // Foto del barbero
        const img = document.createElement("img");
        img.className = "barbero-card__foto";
        img.src       = b.foto_url || "https://via.placeholder.com/400x280?text=Barbero";
        img.alt       = `Foto de ${b.nombre}`;
        img.loading   = "lazy"; // Carga diferida para rendimiento

        // Info del barbero
        const info = document.createElement("div");
        info.className = "barbero-card__info";

        const nombre = document.createElement("p");
        nombre.className   = "barbero-card__nombre";
        nombre.textContent = `${b.nombre} ${b.apellido}`;

        const esp = document.createElement("p");
        esp.className   = "barbero-card__especialidad";
        esp.textContent = b.especialidad || "";

        info.appendChild(nombre);
        info.appendChild(esp);
        card.appendChild(img);
        card.appendChild(info);
        grid.appendChild(card);
      });
    }

    // 2. Poblar el <select> del formulario de agendar
    const select = document.getElementById("barbero");
    if (select) {
      select.innerHTML = '<option value="">— Selecciona un barbero —</option>';
      data.forEach(b => {
        const opt = document.createElement("option");
        opt.value       = b.id_barbero;
        opt.textContent = `${b.nombre} ${b.apellido} — ${b.especialidad || ""}`;
        select.appendChild(opt);
      });
    }

  } catch (err) {
    console.error("Error cargando barberos:", err);
    const grid = document.getElementById("barberosGrid");
    if (grid) grid.innerHTML = '<p style="color:#888;padding:2rem">No se pudieron cargar los barberos.</p>';
  }
}


// ═════════════════════════════════════════════════════════════
// SECCIÓN "AGENDAR": Mostrar formulario o banner según sesión
// ═════════════════════════════════════════════════════════════

async function iniciarSeccionAgendar() {
  const anonWrap = document.getElementById("agendar__anon-wrap"); // Banner para no logueados
  const formWrap = document.getElementById("agendar__form-wrap"); // Formulario para logueados
  if (!anonWrap || !formWrap) return;

  const cliente = await obtenerSesion();

  if (cliente) {
    // Cliente logueado → ocultar banner, mostrar formulario
    anonWrap.hidden = true;
    formWrap.hidden = false;
    iniciarFormCita();
  }
  // Si no está logueado, se muestra el banner por defecto (ya visible en HTML)
}


// ═════════════════════════════════════════════════════════════
// FORMULARIO DE NUEVA CITA
// ═════════════════════════════════════════════════════════════

function iniciarFormCita() {
  const form       = document.getElementById("formCita");
  const btnCita    = document.getElementById("btnCita");
  const mensajeDiv = document.getElementById("citaMensaje");
  if (!form) return;

  // Establecer fecha mínima = hoy
  const fechaInput = document.getElementById("fecha");
  if (fechaInput) {
    fechaInput.setAttribute("min", new Date().toISOString().split("T")[0]);
  }

  /** Muestra error debajo de un campo */
  function mostrarError(campo, msg) {
    const errEl = document.getElementById(`error-${campo}`);
    const inpEl = document.getElementById(campo);
    if (errEl) errEl.textContent = msg;
    if (inpEl) {
      inpEl.classList.toggle("input--error", !!msg);
      inpEl.setAttribute("aria-invalid", msg ? "true" : "false");
    }
  }

  /** Muestra mensaje global del formulario */
  function mostrarMensaje(texto, tipo) {
    if (!mensajeDiv) return;
    mensajeDiv.textContent = texto;
    mensajeDiv.className   = `form-mensaje ${tipo}`;
    mensajeDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ── Envío del formulario ──
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Limpiar errores anteriores
    ["servicio", "barbero", "fecha", "hora"].forEach(c => mostrarError(c, ""));
    if (mensajeDiv) mensajeDiv.className = "form-mensaje";

    // Obtener valores
    const id_servicio = document.getElementById("servicio").value;
    const id_barbero  = document.getElementById("barbero").value;
    const fecha       = document.getElementById("fecha").value;
    const hora        = document.getElementById("hora").value;

    // Paso 1: Validar campos obligatorios
    let ok = true;
    if (!id_servicio) { mostrarError("servicio", "Selecciona un servicio."); ok = false; }
    if (!id_barbero)  { mostrarError("barbero",  "Selecciona un barbero.");  ok = false; }
    if (!fecha)       { mostrarError("fecha",    "La fecha es obligatoria."); ok = false; }
    if (!hora)        { mostrarError("hora",     "La hora es obligatoria.");  ok = false; }
    if (!ok) return;

    // Paso 2: Validar horario
    const [hh, mm] = hora.split(":").map(Number);
    if (hh < HORA_APERTURA) {
      mostrarError("hora", `Las citas empiezan a partir de las ${HORA_APERTURA}:00.`);
      return;
    }
    if (hh > ULTIMO_TURNO_HORA || (hh === ULTIMO_TURNO_HORA && mm > ULTIMO_TURNO_MIN)) {
      mostrarError("hora", `Último turno disponible: ${ULTIMO_TURNO_HORA}:${String(ULTIMO_TURNO_MIN).padStart(2, "0")}.`);
      return;
    }

    // Paso 3: Enviar al servidor
    const fecha_hora = `${fecha}T${hora}`;
    btnCita.textContent = "Enviando...";
    btnCita.classList.add("btn--loading");

    try {
      const res = await fetch("/api/citas", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ id_servicio, id_barbero, fecha_hora }),
      });
      const data = await res.json();

      if (res.ok) {
        mostrarMensaje(data.mensaje, "success");
        form.reset();
      } else if (res.status === 401) {
        // Sesión expirada → mostrar banner de login
        document.getElementById("agendar__form-wrap").hidden = true;
        document.getElementById("agendar__anon-wrap").hidden = false;
      } else {
        mostrarMensaje(data.error || "Error al agendar.", "error");
      }
    } catch {
      mostrarMensaje("No se pudo conectar con el servidor.", "error");
    } finally {
      btnCita.textContent = "Confirmar Cita";
      btnCita.classList.remove("btn--loading");
    }
  });
}


// ═════════════════════════════════════════════════════════════
// MENÚ HAMBURGUESA (navegación en móvil)
// ═════════════════════════════════════════════════════════════

function iniciarMenuMovil() {
  const btn    = document.getElementById("btnBurger");
  const navMob = document.getElementById("navMobile");
  if (!btn || !navMob) return;

  // Toggle del menú
  btn.addEventListener("click", () => {
    const abierto = !navMob.hidden;
    navMob.hidden = abierto;
    btn.setAttribute("aria-expanded", String(!abierto));
    document.body.classList.toggle("menu-movil-abierto", !abierto);
  });

  // Cerrar al hacer clic en un enlace
  navMob.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => {
      navMob.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-movil-abierto");
    });
  });

  // Cerrar con tecla Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !navMob.hidden) {
      navMob.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-movil-abierto");
      btn.focus();
    }
  });
}


// ═════════════════════════════════════════════════════════════
// INICIALIZACIÓN (se ejecuta cuando la página termina de cargar)
// ═════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  cargarServicios();        // Mostrar servicios en la landing
  cargarBarberos();         // Mostrar barberos en la landing
  iniciarSeccionAgendar();  // Formulario o banner según sesión
  iniciarMenuMovil();       // Menú hamburguesa para móvil
});
