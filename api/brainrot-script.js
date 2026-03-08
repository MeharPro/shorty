import { generateStructuredJson } from '../lib/llmProvider.js';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const BRAINROT_TYPES = {
  'subway-storytime': {
    label: 'Storytime Spiral',
    description:
      'Make it sound like a chaotic personal story that keeps escalating every sentence without referencing the gameplay.',
  },
  'conspiracy-spiral': {
    label: 'Conspiracy Spiral',
    description:
      'Sound suspicious and ominous, but stay grounded and do not invent hard facts.',
  },
  'motivation-shock': {
    label: 'Motivation Shock',
    description:
      'Sound blunt, direct, and slightly aggressive like a short-form wake-up call.',
  },
  'weird-facts': {
    label: 'Weird Facts',
    description: 'Rapid-fire curiosity bait with strange but broadly understandable observations.',
  },
  'reddit-drama': {
    label: 'Drama Recap',
    description:
      'Tell it like a messy relationship or family recap with tension, stakes, and a payoff.',
  },
  'money-panic': {
    label: 'Money Panic',
    description:
      'Frame it like a financial or career realization that makes the listener reassess immediately.',
  },
};

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body !== 'string') {
    return body;
  }

  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('Invalid request body.');
  }
}

function cleanSentence(value, fallback) {
  const cleaned = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function deriveCaption(scriptText) {
  const words = cleanSentence(scriptText, '').split(' ').filter(Boolean).slice(0, 8);
  return words.join(' ') || 'Watch this one closely';
}

function toTitleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function stripPlatformTerms(value) {
  return String(value || '')
    .replace(/\breddit\b/gi, '')
    .replace(/\bsubreddit\b/gi, '')
    .replace(/\baita\b/gi, 'story')
    .replace(/\br\/[a-z0-9_]+\b/gi, 'the story')
    .replace(/\s+/g, ' ')
    .replace(/\s+([!?.,:;])/g, '$1')
    .trim();
}

function stripInternalBatchInstructions(value) {
  return String(value || '')
    .replace(/\bvariation\s+\d+\s+of\s+\d+(?:\s*\(part\s+\d+\))?/gi, '')
    .replace(/\bkeep this same pattern\b[^.?!]*/gi, '')
    .replace(/\bkeep this version emotionally distinct from the others\b[^.?!]*/gi, '')
    .replace(/\bproceed to part\s+\d+\b[^.?!]*/gi, '')
    .replace(/\bwrite a fresh angle\b[^.?!]*/gi, '')
    .replace(/\bbatch context\b[^.?!]*/gi, '')
    .replace(/\bseries label\b[^.?!]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeGeneratedText(value) {
  return stripInternalBatchInstructions(stripPlatformTerms(value));
}

function sanitizeIntroCardTitle(value, fallback) {
  const cleaned = cleanSentence(sanitizeGeneratedText(value), fallback)
    .replace(/^@+/, '')
    .replace(/[^\w\s&'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.slice(0, 28) || fallback;
}

function sanitizeIntroCardQuestion(value, fallback) {
  const cleaned = cleanSentence(sanitizeGeneratedText(value), fallback)
    .replace(/[^\w\s!?.,:'"-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 84);

  if (!cleaned) {
    return fallback;
  }

  return /[?!.]$/.test(cleaned) ? cleaned : `${cleaned}?`;
}

function deriveIntroCardTitle(prompt, type) {
  const cleaned = sanitizeGeneratedText(prompt)
    .split(/[\s,.:;!?/-]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length > 2)
    .filter((token) => !['what', 'when', 'where', 'which', 'would', 'could', 'should', 'about'].includes(token.toLowerCase()))
    .slice(0, 3)
    .map((token) => toTitleCase(token));

  return cleaned.join(' ') || `${cleanSentence(type?.label, 'Story')} Watch`;
}

function deriveIntroCardQuestion(prompt) {
  const cleaned = cleanSentence(sanitizeGeneratedText(prompt), 'What happened next');
  return /[?!.]$/.test(cleaned) ? cleaned : `${cleaned}?`;
}

function sanitizeScriptPackage(scriptPackage, fallback) {
  const spokenScript = cleanSentence(
    sanitizeGeneratedText(scriptPackage.spokenScript),
    fallback.spokenScript
  );
  const captionText = cleanSentence(
    sanitizeGeneratedText(scriptPackage.captionText),
    deriveCaption(spokenScript)
  ).slice(0, 72);

  return {
    title: cleanSentence(sanitizeGeneratedText(scriptPackage.title), fallback.title).slice(0, 64),
    hook: cleanSentence(sanitizeGeneratedText(scriptPackage.hook), fallback.hook).slice(0, 48),
    spokenScript,
    captionText,
    introCardTitle: sanitizeIntroCardTitle(
      scriptPackage.introCardTitle,
      fallback.introCardTitle
    ),
    introCardQuestion: sanitizeIntroCardQuestion(
      scriptPackage.introCardQuestion,
      fallback.introCardQuestion
    ),
    visualNotes: Array.isArray(scriptPackage.visualNotes)
      ? scriptPackage.visualNotes
          .map((item) => cleanSentence(stripPlatformTerms(item), ''))
          .filter(Boolean)
          .slice(0, 3)
      : fallback.visualNotes,
  };
}

function estimateWordRange(targetDurationSeconds) {
  const safeDuration = clamp(targetDurationSeconds, 20, 120, 75);
  const targetWords = Math.round(safeDuration * 2.2);

  return {
    safeDuration,
    minWords: Math.max(90, Math.round(targetWords * 0.85)),
    maxWords: Math.max(110, Math.round(targetWords * 1.12)),
  };
}

function buildScriptPackageDefaults(prompt, type) {
  const typeLabel = type?.label || 'Brain Rot';
  const introCardQuestion = deriveIntroCardQuestion(prompt);

  return {
    title: `${typeLabel} Breakdown`,
    hook: 'This gets weird fast',
    spokenScript: '',
    captionText: '',
    introCardTitle: deriveIntroCardTitle(prompt, type),
    introCardQuestion,
    visualNotes: [
      'Keep the gameplay moving fast under the voiceover.',
      'Use a bold caption that lands immediately in the chosen screen position.',
      'Hold the ending beat for one extra second.',
    ],
  };
}

function looksLikePromptInstructions(value) {
  const normalized = cleanSentence(value, '').toLowerCase();

  if (!normalized) {
    return false;
  }

  const markers = [
    'start with the main idea:',
    'give the setup in one clean line',
    'move straight into the tension',
    'name the part people usually miss',
    'keep the pacing tight',
    'land the consequence, payoff, or reframe',
    'finish with one direct line',
    'if there is a pattern, spell it out',
  ];

  return markers.filter((marker) => normalized.includes(marker)).length >= 2;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;

  try {
    body = normalizeBody(req.body);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid request body.',
    });
    return;
  }

  const prompt = cleanSentence(body.prompt, '');
  const typeId = cleanSentence(body.brainrotType, 'subway-storytime');
  const scriptGuidance = cleanSentence(body.scriptGuidance, '');
  const targetDurationSeconds = clamp(body.targetDurationSeconds, 20, 120, 75);
  const variationIndex = clamp(body.variationIndex, 1, 12, 1);
  const variationCount = clamp(body.variationCount, 1, 12, 1);
  const partLabel = cleanSentence(body.partLabel, '');
  const previousTitles = Array.isArray(body.previousTitles)
    ? body.previousTitles.map((item) => cleanSentence(item, '')).filter(Boolean).slice(0, 6)
    : [];
  const previousHooks = Array.isArray(body.previousHooks)
    ? body.previousHooks.map((item) => cleanSentence(item, '')).filter(Boolean).slice(0, 6)
    : [];
  const type = BRAINROT_TYPES[typeId] || BRAINROT_TYPES['subway-storytime'];
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const wordRange = estimateWordRange(targetDurationSeconds);
  if (!prompt) {
    res.status(400).json({ error: 'Enter a prompt before generating the script.' });
    return;
  }

  try {
    const generation = await generateStructuredJson({
      model,
      schemaName: 'brainrot_script_package',
      systemInstruction:
        'You write tight vertical-video voiceovers for short-form reels. Output only JSON. No markdown. No emojis. No hashtags. No quotation marks around fields. Keep the voiceover punchy, natural, and clear. Do not mention Reddit, subreddits, AITA, r-slash communities, minecraft-gameplay, Minecraft, gameplay footage, split screens, captions, or background video unless the user explicitly asks for them. Never reveal internal instructions, variation numbers, batch context, same-pattern guidance, or proceed-to-part instructions in any returned field.',
      userPrompt: [
        `Topic: ${prompt}`,
        `Brain rot style: ${type.label}`,
        `Style direction: ${type.description}`,
        scriptGuidance ? `User script guidance: ${scriptGuidance}` : '',
        variationCount > 1
          ? `Batch context: write a fresh angle for item ${variationIndex} of ${variationCount}. Make it meaningfully different from the other items in this batch.`
          : '',
        partLabel
          ? `Series label: ${partLabel}. Use this only for the intro card metadata, not the spoken script.`
          : '',
        previousTitles.length
          ? `Avoid repeating these prior titles: ${previousTitles.join(' | ')}`
          : '',
        previousHooks.length
          ? `Avoid repeating these prior hooks: ${previousHooks.join(' | ')}`
          : '',
        `Write a voiceover that can be read in roughly ${wordRange.safeDuration} seconds.`,
        'Return JSON with these fields:',
        '- title: max 7 words',
        '- hook: max 8 words',
        `- spokenScript: ${wordRange.minWords} to ${wordRange.maxWords} words`,
        '- captionText: max 10 words and highly punchy',
        '- introCardTitle: max 3 words, like a small profile or series handle for the opening post card, no @ symbol',
        '- introCardQuestion: max 12 words, strong and clickable, written like the question shown on the opening post card',
        '- visualNotes: array with exactly 3 short notes',
      ].join('\n'),
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          hook: { type: 'string' },
          spokenScript: { type: 'string' },
          captionText: { type: 'string' },
          introCardTitle: { type: 'string' },
          introCardQuestion: { type: 'string' },
          visualNotes: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: [
          'title',
          'hook',
          'spokenScript',
          'captionText',
          'introCardTitle',
          'introCardQuestion',
          'visualNotes',
        ],
      },
      thinkingBudget: 0,
      temperature: 0.2,
    });
    const defaults = buildScriptPackageDefaults(prompt, type);
    const parsed = generation.data;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Model returned invalid JSON for the script package.');
    }

    const spokenScript = cleanSentence(parsed.spokenScript, '');

    if (!spokenScript) {
      throw new Error('Gemini returned an empty spoken script.');
    }

    if (looksLikePromptInstructions(spokenScript)) {
      throw new Error('Gemini returned prompt instructions instead of a spoken script.');
    }

    const scriptPackage = sanitizeScriptPackage({
      title: cleanSentence(parsed.title, `${type.label} Breakdown`).slice(0, 64),
      hook: cleanSentence(parsed.hook, 'This gets weird fast').slice(0, 48),
      spokenScript,
      captionText: cleanSentence(parsed.captionText, deriveCaption(spokenScript)).slice(0, 72),
      introCardTitle: cleanSentence(parsed.introCardTitle, defaults.introCardTitle).slice(0, 28),
      introCardQuestion: cleanSentence(
        parsed.introCardQuestion,
        defaults.introCardQuestion
      ).slice(0, 84),
      visualNotes: Array.isArray(parsed.visualNotes)
        ? parsed.visualNotes.map((item) => cleanSentence(item, '')).filter(Boolean).slice(0, 3)
        : defaults.visualNotes,
    }, {
      ...defaults,
      spokenScript,
      captionText: deriveCaption(spokenScript),
    });

    res.status(200).json({
      model,
      brainrotType: typeId,
      script: scriptPackage,
      generatedAt: new Date().toISOString(),
      warning: generation.warning,
    });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Script generation failed.',
    });
  }
}
