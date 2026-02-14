export const STACK_ICONS: Record<string, string> = {
  nextjs: "N",
  react: "R",
  vue: "V",
  svelte: "S",
  angular: "A",
  nodejs: "JS",
  typescript: "TS",
  python: "PY",
  go: "GO",
  rust: "RS",
  java: "JV",
  dotnet: ".N",
  ruby: "RB",
  php: "PHP",
  tailwind: "TW",
  express: "EX",
};

export function getStackIcon(stack: string[]): string {
  const priority = ["nextjs", "react", "vue", "svelte", "angular", "go", "rust", "python", "java", "dotnet"];
  for (const s of priority) {
    if (stack.includes(s)) return STACK_ICONS[s] ?? s.toUpperCase().slice(0, 2);
  }
  return stack[0] ? STACK_ICONS[stack[0]] ?? stack[0].toUpperCase().slice(0, 2) : "??";
}
