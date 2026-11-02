"""Gera a página de planos do site (site/public/planos/index.html) a partir dos preços abaixo.

Os preços seguem docs/planos-modulos.md (núcleo em escada e anual "pague 10 e use 12", 01/11). Mudou o preço lá,
mude aqui e rode na raiz do repo: python site/gerar_planos.py
Cabeçalho, rodapé e chamada no mesmo padrão das páginas de solução (gerar_solucoes.py).
Só o que a Livih cumpre: nada de "mais escolhido" sem cliente no plano.
"""
import json
import os

from gerar_solucoes import BEACON, SITE, WHATSAPP, e, rodape_solucoes

URL = f"{SITE}/planos/"
TITLE = "Planos e preços | Livih, atendimento e vendas pelo WhatsApp"
DESCRIPTION = "Planos da Livih a partir de R$ 49,90 por mês, todos com o agente de IA e usuários ilimitados. No anual, você paga 10 meses e usa 12. Teste 30 dias grátis."

# Anual = 10 mensalidades (decisão de 01/11), arredondado para o valor redondo que aparece na tabela.
PLANOS = [
    {
        "nome": "Essencial", "mensal": 49.90, "anual": 499, "numeros": 1, "atendimentos": 150,
        "para": "Para começar com um número e o agente atendendo.",
        "implantacao": "Implantação feita por você, com o passo a passo da Livih",
        "modulos": False,
    },
    {
        "nome": "Start", "mensal": 99.90, "anual": 999, "numeros": 2, "atendimentos": 350,
        "para": "Para a equipe que atende em mais de um número.",
        "implantacao": "Implantação com a nossa equipe",
        "modulos": True, "destaque": "Recomendado",
    },
    {
        "nome": "Pro", "mensal": 149.90, "anual": 1499, "numeros": 3, "atendimentos": 500,
        "para": "Para quem já tem volume de conversas todo dia.",
        "implantacao": "Implantação com a nossa equipe",
        "modulos": True,
    },
    {
        "nome": "Business", "mensal": 199.90, "anual": 1999, "numeros": 5, "atendimentos": 800,
        "para": "Para equipes de vendas com vários números.",
        "implantacao": "Implantação com a nossa equipe",
        "modulos": True,
    },
]

TODOS_TEM = [
    "Agente de IA que responde, entende áudio, foto e PDF, monta o orçamento e chama a equipe",
    "Caixa de entrada compartilhada, com filas e um responsável por conversa",
    "Contatos, carteira por vendedor e funil de vendas",
    "Produtos e orçamento em PDF com a sua marca",
    "Agenda da equipe",
    "Campanhas pela API oficial do WhatsApp (as mensagens a Meta cobra à parte)",
    "Histórico das conversas que nenhum usuário apaga",
    "Usuários ilimitados",
]

MODULOS = [
    ("ERP", 99, 990, "Pedidos, estoque, entrada de mercadoria pela nota e emissão de NF-e. Com 1 CNPJ e 100 notas por mês."),
    ("Ordens de serviço", 99, 990, "Equipamento para conserto, etapas, PDF da OS e emissão de NFS-e. Com 1 CNPJ e 100 notas por mês."),
    ("ERP e Ordens de serviço juntos", 149, 1490, "Os dois módulos no mesmo CNPJ, com 100 notas por mês."),
]
CNPJ_ADICIONAL = (49, 490)
NOTA_ADICIONAL = 0.20

EXCEDENTE = 0.40
PACOTE = (100, 29.90)


def brl(v: float) -> str:
    """R$ 1.499 ou R$ 49,90: centavos só quando existem, como na tabela de preços."""
    inteiro = int(v)
    centavos = round((v - inteiro) * 100)
    texto = f"{inteiro:,}".replace(",", ".")
    return f"R$ {texto},{centavos:02d}" if centavos else f"R$ {texto}"


def brl_centavos(v: float) -> str:
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


PERGUNTAS = [
    ("O que conta como um atendimento?", "Cada vez que alguém puxa assunto e o agente de IA atende, conta um atendimento. Tudo o que o agente responde nas 24 horas seguintes, naquela conversa, é o mesmo atendimento. As conversas que a sua equipe atende sem o agente não contam."),
    ("O que acontece quando acabam os atendimentos do mês?", f"Você escolhe antes, na tela do plano: parar o agente, e as conversas seguem para a equipe, ou continuar, pagando {brl_centavos(EXCEDENTE)} por atendimento a mais na fatura seguinte. Aos 80 % você recebe um aviso. Também dá para comprar um pacote de {PACOTE[0]} atendimentos por {brl_centavos(PACOTE[1])}."),
    ("Quem faz a implantação?", "No teste e nos planos Start, Pro e Business, a nossa equipe ajuda a conectar os números e configurar o agente. No Essencial, você mesmo faz, com o passo a passo da Livih, e a ajuda da equipe pode ser contratada à parte."),
    ("Posso trocar de plano?", "Sim. Você sobe de plano quando quiser. No plano anual, paga só a diferença dos meses que faltam. Para descer de plano, a mudança vale a partir da renovação."),
    ("Dá para usar sem o agente de IA?", "Sim. Você desliga o agente em cada número e a equipe atende tudo. O preço do plano é o mesmo."),
    ("As mensagens das campanhas estão incluídas?", "Não. As mensagens de divulgação pela API oficial do WhatsApp a Meta cobra direto da sua empresa, pela tabela dela. A Livih não cobra nada a mais por elas."),
    ("Quais são as formas de pagamento?", "No mensal, cartão de crédito, Pix ou boleto. No anual, Pix ou boleto à vista, ou cartão de crédito."),
    ("Como funciona o teste grátis?", "Você usa a Livih por 30 dias, sem pagar e sem cadastrar cartão, com tudo o que tem o plano Start e com o ERP e as Ordens de serviço liberados para testar. No fim do teste, escolhe o plano ou para por ali."),
]


def cartao_plano(p: dict) -> str:
    por_mes = brl_centavos(p["anual"] / 12)
    economia = brl_centavos(p["mensal"] * 12 - p["anual"])
    atendimentos = f"{p['atendimentos']:,}".replace(",", ".")
    numeros = "1 número de WhatsApp" if p["numeros"] == 1 else f"{p['numeros']} números de WhatsApp"
    modulos = "Pode somar ERP e Ordens de serviço" if p["modulos"] else "Sem ERP e Ordens de serviço"
    selo = f'\n            <span class="selo-plano">{e(p["destaque"])}</span>' if p.get("destaque") else ""
    classe = "plano destaque" if p.get("destaque") else "plano"
    return f"""          <article class="{classe}" aria-labelledby="plano-{p['nome'].lower()}">{selo}
            <h3 id="plano-{p['nome'].lower()}">{e(p["nome"])}</h3>
            <p class="para">{e(p["para"])}</p>
            <p class="preco mensal-v"><strong>{brl(p["mensal"])}</strong> <span>por mês</span></p>
            <p class="preco anual-v"><strong>{brl(p["anual"])}</strong> <span>por ano</span></p>
            <p class="preco-nota mensal-v">ou {brl(p["anual"])} no anual: 2 meses grátis</p>
            <p class="preco-nota anual-v">Equivale a {por_mes} por mês. Você economiza {economia}.</p>
            <ul>
              <li><strong>{atendimentos}</strong> atendimentos do agente por mês</li>
              <li>{numeros}</li>
              <li>Usuários ilimitados</li>
              <li>{e(p["implantacao"])}</li>
              <li>{modulos}</li>
            </ul>
            <a class="botao {'primario' if p.get('destaque') else 'secundario'}" href="/#solicitar">Testar 30 dias grátis</a>
          </article>"""


def pagina() -> str:
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Início", "item": f"{SITE}/"},
                    {"@type": "ListItem", "position": 2, "name": "Planos", "item": URL},
                ],
            },
            {
                "@type": "SoftwareApplication",
                "name": "Livih",
                "url": f"{SITE}/",
                "applicationCategory": "BusinessApplication",
                "operatingSystem": "Web",
                "inLanguage": "pt-BR",
                "offers": {
                    "@type": "AggregateOffer",
                    "priceCurrency": "BRL",
                    "lowPrice": f"{min(p['mensal'] for p in PLANOS):.2f}",
                    "highPrice": f"{max(p['mensal'] for p in PLANOS):.2f}",
                    "offerCount": len(PLANOS),
                    "offers": [
                        {"@type": "Offer", "name": p["nome"], "price": f"{p['mensal']:.2f}", "priceCurrency": "BRL", "url": URL}
                        for p in PLANOS
                    ],
                },
            },
            {
                "@type": "FAQPage",
                "mainEntity": [
                    {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": r}} for q, r in PERGUNTAS
                ],
            },
        ],
    }
    cartoes = "\n".join(cartao_plano(p) for p in PLANOS)
    todos = "\n".join(f"          <li>{e(t)}</li>" for t in TODOS_TEM)
    modulos = "\n".join(
        f"""          <article class="cartao">
            <span class="marca" aria-hidden="true"></span>
            <h3>{e(nome)}</h3>
            <p class="preco-modulo"><span class="mensal-v">{brl(mensal)} por mês</span><span class="anual-v">{brl(anual)} por ano</span></p>
            <p>{e(desc)}</p>
          </article>""" for nome, mensal, anual, desc in MODULOS)
    perguntas = "\n".join(
        f"""          <details>
            <summary>{e(q)}</summary>
            <p>{e(r)}</p>
          </details>""" for q, r in PERGUNTAS)
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(TITLE)}</title>
  <meta name="description" content="{e(DESCRIPTION)}">
  <link rel="canonical" href="{URL}">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#092124">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">

  <meta property="og:type" content="website">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="Livih">
  <meta property="og:url" content="{URL}">
  <meta property="og:title" content="{e(TITLE)}">
  <meta property="og:description" content="{e(DESCRIPTION)}">
  <meta property="og:image" content="{SITE}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">

  <script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=2)}
  </script>
  <link rel="stylesheet" href="/site.css">
</head>
<body>
  <a class="pular" href="#conteudo">Pular para o conteúdo</a>

  <header class="topo">
    <div class="container">
      <a href="/" aria-label="Livih, página inicial">
        <img src="/marca/livih.png" alt="Livih" width="95" height="40">
      </a>
      <nav aria-label="Principal">
        <a class="secao" href="/#solucoes">Soluções</a>
        <a class="secao" href="/#como-funciona">Como funciona</a>
        <a class="secao" href="/planos/" aria-current="page">Planos</a>
        <a class="botao secundario pequeno" href="https://app.livih.com.br/">Entrar</a>
      </nav>
    </div>
  </header>

  <main id="conteudo">
    <section class="heroi solucao" aria-labelledby="titulo">
      <div class="container">
        <div>
          <nav class="trilha" aria-label="Você está em"><a href="/">Início</a> › Planos</nav>
          <p class="selo">Planos e preços</p>
          <h1 id="titulo">Todo plano da Livih já vem com o agente de IA</h1>
          <p class="sub">Você escolhe pela quantidade de números de WhatsApp e de atendimentos do agente. Usuários ilimitados em todos os planos. Teste 30 dias grátis, sem cartão.</p>
        </div>
      </div>
    </section>

    <section class="bloco cinza planos" id="planos" aria-labelledby="titulo-planos">
      <div class="container">
        <h2 id="titulo-planos">Escolha o seu plano</h2>
        <div class="alternar" role="group" aria-label="Forma de pagamento" hidden>
          <button type="button" data-periodo="mensal" aria-pressed="true">Mensal</button>
          <button type="button" data-periodo="anual" aria-pressed="false">Anual <span>2 meses grátis</span></button>
        </div>
        <div class="grade-planos">
{cartoes}
        </div>
        <p class="mais-numeros">Precisa de mais de 5 números? <a href="{WHATSAPP}" rel="noopener">Fale com a gente</a> e montamos um plano para a sua operação.</p>
      </div>
    </section>

    <section class="bloco" aria-labelledby="titulo-todos">
      <div class="container">
        <h2 id="titulo-todos">O que vem em todos os planos</h2>
        <ul class="lista-publico">
{todos}
        </ul>
      </div>
    </section>

    <section class="bloco cinza planos" aria-labelledby="titulo-modulos">
      <div class="container">
        <h2 id="titulo-modulos">Módulos para somar ao plano</h2>
        <p class="intro">Do plano Start para cima, você liga o que a sua empresa usa. A nota fiscal já vem no módulo.</p>
        <div class="grade tres">
{modulos}
        </div>
        <p class="aviso-pacote">Cada CNPJ a mais: <span class="mensal-v">{brl(CNPJ_ADICIONAL[0])} por mês</span><span class="anual-v">{brl(CNPJ_ADICIONAL[1])} por ano</span>. Cada nota além das 100 do mês: {brl_centavos(NOTA_ADICIONAL)}.</p>
      </div>
    </section>

    <section class="bloco" aria-labelledby="titulo-franquia">
      <div class="container">
        <h2 id="titulo-franquia">Sem susto na fatura</h2>
        <p class="intro">Os atendimentos do agente vêm em cada plano. Quando estiverem acabando, quem decide o que acontece é você.</p>
        <div class="grade tres">
          <article class="cartao">
            <span class="marca" aria-hidden="true"></span>
            <h3>Aviso aos 80 %</h3>
            <p>Você recebe um aviso na Livih e no WhatsApp com o consumo do mês e as opções.</p>
          </article>
          <article class="cartao">
            <span class="marca" aria-hidden="true"></span>
            <h3>Parar ou continuar</h3>
            <p>Ao chegar no limite, o agente para e a equipe atende, ou continua por {brl_centavos(EXCEDENTE)} por atendimento a mais. Você escolhe antes.</p>
          </article>
          <article class="cartao">
            <span class="marca" aria-hidden="true"></span>
            <h3>Pacote de atendimentos</h3>
            <p>{PACOTE[0]} atendimentos a mais por {brl_centavos(PACOTE[1])}, em qualquer plano. Sai mais barato que o avulso.</p>
          </article>
        </div>
      </div>
    </section>

    <section class="bloco cinza" aria-labelledby="titulo-perguntas">
      <div class="container">
        <h2 id="titulo-perguntas">Perguntas sobre os planos</h2>
        <div class="perguntas">
{perguntas}
        </div>
      </div>
    </section>

    <section class="chamada" aria-labelledby="titulo-chamada">
      <div class="container">
        <h2 id="titulo-chamada">Teste a Livih antes de escolher</h2>
        <p>30 dias grátis e sem cartão. No fim, você escolhe o plano que cabe na sua operação.</p>
        <div class="acoes" style="justify-content:center;display:flex;flex-wrap:wrap;gap:.75rem">
          <a class="botao claro" href="/#solicitar">Quero meus 30 dias grátis</a>
        </div>
        <p class="alternativa">Prefere conversar agora? <a href="{WHATSAPP}" rel="noopener">Fale com a gente no WhatsApp</a>.</p>
      </div>
    </section>
  </main>

  <footer class="rodape">
    <div class="container">
      <span>Livih é um produto da F7 Tech — CNPJ 62.213.016/0001-30</span>
      <nav aria-label="Rodapé" class="links-rodape">
        <a href="/planos/">Planos</a>
        <a href="/privacidade/">Política de Privacidade</a>
        <a href="/termos/">Termos de Uso</a>
        <a href="https://app.livih.com.br/">Entrar na plataforma</a>
      </nav>
{rodape_solucoes()}
    </div>
  </footer>
  <script>
    // Chave Mensal/Anual: sem JavaScript a chave fica escondida e o anual aparece na linha de baixo de cada preço.
    (function () {{
      var secoes = document.querySelectorAll(".planos");
      var chave = document.querySelector(".alternar");
      var botoes = chave.querySelectorAll("button");
      chave.hidden = false;
      function escolher(periodo) {{
        for (var i = 0; i < secoes.length; i++) secoes[i].classList.toggle("anual", periodo === "anual");
        for (var j = 0; j < botoes.length; j++) botoes[j].setAttribute("aria-pressed", String(botoes[j].dataset.periodo === periodo));
      }}
      for (var k = 0; k < botoes.length; k++) botoes[k].addEventListener("click", function () {{ escolher(this.dataset.periodo); }});
    }})();
  </script>
{BEACON}</body>
</html>
"""


if __name__ == "__main__":
    pasta = os.path.join("site", "public", "planos")
    os.makedirs(pasta, exist_ok=True)
    with open(os.path.join(pasta, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(pagina())
    print("gerada: /planos/")
