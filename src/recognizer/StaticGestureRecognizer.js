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

        // Horizontale Daumen-Erkennung: Distanz zum Handgelenk vergleichen (Daumen ist zur Seite gestreckt)
        // Bei rechter Hand zeigt Daumen nach links (-x), bei linker Hand nach rechts (+x)
        const thumbTip = lm[4];
        const indexMcp = lm[5];
        const isThumbExtendedSides = Math.abs(thumbTip.x - indexMcp.x) > 0.08; 
        const isThumbUp = lm[4].y < lm[3].y && lm[4].y < lm[5].y;

        const indexExtended = isExtended(8, 6);
        const middleExtended = isExtended(12, 10);
        const ringExtended = isExtended(16, 14);
        const pinkyExtended = isExtended(20, 18);

        // Eine Hand voller ausgestreckter Finger: "Hallo" / "Offene Hand"
        if (isThumbExtendedSides && indexExtended && middleExtended && ringExtended && pinkyExtended) {
            return "Hallo / 5";
        }

        // B: Alle vier Finger gerade hoch, Daumen gefaltet
        if (!isThumbExtendedSides && indexExtended && middleExtended && ringExtended && pinkyExtended) {
            return "B";
        }

        // Alle Finger unten außer Zeigefinger: "1" oder DSGS "D" 
        if (!isThumbExtendedSides && !isThumbUp && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
            return "Zeigefinger / D / 1";
        }

        // Peace-Zeichen / "V"
        if (!isThumbExtendedSides && indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
            return "V";
        }

        // L: Daumen zur Seite gestreckt, Zeigefinger hoch, Rest gefaltet
        if (isThumbExtendedSides && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
            return "L";
        }

        // Y: Daumen zur Seite gestreckt, Pinky hoch, Rest gefaltet
        if (isThumbExtendedSides && !indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
            return "Y";
        }

        // I: Nur Pinky hoch, Rest gefaltet
        if (!isThumbExtendedSides && !indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
            return "I";
        }

        // Geschlossene Faust ('A' oder 'S' im Alphabet ähnlich)
        if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended && !isThumbExtendedSides && !isThumbUp) {
            return "Faust / A / S";
        }

        // Daumen hoch (Gut!)
        if (isThumbUp && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
            return "Gut! (Daumen hoch)";
        }

        return null; // Keine spezifische Geste erkannt
    }
}
