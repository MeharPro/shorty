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
    brainrot: {
      hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      agentModel: process.env.OPENROUTER_AGENT_MODEL || 'openai/gpt-5.4',
      embeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL || 'text-embedding-3-small',
      hasElevenLabsKey: Boolean(process.env.ELEVENLABS_API_KEY),
      hasElevenLabsFallbackKey: Boolean(process.env.ELEVENLABS_FALLBACK_API_KEY),
      elevenLabsModel: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    },
    generatedAt: new Date().toISOString(),
  });
}
