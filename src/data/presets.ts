import type {
  CaptionTheme,
  MediaAsset,
  PlatformPreset,
  StoryPreset,
} from '../types';

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: 'youtube-shorts',
    label: 'YouTube Shorts',
    description: 'Centered hook title with breathing room for the Shorts chrome.',
    width: 1080,
    height: 1920,
    safeTop: 240,
    safeBottom: 300,
    exportLabel: '1080x1920 MP4',
  },
  {
    id: 'instagram-reels',
    label: 'Instagram Reels',
    description: 'Slightly lower text stack to stay clear of profile UI and captions.',
    width: 1080,
    height: 1920,
    safeTop: 220,
    safeBottom: 340,
    exportLabel: '1080x1920 Reel master',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description: 'Aggressive top hook placement with room for the right-side action rail.',
    width: 1080,
    height: 1920,
    safeTop: 210,
    safeBottom: 320,
    exportLabel: '1080x1920 TikTok master',
  },
];

export const CAPTION_THEMES: CaptionTheme[] = [
  {
    id: 'impact',
    label: 'Impact',
    description: 'Bold, all-caps emphasis for high-energy social hooks.',
    accentVar: '--accent-sun',
  },
  {
    id: 'clean-room',
    label: 'Clean Room',
    description: 'Minimal lower-third styling for product demos and explainers.',
    accentVar: '--accent-sky',
  },
  {
    id: 'night-shift',
    label: 'Night Shift',
    description: 'Dark translucent treatment for gameplay and creator commentary.',
    accentVar: '--accent-mint',
  },
];

export const STORY_PRESETS: StoryPreset[] = [
  {
    id: 'clip-commander',
    label: 'Clip Commander',
    description: 'Turn a long-form talking-head or tutorial clip into a vertical recap with bold captions.',
    challengeFit: 'Cloudinary smart crop, trim windows, caption-ready delivery, and direct social exports.',
    defaults: {
      storyPresetId: 'clip-commander',
      headline: 'Turn any 16:9 upload into a vertical short with captions',
      captionSeed: 'Take the strongest sentence, cut straight to the payoff, and keep the caption pacing fast.',
      ctaLabel: 'Drop into edit mode',
      clipDuration: 20,
      startOffset: 4,
      useAiPreview: true,
      includeGameplay: false,
    },
  },
  {
    id: 'launch-loop',
    label: 'Launch Loop',
    description: 'Package a product demo or founder update into a polished Reel with a strong CTA.',
    challengeFit: 'Cloudinary delivery recipes, branded still posters, and platform-safe export variants.',
    defaults: {
      storyPresetId: 'launch-loop',
      headline: 'Ship a promo-ready Reel from one source video',
      captionSeed: 'Lead with the product outcome, then show the one detail that makes the demo feel real.',
      ctaLabel: 'Watch the full demo',
      clipDuration: 15,
      startOffset: 2,
      useAiPreview: false,
      includeGameplay: false,
    },
  },
  {
    id: 'gameplay-stack',
    label: 'Gameplay Stack',
    description: 'Layer creator narration over a gameplay bed and export a creator-friendly vertical template.',
    challengeFit: 'Cloudinary video delivery plus a production plan for split-screen overlays and caption burn-ins.',
    defaults: {
      storyPresetId: 'gameplay-stack',
      headline: 'Commentary on top, gameplay below, captions dead center',
      captionSeed: 'Cut to the best reaction, keep the lower half moving, and keep captions inside the safe zone.',
      ctaLabel: 'Queue final render',
      clipDuration: 30,
      startOffset: 5,
      useAiPreview: true,
      includeGameplay: true,
    },
  },
];

export const SAMPLE_PRIMARY_ASSET: MediaAsset = {
  id: 'sample-dog',
  label: 'Sample Source Clip',
  publicId: 'dog',
  secureUrl: 'https://res.cloudinary.com/demo/video/upload/f_auto/q_auto/dog.mp4',
  source: 'sample',
  resourceType: 'video',
};

export const SAMPLE_GAMEPLAY_ASSET: MediaAsset = {
  id: 'sample-sea-turtle',
  label: 'Sample Gameplay Bed',
  publicId: 'samples/sea-turtle',
  secureUrl: 'https://res.cloudinary.com/demo/video/upload/f_auto/q_auto/samples/sea-turtle.mp4',
  source: 'sample',
  resourceType: 'video',
};
