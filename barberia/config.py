"""
config.py — Configuración del proyecto.

Aquí se centralizan TODOS los valores sensibles y configurables.
Se leen desde el archivo .env (nunca se hardcodean contraseñas) 
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────────────────────
# BASE DE DATOS
# ─────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "localhost"),
    "user":     os.getenv("DB_USER",     "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME",     "barberia3_db"),
}

# ─────────────────────────────────────────────────────────────
# FLASK
# ─────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "CAMBIAR-EN-PRODUCCION")

# ─────────────────────────────────────────────────────────────
# COOKIES DE SESIÓN
# ─────────────────────────────────────────────────────────────
SESSION_COOKIE_HTTPONLY  = True          # JS no puede leer la cookie
SESSION_COOKIE_SAMESITE = "Lax"         # Protección CSRF básica
SESSION_COOKIE_SECURE   = os.getenv("FLASK_ENV") == "production"  # Solo HTTPS en prod
PERMANENT_SESSION_LIFETIME = 3600       # 1 hora de sesión

# ─────────────────────────────────────────────────────────────
# ADMINISTRADOR
# ─────────────────────────────────────────────────────────────
ADMIN_USER          = os.getenv("ADMIN_USER", "admin")
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "")  # Hash werkzeug

# ─────────────────────────────────────────────────────────────
# RATE LIMITING (anti fuerza bruta)
# ─────────────────────────────────────────────────────────────
RATELIMIT_LOGIN = "5 per minute"  # Máximo 5 intentos de login por minuto

# ─────────────────────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────────────────────
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5001").split(",")
