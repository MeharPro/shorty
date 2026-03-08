const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

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

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function pickFallbackColor(prompt) {
  const lowered = prompt.toLowerCase();

  if (lowered.includes('camera') || lowered.includes('motion') || lowered.includes('shake')) {
    return '#fb7185';
  }

  if (lowered.includes('caption') || lowered.includes('text') || lowered.includes('subtitle')) {
    return '#f59e0b';
  }

  if (lowered.includes('voice') || lowered.includes('audio') || lowered.includes('music')) {
    return '#8b5cf6';
  }

  if (lowered.includes('color') || lowered.includes('background') || lowered.includes('style')) {
    return '#06b6d4';
  }

  return '#14b8a6';
}

function buildFallbackSuggestion(prompt) {
  const cleanPrompt = cleanText(prompt) || 'Add a custom production note';
  const title = titleCase(cleanPrompt.split(' ').slice(0, 4).join(' ')) || 'Custom Production Note';

  return {
    title,
    body: `${cleanPrompt}. Treat this as a creative production note for the reel and keep it editable on the canvas.`,
    color: pickFallbackColor(cleanPrompt),
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

  const prompt = cleanText(body.prompt);
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  if (!prompt) {
    res.status(400).json({ error: 'Describe the node you want to add.' });
    return;
  }

  if (!apiKey) {
    res.status(200).json(buildFallbackSuggestion(prompt));
    return;
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}/${model}:generateContent`, {
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
                'You translate short reel-editing instructions into compact flowchart notes. Output JSON only. Keep it practical, editable, and concrete.',
            },
          ],
        },
        contents: [
          {
            parts: [
              {
                text: [
                  `Instruction: ${prompt}`,
                  'Return JSON with:',
                  '- title: 2 to 5 words',
                  '- body: one short sentence describing the edit or effect',
                  '- color: a hex color that matches the note mood',
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
              body: { type: 'string' },
              color: { type: 'string' },
            },
            required: ['title', 'body', 'color'],
          },
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error?.message || 'Gemini failed to build the flowchart node.');
    }

    const parsed = parseGeminiText(payload);
    const fallback = buildFallbackSuggestion(prompt);

    res.status(200).json({
      title: cleanText(parsed?.title).slice(0, 56) || fallback.title,
      body: cleanText(parsed?.body).slice(0, 180) || fallback.body,
      color: /^#([\da-f]{3}|[\da-f]{6})$/i.test(cleanText(parsed?.color))
        ? cleanText(parsed.color)
        : fallback.color,
    });
  } catch {
    res.status(200).json(buildFallbackSuggestion(prompt));
  }
}
