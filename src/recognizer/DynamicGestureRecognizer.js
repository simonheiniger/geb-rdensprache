import { SignRecognizer } from "./SignRecognizer.js";

/**
 * Erkenner für dynamische (zeitliche) DSGS Bewegungen.
 * Nutzt einen Sliding-Window Ansatz (Historie von Videoframes).
 */
export class DynamicGestureRecognizer extends SignRecognizer {
    constructor() {
        super();
        this.history = [];
        this.maxHistoryLines = 30; // Etwa 1 Sekunde bei 30fps
        this.lastDynamicSign = null;
        this.cooldown = 0; // Cooldown frames after a detection
    }

    recognize(results) {
        if (this.cooldown > 0) {
            this.cooldown--;
            this.history = []; // Clear history during cooldown to prevent double detection
            return null; 
        }

        if (!results.landmarks || results.landmarks.length === 0) {
            // Hand lost, clear history slightly or fully
            this.history = [];
            return null;
        }

        const landmarks = results.landmarks[0];
        const wrist = landmarks[0];

        // Frame Historie pflegen
        this.history.push({
            x: wrist.x,
            y: wrist.y,
            z: wrist.z,
            lm: landmarks
        });

        if (this.history.length > this.maxHistoryLines) {
            this.history.shift(); // Ältesten Eintrag löschen
        }

        const detected = this._analyzeTrajectory();
        if (detected) {
            this.lastDynamicSign = detected;
            this.cooldown = 20; // Blockiere neue Detektionen für ~0.6 Sekunden
            return { text: detected, confidence: 1.0, isDynamic: true };
        }

        return null;
    }

    _analyzeTrajectory() {
        // Wir brauchen mindestens 15 Frames für eine sinnvolle BewegungAnalyse
        if (this.history.length < 15) return null;

        const first = this.history[0];
        const last = this.history[this.history.length - 1];

        // Totale Bewegung
        const dx = last.x - first.x;
        const dy = last.y - first.y;

        // --- Geste: DANKE ---
        // Bewegung der flachen/offenen Hand von oben nach vorn/unten.
        // In MediaPipe Koordinaten: y wird größer (nach unten).
        if (dy > 0.15 && Math.abs(dx) < 0.1) {
            // War die Hand halbwegs geöffnet (Index und Middle oben)?
            const lm = last.lm;
            if (lm[8].y < lm[5].y && lm[12].y < lm[9].y) {
                return "Danke!";
            }
        }

        // --- Geste: WINKEN ---
        // Richtungswechsel der X-Achse analysieren (Wedeln der Hand)
        let directionChanges = 0;
        let lastDirection = 0; // 1 = rechts, -1 = links
        
        for (let i = 1; i < this.history.length; i++) {
            let delta = this.history[i].x - this.history[i-1].x;
            if (Math.abs(delta) > 0.01) { // Rauschen ignorieren
                let currentDir = delta > 0 ? 1 : -1;
                if (lastDirection !== 0 && currentDir !== lastDirection) {
                    directionChanges++;
                }
                lastDirection = currentDir;
            }
        }

        if (directionChanges >= 2 && Math.abs(dx) < 0.2) {
            // Mindestens 2 Richtungswechsel (Winken) und offene Hand
            const lm = last.lm;
            if (lm[8].y < lm[5].y && lm[12].y < lm[9].y && lm[16].y < lm[13].y && lm[20].y < lm[17].y) {
                return "Winken 👋";
            }
        }

        return null;
    }
}
