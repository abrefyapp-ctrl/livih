import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, signOut } = useAuth();
  const [orgStatus, setOrgStatus] = useState<string | null>(null);
  const [checkingOrg, setCheckingOrg] = useState(true);

  useEffect(() => {
    if (!user) {
      setCheckingOrg(false);
      return;
    }

    supabase
      .from("agents")
      .select("organization_id, organizations(status)")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        const status = (data?.organizations as any)?.status || null;
        setOrgStatus(status);
        setCheckingOrg(false);
      });
  }, [user]);

  if (loading || checkingOrg) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Conta pendente de aprovação
  if (orgStatus === "pending") {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm space-y-4">
          <div className="text-5xl">⏳</div>
          <h2 className="text-xl font-semibold">Conta aguardando aprovação</h2>
          <p className="text-muted-foreground text-sm">
            Seu cadastro foi recebido e está sendo analisado pela equipe Abrefy.
            Você receberá um e-mail quando sua conta for ativada.
          </p>
          <button
            onClick={() => signOut()}
            className="text-sm text-primary underline"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  // Conta inativa ou bloqueada
  if (orgStatus && orgStatus !== "active") {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm space-y-4">
          <div className="text-5xl">🚫</div>
          <h2 className="text-xl font-semibold">Conta inativa</h2>
          <p className="text-muted-foreground text-sm">
            Sua conta está inativa. Entre em contato pelo e-mail suporte@abrefy.com.br
          </p>
          <button
            onClick={() => signOut()}
            className="text-sm text-primary underline"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
