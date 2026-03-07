import { FilesetResolver, FaceDetector } from '@mediapipe/tasks-vision';

let detector: FaceDetector | null = null;
let loading = false;

export interface FaceBox {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
}

async function ensureDetector(): Promise<FaceDetector> {
    if (detector) return detector;
    if (loading) {
        // Wait for existing load
        while (loading) await new Promise((r) => setTimeout(r, 100));
        return detector!;
    }

    loading = true;
    try {
        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
                delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            minDetectionConfidence: 0.5,
        });
        return detector;
    } finally {
        loading = false;
    }
}

export async function detectFaces(
    video: HTMLVideoElement,
    timestampMs: number
): Promise<FaceBox[]> {
    try {
        const det = await ensureDetector();
        const result = det.detectForVideo(video, timestampMs);
        return (result.detections || []).map((d) => {
            const bb = d.boundingBox!;
            return {
                x: bb.originX / video.videoWidth,
                y: bb.originY / video.videoHeight,
                width: bb.width / video.videoWidth,
                height: bb.height / video.videoHeight,
                confidence: d.categories?.[0]?.score ?? 0,
            };
        });
    } catch {
        return [];
    }
}
