-- El dueño también es barbero: su cuenta del panel queda unida a su barbero (el primero que se cargó).
-- Así entra con el mismo usuario y contraseña, ve todo el panel y en Atender arranca en su fila.
UPDATE usuario
SET barbero_id = 1
WHERE id = (SELECT min(id) FROM usuario WHERE rol = 'dueno' AND activo AND barbero_id IS NULL)
  AND EXISTS (SELECT 1 FROM barbero WHERE id = 1 AND activo)
  AND NOT EXISTS (SELECT 1 FROM usuario WHERE barbero_id = 1 AND activo);

-- Una versión más: «datos» sube cuando se cargan los datos de prueba o se empieza de cero.
-- Así los celulares con el panel abierto vuelven a cargar todo.
ALTER TABLE version_datos DROP CONSTRAINT version_datos_parte_check;

ALTER TABLE version_datos ADD CONSTRAINT version_datos_parte_check CHECK (parte IN ('config', 'registro', 'stock', 'datos'));

INSERT INTO version_datos (parte) VALUES ('datos');
