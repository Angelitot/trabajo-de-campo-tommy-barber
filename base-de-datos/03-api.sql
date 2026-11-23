-- Lo que necesita la API para que la página y el panel usen la base de datos.
-- La aplica sola el servidor al arrancar (servidor/migraciones.js), una sola vez.

-- ===================== Clientes =====================

-- Formas de reconocer a un cliente: su WhatsApp junto con su nombre y apellido. Un cliente puede
-- tener varias (si cambió de número, si se unieron dos fichas o si alguna vez dejó solo el número).
CREATE TABLE cliente_alias (
  telefono            varchar(15) CHECK (telefono ~ '^5959[0-9]{8}$'),
  nombre_normalizado  varchar(60) NOT NULL,
  cliente_id          integer     NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  CHECK (telefono IS NOT NULL OR nombre_normalizado <> ''),
  UNIQUE NULLS NOT DISTINCT (telefono, nombre_normalizado)
);

CREATE INDEX cliente_alias_cliente ON cliente_alias (cliente_id);

INSERT INTO cliente_alias (telefono, nombre_normalizado, cliente_id, creado_en)
SELECT telefono, nombre_normalizado, id, creado_en FROM cliente;

-- Ahora el que no se repite es el alias: la ficha guarda el último nombre y número
ALTER TABLE cliente DROP CONSTRAINT cliente_telefono_nombre_normalizado_key;

ALTER TABLE cliente
  ADD COLUMN telefono_fijo         boolean NOT NULL DEFAULT false,  -- el dueño cargó el número en la ficha
  ADD COLUMN telefono_cambiado_en  timestamptz;

-- ===================== Turnos =====================

ALTER TABLE turno
  ADD COLUMN orden           integer     NOT NULL DEFAULT 0,      -- lugar en la fila de Atender
  ADD COLUMN clave_cliente   char(64),                            -- hash de la clave con que el cliente ve su turno
  ADD COLUMN actualizado_en  timestamptz NOT NULL DEFAULT now();

CREATE INDEX turno_actualizado ON turno (actualizado_en);

-- Para el tope de turnos pendientes por celular
CREATE INDEX turno_pendiente_dispositivo ON turno (dispositivo) WHERE estado = 'confirmado';

-- Turnos anotados en el local que se deshicieron (para que los demás celulares los saquen)
CREATE TABLE turno_borrado (
  id          bigserial PRIMARY KEY,
  codigo      varchar(10) NOT NULL,
  barbero_id  integer,
  borrado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX turno_borrado_en ON turno_borrado (borrado_en);

-- ===================== Caja y stock =====================

-- ref: el identificador que le da el panel a cada movimiento
ALTER TABLE movimiento_caja
  ADD COLUMN ref             varchar(40),
  ADD COLUMN cantidad        integer CHECK (cantidad > 0),   -- productos vendidos
  ADD COLUMN anulado_en      timestamptz,                    -- se deshizo (por ejemplo, un cobro)
  ADD COLUMN actualizado_en  timestamptz NOT NULL DEFAULT now();

UPDATE movimiento_caja SET ref = 'm' || id WHERE ref IS NULL;

ALTER TABLE movimiento_caja ALTER COLUMN ref SET NOT NULL;

CREATE UNIQUE INDEX movimiento_caja_ref ON movimiento_caja (ref);

CREATE INDEX movimiento_caja_actualizado ON movimiento_caja (actualizado_en);

-- Un turno se cobra una sola vez, salvo que el cobro se haya deshecho
ALTER TABLE movimiento_caja DROP CONSTRAINT movimiento_caja_turno_id_key;

CREATE UNIQUE INDEX movimiento_caja_turno ON movimiento_caja (turno_id) WHERE anulado_en IS NULL;

ALTER TABLE producto
  ADD COLUMN ref             varchar(40),
  ADD COLUMN actualizado_en  timestamptz NOT NULL DEFAULT now();

UPDATE producto SET ref = 'p' || id WHERE ref IS NULL;

ALTER TABLE producto ALTER COLUMN ref SET NOT NULL;

CREATE UNIQUE INDEX producto_ref ON producto (ref);

ALTER TABLE movimiento_stock ADD COLUMN ref varchar(40);

UPDATE movimiento_stock SET ref = 's' || id WHERE ref IS NULL;

ALTER TABLE movimiento_stock ALTER COLUMN ref SET NOT NULL;

CREATE UNIQUE INDEX movimiento_stock_ref ON movimiento_stock (ref);

CREATE INDEX movimiento_stock_fecha ON movimiento_stock (fecha_hora);

-- ===================== Horario, servicios y fotos =====================

ALTER TABLE cambio_horario ADD COLUMN ref varchar(40);

UPDATE cambio_horario SET ref = 'h' || id WHERE ref IS NULL;

ALTER TABLE cambio_horario ALTER COLUMN ref SET NOT NULL;

CREATE UNIQUE INDEX cambio_horario_ref ON cambio_horario (ref);

-- El cambio completo, como lo muestra el panel en «Últimos cambios»
ALTER TABLE cambio_servicio ADD COLUMN detalle jsonb;

ALTER TABLE foto ADD COLUMN ref varchar(40);

UPDATE foto SET ref = 'f' || id WHERE ref IS NULL;

ALTER TABLE foto ALTER COLUMN ref SET NOT NULL;

CREATE UNIQUE INDEX foto_ref ON foto (ref);

-- Ajustes sueltos del sitio. galeria_propia: el dueño armó su propia galería (aunque la deje vacía)
CREATE TABLE ajuste (
  clave           varchar(40) PRIMARY KEY,
  valor           jsonb       NOT NULL,
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ajuste (clave, valor)
SELECT 'galeria_propia', to_jsonb(EXISTS (SELECT 1 FROM foto WHERE lugar = 'galeria'));

-- ===================== Acceso al panel =====================

-- Cada ingreso al panel es una sesión. Del token solo se guarda su hash.
CREATE TABLE sesion (
  id          bigserial PRIMARY KEY,
  usuario_id  integer      NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  token_hash  char(64)     NOT NULL UNIQUE,
  creada_en   timestamptz  NOT NULL DEFAULT now(),
  expira_en   timestamptz  NOT NULL,
  ultimo_uso  timestamptz  NOT NULL DEFAULT now(),
  agente      varchar(200)
);

CREATE INDEX sesion_usuario ON sesion (usuario_id);

-- Un barbero tiene una sola cuenta activa
CREATE UNIQUE INDEX usuario_barbero ON usuario (barbero_id) WHERE activo AND barbero_id IS NOT NULL;

-- ===================== Versiones =====================

-- Cada vez que cambia una parte, sube su número: así los celulares del panel saben qué volver a pedir
CREATE TABLE version_datos (
  parte    varchar(10) PRIMARY KEY CHECK (parte IN ('config', 'registro', 'stock')),
  version  bigint      NOT NULL DEFAULT 1
);

INSERT INTO version_datos (parte) VALUES ('config'), ('registro'), ('stock');
