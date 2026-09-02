"""
auth.py — Autenticación de clientes.

Rutas:
- POST /api/auth/registro  → Crear cuenta nueva
- POST /api/auth/login     → Iniciar sesión
- POST /api/auth/logout    → Cerrar sesión
- GET  /api/auth/yo        → Obtener datos de sesión actual
- GET  /api/auth/perfil    → Obtener perfil completo
- PUT  /api/auth/perfil    → Actualizar nombre/apellido/teléfono
- POST /api/auth/cambiar-password → Cambiar contraseña

Seguridad:
- Contraseñas hasheadas con werkzeug (scrypt)
- Migración automática de hashes antiguos (SHA-256)
- Logging de eventos de autenticación
"""

from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
import mysql.connector
from mysql.connector import Error
import re
from config import DB_CONFIG
from security import log_evento

auth_bp = Blueprint("auth", __name__)


# ═════════════════════════════════════════════════════════════
# UTILIDADES
# ═════════════════════════════════════════════════════════════

def get_db():
    """Abre conexión a MySQL."""
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except Error:
        return None


def email_valido(e):
    """Valida formato básico de email."""
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e))


def telefono_valido(t):
    """Valida que tenga entre 7-15 dígitos (permite espacios, guiones, paréntesis)."""
    solo_digitos = re.sub(r"[\s\-\(\)\+]", "", t)
    return solo_digitos.isdigit() and 7 <= len(solo_digitos) <= 15


def solo_letras(v):
    """Solo letras, acentos, espacios, guiones y apóstrofes."""
    return bool(re.match(r"^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-]+$", v.strip()))


def _legacy_sha256_check(stored_hash, password):
    """Verifica contra hash SHA-256 antiguo (para migración)."""
    import hashlib
    return stored_hash == hashlib.sha256(password.encode("utf-8")).hexdigest()


# ═════════════════════════════════════════════════════════════
# REGISTRO
# ═════════════════════════════════════════════════════════════

@auth_bp.route("/registro", methods=["POST"])
def registro():
    """Crea una cuenta de cliente nueva."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    nombre   = (data.get("nombre")   or "").strip()
    apellido = (data.get("apellido") or "").strip()
    telefono = (data.get("telefono") or "").strip()
    email    = (data.get("email")    or "").strip().lower()  # FORZAR LOWERCASE
    password = (data.get("password") or "").strip()

    # Validaciones
    if not nombre or len(nombre) < 2 or not solo_letras(nombre):
        return jsonify({"error": "Nombre inválido. Mínimo 2 letras."}), 400
    if not apellido or len(apellido) < 2 or not solo_letras(apellido):
        return jsonify({"error": "Apellido inválido. Mínimo 2 letras."}), 400
    if not telefono or not telefono_valido(telefono):
        return jsonify({"error": "Teléfono no válido."}), 400
    if not email_valido(email):
        return jsonify({"error": "Email no válido."}), 400
    if len(password) < 6:
        return jsonify({"error": "La contraseña debe tener al menos 6 caracteres."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)

        # DOBLE VERIFICACIÓN: Verificar que el email no exista (case insensitive)
        cursor.execute("SELECT id_cliente FROM clientes WHERE LOWER(email) = %s", (email,))
        if cursor.fetchone():
            return jsonify({"error": "Ese email ya está registrado."}), 409

        # Crear el cliente con contraseña hasheada
        cursor.execute(
            "INSERT INTO clientes (nombre, apellido, telefono, email, contraseña) "
            "VALUES (%s, %s, %s, %s, %s)",
            (nombre, apellido, telefono, email, generate_password_hash(password))
        )
        cliente_id = cursor.lastrowid
        conn.commit()
        log_evento("REGISTRO", f"cliente_id={cliente_id}", usuario=email)

    except mysql.connector.IntegrityError as e:
        conn.rollback()
        if "Duplicate entry" in str(e) and "email" in str(e):
            return jsonify({"error": "Ese email ya está registrado."}), 409
        return jsonify({"error": "Error de integridad de datos."}), 500
    except Error as e:
        conn.rollback()
        log_evento("REGISTRO_ERROR", f"error={str(e)}", usuario=email)
        return jsonify({"error": "Error al procesar el registro."}), 500
    finally:
        cursor.close()
        conn.close()

    # Iniciar sesión automáticamente
    session["cliente_id"]     = cliente_id
    session["cliente_nombre"] = f"{nombre} {apellido}"
    session["cliente_email"]  = email
    session.permanent = True

    return jsonify({
        "mensaje": f"¡Bienvenido, {nombre}!",
        "cliente": {"id": cliente_id, "nombre": nombre, "apellido": apellido, "email": email}
    }), 201


# ═════════════════════════════════════════════════════════════
# LOGIN
# ═════════════════════════════════════════════════════════════

@auth_bp.route("/login", methods=["POST"])
def login():
    """Inicia sesión verificando email y contraseña."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    email    = (data.get("email")    or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email or not password:
        return jsonify({"error": "Email y contraseña son obligatorios."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id_cliente, nombre, apellido, email, contraseña FROM clientes WHERE email = %s LIMIT 1",
            (email,)
        )
        cliente = cursor.fetchone()

        if not cliente:
            log_evento("LOGIN_FALLIDO", "email no encontrado", usuario=email)
            return jsonify({"error": "Email o contraseña incorrectos."}), 401

        stored_hash = cliente["contraseña"]

        # Intentar verificar con werkzeug (hash moderno)
        if check_password_hash(stored_hash, password):
            pass  # Contraseña correcta
        elif stored_hash == password or _legacy_sha256_check(stored_hash, password):
            # Contraseña correcta pero con hash antiguo → migrar a hash seguro
            cursor.execute(
                "UPDATE clientes SET contraseña = %s WHERE id_cliente = %s",
                (generate_password_hash(password), cliente["id_cliente"])
            )
            conn.commit()
            log_evento("HASH_MIGRADO", f"cliente_id={cliente['id_cliente']}", usuario=email)
        else:
            log_evento("LOGIN_FALLIDO", "contraseña incorrecta", usuario=email)
            return jsonify({"error": "Email o contraseña incorrectos."}), 401

    except Error:
        return jsonify({"error": "Error al iniciar sesión."}), 500
    finally:
        cursor.close()
        conn.close()

    # Guardar sesión
    session["cliente_id"]     = cliente["id_cliente"]
    session["cliente_nombre"] = f"{cliente['nombre']} {cliente['apellido']}"
    session["cliente_email"]  = cliente["email"]
    session.permanent = True

    log_evento("LOGIN_OK", f"cliente_id={cliente['id_cliente']}", usuario=email)

    return jsonify({
        "mensaje": f"¡Bienvenido, {cliente['nombre']}!",
        "cliente": {
            "id": cliente["id_cliente"],
            "nombre": cliente["nombre"],
            "apellido": cliente["apellido"],
            "email": cliente["email"],
        }
    }), 200


# ═════════════════════════════════════════════════════════════
# SESIÓN Y PERFIL
# ═════════════════════════════════════════════════════════════

@auth_bp.route("/yo", methods=["GET"])
def yo():
    """Devuelve los datos básicos del cliente en sesión."""
    if "cliente_id" not in session:
        return jsonify({"error": "No hay sesión activa."}), 401
    return jsonify({"cliente": {
        "id":     session["cliente_id"],
        "nombre": session["cliente_nombre"],
        "email":  session["cliente_email"],
    }}), 200


@auth_bp.route("/perfil", methods=["GET"])
def perfil():
    """Devuelve el perfil completo del cliente autenticado."""
    if "cliente_id" not in session:
        return jsonify({"error": "No hay sesión activa."}), 401

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id_cliente, nombre, apellido, telefono, email, fecha_registro "
            "FROM clientes WHERE id_cliente = %s",
            (session["cliente_id"],)
        )
        cliente = cursor.fetchone()
        if not cliente:
            return jsonify({"error": "Cliente no encontrado."}), 404
        cliente["fecha_registro"] = str(cliente["fecha_registro"])
    except Error:
        return jsonify({"error": "Error al obtener perfil."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({"cliente": cliente}), 200


@auth_bp.route("/perfil", methods=["PUT"])
def actualizar_perfil():
    """Actualiza nombre, apellido y teléfono."""
    if "cliente_id" not in session:
        return jsonify({"error": "No hay sesión activa."}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    nombre   = (data.get("nombre")   or "").strip()
    apellido = (data.get("apellido") or "").strip()
    telefono = (data.get("telefono") or "").strip()

    if not nombre or len(nombre) < 2 or not solo_letras(nombre):
        return jsonify({"error": "Nombre inválido."}), 400
    if not apellido or len(apellido) < 2 or not solo_letras(apellido):
        return jsonify({"error": "Apellido inválido."}), 400
    if not telefono or not telefono_valido(telefono):
        return jsonify({"error": "Teléfono no válido."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE clientes SET nombre=%s, apellido=%s, telefono=%s WHERE id_cliente=%s",
            (nombre, apellido, telefono, session["cliente_id"])
        )
        conn.commit()
        log_evento("PERFIL_ACTUALIZADO", f"cliente_id={session['cliente_id']}")
    except Error:
        return jsonify({"error": "Error al actualizar."}), 500
    finally:
        cursor.close()
        conn.close()

    session["cliente_nombre"] = f"{nombre} {apellido}"
    return jsonify({"mensaje": "Perfil actualizado correctamente."}), 200


# ═════════════════════════════════════════════════════════════
# CAMBIAR CONTRASEÑA
# ═════════════════════════════════════════════════════════════

@auth_bp.route("/cambiar-password", methods=["POST"])
def cambiar_password():
    """Cambia la contraseña verificando la actual."""
    if "cliente_id" not in session:
        return jsonify({"error": "No hay sesión activa."}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    pwd_actual    = (data.get("pwd_actual")    or "").strip()
    pwd_nueva     = (data.get("pwd_nueva")     or "").strip()
    pwd_confirmar = (data.get("pwd_confirmar") or "").strip()

    if not pwd_actual:
        return jsonify({"error": "La contraseña actual es obligatoria."}), 400
    if len(pwd_nueva) < 6:
        return jsonify({"error": "La nueva contraseña debe tener al menos 6 caracteres."}), 400
    if pwd_nueva != pwd_confirmar:
        return jsonify({"error": "Las contraseñas no coinciden."}), 400
    if pwd_nueva == pwd_actual:
        return jsonify({"error": "La nueva contraseña debe ser diferente."}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Error de conexión."}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT contraseña FROM clientes WHERE id_cliente = %s", (session["cliente_id"],))
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Cliente no encontrado."}), 404

        # Verificar contraseña actual
        if not check_password_hash(row["contraseña"], pwd_actual):
            if not _legacy_sha256_check(row["contraseña"], pwd_actual):
                return jsonify({"error": "La contraseña actual es incorrecta."}), 401

        # Guardar nueva contraseña
        cursor.execute(
            "UPDATE clientes SET contraseña = %s WHERE id_cliente = %s",
            (generate_password_hash(pwd_nueva), session["cliente_id"])
        )
        conn.commit()
        log_evento("CAMBIO_PWD_OK", f"cliente_id={session['cliente_id']}")

    except Error:
        return jsonify({"error": "Error al cambiar contraseña."}), 500
    finally:
        cursor.close()
        conn.close()

    return jsonify({"mensaje": "Contraseña cambiada correctamente."}), 200


# ═════════════════════════════════════════════════════════════
# LOGOUT
# ═════════════════════════════════════════════════════════════

@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Cierra la sesión del cliente."""
    log_evento("LOGOUT", f"cliente_id={session.get('cliente_id')}")
    session.clear()
    return jsonify({"mensaje": "Sesión cerrada."}), 200
