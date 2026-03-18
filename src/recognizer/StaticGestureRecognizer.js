import { SignRecognizer } from "./SignRecognizer.js";

/**
 * Erkenner für statische DSGS Finger-Buchstaben & Gesten.
 */
export class StaticGestureRecognizer extends SignRecognizer {
    constructor() {
        super();
        this.lastSign = null;
        this.frameCount = 0;
        this.requiredFrames = 10; // Sign must be stable for 10 frames
    }

    recognize(results) {
        if (!results.landmarks || results.landmarks.length === 0) {
            this.frameCount = 0;
            return null;
        }

        // Wir werten vorerst nur die erste erkannte Hand aus
        const landmarks = results.landmarks[0];
        const handedness = results.handednesses && results.handednesses[0] && results.handednesses[0][0] ? results.handednesses[0][0].displayName : "Left";
        
        let detected = this._detectStaticSign(landmarks, handedness);

        if (detected) {
            if (detected === this.lastSign) {
                this.frameCount++;
            } else {
                this.lastSign = detected;
                this.frameCount = 1;
            }

            if (this.frameCount >= this.requiredFrames) {
                return { text: detected, confidence: 1.0 };
            }
        } else {
            this.frameCount = 0;
        }

        return { text: "...", confidence: 0 };
    }

    _detectStaticSign(lm, handedness) {
        // y: Kleiner Wert = weiter oben im Bild
        const isExtended = (tip, pip) => lm[tip].y < lm[pip].y;

        const thumbExtendedY = isExtended(4, 3);
        const indexExtended = isExtended(8, 6);
        const middleExtended = isExtended(12, 10);
        const ringExtended = isExtended(16, 14);
        const pinkyExtended = isExtended(20, 18);

        // Eine Hand voller ausgestreckter Finger: "Hallo" / "Offene Hand"
        if (thumbExtendedY && indexExtended && middleExtended && ringExtended && pinkyExtended) {
            return "Hallo";
        }

        // Alle Finger unten außer Zeigefinger: "1" oder DSGS "D" (oft ähnlich)
        if (!thumbExtendedY && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
            return "Zeigefinger / 1";
        }

        // Peace-Zeichen / "V"
        if (!thumbExtendedY && indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
            return "V";
        }

        // Geschlossene Faust ('A' oder 'S' im Alphabet ähnlich)
        if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
            return "Faust";
        }

        // Daumen hoch (Gut!)
        if (thumbExtendedY && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
            // Check if thumb is pointing up
            if(lm[4].y < lm[3].y && lm[4].y < lm[5].y) {
                return "Gut! (Daumen hoch)";
            }
        }

        return null; // Keine spezifische Geste erkannt
    }
}
