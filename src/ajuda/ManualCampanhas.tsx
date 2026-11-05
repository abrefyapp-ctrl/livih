import { Link } from 'react-router-dom'
import { Caminho, Figura, Lista, Paragrafo, Secao, Subtitulo, Tabela } from './componentes'

// Manual de Campanhas (05/11). Mesmo texto do documento "Manual da Livih: Campanhas"; mudou a tela de campanhas
// (src/pages/Campanhas.tsx, ModalNovaCampanha.tsx) ou a regra (docs/campanhas.md), mude aqui também.

export const SECOES_CAMPANHAS = [
  { id: 'antes-de-comecar', titulo: 'Antes de começar' },
  { id: 'modelo', titulo: 'Passo 1: criar o modelo de Marketing' },
  { id: 'criar', titulo: 'Passo 2: criar a campanha' },
  { id: 'resultado', titulo: 'Passo 3: acompanhar o resultado' },
  { id: 'sair', titulo: 'Quem não quer receber' },
  { id: 'boas-praticas', titulo: 'Boas práticas' },
  { id: 'problemas', titulo: 'Problemas comuns' },
]

const titulo = (id: string) => SECOES_CAMPANHAS.find((s) => s.id === id)!.titulo
const IMG = '/ajuda/campanhas'

export function ManualCampanhas() {
  return (
    <>
      <Paragrafo>
        A campanha manda uma mensagem de divulgação para um grupo de contatos de uma vez, pelo WhatsApp oficial da sua
        empresa. As respostas chegam em Conversas, como qualquer mensagem, e o agente atende.
      </Paragrafo>

      <Secao id="antes-de-comecar" titulo={titulo('antes-de-comecar')}>
        <Paragrafo>Você precisa de quatro coisas prontas. Sem elas, a Livih não deixa criar a campanha.</Paragrafo>
        <Tabela
          colunas={['O que', 'Por quê', 'Onde resolver']}
          linhas={[
            ['Ser dono ou admin da empresa na Livih', 'Só eles veem o menu Campanhas', 'Configurações → Equipe'],
            [
              <>Um número conectado pela <strong>API oficial</strong> do WhatsApp</>,
              'Envio em massa por número conectado pelo QR code é o que mais leva o número a ser bloqueado. Por isso a campanha só sai pelo oficial',
              'Configurações → WhatsApp → Conectar pela API oficial',
            ],
            [
              <>Um modelo de mensagem de <strong>Marketing aprovado</strong> pela Meta</>,
              'Fora de uma conversa aberta, o WhatsApp só deixa a empresa mandar mensagem com modelo aprovado',
              'Configurações → Modelos (Passo 1)',
            ],
            [
              'Contatos que autorizaram receber mensagens',
              'É regra do WhatsApp e da LGPD. Mensagem para quem não autorizou gera denúncia, e a Meta reduz o limite do número',
              'Na sua base de contatos',
            ],
          ]}
        />
        <Paragrafo>
          <strong className="text-texto">Quanto custa:</strong> a Meta cobra cada mensagem de Marketing entregue, direto na
          conta do WhatsApp da sua empresa. Esse valor não entra na fatura da Livih. A tabela de preços está na página de
          preços do WhatsApp Business, da Meta.
        </Paragrafo>
        <Paragrafo>
          O menu fica em <Link to="/campanhas" className="font-semibold text-primaria hover:underline">Vendas → Campanhas</Link>.
        </Paragrafo>
      </Secao>

      <Secao id="modelo" titulo={titulo('modelo')}>
        <Paragrafo>
          O modelo é o texto da campanha, aprovado antes pela Meta. Ele pode ter partes que mudam para cada contato, como o
          nome, que no texto aparecem como {'{{1}}'}, {'{{2}}'}.
        </Paragrafo>
        <Lista
          numerada
          itens={[
            <>Abra <Link to="/configuracoes/modelos" className="font-semibold text-primaria hover:underline">Configurações → Modelos</Link> e escolha o número da API oficial.</>,
            <>Clique em <Caminho>Novo modelo</Caminho>. Dá para começar de um pronto: <Caminho>Promoção</Caminho> ou <Caminho>Reativar cliente</Caminho> são de Marketing.</>,
            <>Escolha a categoria <Caminho>Marketing</Caminho>. As campanhas só aceitam essa categoria.</>,
            <>Escreva a mensagem. Para cada {'{{n}}'}, preencha um exemplo (ex.: Maria): a Meta usa para entender o texto.</>,
            'No rodapé, diga como sair: “Responda SAIR para não receber mais”.',
            'Envie para aprovação. A Meta costuma responder em minutos ou em algumas horas, e o status aparece na lista.',
          ]}
        />
        <Figura
          src={`${IMG}/novo-modelo.png`}
          alt="A janela Novo modelo com o exemplo pronto Promoção: categoria Marketing, mensagem com variáveis, rodapé para sair e a prévia ao lado"
          legenda="O exemplo pronto Promoção já vem em Marketing, com o rodapé de saída. A prévia mostra como o cliente vai ver."
        />
        <Subtitulo>Para a Meta aprovar de primeira</Subtitulo>
        <Lista
          itens={[
            'Não comece nem termine a mensagem com uma variável, e não ponha duas variáveis seguidas.',
            'Numere as variáveis em sequência: {{1}}, {{2}}, {{3}}.',
            'Ponha texto fixo suficiente em volta delas.',
            'Use cabeçalho só de texto, sem variável. Modelo com imagem, vídeo ou documento no cabeçalho ainda não sai por campanha.',
          ]}
        />
        <Paragrafo>A Livih avisa na própria tela quando o texto tem um desses problemas.</Paragrafo>
      </Secao>

      <Secao id="criar" titulo={titulo('criar')}>
        <Paragrafo>
          Em <Caminho>Vendas → Campanhas</Caminho>, clique em <Caminho>Nova campanha</Caminho>. A janela tem quatro partes.
        </Paragrafo>

        <Subtitulo>Campanha</Subtitulo>
        <Lista
          itens={[
            <><Caminho>Nome:</Caminho> só a equipe vê. Use algo que diga o quê e quando, como “Reposição de grampos – novembro”.</>,
            <><Caminho>Número que envia:</Caminho> aparecem só os números da API oficial. As respostas chegam na conversa do contato nesse número.</>,
          ]}
        />
        <Figura src={`${IMG}/campanha.png`} alt="A parte Campanha: o nome e o número que envia" />

        <Subtitulo>Público</Subtitulo>
        <Paragrafo>Os filtros são opcionais e se somam. Sem nenhum, a campanha vai para todos os contatos.</Paragrafo>
        <Tabela
          colunas={['Filtro', 'Quem entra']}
          linhas={[
            ['Etiquetas', 'Quem tem qualquer uma das etiquetas marcadas'],
            ['Com oportunidade aberta na etapa', 'Quem tem uma negociação aberta numa das etapas marcadas do funil'],
            ['Da carteira de', 'Os contatos dos vendedores marcados'],
            ['Cliente do cadastro', 'Todos, só os ligados a um cliente ou só os sem cliente'],
            ['Sem conversa há pelo menos (dias)', 'Quem não conversa com a empresa há esse tempo. Bom para reativar cliente parado'],
          ]}
        />
        <Paragrafo>
          A tela mostra na hora quantos contatos entram, com alguns nomes de exemplo. Quem pediu para não receber campanhas
          fica de fora sozinho, e a tela diz quantos são.
        </Paragrafo>
        <Figura
          src={`${IMG}/publico.png`}
          alt="A parte Público: filtros por etapa do funil, carteira, cliente do cadastro e tempo sem conversa, com a contagem de contatos embaixo"
          legenda="Sem filtro marcado, entram todos os contatos. Os nomes de pessoas nesta imagem foram borrados."
        />

        <Subtitulo>Mensagem</Subtitulo>
        <Lista
          numerada
          itens={[
            'Escolha o modelo. Aparecem só os de Marketing aprovados naquele número.',
            <>
              Para cada variável, escolha de onde vem o valor:
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li><Caminho>Nome do contato.</Caminho> No campo ao lado, escreva o que vai quando o contato não tem nome (padrão: “cliente”).</li>
                <li><Caminho>Empresa do contato:</Caminho> a razão social do cliente ligado ou o campo Empresa do contato. Escreva o que vai quando não houver (padrão: “sua empresa”).</li>
                <li><Caminho>Texto fixo:</Caminho> o mesmo para todos, como o nome da promoção.</li>
              </ul>
            </>,
            'Confira a prévia ao lado, montada com um contato de verdade do público.',
          ]}
        />
        <Paragrafo>A tela avisa quantos contatos do público estão sem nome ou sem empresa, para você decidir o texto padrão.</Paragrafo>

        <Subtitulo>Envio</Subtitulo>
        <Lista
          itens={[
            <><Caminho>Quando:</Caminho> começar agora ou agendar uma data e hora.</>,
            <><Caminho>Limite por dia neste número:</Caminho> padrão de 250. O que passar do limite fica para o dia seguinte. O limite vale para o número, somando todas as campanhas dele no dia.</>,
            <><Caminho>Confirmação:</Caminho> marque que os contatos autorizaram receber mensagens da empresa. Sem essa marcação, a campanha não sai.</>,
          ]}
        />
        <Figura src={`${IMG}/envio.png`} alt="A parte Envio: quando enviar, o limite por dia e a confirmação de que os contatos autorizaram" />
        <Paragrafo>
          Clique em <Caminho>Enviar para N contatos</Caminho> ou em <Caminho>Agendar campanha</Caminho>.
        </Paragrafo>
        <Paragrafo>
          A lista de quem recebe é fixada nessa hora. Contato novo que entrar no filtro depois não recebe esta campanha.
        </Paragrafo>
      </Secao>

      <Secao id="resultado" titulo={titulo('resultado')}>
        <Paragrafo>
          A campanha sai aos poucos, até 20 mensagens por minuto, respeitando o limite do dia. Enquanto ela envia, a lista em
          Campanhas se atualiza sozinha a cada 30 segundos.
        </Paragrafo>
        <Paragrafo>
          Cada mensagem entra na conversa do contato naquele número. Se ainda não havia conversa, a Livih cria uma, com o
          agente. As respostas chegam em <Caminho>Conversas</Caminho>, e o agente atende como qualquer outra.
        </Paragrafo>
        <Subtitulo>Situação da campanha</Subtitulo>
        <Tabela
          colunas={['Situação', 'O que quer dizer', 'O que dá para fazer']}
          linhas={[
            ['Agendada', 'Espera a data e a hora marcadas', 'Pausar ou cancelar'],
            ['Enviando', 'Está saindo agora', 'Pausar ou cancelar'],
            ['Pausada', 'Parou: por você, ou sozinha porque o número desconectou', 'Retomar ou cancelar'],
            ['Concluída', 'Todos da lista receberam', 'Só ver o resultado'],
            ['Cancelada', 'Quem ainda não tinha recebido não recebe mais', 'Só ver o resultado'],
          ]}
        />
        <Paragrafo>Cancelar não apaga nada: o que já foi enviado continua nas conversas.</Paragrafo>
        <Subtitulo>Os números de cada campanha</Subtitulo>
        <Tabela
          colunas={['Número', 'Como é contado']}
          linhas={[
            ['Enviadas', 'Quantas saíram, de quantas vão sair (“120 de 300”)'],
            ['Entregues', 'Chegaram no celular do contato. A porcentagem é sobre as enviadas'],
            ['Lidas', 'O contato abriu. Só conta quem deixa a confirmação de leitura ligada no WhatsApp'],
            ['Respostas', 'O contato escreveu até 7 dias depois de receber'],
            ['Orçamentos', 'Um pedido ou orçamento foi aberto para o contato até 7 dias depois'],
            ['Não entregues', 'Número inválido ou sem WhatsApp. Aparece em vermelho quando existe'],
          ]}
        />
      </Secao>

      <Secao id="sair" titulo={titulo('sair')}>
        <Paragrafo>Quem pede para sair não recebe mais nenhuma campanha da sua empresa. Isso acontece de dois jeitos.</Paragrafo>
        <Paragrafo>
          <strong className="text-texto">O contato responde pedindo para sair.</strong> Vale até 30 dias depois de receber uma
          campanha, quando a resposta é só uma destas palavras: SAIR, parar, pare, stop, cancelar, descadastrar, remover ou
          “não quero receber”. A Livih marca o contato e deixa um aviso na conversa para a equipe.
        </Paragrafo>
        <Paragrafo>
          <strong className="text-texto">A equipe marca no contato.</strong> No contato, clique em Editar e marque{' '}
          <Caminho>Não receber campanhas</Caminho>. Para voltar a incluir, desmarque. Use quando o cliente pedir por telefone,
          e-mail ou no meio de outra conversa.
        </Paragrafo>
        <Paragrafo>Quem está marcado continua sendo atendido normalmente nas conversas. Ele só sai das campanhas.</Paragrafo>
        <Paragrafo>
          A Livih ainda não manda uma confirmação automática de descadastro. Se quiser confirmar, responda na própria conversa.
        </Paragrafo>
      </Secao>

      <Secao id="boas-praticas" titulo={titulo('boas-praticas')}>
        <Paragrafo>
          A Meta acompanha como os contatos reagem às suas mensagens. Muitos bloqueios e denúncias baixam o limite diário do
          número e podem suspender o envio de modelos. Estes cuidados evitam isso.
        </Paragrafo>
        <Lista
          itens={[
            <><strong className="text-texto">Mande só para quem conhece a sua empresa</strong> e autorizou receber mensagens. Lista comprada ou de terceiros é o caminho mais rápido para o bloqueio.</>,
            <><strong className="text-texto">Comece com grupos pequenos.</strong> Um número novo começa com um limite baixo da Meta, que sobe conforme ele é usado sem problemas. Teste com algumas dezenas antes de mandar para centenas.</>,
            <><strong className="text-texto">Escolha o público pelo interesse.</strong> Use etiquetas, etapa do funil ou tempo sem conversa, em vez de mandar a mesma mensagem para todos.</>,
            <><strong className="text-texto">Personalize com o nome</strong> e diga logo quem está escrevendo e por quê.</>,
            <><strong className="text-texto">Sempre ofereça como sair</strong>, no rodapé ou num botão.</>,
            <><strong className="text-texto">Não repita a mesma campanha</strong> para as mesmas pessoas em poucos dias.</>,
            <><strong className="text-texto">Envie no horário comercial,</strong> quando a equipe e o agente estão prontos para as respostas. Para isso, agende.</>,
          ]}
        />
      </Secao>

      <Secao id="problemas" titulo={titulo('problemas')}>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            ['Não vejo o menu Campanhas', 'Só dono e admin têm acesso', 'Peça ao dono da empresa'],
            ['“Campanhas saem só por número conectado pela API oficial”', 'A empresa ainda não tem número oficial', 'Configurações → WhatsApp → Conectar pela API oficial'],
            ['“Nenhum modelo de Marketing aprovado neste número”', 'O modelo está em análise, foi recusado ou é de outra categoria', 'Confira em Configurações → Modelos. Recusado: ajuste o texto e envie de novo'],
            ['O modelo não aparece na lista da campanha', 'Tem imagem, vídeo, documento ou variável no cabeçalho, ou é de Utilidade', 'Crie uma versão de Marketing com cabeçalho só de texto'],
            ['O botão de enviar não libera', 'Falta o nome, o modelo, uma variável de texto fixo, a confirmação de autorização, ou o público deu zero', 'Preencha o que falta e confira os filtros'],
            ['A campanha parou sozinha (Pausada)', 'O número desconectou ou saiu da API oficial', 'Reconecte em Configurações → WhatsApp e clique em Retomar'],
            ['Saiu menos do que o esperado hoje', 'O limite por dia do número foi atingido', 'O resto sai no dia seguinte, sozinho'],
            ['Muitas “não entregues”', 'Números inválidos ou sem WhatsApp na base', 'Corrija o telefone no contato'],
          ]}
        />
        <Paragrafo>Dúvidas que este manual não responde: fale com o suporte da Livih.</Paragrafo>
      </Secao>
    </>
  )
}
