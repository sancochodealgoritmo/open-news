# Plan de adaptación: MySQL + sync Notion + coherencia

> **Estado: implementado (9 oct 2026).** [`db/esquema.sql`](open-news/db/esquema.sql:1) creado; [`sync.js`](open-news/src/notion/sync.js:1) reescrito con normalizadores y probado con humo (ficha `EV-b8e6183938c51a95` → page Notion); ajustes de esquema en Notion aplicados (`Ruta FD`, `Liberado por`, `Motivo de liberación`, `SC-10` en Señales); [`precache.js`](open-news/scripts/precache.js:28) corregido para que `fichas.jsonl` sea JSONL de fichas reales.

Con la visión completa de la data (noticia/evento/ficha/revisión) y del esquema real de Notion, este documento ajusta el análisis para: (1) adaptar el **esquema MySQL** a los campos reales, (2) alinear el **sync Notion** con el esquema real y (3) revisar la **coherencia** entre MySQL, Notion y la data (con ajustes en Notion donde haga falta).

---

## 1. Estructura real de la data (referencia)

- **Noticia**: `id_noticia, titulo, url, url_canonica, id_estable, medio, idioma, fecha_publicacion, fecha_deteccion, fecha_extraccion, tema, origen, alcance_texto, descripcion, procedencia, dominio, id_evento`.
- **Evento**: `id_evento, miembros, n_notas, n_procedencias, procedencias, fecha_original, fecha_publicacion, fecha_deteccion, medios, dominios, titulos, tema, geo, afirmaciones, contradiccion_abierta, impacto, similitud_previa, es_recirculacion, fecha_conocida, vinculo_oficial, fuente_primaria, texto_disponible, hito_proximo_7dias, filtro, contexto_oficial`.
- **Ficha**: `id_caso, modalidad, tema, ids_fuente, procedencias, fecha_original, afirmaciones, citas, puntaje, componentes, banda, version_reglas, estado_evidencia, senales, alcance_texto, corresponde_aviso, ruta_fd, nivel_atencion, senales_detalle, verificaciones_pendientes, liberacion, resumen, vacios, accion_recomendada, id_evento`.
- **Revisión**: `id_caso, hacia, persona, detalle{utilidad, motivo}, timestamp`.

---

## 2. Esquema MySQL adaptado a la data real

Sistema de registro operativo. Columnas derivadas **directamente de los campos reales**; lo flexible se guarda en `JSON`.

```sql
-- Corpus
CREATE TABLE fuentes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medio VARCHAR(200) NOT NULL,
  familia CHAR(1) NOT NULL,            -- A noticias · B BM · C USGS · D SBP · E/F/G/I oficiales
  nivel VARCHAR(4),                    -- N1..N6
  url_feed TEXT,
  tipo_acceso VARCHAR(40),
  estado_feed VARCHAR(20) DEFAULT 'nueva',
  licencia VARCHAR(120),
  cobertura_desde DATE NULL,
  cobertura_hasta DATE NULL,
  sha256 CHAR(64),
  captura_utc DATETIME
);

CREATE TABLE capturas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha_utc DATETIME NOT NULL,
  origen VARCHAR(40),                  -- TVN RSS | GDELT | Banco Mundial | USGS
  http_status INT NULL,
  bytes INT NULL,
  sha256 CHAR(64),
  items INT, nuevos INT, actualizados INT, rechazados INT,
  error TEXT
);

CREATE TABLE noticias (
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

CREATE TABLE indicadores (
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

CREATE TABLE sismos (
  id VARCHAR(64) PRIMARY KEY,
  mag DECIMAL(4,1) NULL,
  place VARCHAR(200),
  time_ms BIGINT,
  url TEXT,
  lon DECIMAL(9,5), lat DECIMAL(9,5), depth DECIMAL(9,2),
  type VARCHAR(40)
);

CREATE TABLE oficiales (
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

-- Núcleo
CREATE TABLE eventos (
  id_evento VARCHAR(64) PRIMARY KEY,
  n_notas INT, n_procedencias INT,
  fecha_original DATETIME NULL,
  fecha_publicacion DATETIME NULL,
  fecha_deteccion DATETIME NULL,
  tema VARCHAR(160),                  -- puede ser texto libre de la IA
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
  miembros JSON, titulos JSON, medios JSON, dominios JSON,
  filtro JSON, contexto_oficial JSON
);

CREATE TABLE evento_noticias (
  id_evento VARCHAR(64), id_noticia VARCHAR(64),
  PRIMARY KEY (id_evento, id_noticia)
);

CREATE TABLE afirmaciones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_evento VARCHAR(64),
  tipo VARCHAR(30), texto TEXT,
  cifra DECIMAL(20,4) NULL, unidad VARCHAR(40) NULL, periodo VARCHAR(40) NULL,
  pasaje TEXT, cita_valida TINYINT(1), es_central TINYINT(1)
);

CREATE TABLE citas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_evento VARCHAR(64), id_evidencia VARCHAR(64), pasaje TEXT
);

CREATE TABLE fichas (
  id_caso VARCHAR(64) PRIMARY KEY,
  id_evento VARCHAR(64),
  modalidad VARCHAR(20),
  tema VARCHAR(160),
  P DECIMAL(5,1),
  R DECIMAL(5,2), I DECIMAL(5,2), U DECIMAL(5,2), N DECIMAL(5,2), E DECIMAL(5,2),
  banda VARCHAR(10),
  version_reglas VARCHAR(40),
  estado_evidencia VARCHAR(20),
  estado_revision VARCHAR(30),
  ruta_fd VARCHAR(20),
  nivel_atencion VARCHAR(30),
  alcance_texto VARCHAR(30),
  corresponde_aviso TINYINT(1),
  resumen TEXT, accion_recomendada TEXT,
  liberacion JSON,
  ficha_json JSON
);

CREATE TABLE senales_ficha (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_ficha VARCHAR(64), codigo VARCHAR(10), nivel VARCHAR(20), origen VARCHAR(20), razon TEXT
);

-- Registro solo-anejo (disparadores BEFORE UPDATE/DELETE)
CREATE TABLE revisiones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_caso VARCHAR(64), hacia VARCHAR(30), persona VARCHAR(120),
  utilidad TINYINT NULL, motivo TEXT, ts DATETIME, datos JSON
);
CREATE TABLE verificaciones (id BIGINT AUTO_INCREMENT PRIMARY KEY, id_caso VARCHAR(64), accion VARCHAR(20), persona VARCHAR(120), motivo TEXT, ts DATETIME, datos JSON);
CREATE TABLE entregables (id BIGINT AUTO_INCREMENT PRIMARY KEY, id_caso VARCHAR(64), modalidad VARCHAR(20), origen VARCHAR(40), ts DATETIME, datos JSON);
CREATE TABLE consultas (id BIGINT AUTO_INCREMENT PRIMARY KEY, id_caso VARCHAR(64), modalidad VARCHAR(20), pregunta TEXT, intencion VARCHAR(30), ts DATETIME, datos JSON);
CREATE TABLE bitacora (id BIGINT AUTO_INCREMENT PRIMARY KEY, tipo VARCHAR(30), detalle TEXT, autor VARCHAR(120), ts DATETIME, datos JSON);

-- Operación
CREATE TABLE ejecuciones (id BIGINT AUTO_INCREMENT PRIMARY KEY, run VARCHAR(120), conjunto VARCHAR(20), version VARCHAR(40), mediana_s DECIMAL(8,2), p95_s DECIMAL(8,2), tokens BIGINT, costo_usd DECIMAL(10,4), fecha DATE, metricas JSON);
CREATE TABLE cache_llm (clave CHAR(64) PRIMARY KEY, version_prompt VARCHAR(40), modelo VARCHAR(40), entrada_hash CHAR(64), salida TEXT, ts DATETIME);
CREATE TABLE esquema_version (version VARCHAR(40) PRIMARY KEY, aplicada_utc DATETIME, notas TEXT);
```

**Reglas**:
- Todo lo que el servidor necesita para reconstruir bandejas/fichas vive en MySQL; `data/` queda como corpus reproducible (manifest SHA-256) y respaldo JSONL.
- Registro solo-anejo con triggers (`BEFORE UPDATE`/`DELETE` → error).
- `fichas.ficha_json` conserva la ficha completa; las columnas son para filtros/índices.

---

## 3. Sync Notion ajustado (reescritura de [`sync.js`](open-news/src/notion/sync.js:1))

### 3.1 Normalizadores de select (contra las opciones reales)

```js
const MODALIDAD = { principal: "TVN · Principal", digital: "TVN · Digital", banca: "Banca" };
const TEMA = {
  economia: "economía", logistica_canal: "logística/Canal", turismo: "turismo",
  servicios_publicos: "servicios públicos", eventos_naturales: "eventos naturales",
  regulacion: "regulación", otros: "otros",
};
const NIVEL = { sin_senales: "sin señales", revisar: "revisar", verificacion_prioritaria: "verificación prioritaria" };
const ESTADO_REV = {
  nuevo: "nuevo", en_revision: "en revisión", requiere_evidencia: "requiere evidencia",
  aprobado_borrador: "aprobado como borrador", descartado: "descartado",
};
const ALCANCE = { "titular/metadatos": "solo titular/metadatos", completo: "completo", extracto: "extracto" };
const DECISION = { aprobar: "aceptación", descartar: "descarte", requiere_evidencia: "solicitud de evidencia", tomar: "corrección" };
const SENAL = { "SC-01": "SC-01 Recirculación", "SC-02": "SC-02 Procedencia única replicada", "SC-03": "SC-03 Cifra en conflicto con dato oficial", "SC-04": "SC-04 Atribución ausente", "SC-05": "SC-05 Tono sensacionalista", "SC-06": "SC-06 Fuera de catálogo", "SC-07": "SC-07 Titular vs contenido", "SC-08": "SC-08 Instrucciones incrustadas", "SC-09": "SC-09 Hecho no hallado en fuente oficial", "SC-10": "SC-10 Revisión externa" };
```

### 3.2 `syncFicha` corregido

- `Name`/`ID caso` ← `id_caso`.
- `Modalidad` ← `MODALIDAD[ficha.modalidad]`.
- `Tema` ← `TEMA[normalizarTema(ficha.tema)]` (resolver texto libre a slug, luego al label).
- `P/R/I/U/N/E`, `Procedencias independientes`, `Estado de evidencia`, `Alcance del texto`, `Horizonte`, `Sectores` ← directo con normalizador.
- `Señales` ← `(ficha.senales||[]).map(s => ({ name: SENAL[s.codigo] })).filter(Boolean)`.
- `Afirmaciones`, `Citas`, `IDs fuente`, `Verificaciones pendientes`, `Versión de reglas`, `Versión de prompt`, `Evento`, `Titular elegido` ← rich_text serializado.
- `Ruta FD` ← `ficha.ruta_fd` (**propiedad a añadir en Notion**).
- `Liberado por` / `Motivo de liberación` ← `ficha.liberacion` (**propiedades a añadir en Notion**).
- `Nivel de atención` ← `NIVEL[ficha.nivel_atencion]`.
- `Estado de revisión` ← `ESTADO_REV[ficha.estado_revision || "nuevo"]`.
- `Persona revisora` (**people**) ← resolver `nombre → user_id`; si no hay mapeo, dejar vacío.
- **No escribir** `Banda` (formula).

### 3.3 `syncRevision` corregido

- `Revisión` (title) ← `Rev-{id_caso}-{ts}`.
- `Ficha` (relation) ← page de la ficha.
- `Decisión` ← `DECISION[revision.hacia]`.
- `Persona` (**people**) ← resolver nombre.
- `Motivo`, `Utilidad 1–5`, `Fecha y hora` ← directo.

### 3.4 People (estrategia)

- Mantener mapa `{ nombre → notion_user_id }` en configuración (o en la BD Reglas). Mientras no exista, **omitir** la propiedad people (no escribir rich_text en un campo people).

---

## 4. Coherencia y ajustes necesarios en Notion

### 4.1 Añadir a BD Fichas (hoy faltan; están en la data)

1. `Ruta FD` → **select**: `pasa | con advertencias | retenido`.
2. `Liberado por` → **rich_text**.
3. `Motivo de liberación` → **rich_text**.
4. En `Señales` (multi_select): añadir **`SC-10 Revisión externa`** (la data produce SC-10 y hoy no está en las opciones).

### 4.2 Ajustes en código (no en Notion)

- `Banda` es **formula**: el sync no la escribe.
- `Modalidad`/`Tema`/`Nivel`/`Estado`/`Alcance`/`Decisión`: se normalizan en código (tabla 3.1), no se renombran las opciones de Notion.
- `Persona`/`Persona revisora` (**people**): resolver por mapa de usuarios.

### 4.3 Coherencia MySQL ↔ Notion

- **MySQL es el sistema de registro**; Notion es presentación/traza.
- La sincronización es unidireccional e idempotente (buscar por `ID caso` antes de crear).
- `fichas.ficha_json` conserva todo; Notion solo expone la ficha trabajada con los campos mapeados.
- `fichas.jsonl` debe corregirse para que sea JSONL de fichas reales (hoy contiene las bandejas) — [`precache.js`](open-news/scripts/precache.js:28).

---

## 5. Orden de implementación

1. Corregir `precache.js` (`fichas.jsonl` → fichas reales).
2. Ajustes en Notion: añadir `Ruta FD`, `Liberado por`, `Motivo de liberación`, `SC-10`.
3. Reescribir `sync.js` con los normalizadores (3.1–3.4).
4. Crear `db/esquema.sql` con el esquema adaptado (sección 2) + `db:migrar` idempotente.
5. Prueba de humo: sincronizar una ficha de ejemplo y verificar en Notion.
