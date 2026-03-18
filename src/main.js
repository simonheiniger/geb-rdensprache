import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm";
import { StaticGestureRecognizer } from "./recognizer/StaticGestureRecognizer.js";

let handLandmarker = undefined;
let runningMode = "VIDEO";
let webcamRunning = false;
let lastVideoTime = -1;

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("webcamButton");
const loadingScreen = document.getElementById("loading");
const gestureOutput = document.getElementById("gesture-output");

// Initialize recognizer architecture
const recognizer = new StaticGestureRecognizer();

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
            runningMode: runningMode,
            numHands: 2
        });
        loadingScreen.classList.add("hidden");
        enableWebcamButton.disabled = false;
    } catch (e) {
        console.error("Error loading MediaPipe:", e);
        loadingScreen.innerText = "Fehler beim Laden der KI Modelle.";
    }
}

createHandLandmarker();

const hasGetUserMedia = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

if (hasGetUserMedia()) {
    enableWebcamButton.addEventListener("click", enableCam);
} else {
    console.warn("getUserMedia() is not supported by your browser");
    enableWebcamButton.innerText = "Kamera nicht unterstützt";
}

function enableCam(event) {
    if (!handLandmarker) return;

    if (webcamRunning === true) {
        webcamRunning = false;
        enableWebcamButton.innerText = "Kamera aktivieren";
        let stream = video.srcObject;
        if(stream) {
            let tracks = stream.getTracks();
            tracks.forEach(function(track) {
                track.stop();
            });
            video.srcObject = null;
        }
        gestureOutput.innerText = "Bereit...";
    } else {
        webcamRunning = true;
        enableWebcamButton.innerText = "Kamera deaktivieren";

        const constraints = { video: { width: 1280, height: 720 } };

        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        });
    }
}

async function predictWebcam() {
    canvasElement.style.width = video.videoWidth + "px";
    canvasElement.style.height = video.videoHeight + "px";
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await handLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    let startTimeMs = performance.now();
    let results = undefined;

    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        results = handLandmarker.detectForVideo(video, startTimeMs);
    }

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results && results.landmarks && results.landmarks.length > 0) {
        // Render landmarks
        for (const landmarks of results.landmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                color: "#10b981",
                lineWidth: 5
            });
            drawLandmarks(canvasCtx, landmarks, { color: "#3b82f6", lineWidth: 2 });
        }

        // Pass landmarks to recognizer architecture
        const recognitionResult = recognizer.recognize(results);
        if (recognitionResult && recognitionResult.text) {
            gestureOutput.innerText = recognitionResult.text;
        } else {
            gestureOutput.innerText = "...";
        }
    } else {
        gestureOutput.innerText = "...";
    }

    if (webcamRunning === true) {
        window.requestAnimationFrame(predictWebcam);
    }
}

// Drawing utilities
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
];

function drawConnectors(ctx, landmarks, connections, options) {
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.lineWidth;
    for (const connection of connections) {
        const p1 = landmarks[connection[0]];
        const p2 = landmarks[connection[1]];
        if (p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(p1.x * canvasElement.width, p1.y * canvasElement.height);
            ctx.lineTo(p2.x * canvasElement.width, p2.y * canvasElement.height);
            ctx.stroke();
        }
    }
}

function drawLandmarks(ctx, landmarks, options) {
    ctx.fillStyle = options.color;
    for (const p of landmarks) {
        ctx.beginPath();
        ctx.arc(p.x * canvasElement.width, p.y * canvasElement.height, 4, 0, 2 * Math.PI);
        ctx.fill();
    }
}
