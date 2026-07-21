"""
test_conexion.py — Script para verificar y  la conexión exitosa a la BD.
Ejecutar: python test_conexion.py
"""

import mysql.connector
from mysql.connector import Error
from config import DB_CONFIG
from datetime import datetime


def test_conexion():
    print("=" * 60)
    print("   BARBERKING — PRUEBA DE CONEXIÓN A BASE DE DATOS")
    print("=" * 60)
    print(f"\n   Fecha y hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"   Host:         {DB_CONFIG['host']}")
    print(f"   Usuario:      {DB_CONFIG['user']}")
    print(f"   Base de datos: {DB_CONFIG['database']}")
    print("-" * 60)

    try:
        conn = mysql.connector.connect(**DB_CONFIG)

        if conn.is_connected():
            info = conn.get_server_info()
            cursor = conn.cursor()

            # Información del servidor
            print(f"\n CONEXIÓN EXITOSA")
            print(f" Versión MySQL Server: {info}")

            # Base de datos en uso
            cursor.execute("SELECT DATABASE();")
            db_name = cursor.fetchone()[0]
            print(f"Base de datos activa: {db_name}")

            # Listar tablas
            cursor.execute("SHOW TABLES;")
            tablas = cursor.fetchall()
            print(f"\n Tablas encontradas ({len(tablas)}):")
            print("   " + "-" * 40)
            for i, tabla in enumerate(tablas, 1):
                cursor.execute(f"SELECT COUNT(*) FROM `{tabla[0]}`")
                count = cursor.fetchone()[0]
                print(f"   {i:2d}. {tabla[0]:<25} ({count} registros)")

            print("   " + "-" * 40)
            print(f"\n Estado: CONEXIÓN ACTIVA Y FUNCIONAL")
            print("=" * 60)

            cursor.close()
            conn.close()
            print("Conexión cerrada correctamente.\n")
            return True
        else:
            print("\n ERROR: No se pudo establecer la conexión.")
            return False

    except Error as e:
        print(f"\n ERROR DE CONEXIÓN: {e}")
        print("Verifica que MySQL esté corriendo y las credenciales sean correctas.")
        print("=" * 60)
        return False


if __name__ == "__main__":
    test_conexion()
