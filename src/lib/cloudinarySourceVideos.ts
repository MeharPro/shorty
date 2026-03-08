import type { CloudinaryUploadResult } from '../cloudinary/UploadWidget';
import { cloudName } from '../cloudinary/config';
import type { UploadHistoryItem } from './persistence';
import type { MediaAsset } from '../types';

export interface CloudinarySourceVideo {
  id: string;
  publicId: string;
  secureUrl: string;
  label: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
  createdAt?: string;
  thumbnailUrl?: string;
}

function encodePublicIdForDelivery(publicId: string): string {
  return publicId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildVideoThumbnailUrl(publicId: string, secureUrl?: string): string {
  if (secureUrl) {
    return secureUrl
      .replace('/video/upload/', '/video/upload/w_240,h_135,c_fill,so_0/')
      .replace(/\.[^.?#]+(?=([?#].*)?$)/, '.jpg');
  }

  return `https://res.cloudinary.com/${cloudName}/video/upload/w_240,h_135,c_fill,so_0/${encodePublicIdForDelivery(publicId)}.jpg`;
}

function deriveLabel(publicId: string, fallback?: string): string {
  if (fallback?.trim()) {
    return fallback.trim();
  }

  const leaf = publicId.split('/').pop() || 'Uploaded Video';
  return decodeURIComponent(leaf).replace(/[-_]+/g, ' ');
}

export function createCloudinarySourceVideoFromUpload(
  result: CloudinaryUploadResult
): CloudinarySourceVideo {
  const label = deriveLabel(result.public_id, result.original_filename);

  return {
    id: result.asset_id ?? result.public_id,
    publicId: result.public_id,
    secureUrl: result.secure_url,
    label,
    format: result.format,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    duration: result.duration,
    createdAt: result.created_at,
    thumbnailUrl: buildVideoThumbnailUrl(result.public_id, result.secure_url),
  };
}

export function createMediaAssetFromCloudinarySourceVideo(
  video: CloudinarySourceVideo
): MediaAsset {
  return {
    id: video.id,
    label: video.label,
    publicId: video.publicId,
    secureUrl: video.secureUrl,
    source: 'upload',
    strategy: 'cloudinary-public-id',
    resourceType: 'video',
    duration: video.duration,
    width: video.width,
    height: video.height,
    bytes: video.bytes,
    createdAt: video.createdAt,
  };
}

export function createUploadHistoryItemFromCloudinarySourceVideo(
  video: CloudinarySourceVideo
): UploadHistoryItem {
  return {
    id: video.id,
    publicId: video.publicId,
    secureUrl: video.secureUrl,
    label: video.label,
    duration: video.duration,
    thumbnailUrl: video.thumbnailUrl || buildVideoThumbnailUrl(video.publicId, video.secureUrl),
    uploadedAt: video.createdAt || new Date().toISOString(),
  };
}

export async function fetchFeature1SourceVideos(): Promise<CloudinarySourceVideo[]> {
  const response = await fetch('/api/feature1-source-videos');
  const data = (await response.json()) as { videos?: CloudinarySourceVideo[]; error?: string };

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load uploaded Cloudinary videos.');
  }

  return Array.isArray(data.videos) ? data.videos : [];
}
