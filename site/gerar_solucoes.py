"""Gera as páginas de solução do site (site/public/<slug>/index.html) a partir do conteúdo abaixo.

Um modelo só para as 6 páginas: mesmo cabeçalho, rodapé, metadados e dados estruturados. Para mudar um texto ou
acrescentar uma página, edite PAGINAS e rode na raiz do repo: python site/gerar_solucoes.py
Tom de voz F7 (você, prova concreta, frases curtas). Só o que a Livih faz de verdade: nada de "inviolável".
"""
import html
import json
import os

SITE = "https://livih.com.br"
WHATSAPP = "https://wa.me/5541999148944?text=Ol%C3%A1!%20Quero%20conhecer%20o%20Livih."
BEACON = """    <!-- Cloudflare Web Analytics (sem cookies): acessos por página no painel da Cloudflare -->
    <script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "b8905c3ec2e947d8b5cf194ff6abcc68"}'></script>
"""

PAGINAS = [
    {
        "slug": "atendimento-whatsapp-equipe",
        "curto": "Atendimento em equipe",
        "title": "Atendimento no WhatsApp com vários atendentes | Livih",
        "description": "Uma caixa de entrada para todas as conversas da sua equipe no WhatsApp, com filas, um responsável por atendimento e aviso quando alguém precisa responder.",
        "selo": "Atendimento em equipe",
        "h1": "Vários atendentes no WhatsApp, uma caixa de entrada só",
        "sub": "Todas as conversas dos números da sua empresa num só lugar. Cada atendimento tem um responsável, ninguém responde por cima de ninguém e nenhum cliente fica esquecido.",
        "dor_titulo": "O que trava o atendimento hoje",
        "dores": [
            "Duas pessoas respondem o mesmo cliente. Ou nenhuma responde.",
            "Para saber se o cliente foi atendido, alguém precisa pegar o celular de outra pessoa.",
            "A mensagem que chega fora do horário some no meio das outras.",
            "O arquivo que o cliente mandou fica só no celular de quem recebeu.",
        ],
        "recursos_titulo": "Como a Livih organiza o atendimento",
        "recursos": [
            ("Caixa de entrada compartilhada", "As conversas de todos os números conectados numa tela só, no computador ou no celular. A Livih instala como aplicativo."),
            ("Filas por situação", "Aguardando atendimento, em atendimento, com o agente e encerradas. Quem espera há mais tempo aparece primeiro."),
            ("Um responsável por conversa", "Quem responde assume o atendimento. Você transfere para outra pessoa ou devolve ao agente de IA quando quiser."),
            ("Aviso na hora certa", "Quando o agente passa a conversa para a equipe, o atendente recebe notificação no celular e um aviso no WhatsApp com o motivo."),
            ("Fotos, PDFs e áudios na conversa", "O que o cliente manda fica guardado, para qualquer pessoa da equipe abrir. Áudios chegam com transcrição."),
            ("O celular também conta", "Se alguém responde pelo WhatsApp do celular, a mensagem aparece na Livih e o agente para de responder naquela conversa."),
        ],
        "exemplo": "Uma loja com 3 atendentes recebe 40 conversas por dia num número só. Às 18h40, um cliente pede um orçamento. O agente de IA entende o pedido e passa a conversa para a fila com o motivo \"pedido de orçamento\". No dia seguinte, às 8h, a primeira pessoa que abre a Livih vê a conversa no topo da fila, assume e responde. As outras veem que ela já tem dono.",
        "perguntas": [
            ("Quantas pessoas podem atender no mesmo número?", "Não há limite de usuários por empresa. Toda a equipe vê as conversas do número da empresa, e cada conversa tem um responsável de cada vez."),
            ("Funciona com o WhatsApp que eu já uso?", "Sim. O número continua o mesmo e segue funcionando no celular."),
            ("O cliente percebe alguma mudança?", "Não. Ele continua falando com o mesmo número, do mesmo jeito."),
        ],
        "relacionadas": ["whatsapp-equipe-de-vendas", "agente-ia-whatsapp", "historico-auditoria-whatsapp"],
    },
    {
        "slug": "whatsapp-equipe-de-vendas",
        "curto": "Equipe de vendas",
        "title": "WhatsApp para equipe de vendas com gestão | Livih",
        "description": "Cada vendedor no próprio número de WhatsApp, com a carteira dele, e a gestão acompanhando todas as conversas. O histórico com o cliente fica na empresa.",
        "selo": "Equipe de vendas",
        "h1": "Seus vendedores no WhatsApp, você enxergando tudo",
        "sub": "Cada vendedor continua com o próprio número. Você acompanha as conversas, as negociações em andamento e quem atende cada cliente, sem pedir o celular de ninguém.",
        "dor_titulo": "Onde a venda se perde hoje",
        "dores": [
            "Você só sabe como está uma negociação perguntando ao vendedor.",
            "O cliente que chamou à noite fica sem resposta até alguém lembrar.",
            "Quando um vendedor sai, a carteira e o histórico vão embora no celular dele.",
            "Dois vendedores disputam o mesmo cliente.",
        ],
        "recursos_titulo": "Como a Livih organiza a equipe de vendas",
        "recursos": [
            ("Cada um no seu número", "Os números dos vendedores são conectados à Livih e seguem funcionando no celular, como sempre."),
            ("Carteira por vendedor", "O vendedor vê os clientes dele. Donos e gestores veem a operação inteira."),
            ("O cliente é da empresa", "Contatos, conversas, notas e orçamentos ficam na Livih. Se o vendedor sai, você passa os clientes para outra pessoa com todo o histórico."),
            ("Prospecção pela Livih", "O vendedor começa uma conversa com um cliente novo direto do sistema, e ela já entra na carteira dele."),
            ("Oportunidades e agenda", "Cada negociação numa etapa do funil, e as reuniões, visitas e retornos na agenda da equipe."),
            ("Orçamento em PDF na conversa", "O vendedor monta o orçamento com os produtos cadastrados e envia o PDF com a logo da empresa num clique."),
        ],
        "exemplo": "Uma distribuidora tem 5 vendedores, cada um com o próprio WhatsApp. Um deles sai da empresa numa sexta-feira. Na segunda, o gestor passa os clientes dele para outro vendedor na Livih. O novo responsável abre cada cliente e lê a conversa inteira, os orçamentos enviados e as notas. Nenhum cliente precisa repetir o que já tinha combinado.",
        "perguntas": [
            ("O vendedor precisa trocar de número?", "Não. O número dele é conectado à Livih e continua funcionando no celular."),
            ("Um vendedor vê os clientes dos outros?", "Não. Cada vendedor vê a própria carteira e as conversas do número da empresa. Donos e administradores veem tudo."),
            ("E se o vendedor responder pelo celular?", "A mensagem também fica registrada na Livih, na mesma conversa. Você acompanha do mesmo jeito."),
        ],
        "relacionadas": ["crm-whatsapp", "orcamento-pedidos-whatsapp", "historico-auditoria-whatsapp"],
    },
    {
        "slug": "crm-whatsapp",
        "curto": "CRM para WhatsApp",
        "title": "CRM para WhatsApp com funil de vendas | Livih",
        "description": "Contatos, oportunidades, notas e agenda ligados às conversas do WhatsApp. O funil se atualiza a partir do atendimento, sem planilha paralela.",
        "selo": "CRM e funil de vendas",
        "h1": "Um CRM que nasce das conversas do WhatsApp",
        "sub": "Cada cliente que escreve vira um contato com histórico. As negociações ficam num funil por etapas, ligado à conversa. Você para de manter planilha paralela.",
        "dor_titulo": "Por que o CRM fica desatualizado",
        "dores": [
            "A venda acontece no WhatsApp, e ninguém tem tempo de copiar tudo para o CRM.",
            "A informação do cliente fica em anotações soltas de cada vendedor.",
            "Você não sabe quantas negociações estão em cada etapa, nem com quem.",
        ],
        "recursos_titulo": "Como a Livih mantém o CRM em dia",
        "recursos": [
            ("Contato criado sozinho", "Quem escreve vira contato, com nome, telefone e todas as conversas. Também dá para cadastrar à mão."),
            ("O agente preenche o cadastro", "Empresa, e-mail, cargo, cidade: o que o cliente contar na conversa, o agente de IA grava no contato."),
            ("Funil com as suas etapas", "Você define as etapas. O agente registra a oportunidade com um resumo do que o cliente precisa e avança a etapa. Ganho e perdido ficam com a equipe."),
            ("Notas internas", "Informação sobre o cliente e a negociação, visível para quem atende e invisível para o cliente."),
            ("Agenda da equipe", "Reuniões, visitas e retornos ligados ao cliente e à oportunidade, com a semana de cada vendedor."),
            ("Tudo a partir da conversa", "Do atendimento você abre o contato, a oportunidade e a agenda, sem trocar de sistema."),
        ],
        "exemplo": "Um cliente escreve: \"Somos uma clínica com 6 dentistas e perdemos muito agendamento por mensagem\". O agente grava a empresa e o tamanho da equipe no contato, cria a oportunidade \"Agente de atendimento para clínica\" com esse resumo e passa a etapa para \"em diagnóstico\". De manhã, o vendedor abre o funil e já sabe com quem falar e o que oferecer.",
        "perguntas": [
            ("Preciso digitar os contatos?", "Não. Quem escreve para a sua empresa vira contato automaticamente. Você também pode cadastrar contatos à mão."),
            ("Dá para mudar as etapas do funil?", "Sim. Cada empresa define as próprias etapas, na ordem que fizer sentido para a venda dela."),
            ("O agente fecha vendas sozinho?", "Não. Ele registra a oportunidade e avança as etapas em andamento. Marcar como ganha ou perdida é decisão da equipe."),
        ],
        "relacionadas": ["whatsapp-equipe-de-vendas", "agente-ia-whatsapp", "orcamento-pedidos-whatsapp"],
    },
    {
        "slug": "agente-ia-whatsapp",
        "curto": "Agente de IA",
        "title": "Agente de IA para atendimento no WhatsApp | Livih",
        "description": "Agente de inteligência artificial que responde clientes no WhatsApp com as informações da sua empresa, entende áudio, foto e PDF e chama a equipe na hora certa.",
        "selo": "Agente de IA",
        "h1": "Um agente de IA que atende no WhatsApp e sabe a hora de chamar a sua equipe",
        "sub": "Ele responde dúvidas com as informações da sua empresa, entende áudio, foto e PDF e passa a conversa para uma pessoa quando o caso pede. De dia e de noite.",
        "dor_titulo": "O que acontece sem ele",
        "dores": [
            "O cliente pergunta o preço às 22h e só recebe resposta no dia seguinte.",
            "A equipe passa o dia respondendo as mesmas perguntas.",
            "O chatbot de menu irrita o cliente e não entende o que ele escreve.",
        ],
        "recursos_titulo": "O que o agente faz",
        "recursos": [
            ("Responde com o que é seu", "Usa as instruções e a base de conhecimento da sua empresa: serviços, regras, prazos e formas de pagamento."),
            ("Entende áudio, foto e PDF", "O áudio vira texto. A foto e o PDF viram uma descrição que o agente usa para responder. Uma lista de compras em PDF vira itens e quantidades."),
            ("Consulta o seu catálogo", "Com os produtos cadastrados, o agente busca o item que o cliente pediu e informa o preço exatamente como está no cadastro."),
            ("Monta e envia o orçamento", "O cliente diz o que quer e as quantidades. O agente monta o orçamento e manda o PDF na conversa."),
            ("Chama a equipe com o motivo", "Você define quando ele passa para uma pessoa: pedido de desconto, reclamação, cliente pronto para fechar. O atendente recebe o aviso com o motivo."),
            ("Respeita o horário e o vendedor", "Fora do expediente, ele avisa e continua ajudando. Quando alguém da equipe responde, ele para de falar naquela conversa."),
        ],
        "exemplo": "Às 21h, um cliente manda a foto de uma caixa de grampos e pergunta: \"Vocês vendem esse?\". O agente lê na foto que é o grampo 26/6, busca no catálogo, responde com o preço da caixa e pergunta quantas o cliente quer. Com a quantidade, monta o orçamento e envia o PDF. Às 8h, o vendedor encontra o orçamento pronto e só confirma o frete.",
        "perguntas": [
            ("O agente pode inventar informação?", "Ele é instruído a responder só com as informações da sua empresa e do seu catálogo, e a chamar a equipe quando não sabe. Como todo agente de IA, pode errar. Por isso a equipe acompanha as conversas e ajusta as instruções quando precisa."),
            ("Dá para desligar o agente?", "Sim. Você liga e desliga o agente em cada número e também para clientes específicos."),
            ("O agente faz disparo de mensagens?", "Não. Ele responde quem escreve para a sua empresa. As campanhas de divulgação saem pela equipe, pela API oficial do WhatsApp e só para quem autorizou; quando o cliente responde, o agente atende."),
        ],
        "relacionadas": ["atendimento-whatsapp-equipe", "orcamento-pedidos-whatsapp", "crm-whatsapp"],
    },
    {
        "slug": "historico-auditoria-whatsapp",
        "curto": "Histórico e auditoria",
        "title": "Histórico e auditoria das conversas do WhatsApp | Livih",
        "description": "As conversas comerciais da sua equipe num histórico que nenhum usuário edita nem apaga, com quem respondeu e quando. Mesmo quando alguém sai da equipe.",
        "selo": "Histórico e auditoria",
        "h1": "O histórico das conversas fica com a sua empresa, não no celular de cada um",
        "sub": "Mensagens, fotos, PDFs e áudios num histórico que nenhum usuário edita nem apaga, com quem atendeu e quando. Mesmo quando alguém sai da equipe.",
        "dor_titulo": "O risco de hoje",
        "dores": [
            "A conversa é apagada no celular e o que foi prometido ao cliente some junto.",
            "Numa reclamação, ninguém consegue mostrar o que foi dito.",
            "O vendedor sai da empresa e leva os clientes no celular.",
        ],
        "recursos_titulo": "Como a Livih guarda o histórico",
        "recursos": [
            ("Mensagens que não mudam", "O que entra na Livih não pode ser editado nem apagado por nenhum usuário, nem por quem administra a conta. Apagar no celular não apaga o registro."),
            ("Arquivos guardados", "Fotos, PDFs, vídeos e áudios ficam na conversa, até 50 MB por arquivo. Depois de guardado, o arquivo não é trocado."),
            ("O celular também entra", "As mensagens enviadas pelo WhatsApp do celular do atendente também são registradas, na mesma conversa."),
            ("Quem fez o quê", "Assumir, transferir, devolver ao agente e encerrar um atendimento ficam registrados com o responsável e o horário."),
            ("Os clientes ficam", "Se alguém sai da equipe, você passa os clientes dessa pessoa para outra, com a conversa inteira."),
            ("LGPD", "A exclusão de dados pessoais, quando a lei exige, segue um procedimento próprio e fica registrada."),
        ],
        "exemplo": "Uma empresa de cobrança tem 8 atendentes negociando pelo WhatsApp. Um cliente reclama que a atendente prometeu um desconto que não foi dado. A gestora abre a conversa na Livih e lê exatamente o que foi enviado, por quem e quando, inclusive o que saiu pelo celular. A resposta à reclamação sai no mesmo dia, com base no registro.",
        "perguntas": [
            ("O administrador consegue apagar uma conversa?", "Não pelo sistema. A exclusão de dados pessoais, quando a LGPD exige, segue um procedimento próprio e fica registrada."),
            ("As conversas antigas entram na Livih?", "O registro começa quando o número é conectado. As mensagens de antes ficam só no celular."),
            ("Os arquivos que o cliente manda também ficam?", "Sim. Fotos, PDFs, vídeos e áudios de até 50 MB ficam guardados na conversa. Acima disso, a Livih registra que o arquivo chegou e avisa para abrir no celular."),
        ],
        "relacionadas": ["atendimento-whatsapp-equipe", "whatsapp-equipe-de-vendas", "crm-whatsapp"],
    },
    {
        "slug": "orcamento-pedidos-whatsapp",
        "curto": "Orçamentos e pedidos",
        "title": "Orçamento e pedido pelo WhatsApp com PDF | Livih",
        "description": "Catálogo de produtos, orçamento em PDF com a logo da sua empresa e pedidos ligados às conversas do WhatsApp. O agente de IA pode montar e enviar o orçamento.",
        "selo": "Orçamentos e pedidos",
        "h1": "Orçamento em PDF pelo WhatsApp, montado a partir do seu catálogo",
        "sub": "Cadastre seus produtos, monte o orçamento ao lado da conversa e envie o PDF com a sua marca num clique. Ou deixe o agente de IA montar quando o cliente pedir.",
        "dor_titulo": "Como o orçamento sai hoje",
        "dores": [
            "Feito no Word, exportado em PDF e anexado pelo celular. Cada vendedor com um layout.",
            "Preço desatualizado, porque cada um usa a própria tabela.",
            "Pedido anotado no papel e estoque conferido no olho.",
        ],
        "recursos_titulo": "Como a Livih resolve",
        "recursos": [
            ("Catálogo de produtos", "Importe a sua planilha com código, preço, unidade, categoria, marca e NCM."),
            ("Orçamento ao lado da conversa", "Do atendimento você cria o orçamento já com o cliente e adiciona itens, desconto, frete, validade e condições de pagamento."),
            ("PDF com a sua marca", "Logo, CNPJ, endereço e o vendedor responsável. Empresa com mais de um CNPJ escolhe de qual sai cada orçamento."),
            ("Enviar num clique", "Você vê a prévia na tela e envia o PDF na conversa do cliente. Ele fica no histórico."),
            ("O agente monta o orçamento", "O cliente pede pelo WhatsApp, o agente busca os produtos, monta o orçamento com o preço do cadastro e envia o PDF."),
            ("Do orçamento ao pedido", "Confirmado, o pedido baixa o estoque e segue as etapas: separando, enviado e entregue."),
        ],
        "exemplo": "Uma empresa de grampos e ferramentas tem 277 produtos e anotava os pedidos no papel. Hoje o cliente escreve: \"quero 10 caixas do 14/19 e 2 do prego anelado 2,30x35\". O agente monta o orçamento com os preços do catálogo, R$ 1.981,40 sem frete, e envia o PDF com a logo da empresa. A equipe confere o frete e confirma o pedido.",
        "aviso": "Orçamentos e pedidos é um pacote adicional da Livih. Fale com a gente para ativar na sua empresa.",
        "perguntas": [
            ("Preciso cadastrar os produtos um a um?", "Não. Você importa uma planilha (CSV) com os produtos e ajusta o que precisar na Livih."),
            ("O agente pode dar desconto?", "Não. Ele usa o preço cadastrado. Desconto e frete ficam com a equipe."),
            ("A Livih emite nota fiscal?", "Ainda não. Hoje a Livih cuida do orçamento, do pedido e do estoque."),
        ],
        "relacionadas": ["agente-ia-whatsapp", "whatsapp-equipe-de-vendas", "crm-whatsapp"],
    },
]

POR_SLUG = {p["slug"]: p for p in PAGINAS}
e = lambda t: html.escape(t, quote=True)


def rodape_solucoes() -> str:
    links = "\n".join(f'        <a href="/{p["slug"]}/">{e(p["curto"])}</a>' for p in PAGINAS)
    return f'      <nav aria-label="Soluções" class="solucoes-rodape">\n{links}\n      </nav>'


def pagina(p: dict) -> str:
    url = f"{SITE}/{p['slug']}/"
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Início", "item": f"{SITE}/"},
                    {"@type": "ListItem", "position": 2, "name": p["curto"], "item": url},
                ],
            },
            {
                "@type": "FAQPage",
                "mainEntity": [
                    {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": r}} for q, r in p["perguntas"]
                ],
            },
        ],
    }
    dores = "\n".join(f"          <li>{e(d)}</li>" for d in p["dores"])
    cartoes = "\n".join(
        f"""          <article class="cartao">
            <span class="marca" aria-hidden="true"></span>
            <h3>{e(t)}</h3>
            <p>{e(d)}</p>
          </article>""" for t, d in p["recursos"])
    perguntas = "\n".join(
        f"""          <details>
            <summary>{e(q)}</summary>
            <p>{e(r)}</p>
          </details>""" for q, r in p["perguntas"])
    relacionadas = "\n".join(
        f'          <li><a href="/{s}/">{e(POR_SLUG[s]["curto"])}</a></li>' for s in p["relacionadas"])
    aviso = f'\n        <p class="aviso-pacote">{e(p["aviso"])}</p>' if p.get("aviso") else ""
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(p["title"])}</title>
  <meta name="description" content="{e(p["description"])}">
  <link rel="canonical" href="{url}">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#092124">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">

  <meta property="og:type" content="website">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="Livih">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{e(p["title"])}">
  <meta property="og:description" content="{e(p["description"])}">
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
        <a class="botao secundario pequeno" href="https://app.livih.com.br/">Entrar</a>
      </nav>
    </div>
  </header>

  <main id="conteudo">
    <section class="heroi solucao" aria-labelledby="titulo">
      <div class="container">
        <div>
          <nav class="trilha" aria-label="Você está em"><a href="/">Início</a> › {e(p["curto"])}</nav>
          <p class="selo">{e(p["selo"])}</p>
          <h1 id="titulo">{e(p["h1"])}</h1>
          <p class="sub">{e(p["sub"])}</p>
          <div class="acoes">
            <a class="botao claro" href="/#solicitar">Peça acesso à Livih</a>
            <a class="botao secundario" href="{WHATSAPP}" rel="noopener">Fale com a gente no WhatsApp</a>
          </div>
        </div>
      </div>
    </section>

    <section class="bloco" aria-labelledby="titulo-dor">
      <div class="container">
        <h2 id="titulo-dor">{e(p["dor_titulo"])}</h2>
        <ul class="lista-publico">
{dores}
        </ul>
      </div>
    </section>

    <section class="bloco cinza" aria-labelledby="titulo-recursos">
      <div class="container">
        <h2 id="titulo-recursos">{e(p["recursos_titulo"])}</h2>
        <div class="grade tres">
{cartoes}
        </div>{aviso}
      </div>
    </section>

    <section class="bloco" aria-labelledby="titulo-exemplo">
      <div class="container">
        <h2 id="titulo-exemplo">Na prática</h2>
        <div class="exemplo">
          <span class="rotulo">Exemplo</span>
          <p>{e(p["exemplo"])}</p>
        </div>
      </div>
    </section>

    <section class="bloco cinza" aria-labelledby="titulo-perguntas">
      <div class="container">
        <h2 id="titulo-perguntas">Perguntas frequentes</h2>
        <div class="perguntas">
{perguntas}
        </div>
      </div>
    </section>

    <section class="bloco" aria-labelledby="titulo-veja">
      <div class="container">
        <h2 id="titulo-veja">Veja também</h2>
        <ul class="veja-tambem">
{relacionadas}
          <li><a href="/">Visão geral da Livih</a></li>
        </ul>
      </div>
    </section>

    <section class="chamada" aria-labelledby="titulo-chamada">
      <div class="container">
        <h2 id="titulo-chamada">Organize o WhatsApp da sua equipe</h2>
        <p>Peça o acesso à Livih. Nós entramos em contato para conhecer a sua operação e ajudar a conectar os números.</p>
        <div class="acoes" style="justify-content:center;display:flex;flex-wrap:wrap;gap:.75rem">
          <a class="botao claro" href="/#solicitar">Peça acesso à Livih</a>
        </div>
        <p class="alternativa">Prefere conversar agora? <a href="{WHATSAPP}" rel="noopener">Fale com a gente no WhatsApp</a>.</p>
      </div>
    </section>
  </main>

  <footer class="rodape">
    <div class="container">
      <span>Livih é um produto da F7 Tech — CNPJ 62.213.016/0001-30</span>
      <nav aria-label="Rodapé" class="links-rodape">
        <a href="/privacidade/">Política de Privacidade</a>
        <a href="/termos/">Termos de Uso</a>
        <a href="https://app.livih.com.br/">Entrar na plataforma</a>
      </nav>
{rodape_solucoes()}
    </div>
  </footer>
{BEACON}</body>
</html>
"""


if __name__ == "__main__":
    for p in PAGINAS:
        pasta = os.path.join("site", "public", p["slug"])
        os.makedirs(pasta, exist_ok=True)
        with open(os.path.join(pasta, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(pagina(p))
        print("gerada:", f"/{p['slug']}/")
    print("\nRodapé de soluções (copiar para a página inicial se mudar):\n" + rodape_solucoes())
