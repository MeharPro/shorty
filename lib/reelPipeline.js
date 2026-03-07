const HOOK_KEYWORDS = [
  'how',
  'why',
  'secret',
  'mistake',
  'truth',
  'nobody',
  'everyone',
  'stop',
  'start',
  'before',
  'after',
  'first',
  'best',
  'worst',
  'crazy',
  'wild',
  'instantly',
  'immediately',
  'unexpected',
  'surprising',
  'what if',
  'here is',
  'this is',
];

const EMOTION_KEYWORDS = [
  'love',
  'hate',
  'afraid',
  'fear',
  'shocked',
  'amazing',
  'insane',
  'embarrassing',
  'excited',
  'angry',
  'happy',
  'sad',
  'frustrated',
  'regret',
  'painful',
  'win',
  'lose',
];

const NOVELTY_KEYWORDS = [
  'new',
  'unexpected',
  'secret',
  'hidden',
  'rare',
  'nobody',
  'surprising',
  'little-known',
  'counterintuitive',
  'actually',
  'turns out',
];

const MOVEMENT_KEYWORDS = [
  'watch',
  'look',
  'show',
  'move',
  'build',
  'demo',
  'reaction',
  'change',
  'reveal',
  'before',
  'after',
  'live',
  'real-time',
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function countMatches(text, keywords) {
  const lowered = text.toLowerCase();
  return keywords.reduce((count, keyword) => count + (lowered.includes(keyword) ? 1 : 0), 0);
}

function parseTimestamp(raw) {
  const match = raw.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function splitSentences(text) {
  return text
    .replace(/\r/g, ' ')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function parseTranscriptBlocks(transcriptText, sourceDurationSeconds) {
  const text = (transcriptText || '').trim();
  if (!text) {
    return [];
  }

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const timestamped = lines
    .map((line) => {
      const match = line.match(/^((?:(?:\d{1,2}:)?\d{1,2}:\d{2})(?:\.\d+)?)\s+(.+)$/);
      if (!match) {
        return null;
      }

      return {
        start: parseTimestamp(match[1]),
        text: match[2].trim(),
      };
    })
    .filter(Boolean)
    .filter((item) => Number.isFinite(item.start));

  if (timestamped.length >= 2) {
    return timestamped.map((item, index) => ({
      start: item.start,
      end:
        index < timestamped.length - 1
          ? timestamped[index + 1].start
          : Math.min(sourceDurationSeconds, item.start + 12),
      text: item.text,
    }));
  }

  const sentences = splitSentences(text);
  if (!sentences.length) {
    return [];
  }

  const step = Math.max(8, sourceDurationSeconds / Math.max(sentences.length, 1));
  return sentences.map((sentence, index) => ({
    start: round(index * step),
    end: round(Math.min(sourceDurationSeconds, (index + 1) * step)),
    text: sentence,
  }));
}

function buildCaptionLines(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  const maxLineChars = 18;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLineChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }

    if (lines.length === 2) {
      break;
    }
  }

  if (current && lines.length < 2) {
    lines.push(current);
  }

  return lines.slice(0, 2);
}

function buildTitle(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Suggested Reel';
  }

  const shortened = cleaned.length > 72 ? `${cleaned.slice(0, 69).trim()}…` : cleaned;
  return shortened.charAt(0).toUpperCase() + shortened.slice(1);
}

function scoreCandidate(text, startOffset, clipDuration, sourceDurationSeconds, index, total) {
  const normalizedText = text.trim();
  const wordCount = normalizedText ? normalizedText.split(/\s+/).length : 0;
  const hookMatches = countMatches(normalizedText, HOOK_KEYWORDS);
  const emotionMatches = countMatches(normalizedText, EMOTION_KEYWORDS);
  const noveltyMatches = countMatches(normalizedText, NOVELTY_KEYWORDS);
  const movementMatches = countMatches(normalizedText, MOVEMENT_KEYWORDS);
  const punctuationBonus = /[!?]/.test(normalizedText) ? 8 : 0;
  const numberBonus = /\d/.test(normalizedText) ? 6 : 0;
  const earlyBias = Math.max(0, 1 - startOffset / Math.max(sourceDurationSeconds, 1));
  const midBias = 1 - Math.abs((startOffset + clipDuration / 2) / Math.max(sourceDurationSeconds, 1) - 0.45);
  const density = wordCount / Math.max(clipDuration, 1);

  const hookStrength = clamp(38 + hookMatches * 12 + punctuationBonus + numberBonus, 0, 100);
  const standaloneClarity = clamp(
    48 + (wordCount >= 10 && wordCount <= 40 ? 18 : 8) + (/[.!?]$/.test(normalizedText) ? 8 : 0),
    0,
    100
  );
  const emotionalImpact = clamp(28 + emotionMatches * 18 + punctuationBonus, 0, 100);
  const novelty = clamp(26 + noveltyMatches * 16 + numberBonus, 0, 100);
  const pacing = clamp(
    52 + (clipDuration >= 30 && clipDuration <= 45 ? 18 : 8) + earlyBias * 12 + density * 3,
    0,
    100
  );
  const visualEngagement = clamp(
    42 + movementMatches * 14 + midBias * 20 + ((index + 1) / Math.max(total, 1)) * 6,
    0,
    100
  );
  const insightDensity = clamp(32 + density * 18 + numberBonus + (wordCount > 20 ? 12 : 0), 0, 100);

  const viralityScore = round(
    hookStrength * 0.23 +
      standaloneClarity * 0.18 +
      emotionalImpact * 0.16 +
      novelty * 0.12 +
      pacing * 0.16 +
      visualEngagement * 0.15
  );

  return {
    viralityScore,
    breakdown: {
      hookStrength: round(hookStrength),
      standaloneClarity: round(standaloneClarity),
      emotionalImpact: round(emotionalImpact),
      novelty: round(novelty),
      pacing: round(pacing),
      visualEngagement: round(visualEngagement),
      insightDensity: round(insightDensity),
    },
  };
}

function deriveTranscriptCandidates(blocks, sourceDurationSeconds) {
  return blocks.map((block, index) => {
    const rawDuration = Math.max(12, (block.end || block.start + 12) - block.start);
    const clipDuration = clamp(Math.round(34 + Math.min(block.text.length, 160) / 8), 30, 60);
    const startOffset = clamp(Math.round(block.start - Math.min(4, rawDuration / 2)), 0, Math.max(0, sourceDurationSeconds - clipDuration));
    const scoring = scoreCandidate(block.text, startOffset, clipDuration, sourceDurationSeconds, index, blocks.length);
    const captionLines = buildCaptionLines(block.text);
    const hook = captionLines[0] || buildTitle(block.text);

    return {
      id: `transcript-${index + 1}`,
      startOffset,
      duration: clipDuration,
      title: buildTitle(block.text),
      transcriptExcerpt: block.text,
      hook,
      captionLines,
      viralityScore: scoring.viralityScore,
      scoreBreakdown: scoring.breakdown,
      reasoning: [
        `Strong transcript signal near ${Math.round(block.start)}s`,
        scoring.breakdown.hookStrength >= 65
          ? 'Opening line reads like a hook for short-form audiences'
          : 'Clip still has enough context to stand alone',
        scoring.breakdown.visualEngagement >= 60
          ? 'Likely to pair well with visually dynamic moments'
          : 'Works best as a clean speaking or explainer segment',
      ],
      editingPlan: [
        'Open on the strongest hook sentence in the first 1–2 seconds',
        'Keep captions centered and concise for retention',
        'Use vertical auto-crop with fast, clean cuts around the main beat',
      ],
      analysisSource: 'transcript',
    };
  });
}

function deriveVisualCandidates(sourceDurationSeconds) {
  const desired = clamp(Math.round(sourceDurationSeconds / 75), 1, 4);
  const spacing = sourceDurationSeconds / (desired + 1);

  return Array.from({ length: desired }, (_, index) => {
    const duration = clamp(34 + (index % 3) * 6, 30, 46);
    const anchor = spacing * (index + 1);
    const startOffset = clamp(Math.round(anchor - duration / 2), 0, Math.max(0, sourceDurationSeconds - duration));
    const label = `Visual momentum window ${index + 1}`;
    const scoring = scoreCandidate(label, startOffset, duration, sourceDurationSeconds, index, desired);

    return {
      id: `visual-${index + 1}`,
      startOffset,
      duration,
      title: label,
      transcriptExcerpt: '',
      hook: 'Watch this part',
      captionLines: ['Fast-paced visual moment', 'Good short-form pacing'],
      viralityScore: round(scoring.viralityScore - 4),
      scoreBreakdown: scoring.breakdown,
      reasoning: [
        'Chosen from a visually promising section of the timeline',
        'Balanced for movement, scene changes, and pacing potential',
      ],
      editingPlan: [
        'Lead with the first visually active beat',
        'Tighten dead air between movements or demos',
        'Use punch-in emphasis only where the action peaks',
      ],
      analysisSource: 'visual',
    };
  });
}

function findBestHighlightForClip(clip, highlights) {
  if (!Array.isArray(highlights) || !highlights.length) {
    return null;
  }

  const clipStart = clip.startOffset;
  const clipEnd = clip.startOffset + clip.duration;

  return highlights.reduce((best, highlight) => {
    const overlap = Math.max(0, Math.min(clipEnd, highlight.end) - Math.max(clipStart, highlight.start));
    const distance = overlap > 0
      ? 0
      : Math.min(Math.abs(highlight.start - clipEnd), Math.abs(clipStart - highlight.end));
    const score = overlap > 0
      ? highlight.score + overlap / Math.max(clip.duration, 1)
      : highlight.score - distance / 20;

    if (!best || score > best.score) {
      return { score, highlight };
    }

    return best;
  }, null)?.highlight ?? null;
}

function clampScore(value) {
  return clamp(round(value), 0, 100);
}

function resolveFocusStrategy(highlight, editingOptions = {}) {
  if (editingOptions.focusPreference && editingOptions.focusPreference !== 'auto') {
    if (editingOptions.focusPreference === 'group' && highlight?.faceCount < 4) {
      return 'speaker';
    }

    return editingOptions.focusPreference;
  }

  return highlight?.focusStrategy || (highlight?.faceCount >= 4 ? 'group' : 'speaker');
}

function resolveCameraMotion(highlight, editingOptions = {}) {
  if (editingOptions.cameraMotionPreference && editingOptions.cameraMotionPreference !== 'auto') {
    return editingOptions.cameraMotionPreference;
  }

  return highlight?.cameraMotion || (highlight?.score >= 0.78 ? 'shake' : highlight?.score >= 0.56 ? 'dynamic' : 'steady');
}

function applyViralStyleBoost(score, editingOptions = {}) {
  if (editingOptions.viralStyle === 'aggressive') {
    return clampScore(score + 4);
  }

  return clampScore(score);
}

function applyVisualBoost(candidate, highlights, editingOptions) {
  const highlight = findBestHighlightForClip(candidate, highlights);
  if (!highlight) {
    return candidate;
  }

  const boost = Math.max(0, round(highlight.score * 18));
  if (boost <= 0) {
    return candidate;
  }

  return {
    ...candidate,
    viralityScore: applyViralStyleBoost(candidate.viralityScore + boost, editingOptions),
    analysisSource: candidate.analysisSource === 'transcript' ? 'hybrid' : candidate.analysisSource,
    expressionLabel: highlight.label,
    expressionScore: clampScore(highlight.score * 100),
    focusStrategy: resolveFocusStrategy(highlight, editingOptions),
    cameraMotion: resolveCameraMotion(highlight, editingOptions),
    scoreBreakdown: {
      ...candidate.scoreBreakdown,
      visualEngagement: clampScore(candidate.scoreBreakdown.visualEngagement + boost * 1.4),
      emotionalImpact: clampScore(candidate.scoreBreakdown.emotionalImpact + boost * 0.9),
      hookStrength: clampScore(candidate.scoreBreakdown.hookStrength + boost * 0.45),
    },
    reasoning: [
      `${highlight.label} around ${Math.round(highlight.start)}s adds high-retention facial energy`,
      ...candidate.reasoning,
    ],
    editingPlan: [
      'Preserve the facial reaction beat in the first 1–2 seconds of the cut',
      ...candidate.editingPlan,
    ],
  };
}

function deriveExpressionCandidates(highlights, sourceDurationSeconds, editingOptions) {
  if (!Array.isArray(highlights) || !highlights.length) {
    return [];
  }

  return highlights.map((highlight, index) => {
    const focusDuration = clamp(Math.round(30 + highlight.score * 24), 30, 50);
    const focusCenter = (highlight.start + highlight.end) / 2;
    const startOffset = clamp(
      Math.round(focusCenter - focusDuration * 0.38),
      0,
      Math.max(0, sourceDurationSeconds - focusDuration)
    );
    const scoring = scoreCandidate(
      highlight.label,
      startOffset,
      focusDuration,
      sourceDurationSeconds,
      index,
      highlights.length
    );
    const visualBoost = highlight.score * 24;

    return {
      id: `expression-${index + 1}`,
      startOffset,
      duration: focusDuration,
      title: highlight.label,
      transcriptExcerpt: '',
      hook: highlight.label,
      captionLines: buildCaptionLines(highlight.label),
      viralityScore: clampScore(scoring.viralityScore + visualBoost),
      scoreBreakdown: {
        ...scoring.breakdown,
        visualEngagement: clampScore(scoring.breakdown.visualEngagement + visualBoost * 1.6),
        emotionalImpact: clampScore(scoring.breakdown.emotionalImpact + visualBoost * 1.15),
      },
      reasoning: [
        `MediaPipe found a strong ${highlight.dominantExpression} moment in this window`,
        `${highlight.label} improves thumb-stop potential`,
      ],
      editingPlan: [
        'Cut into the facial reaction before the intensity peak',
        'Keep captions clear of the face while the expression lands',
        'Avoid trimming through the peak expression frame',
      ],
      analysisSource: 'visual',
      expressionLabel: highlight.label,
      expressionScore: clampScore(highlight.score * 100),
      focusStrategy: resolveFocusStrategy(highlight, editingOptions),
      cameraMotion: resolveCameraMotion(highlight, editingOptions),
    };
  });
}

function overlapsTooMuch(candidate, kept) {
  return kept.some((item) => {
    const intersection = Math.max(
      0,
      Math.min(candidate.startOffset + candidate.duration, item.startOffset + item.duration) -
        Math.max(candidate.startOffset, item.startOffset)
    );
    const overlapRatio = intersection / Math.min(candidate.duration, item.duration);
    return overlapRatio >= 0.6;
  });
}

export function normalizeGoogleDriveUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return null;
  }

  const directId = trimmed.match(/[?&]id=([^&]+)/)?.[1];
  const fileId = trimmed.match(/\/file\/d\/([^/]+)/)?.[1];
  const id = directId || fileId;

  if (!id) {
    return trimmed;
  }

  return `https://drive.google.com/uc?export=download&id=${id}`;
}

export function buildReelPlan({ transcriptText, sourceDurationSeconds, visualAnalysis, editingOptions = {} }) {
  const safeDuration = clamp(Number(sourceDurationSeconds) || 180, 30, 60 * 60);
  const transcriptBlocks = parseTranscriptBlocks(transcriptText, safeDuration);
  const highlights = Array.isArray(visualAnalysis?.highlights) ? visualAnalysis.highlights : [];
  const transcriptCandidates = deriveTranscriptCandidates(transcriptBlocks, safeDuration).map((candidate) =>
    applyVisualBoost(candidate, highlights, editingOptions)
  );
  const visualCandidates = deriveVisualCandidates(safeDuration);
  const expressionCandidates = deriveExpressionCandidates(highlights, safeDuration, editingOptions);
  const combined = [...transcriptCandidates, ...expressionCandidates, ...visualCandidates]
    .sort((left, right) => right.viralityScore - left.viralityScore)
    .filter((candidate) => candidate.duration >= 30 && candidate.duration <= 60);

  const maxClips = clamp(Math.round(safeDuration / 55), 1, 8);
  const kept = [];

  for (const candidate of combined) {
    if (kept.length >= maxClips) {
      break;
    }

    if (candidate.viralityScore < 54 && kept.length > 0) {
      continue;
    }

    if (overlapsTooMuch(candidate, kept)) {
      continue;
    }

    kept.push(candidate);
  }

  const finalClips = (kept.length ? kept : combined.slice(0, Math.max(1, maxClips))).map((clip, index) => ({
    ...clip,
    viralityScore: applyViralStyleBoost(clip.viralityScore, editingOptions),
    focusStrategy:
      clip.focusStrategy ||
      (editingOptions.focusPreference && editingOptions.focusPreference !== 'auto'
        ? editingOptions.focusPreference === 'group'
          ? 'speaker'
          : editingOptions.focusPreference
        : 'speaker'),
    cameraMotion:
      clip.cameraMotion ||
      (editingOptions.cameraMotionPreference && editingOptions.cameraMotionPreference !== 'auto'
        ? editingOptions.cameraMotionPreference
        : 'dynamic'),
    id: `reel-${index + 1}`,
    rank: index + 1,
  }));

  return {
    transcriptUsed: transcriptCandidates.length > 0,
    visualSignalsUsed: Boolean(visualAnalysis?.sampleCount),
    visualAnalysis: visualAnalysis || undefined,
    clips: finalClips,
  };
}
