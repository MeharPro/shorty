export default function handler(_req, res) {
  res.status(200).json({
    app: 'shorty',
    cloudinary: {
      cloudName:
        process.env.CLOUDINARY_CLOUD_NAME ||
        process.env.VITE_CLOUDINARY_CLOUD_NAME ||
        'demo',
      hasUploadPreset: Boolean(process.env.VITE_CLOUDINARY_UPLOAD_PRESET),
      hasSignedUploadConfig: Boolean(
        process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET &&
          process.env.CLOUDINARY_CLOUD_NAME
      ),
    },
    supabase: {
      hasBrowserConfig: Boolean(
        process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY
      ),
      hasServerRole: Boolean(
        process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
    },
    transcription: {
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1',
    },
    generatedAt: new Date().toISOString(),
  });
}
