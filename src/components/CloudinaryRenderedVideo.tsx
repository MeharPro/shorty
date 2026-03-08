import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactEventHandler,
  type SyntheticEvent,
  type VideoHTMLAttributes,
} from 'react';

interface CloudinaryRenderedVideoProps
  extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> {
  src: string;
  wrapperClassName?: string;
  loadingLabel?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

function buildRetryUrl(src: string, retryCount: number): string {
  if (!retryCount) {
    return src;
  }

  const separator = src.includes('?') ? '&' : '?';
  return `${src}${separator}retry=${retryCount}`;
}

const CLOUDINARY_RENDER_PLAY_EVENT = 'cloudinary-render-video:play';

export function CloudinaryRenderedVideo({
  src,
  wrapperClassName = '',
  className = '',
  loadingLabel = 'Rendering in Cloudinary...',
  maxRetries = 6,
  retryDelayMs = 1200,
  onError,
  onLoadedData,
  onPlay,
  ...videoProps
}: CloudinaryRenderedVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isWaiting, setIsWaiting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const resolvedSrc = useMemo(() => buildRetryUrl(src, retryCount), [retryCount, src]);

  useEffect(() => {
    const handleExclusivePlay = (event: Event) => {
      const currentVideo = videoRef.current;
      const playingVideo = (event as CustomEvent<HTMLVideoElement | null>).detail;

      if (!currentVideo || !playingVideo || currentVideo === playingVideo || currentVideo.paused) {
        return;
      }

      currentVideo.pause();
    };

    window.addEventListener(CLOUDINARY_RENDER_PLAY_EVENT, handleExclusivePlay);

    return () => {
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }

      window.removeEventListener(CLOUDINARY_RENDER_PLAY_EVENT, handleExclusivePlay);
    };
  }, []);

  const handleError = (event: SyntheticEvent<HTMLVideoElement, Event>) => {
    onError?.(event);

    if (retryCount >= maxRetries) {
      setIsWaiting(false);
      setLoadFailed(true);
      return;
    }

    setLoadFailed(false);
    setIsWaiting(true);

    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
    }

    retryTimeoutRef.current = window.setTimeout(() => {
      setRetryCount((current) => current + 1);
      setIsWaiting(false);
    }, retryDelayMs);
  };

  const handleLoadedData = (event: SyntheticEvent<HTMLVideoElement, Event>) => {
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setIsWaiting(false);
    setLoadFailed(false);
    onLoadedData?.(event);
  };

  const handlePlay: ReactEventHandler<HTMLVideoElement> = (event) => {
    window.dispatchEvent(
      new CustomEvent(CLOUDINARY_RENDER_PLAY_EVENT, {
        detail: event.currentTarget,
      })
    );
    onPlay?.(event);
  };

  return (
    <div className={`cloudinary-render-video ${wrapperClassName}`.trim()}>
      <video
        ref={videoRef}
        {...videoProps}
        className={className}
        src={resolvedSrc}
        onError={handleError}
        onLoadedData={handleLoadedData}
        onPlay={handlePlay}
      />
      {isWaiting ? (
        <div className="cloudinary-render-video__status">{loadingLabel}</div>
      ) : null}
      {loadFailed ? (
        <div className="cloudinary-render-video__status cloudinary-render-video__status--error">
          Cloudinary is still finishing this render.
        </div>
      ) : null}
    </div>
  );
}
