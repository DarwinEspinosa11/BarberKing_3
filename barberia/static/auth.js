/**
 * ═══════════════════════════════════════════════════════════════
 * auth.js — Autenticación y sesión del cliente.
 *
 * Este archivo se carga en TODAS las páginas del sitio.
 * Se encarga de:
 *   1. Verificar si hay sesión activa (mostrar "Hola, nombre" o "Entrar")
 *   2. Manejar el formulario de Login (página /login)
 *   3. Manejar el formulario de Registro (página /login?tab=registro)
 *   4. Validar campos en tiempo real
 *
 * API que usa:
 *   GET  /api/auth/yo       → Verificar sesión
 *   POST /api/auth/login    → Iniciar sesión
 *   POST /api/auth/registro → Crear cuenta
 *   POST /api/auth/logout   → Cerrar sesión
 * ═══════════════════════════════════════════════════════════════
 */


// ═════════════════════════════════════════════════════════════
// SESIÓN: Verificar si el usuario está logueado
// ═════════════════════════════════════════════════════════════

/**
 * Consulta al servidor si hay sesión activa.
 * Devuelve el objeto cliente {id, nombre, email} o null.
 */
async function obtenerSesion() {
  try {
    const res = await fetch("/api/auth/yo", { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()).cliente || null;
  } catch {
    return null;
  }
}

/**
 * Actualiza el header de navegación según el estado de sesión:
 * - Logueado → muestra "Hola, nombre" + botón "Salir"
 * - No logueado → muestra botón "Entrar"
 */
async function actualizarHeaderSesion() {
  const contenedor      = document.getElementById("sesionNav");
  const contenedorMovil = document.getElementById("sesionNavMobile");

  const cliente = await obtenerSesion();

  const html = cliente
    ? `<span class="sesion-saludo">Hola, ${cliente.nombre.split(" ")[0]}</span>
       <button class="btn-nav" id="btnLogout">Salir</button>`
    : `<a href="/login" class="btn-nav">Entrar</a>`;

  if (contenedor)      contenedor.innerHTML = html;
  if (contenedorMovil) contenedorMovil.innerHTML = html;

  // Configurar botón de logout
  document.querySelectorAll("#btnLogout").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      window.location.href = "/login";
    });
  });
}


// ═════════════════════════════════════════════════════════════
// VALIDADORES: Funciones que verifican cada campo
// Devuelven "" si está correcto, o un mensaje de error si no.
// ═════════════════════════════════════════════════════════════

const VALIDADORES = {
  nombre(v) {
    if (!v.trim()) return "El nombre es obligatorio.";
    if (v.trim().length < 2) return "Mínimo 2 caracteres.";
    if (!/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'-]+$/i.test(v.trim())) return "Solo se permiten letras.";
    return "";
  },

  apellido(v) {
    if (!v.trim()) return "El apellido es obligatorio.";
    if (v.trim().length < 2) return "Mínimo 2 caracteres.";
    if (!/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'-]+$/i.test(v.trim())) return "Solo se permiten letras.";
    return "";
  },

  email(v) {
    if (!v.trim()) return "El email es obligatorio.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())) return "Introduce un email válido.";
    return "";
  },

  telefono(v) {
    if (!v.trim()) return "El teléfono es obligatorio.";
    const soloDigitos = v.replace(/[\s\-\(\)\+]/g, "");
    if (!/^\d+$/.test(soloDigitos)) return "Solo puede contener números.";
    if (soloDigitos.length < 7 || soloDigitos.length > 15) return "Entre 7 y 15 dígitos.";
    return "";
  },

  password(v) {
    if (v.length < 6) return "Mínimo 6 caracteres.";
    return "";
  },

  loginEmail(v) {
    if (!v.trim()) return "El email es obligatorio.";
    return "";
  },

  loginPassword(v) {
    if (!v.trim()) return "La contraseña es obligatoria.";
    return "";
  },
};


// ═════════════════════════════════════════════════════════════
// UTILIDADES DE UI
// ═════════════════════════════════════════════════════════════

/**
 * Muestra u oculta un mensaje de error debajo de un campo.
 * Si mensaje está vacío, limpia el error.
 */
function mostrarErrorCampo(id, mensaje) {
  const errEl = document.getElementById(`error-${id}`);
  const inpEl = document.getElementById(id);
  if (errEl) errEl.textContent = mensaje;
  if (inpEl) {
    inpEl.classList.toggle("input--error", !!mensaje);
    inpEl.setAttribute("aria-invalid", mensaje ? "true" : "false");
  }
}

/**
 * Muestra un mensaje (éxito/error) en un contenedor por ID.
 */
function mostrarMsg(id, texto, tipo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.className = `form-mensaje ${tipo}`;
}

/**
 * Activa validación en tiempo real:
 * - Al salir del campo (blur): valida y muestra error
 * - Al escribir (input): si ya tenía error, lo limpia cuando corrige
 */
function activarValidacionEnVivo(campos) {
  campos.forEach(({ inputId, validador }) => {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener("blur", () => mostrarErrorCampo(inputId, validador(el.value)));
    el.addEventListener("input", () => {
      if (el.classList.contains("input--error")) {
        mostrarErrorCampo(inputId, validador(el.value));
      }
    });
  });
}


// ═════════════════════════════════════════════════════════════
// PESTAÑAS: Login / Registro (en la página /login)
// ═════════════════════════════════════════════════════════════

function iniciarPestanas() {
  const tabLogin    = document.getElementById("tabLogin");
  const tabRegistro = document.getElementById("tabRegistro");
  const panelLogin  = document.getElementById("panelLogin");
  const panelReg    = document.getElementById("panelRegistro");
  if (!tabLogin) return; // No estamos en la página de login

  tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("auth-tab--active");
    tabRegistro.classList.remove("auth-tab--active");
    panelLogin.hidden = false;
    panelReg.hidden = true;
  });

  tabRegistro.addEventListener("click", () => {
    tabRegistro.classList.add("auth-tab--active");
    tabLogin.classList.remove("auth-tab--active");
    panelReg.hidden = false;
    panelLogin.hidden = true;
  });
}


// ═════════════════════════════════════════════════════════════
// FORMULARIO DE LOGIN
// ═════════════════════════════════════════════════════════════

function iniciarFormLogin() {
  const form = document.getElementById("formLogin");
  if (!form) return; // No estamos en la página de login

  // Activar validación en tiempo real
  activarValidacionEnVivo([
    { inputId: "loginEmail",    validador: VALIDADORES.loginEmail },
    { inputId: "loginPassword", validador: VALIDADORES.loginPassword },
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email    = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    // Validar
    const errEmail = VALIDADORES.loginEmail(email);
    const errPass  = VALIDADORES.loginPassword(password);
    mostrarErrorCampo("loginEmail", errEmail);
    mostrarErrorCampo("loginPassword", errPass);
    if (errEmail || errPass) return;

    // Enviar al servidor
    const btn = document.getElementById("btnLogin");
    btn.textContent = "Entrando...";
    btn.classList.add("btn--loading");

    try {
      const res  = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok) {
        mostrarMsg("loginMensaje", data.mensaje, "success");
        setTimeout(() => { window.location.href = "/"; }, 800);
      } else {
        mostrarMsg("loginMensaje", data.error, "error");
      }
    } catch {
      mostrarMsg("loginMensaje", "Error de conexión.", "error");
    } finally {
      btn.textContent = "Iniciar Sesión";
      btn.classList.remove("btn--loading");
    }
  });
}


// ═════════════════════════════════════════════════════════════
// FORMULARIO DE REGISTRO
// ═════════════════════════════════════════════════════════════

function iniciarFormRegistro() {
  const form = document.getElementById("formRegistro");
  if (!form) return;

  // Validación en tiempo real para cada campo
  activarValidacionEnVivo([
    { inputId: "regNombre",   validador: VALIDADORES.nombre },
    { inputId: "regApellido", validador: VALIDADORES.apellido },
    { inputId: "regEmail",    validador: VALIDADORES.email },
    { inputId: "regTelefono", validador: VALIDADORES.telefono },
    { inputId: "regPassword", validador: VALIDADORES.password },
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombre   = document.getElementById("regNombre").value.trim();
    const apellido = document.getElementById("regApellido").value.trim();
    const email    = document.getElementById("regEmail").value.trim();
    const telefono = document.getElementById("regTelefono").value.trim();
    const password = document.getElementById("regPassword").value.trim();

    // Validar todos los campos
    const errores = {
      regNombre:   VALIDADORES.nombre(nombre),
      regApellido: VALIDADORES.apellido(apellido),
      regEmail:    VALIDADORES.email(email),
      regTelefono: VALIDADORES.telefono(telefono),
      regPassword: VALIDADORES.password(password),
    };

    let hayError = false;
    for (const [id, msg] of Object.entries(errores)) {
      mostrarErrorCampo(id, msg);
      if (msg) hayError = true;
    }
    if (hayError) return;

    // Enviar al servidor
    const btn = document.getElementById("btnRegistro");
    btn.textContent = "Creando...";
    btn.classList.add("btn--loading");

    try {
      const res = await fetch("/api/auth/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nombre, apellido, email, telefono, password }),
      });
      const data = await res.json();

      if (res.ok) {
        mostrarMsg("registroMensaje", data.mensaje, "success");
        setTimeout(() => { window.location.href = "/"; }, 1000);
      } else {
        mostrarMsg("registroMensaje", data.error, "error");
      }
    } catch {
      mostrarMsg("registroMensaje", "Error de conexión.", "error");
    } finally {
      btn.textContent = "Crear Cuenta";
      btn.classList.remove("btn--loading");
    }
  });
}


// ═════════════════════════════════════════════════════════════
// INICIALIZACIÓN (se ejecuta cuando la página carga)
// ═════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  actualizarHeaderSesion();  // En todas las páginas
  iniciarPestanas();         // Solo en /login
  iniciarFormLogin();        // Solo en /login
  iniciarFormRegistro();     // Solo en /login

  // Si la URL tiene ?tab=registro, abrir esa pestaña directamente
  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") === "registro") {
    document.getElementById("tabRegistro")?.click();
  }
});
