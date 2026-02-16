import { useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Github, ArrowLeft } from "lucide-react";
import { useAuthStore } from "../stores/auth-store";

export function LoginPage() {
  const { user, loading, fetchUser } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg">
      {/* Background glow */}
      <div className="glow-orb glow-orb-brand absolute left-1/2 top-1/3 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2" />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="card p-8 text-center">
          {/* Back link */}
          <Link to="/" className="inline-flex items-center gap-2 text-neutral-fg3 hover:text-neutral-fg2 transition-colors text-[13px] mb-6">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao inicio
          </Link>

          {/* Logo */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-purple shadow-brand">
            <span className="text-2xl font-bold text-white">A</span>
          </div>
          <h1 className="text-[22px] font-semibold text-neutral-fg1">Entrar no AgentHub</h1>
          <p className="mt-2 text-[14px] text-neutral-fg3">
            Conecte sua conta GitHub para continuar
          </p>

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-lg bg-danger-light px-4 py-3 text-[13px] text-danger">
              {error === "missing_code" && "Codigo de autorizacao ausente."}
              {error === "auth_failed" && "Falha na autenticacao. Tente novamente."}
              {!["missing_code", "auth_failed"].includes(error) && "Erro desconhecido."}
            </div>
          )}

          {/* GitHub Login Button */}
          <a
            href="/api/auth/github"
            className="btn-primary mt-6 flex w-full items-center justify-center gap-3 px-6 py-3 text-[14px] font-medium"
          >
            <Github className="h-5 w-5" />
            Entrar com GitHub
          </a>

          <p className="mt-6 text-[12px] text-neutral-fg-disabled">
            Ao entrar, voce concorda com nossos termos de uso.
          </p>
        </div>
      </div>
    </div>
  );
}
