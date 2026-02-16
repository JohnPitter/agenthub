const DICEBEAR_BASE = "https://api.dicebear.com/9.x";

/**
 * Pre-defined avatar options grouped by category.
 * Each entry is a `style:seed` string stored in agent.avatar.
 */
export const AVATAR_PRESETS: { category: string; avatars: { label: string; value: string }[] }[] = [
  {
    category: "Star Wars",
    avatars: [
      { label: "Darth Vader", value: "bottts:darth-vader" },
      { label: "Yoda", value: "bottts:yoda-master" },
      { label: "R2-D2", value: "bottts:r2d2-droid" },
      { label: "Boba Fett", value: "bottts:boba-fett" },
      { label: "Chewbacca", value: "bottts:chewbacca" },
      { label: "Stormtrooper", value: "bottts:stormtrooper" },
      { label: "Mandalorian", value: "bottts:mandalorian" },
      { label: "Kylo Ren", value: "bottts:kylo-ren" },
    ],
  },
  {
    category: "Vingadores",
    avatars: [
      { label: "Iron Man", value: "pixel-art:tony-stark-ironman" },
      { label: "Thor", value: "pixel-art:thor-odinson" },
      { label: "Hulk", value: "pixel-art:bruce-banner-hulk" },
      { label: "Capitão", value: "pixel-art:captain-america" },
      { label: "Black Widow", value: "pixel-art:natasha-romanoff" },
      { label: "Hawkeye", value: "pixel-art:clint-barton-hawk" },
      { label: "Spider-Man", value: "pixel-art:peter-parker-spider" },
      { label: "Dr. Strange", value: "pixel-art:doctor-strange" },
    ],
  },
  {
    category: "Robôs",
    avatars: [
      { label: "Atlas", value: "bottts:atlas-robot" },
      { label: "Nova", value: "bottts:nova-ai" },
      { label: "Spark", value: "bottts:spark-bot" },
      { label: "Cipher", value: "bottts:cipher-unit" },
      { label: "Nexus", value: "bottts:nexus-core" },
      { label: "Bolt", value: "bottts:bolt-runner" },
      { label: "Helix", value: "bottts:helix-drone" },
      { label: "Pulse", value: "bottts:pulse-ai" },
    ],
  },
  {
    category: "Aventureiros",
    avatars: [
      { label: "Gandalf", value: "adventurer:gandalf-wizard" },
      { label: "Aragorn", value: "adventurer:aragorn-ranger" },
      { label: "Legolas", value: "adventurer:legolas-elf" },
      { label: "Merlin", value: "adventurer:merlin-mage" },
      { label: "Robin Hood", value: "adventurer:robin-hood" },
      { label: "Ninja", value: "adventurer:shadow-ninja" },
      { label: "Viking", value: "adventurer:ragnar-viking" },
      { label: "Samurai", value: "adventurer:hiro-samurai" },
    ],
  },
  {
    category: "Fun",
    avatars: [
      { label: "Agent X", value: "fun-emoji:agent-x-spy" },
      { label: "Pirata", value: "fun-emoji:captain-pirate" },
      { label: "Astronauta", value: "fun-emoji:space-explorer" },
      { label: "Hacker", value: "fun-emoji:neo-hacker" },
      { label: "Chef", value: "fun-emoji:master-chef" },
      { label: "Scientist", value: "fun-emoji:mad-scientist" },
      { label: "DJ", value: "fun-emoji:dj-beats" },
      { label: "Piloto", value: "fun-emoji:ace-pilot" },
    ],
  },
];

/**
 * Parse an avatar string ("style:seed") into a DiceBear URL.
 * Falls back to null if the avatar doesn't match the pattern.
 */
export function getAgentAvatarUrl(avatar: string | null | undefined, size = 64): string | null {
  if (!avatar || !avatar.includes(":")) return null;
  const [style, seed] = avatar.split(":", 2);
  return `${DICEBEAR_BASE}/${style}/svg?seed=${encodeURIComponent(seed)}&size=${size}`;
}
