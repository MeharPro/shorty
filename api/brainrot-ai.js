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

function normalizeComparableText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function isMeaningfullyRewritten(original, next) {
  const cleanOriginal = normalizeComparableText(original);
  const cleanNext = normalizeComparableText(next);

  return Boolean(cleanOriginal && cleanNext && cleanOriginal !== cleanNext);
}

function isMeaningfullyChanged(original, next) {
  const cleanOriginal = normalizeComparableText(original);
  const cleanNext = normalizeComparableText(next);

  return Boolean(cleanNext && cleanOriginal !== cleanNext);
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

function buildFallbackEnhancedPrompt(prompt, brainrotType) {
  const basePrompt = cleanText(prompt).replace(/[?!.]+$/g, '');
  const fallbackStem = basePrompt || 'What hidden detail changes the whole story';

  switch (cleanText(brainrotType || 'reddit-drama')) {
    case 'conspiracy-spiral':
      return `${fallbackStem}, and what missing detail makes the official version feel impossible to trust?`;
    case 'motivation-shock':
      return `${fallbackStem}, and what consequence makes ignoring it feel expensive?`;
    case 'weird-facts':
      return `${fallbackStem}, and what overlooked pattern makes it impossible to unsee?`;
    case 'money-panic':
      return `${fallbackStem}, and what cost shows up after people think it is already safe?`;
    case 'subway-storytime':
      return `${fallbackStem}, and which small mistake turned the whole story into a disaster?`;
    case 'reddit-drama':
    default:
      return `${fallbackStem}, and which hidden detail made everyone realize it was worse than it sounded?`;
  }
}

function buildFallbackEnhancedGuidance(scriptGuidance, brainrotType, previousScript) {
  const typeId = cleanText(brainrotType || 'reddit-drama');
  const hasPreviousScript = Boolean(cleanText(previousScript));

  const typeBeat =
    typeId === 'conspiracy-spiral'
      ? 'Expose the suspicious pattern early, then reveal the missing piece that makes the timeline crack.'
      : typeId === 'motivation-shock'
        ? 'Hit the cost of the mistake immediately, then escalate into the consequence people usually avoid naming.'
        : typeId === 'weird-facts'
          ? 'Open with the strange behavior, then spell out the pattern that makes it feel impossible to ignore.'
          : typeId === 'money-panic'
            ? 'Set up the money mistake fast, then show the cost and why people miss it until it compounds.'
            : 'Open with the setup in one line, reveal the hidden detail by the second beat, and land on the fallout that makes people pick a side.';

  const revisionBeat = hasPreviousScript
    ? 'Do not reuse the previous script wording. Keep the topic, but sharpen the conflict and payoff.'
    : 'Keep the topic the same, but make the angle sharper and more specific.';

  const guidance = cleanText(scriptGuidance);

  if (!guidance) {
    return `${typeBeat} ${revisionBeat} Keep it platform-agnostic and easy to caption in short bursts.`;
  }

  return `${guidance} ${typeBeat} ${revisionBeat}`.trim();
}

function buildEnhancePromptRequest(body, prompt, strictRewrite) {
  return JSON.stringify(
    {
      task: strictRewrite
        ? 'Rewrite the reel prompt so it is clearly different from the original while preserving the same topic.'
        : 'Enhance the reel prompt and tighten script guidance.',
      prompt,
      previousPrompt: cleanText(body.previousPrompt),
      scriptGuidance: cleanText(body.scriptGuidance),
      previousScript: cleanText(body.previousScript),
      brainrotType: cleanText(body.brainrotType || 'reddit-drama'),
      templateId: cleanText(body.templateId || ''),
      rewriteRequirements: strictRewrite
        ? [
            'Do not return the original prompt unchanged.',
            'Keep the same concept, but rewrite the wording and add a sharper conflict, hidden detail, or consequence.',
            'Make the rewritten prompt visibly different from the input in plain text.',
          ]
        : [
            'Preserve the topic.',
            'Make the prompt more specific, clickable, and easier to script.',
          ],
    },
    null,
    2
  );
}

async function requestPromptEnhancement({ body, prompt, model, apiKey, strictRewrite = false }) {
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
              'Preserve the core topic, but rewrite the prompt into a stronger, more specific hook.',
              'The revised prompt must be materially different from the original wording and still feel platform-agnostic.',
              'When a previous script is provided, use it to identify what to fix instead of changing the concept completely.',
              'Return JSON only.',
            ].join('\n'),
          },
        ],
      },
      contents: [
        {
          parts: [
            {
              text: buildEnhancePromptRequest(body, prompt, strictRewrite),
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

  return {
    prompt: cleanText(parsed.prompt),
    scriptGuidance: cleanText(parsed.scriptGuidance),
  };
}

async function handleGenerateNode({ prompt, model, apiKey }, res) {
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

async function handleEnhancePrompt({ body, prompt, model, apiKey }, res) {
  if (!prompt) {
    res.status(400).json({ error: 'Enter a prompt before enhancing it.' });
    return;
  }

  if (!apiKey) {
    res.status(503).json({ error: 'Gemini is not configured. Set GEMINI_API_KEY on the server.' });
    return;
  }

  try {
    let enhanced = await requestPromptEnhancement({
      body,
      prompt,
      model,
      apiKey,
    });

    if (!isMeaningfullyRewritten(prompt, enhanced.prompt)) {
      try {
        enhanced = await requestPromptEnhancement({
          body,
          prompt,
          model,
          apiKey,
          strictRewrite: true,
        });
      } catch {
        enhanced = {
          prompt: '',
          scriptGuidance: '',
        };
      }
    }

    const nextPrompt = isMeaningfullyRewritten(prompt, enhanced.prompt)
      ? enhanced.prompt
      : buildFallbackEnhancedPrompt(prompt, body.brainrotType);
    const nextScriptGuidance = isMeaningfullyChanged(body.scriptGuidance, enhanced.scriptGuidance)
      ? enhanced.scriptGuidance
      : buildFallbackEnhancedGuidance(
          body.scriptGuidance,
          body.brainrotType,
          body.previousScript
        );

    res.status(200).json({
      model,
      prompt: nextPrompt,
      scriptGuidance: nextScriptGuidance,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to enhance the prompt.',
    });
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

  const operation = cleanText(body.operation);
  const prompt = cleanText(body.prompt);
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  if (operation === 'generate-node') {
    await handleGenerateNode({ prompt, model, apiKey }, res);
    return;
  }

  if (operation === 'enhance-prompt') {
    await handleEnhancePrompt({ body, prompt, model, apiKey }, res);
    return;
  }

  res.status(400).json({
    error: 'Unsupported operation. Use "generate-node" or "enhance-prompt".',
  });
}
