-- Extensiones para la búsqueda libre de la cartelera (sin mayúsculas ni tildes).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- unaccent() no es IMMUTABLE; esta envoltura sí, para poder indexarla.
CREATE FUNCTION f_unaccent(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, texto) $$;

CREATE TYPE categoria_evento AS ENUM ('concierto', 'fiesta', 'conferencia', 'deportes', 'teatro', 'festival', 'otro');
CREATE TYPE municipio_casanare AS ENUM ('Aguazul', 'Chámeza', 'Hato Corozal', 'La Salina', 'Maní', 'Monterrey', 'Nunchía',
  'Orocué', 'Paz de Ariporo', 'Pore', 'Recetor', 'Sabanalarga', 'Sácama', 'San Luis de Palenque', 'Támara', 'Tauramena',
  'Trinidad', 'Villanueva', 'Yopal');
CREATE TYPE estado_evento AS ENUM ('borrador', 'publicado', 'pausado', 'agotado', 'cancelado', 'finalizado');
CREATE TYPE politica_reembolso AS ENUM ('ninguno', 'hasta_24h_antes', 'hasta_72h_antes');
CREATE TYPE medio_pago AS ENUM ('pse', 'nequi', 'daviplata', 'tarjeta');
CREATE TYPE estado_orden AS ENUM ('pendiente', 'pagada', 'expirada', 'reembolsada');
CREATE TYPE estado_boleta AS ENUM ('valida', 'usada', 'cancelada');
CREATE TYPE resultado_validacion AS ENUM ('aceptada', 'rechazada');
CREATE TYPE motivo_rechazo AS ENUM ('ya_usada', 'cancelada', 'otro_evento', 'no_existe');

CREATE TABLE organizador (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         varchar(120) NOT NULL CHECK (char_length(nombre) >= 3),
  correo         varchar(254) NOT NULL CONSTRAINT organizador_correo_key UNIQUE
                 CHECK (char_length(correo) >= 6 AND correo = lower(correo) AND correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono       varchar(13)  NOT NULL CHECK (telefono ~ '^\+57(3[0-9]{9}|60[1-8][0-9]{7})$'),
  municipio      municipio_casanare NOT NULL,
  -- Hash bcrypt de la clave (D-23): la clave en claro nunca llega a la base.
  clave_hash     varchar(60)  NOT NULL CHECK (clave_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
  creado_en      timestamptz  NOT NULL DEFAULT now(),
  actualizado_en timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE evento (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizador_id     uuid NOT NULL REFERENCES organizador (id) ON DELETE RESTRICT,
  nombre             varchar(120) NOT NULL CHECK (char_length(nombre) >= 3),
  slug               varchar(140) NOT NULL CONSTRAINT evento_slug_key UNIQUE
                     CHECK (char_length(slug) >= 3 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  descripcion        varchar(2000) NOT NULL CHECK (char_length(descripcion) >= 20),
  categoria          categoria_evento NOT NULL,
  lugar              varchar(120) NOT NULL CHECK (char_length(lugar) >= 2),
  direccion          varchar(160) NOT NULL CHECK (char_length(direccion) >= 5),
  municipio          municipio_casanare NOT NULL,
  fecha_inicio       timestamptz NOT NULL,
  fecha_fin          timestamptz NOT NULL,
  aforo_total        integer NOT NULL CHECK (aforo_total BETWEEN 1 AND 100000),
  edad_minima        smallint CHECK (edad_minima BETWEEN 1 AND 21),
  es_gratuito        boolean NOT NULL DEFAULT false,
  politica_reembolso politica_reembolso NOT NULL DEFAULT 'hasta_24h_antes',
  imagen_url         varchar(500) CHECK (imagen_url ~ '^https://'),
  estado             estado_evento NOT NULL DEFAULT 'borrador',
  version            integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evento_fechas_ck CHECK (fecha_fin > fecha_inicio)
);
CREATE INDEX evento_cartelera_idx   ON evento (estado, fecha_inicio);
CREATE INDEX evento_municipio_idx   ON evento (municipio, fecha_inicio);
CREATE INDEX evento_categoria_idx   ON evento (categoria, fecha_inicio);
CREATE INDEX evento_organizador_idx ON evento (organizador_id, fecha_inicio);
CREATE INDEX evento_busqueda_idx    ON evento USING gin (f_unaccent(lower(nombre || ' ' || lugar)) gin_trgm_ops);

CREATE TABLE tipo_boleta (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id        uuid NOT NULL REFERENCES evento (id) ON DELETE CASCADE,
  nombre           varchar(60) NOT NULL CHECK (char_length(nombre) >= 2),
  descripcion      varchar(500),
  precio_cop       integer NOT NULL CHECK (precio_cop BETWEEN 0 AND 10000000),
  cantidad_total   integer NOT NULL CHECK (cantidad_total BETWEEN 1 AND 100000),
  cantidad_vendida integer NOT NULL DEFAULT 0 CHECK (cantidad_vendida >= 0),
  maximo_por_orden smallint NOT NULL DEFAULT 10 CHECK (maximo_por_orden BETWEEN 1 AND 20),
  venta_inicia_en  timestamptz NOT NULL DEFAULT now(),
  venta_termina_en timestamptz NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tipo_boleta_evento_id_nombre_key UNIQUE (evento_id, nombre),
  CONSTRAINT tipo_boleta_cupo_ck CHECK (cantidad_vendida <= cantidad_total),
  CONSTRAINT tipo_boleta_venta_ck CHECK (venta_termina_en > venta_inicia_en)
);

CREATE TABLE orden (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id                  uuid NOT NULL REFERENCES evento (id) ON DELETE RESTRICT,
  comprador_nombre           varchar(120) NOT NULL CHECK (char_length(comprador_nombre) >= 3),
  comprador_correo           varchar(254) NOT NULL
                             CHECK (char_length(comprador_correo) >= 6 AND comprador_correo = lower(comprador_correo)
                                    AND comprador_correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  comprador_telefono         varchar(13) NOT NULL CHECK (comprador_telefono ~ '^\+573[0-9]{9}$'),
  comprador_documento        varchar(10) CHECK (comprador_documento ~ '^[0-9]{6,10}$'),
  medio_pago                 medio_pago,
  autoriza_tratamiento_datos boolean NOT NULL CHECK (autoriza_tratamiento_datos),
  total_cop                  integer NOT NULL CHECK (total_cop >= 0),
  estado                     estado_orden NOT NULL DEFAULT 'pendiente',
  expira_en                  timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  pagada_en                  timestamptz,
  referencia_pago            varchar(64) CHECK (char_length(referencia_pago) >= 1),
  creado_en                  timestamptz NOT NULL DEFAULT now(),
  actualizado_en             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orden_medio_pago_ck CHECK ((total_cop = 0) = (medio_pago IS NULL)),
  CONSTRAINT orden_pagada_en_ck CHECK ((estado IN ('pagada', 'reembolsada')) = (pagada_en IS NOT NULL)),
  CONSTRAINT orden_referencia_ck CHECK ((estado IN ('pagada', 'reembolsada') AND total_cop > 0) = (referencia_pago IS NOT NULL)),
  CONSTRAINT orden_expira_ck CHECK (expira_en > creado_en)
);
CREATE INDEX orden_evento_idx ON orden (evento_id, creado_en DESC);
CREATE INDEX orden_pendiente_expira_idx ON orden (expira_en) WHERE estado = 'pendiente';
CREATE UNIQUE INDEX orden_referencia_pago_key ON orden (referencia_pago) WHERE referencia_pago IS NOT NULL;

CREATE TABLE item_orden (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id            uuid NOT NULL REFERENCES orden (id) ON DELETE CASCADE,
  tipo_boleta_id      uuid NOT NULL REFERENCES tipo_boleta (id) ON DELETE RESTRICT,
  cantidad            smallint NOT NULL CHECK (cantidad BETWEEN 1 AND 20),
  precio_unitario_cop integer NOT NULL CHECK (precio_unitario_cop >= 0),
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_orden_orden_id_tipo_boleta_id_key UNIQUE (orden_id, tipo_boleta_id)
);
CREATE INDEX item_orden_tipo_idx ON item_orden (tipo_boleta_id);

CREATE TABLE boleta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id       uuid NOT NULL REFERENCES orden (id) ON DELETE RESTRICT,
  tipo_boleta_id uuid NOT NULL REFERENCES tipo_boleta (id) ON DELETE RESTRICT,
  codigo         varchar(14) NOT NULL CONSTRAINT boleta_codigo_key UNIQUE
                 CHECK (codigo ~ '^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$'),
  titular_nombre varchar(120) NOT NULL CHECK (char_length(titular_nombre) >= 3),
  estado         estado_boleta NOT NULL DEFAULT 'valida',
  usada_en       timestamptz,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boleta_usada_en_ck CHECK ((estado = 'usada') = (usada_en IS NOT NULL)),
  -- La boleta sale de una línea de su orden: el par existe en item_orden.
  CONSTRAINT boleta_item_orden_fk FOREIGN KEY (orden_id, tipo_boleta_id)
    REFERENCES item_orden (orden_id, tipo_boleta_id) ON DELETE RESTRICT
);
CREATE INDEX boleta_orden_idx ON boleta (orden_id);
CREATE INDEX boleta_tipo_idx  ON boleta (tipo_boleta_id);

CREATE TABLE validacion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id      uuid NOT NULL REFERENCES evento (id) ON DELETE RESTRICT,
  boleta_id      uuid REFERENCES boleta (id) ON DELETE RESTRICT,
  codigo_leido   varchar(64) NOT NULL CHECK (char_length(codigo_leido) >= 1),
  resultado      resultado_validacion NOT NULL,
  motivo         motivo_rechazo,
  puerta         varchar(40) NOT NULL DEFAULT 'Principal' CHECK (char_length(puerta) >= 2),
  validada_por   varchar(120) NOT NULL CHECK (char_length(validada_por) >= 2),
  validada_en    timestamptz NOT NULL DEFAULT now(),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT validacion_motivo_ck CHECK ((resultado = 'aceptada') = (motivo IS NULL)),
  CONSTRAINT validacion_no_existe_ck CHECK (motivo IS DISTINCT FROM 'no_existe' OR boleta_id IS NULL)
);
CREATE INDEX validacion_evento_idx ON validacion (evento_id, validada_en DESC);
CREATE UNIQUE INDEX validacion_una_aceptada_idx ON validacion (boleta_id) WHERE resultado = 'aceptada';

-- Campos de control: actualizado_en en cada UPDATE; en evento además sube version
-- y el slug no cambia (los enlaces compartidos siguen sirviendo).
CREATE FUNCTION tocar_actualizado_en() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  IF TG_TABLE_NAME = 'evento' THEN
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'evento.slug es inmutable' USING ERRCODE = 'check_violation';
    END IF;
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER organizador_actualizado_en BEFORE UPDATE ON organizador FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();
CREATE TRIGGER evento_actualizado_en      BEFORE UPDATE ON evento      FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();
CREATE TRIGGER tipo_boleta_actualizado_en BEFORE UPDATE ON tipo_boleta FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();
CREATE TRIGGER orden_actualizado_en       BEFORE UPDATE ON orden       FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();
CREATE TRIGGER item_orden_actualizado_en  BEFORE UPDATE ON item_orden  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();
CREATE TRIGGER boleta_actualizado_en      BEFORE UPDATE ON boleta      FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();
CREATE TRIGGER validacion_actualizado_en  BEFORE UPDATE ON validacion  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();
