import allEmojisData from './allEmojis.json';

// Define categories based on the unicode-emoji-json data
export const UNICODE_EMOJI_CATEGORIES = [
  { key: "Smileys & Emotion", label: "Smileys & Emotion" },
  { key: "People & Body", label: "People & Body" },
  { key: "Animals & Nature", label: "Animals & Nature" },
  { key: "Food & Drink", label: "Food & Drink" },
  { key: "Activities", label: "Activities" },
  { key: "Travel & Places", label: "Travel & Places" },
  { key: "Objects", label: "Objects" },
  { key: "Symbols", label: "Symbols" },
  { key: "Flags", label: "Flags" },
];

// Convert the emoji data to a format compatible with our picker
const EMOJI_LIST = Object.entries(allEmojisData).map(([emoji, data]: [string, any]) => ({
  unified: emoji,
  native: emoji,
  category: data.group,
  name: data.name,
  slug: data.slug,
  group: data.group,
  emoji_version: data.emoji_version,
  unicode_version: data.unicode_version,
  skin_tone_support: data.skin_tone_support,
}));

export function getEmojiByCategory(category: string, search: string) {
  return EMOJI_LIST.filter(
    (e) =>
      e.category === category &&
      (!search ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.native.includes(search) ||
        e.slug.toLowerCase().includes(search.toLowerCase()))
  );
} 