import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Helmet } from "react-helmet-async";

const Register = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    cnpj: "",
    phone: "",
    email: "",
    password: "",
    confirm_password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const formatCNPJ = (value: string) => {
    return value
      .replace(/\D/g, "")
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2")
      .slice(0, 18);
  };

  const formatPhone = (value: string) => {
    return value
      .replace(/\D/g, "")
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2")
      .slice(0, 15);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.password !== form.confirm_password) {
      toast({ title: "Senhas não conferem", variant: "destructive" });
      return;
    }

    if (form.password.length < 6) {
      toast({ title: "Senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      // 1. Cria usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Erro ao criar usuário");

      // 2. Cria organização com status pending
      const slug = form.company_name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: form.company_name,
          slug: `${slug}-${Date.now()}`,
          email: form.email,
          phone: form.phone.replace(/\D/g, ""),
          cnpj: form.cnpj.replace(/\D/g, ""),
          status: "pending",
          plan: "free",
        })
        .select("id")
        .single();

      if (orgError) throw orgError;

      // 3. Cria agente admin vinculado ao auth.user e organização
      const { error: agentError } = await supabase
        .from("agents")
        .insert({
          name: form.company_name,
          email: form.email,
          user_id: authData.user.id,
          organization_id: org.id,
          role: "admin",
        });

      if (agentError) throw agentError;

      // 4. Faz logout (não pode usar até ser aprovado)
      await supabase.auth.signOut();

      toast({
        title: "Cadastro realizado! ✅",
        description: "Aguarde a aprovação da Abrefy. Você receberá um e-mail quando sua conta for ativada.",
      });

      setTimeout(() => navigate("/"), 3000);

    } catch (error: any) {
      toast({
        title: "Erro no cadastro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Helmet>
        <title>Criar conta — Abrefy</title>
        <meta name="description" content="Solicite acesso ao Abrefy e comece a organizar seu atendimento omnichannel via WhatsApp em minutos." />
        <link rel="canonical" href="https://abrefy.com.br/register" />
        <meta property="og:title" content="Criar conta — Abrefy" />
        <meta property="og:description" content="Solicite acesso ao Abrefy." />
        <meta property="og:url" content="https://abrefy.com.br/register" />
      </Helmet>
      <h1 className="sr-only">Criar conta na Abrefy</h1>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Criar conta</CardTitle>
          <CardDescription>
            Preencha os dados abaixo para solicitar acesso ao sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="company_name">Nome da empresa</Label>
              <Input
                id="company_name"
                name="company_name"
                placeholder="Empresa LTDA"
                value={form.company_name}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                name="cnpj"
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: formatCNPJ(e.target.value) })}
                required
              />
            </div>

            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                name="phone"
                placeholder="(00) 00000-0000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                required
              />
            </div>

            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="contato@empresa.com.br"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <Label htmlFor="confirm_password">Confirmar senha</Label>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                placeholder="Repita a senha"
                value={form.confirm_password}
                onChange={handleChange}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Solicitar acesso
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Já tem conta?{" "}
              <button
                type="button"
                onClick={() => navigate("/")}
                className="text-primary hover:underline"
              >
                Fazer login
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Register;
