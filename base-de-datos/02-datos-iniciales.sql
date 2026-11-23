-- Datos iniciales: lo que el local ya tiene definido. No lleva clientes, turnos ni datos de ejemplo.

-- Horario del local: lunes a jueves de 08:00 a 11:30 y de 13:00 a 17:30; viernes y sábado de 08:00 a 17:30.
INSERT INTO horario_local (dia_semana, hora_desde, hora_hasta) VALUES
  (1, '08:00', '11:30'), (1, '13:00', '17:30'),
  (2, '08:00', '11:30'), (2, '13:00', '17:30'),
  (3, '08:00', '11:30'), (3, '13:00', '17:30'),
  (4, '08:00', '11:30'), (4, '13:00', '17:30'),
  (5, '08:00', '17:30'),
  (6, '08:00', '17:30');

-- El primer barbero. El dueño le pone su nombre desde el panel.
INSERT INTO barbero (id, nombre) VALUES (1, 'Barbero principal');

-- Para que los próximos barberos sigan desde el 2
SELECT setval('barbero_id_seq', 1);

INSERT INTO horario_barbero (barbero_id, dia_semana, hora_desde, hora_hasta) VALUES
  (1, 1, '08:00', '17:30'), (1, 2, '08:00', '17:30'), (1, 3, '08:00', '17:30'),
  (1, 4, '08:00', '17:30'), (1, 5, '08:00', '17:30'), (1, 6, '08:00', '17:30');

-- Lista de servicios y combos del local, con sus precios y duraciones aproximadas
INSERT INTO servicio (id, grupo, nombre, incluye, precio, duracion_min, del_local, precio_original, duracion_original, orden) VALUES
  ('corte',           'servicio', 'Corte clásico y degradado', NULL,                              35000,  30, true, 35000,  30,  1),
  ('shaver',          'servicio', 'Degradado con shaver',      NULL,                              40000,  45, true, 40000,  45,  2),
  ('marcacion-barba', 'servicio', 'Marcación de barba',        NULL,                              20000,  15, true, 20000,  15,  3),
  ('afeitado',        'servicio', 'Afeitado de barba',         NULL,                              25000,  20, true, 25000,  20,  4),
  ('ceja',            'servicio', 'Perfilado de ceja',         NULL,                              10000,  10, true, 10000,  10,  5),
  ('ritual-barba',    'servicio', 'Ritual de barba',           NULL,                              30000,  30, true, 30000,  30,  6),
  ('limpieza',        'servicio', 'Limpieza de cutis',         NULL,                              40000,  30, true, 40000,  30,  7),
  ('combo-1',         'combo',    'Combo 1',                   'Corte + Barba + Ceja',            60000,  60, true, 60000,  60,  8),
  ('combo-2',         'combo',    'Combo 2',                   'Corte + Barba + Ceja + Limpieza', 90000,  90, true, 90000,  90,  9),
  ('combo-3',         'combo',    'Combo 3',                   'Corte + Ceja',                    40000,  40, true, 40000,  40, 10),
  ('combo-4',         'combo',    'Combo 4',                   'Corte + Barba',                   50000,  45, true, 50000,  45, 11),
  ('combo-5',         'combo',    'Combo 5',                   'Corte + Limpieza',                60000,  60, true, 60000,  60, 12),
  ('combo-6',         'combo',    'Combo 6',                   'Corte shaver + Ceja + Barba',     65000,  75, true, 65000,  75, 13);
