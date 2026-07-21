"""
Utilidad para generar el hash de la contraseña del administrador.
Ejecutar: python generar_hash_admin.py
Luego copiar el resultado en la variable ADMIN_PASSWORD_HASH del .env
"""
from werkzeug.security import generate_password_hash
import getpass

print("=== Generador de hash para contraseña de admin ===\n")
password = getpass.getpass("Introduce la contraseña del admin: ")
confirm  = getpass.getpass("Confirma la contraseña: ")

if password != confirm:
    print("\nError: Las contraseñas no coinciden.")
else:
    hash_result = generate_password_hash(password)
    print(f"\nHash generado (copia esto en tu .env como ADMIN_PASSWORD_HASH):\n")
    print(hash_result)
