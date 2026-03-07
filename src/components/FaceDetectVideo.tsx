import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectFaces, type FaceBox } from '../lib/faceDetection';
import type { CaptionCue } from '../types';

interface FaceDetectVideoProps {
    src: string;
    poster?: string;
    faceFocusEnabled?: boolean;
    debugFaces?: boolean;
    captions?: CaptionCue[];
    captionsEnabled?: boolean;
    captionVariant?: 'clean' | 'shaking';
}

const DETECTION_INTERVAL_MS = 180;

function getCaptionPosition(faces: FaceBox[]): 'top' | 'bottom' {
    const bottomOccupied = faces.some((face) => face.y + face.height > 0.62);
    const topOccupied = faces.some((face) => face.y < 0.28);

    if (bottomOccupied && !topOccupied) {
        return 'top';
    }

    return 'bottom';
}

export function FaceDetectVideo({
    src,
    poster,
    faceFocusEnabled = false,
    debugFaces = false,
    captions = [],
    captionsEnabled = false,
    captionVariant = 'clean',
}: FaceDetectVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [faces, setFaces] = useState<FaceBox[]>([]);
    const rafRef = useRef<number>(0);
    const runDetectionRef = useRef<() => Promise<void>>(async () => undefined);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    const lastDetectionAtRef = useRef(0);
    const lastPlaybackTimeRef = useRef(0);

    const runDetection = useCallback(async () => {
        const video = videoRef.current;
        if (!video || video.paused || video.ended) return;

        const currentTime = video.currentTime;
        if (Math.abs(currentTime - lastPlaybackTimeRef.current) >= 0.05) {
            lastPlaybackTimeRef.current = currentTime;
            setPlaybackTime(currentTime);
        }

        if (faceFocusEnabled && performance.now() - lastDetectionAtRef.current >= DETECTION_INTERVAL_MS) {
            lastDetectionAtRef.current = performance.now();
            const boxes = await detectFaces(video, performance.now());
            setFaces(boxes);

            const canvas = canvasRef.current;
            if (canvas && video.videoWidth) {
                canvas.width = video.clientWidth;
                canvas.height = video.clientHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    if (debugFaces) {
                        for (const face of boxes) {
                            const x = face.x * canvas.width;
                            const y = face.y * canvas.height;
                            const w = face.width * canvas.width;
                            const h = face.height * canvas.height;

                            ctx.shadowColor = '#8b5cf6';
                            ctx.shadowBlur = 12;
                            ctx.strokeStyle = '#8b5cf6';
                            ctx.lineWidth = 2.5;
                            ctx.setLineDash([6, 4]);
                            ctx.strokeRect(x, y, w, h);

                            ctx.shadowBlur = 0;
                            ctx.setLineDash([]);
                            const label = `${Math.round(face.confidence * 100)}%`;
                            ctx.font = 'bold 11px Inter, system-ui, sans-serif';
                            const tm = ctx.measureText(label);
                            ctx.fillStyle = '#8b5cf6dd';
                            ctx.fillRect(x, y - 18, tm.width + 8, 18);
                            ctx.fillStyle = '#fff';
                            ctx.fillText(label, x + 4, y - 5);
                        }
                    }
                }
            }
        }

        rafRef.current = requestAnimationFrame(() => {
            void runDetectionRef.current();
        });
    }, [debugFaces, faceFocusEnabled]);

    useEffect(() => {
        runDetectionRef.current = runDetection;
    }, [runDetection]);

    const activeCue = useMemo(() => {
        if (!captionsEnabled || captions.length === 0) {
            return null;
        }

        return captions.find((cue) => playbackTime >= cue.start && playbackTime <= cue.end) ?? null;
    }, [captions, captionsEnabled, playbackTime]);

    const activeWordIndex = useMemo(() => {
        if (!activeCue) {
            return -1;
        }

        const match = activeCue.words.findIndex(
            (word) => playbackTime >= word.start && playbackTime <= word.end
        );

        return match;
    }, [activeCue, playbackTime]);

    const captionPosition = useMemo(() => getCaptionPosition(faces), [faces]);

    useEffect(() => {
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    const handlePlay = () => {
        setIsPlaying(true);
        rafRef.current = requestAnimationFrame(() => void runDetection());
    };

    const handlePause = () => {
        setIsPlaying(false);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setPlaybackTime(videoRef.current?.currentTime || 0);
        setFaces([]);
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    return (
        <div className="face-detect-video">
            <video
                ref={videoRef}
                className="face-detect-video__player"
                controls
                playsInline
                preload="metadata"
                poster={poster}
                src={src}
                crossOrigin="anonymous"
                onPlay={handlePlay}
                onPause={handlePause}
                onEnded={handlePause}
            />
            {(faceFocusEnabled || debugFaces) && (
                <canvas ref={canvasRef} className="face-detect-video__overlay" />
            )}
            {captionsEnabled && activeCue && (
                <div
                    className={`face-detect-video__captions face-detect-video__captions--${captionPosition} face-detect-video__captions--${captionVariant}`}
                >
                    <div className="face-detect-video__caption-line">
                        {activeCue.words.length > 0
                            ? activeCue.words.map((word, index) => (
                                <span
                                    key={`${activeCue.id}-${index}`}
                                    className={`face-detect-video__caption-word ${index === activeWordIndex ? 'face-detect-video__caption-word--active' : ''}`}
                                >
                                    {word.word}
                                </span>
                            ))
                            : activeCue.text}
                    </div>
                </div>
            )}
            {debugFaces && faceFocusEnabled && isPlaying && faces.length > 0 && (
                <span className="face-detect-video__badge">
                    🎯 {faces.length} face{faces.length > 1 ? 's' : ''} detected
                </span>
            )}
        </div>
    );
}
