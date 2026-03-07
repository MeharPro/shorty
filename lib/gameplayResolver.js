const DIRECT_VIDEO_PATTERN = /\.(mp4|mov|m4v|webm|m3u8)(\?.*)?$/i;

function normalizeCandidate(value, baseUrl) {
  if (!value) {
    return null;
  }

  try {
    const resolved = new URL(value.trim(), baseUrl).toString();
    return /^https?:\/\//i.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function extractMatches(html, baseUrl, pattern, groupIndex = 1) {
  const matches = [];

  for (const match of html.matchAll(pattern)) {
    const candidate = normalizeCandidate(match[groupIndex], baseUrl);
    if (candidate) {
      matches.push(candidate);
    }
  }

  return matches;
}

export function isDirectVideoUrl(url) {
  return DIRECT_VIDEO_PATTERN.test(url);
}

export function extractVideoCandidates(html, baseUrl) {
  const candidates = [
    ...extractMatches(
      html,
      baseUrl,
      /<meta[^>]+(?:property|name)=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/gi
    ),
    ...extractMatches(
      html,
      baseUrl,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:video(?::secure_url|:url)?["']/gi
    ),
    ...extractMatches(
      html,
      baseUrl,
      /<meta[^>]+(?:property|name)=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/gi
    ),
    ...extractMatches(html, baseUrl, /<video[^>]+src=["']([^"']+)["']/gi),
    ...extractMatches(html, baseUrl, /<source[^>]+src=["']([^"']+)["']/gi),
    ...extractMatches(html, baseUrl, /(https?:\/\/[^"'\\s>]+?\.(?:mp4|mov|m4v|webm|m3u8)(?:\?[^"'\\s>]*)?)/gi),
  ];

  return [...new Set(candidates)];
}

async function fetchAsText(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed with status ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.startsWith('video/')) {
    return {
      finalUrl: response.url,
      html: '',
      direct: true,
    };
  }

  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
  }

  return {
    finalUrl: response.url,
    html: await response.text(),
    direct: false,
  };
}

export async function resolveGameplayUrl(rawUrl) {
  const input = rawUrl?.trim();

  if (!input || !/^https?:\/\//i.test(input)) {
    throw new Error('Provide a valid http(s) URL.');
  }

  if (isDirectVideoUrl(input)) {
    return {
      resolvedUrl: input,
      candidates: [input],
      mode: 'direct',
    };
  }

  const { finalUrl, html, direct } = await fetchAsText(input);

  if (direct) {
    return {
      resolvedUrl: finalUrl,
      candidates: [finalUrl],
      mode: 'direct',
    };
  }

  const candidates = extractVideoCandidates(html, finalUrl);
  if (!candidates.length) {
    throw new Error('No direct video candidates were found on that page.');
  }

  return {
    resolvedUrl: candidates[0],
    candidates,
    mode: 'scraped',
  };
}
