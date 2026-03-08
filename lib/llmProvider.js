const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_CHAT_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_EMBEDDINGS_API_URL = 'https://openrouter.ai/api/v1/embeddings';

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeProviderMode(value) {
  const cleaned = cleanText(value).toLowerCase();

  if (cleaned === 'gemini' || cleaned === 'openrouter') {
    return cleaned;
  }

  return 'auto';
}

function resolveProviderConfig(provider) {
  const mode = normalizeProviderMode(provider);

  if (mode === 'gemini') {
    return {
      mode,
      useGemini: true,
      useOpenRouter: false,
      missingKeyMessage: 'Gemini is not configured. Set GEMINI_API_KEY on the server.',
    };
  }

  if (mode === 'openrouter') {
    return {
      mode,
      useGemini: false,
      useOpenRouter: true,
      missingKeyMessage: 'OpenRouter is not configured. Set OPENROUTER_API_KEY on the server.',
    };
  }

  return {
    mode,
    useGemini: true,
    useOpenRouter: true,
    missingKeyMessage:
      'No Gemini or OpenRouter API key is configured. Set GEMINI_API_KEY or OPENROUTER_API_KEY on the server.',
  };
}

function parseMaybeJson(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function parseGeminiStructuredPayload(payload) {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => ('text' in part ? part.text : ''))
    .join('')
    .trim();

  return parseMaybeJson(text);
}

function extractOpenRouterTextContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object' && typeof item.text === 'string') {
          return item.text;
        }

        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

function parseOpenRouterStructuredPayload(payload) {
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    return null;
  }

  if (typeof content === 'object' && !Array.isArray(content)) {
    return content;
  }

  return parseMaybeJson(extractOpenRouterTextContent(content));
}

function buildOpenRouterHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Title': 'shorty',
  };
  const referer =
    cleanText(process.env.OPENROUTER_HTTP_REFERER) ||
    cleanText(process.env.APP_URL) ||
    (cleanText(process.env.VERCEL_URL) ? `https://${cleanText(process.env.VERCEL_URL)}` : '');

  if (referer) {
    headers['HTTP-Referer'] = referer;
  }

  return headers;
}

function extractGeminiError(payload, fallbackMessage) {
  return payload?.error?.message || fallbackMessage;
}

function extractOpenRouterError(payload, fallbackMessage) {
  return (
    payload?.error?.message ||
    payload?.error ||
    payload?.choices?.[0]?.message?.error ||
    fallbackMessage
  );
}

export function resolveOpenRouterModelId(model) {
  const cleaned = cleanText(model);

  if (!cleaned) {
    return 'google/gemini-2.5-flash';
  }

  const aliases = {
    'gemini-3.1-flash-lite': 'google/gemini-3.1-flash-lite-preview',
  };

  if (aliases[cleaned]) {
    return aliases[cleaned];
  }

  if (cleaned.includes('/')) {
    return cleaned;
  }

  if (cleaned.startsWith('gemini-')) {
    return `google/${cleaned}`;
  }

  return cleaned;
}

async function requestGeminiStructuredJson({
  apiKey,
  model,
  systemInstruction,
  userPrompt,
  schema,
  thinkingBudget,
}) {
  const body = {
    systemInstruction: {
      parts: [
        {
          text: systemInstruction,
        },
      ],
    },
    contents: [
      {
        parts: [
          {
            text: userPrompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
    },
  };

  if (Number.isFinite(thinkingBudget)) {
    body.generationConfig.thinkingConfig = {
      thinkingBudget,
    };
  }

  const response = await fetch(`${GEMINI_API_URL}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(extractGeminiError(payload, 'Gemini request failed.'));
  }

  const data = parseGeminiStructuredPayload(payload);

  if (!data) {
    throw new Error('Gemini returned invalid JSON.');
  }

  return data;
}

async function requestOpenRouterStructuredJson({
  apiKey,
  model,
  systemInstruction,
  userPrompt,
  schemaName,
  schema,
  temperature = 0,
}) {
  const response = await fetch(OPENROUTER_CHAT_API_URL, {
    method: 'POST',
    headers: buildOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model: resolveOpenRouterModelId(model),
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: cleanText(schemaName) || 'structured_response',
          strict: true,
          schema,
        },
      },
      plugins: [{ id: 'response-healing' }],
      temperature,
    }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(extractOpenRouterError(payload, 'OpenRouter request failed.'));
  }

  const data = parseOpenRouterStructuredPayload(payload);

  if (!data) {
    throw new Error('OpenRouter returned invalid JSON.');
  }

  return data;
}

export async function generateStructuredJson({
  model,
  systemInstruction,
  userPrompt,
  schemaName,
  schema,
  thinkingBudget,
  temperature,
  provider = 'auto',
}) {
  const providerConfig = resolveProviderConfig(provider);
  const geminiApiKey = cleanText(process.env.GEMINI_API_KEY);
  const openRouterApiKey = cleanText(process.env.OPENROUTER_API_KEY);
  let geminiError = null;

  if (providerConfig.useGemini && geminiApiKey) {
    try {
      const data = await requestGeminiStructuredJson({
        apiKey: geminiApiKey,
        model,
        systemInstruction,
        userPrompt,
        schema,
        thinkingBudget,
      });

      return {
        data,
        provider: 'gemini',
        model,
      };
    } catch (error) {
      geminiError = error instanceof Error ? error : new Error('Gemini request failed.');
    }
  }

  if (providerConfig.useOpenRouter && openRouterApiKey) {
    const data = await requestOpenRouterStructuredJson({
      apiKey: openRouterApiKey,
      model,
      systemInstruction,
      userPrompt,
      schemaName,
      schema,
      temperature,
    });

    return {
      data,
      provider: 'openrouter',
      model: resolveOpenRouterModelId(model),
      warning:
        providerConfig.mode !== 'auto'
          ? undefined
          : geminiError
            ? `Gemini request failed, so OpenRouter handled this request instead. ${geminiError.message}`
            : geminiApiKey
              ? undefined
              : 'Using OpenRouter because GEMINI_API_KEY is not configured.',
    };
  }

  if (geminiError) {
    throw geminiError;
  }

  throw new Error(providerConfig.missingKeyMessage);
}

async function requestGeminiEmbedding({ apiKey, model, text, taskType }) {
  const response = await fetch(`${GEMINI_API_URL}/${model}:embedContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      content: {
        parts: [{ text }],
      },
      taskType,
    }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(extractGeminiError(payload, 'Gemini embedding request failed.'));
  }

  const values = payload?.embedding?.values;

  if (!Array.isArray(values) || !values.length) {
    throw new Error('Gemini embedding response was empty.');
  }

  return values;
}

async function requestOpenRouterEmbedding({ apiKey, model, text }) {
  const response = await fetch(OPENROUTER_EMBEDDINGS_API_URL, {
    method: 'POST',
    headers: buildOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model: resolveOpenRouterModelId(model),
      input: text,
      encoding_format: 'float',
    }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(extractOpenRouterError(payload, 'OpenRouter embedding request failed.'));
  }

  const values = payload?.data?.[0]?.embedding;

  if (!Array.isArray(values) || !values.length) {
    throw new Error('OpenRouter embedding response was empty.');
  }

  return values;
}

export async function embedTextWithFallback({
  model,
  text,
  taskType = 'RETRIEVAL_DOCUMENT',
  provider = 'auto',
}) {
  const providerConfig = resolveProviderConfig(provider);
  const geminiApiKey = cleanText(process.env.GEMINI_API_KEY);
  const openRouterApiKey = cleanText(process.env.OPENROUTER_API_KEY);
  let geminiError = null;

  if (providerConfig.useGemini && geminiApiKey) {
    try {
      return {
        values: await requestGeminiEmbedding({
          apiKey: geminiApiKey,
          model,
          text,
          taskType,
        }),
        provider: 'gemini',
        model,
      };
    } catch (error) {
      geminiError = error instanceof Error ? error : new Error('Gemini embedding request failed.');
    }
  }

  if (providerConfig.useOpenRouter && openRouterApiKey) {
    return {
      values: await requestOpenRouterEmbedding({
        apiKey: openRouterApiKey,
        model,
        text,
      }),
      provider: 'openrouter',
      model: resolveOpenRouterModelId(model),
      warning:
        providerConfig.mode !== 'auto'
          ? undefined
          : geminiError
            ? `Gemini embeddings failed, so OpenRouter handled this request instead. ${geminiError.message}`
            : geminiApiKey
              ? undefined
              : 'Using OpenRouter embeddings because GEMINI_API_KEY is not configured.',
    };
  }

  if (geminiError) {
    throw geminiError;
  }

  throw new Error(providerConfig.missingKeyMessage);
}
