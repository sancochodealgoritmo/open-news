import { EventEmitter } from "node:events";

// Bus de eventos en proceso. Se usa para el streaming SSE de la consulta y del
// procesamiento en vivo (mismo patrón que PreAuth Agent).
export const bus = new EventEmitter();
bus.setMaxListeners(0);
