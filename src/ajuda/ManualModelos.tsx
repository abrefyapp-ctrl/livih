import { Caminho, Lista, Paragrafo, Secao, Subtitulo, Tabela } from './componentes'

// Manual de Modelos (16/11). O texto sai do que a tela faz: src/components/SecaoModelos.tsx, PreviaModelo.tsx e
// ModalEnviarModelo.tsx, src/services/modelos.ts (exemplos prontos, avisos, situações), a função whatsapp-modelos
// (regras e mensagens de erro), _shared/errosMeta.ts (motivos de "Não enviada") e os usos em PainelConversa.tsx,
// ModalNovaConversa.tsx, SecaoFollowup.tsx, SecaoAvisosPedido.tsx e ModalNovaCampanha.tsx. Mudou a tela ou a regra,
// mude aqui. A criação do modelo de Marketing para campanha também aparece em ManualCampanhas.tsx.

export const SECOES_MODELOS = [
  { id: 'o-que-e', titulo: 'O que é um modelo' },
  { id: 'categorias', titulo: 'Utilidade ou Marketing' },
  { id: 'criar', titulo: 'Criar um modelo' },
  { id: 'partes', titulo: 'As partes do modelo' },
  { id: 'aprovar', titulo: 'Para a Meta aprovar' },
  { id: 'analise', titulo: 'Depois de enviar: a análise da Meta' },
  { id: 'recusado', titulo: 'Corrigir um modelo recusado' },
  { id: 'conversa', titulo: 'Usar o modelo na conversa' },
  { id: 'outros-usos', titulo: 'Campanhas, retomada e aviso de pedidos' },
  { id: 'apagar', titulo: 'Apagar um modelo' },
  { id: 'custo', titulo: 'Quanto custa' },
  { id: 'problemas', titulo: 'Problemas comuns' },
]

const titulo = (id: string) => SECOES_MODELOS.find((s) => s.id === id)!.titulo

export function ManualModelos() {
  return (
    <>
      <Paragrafo>
        Em <Caminho>Configurações → Modelos</Caminho> ficam as mensagens prontas que a Meta aprovou para os números da sua
        empresa conectados pela API oficial do WhatsApp. Com elas, a equipe e o agente escrevem para o cliente depois de 24
        horas sem resposta dele.
      </Paragrafo>

      <Secao id="o-que-e" titulo={titulo('o-que-e')}>
        <Paragrafo>
          Na API oficial, a regra é do WhatsApp: durante 24 horas depois da última mensagem do cliente, a empresa escreve
          o que quiser. Passadas as 24 horas, ou se o cliente nunca escreveu, só dá para mandar um modelo aprovado pela Meta.
          Quando o cliente responde, a conversa volta a aceitar texto livre por mais 24 horas.
        </Paragrafo>
        <Paragrafo>
          Os números conectados pelo celular (QR code) não usam modelos: eles conversam sem essa regra. Sem número na API
          oficial, a tela mostra “Nenhum número na API oficial”.
        </Paragrafo>
        <Subtitulo>Quem faz o quê</Subtitulo>
        <Lista
          itens={[
            <><Caminho>Dono e admin:</Caminho> criam e apagam modelos.</>,
            <><Caminho>Toda a equipe:</Caminho> vê a lista e envia os modelos aprovados nas conversas.</>,
          ]}
        />
        <Subtitulo>Onde o modelo fica</Subtitulo>
        <Paragrafo>
          O modelo fica na conta do WhatsApp Business do número, na Meta. A Livih lê a lista de lá cada vez que você abre a
          tela. Se a empresa tem mais de um número na API oficial, escolha o número no campo <Caminho>Número</Caminho>, no
          alto da lista. Números da mesma conta do WhatsApp Business mostram os mesmos modelos.
        </Paragrafo>
        <Paragrafo>
          Toda conta nova da Meta já vem com o modelo <Caminho>hello_world</Caminho>, em inglês, para teste. Ele aparece na
          lista, mas a Livih não oferece esse modelo para enviar a clientes.
        </Paragrafo>
      </Secao>

      <Secao id="categorias" titulo={titulo('categorias')}>
        <Paragrafo>Cada modelo tem uma categoria. Ela diz para que serve a mensagem e quanto a Meta cobra.</Paragrafo>
        <Tabela
          colunas={['Categoria', 'Quando usar']}
          linhas={[
            [
              'Utilidade',
              'Continuação de algo que o cliente pediu: retomar o atendimento, pedido pronto, orçamento enviado, lembrete. Custa menos',
            ],
            ['Marketing', 'Promoção, novidade, convite, reativar cliente. É a única categoria aceita nas campanhas'],
          ]}
        />
        <Paragrafo>
          A Meta confere o texto. Se um modelo de Utilidade tiver cara de venda (promoção, desconto, oferta), ela muda a
          categoria para Marketing e cobra como Marketing. Depois da análise, a lista mostra a categoria que valeu.
        </Paragrafo>
        <Paragrafo>
          A lista pode mostrar também a categoria Autenticação, para modelos criados direto na Meta. A Livih não cria nem
          usa esse tipo.
        </Paragrafo>
      </Secao>

      <Secao id="criar" titulo={titulo('criar')}>
        <Lista
          numerada
          itens={[
            <>
              Em <Caminho>Configurações → Modelos</Caminho>, escolha o número (se houver mais de um) e clique em{' '}
              <Caminho>Novo modelo</Caminho>.
            </>,
            'Se quiser, comece por um dos exemplos prontos (veja abaixo). Dá para mudar tudo depois.',
            'Preencha o nome, a categoria, o idioma e a mensagem. Veja cada campo em “As partes do modelo”.',
            'Escreva um exemplo para cada variável e confira a prévia, ao lado.',
            <>
              Clique em <Caminho>Enviar para a Meta aprovar</Caminho>. O modelo entra na lista como “Em análise”.
            </>,
          ]}
        />
        <Subtitulo>Os exemplos prontos</Subtitulo>
        <Tabela
          colunas={['Exemplo', 'Para quê', 'Categoria']}
          linhas={[
            ['Retomar a conversa', 'O cliente parou de responder há mais de 24 horas', 'Utilidade'],
            ['Pedido ou serviço pronto', 'Avisar que o pedido ou o equipamento está pronto', 'Utilidade'],
            ['Atualização do pedido', 'Aviso de pedidos depois de 24 horas sem o cliente escrever', 'Utilidade'],
            ['Orçamento enviado', 'Perguntar se ficou alguma dúvida sobre o orçamento', 'Utilidade'],
            ['Promoção', 'Campanha de produto ou condição especial', 'Marketing'],
            ['Reativar cliente', 'Cliente que não compra há algum tempo', 'Marketing'],
          ]}
        />
        <Paragrafo>
          Um bom primeiro modelo é o <Caminho>Retomar a conversa</Caminho>: ele serve para a equipe e para a retomada pelo
          agente.
        </Paragrafo>
      </Secao>

      <Secao id="partes" titulo={titulo('partes')}>
        <Tabela
          colunas={['Campo', 'O que pôr']}
          linhas={[
            [
              'Nome',
              'Só a equipe vê, para achar o modelo. Minúsculas, números e _, como pedido_pronto. A Livih ajusta enquanto você digita: tira acento e troca espaço por _',
            ],
            ['Categoria', 'Utilidade ou Marketing. Veja a seção anterior'],
            ['Idioma', 'Português (Brasil), Inglês (EUA) ou Espanhol. O mesmo nome pode existir em mais de um idioma'],
            ['Título (opcional)', 'Aparece em negrito no topo. Até 60 caracteres, sem variáveis'],
            ['Mensagem', 'O texto principal. Até 1.024 caracteres. *negrito* e _itálico_ funcionam'],
            ['Rodapé (opcional)', 'Texto pequeno e cinza no fim. Até 60 caracteres. Em Marketing, use para dizer como sair'],
            [
              'Botões de resposta (opcional)',
              'Até 3, com até 25 caracteres e textos diferentes. O cliente toca e a resposta chega como mensagem na conversa',
            ],
          ]}
        />
        <Subtitulo>As variáveis</Subtitulo>
        <Paragrafo>
          Variáveis são as partes que mudam a cada envio, como o nome do cliente ou o número do pedido. No texto, elas
          aparecem como {'{{1}}'}, {'{{2}}'}, {'{{3}}'}. Clique em <Caminho>+ Variável</Caminho> para pôr a próxima onde
          está o cursor.
        </Paragrafo>
        <Paragrafo>
          Para cada variável, a tela pede um exemplo, como “Maria” ou “1234”. É obrigatório: a Meta usa os exemplos para
          entender a mensagem. O cliente nunca vê o exemplo. Na hora de enviar, quem envia escolhe o valor de verdade.
        </Paragrafo>
        <Subtitulo>A prévia</Subtitulo>
        <Paragrafo>
          Ao lado do formulário, a prévia mostra como a mensagem chega no WhatsApp: o título, o texto com os exemplos no
          lugar das variáveis, o rodapé e os botões.
        </Paragrafo>
      </Secao>

      <Secao id="aprovar" titulo={titulo('aprovar')}>
        <Lista
          itens={[
            'Diga quem está escrevendo e por quê, num tom de conversa.',
            'Não comece nem termine a mensagem com uma variável.',
            'Não ponha duas variáveis seguidas, sem texto entre elas.',
            'Numere as variáveis em sequência: {{1}}, {{2}}, {{3}}.',
            'Escreva texto fixo suficiente em volta das variáveis.',
            'Evite letras maiúsculas em excesso, muitos emojis e promessas exageradas.',
            'Em Marketing, ofereça um jeito de sair, como “Responda SAIR para não receber mais”.',
          ]}
        />
        <Paragrafo>
          Enquanto você escreve, a janela mostra o quadro <Caminho>Antes de enviar, confira:</Caminho> com o que costuma
          levar à recusa. O quadro não impede o envio: quem decide é a Meta. Mas evita esperar por uma recusa que já dava
          para prever.
        </Paragrafo>
        <Paragrafo>
          Alguns erros a Livih nem deixa enviar, como a mensagem começar ou terminar com uma variável ou faltar um exemplo.
          A mensagem aparece em vermelho na janela.
        </Paragrafo>
      </Secao>

      <Secao id="analise" titulo={titulo('analise')}>
        <Paragrafo>
          Depois de enviado, o modelo passa pela análise da Meta, que costuma levar de minutos a algumas horas. Com a tela
          aberta, a lista se atualiza sozinha a cada 30 segundos enquanto houver modelo em análise.
        </Paragrafo>
        <Tabela
          colunas={['Situação', 'O que quer dizer', 'Dá para enviar?']}
          linhas={[
            ['Em análise', 'A Meta ainda está conferindo', 'Ainda não'],
            ['Aprovado', 'Pronto para usar', 'Sim'],
            ['Recusado', 'A Meta não aceitou. O motivo aparece embaixo do texto', 'Não. Veja a próxima seção'],
            ['Em recurso', 'Alguém pediu à Meta para rever a recusa', 'Ainda não'],
            [
              'Pausado pela Meta',
              'Muitos clientes bloquearam ou denunciaram a mensagem. A Meta pausa para proteger o número',
              'Não, enquanto estiver pausado',
            ],
            ['Desativado pela Meta', 'A Meta tirou o modelo de uso', 'Não'],
          ]}
        />
        <Paragrafo>
          Só os modelos aprovados aparecem para escolher na conversa, nas campanhas, na retomada e no aviso de pedidos.
        </Paragrafo>
        <Paragrafo>
          A Livih não edita modelos. Para mudar o texto, crie outro modelo com outro nome.
        </Paragrafo>
      </Secao>

      <Secao id="recusado" titulo={titulo('recusado')}>
        <Paragrafo>
          O modelo recusado mostra <Caminho>Motivo da Meta:</Caminho> embaixo do texto. Os mais comuns:
        </Paragrafo>
        <Tabela
          colunas={['O que aparece', 'O que fazer']}
          linhas={[
            [
              '“o formato não foi aceito…”',
              'Confira as variáveis: {{1}}, {{2}} na ordem, sem duas coladas, sem começar ou terminar o texto com uma delas, e com exemplo em todas',
            ],
            [
              '“o texto não combina com a categoria escolhida…”',
              'Crie de novo na categoria certa. Oferta ou desconto vai em Marketing',
            ],
            [
              '“a Meta considerou o texto promocional e fora das regras dela…”',
              'Reescreva com menos apelo de venda ou use a categoria Marketing',
            ],
            [
              '“o texto vai contra as regras da Meta…”',
              'Reescreva sem a parte proibida ou ofensiva',
            ],
            [
              '“a Meta achou que o texto pode enganar o cliente…”',
              'Reescreva de forma clara e direta, sem promessa exagerada, prêmio ou link suspeito',
            ],
            [
              '“essa categoria não está disponível para o país do número.”',
              'Escolha outra categoria',
            ],
          ]}
        />
        <Paragrafo>Um motivo fora desta lista aparece com o código que a Meta mandou.</Paragrafo>
        <Subtitulo>Como corrigir</Subtitulo>
        <Lista
          numerada
          itens={[
            'Leia o motivo e ajuste o texto (ou a categoria).',
            <>
              Clique em <Caminho>Novo modelo</Caminho> e crie de novo com <strong className="text-texto">outro nome</strong>,
              como retomar_conversa_2. O nome recusado continua ocupado.
            </>,
            'Se quiser, apague o recusado, para a lista ficar limpa.',
          ]}
        />
        <Paragrafo>
          A Livih não tem botão para pedir revisão da recusa. Esse pedido é feito na própria Meta, no Gerenciador do
          WhatsApp. Enquanto a Meta revisa, o modelo aparece como “Em recurso”.
        </Paragrafo>
      </Secao>

      <Secao id="conversa" titulo={titulo('conversa')}>
        <Paragrafo>
          Numa conversa de número da API oficial, passadas 24 horas da última mensagem do cliente, a caixa de texto dá lugar
          à mensagem “Faz mais de 24 horas que (nome do cliente) escreveu…” e ao botão <Caminho>Enviar modelo</Caminho>.
        </Paragrafo>
        <Lista
          numerada
          itens={[
            <>Clique em <Caminho>Enviar modelo</Caminho>.</>,
            <>Em <Caminho>Modelo</Caminho>, escolha um dos aprovados. Cada um aparece com o nome e a categoria.</>,
            <>
              Preencha cada <Caminho>Variável</Caminho>. A {'{{1}}'} já vem com o nome do contato: troque se ela for outra
              coisa no seu modelo.
            </>,
            <>Confira a prévia e clique em <Caminho>Enviar</Caminho>.</>,
          ]}
        />
        <Paragrafo>
          Ao enviar, a conversa passa para a equipe (fica com você, se ninguém atendia), e o agente para de responder
          nela. No histórico, a mensagem aparece como o cliente leu, com as variáveis preenchidas.
        </Paragrafo>
        <Paragrafo>
          Dentro das 24 horas, o botão continua ao lado da caixa de texto, só com o ícone. Mas aí não precisa de modelo:
          escreva normalmente.
        </Paragrafo>
        <Subtitulo>Começar uma conversa nova</Subtitulo>
        <Paragrafo>
          Em <Caminho>Nova conversa</Caminho>, num número da API oficial, o botão é{' '}
          <Caminho>Abrir e escolher o modelo</Caminho>: a conversa abre já com a janela Enviar modelo. Para quem não
          escreveu nas últimas 24 horas, a primeira mensagem precisa ser um modelo.
        </Paragrafo>
      </Secao>

      <Secao id="outros-usos" titulo={titulo('outros-usos')}>
        <Tabela
          colunas={['Onde', 'Que modelo aceita']}
          linhas={[
            [
              'Vendas → Campanhas',
              'Só Marketing aprovado, com título só de texto, sem variável. Veja o manual Campanhas',
            ],
            [
              'Configurações → Agente, em “Retomar o cliente que parou de responder”',
              'Utilidade ou Marketing aprovado, com título só de texto, sem variável. Sem modelo, depois de 24 horas a retomada vira tarefa para o vendedor',
            ],
            [
              'Configurações → Aviso de pedidos (com o ERP)',
              'Utilidade ou Marketing aprovado, com título só de texto, sem variável. Sem modelo, depois de 24 horas o aviso não sai e o pedido mostra o motivo',
            ],
          ]}
        />
        <Paragrafo>
          Nesses lugares, você escolhe uma vez de onde vem cada variável (o nome ou a empresa do contato, um texto fixo e,
          no aviso de pedidos, o número e a situação do pedido), e a Livih preenche a cada envio. Os exemplos prontos “Retomar a
          conversa” e “Atualização do pedido” já vêm com as variáveis na ordem que essas telas esperam.
        </Paragrafo>
      </Secao>

      <Secao id="apagar" titulo={titulo('apagar')}>
        <Paragrafo>
          Na lista, clique em <Caminho>Apagar</Caminho> no modelo e confirme em <Caminho>Apagar modelo</Caminho>. Só dono e
          admin veem esse botão.
        </Paragrafo>
        <Lista
          itens={[
            'O modelo sai da conta do WhatsApp em todos os idiomas com esse nome.',
            'A Meta não deixa usar o mesmo nome de novo por 30 dias. Para recriar, use outro nome.',
            'As mensagens já enviadas continuam nas conversas.',
            'Se o modelo estava escolhido na retomada, no aviso de pedidos ou numa campanha, troque lá por outro aprovado.',
          ]}
        />
      </Secao>

      <Secao id="custo" titulo={titulo('custo')}>
        <Paragrafo>
          Criar o modelo não custa nada. A Meta cobra pelos modelos entregues: os de Marketing sempre; os de Utilidade, só
          fora das 24 horas. A cobrança vai direto para a conta do WhatsApp Business da sua empresa e não entra na fatura
          da Livih. Responder com texto livre quem escreveu nas últimas 24 horas não tem custo da Meta.
        </Paragrafo>
        <Paragrafo>
          Utilidade custa menos que Marketing. Se a Meta mudar o modelo para Marketing, cobra como Marketing. A tabela de
          preços está na página de preços do WhatsApp Business, da Meta.
        </Paragrafo>
        <Paragrafo>
          <strong className="text-texto">Sem forma de pagamento na Meta, o modelo não chega.</strong> A Meta aceita o envio
          e depois recusa. Para cadastrar o cartão, siga o passo a passo em <Caminho>Configurações → WhatsApp</Caminho>, no
          número, e depois clique em <Caminho>Já cadastrei</Caminho>.
        </Paragrafo>
      </Secao>

      <Secao id="problemas" titulo={titulo('problemas')}>
        <Subtitulo>Na lista de modelos</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Nenhum número na API oficial”',
              'A empresa só tem números conectados pelo celular (QR code)',
              'Conecte um número em Configurações → WhatsApp → Conectar pela API oficial',
            ],
            ['Não vejo Novo modelo nem Apagar', 'Só dono e admin criam e apagam', 'Peça ao dono ou a um admin'],
            [
              '“O acesso ao WhatsApp oficial expirou. Conecte o número de novo em Configurações → WhatsApp.”',
              'A permissão dada à Livih na Meta venceu ou foi tirada',
              'Conecte o número de novo em Configurações → WhatsApp',
            ],
            [
              '“Não foi possível falar com a Meta. Tente de novo.” ou “Algo deu errado ao falar com a Meta. Tente de novo.”',
              'A Meta não respondeu a tempo, ou a conexão falhou',
              'Recarregue a tela. Se continuar, fale com o suporte da Livih',
            ],
            [
              'O modelo está “Em análise” há muito tempo',
              'A análise é da Meta, e a Livih não acelera',
              'Espere. Com a tela aberta, a lista se atualiza sozinha',
            ],
          ]}
        />
        <Subtitulo>Ao criar</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Já existe um modelo com esse nome e idioma.”',
              'O nome já está em uso, mesmo num modelo recusado',
              'Use outro nome, como pedido_pronto_2',
            ],
            [
              '“A Meta ainda está apagando um modelo com esse nome. Use outro nome ou espere alguns minutos.”',
              'Esse nome foi apagado há pouco',
              'Use outro nome. A Meta segura o nome apagado por até 30 dias',
            ],
            [
              '“O texto não pode começar nem terminar com uma variável.”',
              'A mensagem abre ou fecha com {{n}}',
              'Escreva texto antes da primeira e depois da última variável',
            ],
            [
              '“As variáveis precisam ser {{1}}, {{2}}, {{3}}… em sequência.”',
              'Pulou um número, como {{1}} e {{3}}',
              'Renumere as variáveis em ordem',
            ],
            [
              '“Há variáveis demais para o tamanho do texto. Escreva mais texto em volta delas.”',
              'Pouco texto fixo para tantas variáveis',
              'Escreva mais palavras fixas ou use menos variáveis',
            ],
            [
              '“Preencha um exemplo para cada variável. A Meta usa os exemplos para aprovar o modelo.”',
              'Faltou o exemplo de alguma variável',
              'Preencha os exemplos embaixo da mensagem',
            ],
            [
              '“A Meta recusou: …”',
              'A Meta não aceitou o modelo e explicou o motivo',
              'Leia o motivo, ajuste e envie de novo',
            ],
          ]}
        />
        <Subtitulo>Na conversa</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Este número ainda não tem modelo aprovado pela Meta.”',
              'Nenhum modelo aprovado nesse número, ou todos ainda em análise',
              'Crie um em Configurações → Modelos e espere a aprovação',
            ],
            [
              'O modelo não aparece para escolher',
              'Está em análise, recusado, pausado ou desativado, ou é o hello_world',
              'Confira a situação em Configurações → Modelos',
            ],
            [
              '“Preencha todas as variáveis do modelo.”',
              'Alguma variável ficou em branco',
              'Preencha todas e envie de novo',
            ],
            [
              '“O modelo não foi enviado. Confira a internet e tente de novo.”',
              'O envio não chegou à Livih, quase sempre por falha na conexão',
              'Confira a internet e tente de novo',
            ],
          ]}
        />
        <Subtitulo>Mensagem com “Não enviada”</Subtitulo>
        <Paragrafo>Embaixo da mensagem aparece o motivo. Os mais comuns com modelo:</Paragrafo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Falta a forma de pagamento na conta do WhatsApp Business. Veja o passo a passo em Configurações → WhatsApp, no número.”',
              'A Meta não tem um cartão para cobrar',
              'Cadastre o cartão (veja “Quanto custa”) e envie de novo',
            ],
            [
              '“O modelo foi pausado pela Meta por baixa qualidade.” ou “O modelo foi desativado pela Meta.”',
              'Muitos clientes bloquearam ou denunciaram a mensagem',
              'Use outro modelo aprovado. Reveja o texto e para quem ele vai',
            ],
            [
              '“Esse modelo não existe (ou não neste idioma) na conta do WhatsApp…”',
              'O modelo foi apagado depois de escolhido',
              'Escolha outro modelo aprovado. Na retomada e no aviso de pedidos, escolha o novo modelo na tela deles e salve',
            ],
          ]}
        />
        <Paragrafo>Dúvidas que este manual não responde: fale com o suporte da Livih.</Paragrafo>
      </Secao>
    </>
  )
}
