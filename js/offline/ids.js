/* Identificadores generados en el dispositivo.
 *
 * - Las frases usan UUID: la columna `my_sentences.id` es uuid y acepta un
 *   valor generado por el cliente.
 * - El vocabulario personal usa un entero negativo. La columna es integer
 *   con valor por defecto de secuencia, así que los negativos nunca chocan
 *   con los ids que asigna la nube y no hace falta reasignar referencias.
 */

export function generateUuid() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
        const random = (Math.random() * 16) | 0;
        const value = character === "x" ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}

const LOCAL_ID_FLOOR = 1_000_000_000;
const LOCAL_ID_CEILING = 2_000_000_000;

export function generateLocalIntegerId() {
    const magnitude = LOCAL_ID_FLOOR + Math.floor(Math.random() * (LOCAL_ID_CEILING - LOCAL_ID_FLOOR));
    return -magnitude;
}

export function isLocalIntegerId(value) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric < 0;
}
