
--  BarberKing  — Base de datos 

-- drop database barberia3_db;
CREATE DATABASE IF NOT EXISTS barberia3_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE barberia3_db;

-- 1. Tabla: estados_cita
CREATE TABLE IF NOT EXISTS estados_cita (
    id_estado INT AUTO_INCREMENT,
    nombre VARCHAR(50) NOT NULL,
    descripcion TEXT,
    PRIMARY KEY (id_estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla: clientes
CREATE TABLE IF NOT EXISTS clientes (
    id_cliente INT AUTO_INCREMENT,
    nombre VARCHAR(50) NOT NULL,
    apellido VARCHAR(50) NOT NULL,
    telefono VARCHAR(20),
    email VARCHAR(100) UNIQUE NOT NULL,
    contraseña VARCHAR(255) NOT NULL,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_cliente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla: barberos
CREATE TABLE IF NOT EXISTS barberos (
    id_barbero INT AUTO_INCREMENT,
    nombre VARCHAR(50) NOT NULL,
    apellido VARCHAR(50) NOT NULL,
    telefono VARCHAR(20),
    foto_url VARCHAR(255),
    activo TINYINT(1) DEFAULT 1,
    PRIMARY KEY (id_barbero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla: servicios
CREATE TABLE IF NOT EXISTS servicios (
    id_servicio INT AUTO_INCREMENT,
    nombre_servicio VARCHAR(100) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    descripcion TEXT,
    duracion_min INT NOT NULL,
    PRIMARY KEY (id_servicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla: citas
CREATE TABLE IF NOT EXISTS citas (
    id_cita INT AUTO_INCREMENT,
    fecha_hora DATETIME NOT NULL,
    observaciones TEXT,
    id_cliente INT NOT NULL,
    id_barbero INT NOT NULL,
    id_estado INT NOT NULL,
    PRIMARY KEY (id_cita),
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (id_barbero) REFERENCES barberos(id_barbero) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (id_estado) REFERENCES estados_cita(id_estado) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabla Intermedia: barbero_servicio (Relación N:M entre Barberos y Servicios)
CREATE TABLE IF NOT EXISTS barbero_servicio (
    id_barbero INT,
    id_servicio INT,
    PRIMARY KEY (id_barbero, id_servicio),
    FOREIGN KEY (id_barbero) REFERENCES barberos(id_barbero) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_servicio) REFERENCES servicios(id_servicio) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Tabla Intermedia: cita_servicio
CREATE TABLE IF NOT EXISTS cita_servicio (
    id_cita INT,
    id_servicio INT,
    precio_cobrado DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (id_cita, id_servicio),
    FOREIGN KEY (id_cita) REFERENCES citas(id_cita) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_servicio) REFERENCES servicios(id_servicio) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  DATOS INICIALES
-- ============================================================

-- Catálogos de estados
INSERT INTO estados_cita (nombre, descripcion) VALUES 
('Pendiente', 'Cita agendada, pendiente de confirmación'),
('Confirmada', 'Cita confirmada por la administración'),
('Finalizada', 'Servicio completado con éxito'),
('Cancelada', 'Cita cancelada');

-- Barberos
INSERT INTO barberos (nombre, apellido, telefono, foto_url, activo) VALUES
('Carlos', 'Ruiz', '5551000001', 'https://images.pexels.com/photos/18483774/pexels-photo-18483774.jpeg', 1),
('Miguel', 'Torres', '5551000002', 'https://images.pexels.com/photos/8552627/pexels-photo-8552627.jpeg', 1),
('Andrés', 'Vega', '5551000003', 'https://images.pexels.com/photos/7440140/pexels-photo-7440140.jpeg', 1);

-- Servicios
INSERT INTO servicios (nombre_servicio, descripcion, precio, duracion_min) VALUES
('Corte Clásico',   'Corte tradicional con tijera y máquina. Incluye lavado y secado.',  12.00, 30),
('Afeitado Navaja', 'Afeitado clásico con navaja y toalla caliente.',                     8.00, 20),
('Corte + Barba',   'Combo completo: corte de cabello y arreglo de barba.',              20.00, 50),
('Tinte',           'Coloración profesional para cabello o barba.',                      50.00, 90),
('Degradado Fade',  'Degradado moderno con máquina. Acabado limpio y preciso.',          15.00, 35),
('Corte Infantil',  'Corte especial para niños hasta 12 años.',                          10.00, 25);

-- Especialidades por barbero 
INSERT INTO barbero_servicio (id_barbero, id_servicio) VALUES
(1,1),(1,3),(1,5),   -- Carlos: Corte Clásico, Corte+Barba, Degradado
(2,2),(2,1),(2,3),   -- Miguel: Navaja, Corte Clásico, Corte+Barba
(3,4),(3,1),(3,6);   -- Andrés: Tinte, Corte Clásico, Infantil
