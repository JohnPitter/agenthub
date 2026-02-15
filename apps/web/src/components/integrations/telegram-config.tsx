import { useState, useEffect, useCallback } from "react";
import { Bot, Wifi, WifiOff, Loader2, Eye, EyeOff, RefreshCw, ExternalLink } from "lucide-react";
import { api } from "../../lib/utils";
import { getSocket } from "../../lib/socket";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace-store";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface IntegrationStatusEvent {
  type: "whatsapp" | "telegram";
  status: ConnectionStatus;
}

export function TelegramConfig() {
  const { activeProjectId } = useWorkspaceStore();
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current status
  const fetchStatus = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const data = await api<{ status: ConnectionStatus; integrationId: string | null }>(
        `/integrations/telegram/status?projectId=${activeProjectId}`
      );
      setStatus(data.status);
      setIntegrationId(data.integrationId);
    } catch {
      // Integration might not exist yet
    }
  }, [activeProjectId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Listen for real-time status updates
  useEffect(() => {
    const socket = getSocket();

    const handleStatus = (data: IntegrationStatusEvent) => {
      if (data.type !== "telegram") return;
      setStatus(data.status);
      if (data.status === "connected") {
        setLoading(false);
      }
      if (data.status === "error") {
        setLoading(false);
        setError("Falha na conexão. Verifique o token.");
      }
    };

    socket.on("integration:status" as any, handleStatus);
    return () => {
      socket.off("integration:status" as any, handleStatus);
    };
  }, []);

  const handleConnect = async () => {
    if (!activeProjectId) {
      setError("Selecione um projeto primeiro");
      return;
    }
    if (!botToken.trim()) {
      setError("Token do bot é obrigatório");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await api<{ success: boolean; status: ConnectionStatus; integrationId: string }>(
        "/integrations/telegram/connect",
        {
          method: "POST",
          body: JSON.stringify({
            projectId: activeProjectId,
            botToken: botToken.trim(),
          }),
        }
      );
      setStatus(data.status);
      setIntegrationId(data.integrationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao conectar");
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!activeProjectId) return;

    setLoading(true);
    setError(null);

    try {
      await api("/integrations/telegram/disconnect", {
        method: "POST",
        body: JSON.stringify({ projectId: activeProjectId }),
      });
      setStatus("disconnected");
      setIntegrationId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao desconectar");
    } finally {
      setLoading(false);
    }
  };

  const statusConfig: Record<ConnectionStatus, { label: string; color: string; icon: typeof Wifi }> = {
    disconnected: { label: "Desconectado", color: "text-neutral-fg3", icon: WifiOff },
    connecting: { label: "Conectando...", color: "text-warning", icon: Loader2 },
    connected: { label: "Conectado", color: "text-success", icon: Wifi },
    error: { label: "Erro", color: "text-danger", icon: WifiOff },
  };

  const currentStatus = statusConfig[status];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="rounded-xl border border-stroke bg-neutral-bg2 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-light">
            <Bot className="h-5 w-5 text-info" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-neutral-fg1">Telegram</h3>
            <p className="text-[12px] text-neutral-fg3">Conecte um bot do Telegram</p>
          </div>
        </div>

        <div className={cn("flex items-center gap-2 text-[12px] font-medium", currentStatus.color)}>
          <StatusIcon className={cn("h-4 w-4", status === "connecting" && "animate-spin")} />
          {currentStatus.label}
        </div>
      </div>

      {/* Token input (only when disconnected) */}
      {(status === "disconnected" || status === "error") && (
        <div className="mb-6">
          <label className="block text-[12px] font-medium text-neutral-fg2 mb-2">
            Bot Token
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showToken ? "text" : "password"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyz"
                className="input-fluent w-full pr-10"
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-fg3 hover:text-neutral-fg1 transition-colors"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-neutral-fg3">
            Crie um bot com o{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-info hover:underline inline-flex items-center gap-0.5"
            >
              @BotFather
              <ExternalLink className="h-3 w-3" />
            </a>
            {" "}e cole o token aqui
          </p>
        </div>
      )}

      {/* Connected state */}
      {status === "connected" && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-success/20 bg-success-light p-4">
          <Bot className="h-5 w-5 text-success" />
          <div>
            <p className="text-[13px] font-medium text-success">Bot Telegram ativo</p>
            <p className="text-[11px] text-neutral-fg3">Mensagens estão sendo recebidas pelo Tech Lead</p>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg border border-danger/20 bg-danger-light p-3">
          <p className="text-[12px] text-danger">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {status === "disconnected" || status === "error" ? (
          <button
            onClick={handleConnect}
            disabled={loading || !activeProjectId || !botToken.trim()}
            className="btn-primary flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
            Conectar Bot
          </button>
        ) : status === "connecting" ? (
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-2 rounded-lg border border-stroke bg-neutral-bg1 px-5 py-2.5 text-[13px] font-medium text-neutral-fg2 hover:bg-neutral-bg-hover transition-colors"
          >
            Cancelar
          </button>
        ) : (
          <>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-light px-5 py-2.5 text-[13px] font-medium text-danger hover:bg-danger/20 transition-colors"
            >
              <WifiOff className="h-4 w-4" />
              Desconectar
            </button>
            <button
              onClick={fetchStatus}
              className="flex items-center gap-2 rounded-lg border border-stroke bg-neutral-bg1 px-4 py-2.5 text-[13px] font-medium text-neutral-fg2 hover:bg-neutral-bg-hover transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
