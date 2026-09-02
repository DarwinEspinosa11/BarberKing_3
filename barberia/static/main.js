/**
 * ═══════════════════════════════════════════════════════════════
 * main.js — Sistema de reservas BarberKing
 *
 * FUNCIONALIDADES PRINCIPALES:
 *   1. Cargar servicios y barberos desde la API
 *   2. Mostrar grid visual de horarios disponibles/ocupados
 *   3. Gestionar formulario de nueva cita
 *   4. Menú hamburguesa para móvil
 *
 * FLUJO DE RESERVA:
 *   Cliente selecciona: Servicio → Barbero → Fecha → Hora (grid visual) → Enviar
 * ═══════════════════════════════════════════════════════════════
 */

// ═════════════════════════════════════════════════════════════
// CONSTANTES DE CONFIGURACIÓN
// ═════════════════════════════════════════════════════════════

/** Horarios de funcionamiento de la barbería */
const HORA_APERTURA     = 9;   // 09:00 hrs
const HORA_CIERRE       = 19;  // 19:00 hrs
const INTERVALO_MINUTOS = 30;  // Cada 30 minutos (9:00, 9:30, 10:00...)

/** Iconos para las tarjetas de servicios */
const ICONOS_SERVICIOS = {
  "corte clásico":   "✂",
  "afeitado navaja": "🪒", 
  "corte + barba":   "💈",
  "tinte":           "🎨",
  "degradado fade":  "⚡",
  "corte infantil":  "👦",
};

/**
 * Busca un icono apropiado para el servicio
 * @param {string} nombreServicio - Nombre del servicio
 * @returns {string} Emoji del icono
 */
function obtenerIcono(nombreServicio) {
  const nombre = nombreServicio.toLowerCase();
  for (const [clave, icono] of Object.entries(ICONOS_SERVICIOS)) {
    if (nombre.includes(clave)) return icono;
  }
  return "✂"; // Icono por defecto
}

// ═════════════════════════════════════════════════════════════
// CÁLCULO DE HORARIOS DISPONIBLES
// ═════════════════════════════════════════════════════════════

/**
 * Genera todas las horas posibles según la duración del servicio
 * 
 * LÓGICA: Si el servicio dura 30 min y la barbería cierra a las 19:00,
 *         el último turno posible sería a las 18:30 (19:00 - 30 min)
 * 
 * @param {number} duracionMinutos - Duración del servicio en minutos
 * @returns {Array<string>} Array de horas en formato "HH:MM"
 */
function generarOpcionesHoras(duracionMinutos) {
  const opciones = [];
  const cierreMinutos = HORA_CIERRE * 60;          
  const inicioMinutos = HORA_APERTURA * 60;        
  const ultimoTurnoMinutos = cierreMinutos - duracionMinutos;

  // Generar intervalos cada 30 minutos
  for (let minutos = inicioMinutos; minutos <= ultimoTurnoMinutos; minutos += INTERVALO_MINUTOS) {
    const hh = Math.floor(minutos / 60);
    const mm = minutos % 60;
    const horaStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    opciones.push(horaStr);
  }
  
  return opciones;
}

/**
 * grid visual (disponible/ocupado/seleccionado)
 * 
 * COLORES:
 * - Verde: Disponible para reservar
 * - Rojo: Ya ocupado por otra cita
 * - Dorado: Seleccionado por el usuario
 * 
 * @param {number} duracionMinutos - Duración del servicio
 * @param {string|null} idBarbero - ID del barbero seleccionado  
 * @param {string|null} fecha - Fecha en formato YYYY-MM-DD
 */
async function mostrarGridHorarios(duracionMinutos, idBarbero = null, fecha = null) {
  const horariosGrid = document.getElementById("horariosGrid");
  const horaInput = document.getElementById("hora");
  
  if (!horariosGrid || !horaInput) return;

  // Si faltan datos, mostrar mensaje placeholder
  if (!idBarbero || !fecha || !duracionMinutos) {
    horariosGrid.innerHTML = `
      <div class="horarios-grid__placeholder">
        <p>📅 Selecciona servicio, barbero y fecha para ver disponibilidad</p>
      </div>
    `;
    return;
  }

  // 1. Obtener todas las horas teóricamente posibles
  const todasLasHoras = generarOpcionesHoras(duracionMinutos);
  
  // 2. Consultar al servidor qué horas están ocupadas
  let horasOcupadas = [];
  try {
    const url = `/api/citas/disponibilidad?id_barbero=${idBarbero}&fecha=${fecha}`;
    const response = await fetch(url, { credentials: 'include' });
    const data = await response.json();
    
    if (response.ok && data.ocupados) {
      horasOcupadas = data.ocupados; // [{inicio: 540, fin: 570}, ...]
    }
  } catch (error) {
    console.error("Error consultando disponibilidad:", error);
  }

  // 3. Generar la grid visual
  horariosGrid.innerHTML = "";
  
  todasLasHoras.forEach(hora => {
    // Convertir hora a minutos para comparar con ocupadas
    const [hh, mm] = hora.split(":").map(Number);
    const minutosDia = hh * 60 + mm;
    
    // Verificar si esta hora solapa con alguna cita existente
    const estaOcupada = horasOcupadas.some(ocupado => 
      minutosDia >= ocupado.inicio && minutosDia < ocupado.fin
    );
    
    // Crear el slot visual
    const slot = document.createElement("div");
    slot.className = `horario-slot ${estaOcupada ? 'horario-slot--ocupado' : 'horario-slot--disponible'}`;
    slot.textContent = hora;
    slot.dataset.hora = hora;
    
    // Solo los slots disponibles son clickeables
    if (!estaOcupada) {
      slot.addEventListener("click", () => seleccionarHora(hora));
    }
    
    horariosGrid.appendChild(slot);
  });

  // 4. Mostrar aviso si no hay horarios disponibles
  const horasDisponibles = todasLasHoras.filter(hora => {
    const [hh, mm] = hora.split(":").map(Number);
    const minutosDia = hh * 60 + mm;
    return !horasOcupadas.some(ocupado => 
      minutosDia >= ocupado.inicio && minutosDia < ocupado.fin
    );
  });
  
  const horaAviso = document.getElementById("hora-aviso");
  if (horaAviso) {
    if (horasDisponibles.length === 0) {
      horaAviso.textContent = "⚠️ No hay horarios disponibles para este día";
      horaAviso.hidden = false;
    } else {
      horaAviso.textContent = "";  
      horaAviso.hidden = true;
    }
  }
}

/**
 * Maneja la selección de una hora específica
 * @param {string} hora - Hora seleccionada en formato "HH:MM"
 */
function seleccionarHora(hora) {
  // Guardar la hora en el input oculto (para envío del formulario)
  const horaInput = document.getElementById("hora");
  if (horaInput) {
    horaInput.value = hora;
  }
  
  // Actualizar estilos visuales: quitar selección anterior y marcar la nueva
  const slots = document.querySelectorAll(".horario-slot");
  slots.forEach(slot => {
    slot.classList.remove("horario-slot--seleccionado");
    if (slot.dataset.hora === hora) {
      slot.classList.add("horario-slot--seleccionado");
    }
  });
  
  // Limpiar error de validación si existe
  const errorHora = document.getElementById("error-hora");
  if (errorHora) {
    errorHora.textContent = "";
  }
  
  const horaField = document.getElementById("hora");
  if (horaField) {
    horaField.classList.remove("input--error");
  }
}

// ═════════════════════════════════════════════════════════════
// CARGA DE DATOS DESDE LA API
// ═════════════════════════════════════════════════════════════

/**
 * Carga y muestra los servicios disponibles
 * - Renderiza cards visuales en la landing
 * - Pobla el select del formulario (con data-duracion para calcular horarios)
 */
async function cargarServicios() {
  try {
    const response = await fetch("/api/servicios");
    const servicios = await response.json();

    // 1. Renderizar cards visuales para la sección "Nuestros Servicios"
    const grid = document.getElementById("serviciosGrid");
    if (grid) {
      grid.innerHTML = "";
      servicios.forEach(servicio => {
        const card = document.createElement("article");
        card.className = "servicio-card";
        card.setAttribute("role", "listitem");

        card.innerHTML = `
          <span class="servicio-card__icon" aria-hidden="true">${obtenerIcono(servicio.nombre_servicio)}</span>
          <h3></h3>
          <p></p>
          <span class="servicio-card__precio"></span>
          <span class="servicio-card__duracion"></span>
        `;
        
        // Insertar datos de forma segura (previene XSS)
        card.querySelector("h3").textContent = servicio.nombre_servicio;
        card.querySelector("p").textContent = servicio.descripcion || "";
        card.querySelector(".servicio-card__precio").textContent = `$${parseFloat(servicio.precio).toFixed(2)}`;
        card.querySelector(".servicio-card__duracion").textContent = `${servicio.duracion_min} min`;
        
        grid.appendChild(card);
      });
    }

    // 2. Poblar select del formulario de reserva
    const select = document.getElementById("servicio");
    if (select) {
      select.innerHTML = '<option value="">— Selecciona un servicio —</option>';
      servicios.forEach(servicio => {
        const option = document.createElement("option");
        option.value = servicio.id_servicio;
        option.dataset.duracion = servicio.duracion_min; // ← CLAVE: para calcular horarios
        option.textContent = `${servicio.nombre_servicio} — $${parseFloat(servicio.precio).toFixed(2)} (${servicio.duracion_min} min)`;
        select.appendChild(option);
      });
    }

  } catch (error) {
    console.error("Error cargando servicios:", error);
    const grid = document.getElementById("serviciosGrid");
    if (grid) {
      grid.innerHTML = '<p style="color:#888;padding:2rem">No se pudieron cargar los servicios.</p>';
    }
  }
}

/**
 * Carga y muestra los barberos disponibles
 * - Renderiza cards visuales con foto y especialidades
 * - Pobla el select del formulario
 */
async function cargarBarberos() {
  try {
    const response = await fetch("/api/barberos");
    const barberos = await response.json();

    // 1. Renderizar cards visuales para la sección "Nuestros Barberos"
    const grid = document.getElementById("barberosGrid");
    if (grid) {
      grid.innerHTML = "";
      barberos.forEach(barbero => {
        const card = document.createElement("article");
        card.className = "barbero-card";
        card.setAttribute("role", "listitem");

        const img = document.createElement("img");
        img.className = "barbero-card__foto";
        img.src = barbero.foto_url || "https://via.placeholder.com/400x280?text=Barbero";
        img.alt = `Foto de ${barbero.nombre}`;
        img.loading = "lazy";

        const info = document.createElement("div");
        info.className = "barbero-card__info";

        const nombre = document.createElement("p");
        nombre.className = "barbero-card__nombre";
        nombre.textContent = `${barbero.nombre} ${barbero.apellido}`;

        const especialidad = document.createElement("p");
        especialidad.className = "barbero-card__especialidad";
        especialidad.textContent = barbero.especialidad || "";

        info.appendChild(nombre);
        info.appendChild(especialidad);
        card.appendChild(img);
        card.appendChild(info);
        grid.appendChild(card);
      });
    }

    // 2. Poblar select del formulario
    const select = document.getElementById("barbero");
    if (select) {
      select.innerHTML = '<option value="">— Selecciona un barbero —</option>';
      barberos.forEach(barbero => {
        const option = document.createElement("option");
        option.value = barbero.id_barbero;
        option.textContent = `${barbero.nombre} ${barbero.apellido} — ${barbero.especialidad || ""}`;
        select.appendChild(option);
      });
    }

  } catch (error) {
    console.error("Error cargando barberos:", error);
    const grid = document.getElementById("barberosGrid");
    if (grid) {
      grid.innerHTML = '<p style="color:#888;padding:2rem">No se pudieron cargar los barberos.</p>';
    }
  }
}

// ═════════════════════════════════════════════════════════════
// GESTIÓN DEL FORMULARIO DE RESERVA
// ═════════════════════════════════════════════════════════════

/**
 * Verifica si el usuario tiene sesión activa y muestra el formulario apropiado
 */
async function iniciarSeccionAgendar() {
  const bannerAnon = document.getElementById("agendar__anon-wrap");    // Para no logueados
  const formulario = document.getElementById("agendar__form-wrap");   // Para logueados
  
  if (!bannerAnon || !formulario) return;

  const cliente = await obtenerSesion(); // Función definida en auth.js

  if (cliente) {
    // Usuario logueado → mostrar formulario de reserva
    bannerAnon.hidden = true;
    formulario.hidden = false;
    await iniciarFormularioReserva();
  }
  // Si no está logueado, se muestra el banner por defecto
}

/**
 * Configura el formulario de reserva con todos sus listeners y validaciones
 */
async function iniciarFormularioReserva() {
  const form = document.getElementById("formCita");
  const btnSubmit = document.getElementById("btnCita");
  const mensajeDiv = document.getElementById("citaMensaje");
  
  if (!form) return;

  // Referencias a los campos del formulario
  const servicioSelect = document.getElementById("servicio");
  const barberoSelect = document.getElementById("barbero");
  const fechaInput = document.getElementById("fecha");
  const horaInput = document.getElementById("hora");

  // Establecer fecha mínima = hoy (no se puede reservar en el pasado)
  if (fechaInput) {
    fechaInput.setAttribute("min", new Date().toISOString().split("T")[0]);
  }

  /**
   * Muestra un mensaje de error debajo de un campo específico
   * @param {string} campo - ID del campo (sin #)
   * @param {string} mensaje - Mensaje de error a mostrar
   */
  function mostrarError(campo, mensaje) {
    const errorElement = document.getElementById(`error-${campo}`);
    const inputElement = document.getElementById(campo);
    
    if (errorElement) errorElement.textContent = mensaje;
    if (inputElement) {
      inputElement.classList.toggle("input--error", !!mensaje);
      inputElement.setAttribute("aria-invalid", mensaje ? "true" : "false");
    }
  }

  /**
   * Muestra un mensaje global del formulario (éxito o error)
   * @param {string} texto - Mensaje a mostrar
   * @param {string} tipo - "success" o "error"
   */
  function mostrarMensaje(texto, tipo) {
    if (!mensajeDiv) return;
    mensajeDiv.textContent = texto;
    mensajeDiv.className = `form-mensaje ${tipo}`;
    mensajeDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /**
   * Actualiza la grid de horarios cuando cambian los datos del formulario
   */
  const actualizarGridHorarios = async () => {
    const duracion = servicioSelect.options[servicioSelect.selectedIndex]?.dataset.duracion;
    const idBarbero = barberoSelect.value;
    const fecha = fechaInput.value;
    
    if (duracion) {
      await mostrarGridHorarios(parseInt(duracion), idBarbero, fecha);
    }
  };

  // LISTENERS: Actualizar grid cuando cambie cualquier campo relevante
  if (servicioSelect) servicioSelect.addEventListener("change", actualizarGridHorarios);
  if (barberoSelect) barberoSelect.addEventListener("change", actualizarGridHorarios);  
  if (fechaInput) fechaInput.addEventListener("change", actualizarGridHorarios);

  // ENVÍO DEL FORMULARIO
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Limpiar errores anteriores
    ["servicio", "barbero", "fecha", "hora"].forEach(campo => mostrarError(campo, ""));
    if (mensajeDiv) mensajeDiv.className = "form-mensaje";

    // Obtener valores del formulario
    const idServicio = servicioSelect.value;
    const idBarbero = barberoSelect.value;
    const fecha = fechaInput.value;
    const hora = horaInput.value;

    // VALIDACIÓN: Campos obligatorios
    let formularioValido = true;
    if (!idServicio) { mostrarError("servicio", "Selecciona un servicio."); formularioValido = false; }
    if (!idBarbero) { mostrarError("barbero", "Selecciona un barbero."); formularioValido = false; }
    if (!fecha) { mostrarError("fecha", "La fecha es obligatoria."); formularioValido = false; }
    if (!hora) { mostrarError("hora", "Selecciona un horario."); formularioValido = false; }
    
    if (!formularioValido) return;

    // VALIDACIÓN: Horario válido (doble verificación por seguridad)
    const [hh, mm] = hora.split(":").map(Number);
    if (hh < HORA_APERTURA) {
      mostrarError("hora", `Las citas empiezan a partir de las ${HORA_APERTURA}:00.`);
      return;
    }
    
    const duracionServicio = servicioSelect.options[servicioSelect.selectedIndex]?.dataset.duracion;
    if (duracionServicio) {
      const minutosDia = hh * 60 + mm;
      const cierreMinutos = HORA_CIERRE * 60;
      const ultimoTurnoMinutos = cierreMinutos - parseInt(duracionServicio);
      
      if (minutosDia > ultimoTurnoMinutos) {
        const ultimoHh = Math.floor(ultimoTurnoMinutos / 60);
        const ultimoMm = ultimoTurnoMinutos % 60;
        mostrarError("hora", `Último turno para este servicio: ${String(ultimoHh).padStart(2, "0")}:${String(ultimoMm).padStart(2, "0")}.`);
        return;
      }
    }

    // ENVÍO: Crear la cita en el servidor
    const fechaHora = `${fecha}T${hora}`;
    btnSubmit.textContent = "Enviando...";
    btnSubmit.classList.add("btn--loading");

    try {
      const response = await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id_servicio: idServicio,
          id_barbero: idBarbero,
          fecha_hora: fechaHora
        })
      });
      
      const data = await response.json();

      if (response.ok) {
        // ¡Éxito! Limpiar formulario y mostrar confirmación
        mostrarMensaje(data.mensaje, "success");
        form.reset();
        
        // Resetear grid de horarios
        const horariosGrid = document.getElementById("horariosGrid");
        if (horariosGrid) {
          horariosGrid.innerHTML = `
            <div class="horarios-grid__placeholder">
              <p>📅 Selecciona servicio, barbero y fecha para ver disponibilidad</p>
            </div>
          `;
        }
      } else if (response.status === 401) {
        // Sesión expirada → volver al modo no logueado
        document.getElementById("agendar__form-wrap").hidden = true;
        document.getElementById("agendar__anon-wrap").hidden = false;
      } else {
        // Error del servidor
        mostrarMensaje(data.error || "Error al agendar la cita.", "error");
      }
    } catch (error) {
      mostrarMensaje("No se pudo conectar con el servidor.", "error");
    } finally {
      btnSubmit.textContent = "Confirmar Cita";
      btnSubmit.classList.remove("btn--loading");
    }
  });
}

// ═════════════════════════════════════════════════════════════
// MENÚ HAMBURGUESA PARA MÓVIL
// ═════════════════════════════════════════════════════════════

/**
 * Configura el menú hamburguesa para dispositivos móviles
 */
function iniciarMenuMovil() {
  const botonHamburguesa = document.getElementById("btnBurger");
  const menuMovil = document.getElementById("navMobile");
  
  if (!botonHamburguesa || !menuMovil) return;

  // Toggle: abrir/cerrar menú
  botonHamburguesa.addEventListener("click", () => {
    const estaAbierto = !menuMovil.hidden;
    menuMovil.hidden = estaAbierto;
    botonHamburguesa.setAttribute("aria-expanded", String(!estaAbierto));
    document.body.classList.toggle("menu-movil-abierto", !estaAbierto);
  });

  // Cerrar menú al hacer clic en cualquier enlace
  menuMovil.querySelectorAll("a").forEach(enlace => {
    enlace.addEventListener("click", () => {
      menuMovil.hidden = true;
      botonHamburguesa.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-movil-abierto");
    });
  });

  // Cerrar menú con tecla Escape
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menuMovil.hidden) {
      menuMovil.hidden = true;
      botonHamburguesa.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-movil-abierto");
      botonHamburguesa.focus();
    }
  });
}

// ═════════════════════════════════════════════════════════════
// INICIALIZACIÓN: Se ejecuta cuando la página termina de cargar
// ═════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  cargarServicios();        // Cargar y mostrar servicios
  cargarBarberos();         // Cargar y mostrar barberos
  iniciarSeccionAgendar();  // Configurar formulario de reserva
  iniciarMenuMovil();       // Configurar menú hamburguesa
});