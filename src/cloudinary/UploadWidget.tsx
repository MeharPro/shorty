import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { uploadPreset } from './config';

export interface CloudinaryUploadResult {
  asset_id?: string;
  public_id: string;
  secure_url: string;
  url: string;
  width: number;
  height: number;
  format: string;
  resource_type: string;
  bytes: number;
  created_at: string;
  duration?: number;
  original_filename?: string;
  thumbnail_url?: string;
}

export type UploadWidgetMode = 'checking' | 'unsigned' | 'signed' | 'disabled';

interface UploadWidgetProps {
  onUploadSuccess?: (result: CloudinaryUploadResult) => void;
  onUploadError?: (error: Error) => void;
  buttonText?: string;
  className?: string;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  clientAllowedFormats?: string[];
  sources?: string[];
  folder?: string;
  multiple?: boolean;
  uploadMode?: UploadWidgetMode;
}

interface CloudinaryWidgetResult {
  event: string;
  info: CloudinaryUploadResult;
}

interface CloudinaryWidgetError {
  message?: string;
}

interface CloudinaryPreparedUploadParams {
  apiKey?: string;
  cancel?: boolean;
  folder?: string;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  signature?: string;
  uploadSignatureTimestamp?: number;
}

interface CloudinaryWidgetConfig extends Record<string, unknown> {
  cloudName: string;
  uploadPreset?: string;
  sources: string[];
  multiple: boolean;
  resourceType: 'image' | 'video' | 'raw' | 'auto';
  folder: string;
  clientAllowedFormats?: string[];
  prepareUploadParams?: (
    callback: (params: CloudinaryPreparedUploadParams) => void,
    paramsToSign: Record<string, unknown>
  ) => void;
}

interface SignedUploadResponse {
  apiKey: string;
  cloudName: string;
  signature: string;
  timestamp: number;
}

const DEFAULT_WIDGET_SOURCES = ['local', 'camera', 'url'];

async function requestSignedUpload(
  paramsToSign: Record<string, unknown>
): Promise<SignedUploadResponse> {
  const response = await fetch('/api/sign-cloudinary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paramsToSign }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (SignedUploadResponse & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || 'Signed upload preparation failed.');
  }

  return payload as SignedUploadResponse;
}

declare global {
  interface Window {
    cloudinary?: {
      createUploadWidget: (
        config: CloudinaryWidgetConfig,
        callback: (
          error: CloudinaryWidgetError | null,
          result: CloudinaryWidgetResult | null
        ) => void
      ) => { open: () => void };
    };
  }
}

export function UploadWidget({
  onUploadSuccess,
  onUploadError,
  buttonText = 'Upload asset',
  className = '',
  resourceType = 'auto',
  clientAllowedFormats,
  sources = DEFAULT_WIDGET_SOURCES,
  folder = 'yt-shortmaker',
  multiple = false,
  uploadMode = uploadPreset ? 'unsigned' : 'disabled',
}: UploadWidgetProps) {
  const widgetRef = useRef<{ open: () => void } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const canUseUnsignedUploads = uploadMode === 'unsigned' && Boolean(uploadPreset);
  const canUseSignedUploads = uploadMode === 'signed';
  const canOpen = isReady && (canUseUnsignedUploads || canUseSignedUploads);

  const emitUploadSuccess = useEffectEvent((result: CloudinaryUploadResult) => {
    onUploadSuccess?.(result);
  });

  const emitUploadError = useEffectEvent((error: Error) => {
    onUploadError?.(error);
  });

  const prepareSignedUpload = useEffectEvent(
    async (
      callback: (params: CloudinaryPreparedUploadParams) => void,
      paramsToSign: Record<string, unknown>
    ) => {
      try {
        const signedUpload = await requestSignedUpload(paramsToSign);
        callback({
          apiKey: signedUpload.apiKey,
          folder,
          resourceType,
          signature: signedUpload.signature,
          uploadSignatureTimestamp: signedUpload.timestamp,
        });
      } catch (error) {
        emitUploadError(
          error instanceof Error ? error : new Error('Signed upload preparation failed.')
        );
        callback({ cancel: true });
      }
    }
  );

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;
    widgetRef.current = null;

    if (uploadMode === 'checking' || uploadMode === 'disabled') {
      return () => {
        mounted = false;
      };
    }

    function initializeWidget() {
      if (!mounted || typeof window.cloudinary?.createUploadWidget !== 'function') return;

      if (uploadMode === 'unsigned' && !uploadPreset) {
        console.warn(
          'VITE_CLOUDINARY_UPLOAD_PRESET is not set. ' +
            'Create an unsigned upload preset in your Cloudinary dashboard.'
        );
        return;
      }

      const widgetConfig: CloudinaryWidgetConfig = {
        cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
        sources,
        multiple,
        resourceType,
        folder,
        clientAllowedFormats,
      };

      if (uploadMode === 'unsigned') {
        widgetConfig.uploadPreset = uploadPreset;
      }

      if (uploadMode === 'signed') {
        widgetConfig.prepareUploadParams = (callback, paramsToSign) => {
          void prepareSignedUpload(callback, paramsToSign);
        };
      }

      widgetRef.current = window.cloudinary.createUploadWidget(
        widgetConfig,
        (error: CloudinaryWidgetError | null, result: CloudinaryWidgetResult | null) => {
          if (error) {
            emitUploadError(new Error(error.message || 'Upload failed'));
            return;
          }

          if (result && result.event === 'success') {
            emitUploadSuccess(result.info);
          }
        }
      );

      setIsReady(true);
    }

    function isWidgetReady(): boolean {
      return typeof window.cloudinary?.createUploadWidget === 'function';
    }

    poll = setInterval(() => {
      if (isWidgetReady()) {
        if (poll) clearInterval(poll);
        if (timeout) clearTimeout(timeout);
        initializeWidget();
      }
    }, 100);

    timeout = setTimeout(() => {
      if (poll) clearInterval(poll);
      if (mounted && !isWidgetReady()) {
        setScriptError(true);
      }
    }, 10000);

    if (isWidgetReady()) {
      if (poll) clearInterval(poll);
      if (timeout) clearTimeout(timeout);
      initializeWidget();
    }

    return () => {
      mounted = false;
      if (poll) clearInterval(poll);
      if (timeout) clearTimeout(timeout);
    };
  }, [clientAllowedFormats, folder, multiple, resourceType, sources, uploadMode]);

  const handleClick = () => {
    if (uploadMode === 'checking') {
      onUploadError?.(new Error('Checking whether uploads are available. Try again in a moment.'));
      return;
    }

    if (uploadMode === 'disabled') {
      onUploadError?.(
        new Error(
          'Uploads are unavailable. Add VITE_CLOUDINARY_UPLOAD_PRESET or configure /api/sign-cloudinary.'
        )
      );
      return;
    }

    if (uploadMode === 'unsigned' && !uploadPreset) {
      onUploadError?.(
        new Error('Add VITE_CLOUDINARY_UPLOAD_PRESET to enable unsigned uploads in the widget.')
      );
      return;
    }

    if (widgetRef.current) {
      widgetRef.current.open();
    }
  };

  if (scriptError) {
    return (
      <div style={{ color: '#ff8a66', fontSize: '0.875rem' }}>
        Upload widget failed to load. Refresh the page or check your network connection.
      </div>
    );
  }

  const buttonLabel =
    uploadMode === 'checking'
      ? 'Checking upload mode...'
      : uploadMode === 'disabled'
        ? 'Uploads unavailable'
        : !isReady
          ? 'Loading...'
          : canUseUnsignedUploads || canUseSignedUploads
            ? buttonText
            : 'Uploads unavailable';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canOpen}
      className={className}
      style={{
        padding: '0.75rem 1.5rem',
        fontSize: '1rem',
        fontWeight: 600,
        color: '#09111f',
        backgroundColor: canOpen ? '#ff7448' : '#9ca3af',
        border: 'none',
        borderRadius: '0.9rem',
        cursor: canOpen ? 'pointer' : 'not-allowed',
        transition: 'background-color 0.2s',
        opacity: canOpen ? 1 : 0.7,
      }}
    >
      {buttonLabel}
    </button>
  );
}
