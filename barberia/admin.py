"""
admin.py — Panel de administración de BarberKing.

Este archivo contiene TODA la lógica del panel admin:
- Login/Logout del administrador
- Dashboard con estadísticas
- CRUD de Citas (crear, listar, cambiar estado, eliminar)
- CRUD de Barberos (crear, editar, activar/desactivar)
- CRUD de Servicios (crear, editar, eliminar)
- Gestión de Clientes (listar, buscar, ver historial)

SEGURIDAD:
- Todas las rutas (excepto login) requieren sesión de admin
- Las credenciales del admin se leen del archivo .env
- Cada acción queda registrada en security.log

RUTAS:
  Páginas:
    GET  /admin/login  → Formulario de login
    GET  /admin/       → Dashboard (requiere sesión)

  API (todas requieren sesión de admin):
    POST /admin/login          → Verificar credenciales
    POST /admin/logout         → Cerrar sesión

    GET  /admin/api/resumen    → Estadísticas del dashboard
    GET  /admin/api/citas      → Listar citas (con filtros)
    POST /admin/api/citas      → Crear cita manual
    DEL  /admin/api/citas/:id  → Eliminar cita
    PUT  /admin/api/citas/:id/estado → Cambiar estado

    GET  /admin/api/clientes            → Listar/buscar clientes
    GET  /admin/api/clientes/:id/citas  → Historial de un cliente

    GET  /admin/api/barberos         → Listar barberos
    POST /admin/api/barberos         → Crear barbero
    PUT  /admin/api/barberos/:id     → Editar barbero
    PUT  /admin/api/barberos/:id/activo → Activar/desactivar

    GET  /admin/api/servicios        → Listar servicios
    POST /admin/api/servicios        → Crear servicio
    PUT  /admin/api/servicios/:id    → Editar servicio
    DEL  /admin/api/servicios/:id    → Eliminar servicio
"""

from flask import Blueprint, request, jsonify, session, render_template, redirect, url_for
from werkzeug.security import check_password_hash
from functools import wraps
from datetime import datetime
import mysql.connector
from mysql.connector import Error

from config import DB_CONFIG, ADMIN_USER, ADMIN_PASSWORD_HASH
from security import log_evento

admin_bp = Blueprint("admin", __name__)


# ═════════════════════════════════════════════════════════════
# UTILIDADES
# ═════════════════════════════════════════════════════════════

def get_db():
    """Abre una conexión a la base de datos."""
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except Error as e:
        print(f"[DB ERROR] {e}")
        return None


def admin_requerido(f):
    """
    Decorador que protege una ruta.
    Si el admin no tiene sesión:
      - En rutas /admin/api → devuelve 401 JSON
      - En páginas HTML → redirige al login
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "admin_id" not in session:
            if request.path.startswith("/admin/api"):
                return jsonify({"error": "No autorizado."}), 401
            return redirect(url_for("admin.login"))
        return f(*args, **kwargs)
    return wrapper


# ═════════════════════════════════════════════════════════════
# AUTENTICACIÓN DEL ADMIN
# ═════════════════════════════════════════════════════════════

@admin_bp.route("/login", methods=["GET"])
def login():
    """Muestra la página de login del admin."""
    if "admin_id" in session:
        return redirect(url_for("admin.dashboard"))
    return render_template("admin/login.html")


@admin_bp.route("/", methods=["GET"])
@admin_requerido
def dashboard():
    """Muestra el dashboard del admin (requiere sesión)."""
    return render_template("admin/dashboard.html")


@admin_bp.route("/login", methods=["POST"])
def login_post():
    """
    Verifica las credenciales del admin.
    - Si ADMIN_PASSWORD_HASH está en .env → verifica con werkzeug
    - Si no → usa contraseña por defecto 'admin123' (solo desarrollo)
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    usuario  = (data.get("usuario")  or "").strip()
    password = (data.get("password") or "").strip()

    if not usuario or not password:
        return jsonify({"error": "Usuario y contraseña son obligatorios."}), 400

    # Verificar nombre de usuario
    if usuario != ADMIN_USER:
        log_evento("ADMIN_LOGIN_FALLIDO", f"usuario={usuario}")
        return jsonify({"error": "Usuario o contraseña incorrectos."}), 401

    # Verificar contraseña
    if ADMIN_PASSWORD_HASH:
        # Producción: verificar contra hash almacenado en .env
        if not check_password_hash(ADMIN_PASSWORD_HASH, password):
            log_evento("ADMIN_LOGIN_FALLIDO", f"password incorrecta")
            return jsonify({"error": "Usuario o contraseña incorrectos."}), 401
    else:
        # Desarrollo: contraseña por defecto (NO usar en producción)
        if password != "admin123":
            log_evento("ADMIN_LOGIN_FALLIDO", f"password incorrecta")
            return jsonify({"error": "Usuario o contraseña incorrectos."}), 401

    # Login exitoso → guardar sesión
    session["admin_id"]      = 1
    session["admin_usuario"] = usuario
    session.permanent = True

    log_evento("ADMIN_LOGIN_OK", f"usuario={usuario}")
    return jsonify({"mensaje": "Acceso concedido.", "usuario": usuario}), 200


@admin_bp.route("/logout", methods=["POST"])
def logout():
    """Cierra la sesión del admin."""
    log_evento("ADMIN_LOGOUT", f"usuario={session.get('admin_usuario')}")
    session.pop("admin_id", None)
    session.pop("admin_usuario", None)
    return jsonify({"mensaje": "Sesión cerrada."}), 200


# ═════════════════════════════════════════════════════════════
# DASHBOARD: RESUMEN / ESTADÍSTICAS
# ═════════════════════════════════════════════════════════════

@admin_bp.route("/api/resumen", methods=["GET"])
@admin_requerido
def resumen():
    """
    Devuelve las estadísticas del dashboard:
    - Contadores (citas hoy, total, pendientes, clientes, barberos, servicios)
    - Ingresos del mes
    - Lista de citas del día
    - Top 5 servicios más solicitados
    """
    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        # Contadores simples
        cursor.execute("SELECT COUNT(*) AS t FROM citas WHERE DATE(fecha_hora) = CURDATE()")
        citas_hoy = cursor.fetchone()["t"]

        cursor.execute("SELECT COUNT(*) AS t FROM citas")
        citas_total = cursor.fetchone()["t"]

        cursor.execute("SELECT COUNT(*) AS t FROM clientes")
        total_clientes = cursor.fetchone()["t"]

        cursor.execute("SELECT COUNT(*) AS t FROM barberos WHERE activo = 1")
        total_barberos = cursor.fetchone()["t"]

        cursor.execute("SELECT COUNT(*) AS t FROM servicios")
        total_servicios = cursor.fetchone()["t"]

        # Citas pendientes
        cursor.execute("""
            SELECT COUNT(*) AS t FROM citas c
            JOIN estados_cita ec ON ec.id_estado = c.id_estado
            WHERE ec.nombre = 'Pendiente'
        """)
        citas_pendientes = cursor.fetchone()["t"]

        # Ingresos del mes actual (excluyendo canceladas)
        cursor.execute("""
            SELECT COALESCE(SUM(cs.precio_cobrado), 0) AS ingresos
            FROM citas c
            JOIN cita_servicio cs ON cs.id_cita = c.id_cita
            JOIN estados_cita ec ON ec.id_estado = c.id_estado
            WHERE MONTH(c.fecha_hora) = MONTH(CURDATE())
              AND YEAR(c.fecha_hora) = YEAR(CURDATE())
              AND ec.nombre != 'Cancelada'
        """)
        ingresos_mes = float(cursor.fetchone()["ingresos"])

        # Citas de hoy (para la tabla del dashboard)
        cursor.execute("""
            SELECT c.id_cita, c.fecha_hora, ec.nombre AS estado,
                   cl.nombre AS cliente, cl.apellido AS cliente_apellido,
                   b.nombre AS barbero, s.nombre_servicio
            FROM citas c
            JOIN estados_cita ec  ON ec.id_estado  = c.id_estado
            JOIN clientes cl      ON cl.id_cliente = c.id_cliente
            JOIN barberos b       ON b.id_barbero  = c.id_barbero
            JOIN cita_servicio cs ON cs.id_cita    = c.id_cita
            JOIN servicios s      ON s.id_servicio = cs.id_servicio
            WHERE DATE(c.fecha_hora) = CURDATE() AND ec.nombre != 'Cancelada'
            ORDER BY c.fecha_hora ASC
        """)
        citas_hoy_lista = cursor.fetchall()
        for c in citas_hoy_lista:
            c["fecha_hora"] = str(c["fecha_hora"])

        # Top 5 servicios más pedidos
        cursor.execute("""
            SELECT s.nombre_servicio, COUNT(*) AS total
            FROM cita_servicio cs
            JOIN servicios s     ON s.id_servicio = cs.id_servicio
            JOIN citas c         ON c.id_cita = cs.id_cita
            JOIN estados_cita ec ON ec.id_estado = c.id_estado
            WHERE ec.nombre != 'Cancelada'
            GROUP BY s.id_servicio ORDER BY total DESC LIMIT 5
        """)
        top_servicios = cursor.fetchall()

    except Error:
        return jsonify({"error": "Error al obtener el resumen."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({
        "citas_hoy":        citas_hoy,
        "citas_total":      citas_total,
        "total_clientes":   total_clientes,
        "total_barberos":   total_barberos,
        "total_servicios":  total_servicios,
        "ingresos_mes":     ingresos_mes,
        "citas_pendientes": citas_pendientes,
        "citas_hoy_lista":  citas_hoy_lista,
        "top_servicios":    top_servicios,
    }), 200


# ═════════════════════════════════════════════════════════════
# CITAS: Listar, Crear, Cambiar Estado, Eliminar
# ═════════════════════════════════════════════════════════════

@admin_bp.route("/api/citas", methods=["GET"])
@admin_requerido
def listar_citas():
    """
    Lista todas las citas.
    Filtros opcionales por query params:
      ?fecha_desde=2026-01-01&fecha_hasta=2026-12-31
      &id_barbero=1&id_servicio=2&estado=Pendiente
    """
    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        # Construir filtros dinámicamente
        filtros = []
        params  = []

        fecha_desde = request.args.get("fecha_desde")
        fecha_hasta = request.args.get("fecha_hasta")
        id_barbero  = request.args.get("id_barbero")
        id_servicio = request.args.get("id_servicio")
        estado      = request.args.get("estado")

        if fecha_desde:
            filtros.append("DATE(c.fecha_hora) >= %s")
            params.append(fecha_desde)
        if fecha_hasta:
            filtros.append("DATE(c.fecha_hora) <= %s")
            params.append(fecha_hasta)
        if id_barbero:
            filtros.append("c.id_barbero = %s")
            params.append(int(id_barbero))
        if id_servicio:
            filtros.append("cs.id_servicio = %s")
            params.append(int(id_servicio))
        if estado:
            filtros.append("ec.nombre = %s")
            params.append(estado)

        where = ("WHERE " + " AND ".join(filtros)) if filtros else ""

        cursor.execute(f"""
            SELECT c.id_cita, c.fecha_hora, c.observaciones,
                   ec.nombre AS estado,
                   cl.nombre AS cliente, cl.apellido AS cliente_apellido, cl.telefono,
                   b.nombre AS barbero, b.apellido AS barbero_apellido,
                   s.nombre_servicio, cs.precio_cobrado
            FROM citas c
            JOIN  estados_cita ec  ON ec.id_estado  = c.id_estado
            LEFT JOIN clientes cl  ON cl.id_cliente = c.id_cliente
            LEFT JOIN barberos b   ON b.id_barbero  = c.id_barbero
            JOIN  cita_servicio cs ON cs.id_cita    = c.id_cita
            JOIN  servicios s      ON s.id_servicio = cs.id_servicio
            {where}
            ORDER BY c.fecha_hora DESC
        """, params or None)

        citas = cursor.fetchall()
        for c in citas:
            c["fecha_hora"]     = str(c["fecha_hora"])
            c["precio_cobrado"] = float(c["precio_cobrado"])

    except Error:
        return jsonify({"error": "Error al obtener las citas."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify(citas), 200


@admin_bp.route("/api/citas", methods=["POST"])
@admin_requerido
def admin_crear_cita():
    """
    Crea una cita manualmente.
    El admin selecciona cliente, barbero, servicio y fecha.
    Verifica que no haya solapamiento con otras citas.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    id_cliente     = data.get("id_cliente")
    id_barbero     = data.get("id_barbero")
    id_servicio    = data.get("id_servicio")
    fecha_hora_str = (data.get("fecha_hora") or "").strip()
    observaciones  = (data.get("observaciones") or "").strip()[:200]

    # Validar que todos los campos obligatorios estén
    if not all([id_cliente, id_barbero, id_servicio, fecha_hora_str]):
        return jsonify({"error": "Cliente, barbero, servicio y fecha son obligatorios."}), 400

    # Convertir tipos
    try:
        id_cliente  = int(id_cliente)
        id_barbero  = int(id_barbero)
        id_servicio = int(id_servicio)
        fecha_hora  = datetime.strptime(fecha_hora_str, "%Y-%m-%dT%H:%M")
    except (ValueError, TypeError):
        return jsonify({"error": "Formato de datos inválido."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        # Verificar que el cliente existe
        cursor.execute("SELECT id_cliente FROM clientes WHERE id_cliente = %s", (id_cliente,))
        if not cursor.fetchone():
            return jsonify({"error": "Cliente no encontrado."}), 404

        # Obtener precio y duración del servicio
        cursor.execute("SELECT precio, duracion_min FROM servicios WHERE id_servicio = %s", (id_servicio,))
        servicio = cursor.fetchone()
        if not servicio:
            return jsonify({"error": "Servicio no encontrado."}), 404

        precio_cobrado = float(servicio["precio"])
        duracion       = servicio["duracion_min"]

        # Obtener el estado "Pendiente"
        cursor.execute("SELECT id_estado FROM estados_cita WHERE nombre = 'Pendiente' LIMIT 1")
        row = cursor.fetchone()
        id_estado = row["id_estado"] if row else 1

        # Verificar solapamiento con otras citas del barbero
        error_solape = _verificar_solapamiento(cursor, id_barbero, fecha_hora, duracion)
        if error_solape:
            return jsonify({"error": error_solape}), 409

        # Insertar la cita
        cursor.execute(
            "INSERT INTO citas (id_cliente, id_barbero, fecha_hora, id_estado, observaciones) "
            "VALUES (%s, %s, %s, %s, %s)",
            (id_cliente, id_barbero, fecha_hora_str, id_estado, observaciones or None)
        )
        id_cita = cursor.lastrowid

        # Insertar el servicio de la cita
        cursor.execute(
            "INSERT INTO cita_servicio (id_cita, id_servicio, precio_cobrado) VALUES (%s, %s, %s)",
            (id_cita, id_servicio, precio_cobrado)
        )
        conn.commit()
        log_evento("ADMIN_CITA_CREADA", f"cita_id={id_cita}, cliente={id_cliente}")

    except Error:
        conn.rollback()
        return jsonify({"error": "Error al crear la cita."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({"mensaje": f"Cita #{id_cita} creada exitosamente.", "id_cita": id_cita}), 201


@admin_bp.route("/api/citas/<int:cita_id>/estado", methods=["PUT"])
@admin_requerido
def cambiar_estado_cita(cita_id):
    """
    Cambia el estado de una cita.
    Recibe: {"estado": "Confirmada"} (o Pendiente, Finalizada, Cancelada)
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    nombre_estado = (data.get("estado") or "").strip()
    if not nombre_estado:
        return jsonify({"error": "El campo estado es obligatorio."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        # Buscar el ID del estado por su nombre
        cursor.execute("SELECT id_estado FROM estados_cita WHERE nombre = %s LIMIT 1", (nombre_estado,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": f"Estado '{nombre_estado}' no válido."}), 400

        # Actualizar el estado de la cita
        cursor.execute("UPDATE citas SET id_estado = %s WHERE id_cita = %s", (row["id_estado"], cita_id))
        if cursor.rowcount == 0:
            return jsonify({"error": "Cita no encontrada."}), 404

        conn.commit()
        log_evento("ADMIN_ESTADO_CITA", f"cita_id={cita_id}, nuevo_estado={nombre_estado}")

    except Error:
        return jsonify({"error": "Error al cambiar el estado."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({"mensaje": f"Cita #{cita_id} → {nombre_estado}."}), 200


@admin_bp.route("/api/citas/<int:cita_id>", methods=["DELETE"])
@admin_requerido
def eliminar_cita(cita_id):
    """Elimina una cita de la base de datos."""
    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM citas WHERE id_cita = %s", (cita_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Cita no encontrada."}), 404
        log_evento("ADMIN_CITA_ELIMINADA", f"cita_id={cita_id}")
    except Error:
        return jsonify({"error": "Error al eliminar la cita."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({"mensaje": f"Cita #{cita_id} eliminada."}), 200


# ═════════════════════════════════════════════════════════════
# CLIENTES: Listar, Buscar, Ver historial
# ═════════════════════════════════════════════════════════════

@admin_bp.route("/api/clientes", methods=["GET"])
@admin_requerido
def listar_clientes():
    """
    Lista todos los clientes.
    Si se pasa ?q=texto, busca por nombre, apellido o email.
    """
    q = (request.args.get("q") or "").strip()

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)

        if q:
            # Búsqueda parcial (LIKE %texto%)
            busqueda = f"%{q}%"
            cursor.execute("""
                SELECT c.id_cliente, c.nombre, c.apellido, c.email, c.telefono,
                       c.fecha_registro,
                       (SELECT COUNT(*) FROM citas ci WHERE ci.id_cliente = c.id_cliente) AS total_citas
                FROM clientes c
                WHERE c.nombre LIKE %s OR c.apellido LIKE %s OR c.email LIKE %s
                ORDER BY c.fecha_registro DESC
            """, (busqueda, busqueda, busqueda))
        else:
            # Todos los clientes
            cursor.execute("""
                SELECT c.id_cliente, c.nombre, c.apellido, c.email, c.telefono,
                       c.fecha_registro,
                       (SELECT COUNT(*) FROM citas ci WHERE ci.id_cliente = c.id_cliente) AS total_citas
                FROM clientes c ORDER BY c.fecha_registro DESC
            """)

        clientes = cursor.fetchall()
        for c in clientes:
            c["fecha_registro"] = str(c["fecha_registro"])

    except Error:
        return jsonify({"error": "Error al obtener clientes."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify(clientes), 200


@admin_bp.route("/api/clientes/<int:cliente_id>/citas", methods=["GET"])
@admin_requerido
def citas_cliente(cliente_id):
    """Devuelve el historial completo de citas de un cliente."""
    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT c.id_cita, c.fecha_hora, ec.nombre AS estado,
                   b.nombre AS barbero, s.nombre_servicio, cs.precio_cobrado
            FROM citas c
            JOIN estados_cita ec  ON ec.id_estado  = c.id_estado
            JOIN barberos b       ON b.id_barbero  = c.id_barbero
            JOIN cita_servicio cs ON cs.id_cita    = c.id_cita
            JOIN servicios s      ON s.id_servicio = cs.id_servicio
            WHERE c.id_cliente = %s
            ORDER BY c.fecha_hora DESC
        """, (cliente_id,))

        citas = cursor.fetchall()
        for c in citas:
            c["fecha_hora"]     = str(c["fecha_hora"])
            c["precio_cobrado"] = float(c["precio_cobrado"])

    except Error:
        return jsonify({"error": "Error al obtener citas del cliente."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify(citas), 200


# ═════════════════════════════════════════════════════════════
# BARBEROS: Listar, Crear, Editar, Activar/Desactivar
# ═════════════════════════════════════════════════════════════

@admin_bp.route("/api/barberos", methods=["GET"])
@admin_requerido
def admin_listar_barberos():
    """Lista TODOS los barberos (activos e inactivos) con sus servicios."""
    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id_barbero, nombre, apellido, telefono, foto_url, activo FROM barberos ORDER BY nombre")
        barberos = cursor.fetchall()

        # Para cada barbero, traer la lista de servicios que ofrece
        for b in barberos:
            cursor.execute("""
                SELECT s.id_servicio, s.nombre_servicio
                FROM barbero_servicio bs
                JOIN servicios s ON s.id_servicio = bs.id_servicio
                WHERE bs.id_barbero = %s
            """, (b["id_barbero"],))
            b["servicios"] = cursor.fetchall()

    except Error:
        return jsonify({"error": "Error al obtener barberos."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify(barberos), 200


@admin_bp.route("/api/barberos", methods=["POST"])
@admin_requerido
def admin_crear_barbero():
    """
    Crea un nuevo barbero.
    Recibe: {nombre, apellido, telefono?, foto_url?, servicios: [id1, id2...]}
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    nombre    = (data.get("nombre") or "").strip()
    apellido  = (data.get("apellido") or "").strip()
    telefono  = (data.get("telefono") or "").strip()
    foto_url  = (data.get("foto_url") or "").strip()
    servicios = data.get("servicios", [])  # Lista de IDs de servicios

    if not nombre or not apellido:
        return jsonify({"error": "Nombre y apellido son obligatorios."}), 400
    if len(nombre) > 50 or len(apellido) > 50:
        return jsonify({"error": "Nombre o apellido demasiado largos."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor()

        # Insertar barbero
        cursor.execute(
            "INSERT INTO barberos (nombre, apellido, telefono, foto_url, activo) VALUES (%s, %s, %s, %s, 1)",
            (nombre, apellido, telefono or None, foto_url or None)
        )
        barbero_id = cursor.lastrowid

        # Asociar servicios (especialidades)
        for s_id in servicios:
            cursor.execute(
                "INSERT INTO barbero_servicio (id_barbero, id_servicio) VALUES (%s, %s)",
                (barbero_id, int(s_id))
            )

        conn.commit()
        log_evento("ADMIN_BARBERO_CREADO", f"barbero_id={barbero_id}, nombre={nombre}")

    except Error:
        conn.rollback()
        return jsonify({"error": "Error al crear el barbero."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({"mensaje": "Barbero creado exitosamente.", "id": barbero_id}), 201


@admin_bp.route("/api/barberos/<int:barbero_id>", methods=["PUT"])
@admin_requerido
def admin_editar_barbero(barbero_id):
    """
    Edita los datos de un barbero existente.
    También actualiza su lista de servicios (borra las anteriores y pone las nuevas).
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    nombre    = (data.get("nombre") or "").strip()
    apellido  = (data.get("apellido") or "").strip()
    telefono  = (data.get("telefono") or "").strip()
    foto_url  = (data.get("foto_url") or "").strip()
    activo    = data.get("activo")
    servicios = data.get("servicios", [])

    if not nombre or not apellido:
        return jsonify({"error": "Nombre y apellido son obligatorios."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor()

        # Actualizar datos principales
        if activo is not None:
            cursor.execute(
                "UPDATE barberos SET nombre=%s, apellido=%s, telefono=%s, foto_url=%s, activo=%s WHERE id_barbero=%s",
                (nombre, apellido, telefono or None, foto_url or None, int(activo), barbero_id)
            )
        else:
            cursor.execute(
                "UPDATE barberos SET nombre=%s, apellido=%s, telefono=%s, foto_url=%s WHERE id_barbero=%s",
                (nombre, apellido, telefono or None, foto_url or None, barbero_id)
            )

        # Actualizar servicios: borrar todos y volver a insertar
        cursor.execute("DELETE FROM barbero_servicio WHERE id_barbero = %s", (barbero_id,))
        for s_id in servicios:
            cursor.execute(
                "INSERT INTO barbero_servicio (id_barbero, id_servicio) VALUES (%s, %s)",
                (barbero_id, int(s_id))
            )

        conn.commit()
        log_evento("ADMIN_BARBERO_EDITADO", f"barbero_id={barbero_id}")

    except Error:
        conn.rollback()
        return jsonify({"error": "Error al actualizar el barbero."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({"mensaje": "Barbero actualizado exitosamente."}), 200


@admin_bp.route("/api/barberos/<int:barbero_id>/activo", methods=["PUT"])
@admin_requerido
def admin_toggle_barbero(barbero_id):
    """
    Activa o desactiva un barbero.
    Recibe: {"activo": true} o {"activo": false}
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    activo = data.get("activo")
    if activo is None:
        return jsonify({"error": "El campo 'activo' es obligatorio."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE barberos SET activo = %s WHERE id_barbero = %s", (int(activo), barbero_id))
        conn.commit()
        log_evento("ADMIN_BARBERO_TOGGLE", f"barbero_id={barbero_id}, activo={activo}")
    except Error:
        return jsonify({"error": "Error al actualizar estado."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({"mensaje": "Estado del barbero actualizado."}), 200


# ═════════════════════════════════════════════════════════════
# SERVICIOS: Listar, Crear, Editar, Eliminar
# ═════════════════════════════════════════════════════════════

@admin_bp.route("/api/servicios", methods=["GET"])
@admin_requerido
def admin_listar_servicios():
    """Lista todos los servicios disponibles."""
    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id_servicio, nombre_servicio, precio, descripcion, duracion_min "
            "FROM servicios ORDER BY nombre_servicio"
        )
        servicios = cursor.fetchall()
        for s in servicios:
            s["precio"] = float(s["precio"])
    except Error:
        return jsonify({"error": "Error al obtener servicios."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify(servicios), 200


@admin_bp.route("/api/servicios", methods=["POST"])
@admin_requerido
def admin_crear_servicio():
    """
    Crea un nuevo servicio.
    Recibe: {nombre_servicio, precio, duracion_min, descripcion?}
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    nombre_servicio = (data.get("nombre_servicio") or "").strip()
    precio          = data.get("precio")
    descripcion     = (data.get("descripcion") or "").strip()
    duracion_min    = data.get("duracion_min")

    # Validaciones
    if not nombre_servicio or precio is None or duracion_min is None:
        return jsonify({"error": "Nombre, precio y duración son obligatorios."}), 400
    try:
        precio       = float(precio)
        duracion_min = int(duracion_min)
    except (ValueError, TypeError):
        return jsonify({"error": "Precio y duración deben ser numéricos."}), 400
    if precio < 0 or duracion_min < 1:
        return jsonify({"error": "Precio >= 0 y duración >= 1 minuto."}), 400
    if len(nombre_servicio) > 100:
        return jsonify({"error": "Nombre demasiado largo."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO servicios (nombre_servicio, precio, descripcion, duracion_min) VALUES (%s, %s, %s, %s)",
            (nombre_servicio, precio, descripcion or None, duracion_min)
        )
        servicio_id = cursor.lastrowid
        conn.commit()
        log_evento("ADMIN_SERVICIO_CREADO", f"servicio_id={servicio_id}")
    except Error:
        return jsonify({"error": "Error al crear el servicio."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({"mensaje": "Servicio creado exitosamente.", "id": servicio_id}), 201


@admin_bp.route("/api/servicios/<int:servicio_id>", methods=["PUT"])
@admin_requerido
def admin_editar_servicio(servicio_id):
    """Actualiza los datos de un servicio existente."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    nombre_servicio = (data.get("nombre_servicio") or "").strip()
    precio          = data.get("precio")
    descripcion     = (data.get("descripcion") or "").strip()
    duracion_min    = data.get("duracion_min")

    if not nombre_servicio or precio is None or duracion_min is None:
        return jsonify({"error": "Nombre, precio y duración son obligatorios."}), 400
    try:
        precio       = float(precio)
        duracion_min = int(duracion_min)
    except (ValueError, TypeError):
        return jsonify({"error": "Precio y duración deben ser numéricos."}), 400
    if precio < 0 or duracion_min < 1:
        return jsonify({"error": "Precio >= 0 y duración >= 1 minuto."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE servicios SET nombre_servicio=%s, precio=%s, descripcion=%s, duracion_min=%s WHERE id_servicio=%s",
            (nombre_servicio, precio, descripcion or None, duracion_min, servicio_id)
        )
        conn.commit()
        log_evento("ADMIN_SERVICIO_EDITADO", f"servicio_id={servicio_id}")
    except Error:
        return jsonify({"error": "Error al actualizar."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({"mensaje": "Servicio actualizado exitosamente."}), 200


@admin_bp.route("/api/servicios/<int:servicio_id>", methods=["DELETE"])
@admin_requerido
def admin_eliminar_servicio(servicio_id):
    """
    Elimina un servicio.
    Si tiene citas asociadas, la BD lo impedirá (clave foránea).
    """
    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM servicios WHERE id_servicio = %s", (servicio_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Servicio no encontrado."}), 404
        log_evento("ADMIN_SERVICIO_ELIMINADO", f"servicio_id={servicio_id}")
    except Error:
        # Error de integridad (tiene citas o barberos asociados)
        return jsonify({"error": "No se puede eliminar: tiene citas o barberos asociados."}), 409
    finally:
        cursor.close()
        conn.close()

    return jsonify({"mensaje": "Servicio eliminado exitosamente."}), 200


# ═════════════════════════════════════════════════════════════
# FUNCIÓN AUXILIAR: Verificar solapamiento de citas
# ═════════════════════════════════════════════════════════════

def _verificar_solapamiento(cursor, id_barbero, fecha_hora, duracion, excluir_cita=None):
    """
    Comprueba si hay otra cita del mismo barbero que se solape con la nueva.

    Parámetros:
        cursor      - Cursor de MySQL activo
        id_barbero  - ID del barbero
        fecha_hora  - datetime de la nueva cita
        duracion    - Duración en minutos del servicio
        excluir_cita - (Opcional) ID de cita a excluir (para edición)

    Retorna:
        String con mensaje de error si hay conflicto, o None si está libre.
    """
    fecha_str = fecha_hora.strftime("%Y-%m-%d")
    query = """
        SELECT c.fecha_hora, s.duracion_min
        FROM citas c
        JOIN cita_servicio cs ON cs.id_cita = c.id_cita
        JOIN servicios s      ON s.id_servicio = cs.id_servicio
        JOIN estados_cita ec  ON ec.id_estado = c.id_estado
        WHERE DATE(c.fecha_hora) = %s AND c.id_barbero = %s AND ec.nombre != 'Cancelada'
    """
    params = [fecha_str, id_barbero]

    if excluir_cita:
        query += " AND c.id_cita != %s"
        params.append(excluir_cita)

    cursor.execute(query, params)

    # Convertir la nueva cita a minutos del día para comparar fácilmente
    nueva_inicio = fecha_hora.hour * 60 + fecha_hora.minute
    nueva_fin    = nueva_inicio + duracion

    for row in cursor.fetchall():
        fh        = row["fecha_hora"]
        ex_inicio = fh.hour * 60 + fh.minute
        ex_fin    = ex_inicio + int(row["duracion_min"])

        # ¿Se solapan? → Si la nueva empieza antes de que termine la existente
        #                 Y la nueva termina después de que empiece la existente
        if nueva_inicio < ex_fin and nueva_fin > ex_inicio:
            h_fin = ex_fin // 60
            m_fin = ex_fin % 60
            return f"El barbero está ocupado hasta las {h_fin:02d}:{m_fin:02d}."

    return None 
