// M04 · Clasificación temática — baseline determinístico por reglas de palabras
// clave. La IA (P01) es el método principal; este baseline sirve para comparar
// (IA-05) y como respaldo sin internet (T10).
import { config } from "../config.js";

const REGLAS_TEMAS = [
  {
    tema: "eventos_naturales",
    patrones: ["sismo", "temblor", "terremoto", "inundaci", "hurac", "tormenta", "sequ", "erupci", "volc", "lluvia"],
  },
  {
    tema: "logistica_canal",
    patrones: ["canal", "puerto", "logístic", "tránsito", "buque", "navier", "aduana", "carga", "panamax", "esclusa"],
  },
  {
    tema: "turismo",
    patrones: ["turis", "hotel", "visitante", "ocupaci", "destino", "aerolínea", "vuelo"],
  },
  {
    tema: "economia",
    patrones: ["pib", "inflaci", "desempleo", "econom", "crecimiento", "inversi", "exportaci", "importaci", "mercado", "banca", "finanz", "fiscal", "monetar"],
  },
  {
    tema: "servicios_publicos",
    patrones: ["agua", "electric", "energ", "salud", "educaci", "transporte", "idaan", "etesa", "aseo", "internet", "telecom"],
  },
  {
    tema: "regulacion",
    patrones: ["ley", "decreto", "regulaci", "norma", "resoluci", "asamblea", "gobierno", "reforma", "ministerio", "licitaci"],
  },
];

export function clasificarTema(texto) {
  const t = String(texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let mejor = "otros";
  let mejorAciertos = 0;
  for (const regla of REGLAS_TEMAS) {
    let aciertos = 0;
    for (const p of regla.patrones) {
      if (t.includes(p)) aciertos++;
    }
    if (aciertos > mejorAciertos) {
      mejor = regla.tema;
      mejorAciertos = aciertos;
    }
  }
  return mejor;
}

// Mapeo tema → sectores potencialmente relacionados (Banca). El resultado es una
// propuesta de IA (P01) acotada a la lista controlada; aquí va el baseline.
const TEMA_SECTORES = {
  economia: ["Sistema financiero (agregado)", "Comercio y Zona Libre de Colón"],
  logistica_canal: ["Logística, puertos y Canal", "Comercio y Zona Libre de Colón"],
  turismo: ["Turismo y hotelería"],
  servicios_publicos: ["Energía y servicios públicos", "Telecomunicaciones y economía digital"],
  eventos_naturales: ["Energía y servicios públicos", "Agropecuario", "Logística, puertos y Canal"],
  regulacion: ["Sector público y regulación", "Sistema financiero (agregado)"],
  otros: [],
};

export function sectoresDesdeTema(tema) {
  return (TEMA_SECTORES[tema] || []).filter((s) => config.sectores.includes(s));
}
