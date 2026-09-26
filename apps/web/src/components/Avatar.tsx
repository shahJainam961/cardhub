const FACES = [
  "😀",
  "😎",
  "🤩",
  "🥳",
  "😺",
  "🐶",
  "🦊",
  "🐼",
  "🐸",
  "🦄",
  "🐯",
  "🐙",
  "🐵",
  "🐨",
  "🦁",
  "🐧",
];
const COLORS = [
  "#7b5cff",
  "#ff5fa2",
  "#ffd23f",
  "#2ed3a0",
  "#4cc3ff",
  "#ff8a3d",
  "#ff4d5e",
  "#b35cf0",
];

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

const SIZES = { sm: "size-8 text-base", md: "size-11 text-2xl", lg: "size-16 text-4xl" } as const;

/** A fun, stable avatar picked from the player's name; bots are robots. */
export function Avatar({
  name,
  isBot = false,
  size = "md",
  active = false,
}: {
  name: string;
  isBot?: boolean;
  size?: keyof typeof SIZES;
  /** Their turn: a pulsing ring. */
  active?: boolean;
}) {
  const h = hash(name);
  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full ring-4 ring-white ${SIZES[size]} ${
        active ? "animate-pulse ring-sunny" : ""
      }`}
      style={{ background: COLORS[h % COLORS.length] }}
    >
      {isBot ? "🤖" : FACES[h % FACES.length]}
    </span>
  );
}
