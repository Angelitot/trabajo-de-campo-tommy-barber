-- Base de datos de Tommy Barber (PostgreSQL 15 o más nuevo).
-- Cada tabla sale de lo que hoy guarda el sistema en el navegador (turnos, clientes, barberos,
-- servicios, horario, caja, stock y fotos), para que la página pase a usarla sin cambiar cómo funciona.
--
-- Convenciones:
--   - Nombres en español y en singular. Las claves primarias se llaman id.
--   - Los montos son en guaraníes, enteros (el guaraní no usa centavos).
--   - Fechas y horas de turnos en hora de Paraguay: fecha (date) + hora (time).
--   - Los teléfonos se guardan como en el enlace de WhatsApp: 595 + el celular sin el 0 (595981123456).
--   - Nada que tenga historial se borra: barberos, servicios y productos se desactivan.

-- ===================== Horario =====================

CREATE TABLE horario_local (
  dia_semana  smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0 = domingo, 6 = sábado
  hora_desde  time     NOT NULL,
  hora_hasta  time     NOT NULL,
  PRIMARY KEY (dia_semana, hora_desde),
  CHECK (hora_hasta > hora_desde)
);

-- ===================== Barberos =====================

CREATE TABLE barbero (
  id          serial PRIMARY KEY,
  nombre      varchar(40) NOT NULL CHECK (length(trim(nombre)) >= 2),
  activo      boolean     NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  quitado_en  timestamptz,
  CHECK (activo OR quitado_en IS NOT NULL)
);

-- Dos barberos activos no pueden llamarse igual
CREATE UNIQUE INDEX barbero_nombre_activo ON barbero (lower(nombre)) WHERE activo;

-- Días y horas de cada barbero (siempre dentro del horario del local)
CREATE TABLE horario_barbero (
  barbero_id  integer  NOT NULL REFERENCES barbero (id) ON DELETE CASCADE,
  dia_semana  smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_desde  time     NOT NULL,
  hora_hasta  time     NOT NULL,
  PRIMARY KEY (barbero_id, dia_semana),
  CHECK (hora_hasta > hora_desde)
);

-- Cambios de horario: cerrar días, cerrar horas o abrir con otro horario.
-- Con barbero_id, el cambio es solo para ese barbero (vacaciones, un trámite).
CREATE TABLE cambio_horario (
  id           serial PRIMARY KEY,
  tipo         varchar(10) NOT NULL CHECK (tipo IN ('cerrado', 'franja', 'especial')),
  fecha_desde  date        NOT NULL,
  fecha_hasta  date        NOT NULL,
  hora_desde   time,
  hora_hasta   time,
  motivo       varchar(60),
  barbero_id   integer REFERENCES barbero (id),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_hasta >= fecha_desde),
  CHECK (tipo = 'cerrado' OR (fecha_hasta = fecha_desde AND hora_desde IS NOT NULL AND hora_hasta > hora_desde)),
  CHECK (tipo <> 'cerrado' OR (hora_desde IS NULL AND hora_hasta IS NULL)),
  CHECK (tipo <> 'especial' OR barbero_id IS NULL)
);

CREATE INDEX cambio_horario_fechas ON cambio_horario (fecha_desde, fecha_hasta);

-- ===================== Servicios =====================

-- Los de la lista del local tienen id fijo (corte, combo-1…); los que agrega el dueño, uno generado.
CREATE TABLE servicio (
  id                 varchar(40) PRIMARY KEY,
  grupo              varchar(10) NOT NULL CHECK (grupo IN ('servicio', 'combo')),
  nombre             varchar(40) NOT NULL,
  incluye            varchar(60),
  precio             integer     NOT NULL CHECK (precio > 0),
  duracion_min       smallint    NOT NULL CHECK (duracion_min BETWEEN 5 AND 240),
  activo             boolean     NOT NULL DEFAULT true,
  del_local          boolean     NOT NULL DEFAULT false,
  precio_original    integer,
  duracion_original  smallint,
  orden              smallint    NOT NULL DEFAULT 0,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CHECK (grupo = 'servicio' OR length(trim(coalesce(incluye, ''))) >= 3),
  CHECK (NOT del_local OR (precio_original IS NOT NULL AND duracion_original IS NOT NULL))
);

CREATE UNIQUE INDEX servicio_nombre ON servicio (lower(nombre));

-- Historial de cambios de servicios (precio, duración, nombre, nuevos y quitados)
CREATE TABLE cambio_servicio (
  id             serial PRIMARY KEY,
  servicio_id    varchar(40) NOT NULL REFERENCES servicio (id),
  campo          varchar(10) NOT NULL CHECK (campo IN ('precio', 'duracion', 'nombre', 'nuevo', 'oculto', 'vuelve')),
  valor_antes    varchar(60),
  valor_despues  varchar(60),
  cambiado_en    timestamptz NOT NULL DEFAULT now()
);

-- ===================== Clientes =====================

-- El N.º de cliente (id) es la clave y nunca cambia. Un cliente se reconoce por su WhatsApp
-- junto con su nombre y apellido: así un papá y su hijo que reservan con el mismo número
-- quedan separados, y si alguien cambia de número se cambia un solo dato.
CREATE TABLE cliente (
  id                  serial PRIMARY KEY,
  nombre              varchar(60) NOT NULL,
  nombre_normalizado  varchar(60) NOT NULL,  -- en minúsculas y sin acentos, para comparar
  telefono            varchar(15) CHECK (telefono ~ '^5959[0-9]{8}$'),
  creado_en           timestamptz NOT NULL DEFAULT now(),
  CHECK (telefono IS NOT NULL OR nombre_normalizado <> ''),
  UNIQUE NULLS NOT DISTINCT (telefono, nombre_normalizado)
);

CREATE INDEX cliente_telefono ON cliente (telefono);

-- Números que usó antes (si reserva con uno de estos y el mismo nombre, se lo reconoce igual)
CREATE TABLE cliente_telefono_anterior (
  id          serial PRIMARY KEY,
  cliente_id  integer     NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  telefono    varchar(15) NOT NULL CHECK (telefono ~ '^5959[0-9]{8}$'),
  hasta       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, telefono)
);

CREATE INDEX cliente_telefono_anterior_tel ON cliente_telefono_anterior (telefono);

-- Pares de fichas que el dueño confirmó que son personas distintas (no se vuelve a preguntar)
CREATE TABLE clientes_distintos (
  cliente_a   integer NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  cliente_b   integer NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  marcado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_a, cliente_b),
  CHECK (cliente_a < cliente_b)
);

-- Registro de fichas unidas: la que queda y el N.º de la que dejó de existir
CREATE TABLE union_clientes (
  id                serial PRIMARY KEY,
  cliente_id        integer NOT NULL REFERENCES cliente (id),
  cliente_unido_id  integer NOT NULL,
  unido_en          timestamptz NOT NULL DEFAULT now()
);

-- Números que no pueden reservar por la web (turnos falsos). En el local se los puede anotar igual.
CREATE TABLE numero_bloqueado (
  telefono      varchar(15) PRIMARY KEY CHECK (telefono ~ '^5959[0-9]{8}$'),
  motivo        varchar(80),
  bloqueado_en  timestamptz NOT NULL DEFAULT now()
);

-- ===================== Turnos =====================

CREATE TABLE turno (
  id              bigserial PRIMARY KEY,
  codigo          varchar(10) NOT NULL UNIQUE,           -- el que ve el cliente: TB-1234
  cliente_id      integer REFERENCES cliente (id),       -- vacío: llegó sin turno y no dejó nombre ni número
  nombre_cliente  varchar(60) NOT NULL,                  -- como lo escribió al reservar
  telefono        varchar(15) CHECK (telefono ~ '^5959[0-9]{8}$'),
  barbero_id      integer     NOT NULL REFERENCES barbero (id),
  servicio_id     varchar(40) NOT NULL REFERENCES servicio (id),
  fecha           date        NOT NULL,
  hora            time        NOT NULL,
  duracion_min    smallint    NOT NULL CHECK (duracion_min > 0),   -- se copia del servicio al reservar
  precio          integer     NOT NULL CHECK (precio > 0),         -- ídem: un cambio de precio no toca turnos ya reservados
  estado          varchar(12) NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('confirmado', 'atendido', 'novino', 'cancelado')),
  medio_pago      varchar(15) CHECK (medio_pago IN ('Efectivo', 'Transferencia', 'Billetera')),
  nota            varchar(120),
  sin_turno       boolean     NOT NULL DEFAULT false,    -- llegó al local sin reservar
  hora_llegada    time,                                  -- a qué hora llegó (si vino sin turno)
  en_local        boolean     NOT NULL DEFAULT false,    -- lo anotó el dueño en el local
  pospuesto       boolean     NOT NULL DEFAULT false,    -- «Pasar después»: se intercambió la hora con el siguiente
  falso           boolean     NOT NULL DEFAULT false,    -- cancelado como turno falso
  cancelado_por   varchar(10) CHECK (cancelado_por IN ('cliente', 'barberia')),
  cancelado_en    timestamptz,
  recordado_en    timestamptz,                           -- se le mandó el recordatorio por WhatsApp
  avisado_en      timestamptz,                           -- se le avisó que se canceló
  llamado_en      timestamptz,                           -- se le avisó que ya le tocaba (sin turno que se fue)
  fecha_anterior  date,                                  -- si el cliente lo cambió de día u hora
  hora_anterior   time,
  cambiado_en     timestamptz,
  dispositivo     varchar(40),                           -- identificador del celular que reservó (para el tope de turnos)
  creado_en       timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 'cancelado') = (cancelado_por IS NOT NULL)),
  CHECK (estado <> 'atendido' OR medio_pago IS NOT NULL),
  CHECK (NOT falso OR estado = 'cancelado'),
  -- Un barbero no puede tener dos turnos confirmados a la misma hora: si dos personas reservan
  -- el mismo horario al mismo tiempo, solo entra la primera. Se puede postergar hasta el final de
  -- la transacción para intercambiar las horas de dos turnos («Pasar después»).
  CONSTRAINT un_turno_por_hora EXCLUDE USING btree (barbero_id WITH =, fecha WITH =, hora WITH =)
    WHERE (estado = 'confirmado') DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX turno_agenda ON turno (fecha, barbero_id, hora);

CREATE INDEX turno_cliente ON turno (cliente_id);

-- Para revisar rápido el tope de turnos pendientes por número
CREATE INDEX turno_pendiente_telefono ON turno (telefono) WHERE estado = 'confirmado';

-- ===================== Stock =====================

CREATE TABLE producto (
  id              serial PRIMARY KEY,
  tipo            varchar(10) NOT NULL CHECK (tipo IN ('insumo', 'venta')),  -- insumo: se usa en el local; venta: se vende
  nombre          varchar(60) NOT NULL,
  presentacion    varchar(60),                                               -- "Pote de 100 g"
  unidad          varchar(15) NOT NULL,                                      -- pote
  unidad_plural   varchar(15) NOT NULL,                                      -- potes
  stock           integer     NOT NULL DEFAULT 0 CHECK (stock >= 0),
  minimo          integer     NOT NULL DEFAULT 1 CHECK (minimo >= 0),        -- avisa cuando queda esto o menos
  precio_venta    integer     NOT NULL DEFAULT 0 CHECK (precio_venta >= 0),
  activo          boolean     NOT NULL DEFAULT true,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  dado_de_baja_en timestamptz,
  CHECK (tipo = 'venta' OR precio_venta = 0)
);

CREATE TABLE movimiento_stock (
  id           bigserial PRIMARY KEY,
  producto_id  integer     NOT NULL REFERENCES producto (id),
  tipo         varchar(10) NOT NULL CHECK (tipo IN ('carga', 'compra', 'uso', 'venta', 'ajuste', 'baja')),
  cantidad     integer     NOT NULL CHECK (cantidad >= 0),
  stock_antes  integer,
  stock_despues integer,
  monto        integer CHECK (monto >= 0),   -- venta: lo que se cobró
  costo        integer CHECK (costo >= 0),   -- compra: lo que se pagó
  fecha_hora   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX movimiento_stock_producto ON movimiento_stock (producto_id, fecha_hora);

-- ===================== Caja =====================

CREATE TABLE movimiento_caja (
  id                   bigserial PRIMARY KEY,
  fecha_hora           timestamptz NOT NULL DEFAULT now(),
  tipo                 varchar(10) NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  categoria            varchar(10) NOT NULL CHECK (categoria IN ('servicio', 'producto', 'compra', 'gasto', 'otro')),
  concepto             varchar(120) NOT NULL,
  monto                integer     NOT NULL CHECK (monto > 0),
  medio_pago           varchar(15) NOT NULL CHECK (medio_pago IN ('Efectivo', 'Transferencia', 'Billetera')),
  turno_id             bigint UNIQUE REFERENCES turno (id),   -- el cobro de un turno (uno solo por turno)
  barbero_id           integer REFERENCES barbero (id),       -- quién atendió, para saber cuánto cobró cada uno
  movimiento_stock_id  bigint REFERENCES movimiento_stock (id),
  CHECK ((tipo = 'entrada') = (categoria IN ('servicio', 'producto', 'otro')))
);

CREATE INDEX movimiento_caja_fecha ON movimiento_caja (fecha_hora);

-- ===================== Fotos de la página =====================

-- Logo, foto del local y fotos de cortes. Si no hay fila, la página usa la foto que trae.
-- Una foto de la galería puede ser una de las que vienen con la página (archivo_original) o una nueva (archivo).
CREATE TABLE foto (
  id                serial PRIMARY KEY,
  lugar             varchar(10) NOT NULL CHECK (lugar IN ('logo', 'fachada', 'galeria')),
  orden             smallint    NOT NULL DEFAULT 0,
  archivo           bytea CHECK (octet_length(archivo) <= 1500000),
  tipo_mime         varchar(12) CHECK (tipo_mime IN ('image/webp', 'image/jpeg', 'image/png')),
  archivo_original  varchar(80),
  ancho             smallint,
  alto              smallint,
  descripcion       varchar(160),   -- qué se ve en la foto (lo leen los lectores de pantalla)
  subida_en         timestamptz NOT NULL DEFAULT now(),
  CHECK ((archivo IS NULL) <> (archivo_original IS NULL)),
  CHECK (archivo IS NULL OR tipo_mime IS NOT NULL),
  CHECK (archivo_original IS NULL OR lugar = 'galeria')
);

-- Un solo logo y una sola foto del local
CREATE UNIQUE INDEX foto_unica ON foto (lugar) WHERE lugar IN ('logo', 'fachada');

-- ===================== Acceso al panel =====================

-- Usuarios del panel (para cuando el panel tenga contraseña real en vez del PIN).
-- La contraseña nunca se guarda: solo su hash.
CREATE TABLE usuario (
  id              serial PRIMARY KEY,
  nombre          varchar(60)  NOT NULL,
  usuario         varchar(40)  NOT NULL UNIQUE,
  clave_hash      varchar(200) NOT NULL,
  rol             varchar(10)  NOT NULL CHECK (rol IN ('dueno', 'barbero')),   -- dueño: todo el panel; barbero: su fila en Atender
  barbero_id      integer REFERENCES barbero (id),
  activo          boolean      NOT NULL DEFAULT true,
  creado_en       timestamptz  NOT NULL DEFAULT now(),
  ultimo_ingreso  timestamptz,
  CHECK (rol = 'dueno' OR barbero_id IS NOT NULL)
);

-- ===================== Vistas =====================

-- La agenda con los nombres a la vista
CREATE VIEW vista_agenda AS
SELECT t.id, t.codigo, t.fecha, t.hora, t.duracion_min,
       b.nombre AS barbero, t.nombre_cliente AS cliente, t.telefono,
       s.nombre AS servicio, t.precio, t.estado, t.medio_pago, t.sin_turno
FROM turno t
JOIN barbero b ON b.id = t.barbero_id
JOIN servicio s ON s.id = t.servicio_id;

-- Turnos pendientes de cada número (para el tope contra turnos falsos)
CREATE VIEW vista_pendientes_por_numero AS
SELECT telefono, count(*) AS pendientes
FROM turno
WHERE estado = 'confirmado'
  AND telefono IS NOT NULL
  AND (fecha + hora) > (now() AT TIME ZONE 'America/Asuncion')
GROUP BY telefono;

-- Clientes con sus visitas, faltas y lo que gastaron
CREATE VIEW vista_clientes AS
SELECT c.id, c.nombre, c.telefono,
       count(*) FILTER (WHERE t.estado = 'atendido') AS visitas,
       count(*) FILTER (WHERE t.estado = 'novino') AS faltas,
       count(*) FILTER (WHERE t.estado = 'cancelado' AND t.cancelado_por = 'cliente') AS cancelaciones,
       coalesce(sum(t.precio) FILTER (WHERE t.estado = 'atendido'), 0) AS gastado,
       max(t.fecha) FILTER (WHERE t.estado = 'atendido') AS ultimo_corte,
       EXISTS (SELECT 1 FROM numero_bloqueado nb WHERE nb.telefono = c.telefono) AS bloqueado
FROM cliente c
LEFT JOIN turno t ON t.cliente_id = c.id
GROUP BY c.id;

-- Ganancia de cada mes: lo que entró menos lo que salió de la caja
CREATE VIEW vista_ganancia_mensual AS
SELECT date_trunc('month', fecha_hora AT TIME ZONE 'America/Asuncion')::date AS mes,
       coalesce(sum(monto) FILTER (WHERE tipo = 'entrada'), 0) AS entradas,
       coalesce(sum(monto) FILTER (WHERE tipo = 'salida'), 0) AS salidas,
       coalesce(sum(monto) FILTER (WHERE tipo = 'entrada'), 0) - coalesce(sum(monto) FILTER (WHERE tipo = 'salida'), 0) AS ganancia
FROM movimiento_caja
GROUP BY 1;
