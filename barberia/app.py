"""
app.py — Punto de entrada de la aplicación Flask.

Estructura:
1. Configuración y seguridad
2. Páginas HTML (rutas públicas)
3. API pública (barberos, servicios)
4. API de citas (requiere sesión de cliente)

La lógica de autenticación está en auth.py
La lógica del panel admin está en admin.py
"""

# ─────────────────────────────────────────────────────────────
# FIX: Windows no mapea .js correctamente → el navegador lo rechaza
# ─────────────────────────────────────────────────────────────
import mimetypes
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

# ─────────────────────────────────────────────────────────────
# IMPORTS
# ─────────────────────────────────────────────────────────────
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from functools import wraps
import mysql.connector
from mysql.connector import Error
from datetime import datetime, date, timedelta

#------------------------------------------------
# from flask_babel import Babel, gettext as _

from config import (
    DB_CONFIG, SECRET_KEY,
    SESSION_COOKIE_HTTPONLY, SESSION_COOKIE_SAMESITE, SESSION_COOKIE_SECURE,
    PERMANENT_SESSION_LIFETIME, CORS_ORIGINS, RATELIMIT_LOGIN,
)
from auth import auth_bp
from admin import admin_bp
from security import registrar_headers_seguridad, log_evento

# ─────────────────────────────────────────────────────────────
# CONSTANTES DE NEGOCIO
# ─────────────────────────────────────────────────────────────
HORA_APERTURA       = 9      # La barbería abre a las 9:00
HORA_CIERRE         = 19     # Cierra a las 19:00
ULTIMO_TURNO_HORA   = 18     # Último turno: 18:30
ULTIMO_TURNO_MINUTO = 30


# ═════════════════════════════════════════════════════════════
# UTILIDADES DE BASE DE DATOS
# ═════════════════════════════════════════════════════════════

def get_db():
    """Abre una conexión a MySQL. Devuelve None si falla."""
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except Error as e:
        print(f"[DB ERROR] {e}")
        return None


def cliente_existe(cliente_id):
    """Verifica que un cliente existe en la BD (para validar sesiones)."""
    if not cliente_id:
        return False
    conn = get_db()
    if not conn:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM clientes WHERE id_cliente = %s", (cliente_id,))
        return cursor.fetchone() is not None
    except Error:
        return False
    finally:
        cursor.close()
        conn.close()


# ═════════════════════════════════════════════════════════════
# DECORADOR: Requiere sesión de cliente
# ═════════════════════════════════════════════════════════════

def login_cliente_requerido(f):
    """
    Decorador para proteger rutas que requieren un cliente autenticado.
    Si no hay sesión válida, devuelve 401.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        cliente_id = session.get("cliente_id")
        if not cliente_id or not cliente_existe(cliente_id):
            session.clear()
            return jsonify({"error": "Sesión inválida.", "redirect": "/login"}), 401
        return f(*args, **kwargs)
    return wrapper


# ═════════════════════════════════════════════════════════════
# FACTORY: Crear la aplicación Flask
# ═════════════════════════════════════════════════════════════

def crear_app():
    app = Flask(__name__)

    # ── 1. CONFIGURACIÓN ──────────────────────────────────────
    app.secret_key = SECRET_KEY
    app.config["SESSION_COOKIE_HTTPONLY"]       = SESSION_COOKIE_HTTPONLY
    app.config["SESSION_COOKIE_SAMESITE"]       = SESSION_COOKIE_SAMESITE
    app.config["SESSION_COOKIE_SECURE"]         = SESSION_COOKIE_SECURE
    app.config["PERMANENT_SESSION_LIFETIME"]    = timedelta(seconds=PERMANENT_SESSION_LIFETIME)
    app.config["SESSION_COOKIE_NAME"]           = "bk_session"
    app.config["SEND_FILE_MAX_AGE_DEFAULT"]     = 0  # Sin cache en desarrollo
    
    # ── 2. CORS ───────────────────────────────────────────────
    CORS(app, supports_credentials=True, origins=CORS_ORIGINS)

    # ── 3. RATE LIMITING ──────────────────────────────────────
    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        default_limits=["300 per hour"],
        storage_uri="memory://",
    )

    # ── 4. HEADERS DE SEGURIDAD ───────────────────────────────
    registrar_headers_seguridad(app)

    # ── 5. REGISTRAR BLUEPRINTS ───────────────────────────────
    app.register_blueprint(auth_bp,  url_prefix="/api/auth")
    app.register_blueprint(admin_bp, url_prefix="/admin")

    # ── 6. RATE LIMIT EN LOGIN/REGISTRO ───────────────────────
    # Solo estas 3 rutas tienen límite estricto (5/min)
    for endpoint in ["auth.login", "auth.registro", "admin.login_post"]:
        if endpoint in app.view_functions:
            app.view_functions[endpoint] = limiter.limit(RATELIMIT_LOGIN)(
                app.view_functions[endpoint]
            )

    # ── 7. MANEJO DE ERRORES GLOBALES ─────────────────────────

    @app.errorhandler(429)
    def ratelimit_exceeded(e):
        return jsonify({"error": "Demasiados intentos. Espera unos minutos."}), 429

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Recurso no encontrado."}), 404

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Error interno del servidor."}), 500

    # ═════════════════════════════════════════════════════════
    # PÁGINAS HTML (públicas)
    # ═════════════════════════════════════════════════════════

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/login")
    def login_page():
        if "cliente_id" in session:
            return redirect(url_for("index"))
        return render_template("login.html")

    @app.route("/mis-citas")
    def mis_citas_page():
        if "cliente_id" not in session:
            return redirect(url_for("login_page"))
        return render_template("mis_citas.html")

    @app.route("/politica-de-privacidad")
    def privacidad():
        return render_template("legal/privacidad.html")

    @app.route("/aviso-legal")
    def aviso_legal():
        return render_template("legal/aviso_legal.html")

    @app.route("/politica-de-cookies")
    def cookies():
        return render_template("legal/cookies.html")

    # ═════════════════════════════════════════════════════════
    # API PÚBLICA: Barberos y Servicios
    # (No requieren autenticación)
    # ═════════════════════════════════════════════════════════

    @app.route("/api/barberos", methods=["GET"])
    def listar_barberos():
        """Devuelve la lista de barberos activos con sus servicios."""
        conn = get_db()
        if not conn:
            return jsonify({"error": "Error de conexión."}), 500
        try:
            cursor = conn.cursor(dictionary=True)

            # Traer barberos activos
            cursor.execute("""
                SELECT id_barbero, nombre, apellido, telefono, foto_url, activo
                FROM barberos WHERE activo = 1 ORDER BY nombre
            """)
            barberos = cursor.fetchall()

            # Para cada barbero, traer sus servicios
            for b in barberos:
                cursor.execute("""
                    SELECT s.id_servicio, s.nombre_servicio
                    FROM barbero_servicio bs
                    JOIN servicios s ON s.id_servicio = bs.id_servicio
                    WHERE bs.id_barbero = %s
                """, (b["id_barbero"],))
                b["servicios"] = cursor.fetchall()
                b["especialidad"] = ", ".join(
                    s["nombre_servicio"] for s in b["servicios"]
                ) if b["servicios"] else ""

        except Error:
            return jsonify({"error": "Error al obtener barberos."}), 500
        finally:
            cursor.close()
            conn.close()

        return jsonify(barberos), 200

    @app.route("/api/servicios", methods=["GET"])
    def listar_servicios():
        """Devuelve todos los servicios ordenados por precio."""
        conn = get_db()
        if not conn:
            return jsonify({"error": "Error de conexión."}), 500
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT id_servicio, nombre_servicio, descripcion,
                       precio, duracion_min AS duracion_minutos, duracion_min
                FROM servicios ORDER BY precio
            """)
            servicios = cursor.fetchall()
            for s in servicios:
                s["precio"] = float(s["precio"])
        except Error:
            return jsonify({"error": "Error al obtener servicios."}), 500
        finally:
            cursor.close()
            conn.close()

        return jsonify(servicios), 200


    # ═════════════════════════════════════════════════════════
    # API DE CITAS (requiere sesión de cliente)
    # ═════════════════════════════════════════════════════════

    @app.route("/api/citas", methods=["POST"])
    @login_cliente_requerido
    def agendar_cita():
        """
        Crea una nueva cita.
        Valida: datos, horario, y que no haya solapamiento con otra cita.
        """
        data = request.get_json()
        if not data:
            return jsonify({"error": "Datos inválidos."}), 400

        # Extraer y validar campos
        id_servicio    = data.get("id_servicio")
        id_barbero     = data.get("id_barbero")
        fecha_hora_str = (data.get("fecha_hora") or "").strip()
        observaciones  = (data.get("observaciones") or "").strip()[:200]

        if not id_servicio:
            return jsonify({"error": "Debes seleccionar un servicio."}), 400
        if not id_barbero:
            return jsonify({"error": "Debes seleccionar un barbero."}), 400
        if not fecha_hora_str:
            return jsonify({"error": "La fecha y hora son obligatorias."}), 400

        # Convertir tipos
        try:
            id_servicio = int(id_servicio)
            id_barbero  = int(id_barbero)
            fecha_hora  = datetime.strptime(fecha_hora_str, "%Y-%m-%dT%H:%M")
        except (ValueError, TypeError):
            return jsonify({"error": "Formato inválido. Usa YYYY-MM-DDTHH:MM."}), 400

        # Validar fecha futura
        if fecha_hora.date() < date.today():
            return jsonify({"error": "La fecha debe ser hoy o en el futuro."}), 400

        # Validar que si es hoy, la hora no haya pasado ya
        if fecha_hora.date() == date.today() and fecha_hora <= datetime.now():
            return jsonify({"error": "No puedes agendar una cita en una hora que ya pasó."}), 400

        # Validar horario de atención
        hora = fecha_hora.time()
        if hora.hour < HORA_APERTURA:
            return jsonify({"error": f"Las citas empiezan a partir de las {HORA_APERTURA}:00."}), 400
        if (hora.hour, hora.minute) > (ULTIMO_TURNO_HORA, ULTIMO_TURNO_MINUTO):
            return jsonify({"error": f"Último turno disponible: {ULTIMO_TURNO_HORA}:{ULTIMO_TURNO_MINUTO:02d}."}), 400

        # Crear la cita en base de datos
        conn = get_db()
        if not conn:
            return jsonify({"error": "Error de conexión."}), 500
        try:
            cursor = conn.cursor(dictionary=True)

            # Obtener datos del servicio
            cursor.execute(
                "SELECT precio, duracion_min FROM servicios WHERE id_servicio = %s",
                (id_servicio,)
            )
            servicio = cursor.fetchone()
            if not servicio:
                return jsonify({"error": "Servicio no encontrado."}), 404

            duracion       = servicio["duracion_min"]
            precio_cobrado = float(servicio["precio"])

            # Obtener estado "Pendiente"
            cursor.execute("SELECT id_estado FROM estados_cita WHERE nombre = 'Pendiente' LIMIT 1")
            row = cursor.fetchone()
            id_estado = row["id_estado"] if row else 1

            # Verificar que no haya solapamiento con otras citas del barbero
            error_solape = _verificar_solapamiento(cursor, id_barbero, fecha_hora, duracion)
            if error_solape:
                return jsonify({"error": error_solape}), 409

            # Insertar cita
            cursor.execute(
                "INSERT INTO citas (id_cliente, id_barbero, fecha_hora, id_estado, observaciones) "
                "VALUES (%s, %s, %s, %s, %s)",
                (session["cliente_id"], id_barbero, fecha_hora_str, id_estado, observaciones or None)
            )
            id_cita = cursor.lastrowid

            # Insertar servicio de la cita
            cursor.execute(
                "INSERT INTO cita_servicio (id_cita, id_servicio, precio_cobrado) VALUES (%s, %s, %s)",
                (id_cita, id_servicio, precio_cobrado)
            )
            conn.commit()
            log_evento("CITA_CREADA", f"cita_id={id_cita}")

        except Error:
            conn.rollback()
            return jsonify({"error": "Error al guardar la cita."}), 500
        finally:
            cursor.close()
            conn.close()

        return jsonify({"mensaje": f"¡Cita #{id_cita} agendada con éxito!", "id_cita": id_cita}), 201

    @app.route("/api/citas/mis-citas", methods=["GET"])
    @login_cliente_requerido
    def mis_citas():
        """Devuelve todas las citas del cliente autenticado."""
        conn = get_db()
        if not conn:
            return jsonify({"error": "Error de conexión."}), 500
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT c.id_cita, c.fecha_hora, ec.nombre AS estado,
                       c.id_barbero, b.nombre AS barbero_nombre, b.apellido AS barbero_apellido,
                       cs.id_servicio, s.nombre_servicio, cs.precio_cobrado, c.observaciones
                FROM citas c
                JOIN estados_cita ec  ON ec.id_estado  = c.id_estado
                LEFT JOIN barberos b  ON b.id_barbero  = c.id_barbero
                JOIN cita_servicio cs ON cs.id_cita    = c.id_cita
                JOIN servicios s      ON s.id_servicio = cs.id_servicio
                WHERE c.id_cliente = %s
                ORDER BY c.fecha_hora DESC
            """, (session["cliente_id"],))

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


    @app.route("/api/citas/<int:id_cita>/modificar", methods=["PUT"])
    @login_cliente_requerido
    def modificar_cita(id_cita):
        """
        El cliente modifica su propia cita.
        Solo se puede modificar si está en estado Pendiente o Confirmada.
        """
        data = request.get_json()
        if not data:
            return jsonify({"error": "Datos inválidos."}), 400

        id_servicio    = data.get("id_servicio")
        id_barbero     = data.get("id_barbero")
        fecha_hora_str = (data.get("fecha_hora") or "").strip()
        observaciones  = (data.get("observaciones") or "").strip()[:200]

        if not id_servicio or not id_barbero or not fecha_hora_str:
            return jsonify({"error": "Servicio, barbero y fecha son obligatorios."}), 400

        try:
            id_servicio = int(id_servicio)
            id_barbero  = int(id_barbero)
            fecha_hora  = datetime.strptime(fecha_hora_str, "%Y-%m-%dT%H:%M")
        except (ValueError, TypeError):
            return jsonify({"error": "Formato inválido."}), 400

        if fecha_hora.date() < date.today():
            return jsonify({"error": "La fecha debe ser hoy o en el futuro."}), 400

        # Validar que si es hoy, la hora no haya pasado ya
        if fecha_hora.date() == date.today() and fecha_hora <= datetime.now():
            return jsonify({"error": "No puedes agendar una cita en una hora que ya pasó."}), 400

        hora = fecha_hora.time()
        if hora.hour < HORA_APERTURA:
            return jsonify({"error": f"Las citas empiezan a partir de las {HORA_APERTURA}:00."}), 400
        if (hora.hour, hora.minute) > (ULTIMO_TURNO_HORA, ULTIMO_TURNO_MINUTO):
            return jsonify({"error": f"Último turno disponible: {ULTIMO_TURNO_HORA}:{ULTIMO_TURNO_MINUTO:02d}."}), 400

        conn = get_db()
        if not conn:
            return jsonify({"error": "Error de conexión."}), 500
        try:
            cursor = conn.cursor(dictionary=True)

            # Verificar que la cita pertenece al cliente y es modificable
            cursor.execute("""
                SELECT c.id_cita, ec.nombre AS estado
                FROM citas c JOIN estados_cita ec ON ec.id_estado = c.id_estado
                WHERE c.id_cita = %s AND c.id_cliente = %s
            """, (id_cita, session["cliente_id"]))
            cita = cursor.fetchone()

            if not cita:
                return jsonify({"error": "Cita no encontrada."}), 404
            if cita["estado"] not in ("Pendiente", "Confirmada"):
                return jsonify({"error": f"No se puede modificar una cita en estado '{cita['estado']}'."}), 400

            # Obtener datos del servicio nuevo
            cursor.execute("SELECT precio, duracion_min FROM servicios WHERE id_servicio = %s", (id_servicio,))
            servicio = cursor.fetchone()
            if not servicio:
                return jsonify({"error": "Servicio no encontrado."}), 404

            duracion       = servicio["duracion_min"]
            precio_cobrado = float(servicio["precio"])

            # Verificar solapamiento (excluyendo esta misma cita)
            error_solape = _verificar_solapamiento(cursor, id_barbero, fecha_hora, duracion, excluir_cita=id_cita)
            if error_solape:
                return jsonify({"error": error_solape}), 409

            # Actualizar
            cursor.execute(
                "UPDATE citas SET id_barbero=%s, fecha_hora=%s, observaciones=%s WHERE id_cita=%s",
                (id_barbero, fecha_hora_str, observaciones or None, id_cita)
            )
            cursor.execute(
                "UPDATE cita_servicio SET id_servicio=%s, precio_cobrado=%s WHERE id_cita=%s",
                (id_servicio, precio_cobrado, id_cita)
            )
            conn.commit()
            log_evento("CITA_MODIFICADA", f"cita_id={id_cita}")

        except Error:
            conn.rollback()
            return jsonify({"error": "Error al modificar la cita."}), 500
        finally:
            cursor.close()
            conn.close()

        return jsonify({"mensaje": f"Cita #{id_cita} modificada con éxito."}), 200

    @app.route("/api/citas/<int:id_cita>/cancelar", methods=["POST"])
    @login_cliente_requerido
    def cancelar_cita(id_cita):
        """El cliente cancela su propia cita (solo Pendiente o Confirmada)."""
        conn = get_db()
        if not conn:
            return jsonify({"error": "Error de conexión."}), 500
        try:
            cursor = conn.cursor(dictionary=True)

            # Verificar propiedad y estado
            cursor.execute("""
                SELECT c.id_cita, ec.nombre AS estado
                FROM citas c JOIN estados_cita ec ON ec.id_estado = c.id_estado
                WHERE c.id_cita = %s AND c.id_cliente = %s
            """, (id_cita, session["cliente_id"]))
            cita = cursor.fetchone()

            if not cita:
                return jsonify({"error": "Cita no encontrada."}), 404
            if cita["estado"] not in ("Pendiente", "Confirmada"):
                return jsonify({"error": f"No se puede cancelar una cita en estado '{cita['estado']}'."}), 400

            # Cambiar estado a "Cancelada"
            cursor.execute("SELECT id_estado FROM estados_cita WHERE nombre = 'Cancelada' LIMIT 1")
            row = cursor.fetchone()
            id_cancelada = row["id_estado"] if row else 4

            cursor.execute("UPDATE citas SET id_estado = %s WHERE id_cita = %s", (id_cancelada, id_cita))
            conn.commit()
            log_evento("CITA_CANCELADA", f"cita_id={id_cita}")

        except Error:
            conn.rollback()
            return jsonify({"error": "Error al cancelar la cita."}), 500
        finally:
            cursor.close()
            conn.close()

        return jsonify({"mensaje": f"Cita #{id_cita} cancelada correctamente."}), 200

    @app.route("/api/citas/disponibilidad", methods=["GET"])
    @login_cliente_requerido
    def disponibilidad():
        """Devuelve los horarios ocupados de un barbero en una fecha dada."""
        id_barbero   = request.args.get("id_barbero")
        fecha        = request.args.get("fecha")
        excluir_cita = request.args.get("excluir_cita")

        if not id_barbero or not fecha:
            return jsonify({"error": "id_barbero y fecha son obligatorios."}), 400

        try:
            datetime.strptime(fecha, "%Y-%m-%d")
            id_barbero_int = int(id_barbero)
        except (ValueError, TypeError):
            return jsonify({"error": "Parámetros inválidos."}), 400

        conn = get_db()
        if not conn:
            return jsonify({"error": "Error de conexión."}), 500
        try:
            cursor = conn.cursor(dictionary=True)
            query = """
                SELECT c.fecha_hora, s.duracion_min
                FROM citas c
                JOIN cita_servicio cs ON cs.id_cita = c.id_cita
                JOIN servicios s      ON s.id_servicio = cs.id_servicio
                JOIN estados_cita ec  ON ec.id_estado = c.id_estado
                WHERE DATE(c.fecha_hora) = %s AND c.id_barbero = %s AND ec.nombre != 'Cancelada'
            """
            params = [fecha, id_barbero_int]
            if excluir_cita:
                query += " AND c.id_cita != %s"
                params.append(int(excluir_cita))

            cursor.execute(query, params)
            ocupados = []
            for row in cursor.fetchall():
                fh = row["fecha_hora"]
                inicio = fh.hour * 60 + fh.minute
                fin    = inicio + int(row["duracion_min"])
                ocupados.append({"inicio": inicio, "fin": fin})
        except Error:
            return jsonify({"error": "Error al consultar disponibilidad."}), 500
        finally:
            cursor.close()
            conn.close()

        return jsonify({"ocupados": ocupados}), 200


    # ═════════════════════════════════════════════════════════
    # FUNCIÓN AUXILIAR: Verificar solapamiento de citas
    # ═════════════════════════════════════════════════════════

    def _verificar_solapamiento(cursor, id_barbero, fecha_hora, duracion, excluir_cita=None):
        """
        Comprueba si la nueva cita se solapa con alguna existente del barbero.
        Devuelve un mensaje de error si hay conflicto, o None si está libre.
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

        nueva_inicio = fecha_hora.hour * 60 + fecha_hora.minute
        nueva_fin    = nueva_inicio + duracion

        for row in cursor.fetchall():
            fh        = row["fecha_hora"]
            ex_inicio = fh.hour * 60 + fh.minute
            ex_fin    = ex_inicio + int(row["duracion_min"])

            if nueva_inicio < ex_fin and nueva_fin > ex_inicio:
                h_fin = ex_fin // 60
                m_fin = ex_fin % 60
                return f"El barbero está ocupado. La cita anterior termina a las {h_fin:02d}:{m_fin:02d}."

        return None  

    return app

# ═════════════════════════════════════════════════════════════
# EJECUTAR
# ═════════════════════════════════════════════════════════════
if __name__ == "__main__":
    app = crear_app()
    app.run(debug=True, port=5001)
