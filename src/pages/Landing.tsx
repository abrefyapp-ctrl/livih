import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import logoAbrefy from "@/assets/logo-abrefy.png";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  MessageSquare,
  Inbox,
  Clock,
  Users,
  BarChart3,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TimerOff,
  History,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const Header = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-md border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img
            src={logoAbrefy}
            alt="Abrefy"
            className="h-14 w-auto"
            loading="eager"
            decoding="async"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {[
            { href: "#recursos", label: "Recursos" },
            { href: "#beneficios", label: "Benefícios" },
            { href: "#faq", label: "FAQ" },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm">
              Entrar
            </Button>
          </Link>
          <Link to="/register">
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Testar grátis
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
};

const Hero = () => (
  <section className="relative overflow-hidden bg-background text-foreground pt-32 pb-24">
    {/* Gradiente de fundo claro */}
    <div className="absolute inset-0 -z-0">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, hsl(var(--primary) / 0.18), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 80% 80%, hsl(var(--primary) / 0.10), transparent 70%)",
        }}
      />
      {/* grid sutil */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>

    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
      <Badge
        variant="outline"
        className="mb-6 border-border text-muted-foreground bg-card/60 backdrop-blur"
      >
        <Sparkles className="h-3 w-3 mr-1.5" />
        Centralize WhatsApp, e-mail e mais em um só lugar
      </Badge>

      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight max-w-4xl mx-auto">
        Organize seus chamados sem caos,
        <span className="block bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
          planilhas ou WhatsApp perdido
        </span>
      </h1>

      <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        Sistema completo para gerenciar atendimento, equipe e clientes em um só lugar.
        Sem fricção. Sem retrabalho.
      </p>

      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to="/register">
          <Button
            size="lg"
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 px-8 text-base"
          >
            Testar grátis
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
        <a href="#recursos">
          <Button
            size="lg"
            variant="outline"
            className="h-12 px-8 text-base"
          >
            Ver como funciona
          </Button>
        </a>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Sem cartão de crédito · Configure em minutos
      </p>

      {/* Mockup do dashboard */}
      <div className="mt-16 relative max-w-5xl mx-auto">
        <div
          className="absolute -inset-4 rounded-3xl blur-3xl opacity-30"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--primary)), transparent)",
          }}
        />
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl p-2 shadow-2xl">
          <div className="rounded-xl bg-[hsl(222_30%_9%)] overflow-hidden">
            {/* fake browser bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
              </div>
              <div className="flex-1 text-center">
                <div className="inline-block text-[10px] text-white/40 px-3 py-0.5 rounded bg-white/5">
                  abrefy.com.br/dashboard
                </div>
              </div>
            </div>

            {/* fake kanban */}
            <div className="grid grid-cols-3 gap-3 p-4 text-left">
              {[
                { title: "Aberto", color: "bg-slate-500/30", count: 4 },
                { title: "Em atendimento", color: "bg-primary/30", count: 7 },
                { title: "Resolvido", color: "bg-green-500/30", count: 12 },
              ].map((col) => (
                <div key={col.title} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-medium text-white/70">
                      {col.title}
                    </span>
                    <span className={`text-[10px] px-1.5 rounded ${col.color} text-white/80`}>
                      {col.count}
                    </span>
                  </div>
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="rounded-lg bg-white/[0.03] border border-white/5 p-2.5 space-y-1.5"
                    >
                      <div className="h-2 rounded bg-white/10 w-3/4" />
                      <div className="h-1.5 rounded bg-white/5 w-full" />
                      <div className="h-1.5 rounded bg-white/5 w-2/3" />
                      <div className="flex items-center justify-between pt-1">
                        <div className="h-1.5 rounded bg-primary/40 w-10" />
                        <div className="h-3 w-3 rounded-full bg-white/10" />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Pains = () => {
  const pains = [
    {
      icon: MessageSquare,
      title: "Chamados perdidos no WhatsApp",
      desc: "Mensagens importantes somem no meio de mil conversas paralelas.",
    },
    {
      icon: XCircle,
      title: "Falta de controle do atendimento",
      desc: "Sem saber quem está respondendo o quê, prazos passam batido.",
    },
    {
      icon: AlertTriangle,
      title: "Clientes cobrando resposta",
      desc: "Você descobre o problema só quando ele já virou reclamação.",
    },
    {
      icon: TimerOff,
      title: "Equipe desorganizada",
      desc: "Sem fila clara, alguém sempre fica sobrecarregado e outro ocioso.",
    },
  ];

  return (
    <section className="py-24 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Badge variant="secondary" className="mb-4">O problema</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Reconhece esses problemas?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Se mais de um te pegou, está na hora de mudar.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {pains.map((p) => (
            <div
              key={p.title}
              className="group p-6 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center mb-4">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{p.title}</h3>
              <p className="text-sm text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Features = () => {
  const features = [
    {
      icon: Inbox,
      title: "Abertura de chamados",
      desc: "Crie tickets em segundos a partir do WhatsApp, e-mail ou direto no sistema.",
    },
    {
      icon: BarChart3,
      title: "Gestão visual em Kanban",
      desc: "Veja o status de cada atendimento de relance e arraste para mudar de fase.",
    },
    {
      icon: History,
      title: "Histórico completo",
      desc: "Toda conversa e cada ação registradas — nada se perde, tudo é auditável.",
    },
    {
      icon: Clock,
      title: "SLA e prioridades",
      desc: "Defina prazos por categoria e seja avisado antes de qualquer atraso.",
    },
    {
      icon: Users,
      title: "Painel de controle",
      desc: "Métricas em tempo real do seu time: volume, tempo de resposta e produtividade.",
    },
    {
      icon: Zap,
      title: "Integração com WhatsApp",
      desc: "Atenda mensagens dos clientes direto do sistema, sem trocar de aba.",
    },
  ];

  return (
    <section id="recursos" className="py-24 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="secondary" className="mb-4">Recursos</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Tudo que você precisa para atender melhor
          </h2>
          <p className="mt-4 text-muted-foreground">
            Pensado para times que cresceram além das planilhas e do WhatsApp.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-xl border border-border bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Benefits = () => {
  const items = [
    "Mais organização no dia a dia da equipe",
    "Redução drástica de retrabalho",
    "Atendimento mais rápido e previsível",
    "Clientes mais satisfeitos e fiéis",
    "Operação que escala sem virar bagunça",
  ];

  return (
    <section id="beneficios" className="py-24 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <div>
          <Badge variant="secondary" className="mb-4">Resultado</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Menos caos.
            <br />
            Mais clientes felizes.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            O Abrefy tira a operação de atendimento da reatividade e coloca seu time no controle.
          </p>

          <ul className="mt-8 space-y-3">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-foreground">{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <Link to="/register">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Quero testar grátis
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Card visual lateral */}
        <div className="relative">
          <div
            className="absolute -inset-4 rounded-3xl blur-2xl opacity-20"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)), transparent)",
            }}
          />
          <div className="relative rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
            {[
              { label: "Tempo médio de resposta", value: "-62%", color: "text-green-600" },
              { label: "Chamados resolvidos no SLA", value: "94%", color: "text-primary" },
              { label: "Tickets perdidos", value: "0", color: "text-foreground" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border"
              >
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
              </div>
            ))}
            <div className="pt-2 text-xs text-muted-foreground text-center">
              Indicadores típicos após 30 dias de uso
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const FAQ = () => {
  const faqs = [
    {
      q: "Precisa instalar alguma coisa?",
      a: "Não. O Abrefy roda no navegador. Basta criar sua conta e acessar de qualquer lugar.",
    },
    {
      q: "Tem suporte se eu precisar de ajuda?",
      a: "Sim. Nosso time responde por e-mail e WhatsApp em horário comercial, e a base de ajuda está sempre disponível.",
    },
    {
      q: "Funciona no celular?",
      a: "Funciona. A interface é responsiva e seus atendentes podem responder chamados pelo celular sem perder nenhuma funcionalidade.",
    },
    {
      q: "Integra com WhatsApp?",
      a: "Sim. Você conecta seu número e passa a centralizar todas as conversas dentro do Abrefy, com histórico e atribuição por agente.",
    },
    {
      q: "Tem período de teste grátis?",
      a: "Tem. Você pode usar o sistema gratuitamente para validar com seu time antes de qualquer cobrança.",
    },
  ];

  return (
    <section id="faq" className="py-24 bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">FAQ</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Perguntas frequentes
          </h2>
        </div>

        <Accordion type="single" collapsible className="space-y-2">
          {faqs.map((f, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="border border-border rounded-xl bg-card px-5 data-[state=open]:shadow-sm"
            >
              <AccordionTrigger className="text-left font-medium hover:no-underline py-5">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-5">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

const FinalCTA = () => (
  <section className="relative overflow-hidden bg-sidebar text-white py-24">
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, hsl(var(--primary) / 0.4), transparent 70%)",
        }}
      />
    </div>
    <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
      <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">
        Pronto pra parar de perder chamados?
      </h2>
      <p className="mt-5 text-lg text-white/70">
        Configure sua conta em minutos e atenda melhor já hoje.
      </p>
      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to="/register">
          <Button
            size="lg"
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 px-8 text-base"
          >
            Começar agora
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
        <Link to="/login">
          <Button
            size="lg"
            variant="outline"
            className="h-12 px-8 text-base border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white backdrop-blur"
          >
            Já tenho conta
          </Button>
        </Link>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="border-t border-border bg-background py-10">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span className="font-bold text-foreground">Abrefy</span>
        <span className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Todos os direitos reservados
        </span>
      </div>
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <a href="#recursos" className="hover:text-foreground">Recursos</a>
        <a href="#faq" className="hover:text-foreground">FAQ</a>
        <Link to="/login" className="hover:text-foreground">Entrar</Link>
      </div>
    </div>
  </footer>
);

const Landing = () => {
  const faqs = [
    { q: "Precisa instalar alguma coisa?", a: "Não. O Abrefy roda no navegador. Basta criar sua conta e acessar de qualquer lugar." },
    { q: "Tem suporte se eu precisar de ajuda?", a: "Sim. Nosso time responde por e-mail e WhatsApp em horário comercial." },
    { q: "Funciona no celular?", a: "Funciona. A interface é responsiva e seus atendentes podem responder pelo celular." },
    { q: "Integra com WhatsApp?", a: "Sim. Você conecta seu número e centraliza todas as conversas dentro do Abrefy." },
    { q: "Tem período de teste grátis?", a: "Tem. Você pode usar gratuitamente para validar com seu time antes de qualquer cobrança." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Abrefy — Atendimento omnichannel via WhatsApp</title>
        <meta name="description" content="Plataforma SaaS para organizar chamados, equipe e clientes em um só lugar. Centralize WhatsApp, e-mail e mais sem perder nada." />
        <link rel="canonical" href="https://abrefy.com.br/" />
        <meta property="og:title" content="Abrefy — Atendimento omnichannel via WhatsApp" />
        <meta property="og:description" content="Centralize chamados, equipe e clientes em um só lugar. Sem caos, sem WhatsApp perdido." />
        <meta property="og:url" content="https://abrefy.com.br/" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Abrefy",
          url: "https://abrefy.com.br/",
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Abrefy",
          url: "https://abrefy.com.br/",
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        })}</script>
      </Helmet>
      <Header />
      <main>
        <Hero />
        <Pains />
        <Features />
        <Benefits />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Landing;
