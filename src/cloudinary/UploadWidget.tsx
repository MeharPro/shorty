import { useEffect, useRef, useState } from 'react';
import { cloudName, isDemoCloud, uploadPreset } from './config';

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
}

interface CloudinaryWidgetResult {
  event: string;
  info: CloudinaryUploadResult;
}

interface CloudinaryWidgetError {
  message?: string;
}

declare global {
  interface Window {
    cloudinary?: {
      createUploadWidget: (
        config: Record<string, unknown>,
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
  sources = ['local', 'camera', 'url'],
  folder = 'shorty',
  multiple = false,
}: UploadWidgetProps) {
  const widgetRef = useRef<{ open: () => void } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const missingPreset = !uploadPreset;
  const blockedMessage = isDemoCloud
    ? `Uploads are disabled while VITE_CLOUDINARY_CLOUD_NAME is set to "demo". Switch it to your real Cloudinary cloud name to use the "${uploadPreset}" preset.`
    : missingPreset
      ? 'Add VITE_CLOUDINARY_UPLOAD_PRESET to enable uploads in the widget.'
      : '';

  useEffect(() => {
    if (missingPreset || isDemoCloud) {
      return () => undefined;
    }

    let poll: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    function initializeWidget() {
      if (!mounted || typeof window.cloudinary?.createUploadWidget !== 'function') return;

      if (!uploadPreset) {
        console.warn(
          'VITE_CLOUDINARY_UPLOAD_PRESET is not set. ' +
            'Create an unsigned upload preset in your Cloudinary dashboard.'
        );
      }

      if (isDemoCloud) {
        console.warn(
          'VITE_CLOUDINARY_CLOUD_NAME is set to "demo". ' +
            'Uploads require your real Cloudinary cloud name.'
        );
      }

      widgetRef.current = window.cloudinary.createUploadWidget(
        {
          cloudName,
          uploadPreset: uploadPreset || undefined,
          sources,
          multiple,
          resourceType,
          folder,
          clientAllowedFormats,
        },
        (error: CloudinaryWidgetError | null, result: CloudinaryWidgetResult | null) => {
          if (error) {
            onUploadError?.(new Error(error.message || 'Upload failed'));
            return;
          }

          if (result && result.event === 'success') {
            onUploadSuccess?.(result.info);
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
  }, [
    clientAllowedFormats,
    folder,
    missingPreset,
    multiple,
    onUploadError,
    onUploadSuccess,
    resourceType,
    sources,
  ]);

  const handleClick = () => {
    if (blockedMessage) {
      onUploadError?.(new Error(blockedMessage));
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

  const canOpen = isReady && !blockedMessage;
  const buttonLabel = blockedMessage
    ? isDemoCloud
      ? 'Set real cloud name'
      : 'Add upload preset'
    : !isReady
      ? 'Loading...'
      : buttonText;

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
      title={blockedMessage || undefined}
    >
      {buttonLabel}
    </button>
  );
}
