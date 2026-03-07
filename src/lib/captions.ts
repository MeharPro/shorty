import type { CaptionCue, TranscriptSegment, TranscriptWord } from '../types';

interface BuildCaptionCuesOptions {
  clipStart: number;
  clipDuration: number;
  maxWordsPerCue?: number;
  maxCharsPerCue?: number;
  maxCueDuration?: number;
  longPauseThreshold?: number;
  maxLineChars?: number;
  maxLinesPerCue?: number;
}

export function splitCaptionWordsIntoRows(words: string[], maxLineChars: number): string[] {
  const rows: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLineChars && current) {
      rows.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    rows.push(current);
  }

  return rows;
}

function normalizeWord(word: TranscriptWord): TranscriptWord | null {
  const text = word.word.trim();
  if (!text) {
    return null;
  }

  const start = Number.isFinite(word.start) ? word.start : 0;
  const end = Number.isFinite(word.end) ? Math.max(word.end, start + 0.12) : start + 0.12;

  return {
    word: text,
    start,
    end,
  };
}

function buildCueFromWords(words: TranscriptWord[], cueIndex: number, clipStart: number): CaptionCue | null {
  if (!words.length) {
    return null;
  }

  return {
    id: `cue-${cueIndex + 1}`,
    text: words.map((word) => word.word).join(' '),
    start: Math.max(0, words[0].start - clipStart),
    end: Math.max(words[words.length - 1].end - clipStart, words[0].end - clipStart),
    words: words.map((word) => ({
      word: word.word,
      start: Math.max(0, word.start - clipStart),
      end: Math.max(word.end - clipStart, word.start - clipStart + 0.12),
    })),
  };
}

function estimateLineCount(words: TranscriptWord[], maxLineChars: number): number {
  return splitCaptionWordsIntoRows(
    words.map((word) => word.word),
    maxLineChars
  ).length;
}

export function buildCaptionCues(
  segments: TranscriptSegment[],
  {
    clipStart,
    clipDuration,
    maxWordsPerCue = 4,
    maxCharsPerCue = 28,
    maxCueDuration = 2.8,
    longPauseThreshold = 0.55,
    maxLineChars = 16,
    maxLinesPerCue = 2,
  }: BuildCaptionCuesOptions
): CaptionCue[] {
  const clipEnd = clipStart + clipDuration;
  const words = segments
    .flatMap((segment) => {
      if (segment.words.length > 0) {
        return segment.words;
      }

      return segment.text.split(/\s+/).map((token, index, all) => {
        const segmentDuration = Math.max(segment.end - segment.start, 0.5);
        const step = segmentDuration / Math.max(all.length, 1);
        return {
          word: token,
          start: segment.start + step * index,
          end: segment.start + step * (index + 1),
        } satisfies TranscriptWord;
      });
    })
    .map(normalizeWord)
    .filter((word): word is TranscriptWord => Boolean(word))
    .filter((word) => word.end >= clipStart && word.start <= clipEnd)
    .map((word) => ({
      ...word,
      start: Math.max(word.start, clipStart),
      end: Math.min(word.end, clipEnd),
    }));

  if (!words.length) {
    return [];
  }

  const cues: CaptionCue[] = [];
  let currentWords: TranscriptWord[] = [];

  for (const word of words) {
    const prevWord = currentWords[currentWords.length - 1] ?? null;
    const candidateWords = [...currentWords, word];
    const candidateText = candidateWords.map((item) => item.word).join(' ');
    const candidateDuration = candidateWords[candidateWords.length - 1].end - candidateWords[0].start;
    const pauseBefore = prevWord ? word.start - prevWord.end : 0;
    const candidateLineCount = estimateLineCount(candidateWords, maxLineChars);

    const shouldBreak =
      currentWords.length > 0 && (
        candidateWords.length > maxWordsPerCue ||
        candidateText.length > maxCharsPerCue ||
        candidateDuration > maxCueDuration ||
        pauseBefore > longPauseThreshold ||
        candidateLineCount > maxLinesPerCue
      );

    if (shouldBreak) {
      const cue = buildCueFromWords(currentWords, cues.length, clipStart);
      if (cue) {
        cues.push(cue);
      }
      currentWords = [word];
      continue;
    }

    currentWords = candidateWords;
  }

  const finalCue = buildCueFromWords(currentWords, cues.length, clipStart);
  if (finalCue) {
    cues.push(finalCue);
  }

  return cues;
}
