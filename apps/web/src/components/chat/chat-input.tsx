import { useState, useRef } from "react";
import { Send } from "lucide-react";
import type { Agent } from "@agenthub/shared";

interface ChatInputProps {
  onSend: (content: string, agentId?: string) => void;
  agents: Agent[];
}

export function ChatInput({ onSend, agents }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (!message.trim()) return;
    onSend(message.trim(), selectedAgent || undefined);
    setMessage("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const activeAgents = agents.filter((a) => a.isActive);

  return (
    <div className="border-t border-edge-light p-4">
      {/* Agent selector */}
      <div className="mb-2">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="w-full rounded-lg border border-edge bg-white px-3 py-2 text-[12px] text-text-secondary outline-none transition-colors focus:border-primary"
        >
          <option value="">Tech Lead (padrão)</option>
          {activeAgents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      {/* Message input */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua mensagem..."
          className="max-h-[120px] flex-1 resize-none rounded-xl border border-edge bg-white px-3 py-2.5 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-placeholder focus:border-primary focus:ring-2 focus:ring-primary-muted"
          rows={1}
        />
        <button
          onClick={handleSubmit}
          disabled={!message.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-all duration-200 hover:bg-primary-hover hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
