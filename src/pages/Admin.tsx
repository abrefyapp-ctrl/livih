import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, CheckCircle, XCircle, Clock } from "lucide-react";
import { FUNCTIONS_URL } from "@/lib/env";

interface Organization {
  id: string;
  name: string;
  email: string;
  phone: string;
  cnpj: string;
  plan: string;
  status: string;
  created_at: string;
  approved_at: string | null;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  active: { label: "Ativo", color: "bg-green-100 text-green-800 border-green-200" },
  inactive: { label: "Inativo", color: "bg-gray-100 text-gray-800 border-gray-200" },
  blocked: { label: "Bloqueado", color: "bg-red-100 text-red-800 border-red-200" },
};

const Admin = () => {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAbrefy, setIsAbrefy] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    if (!user) return;

    supabase
      .from("agents")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        const isAdmin =
          data?.organization_id === "00000000-0000-0000-0000-000000000001" &&
          data?.role === "admin";
        setIsAbrefy(isAdmin);
        setCheckingAccess(false);
        if (isAdmin) fetchOrganizations();
      });
  }, [user]);

  const fetchOrganizations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .neq("id", "00000000-0000-0000-0000-000000000001")
      .order("created_at", { ascending: false });
    setOrganizations((data as Organization[]) || []);
    setLoading(false);
  };

  const sendWelcomeEmail = async (orgEmail: string, orgName: string) => {
    try {
      console.log("[admin] Iniciando envio de e-mail para:", orgEmail);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      console.log("[admin] Token:", token ? "OK" : "NULL");

      const res = await fetch(
        `${FUNCTIONS_URL}/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            to: orgEmail,
            subject: "Sua conta foi aprovada — Abrefy",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1a1a1a;">Bem-vindo à Abrefy, ${orgName}!</h2>
                <p style="color: #444;">Sua conta foi aprovada e já está ativa. Você pode fazer login agora.</p>
                <a href="https://preview--speedy-sql.lovable.app" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
                  Acessar o sistema
                </a>
                <p style="color: #888; font-size: 12px; margin-top: 32px;">
                  Em caso de dúvidas, entre em contato pelo e-mail suporte@abrefy.com.br
                </p>
              </div>
            `,
          }),
        }
      );

      const json = await res.json();
      console.log("[admin] send-email resposta:", JSON.stringify(json));
    } catch (err: any) {
      console.error("[admin] Erro ao enviar e-mail:", err.message);
    }
  };

  const updateStatus = async (
    orgId: string,
    status: string,
    orgEmail?: string,
    orgName?: string
  ) => {
    const { error } = await supabase
      .from("organizations")
      .update({
        status,
        approved_at: status === "active" ? new Date().toISOString() : null,
        approved_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgId);

    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }

    if (status === "active" && orgEmail && orgName) {
      await sendWelcomeEmail(orgEmail, orgName);
    }

    toast({ title: status === "active" ? "Empresa aprovada!" : "Empresa atualizada" });
    fetchOrganizations();
  };

  if (checkingAccess) return null;
  if (!isAbrefy) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Painel Admin — Abrefy</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie as empresas cadastradas no sistema
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {["pending", "active", "inactive"].map((s) => (
            <Card key={s}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{statusConfig[s].label}</p>
                    <p className="text-2xl font-bold">
                      {organizations.filter((o) => o.status === s).length}
                    </p>
                  </div>
                  {s === "pending" && <Clock className="h-8 w-8 text-yellow-500 opacity-50" />}
                  {s === "active" && <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />}
                  {s === "inactive" && <XCircle className="h-8 w-8 text-gray-400 opacity-50" />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Empresas cadastradas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : organizations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada ainda.</p>
            ) : (
              organizations.map((org) => (
                <div
                  key={org.id}
                  className="flex items-start justify-between border border-border rounded-lg p-4 gap-4"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{org.name}</p>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                          statusConfig[org.status]?.color
                        }`}
                      >
                        {statusConfig[org.status]?.label || org.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{org.email}</p>
                    <p className="text-xs text-muted-foreground">
                      CNPJ: {org.cnpj} | Tel: {org.phone}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cadastro:{" "}
                      {format(new Date(org.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                    {org.approved_at && (
                      <p className="text-xs text-green-600">
                        Aprovado em:{" "}
                        {format(new Date(org.approved_at), "dd/MM/yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    {org.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() => updateStatus(org.id, "active", org.email, org.name)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        Aprovar
                      </Button>
                    )}
                    {org.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(org.id, "inactive")}
                      >
                        Desativar
                      </Button>
                    )}
                    {(org.status === "inactive" || org.status === "blocked") && (
                      <Button
                        size="sm"
                        onClick={() => updateStatus(org.id, "active", org.email, org.name)}
                      >
                        Reativar
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;
