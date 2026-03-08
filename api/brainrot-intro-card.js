import crypto from 'node:crypto';
import {
  buildCloudinaryDeliveryUrl,
  uploadBufferToCloudinary,
} from '../lib/brainrotPipeline.js';

const CARD_WIDTH = 940;
const CARD_HEIGHT = 460;
const DEFAULT_HANDLE = '@Story Watch';
const DEFAULT_QUESTION = 'What happened next?';

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  return typeof body === 'string' ? JSON.parse(body || '{}') : body;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHandle(value) {
  const trimmed = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^@+/, '');

  return trimmed ? `@${trimmed}` : DEFAULT_HANDLE;
}

function normalizeQuestion(value) {
  const trimmed = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\w\s!?.,:'"-]/g, ' ')
    .replace(/\s+/g, ' ');

  return trimmed || DEFAULT_QUESTION;
}

function wrapLines(value, maxCharsPerLine = 34, maxLines = 2) {
  const words = normalizeQuestion(value).split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  const remaining = words.slice(lines.join(' ').split(' ').filter(Boolean).length).join(' ').trim();

  if (remaining) {
    lines.push(remaining);
  } else if (current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines).map((line, index, collection) => {
    if (index === collection.length - 1 && line.length > maxCharsPerLine) {
      return `${line.slice(0, maxCharsPerLine - 1).trimEnd()}…`;
    }

    return line;
  });
}

function getAvatarInitials(handle) {
  const cleaned = handle.replace(/^@/, '').trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  if (tokens.length >= 2) {
    return `${tokens[0][0] || 'R'}${tokens[1][0] || 'W'}`.toUpperCase();
  }

  return cleaned.slice(0, 2).toUpperCase() || 'RW';
}

function buildTspans(lines) {
  return lines
    .map((line, index) =>
      index === 0
        ? escapeXml(line)
        : `<tspan x="64" dy="56">${escapeXml(line)}</tspan>`
    )
    .join('');
}

function buildHeaderBadges() {
  const badges = [
    { fill: '#7dd3fc', label: '✦' },
    { fill: '#fde68a', label: '✶' },
    { fill: '#fca5a5', label: '✷' },
    { fill: '#c4b5fd', label: '✹' },
    { fill: '#86efac', label: '✶' },
    { fill: '#fdba74', label: '✦' },
  ];

  return badges
    .map((badge, index) => {
      const x = 186 + index * 42;
      return `
        <circle cx="${x}" cy="142" r="14" fill="${badge.fill}" />
        <text x="${x}" y="148" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#111827">${badge.label}</text>
      `;
    })
    .join('');
}

function buildIntroCardSvg({ title, question }) {
  const handle = normalizeHandle(title);
  const displayQuestion = normalizeQuestion(question);
  const questionLines = wrapLines(displayQuestion);
  const avatarInitials = getAvatarInitials(handle);
  const verifiedBadgeX = Math.min(770, 194 + handle.length * 17);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none">
      <defs>
        <linearGradient id="avatarGradient" x1="54" y1="58" x2="154" y2="162" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fed7aa" />
          <stop offset="1" stop-color="#f59e0b" />
        </linearGradient>
      </defs>

      <rect x="28" y="34" width="884" height="404" rx="40" fill="#0f172a" fill-opacity="0.12" />
      <rect x="20" y="20" width="900" height="420" rx="40" fill="#ffffff" fill-opacity="1" stroke="#e5e7eb" stroke-width="2" />

      <circle cx="94" cy="110" r="50" fill="url(#avatarGradient)" />
      <circle cx="94" cy="110" r="50" fill="#ffffff" fill-opacity="0.16" />
      <text x="94" y="124" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${escapeXml(avatarInitials)}</text>

      <text x="166" y="104" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#111827">${escapeXml(handle)}</text>
      <circle cx="${verifiedBadgeX}" cy="94" r="14" fill="#38bdf8" />
      <text x="${verifiedBadgeX}" y="99" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff">✓</text>

      ${buildHeaderBadges()}

      <text x="64" y="244" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#111827">${buildTspans(questionLines)}</text>

      <text x="64" y="382" font-family="Arial, sans-serif" font-size="28" fill="#9ca3af">♡ 99+</text>
      <text x="760" y="382" font-family="Arial, sans-serif" font-size="28" fill="#9ca3af">↗ 99+</text>
    </svg>
  `.trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    res.status(500).json({
      error:
        'Cloudinary intro card uploads are unavailable. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    });
    return;
  }

  const body = normalizeBody(req.body);
  const title = normalizeHandle(body.title);
  const question = normalizeQuestion(body.question);
  const svg = buildIntroCardSvg({ title, question });
  const publicId = `shorty/brainrot/intro-cards/${crypto
    .createHash('sha1')
    .update(`${title}|${question}`)
    .digest('hex')
    .slice(0, 24)}`;

  try {
    const upload = await uploadBufferToCloudinary({
      cloudName,
      apiKey,
      apiSecret,
      buffer: Buffer.from(svg),
      fileName: 'story-intro-card.svg',
      contentType: 'image/svg+xml',
      publicId,
      overwrite: true,
      resourceType: 'image',
    });

    res.status(200).json({
      asset: {
        id: publicId,
        publicId,
        secureUrl:
          upload.secure_url ||
          buildCloudinaryDeliveryUrl(cloudName, publicId, {
            resourceType: 'image',
            extension: 'svg',
            transformation: 'f_auto,q_auto',
          }),
        width: Number(upload.width || CARD_WIDTH),
        height: Number(upload.height || CARD_HEIGHT),
        resourceType: 'image',
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create the intro card asset.',
    });
  }
}
