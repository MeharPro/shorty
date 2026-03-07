import { FaceLandmarker, FilesetResolver, type Category } from '@mediapipe/tasks-vision';

interface DetectionProbe {
    id: 'full' | 'left' | 'center' | 'right';
    x: number;
    y: number;
    width: number;
    height: number;
    scoreBoost: number;
}

interface DetectorProbeInstance {
    detector: FaceLandmarker;
    probe: DetectionProbe;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
}

const DETECTION_PROBES: DetectionProbe[] = [
    { id: 'full', x: 0, y: 0, width: 1, height: 1, scoreBoost: 0 },
    { id: 'left', x: 0, y: 0, width: 0.66, height: 1, scoreBoost: 0.08 },
    { id: 'center', x: 0.17, y: 0, width: 0.66, height: 1, scoreBoost: 0.03 },
    { id: 'right', x: 0.34, y: 0, width: 0.66, height: 1, scoreBoost: 0.08 },
];

let detectorPool: DetectorProbeInstance[] | null = null;
let detectorPoolPromise: Promise<DetectorProbeInstance[]> | null = null;

export interface FaceBox {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    speakingScore: number;
    mouthOpenScore: number;
    mouthMotionScore?: number;
    speakingMomentum?: number;
    trackId?: string;
    sourceProbe?: DetectionProbe['id'];
}

export function getFaceArea(face: FaceBox): number {
    return face.width * face.height;
}

function facePriority(face: FaceBox): number {
    const centerX = face.x + face.width / 2;
    const offCenterBias = Math.abs(centerX - 0.5) > 0.12 ? 0.04 : 0;
    const areaScore = Math.min(getFaceArea(face) * 1.6, 0.18);

    return (
        face.speakingScore * 0.5 +
        face.mouthOpenScore * 0.2 +
        face.confidence * 0.12 +
        areaScore +
        offCenterBias
    );
}

export function rankFaces(faces: FaceBox[]): FaceBox[] {
    return [...faces].sort((left, right) => {
        const leftScore = facePriority(left);
        const rightScore = facePriority(right);
        return rightScore - leftScore;
    });
}

function getBlendshapeScore(categories: Category[], ...names: string[]): number {
    return names.reduce((best, name) => {
        const match = categories.find((category) => category.categoryName === name);
        return Math.max(best, match?.score ?? 0);
    }, 0);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function centerDistance(left: FaceBox, right: FaceBox): number {
    const leftCenterX = left.x + left.width / 2;
    const leftCenterY = left.y + left.height / 2;
    const rightCenterX = right.x + right.width / 2;
    const rightCenterY = right.y + right.height / 2;

    return Math.hypot(leftCenterX - rightCenterX, leftCenterY - rightCenterY);
}

function intersectionOverUnion(left: FaceBox, right: FaceBox): number {
    const x1 = Math.max(left.x, right.x);
    const y1 = Math.max(left.y, right.y);
    const x2 = Math.min(left.x + left.width, right.x + right.width);
    const y2 = Math.min(left.y + left.height, right.y + right.height);

    if (x2 <= x1 || y2 <= y1) {
        return 0;
    }

    const intersection = (x2 - x1) * (y2 - y1);
    const union = getFaceArea(left) + getFaceArea(right) - intersection;
    return union > 0 ? intersection / union : 0;
}

function dedupeFaces(faces: FaceBox[]): FaceBox[] {
    const kept: FaceBox[] = [];

    for (const candidate of rankFaces(faces)) {
        const duplicate = kept.some(
            (face) =>
                intersectionOverUnion(candidate, face) > 0.36 ||
                centerDistance(candidate, face) < 0.06
        );

        if (!duplicate) {
            kept.push(candidate);
        }

        if (kept.length >= 4) {
            break;
        }
    }

    return kept;
}

function deriveFaceBox(
    landmarks: Array<{ x: number; y: number }> | undefined,
    categories: Category[] | undefined,
): FaceBox | null {
    if (!landmarks?.length) {
        return null;
    }

    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;

    for (const point of landmarks) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }

    const width = clamp(maxX - minX, 0.04, 1);
    const height = clamp(maxY - minY, 0.04, 1);
    const mouthOpenScore = clamp(
        getBlendshapeScore(categories ?? [], 'jawOpen', 'mouthOpen') * 0.6 +
        getBlendshapeScore(categories ?? [], 'mouthPucker', 'mouthFunnel') * 0.18 +
        getBlendshapeScore(categories ?? [], 'mouthSmileLeft', 'mouthSmileRight') * 0.08 +
        getBlendshapeScore(categories ?? [], 'mouthPressLeft', 'mouthPressRight') * 0.14,
        0,
        1,
    );
    const speakingScore = clamp(
        mouthOpenScore * 0.72 +
        getBlendshapeScore(categories ?? [], 'cheekPuff') * 0.08 +
        getBlendshapeScore(categories ?? [], 'browInnerUp') * 0.1 +
        Math.min(width * height * 2.4, 0.2),
        0,
        1,
    );

    return {
        x: clamp(minX, 0, 1),
        y: clamp(minY, 0, 1),
        width,
        height,
        confidence: speakingScore > 0 ? Math.max(0.55, speakingScore) : 0.55,
        speakingScore,
        mouthOpenScore,
    };
}

async function ensureDetectorPool(): Promise<DetectorProbeInstance[]> {
    if (detectorPool) {
        return detectorPool;
    }

    if (!detectorPoolPromise) {
        detectorPoolPromise = (async () => {
            if (typeof document === 'undefined') {
                throw new Error('MediaPipe face detection requires a browser environment.');
            }

            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
            );
            const instances: DetectorProbeInstance[] = [];

            for (const probe of DETECTION_PROBES) {
                try {
                    const detector = await FaceLandmarker.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                            delegate: 'GPU',
                        },
                        runningMode: 'VIDEO',
                        numFaces: 4,
                        minFaceDetectionConfidence: 0.42,
                        minTrackingConfidence: 0.32,
                        outputFaceBlendshapes: true,
                    });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d', { willReadFrequently: true });

                    if (!context) {
                        throw new Error('MediaPipe crop canvas could not be created.');
                    }

                    instances.push({
                        detector,
                        probe,
                        canvas,
                        context,
                    });
                } catch (error) {
                    if (probe.id === 'full') {
                        throw error;
                    }
                }
            }

            detectorPool = instances;
            return instances;
        })();
    }

    return detectorPoolPromise;
}

function drawProbeFrame(
    video: HTMLVideoElement,
    probe: DetectionProbe,
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
): boolean {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) {
        return false;
    }

    const sx = Math.round(sourceWidth * probe.x);
    const sy = Math.round(sourceHeight * probe.y);
    const sw = Math.max(1, Math.round(sourceWidth * probe.width));
    const sh = Math.max(1, Math.round(sourceHeight * probe.height));
    const targetWidth = Math.min(640, Math.max(280, sw));
    const scale = targetWidth / sw;
    const targetHeight = Math.max(280, Math.round(sh * scale));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return true;
}

function projectFaceBox(face: FaceBox, probe: DetectionProbe): FaceBox {
    return {
        ...face,
        x: clamp(probe.x + face.x * probe.width, 0, 1),
        y: clamp(probe.y + face.y * probe.height, 0, 1),
        width: clamp(face.width * probe.width, 0.04, 1),
        height: clamp(face.height * probe.height, 0.04, 1),
        confidence: clamp(face.confidence + probe.scoreBoost * 0.6, 0, 1),
        speakingScore: clamp(face.speakingScore + probe.scoreBoost, 0, 1),
        sourceProbe: probe.id,
    };
}

export async function detectFaces(
    video: HTMLVideoElement,
    timestampMs: number
): Promise<FaceBox[]> {
    try {
        const instances = await ensureDetectorPool();
        const allFaces: FaceBox[] = [];

        for (const instance of instances) {
            if (!drawProbeFrame(video, instance.probe, instance.canvas, instance.context)) {
                continue;
            }

            const result = instance.detector.detectForVideo(instance.canvas, timestampMs);
            const faces = (result.faceLandmarks || [])
                .map((landmarks, index) =>
                    deriveFaceBox(landmarks, result.faceBlendshapes?.[index]?.categories)
                )
                .filter((face): face is FaceBox => Boolean(face))
                .map((face) => projectFaceBox(face, instance.probe));

            allFaces.push(...faces);
        }

        return rankFaces(dedupeFaces(allFaces));
    } catch {
        return [];
    }
}
