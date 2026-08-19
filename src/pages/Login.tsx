import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import { Helmet } from "react-helmet-async";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { signIn, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    const { error } = await signIn(email, password);
    if (error) setMessage("Email ou senha inválidos");

    setLoading(false);
  };

  const handleResetPassword = async () => {
    setMessage("");
    if (!email) {
      setMessage("Digite seu email primeiro");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Email de recuperação enviado!");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Helmet>
        <title>Entrar — Abrefy</title>
        <meta name="description" content="Acesse sua conta Abrefy para gerenciar chamados, equipe e clientes em um só lugar." />
        <link rel="canonical" href="https://abrefy.com.br/login" />
        <meta property="og:title" content="Entrar — Abrefy" />
        <meta property="og:description" content="Acesse sua conta Abrefy." />
        <meta property="og:url" content="https://abrefy.com.br/login" />
      </Helmet>
      <h1 className="sr-only">Entrar na Abrefy</h1>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <img src="/logo.png" alt="Abrefy" className="h-20 w-auto mx-auto" />
          </div>
          <CardDescription>Entre com suas credenciais</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label>Senha</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {message && <p className="text-sm text-destructive">{message}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Carregando..." : "Entrar"}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm space-y-2">
            <button
              onClick={() => navigate("/register")}
              className="text-primary underline"
            >
              Criar conta
            </button>
            <br />
            <button onClick={handleResetPassword} className="text-muted-foreground underline">
              Esqueci minha senha
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
