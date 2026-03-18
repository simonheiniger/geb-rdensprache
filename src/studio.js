import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm";

let handLandmarker = undefined;
let webcamRunning = false;
let lastVideoTime = -1;

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("webcamButton");
const loadingScreen = document.getElementById("loading");

// Studio Elements
const labelInput = document.getElementById("gesture-label");
const recordBtn = document.getElementById("record-btn");
const trainBtn = document.getElementById("train-btn");
const downloadBtn = document.getElementById("download-btn");
const statusText = document.getElementById("status-text");
const dataCountDisplay = document.getElementById("data-count");
const labelList = document.getElementById("label-list");

// ML Data state
let isRecording = false;
let currentCaptureFrames = [];
const FRAMES_PER_SEQUENCE = 60; // 2 Sekunden bei 30fps
const dataset = []; // Array of { label: string, sequence: number[][] }
let uniqueLabels = [];
let trainedModel = null;

async function createHandLandmarker() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
        });
        loadingScreen.classList.add("hidden");
        enableWebcamButton.disabled = false;
        recordBtn.disabled = false;
    } catch (e) {
        console.error("Error loading MediaPipe:", e);
        loadingScreen.innerText = "Fehler beim Laden der KI Modelle.";
    }
}

createHandLandmarker();

enableWebcamButton.addEventListener("click", () => {
    if (!handLandmarker) return;

    if (webcamRunning === true) {
        webcamRunning = false;
        enableWebcamButton.innerText = "Kamera aktivieren";
        let stream = video.srcObject;
        if(stream) {
            let tracks = stream.getTracks();
            tracks.forEach(t => t.stop());
            video.srcObject = null;
        }
    } else {
        webcamRunning = true;
        enableWebcamButton.innerText = "Kamera deaktivieren";

        const constraints = { video: { width: 1280, height: 720 } };
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        });
    }
});

// Recording Logic
recordBtn.addEventListener("click", () => {
    const label = labelInput.value.trim();
    if (!label) {
        alert("Bitte gib einen Satznamen (Label) ein!");
        return;
    }
    
    // Start Recording state
    isRecording = true;
    currentCaptureFrames = [];
    recordBtn.disabled = true;
    recordBtn.classList.add("is-recording");
    recordBtn.innerHTML = "<span>🔴 WIRD AUFGEZEICHNET...</span>";
    statusText.innerText = `Recording: ${label}`;
});

async function predictWebcam() {
    let startTimeMs = performance.now();

    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        
        let results = handLandmarker.detectForVideo(video, startTimeMs);
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        if (results && results.landmarks && results.landmarks.length > 0) {
            // Visualize
            for (const landmarks of results.landmarks) {
                drawLandmarks(canvasCtx, landmarks, { color: "#3b82f6", lineWidth: 2 });
            }

            // Capture Frame if recording
            if (isRecording) {
                // Flatten landmarks into 1D array of 63 values (x,y,z for 21 points)
                const flatLandmarks = [];
                const hand = results.landmarks[0]; // Currently taking first hand
                for (let i = 0; i < 21; i++) {
                    flatLandmarks.push(hand[i].x, hand[i].y, hand[i].z);
                }
                currentCaptureFrames.push(flatLandmarks);
                statusText.innerText = `Sammle Punkte... (${currentCaptureFrames.length}/${FRAMES_PER_SEQUENCE})`;

                // Stop recording when we hit the required length
                if (currentCaptureFrames.length >= FRAMES_PER_SEQUENCE) {
                    finishRecording();
                }
            }
        } else if (isRecording) {
            // Hand lost during recording -> reset
            isRecording = false;
            recordBtn.disabled = false;
            recordBtn.classList.remove("is-recording");
            recordBtn.innerHTML = "<span>🔴 60 Frames aufzeichnen (2 Sek)</span>";
            statusText.innerText = "Aufnahme abgebrochen (Keine Hand im Bild)! Bitte erneut versuchen.";
            currentCaptureFrames = [];
        }
    }

    if (webcamRunning === true) {
        window.requestAnimationFrame(predictWebcam);
    }
}

function finishRecording() {
    isRecording = false;
    const label = labelInput.value.trim();
    
    // Save to dataset
    dataset.push({ label: label, sequence: currentCaptureFrames });
    
    if (!uniqueLabels.includes(label)) {
        uniqueLabels.push(label);
    }
    
    // Update UI
    recordBtn.disabled = false;
    recordBtn.classList.remove("is-recording");
    recordBtn.innerHTML = "<span>🔴 60 Frames aufzeichnen (2 Sek)</span>";
    
    dataCountDisplay.innerText = `${dataset.length} Aufnahmen gesamt (${uniqueLabels.length} Labels)`;
    labelList.innerHTML = uniqueLabels.map(l => `<li>${l} (${dataset.filter(d=>d.label===l).length}x)</li>`).join("");
    
    statusText.innerText = `Erfolgreich gespeichert: ${label}`;
    
    if (dataset.length >= 3 && uniqueLabels.length >= 2) {
        trainBtn.disabled = false;
    }
}

// Training Logic with TensorFlow.js
trainBtn.addEventListener("click", async () => {
    trainBtn.disabled = true;
    recordBtn.disabled = true;
    
    statusText.innerText = "Bereite Datenstapel für KI vor...";
    
    // Konvertiere JS Arrays zu Tensors
    const xs = [];
    const ys = [];
    
    dataset.forEach(d => {
        xs.push(d.sequence);
        const labelIndex = uniqueLabels.indexOf(d.label);
        const yHeatmap = new Array(uniqueLabels.length).fill(0);
        yHeatmap[labelIndex] = 1; // One-Hot Encoding
        ys.push(yHeatmap);
    });
    
    // Shape: [Anzahl Aufnahmen, 30 Frames, 63 Koordinaten]
    const xsTensor = tf.tensor3d(xs);
    // Shape: [Anzahl Aufnahmen, Anzahl Kategorien]
    const ysTensor = tf.tensor2d(ys);
    
    // Modell Architektur bauen (LSTM)
    trainedModel = tf.sequential();
    
    // LSTM Layer für Sequenzerkennung (Zeitlicher Verlauf)
    trainedModel.add(tf.layers.lstm({ 
        units: 64, 
        returnSequences: false, 
        inputShape: [FRAMES_PER_SEQUENCE, 63] 
    }));
    
    // Versteckte neuronale Schicht
    trainedModel.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    
    // Output Schicht (Wahrscheinlichkeit für Labels)
    trainedModel.add(tf.layers.dense({ units: uniqueLabels.length, activation: 'softmax' }));
    
    trainedModel.compile({
        optimizer: 'adam',
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    });
    
    statusText.innerText = "Trainiere Modell... Bitte auf dem Tab bleiben!";
    
    await trainedModel.fit(xsTensor, ysTensor, {
        epochs: 50,
        batchSize: 4,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                statusText.innerText = `Training... Epoche ${epoch + 1}/50\nLoss: ${logs.loss.toFixed(3)}`;
            }
        }
    });
    
    statusText.innerText = "🎉 Training abgeschlossen! Das Modell ist bereit.";
    downloadBtn.disabled = false;
    trainBtn.disabled = false;
    recordBtn.disabled = false;
    
    // Memory release
    xsTensor.dispose();
    ysTensor.dispose();
});

downloadBtn.addEventListener("click", async () => {
    if (!trainedModel) return;
    statusText.innerText = "Exportiere Modell-Dateien...";
    
    // Lädt model.json und model.weights.bin herunter
    await trainedModel.save('downloads://gesture-model');
    
    // Lade zusätzlich die Labels herunter, damit die Haupt-App weiß, welche ID zu welchem Wort gehört
    const blob = new Blob([JSON.stringify(uniqueLabels)], {type: "application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "gesture-labels.json";
    link.click();
    
    statusText.innerText = "Dateien heruntergeladen! Verschiebe sie in dein Projekt.";
});

function drawLandmarks(ctx, landmarks, options) {
    ctx.fillStyle = options.color;
    for (const p of landmarks) {
        ctx.beginPath();
        ctx.arc(p.x * canvasElement.width, p.y * canvasElement.height, 4, 0, 2 * Math.PI);
        ctx.fill();
    }
}
