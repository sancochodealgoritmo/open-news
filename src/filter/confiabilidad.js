// v1.4 · Confiabilidad de fuentes: jerarquía N1-N6, familias de corroboración E-I
// y mapa tema → instituciones a contrastar (sección 12 del documento).
// Las fuentes de corroboración NO crean eventos ni entran en la bandeja: solo
// contrastan (S3F y componente E).

export const NIVELES = {
  N1: {
    tipo: "Dato oficial estadístico o técnico",
    ejemplos: ["Banco Mundial", "INEC", "SBP", "FMI", "USGS"],
    uso: "Única referencia válida para cifras; respalda o contrasta (SC-03)",
  },
  N2: {
    tipo: "Comunicado oficial institucional",
    ejemplos: ["Ministerios", "autoridades", "Contraloría", "alcaldías", "OPS/OMS"],
    uso: "Fuente primaria de declaraciones; siempre «según la institución…»",
  },
  N3: {
    tipo: "Alerta técnica internacional",
    ejemplos: ["GDACS", "NHC"],
    uso: "Hecho técnico con su alcance; no evidencia de daños o pérdidas",
  },
  N4: {
    tipo: "Medio con procedencia identificable",
    ejemplos: ["TVN", "La Prensa", "Panamá América", "internacionales"],
    uso: "Procedencia para E; agencia replicada = 1",
  },
  N5: {
    tipo: "Revisión de verificador externo",
    ejemplos: ["Google Fact Check", "AFP Factual"],
    uso: "Señal SC-10; nunca etiqueta propia",
  },
  N6: {
    tipo: "Fuera de catálogo o no identificable",
    ejemplos: ["dominios no listados", "redes sin cuenta oficial"],
    uso: "No cuenta como procedencia (SC-06)",
  },
};

// Familias de corroboración (12.2). estado: "verificada" | "por verificar" | "sin RSS".
export const FUENTES_CORROBORACION = [
  // E · Gobierno nacional
  { familia: "E", nivel: "N2", institucion: "Autoridad del Canal de Panamá (ACP)", feed: "https://pancanal.com/feed/", estado: "verificada", temas: ["logistica_canal"] },
  { familia: "E", nivel: "N2", institucion: "Ministerio de Economía y Finanzas (MEF)", feed: "https://mef.gob.pa/feed/", estado: "verificada", temas: ["economia"] },
  { familia: "E", nivel: "N2", institucion: "Ministerio de Relaciones Exteriores (MIRE)", feed: "https://mire.gob.pa/feed/", estado: "verificada", temas: ["otros"] },
  { familia: "E", nivel: "N2", institucion: "Ministerio de Desarrollo Agropecuario (MIDA)", feed: "https://mida.gob.pa/feed/", estado: "verificada", temas: ["otros"] },
  { familia: "E", nivel: "N2", institucion: "Ministerio de Comercio e Industrias (MICI)", feed: "https://mici.gob.pa/feed/", estado: "verificada", temas: ["economia", "logistica_canal"] },
  { familia: "E", nivel: "N2", institucion: "Ministerio de Trabajo (MITRADEL)", feed: "https://mitradel.gob.pa/feed/", estado: "verificada", temas: ["otros"] },
  { familia: "E", nivel: "N2", institucion: "Ministerio de Seguridad (MINSEG)", feed: "https://minseg.gob.pa/feed/", estado: "verificada", temas: ["otros"] },
  { familia: "E", nivel: "N2", institucion: "Ministerio de Gobierno (MINGOB)", feed: "https://mingob.gob.pa/feed/", estado: "verificada", temas: ["otros"] },
  { familia: "E", nivel: "N2", institucion: "Ministerio de Salud (MINSA)", feed: "https://minsa.gob.pa/rss.xml", estado: "verificada", temas: ["servicios_publicos"] },
  { familia: "E", nivel: "N2", institucion: "Autoridad Marítima de Panamá (AMP)", feed: "https://amp.gob.pa/feed/", estado: "verificada", temas: ["logistica_canal"] },
  { familia: "E", nivel: "N2", institucion: "Autoridad Nacional de los Servicios Públicos (ASEP)", feed: "https://asep.gob.pa/feed/", estado: "verificada", temas: ["servicios_publicos", "regulacion"] },
  { familia: "E", nivel: "N2", institucion: "Sistema Nacional de Protección Civil (SINAPROC)", feed: "https://sinaproc.gob.pa/feed/", estado: "verificada", temas: ["eventos_naturales"] },
  { familia: "E", nivel: "N2", institucion: "Autoridad de Turismo de Panamá (ATP)", feed: "https://atp.gob.pa/feed/", estado: "verificada", temas: ["turismo"] },
  { familia: "E", nivel: "N2", institucion: "Contraloría General de la República", feed: "https://contraloria.gob.pa/feed/", estado: "verificada", temas: ["economia", "regulacion"] },
  { familia: "E", nivel: "N2", institucion: "Autoridad de Transparencia (ANTAI)", feed: "https://antai.gob.pa/feed/", estado: "verificada", temas: ["regulacion"] },
  { familia: "E", nivel: "N1", institucion: "INEC (Contraloría)", feed: "https://inec.gob.pa", estado: "sin RSS", temas: ["economia"] },
  { familia: "E", nivel: "N2", institucion: "MOP / MEDUCA / MIVIOT / IDAAN / ETESA / MiAmbiente / ATTT", feed: "/feed/ o rss.xml", estado: "por verificar", temas: ["servicios_publicos", "eventos_naturales"] },

  // F · Gobierno local
  { familia: "F", nivel: "N2", institucion: "Alcaldía de Panamá", feed: "https://mupa.gob.pa/feed/", estado: "verificada", temas: ["servicios_publicos"] },
  { familia: "F", nivel: "N2", institucion: "Alcaldías (San Miguelito, Colón, David, Arraiján, La Chorrera)", feed: "sitio web oficial", estado: "por verificar", temas: ["servicios_publicos"] },
  { familia: "F", nivel: "N6", institucion: "Juntas comunales (corregimientos)", feed: "redes sociales", estado: "sin RSS", temas: [] },

  // G · Internacional oficial, multilateral y técnico
  { familia: "G", nivel: "N3", institucion: "GDACS (ONU / Comisión Europea)", feed: "https://gdacs.org/xml/rss.xml", estado: "verificada", temas: ["eventos_naturales"] },
  { familia: "G", nivel: "N3", institucion: "NOAA · Centro Nacional de Huracanes", feed: "https://www.nhc.noaa.gov/index-at.xml", estado: "verificada", temas: ["eventos_naturales"] },
  { familia: "G", nivel: "N2", institucion: "OPS/OMS", feed: "https://www.paho.org/es/rss.xml", estado: "verificada", temas: ["servicios_publicos"] },
  { familia: "G", nivel: "N1", institucion: "FMI · DataMapper API", feed: "https://www.imf.org/external/datamapper/api/v1/", estado: "verificada", temas: ["economia"] },
  { familia: "G", nivel: "N3", institucion: "ReliefWeb (OCHA)", feed: "https://api.reliefweb.int", estado: "por verificar", temas: ["eventos_naturales"] },
  { familia: "G", nivel: "N1", institucion: "CEPAL / CEPALSTAT · Noticias ONU · BID", feed: "RSS / API", estado: "por verificar", temas: ["economia"] },

  // I · Verificadores externos
  { familia: "I", nivel: "N5", institucion: "Google Fact Check Tools", feed: "https://factchecktools.googleapis.com/v1alpha1/claims:search", estado: "verificada", temas: [] },
  { familia: "I", nivel: "N5", institucion: "AFP Factual / EFE Verifica / Chequeado / Colombiacheck", feed: "sitio / RSS", estado: "por verificar", temas: [] },
];

// Mapa tema → instituciones a contrastar primero (12.4).
export const MAPA_TEMA = {
  economia: {
    nacional: ["MEF", "INEC", "MICI", "Contraloría"],
    local: [],
    internacional: ["FMI", "Banco Mundial", "CEPAL"],
  },
  logistica_canal: {
    nacional: ["ACP", "AMP", "MICI"],
    local: [],
    internacional: ["GDELT internacional"],
  },
  turismo: {
    nacional: ["ATP", "Tocumen"],
    local: ["alcaldías turísticas"],
    internacional: [],
  },
  servicios_publicos: {
    nacional: ["ASEP", "IDAAN", "MINSA", "ATTT", "MEDUCA"],
    local: ["Alcaldía de Panamá", "alcaldías", "juntas comunales"],
    internacional: ["OPS/OMS"],
  },
  eventos_naturales: {
    nacional: ["SINAPROC", "ETESA/Hidromet", "MiAmbiente"],
    local: ["alcaldías", "juntas comunales"],
    internacional: ["GDACS", "NHC", "USGS"],
  },
  regulacion: {
    nacional: ["ASEP", "ANTAI", "Contraloría", "Gaceta Oficial", "Asamblea"],
    local: ["acuerdos municipales"],
    internacional: [],
  },
  otros: {
    nacional: ["MINSEG", "MINGOB", "MIRE", "MITRADEL", "MIDA"],
    local: ["alcaldías"],
    internacional: ["Noticias ONU"],
  },
};

export function institucionesDeTema(tema) {
  const m = MAPA_TEMA[tema] || MAPA_TEMA.otros;
  return [...(m.nacional || []), ...(m.local || []), ...(m.internacional || [])];
}

export function fuenteDeInstitucion(nombre) {
  return FUENTES_CORROBORACION.find((f) => f.institucion.includes(nombre)) || null;
}
