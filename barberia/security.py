"""
security.py — Módulo de seguridad.

Contiene:
1. Headers HTTP de seguridad (se añaden a TODAS las respuestas)
2. Logger para registrar eventos importantes en security.log
"""

import logging
from flask import request, session

# ═════════════════════════════════════════════════════════════
# LOGGER DE SEGURIDAD
# Registra eventos en el archivo security.log
# ═════════════════════════════════════════════════════════════

logger = logging.getLogger("barberia.security")
logger.setLevel(logging.INFO)

_handler = logging.FileHandler("security.log", encoding="utf-8")
_handler.setFormatter(logging.Formatter(
    "%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
logger.addHandler(_handler)


def log_evento(evento: str, detalles: str = "", usuario: str = ""):
    """
    Registra un evento de seguridad.

    Ejemplos:
        log_evento("LOGIN_OK", "cliente_id=1")
        log_evento("LOGIN_FALLIDO", "email no encontrado", usuario="test@test.com")
    """
    ip = request.remote_addr if request else "N/A"
    if not usuario:
        usuario = session.get("admin_usuario") or session.get("cliente_email") or "anónimo"
    logger.info(f"{evento} | usuario={usuario} | ip={ip} | {detalles}")


# ═════════════════════════════════════════════════════════════
# HEADERS HTTP DE SEGURIDAD
# Se ejecutan después de cada respuesta del servidor.
# Protegen contra ataques comunes (clickjacking, XSS, sniffing).
# ═════════════════════════════════════════════════════════════

def registrar_headers_seguridad(app):
    """Registra un middleware que añade headers de seguridad a cada respuesta."""

    @app.after_request
    def agregar_headers(response):

        # 1. Anti-clickjacking: no permitir que la web se cargue dentro de un iframe
        response.headers["X-Frame-Options"] = "DENY"

        # 2. Forzar que el navegador respete el MIME type declarado
        response.headers["X-Content-Type-Options"] = "nosniff"

        # 3. Controlar qué info se envía en el header Referer
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # 4. Desactivar APIs del navegador que no necesitamos
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        # 5. Content Security Policy — define qué recursos puede cargar la página
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
            "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
            "img-src 'self' https: data:; "
            "connect-src 'self'; "
            "frame-src https://www.google.com https://maps.google.com; "
            "frame-ancestors 'none';"
        )

        # 6. HSTS — forzar HTTPS (solo activo en producción)
        if app.config.get("SESSION_COOKIE_SECURE"):
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        return response
