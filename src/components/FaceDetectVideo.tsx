import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { detectFaces, type FaceBox } from '../lib/faceDetection';
import { splitCaptionWordsIntoRows } from '../lib/captions';
import type { CaptionCue } from '../types';

interface FaceDetectVideoProps {
  src: string;
  fallbackSrcs?: string[];
  poster?: string;
  faceFocusEnabled?: boolean;
  safeFrameEnabled?: boolean;
  debugFaces?: boolean;
  captions?: CaptionCue[];
  captionsEnabled?: boolean;
  captionVariant?: 'clean' | 'shaking';
  focusStrategy?: 'speaker' | 'reaction' | 'group';
  cameraMotion?: 'steady' | 'dynamic' | 'shake';
  suppressLocalEffectsOnPrimarySource?: boolean;
}

type CaptionPosition = 'top' | 'center' | 'bottom';

const DETECTION_INTERVAL_MS = 180;
const TRACK_EXPIRE_SECONDS = 0.85;
const PORTRAIT_CONTAINER_ASPECT = 9 / 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCaptionPosition(faces: FaceBox[], safeFrameEnabled: boolean): CaptionPosition {
  if (safeFrameEnabled || faces.length === 0) {
    return 'center';
  }

  const centerOccupied = faces.some((face) => face.y < 0.7 && face.y + face.height > 0.34);
  if (!centerOccupied) {
    return 'center';
  }

  const bottomOccupied = faces.some((face) => face.y + face.height > 0.72);
  return bottomOccupied ? 'top' : 'bottom';
}

interface FaceTrackState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mouthOpenScore: number;
  speakingScore: number;
  speakingMomentum: number;
  lastSeenAt: number;
}

function faceCenter(face: Pick<FaceBox, 'x' | 'y' | 'width' | 'height'>) {
  return {
    x: face.x + face.width / 2,
    y: face.y + face.height / 2,
  };
}

function faceDistance(
  left: Pick<FaceBox, 'x' | 'y' | 'width' | 'height'>,
  right: Pick<FaceBox, 'x' | 'y' | 'width' | 'height'>
): number {
  const leftCenter = faceCenter(left);
  const rightCenter = faceCenter(right);
  return Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y);
}

function faceArea(face: Pick<FaceBox, 'width' | 'height'>): number {
  return face.width * face.height;
}

function speakerPriority(face: FaceBox, previousFocus: FaceBox | null): number {
  const sameTrackBoost = previousFocus?.trackId && face.trackId === previousFocus.trackId ? 0.16 : 0;
  const sameLaneBoost =
    previousFocus &&
    Math.abs(face.x + face.width / 2 - (previousFocus.x + previousFocus.width / 2)) < 0.08
      ? 0.06
      : 0;
  const offCenterBias = Math.abs(face.x + face.width / 2 - 0.5) > 0.12 ? 0.03 : 0;

  return (
    (face.speakingMomentum ?? face.speakingScore) * 0.52 +
    (face.mouthMotionScore ?? face.mouthOpenScore) * 0.24 +
    face.speakingScore * 0.12 +
    face.confidence * 0.08 +
    Math.min(faceArea(face) * 1.2, 0.1) +
    sameTrackBoost +
    sameLaneBoost +
    offCenterBias
  );
}

function mergeFaces(faces: FaceBox[]): FaceBox | null {
  if (!faces.length) {
    return null;
  }

  const bounds = faces.reduce(
    (acc, face) => ({
      left: Math.min(acc.left, face.x),
      top: Math.min(acc.top, face.y),
      right: Math.max(acc.right, face.x + face.width),
      bottom: Math.max(acc.bottom, face.y + face.height),
      confidence: Math.max(acc.confidence, face.confidence),
    }),
    {
      left: faces[0].x,
      top: faces[0].y,
      right: faces[0].x + faces[0].width,
      bottom: faces[0].y + faces[0].height,
      confidence: faces[0].confidence,
    }
  );

  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
    confidence: bounds.confidence,
    speakingScore: Math.max(...faces.map((face) => face.speakingScore)),
    mouthOpenScore: Math.max(...faces.map((face) => face.mouthOpenScore)),
    mouthMotionScore: Math.max(...faces.map((face) => face.mouthMotionScore ?? 0)),
    speakingMomentum: Math.max(...faces.map((face) => face.speakingMomentum ?? face.speakingScore)),
  };
}

function selectFocusFace(
  faces: FaceBox[],
  focusStrategy: 'speaker' | 'reaction' | 'group',
  cameraMotion: 'steady' | 'dynamic' | 'shake',
  playbackTime: number,
  previousFocus: FaceBox | null
): FaceBox | null {
  if (!faces.length) {
    return null;
  }

  if (focusStrategy === 'group') {
    return mergeFaces(faces.slice(0, 3));
  }

  const rankedBySpeech = [...faces].sort(
    (left, right) => speakerPriority(right, previousFocus) - speakerPriority(left, previousFocus)
  );

  if (focusStrategy === 'reaction') {
    if (rankedBySpeech.length === 1) {
      return rankedBySpeech[0];
    }

    const speaker = rankedBySpeech[0];
    const reactionFace =
      rankedBySpeech.find(
        (face) =>
          face.trackId !== speaker.trackId &&
          Math.abs(face.x + face.width / 2 - (speaker.x + speaker.width / 2)) > 0.08
      ) ?? rankedBySpeech[1];

    if (!reactionFace || cameraMotion === 'steady') {
      return speaker;
    }

    return Math.floor(playbackTime * (cameraMotion === 'shake' ? 2.2 : 1.3)) % 2 === 0
      ? speaker
      : reactionFace;
  }

  return rankedBySpeech[0] ?? faces[0];
}

function stabilizeFaces(
  faces: FaceBox[],
  playbackTime: number,
  tracks: Map<string, FaceTrackState>,
  nextTrackIdRef: MutableRefObject<number>
): FaceBox[] {
  const nextTracks = new Map<string, FaceTrackState>();
  const matchedTrackIds = new Set<string>();
  const visibleFaces = [...faces].sort((left, right) => {
    const leftScore = left.speakingScore * 0.55 + left.mouthOpenScore * 0.25 + left.confidence * 0.2;
    const rightScore =
      right.speakingScore * 0.55 + right.mouthOpenScore * 0.25 + right.confidence * 0.2;
    return rightScore - leftScore;
  });

  const enriched = visibleFaces.map((face) => {
    let bestTrack: FaceTrackState | null = null;
    let bestTrackScore = Number.POSITIVE_INFINITY;

    for (const track of tracks.values()) {
      if (matchedTrackIds.has(track.id) || playbackTime - track.lastSeenAt > TRACK_EXPIRE_SECONDS) {
        continue;
      }

      const sizeRatio =
        Math.min(faceArea(face), faceArea(track)) / Math.max(faceArea(face), faceArea(track), 0.0001);
      const distance = faceDistance(face, track);
      if (distance > 0.2 || sizeRatio < 0.42) {
        continue;
      }

      const trackScore = distance * 0.78 + (1 - sizeRatio) * 0.22;
      if (trackScore < bestTrackScore) {
        bestTrack = track;
        bestTrackScore = trackScore;
      }
    }

    const trackId = bestTrack?.id ?? `face-track-${++nextTrackIdRef.current}`;
    matchedTrackIds.add(trackId);
    const mouthMotionScore = clamp(
      bestTrack
        ? Math.abs(face.mouthOpenScore - bestTrack.mouthOpenScore) * 2.7 +
            Math.abs(face.speakingScore - bestTrack.speakingScore) * 1.6
        : face.mouthOpenScore * 0.4,
      0,
      1
    );
    const speakerSignal = clamp(
      face.speakingScore * 0.5 + mouthMotionScore * 0.36 + face.mouthOpenScore * 0.14,
      0,
      1
    );
    const speakingMomentum = clamp(
      bestTrack ? bestTrack.speakingMomentum * 0.58 + speakerSignal * 0.42 : speakerSignal,
      0,
      1
    );

    nextTracks.set(trackId, {
      id: trackId,
      x: face.x,
      y: face.y,
      width: face.width,
      height: face.height,
      mouthOpenScore: face.mouthOpenScore,
      speakingScore: face.speakingScore,
      speakingMomentum,
      lastSeenAt: playbackTime,
    });

    return {
      ...face,
      trackId,
      mouthMotionScore,
      speakingMomentum,
    };
  });

  tracks.clear();
  for (const [key, track] of nextTracks) {
    tracks.set(key, track);
  }

  return enriched.sort((left, right) => speakerPriority(right, null) - speakerPriority(left, null));
}

function getBaseVisibleArea(videoAspect: number | null, safeFrameEnabled: boolean) {
  if (!videoAspect || !Number.isFinite(videoAspect) || videoAspect <= 0) {
    return { width: 1, height: 1, useContainFrame: safeFrameEnabled };
  }

  const useContainFrame = safeFrameEnabled && videoAspect > PORTRAIT_CONTAINER_ASPECT;
  if (useContainFrame) {
    return { width: 1, height: 1, useContainFrame: true };
  }

  if (videoAspect > PORTRAIT_CONTAINER_ASPECT) {
    return {
      width: PORTRAIT_CONTAINER_ASPECT / videoAspect,
      height: 1,
      useContainFrame: false,
    };
  }

  return {
    width: 1,
    height: videoAspect / PORTRAIT_CONTAINER_ASPECT,
    useContainFrame: false,
  };
}

export function FaceDetectVideo({
  src,
  fallbackSrcs = [],
  poster,
  faceFocusEnabled = false,
  safeFrameEnabled = false,
  debugFaces = false,
  captions = [],
  captionsEnabled = false,
  captionVariant = 'clean',
  focusStrategy = 'speaker',
  cameraMotion = 'steady',
  suppressLocalEffectsOnPrimarySource = false,
}: FaceDetectVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [faces, setFaces] = useState<FaceBox[]>([]);
  const [focusFace, setFocusFace] = useState<FaceBox | null>(null);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const sourceCandidates = [src, ...fallbackSrcs].filter((candidate, index, candidates): candidate is string => {
    return Boolean(candidate) && candidates.indexOf(candidate) === index;
  });
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const rafRef = useRef<number>(0);
  const loadTimeoutRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const lastDetectionAtRef = useRef(0);
  const lastPlaybackTimeRef = useRef(0);
  const focusFaceRef = useRef<FaceBox | null>(null);
  const faceTracksRef = useRef<Map<string, FaceTrackState>>(new Map());
  const nextTrackIdRef = useRef(0);
  const activeSrc = sourceCandidates[activeSourceIndex] || src;
  const localEffectsSuppressed =
    suppressLocalEffectsOnPrimarySource && activeSourceIndex === 0 && sourceCandidates.length > 1;
  const effectiveFaceFocusEnabled = faceFocusEnabled && !localEffectsSuppressed;
  const effectiveCaptionsEnabled = captionsEnabled && !localEffectsSuppressed;

  const activeCue = useMemo(() => {
    if (!effectiveCaptionsEnabled || captions.length === 0) {
      return null;
    }

    return captions.find((cue) => playbackTime >= cue.start && playbackTime < cue.end) ?? null;
  }, [captions, effectiveCaptionsEnabled, playbackTime]);

  const activeWordIndex = useMemo(() => {
    if (!activeCue) {
      return -1;
    }

    return activeCue.words.findIndex(
      (word) => playbackTime >= word.start && playbackTime < word.end
    );
  }, [activeCue, playbackTime]);

  const { useContainFrame } = useMemo(
    () => getBaseVisibleArea(videoAspect, safeFrameEnabled),
    [safeFrameEnabled, videoAspect]
  );

  const captionPosition = useMemo(
    () => getCaptionPosition(faces, safeFrameEnabled),
    [faces, safeFrameEnabled]
  );

  const videoStyle = useMemo(() => {
    const baseVisibleArea = getBaseVisibleArea(videoAspect, safeFrameEnabled);

    if (!effectiveFaceFocusEnabled || !focusFace) {
      return baseVisibleArea.useContainFrame ? { objectFit: 'contain' as const } : undefined;
    }

    const centerX = clamp((focusFace.x + focusFace.width / 2) * 100, 12, 88);
    const centerY = clamp((focusFace.y + focusFace.height / 2) * 100, 12, 88);
    const horizontalPadding = safeFrameEnabled ? 0.16 : 0.08;
    const verticalPadding = safeFrameEnabled ? 0.2 : 0.12;
    const desiredWidth = clamp(focusFace.width + horizontalPadding * 2, 0.08, 1);
    const desiredHeight = clamp(focusFace.height + verticalPadding * 2, 0.12, 1);
    const fitScale = Math.min(
      baseVisibleArea.width / desiredWidth,
      baseVisibleArea.height / desiredHeight
    );
    const motionZoom =
      safeFrameEnabled
        ? 0
        : (focusFace.speakingMomentum ?? focusFace.speakingScore) > 0.72
          ? 0.03
          : (focusFace.mouthMotionScore ?? 0) > 0.42
            ? 0.02
            : 0;
    const scaleCap = baseVisibleArea.useContainFrame
      ? cameraMotion === 'shake'
        ? 1.18
        : 1.14
      : focusStrategy === 'group'
        ? 1.05
        : cameraMotion === 'shake'
          ? 1.12
          : 1.08;
    const baseScale = clamp(Math.min(scaleCap, fitScale + motionZoom), 1, scaleCap);

    return {
      objectFit: (baseVisibleArea.useContainFrame ? 'contain' : 'cover') as 'contain' | 'cover',
      objectPosition: `${centerX}% ${centerY}%`,
      transform: `scale(${baseScale})`,
    };
  }, [cameraMotion, effectiveFaceFocusEnabled, focusFace, focusStrategy, safeFrameEnabled, videoAspect]);

  const captionRows = useMemo(() => {
    if (!activeCue) {
      return [];
    }

    const words =
      activeCue.words.length > 0
        ? activeCue.words.map((word) => word.word)
        : activeCue.text.split(/\s+/).filter(Boolean);

    return splitCaptionWordsIntoRows(words, captionVariant === 'shaking' ? 10 : 12);
  }, [activeCue, captionVariant]);

  useEffect(() => {
    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    if (activeSourceIndex !== 0 || sourceCandidates.length <= 1) {
      return () => undefined;
    }

    loadTimeoutRef.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (!video || video.readyState >= 1) {
        return;
      }

      setVideoAspect(null);
      setPlaybackTime(0);
      setFaces([]);
      setFocusFace(null);
      focusFaceRef.current = null;
      faceTracksRef.current.clear();
      lastDetectionAtRef.current = 0;
      lastPlaybackTimeRef.current = 0;
      setActiveSourceIndex(1);
    }, 4500);

    return () => {
      if (loadTimeoutRef.current) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [activeSourceIndex, sourceCandidates.length, activeSrc]);

  useEffect(() => {
    if (!isPlaying) {
      return () => undefined;
    }

    let cancelled = false;

    const runDetection = async () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended || cancelled) {
        return;
      }

      const currentTime = video.currentTime;
      if (Math.abs(currentTime - lastPlaybackTimeRef.current) >= 0.05) {
        lastPlaybackTimeRef.current = currentTime;
        setPlaybackTime(currentTime);
      }

      const now = performance.now();
      if (effectiveFaceFocusEnabled && now - lastDetectionAtRef.current >= DETECTION_INTERVAL_MS) {
        lastDetectionAtRef.current = now;
        const boxes = await detectFaces(video, now);
        const stabilizedBoxes = stabilizeFaces(boxes, currentTime, faceTracksRef.current, nextTrackIdRef);
        setFaces(stabilizedBoxes);
        const nextFocusFace = selectFocusFace(
          stabilizedBoxes,
          focusStrategy,
          cameraMotion,
          currentTime,
          focusFaceRef.current
        );
        focusFaceRef.current = nextFocusFace;
        setFocusFace(nextFocusFace);

        const canvas = canvasRef.current;
        if (canvas && video.videoWidth) {
          canvas.width = video.clientWidth;
          canvas.height = video.clientHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (debugFaces) {
              for (const face of stabilizedBoxes) {
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
                const label = `talk ${Math.round((face.speakingMomentum ?? face.speakingScore) * 100)}%`;
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

      if (!cancelled) {
        rafRef.current = requestAnimationFrame(() => {
          void runDetection();
        });
      }
    };

    rafRef.current = requestAnimationFrame(() => {
      void runDetection();
    });

    return () => {
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [cameraMotion, debugFaces, effectiveFaceFocusEnabled, focusStrategy, isPlaying]);

  const handleLoadedMetadata = () => {
    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    const video = videoRef.current;
    if (video?.videoWidth && video.videoHeight) {
      setVideoAspect(video.videoWidth / video.videoHeight);
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    lastDetectionAtRef.current = 0;
    lastPlaybackTimeRef.current = 0;
    setPlaybackTime(videoRef.current?.currentTime || 0);
    setFaces([]);
    setFocusFace(null);
    focusFaceRef.current = null;
    faceTracksRef.current.clear();
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleError = () => {
    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    if (activeSourceIndex >= sourceCandidates.length - 1) {
      handlePause();
      return;
    }

    setVideoAspect(null);
    setPlaybackTime(0);
    setFaces([]);
    setFocusFace(null);
    focusFaceRef.current = null;
    faceTracksRef.current.clear();
    lastDetectionAtRef.current = 0;
    lastPlaybackTimeRef.current = 0;
    setActiveSourceIndex((current) => current + 1);
  };

  return (
    <div className={`face-detect-video ${useContainFrame ? 'face-detect-video--safe' : ''}`}>
      <video
        ref={videoRef}
        className={`face-detect-video__player ${
          cameraMotion !== 'steady' ? `face-detect-video__player--${cameraMotion}` : ''
        } ${useContainFrame ? 'face-detect-video__player--safe' : ''}`}
        controls
        playsInline
        preload="metadata"
        poster={poster}
        src={activeSrc}
        crossOrigin="anonymous"
        style={videoStyle}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handlePause}
        onError={handleError}
      />
      {(effectiveFaceFocusEnabled || debugFaces) && (
        <canvas ref={canvasRef} className="face-detect-video__overlay" />
      )}
      {effectiveCaptionsEnabled && activeCue && (
        <div
          className={`face-detect-video__captions face-detect-video__captions--${captionPosition} face-detect-video__captions--${captionVariant}`}
        >
          <div className="face-detect-video__caption-line">
            {captionRows.map((row, rowIndex) => {
              const rowWords = row.split(/\s+/).filter(Boolean);
              const offset = captionRows
                .slice(0, rowIndex)
                .reduce((sum, item) => sum + item.split(/\s+/).filter(Boolean).length, 0);

              return (
                <span className="face-detect-video__caption-row" key={`${activeCue.id}-row-${rowIndex}`}>
                  {rowWords.map((word, index) => (
                    <span
                      key={`${activeCue.id}-${rowIndex}-${index}`}
                      className={`face-detect-video__caption-word ${
                        offset + index === activeWordIndex ? 'face-detect-video__caption-word--active' : ''
                      }`}
                    >
                      {word}
                    </span>
                  ))}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {debugFaces && effectiveFaceFocusEnabled && isPlaying && faces.length > 0 && (
        <span className="face-detect-video__badge">
          🎯 {faces.length} face{faces.length > 1 ? 's' : ''} detected
        </span>
      )}
    </div>
  );
}
