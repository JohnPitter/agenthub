import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../stores/auth-store";

export function ProtectedRoute() {
  const { user, loading, fetchUser } = useAuthStore();

  useEffect(() => {
    if (!user && loading) {
      fetchUser();
    }
  }, [user, loading, fetchUser]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-app-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-[13px] text-neutral-fg3">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
