-- Script para asegurar que el email sea case-insensitive y único

USE barberia3_db;

-- Crear un índice único case-insensitive si no existe
-- Primero verificamos si hay duplicados antes de crear el índice

-- 1. Verificar duplicados actuales
SELECT 
  LOWER(email) as email_normalizado,
  COUNT(*) as cantidad,
  GROUP_CONCAT(id_cliente) as ids
FROM clientes 
GROUP BY LOWER(email) 
HAVING COUNT(*) > 1;

-- 2. Si no hay duplicados, crear el índice único case-insensitive
-- (Este comando fallará si hay duplicados, lo cual es lo que queremos)

-- Eliminar el índice actual si existe
ALTER TABLE clientes DROP INDEX email;

-- Crear nuevo índice único case-insensitive
ALTER TABLE clientes ADD UNIQUE INDEX email_unique_ci (email);

-- 3. Verificar que el índice fue creado correctamente
SHOW INDEX FROM clientes WHERE Key_name = 'email_unique_ci';

-- 4. Normalizar emails existentes a lowercase (opcional, por seguridad)
UPDATE clientes SET email = LOWER(email);