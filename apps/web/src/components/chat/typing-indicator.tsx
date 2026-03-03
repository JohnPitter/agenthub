export function TypingIndicator({ agentName }: { agentName: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex gap-1">
        <span
          className="h-2 w-2 rounded-full bg-neutral-fg3 animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-neutral-fg3 animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-neutral-fg3 animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="text-[11px] text-neutral-fg3">
        {agentName} está digitando...
      </span>
    </div>
  );
}
