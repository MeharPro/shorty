const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
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
      'Tell it like a messy relationship or family recap with tension, stakes, and a payoff, but keep it platform-agnostic.',
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

function sanitizeScriptPackage(scriptPackage, fallback) {
  const spokenScript = cleanSentence(
    stripPlatformTerms(scriptPackage.spokenScript),
    fallback.spokenScript
  );
  const captionText = cleanSentence(
    stripPlatformTerms(scriptPackage.captionText),
    deriveCaption(spokenScript)
  ).slice(0, 72);

  return {
    title: cleanSentence(stripPlatformTerms(scriptPackage.title), fallback.title).slice(0, 64),
    hook: cleanSentence(stripPlatformTerms(scriptPackage.hook), fallback.hook).slice(0, 48),
    spokenScript,
    captionText,
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

function buildFallbackSpokenScript(prompt, type, targetDurationSeconds) {
  const idea = cleanSentence(prompt, 'the topic');
  const typeDescription = cleanSentence(type?.description, 'Make it feel fast, sticky, and direct.');
  const { minWords } = estimateWordRange(targetDurationSeconds);
  const sentenceBank = [
    `${idea} sounds simple at first, but the second you look closer it gets stranger.`,
    `Most people stop at the surface, which is why they miss the one detail that actually changes the whole story.`,
    `The real pattern is quieter than people expect, and that is exactly why it keeps catching attention when the timing is right.`,
    `Once you notice how the behavior repeats, the obvious explanation starts to feel way less convincing.`,
    `That is where the ${cleanSentence(type?.label, 'brain rot')} angle hits, because it turns a familiar idea into something that feels unavoidable.`,
    `Instead of asking whether this is normal, the better question is why so many people repeat it without realizing what it costs them.`,
    `The weird part is that the payoff never comes from the loudest moment, it comes from the part people usually scroll past.`,
    `${typeDescription} That should make the listener feel like they are catching the hidden pattern a second before everyone else does.`,
    `If you keep watching for long enough, the same signal shows up again and again, and it becomes impossible to call it random.`,
    `That is why this kind of clip spreads so fast, because it gives you the feeling that you just noticed something important before the crowd did.`,
  ];
  const assembled = [];
  let wordCount = 0;

  while (wordCount < minWords) {
    const nextSentence = sentenceBank[assembled.length % sentenceBank.length];
    assembled.push(nextSentence);
    wordCount = assembled.join(' ').split(' ').filter(Boolean).length;
  }

  return assembled.join(' ');
}

function fallbackScriptPackage(prompt, type, targetDurationSeconds) {
  const typeLabel = type?.label || 'Brain Rot';
  const spokenScript = buildFallbackSpokenScript(prompt, type, targetDurationSeconds);

  return {
    title: `${typeLabel} Breakdown`,
    hook: 'This gets weird fast',
    spokenScript,
    captionText: deriveCaption(spokenScript),
    visualNotes: [
      'Keep the gameplay moving fast under the voiceover.',
      'Use a bold caption that lands immediately in the chosen screen position.',
      'Hold the ending beat for one extra second.',
    ],
  };
}

function parseGeminiText(payload) {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => ('text' in part ? part.text : ''))
    .join('')
    .trim();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
  const type = BRAINROT_TYPES[typeId] || BRAINROT_TYPES['subway-storytime'];
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const wordRange = estimateWordRange(targetDurationSeconds);

  if (!prompt) {
    res.status(400).json({ error: 'Enter a prompt before generating the script.' });
    return;
  }

  if (!apiKey) {
    res.status(200).json({
      model,
      brainrotType: typeId,
      script: fallbackScriptPackage(prompt, type, targetDurationSeconds),
      generatedAt: new Date().toISOString(),
      fallback: true,
      warning: 'Gemini is not configured. Set GEMINI_API_KEY on the server.',
    });
    return;
  }

  try {
    const response = await fetch(
      `${GEMINI_API_URL}/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  'You write tight vertical-video voiceovers for short-form reels. Output only JSON. No markdown. No emojis. No hashtags. No quotation marks around fields. Keep the voiceover punchy, natural, and clear. Do not mention Reddit, subreddits, AITA, r-slash communities, Subway Surfers, subway trains, gameplay footage, split screens, captions, or background video unless the user explicitly asks for them.',
              },
            ],
          },
          contents: [
            {
              parts: [
                {
                  text: [
                    `Topic: ${prompt}`,
                    `Brain rot style: ${type.label}`,
                    `Style direction: ${type.description}`,
                    scriptGuidance ? `User script guidance: ${scriptGuidance}` : '',
                    `Write a voiceover that can be read in roughly ${wordRange.safeDuration} seconds.`,
                    'Return JSON with these fields:',
                    '- title: max 7 words',
                    '- hook: max 8 words',
                    `- spokenScript: ${wordRange.minWords} to ${wordRange.maxWords} words`,
                    '- captionText: max 10 words and highly punchy',
                    '- visualNotes: array with exactly 3 short notes',
                  ].join('\n'),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                hook: { type: 'string' },
                spokenScript: { type: 'string' },
                captionText: { type: 'string' },
                visualNotes: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['title', 'hook', 'spokenScript', 'captionText', 'visualNotes'],
            },
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        }),
      }
    );

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error?.message || 'Gemini failed to generate the script.');
    }

    const fallback = fallbackScriptPackage(prompt, type, targetDurationSeconds);
    const parsed = parseGeminiText(payload) || fallback;
    const scriptPackage = sanitizeScriptPackage({
      title: cleanSentence(parsed.title, `${type.label} Breakdown`).slice(0, 64),
      hook: cleanSentence(parsed.hook, 'This gets weird fast').slice(0, 48),
      spokenScript: cleanSentence(parsed.spokenScript, fallback.spokenScript),
      captionText: cleanSentence(parsed.captionText, deriveCaption(parsed.spokenScript)).slice(0, 72),
      visualNotes: Array.isArray(parsed.visualNotes)
        ? parsed.visualNotes.map((item) => cleanSentence(item, '')).filter(Boolean).slice(0, 3)
        : fallback.visualNotes,
    }, fallback);

    res.status(200).json({
      model,
      brainrotType: typeId,
      script: scriptPackage,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const fallback = fallbackScriptPackage(prompt, type, targetDurationSeconds);

    res.status(200).json({
      model,
      brainrotType: typeId,
      script: fallback,
      generatedAt: new Date().toISOString(),
      fallback: true,
      warning: error instanceof Error ? error.message : 'Gemini generation failed. Returned fallback copy.',
    });
  }
}
