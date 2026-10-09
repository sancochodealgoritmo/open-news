-- open-news · Esquema MySQL 2.1 (adaptado a la data real).
-- Sistema de registro operativo. Idempotente (CREATE TABLE IF NOT EXISTS).
-- Documento de referencia: docs/PLAN-MYSQL-SYNC.md

-- ===== Corpus =====
CREATE TABLE IF NOT EXISTS fuentes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medio VARCHAR(200) NOT NULL,
  familia CHAR(1) NOT NULL,
  nivel VARCHAR(4),
  url_feed TEXT,
  tipo_acceso VARCHAR(40),
  estado_feed VARCHAR(20) DEFAULT 'nueva',
  licencia VARCHAR(120),
  cobertura_desde DATE NULL,
  cobertura_hasta DATE NULL,
  sha256 CHAR(64),
  captura_utc DATETIME,
  UNIQUE KEY uq_fuente_medio (medio)
);

CREATE TABLE IF NOT EXISTS capturas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha_utc DATETIME NOT NULL,
  origen VARCHAR(40),
  http_status INT NULL,
  bytes INT NULL,
  sha256 CHAR(64),
  items INT,
  nuevos INT,
  actualizados INT,
  rechazados INT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS noticias (
  id_noticia VARCHAR(64) PRIMARY KEY,
  id_estable VARCHAR(64),
  titulo TEXT NOT NULL,
  url TEXT NOT NULL,
  url_canonica TEXT,
  medio VARCHAR(200),
  dominio VARCHAR(200),
  idioma CHAR(8),
  fecha_publicacion DATETIME NULL,
  fecha_deteccion DATETIME,
  fecha_extraccion DATETIME,
  tema VARCHAR(40),
  origen VARCHAR(40),
  alcance_texto VARCHAR(30),
  descripcion TEXT,
  procedencia VARCHAR(200),
  id_evento VARCHAR(64) NULL,
  snapshot_hash CHAR(64)
);

CREATE TABLE IF NOT EXISTS indicadores (
  pais_iso3 CHAR(3) NOT NULL,
  indicador_id VARCHAR(32) NOT NULL,
  anio SMALLINT NOT NULL,
  valor DECIMAL(20,4) NULL,
  unidad VARCHAR(80),
  fuente_url TEXT,
  fecha_extraccion DATETIME,
  licencia VARCHAR(120),
  PRIMARY KEY (pais_iso3, indicador_id, anio)
);

CREATE TABLE IF NOT EXISTS sismos (
  id VARCHAR(64) PRIMARY KEY,
  mag DECIMAL(4,1) NULL,
  place VARCHAR(200),
  time_ms BIGINT,
  url TEXT,
  lon DECIMAL(9,5),
  lat DECIMAL(9,5),
  depth DECIMAL(9,2),
  type VARCHAR(40)
);

CREATE TABLE IF NOT EXISTS oficiales (
  id_oficial VARCHAR(64) PRIMARY KEY,
  id_fuente INT NULL,
  familia CHAR(1),
  nivel VARCHAR(4),
  institucion VARCHAR(200),
  titulo TEXT,
  url TEXT,
  fecha_publicacion DATETIME NULL,
  fecha_captura DATETIME,
  tema VARCHAR(40),
  tipo VARCHAR(40)
);

-- ===== SBP (Superintendencia de Bancos de Panamá) =====
CREATE TABLE IF NOT EXISTS sbp (
  id VARCHAR(64) PRIMARY KEY,
  institucion VARCHAR(200),
  indicador VARCHAR(200),
  periodo VARCHAR(20),
  valor DECIMAL(20,4) NULL,
  unidad VARCHAR(80),
  fuente_url TEXT,
  fecha_captura DATETIME,
  licencia VARCHAR(120)
);

-- ===== Núcleo =====
CREATE TABLE IF NOT EXISTS eventos (
  id_evento VARCHAR(64) PRIMARY KEY,
  n_notas INT,
  n_procedencias INT,
  fecha_original DATETIME NULL,
  fecha_publicacion DATETIME NULL,
  fecha_deteccion DATETIME NULL,
  tema VARCHAR(160),
  geo VARCHAR(20),
  contradiccion_abierta TINYINT(1),
  es_recirculacion TINYINT(1),
  fecha_conocida TINYINT(1),
  vinculo_oficial TINYINT(1),
  fuente_primaria TINYINT(1),
  texto_disponible TINYINT(1),
  hito_proximo_7dias TINYINT(1),
  impacto_nivel INT,
  impacto_citado TINYINT(1),
  miembros JSON,
  titulos JSON,
  medios JSON,
  dominios JSON,
  filtro JSON,
  contexto_oficial JSON
);

CREATE TABLE IF NOT EXISTS evento_noticias (
  id_evento VARCHAR(64),
  id_noticia VARCHAR(64),
  PRIMARY KEY (id_evento, id_noticia)
);

CREATE TABLE IF NOT EXISTS afirmaciones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_evento VARCHAR(64),
  tipo VARCHAR(30),
  texto TEXT,
  cifra DECIMAL(20,4) NULL,
  unidad VARCHAR(40) NULL,
  periodo VARCHAR(40) NULL,
  pasaje TEXT,
  cita_valida TINYINT(1),
  es_central TINYINT(1)
);

CREATE TABLE IF NOT EXISTS citas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_evento VARCHAR(64),
  id_evidencia VARCHAR(64),
  pasaje TEXT
);

CREATE TABLE IF NOT EXISTS fichas (
  id_caso VARCHAR(64) NOT NULL,
  id_evento VARCHAR(64),
  modalidad VARCHAR(20) NOT NULL,
  tema VARCHAR(160),
  P DECIMAL(5,1),
  R DECIMAL(5,2),
  I DECIMAL(5,2),
  U DECIMAL(5,2),
  N DECIMAL(5,2),
  E DECIMAL(5,2),
  banda VARCHAR(10),
  version_reglas VARCHAR(40),
  estado_evidencia VARCHAR(20),
  estado_revision VARCHAR(30),
  ruta_fd VARCHAR(20),
  nivel_atencion VARCHAR(30),
  alcance_texto VARCHAR(30),
  corresponde_aviso TINYINT(1),
  resumen TEXT,
  accion_recomendada TEXT,
  liberacion JSON,
  ficha_json JSON,
  PRIMARY KEY (id_caso, modalidad)
);

CREATE TABLE IF NOT EXISTS senales_ficha (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_ficha VARCHAR(64),
  codigo VARCHAR(10),
  nivel VARCHAR(20),
  origen VARCHAR(20),
  razon TEXT,
  UNIQUE KEY uq_senal (id_ficha, codigo)
);

-- ===== Registro solo-anejo =====
CREATE TABLE IF NOT EXISTS revisiones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_caso VARCHAR(64),
  hacia VARCHAR(30),
  persona VARCHAR(120),
  utilidad TINYINT NULL,
  motivo TEXT,
  ts DATETIME,
  datos JSON
);

CREATE TABLE IF NOT EXISTS verificaciones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_caso VARCHAR(64),
  accion VARCHAR(20),
  persona VARCHAR(120),
  motivo TEXT,
  ts DATETIME,
  datos JSON
);

CREATE TABLE IF NOT EXISTS entregables (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_caso VARCHAR(64),
  modalidad VARCHAR(20),
  origen VARCHAR(40),
  ts DATETIME,
  datos JSON
);

CREATE TABLE IF NOT EXISTS consultas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_caso VARCHAR(64),
  modalidad VARCHAR(20),
  pregunta TEXT,
  intencion VARCHAR(30),
  ts DATETIME,
  datos JSON
);

CREATE TABLE IF NOT EXISTS bitacora (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(30),
  detalle TEXT,
  autor VARCHAR(120),
  ts DATETIME,
  datos JSON
);

-- ===== Operación =====
CREATE TABLE IF NOT EXISTS ejecuciones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  run VARCHAR(120),
  conjunto VARCHAR(20),
  version VARCHAR(40),
  mediana_s DECIMAL(8,2),
  p95_s DECIMAL(8,2),
  tokens BIGINT,
  costo_usd DECIMAL(10,4),
  fecha DATE,
  metricas JSON
);

CREATE TABLE IF NOT EXISTS cache_llm (
  clave CHAR(64) PRIMARY KEY,
  version_prompt VARCHAR(40),
  modelo VARCHAR(40),
  entrada_hash CHAR(64),
  salida TEXT,
  ts DATETIME
);

CREATE TABLE IF NOT EXISTS esquema_version (
  version VARCHAR(40) PRIMARY KEY,
  aplicada_utc DATETIME,
  notas TEXT
);

-- ===== Triggers solo-anejo (registro) =====
CREATE TRIGGER IF NOT EXISTS trg_revisiones_no_update BEFORE UPDATE ON revisiones FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar';
CREATE TRIGGER IF NOT EXISTS trg_revisiones_no_delete BEFORE DELETE ON revisiones FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar';
CREATE TRIGGER IF NOT EXISTS trg_verificaciones_no_update BEFORE UPDATE ON verificaciones FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar';
CREATE TRIGGER IF NOT EXISTS trg_verificaciones_no_delete BEFORE DELETE ON verificaciones FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar';
CREATE TRIGGER IF NOT EXISTS trg_entregables_no_update BEFORE UPDATE ON entregables FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar';
CREATE TRIGGER IF NOT EXISTS trg_entregables_no_delete BEFORE DELETE ON entregables FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar';
CREATE TRIGGER IF NOT EXISTS trg_consultas_no_update BEFORE UPDATE ON consultas FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar';
CREATE TRIGGER IF NOT EXISTS trg_consultas_no_delete BEFORE DELETE ON consultas FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar';
CREATE TRIGGER IF NOT EXISTS trg_bitacora_no_update BEFORE UPDATE ON bitacora FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar';
CREATE TRIGGER IF NOT EXISTS trg_bitacora_no_delete BEFORE DELETE ON bitacora FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro solo anexar';
