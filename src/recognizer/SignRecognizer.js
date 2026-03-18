/**
 * Basis-Klasse/Interface für Gestenerkenner.
 * Dies bereitet die Architektur für künftige dynamische Modelle vor.
 */
export class SignRecognizer {
    constructor() {
        if (this.constructor === SignRecognizer) {
            throw new Error("Abstract class cannot be instantiated");
        }
    }

    /**
     * @param {Object} frameData - Aktuelle Frame-Daten (z.B. MediaPipe Landmark-Results)
     * @returns {Object|null} - Ergebnis-Objekt, z.B. { text: "Hallo", confidence: 0.9 }
     */
    recognize(frameData) {
        throw new Error("Must implement recognize method");
    }
}
