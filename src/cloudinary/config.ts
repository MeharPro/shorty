import { Cloudinary } from '@cloudinary/url-gen';

export const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

if (!cloudName) {
  throw new Error(
    'VITE_CLOUDINARY_CLOUD_NAME is not set. Please create a .env file with your Cloudinary cloud name.\n' +
      'See .env.example for reference.'
  );
}

export const cld = new Cloudinary({
  cloud: {
    cloudName,
  },
});

export const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '';
export const isDemoCloud = cloudName === 'demo';
