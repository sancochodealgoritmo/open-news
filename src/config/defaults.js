// DEFAULTS — fuente única de verdad para parámetros operativos y reglas del
// núcleo de evidencias (mismo patrón que PreAuth). Los pesos y parámetros RIUNE
// están versionados (RIUNE v1.0) y cada cambio exige una decisión en Notion (ARQ-07).
export const DEFAULTS = {
  rulesVersion: "RIUNE v1.0",

  // Pesos del puntaje: P = 30R + 25I + 20U + 15N + 10E (0-100).
  weights: { R: 30, I: 25, U: 20, N: 15, E: 10 },

  // Bandas sin solapamiento. Desempate: mayor U, luego ID ascendente.
  bands: {
    bajo: { min: 0, max: 40 },
    medio: { min: 40, max: 70 },
    alto: { min: 70, max: 100 },
  },

  // Parámetros por modalidad (vida media de urgencia, pesos de tema y bandeja).
  modalidades: {
    principal: {
      etiqueta: "Mesa Editorial",
      hMediaHoras: 72, // agenda diaria
      tamanioBandeja: 5,
      pesosTema: {
        economia: 1.0,
        logistica_canal: 1.0,
        turismo: 1.0,
        servicios_publicos: 1.0,
        eventos_naturales: 1.0,
        regulacion: 1.0,
        otros: 0,
      },
    },
    digital: {
      etiqueta: "Mesa Digital",
      hMediaHoras: 36, // ciclo digital más corto
      tamanioBandeja: 5,
      pesosTema: {
        economia: 1.0,
        logistica_canal: 0.75,
        turismo: 0.75,
        servicios_publicos: 1.0,
        eventos_naturales: 1.0,
        regulacion: 0.75,
        otros: 0,
      },
    },
    banca: {
      etiqueta: "Radar de Entorno",
      hMediaHoras: 336, // 14 días: el análisis sectorial tolera más latencia
      tamanioBandeja: 5,
      pesosTema: {
        economia: 1.0,
        logistica_canal: 1.0,
        turismo: 1.0,
        servicios_publicos: 0.75,
        eventos_naturales: 0.75,
        regulacion: 1.0,
        otros: 0,
      },
    },
  },

  // Clasificación temática: 6 temas del reto + "otros".
  temas: [
    "economia",
    "logistica_canal",
    "turismo",
    "servicios_publicos",
    "eventos_naturales",
    "regulacion",
    "otros",
  ],

  // Lista controlada de 9 sectores (modalidad Banca; V07 y M04).
  sectores: [
    "Comercio y Zona Libre de Colón",
    "Logística, puertos y Canal",
    "Construcción e inmobiliario",
    "Turismo y hotelería",
    "Energía y servicios públicos",
    "Agropecuario",
    "Sistema financiero (agregado)",
    "Sector público y regulación",
    "Telecomunicaciones y economía digital",
  ],

  // Geo para el componente R (Relevancia).
  geo: { panama: 1.0, regional: 0.5, ninguna: 0 },

  // Agrupación de eventos (M05): ventana y umbral semántico.
  ventanaEventosHoras: 72,
  umbralSimilitudTitulo: 0.92, // N2 casi-duplicado (caracteres)
  umbralSimilitudSemantica: 0.7, // N3 embeddings

  // Consulta / abstención (M12).
  umbralAbstencion: 0.5,

  // Estado de evidencia (M10): insuficiente / parcial / suficiente.
  evidenciaEstados: ["insuficiente", "parcial", "suficiente"],

  // Revisión humana (M15): 5 estados.
  revisionEstados: ["nuevo", "en_revision", "requiere_evidencia", "aprobado_borrador", "descartado"],

  // Léxico prohibido como etiqueta de salida (M08, V07, F03): nunca veredictos.
  lexicoProhibido: ["verdadero", "falso", "fake", "bulo", "desinformación confirmada"],

  // Léxico prohibido adicional de Banca (V07): sin recomendación de inversión.
  lexicoBanca: [
    "recomendamos",
    "recomendación de inversión",
    "comprar",
    "vender",
    "sobreponderar",
    "subponderar",
    "pérdidas de la cartera",
    "impago",
    "default",
    "exposición de la cartera",
  ],

  // Avisos literales (V06, SEG-08).
  avisoTitularMetadatos: "Basado únicamente en titular/metadatos",
  avisoBorrador: "Borrador — sujeto a revisión",

  // Límites de los entregables (V05).
  limites: {
    briefPalabras: 250,
    resumenPalabras: 250,
    copyPalabras: 80,
    guionPalabrasMin: 113,
    guionPalabrasMax: 150,
    guionSegundosMin: 45,
    guionSegundosMax: 60,
    titularCaracteres: 70,
    preguntas: 3,
  },

  // Operativos.
  cacheTtlMs: 300_000,
  rateLimitNotion: { porSegundo: 3 },
  timeouts: { notion: 30_000, llm: 60_000 },

  // DeepSeek (generación). deepseek-reasoner R1 primario, deepseek-chat V3 fallback.
  deepseek: {
    modelo: "deepseek-chat",
    modeloRazonador: "deepseek-reasoner",
    temperatura: 0.1,
    maxTokens: 2000,
  },

  // v1.4 · Filtro de desinformación (S3F): rutas y parámetros versionados con RIUNE.
  rutasFiltro: ["pasa", "con_advertencias", "retenido"],
  filtro: {
    umbralSenalesRevisar: 3, // 3 o más señales "revisar" → retenido
    prioritarias: ["SC-03", "SC-08", "SC-09", "SC-10"],
  },

  // v1.4 · Jerarquía de confiabilidad de fuentes (N1-N6).
  nivelesConfiabilidad: ["N1", "N2", "N3", "N4", "N5", "N6"],

  // v1.4 · Paleta de la interfaz (inspirada en TVN, sin usar su marca oficial).
  paleta: {
    primario: "#005588",
    navy: "#0B1220",
    fondo: "#FFFFFF",
    tarjeta: "#F5F7F9",
    texto: "#2A2A2A",
    textoSec: "#5A6673",
    linea: "#E3E7EB",
    aviso: "#FEC526",
    pasa: "#15A34A",
    retenido: "#C0392B",
    modulos: { principal: "#005588", digital: "#06ACCB", banca: "#B8892B" },
  },
};
