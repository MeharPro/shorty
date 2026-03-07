const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const MODEL_PREFERENCES = [
  process.env.OLLAMA_FEATURE1_MODEL,
  'qwen2.5:0.5b',
  'llama3.2:1b',
  'deepseek-r1:latest',
].filter(Boolean);

const LOGIC_BLOCKS = new Set([
  'hook-filter',
  'caption-pass',
  'viral-score',
  'voiceover',
  'brand-safety',
  'export-split',
]);

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  return typeof body === 'string' ? JSON.parse(body || '{}') : body;
}

function heuristicPlanFromWish(wish = '', current = {}) {
  const lowered = wish.toLowerCase();
  const wantsSpeakerFocus = /speaker|talking|lips|face|focus/.test(lowered);
  const wantsTightCaptions = /caption|subtitle|readable|fit|overflow/.test(lowered);
  const wantsAggressiveViral = /viral|hook|retention|punchy|aggressive/.test(lowered);
  const wantsShake = /shake|dynamic|punch/.test(lowered);

  return {
    model: 'heuristic-fallback',
    summary: wantsSpeakerFocus
      ? 'Bias Feature 1 toward speaker-led framing, safer face visibility, and tighter captions.'
      : 'Tune Feature 1 for clearer hooks, safer framing, and stronger QA.',
    editingOptions: {
      removeSilences: current.removeSilences ?? true,
      shakingCaptions: wantsTightCaptions || wantsAggressiveViral ? true : current.shakingCaptions ?? true,
      faceFocus: wantsSpeakerFocus ? true : current.faceFocus ?? true,
      safeFaceFrame: wantsSpeakerFocus ? true : current.safeFaceFrame ?? true,
      qaEnabled: true,
      focusPreference: wantsSpeakerFocus ? 'speaker' : 'auto',
      cameraMotionPreference: wantsShake ? 'dynamic' : 'steady',
      captionDensity: wantsTightCaptions ? 'tight' : 'balanced',
      viralStyle: wantsAggressiveViral ? 'aggressive' : 'balanced',
    },
    logicBlocks: ['caption-pass', 'viral-score', wantsSpeakerFocus ? 'hook-filter' : 'brand-safety'].filter(Boolean),
    qaChecks: ['speaker-face-visible', 'caption-fit', 'content-review'],
    notes: [
      'Local model was unavailable, so a deterministic fallback plan was applied.',
      wantsSpeakerFocus
        ? 'Safe face framing and speaker focus were prioritized.'
        : 'Balanced framing and QA defaults were preserved.',
    ],
  };
}

function normalizePlan(rawPlan, fallbackWish, current) {
  const fallback = heuristicPlanFromWish(fallbackWish, current);
  if (!rawPlan || typeof rawPlan !== 'object') {
    return fallback;
  }

  const editingOptions = rawPlan.editingOptions && typeof rawPlan.editingOptions === 'object'
    ? rawPlan.editingOptions
    : {};

  const logicBlocks = Array.isArray(rawPlan.logicBlocks)
    ? rawPlan.logicBlocks.filter((item) => typeof item === 'string' && LOGIC_BLOCKS.has(item))
    : fallback.logicBlocks;

  const qaChecks = Array.isArray(rawPlan.qaChecks)
    ? rawPlan.qaChecks.filter((item) => typeof item === 'string').slice(0, 6)
    : fallback.qaChecks;

  const notes = Array.isArray(rawPlan.notes)
    ? rawPlan.notes.filter((item) => typeof item === 'string').slice(0, 6)
    : fallback.notes;

  return {
    model: typeof rawPlan.model === 'string' && rawPlan.model.trim() ? rawPlan.model : fallback.model,
    summary:
      typeof rawPlan.summary === 'string' && rawPlan.summary.trim()
        ? rawPlan.summary.trim()
        : fallback.summary,
    editingOptions: {
      removeSilences:
        typeof editingOptions.removeSilences === 'boolean'
          ? editingOptions.removeSilences
          : fallback.editingOptions.removeSilences,
      shakingCaptions:
        typeof editingOptions.shakingCaptions === 'boolean'
          ? editingOptions.shakingCaptions
          : fallback.editingOptions.shakingCaptions,
      faceFocus:
        typeof editingOptions.faceFocus === 'boolean'
          ? editingOptions.faceFocus
          : fallback.editingOptions.faceFocus,
      safeFaceFrame:
        typeof editingOptions.safeFaceFrame === 'boolean'
          ? editingOptions.safeFaceFrame
          : fallback.editingOptions.safeFaceFrame,
      qaEnabled:
        typeof editingOptions.qaEnabled === 'boolean'
          ? editingOptions.qaEnabled
          : true,
      focusPreference: ['auto', 'speaker', 'reaction', 'group'].includes(editingOptions.focusPreference)
        ? editingOptions.focusPreference
        : fallback.editingOptions.focusPreference,
      cameraMotionPreference: ['auto', 'steady', 'dynamic', 'shake'].includes(editingOptions.cameraMotionPreference)
        ? editingOptions.cameraMotionPreference
        : fallback.editingOptions.cameraMotionPreference,
      captionDensity: ['tight', 'balanced'].includes(editingOptions.captionDensity)
        ? editingOptions.captionDensity
        : fallback.editingOptions.captionDensity,
      viralStyle: ['balanced', 'aggressive'].includes(editingOptions.viralStyle)
        ? editingOptions.viralStyle
        : fallback.editingOptions.viralStyle,
    },
    logicBlocks: logicBlocks.length ? logicBlocks : fallback.logicBlocks,
    qaChecks: qaChecks.length ? qaChecks : fallback.qaChecks,
    notes: notes.length ? notes : fallback.notes,
  };
}

async function resolveOllamaModel() {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama tags request failed with ${response.status}.`);
  }

  const payload = await response.json();
  const installed = Array.isArray(payload.models) ? payload.models.map((model) => model.name) : [];
  for (const preferred of MODEL_PREFERENCES) {
    if (installed.includes(preferred)) {
      return preferred;
    }
  }

  return installed[0] || null;
}

async function requestPlanFromOllama({ model, wish, currentEditingOptions, activeLogicBlocks, transcriptPreview }) {
  const prompt = [
    'You are a local video-editing pipeline planner for Feature 1 of a short-form reel app.',
    'Return strict JSON only.',
    'Choose edits that maximize retention while keeping the active speaker face fully visible and captions readable.',
    'Allowed logicBlocks: hook-filter, caption-pass, viral-score, voiceover, brand-safety, export-split.',
    'Allowed focusPreference: auto, speaker, reaction, group.',
    'Allowed cameraMotionPreference: auto, steady, dynamic, shake.',
    'Allowed captionDensity: tight, balanced.',
    'Allowed viralStyle: balanced, aggressive.',
    'Output schema:',
    '{"model":"string","summary":"string","editingOptions":{"removeSilences":boolean,"shakingCaptions":boolean,"faceFocus":boolean,"safeFaceFrame":boolean,"qaEnabled":boolean,"focusPreference":"auto|speaker|reaction|group","cameraMotionPreference":"auto|steady|dynamic|shake","captionDensity":"tight|balanced","viralStyle":"balanced|aggressive"},"logicBlocks":["..."],"qaChecks":["..."],"notes":["..."]}',
    `User wish: ${wish || 'Keep reels viral, readable, and speaker-focused.'}`,
    `Current editing options: ${JSON.stringify(currentEditingOptions)}`,
    `Active logic blocks: ${JSON.stringify(activeLogicBlocks)}`,
    `Transcript preview: ${transcriptPreview || 'No transcript provided.'}`,
  ].join('\n');

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.2,
        num_predict: 350,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Ollama generate failed with ${response.status}.`);
  }

  const payload = await response.json();
  return JSON.parse(payload.response || '{}');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = normalizeBody(req.body);
  const wish = String(body.wish || '').trim();
  const transcriptPreview = String(body.transcriptPreview || '').trim().slice(0, 1200);
  const currentEditingOptions = body.currentEditingOptions ?? {};
  const activeLogicBlocks = Array.isArray(body.activeLogicBlocks)
    ? body.activeLogicBlocks.filter((item) => typeof item === 'string')
    : [];

  try {
    const model = await resolveOllamaModel();
    if (!model) {
      res.status(200).json(heuristicPlanFromWish(wish, currentEditingOptions));
      return;
    }

    const rawPlan = await requestPlanFromOllama({
      model,
      wish,
      currentEditingOptions,
      activeLogicBlocks,
      transcriptPreview,
    });

    res.status(200).json(normalizePlan({ ...rawPlan, model }, wish, currentEditingOptions));
  } catch (error) {
    res.status(200).json(heuristicPlanFromWish(wish, currentEditingOptions));
  }
}
