import { useState, useEffect, useCallback } from "react";
import { Smartphone, Wifi, WifiOff, Loader2, QrCode, RefreshCw } from "lucide-react";
import { api } from "../../lib/utils";
import { getSocket } from "../../lib/socket";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace-store";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface IntegrationStatusEvent {
  type: "whatsapp" | "telegram";
  status: ConnectionStatus;
  qr?: string;
}

export function WhatsAppConfig() {
  const { activeProjectId } = useWorkspaceStore();
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current status
  const fetchStatus = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const data = await api<{ status: ConnectionStatus; integrationId: string | null }>(
        `/integrations/whatsapp/status?projectId=${activeProjectId}`
      );
      setStatus(data.status);
      setIntegrationId(data.integrationId);
      // If DB shows error from a previous failed attempt, show error message
      if (data.status === "error") {
        setError("Conexão anterior falhou. Clique em Conectar para tentar novamente.");
      }
      // Reset loading if status is terminal
      if (data.status !== "connecting") {
        setLoading(false);
      }
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
      if (data.type !== "whatsapp") return;
      setStatus(data.status);
      if (data.qr) {
        setQrCode(data.qr);
      }
      if (data.status === "connected") {
        setQrCode(null);
        setLoading(false);
      }
      if (data.status === "error") {
        setLoading(false);
        setError("Falha na conexão. Tente novamente.");
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

    setLoading(true);
    setError(null);
    setQrCode(null);

    try {
      const data = await api<{ success: boolean; status: ConnectionStatus; integrationId: string }>(
        "/integrations/whatsapp/connect",
        {
          method: "POST",
          body: JSON.stringify({ projectId: activeProjectId }),
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
      await api("/integrations/whatsapp/disconnect", {
        method: "POST",
        body: JSON.stringify({ projectId: activeProjectId }),
      });
      setStatus("disconnected");
      setQrCode(null);
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light">
            <Smartphone className="h-5 w-5 text-success" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-neutral-fg1">WhatsApp</h3>
            <p className="text-[12px] text-neutral-fg3">Comunique-se via WhatsApp Web</p>
          </div>
        </div>

        <div className={cn("flex items-center gap-2 text-[12px] font-medium", currentStatus.color)}>
          <StatusIcon className={cn("h-4 w-4", status === "connecting" && "animate-spin")} />
          {currentStatus.label}
        </div>
      </div>

      {/* QR Code area */}
      {status === "connecting" && qrCode && (
        <div className="mb-6 flex flex-col items-center gap-4 rounded-lg border border-stroke bg-neutral-bg1 p-6">
          <div className="flex items-center gap-2 text-[13px] text-neutral-fg2">
            <QrCode className="h-4 w-4" />
            Escaneie o QR code com seu WhatsApp
          </div>
          <div className="rounded-lg bg-white p-4">
            <img
              src={qrCode}
              alt="WhatsApp QR Code"
              className="h-[200px] w-[200px]"
            />
          </div>
          <p className="text-[11px] text-neutral-fg3 text-center max-w-[280px]">
            Abra o WhatsApp no celular, vá em Dispositivos Conectados e escaneie este QR code
          </p>
        </div>
      )}

      {/* Connected state */}
      {status === "connected" && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-success/20 bg-success-light p-4">
          <Wifi className="h-5 w-5 text-success" />
          <div>
            <p className="text-[13px] font-medium text-success">WhatsApp conectado</p>
            <p className="text-[11px] text-neutral-fg3">Mensagens estão sendo recebidas pelo Team Lead</p>
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
            disabled={loading || !activeProjectId}
            className="btn-primary flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Smartphone className="h-4 w-4" />
            )}
            Conectar WhatsApp
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
