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
  const previousScript = cleanText(body.previousScript);
  const previousPrompt = cleanText(body.previousPrompt);
  const scriptGuidance = cleanText(body.scriptGuidance);
  const brainrotType = cleanText(body.brainrotType || 'reddit-drama');
  const templateId = cleanText(body.templateId || '');
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  if (!prompt) {
    res.status(400).json({ error: 'Enter a prompt before enhancing it.' });
    return;
  }

  if (!apiKey) {
    res.status(503).json({ error: 'Gemini is not configured. Set GEMINI_API_KEY on the server.' });
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
              text: [
                'You improve short-form reel prompts and script guidance.',
                'Preserve the core topic. Make the prompt more specific, clickable, and easier to script.',
                'When a previous script is provided, use it to identify what to fix instead of changing the concept completely.',
                'Keep the revised prompt concise and platform-agnostic.',
                'Return JSON only.',
              ].join('\n'),
            },
          ],
        },
        contents: [
          {
            parts: [
              {
                text: JSON.stringify(
                  {
                    task: 'Enhance the reel prompt and tighten script guidance.',
                    prompt,
                    previousPrompt,
                    scriptGuidance,
                    previousScript,
                    brainrotType,
                    templateId,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
              scriptGuidance: { type: 'string' },
            },
            required: ['prompt', 'scriptGuidance'],
          },
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error?.message || 'Gemini failed to enhance the prompt.');
    }

    const parsed = parseGeminiText(payload);

    if (!parsed?.prompt || !parsed?.scriptGuidance) {
      throw new Error('Gemini returned an invalid prompt enhancement payload.');
    }

    res.status(200).json({
      model,
      prompt: cleanText(parsed.prompt),
      scriptGuidance: cleanText(parsed.scriptGuidance),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to enhance the prompt.',
    });
  }
}
