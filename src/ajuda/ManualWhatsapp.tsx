import { Caminho, Lista, Paragrafo, Secao, Subtitulo, Tabela } from './componentes'

// Manual do WhatsApp (16/11). O texto sai do que a tela faz: src/components/SecaoWhatsapp.tsx, PagamentoMeta.tsx,
// OrigemDosContatos.tsx e a faixa de número caído em Layout.tsx; das mensagens de erro da Edge Function
// whatsapp-conexao e das funções do banco (canais_sem_vaga, agente_ligar, canal_definir_origem, origem_regra_salvar);
// e de docs/equipes-origem-prospeccao.md e docs/campanhas.md. Mudou a tela ou a regra, mude aqui.
// Termos: "alerta" é a mensagem no WhatsApp; "aviso" é a notificação no aparelho.

export const SECOES_WHATSAPP = [
  { id: 'jeitos', titulo: 'Dois jeitos de conectar' },
  { id: 'de-quem', titulo: 'Número da empresa ou de vendedor' },
  { id: 'celular', titulo: 'Conectar pelo celular' },
  { id: 'oficial', titulo: 'Conectar pela API oficial' },
  { id: 'lista', titulo: 'A lista de números' },
  { id: 'configurar', titulo: 'Configurar, desconectar e remover' },
  { id: 'agente', titulo: 'Ligar e desligar o agente' },
  { id: 'distribuicao', titulo: 'Distribuir os contatos' },
  { id: 'origem', titulo: 'De onde vêm os contatos' },
  { id: 'pagamento', titulo: 'Forma de pagamento na Meta' },
  { id: 'caiu', titulo: 'Número desconectado' },
  { id: 'limite', titulo: 'Limite de números do plano' },
  { id: 'problemas', titulo: 'Problemas comuns' },
]

const titulo = (id: string) => SECOES_WHATSAPP.find((s) => s.id === id)!.titulo

export function ManualWhatsapp() {
  return (
    <>
      <Paragrafo>
        Em <Caminho>Configurações → WhatsApp</Caminho> ficam os números que atendem os clientes na Livih: como conectar
        cada um, de quem é, onde o agente atende e para quem vão os contatos. Só dono e admin conectam, configuram e
        removem números. As outras pessoas veem a lista e a situação de cada número.
      </Paragrafo>

      <Secao id="jeitos" titulo={titulo('jeitos')}>
        <Tabela
          colunas={['Jeito', 'Como funciona', 'Quando usar']}
          linhas={[
            [
              'Pelo celular (QR code)',
              'A Livih entra como um aparelho conectado ao WhatsApp do celular, como o WhatsApp Web. O celular continua funcionando',
              'Para começar rápido e para os números dos vendedores. Não faz campanha',
            ],
            [
              'API oficial',
              'O número é ligado à Meta pela conta do WhatsApp Business da empresa. A Meta cobra a empresa direto pelas campanhas e pelas mensagens por modelo',
              'Para o número principal da empresa e para mandar campanhas',
            ],
          ]}
        />
        <Paragrafo>
          Campanha só sai por número da API oficial: mandar para muitos contatos de uma vez por número conectado pelo
          celular é o que mais leva a WhatsApp bloqueado. Já a aba <Caminho>Agenda do celular</Caminho>, na nova conversa,
          só existe nos números conectados pelo celular.
        </Paragrafo>
        <Paragrafo>
          Um número conectado pelo celular pode passar para a API oficial depois, sem perder as conversas. Veja{' '}
          <Caminho>{titulo('oficial')}</Caminho>.
        </Paragrafo>
      </Secao>

      <Secao id="de-quem" titulo={titulo('de-quem')}>
        <Paragrafo>
          Cada número tem o campo <Caminho>De quem é este número</Caminho>. Ele diz quem vê as conversas:
        </Paragrafo>
        <Lista
          itens={[
            <>
              <Caminho>Da empresa:</Caminho> toda a equipe vê as conversas. É o número que pode distribuir os contatos
              entre os vendedores.
            </>,
            <>
              <Caminho>De um vendedor:</Caminho> só o vendedor do número, o gestor da equipe dele, o dono e os admins veem.
              Os clientes que escrevem nele ficam com esse vendedor.
            </>,
          ]}
        />
        <Paragrafo>
          Use o número da empresa para o atendimento geral (site, anúncio, loja) e o número de vendedor para o celular de
          trabalho de cada um. O agente usa as mesmas instruções e a mesma base em todos os números.
        </Paragrafo>
      </Secao>

      <Secao id="celular" titulo={titulo('celular')}>
        <Paragrafo>Tenha em mãos o celular do número que vai conectar.</Paragrafo>
        <Lista
          numerada
          itens={[
            <>
              Clique em <Caminho>Adicionar número</Caminho> (sem nenhum número ainda, o botão é{' '}
              <Caminho>Conectar o número da empresa</Caminho>).
            </>,
            <>
              Dê um <Caminho>Nome do número</Caminho>, como “Comercial – Ana”, e escolha{' '}
              <Caminho>De quem é este número</Caminho>. No número da empresa, preencha também a{' '}
              <Caminho>Origem dos contatos deste número</Caminho>, se ele for do site ou de um anúncio.
            </>,
            <>
              Clique em <Caminho>Adicionar e conectar</Caminho>. O número aparece na lista com “Aguardando o celular ser
              conectado” e o QR code embaixo.
            </>,
            <>
              No celular, abra o WhatsApp e toque em <Caminho>⋮</Caminho> (Android) ou <Caminho>Configurações</Caminho>{' '}
              (iPhone) → <Caminho>Dispositivos conectados</Caminho> → <Caminho>Conectar dispositivo</Caminho>.
            </>,
            'Aponte a câmera para o QR code. Ele se renova sozinho. Em instantes, a lista mostra “Conectado” e o telefone.',
          ]}
        />
        <Paragrafo>
          O agente começa desligado no número novo. Ligue quando quiser que ele atenda (veja{' '}
          <Caminho>{titulo('agente')}</Caminho>).
        </Paragrafo>
        <Subtitulo>Pelo código, sem ler o QR code</Subtitulo>
        <Paragrafo>
          Para quem está com a Livih aberta no próprio celular do número, que não consegue ler o QR code com a câmera:
        </Paragrafo>
        <Lista
          numerada
          itens={[
            <>Na área do QR code, toque em <Caminho>Usar código</Caminho>.</>,
            <>
              Digite o <Caminho>Número do celular</Caminho> com DDD, como (41) 99999-8888, e toque em{' '}
              <Caminho>Gerar código</Caminho>.
            </>,
            <>
              No WhatsApp: <Caminho>Dispositivos conectados</Caminho> → <Caminho>Conectar dispositivo</Caminho> →{' '}
              <Caminho>Conectar com número de telefone</Caminho> → digite o código que aparece na Livih.
            </>,
          ]}
        />
        <Subtitulo>Conectar de novo</Subtitulo>
        <Paragrafo>
          Número desconectado mostra o botão <Caminho>Conectar celular</Caminho> na lista. Clique e siga os mesmos passos.
          As conversas antigas continuam.
        </Paragrafo>
      </Secao>

      <Secao id="oficial" titulo={titulo('oficial')}>
        <Paragrafo>
          Antes, tenha o acesso ao Facebook que administra o portfólio da empresa na Meta. A janela da Meta abre com a
          conta de quem clica.
        </Paragrafo>
        <Subtitulo>Número novo na Livih</Subtitulo>
        <Lista
          numerada
          itens={[
            <>Clique em <Caminho>Conectar pela API oficial</Caminho>.</>,
            'Na janela da Meta, entre com o portfólio da empresa e escolha a conta e o número do WhatsApp Business.',
            'No fim, o número aparece na lista com “Conectado pela API oficial”.',
          ]}
        />
        <Paragrafo>
          O número entra como da empresa, com o nome que está na Meta, e com o agente desligado. Para mudar o nome ou
          passar para um vendedor, use <Caminho>Configurar</Caminho>.
        </Paragrafo>
        <Subtitulo>Passar um número do celular para a API oficial</Subtitulo>
        <Lista
          numerada
          itens={[
            <>
              No número, clique em <Caminho>Configurar</Caminho> e, em <Caminho>Conexão</Caminho>, em{' '}
              <Caminho>Passar para a API oficial</Caminho>.
            </>,
            <>Confirme em <Caminho>Conectar com a Meta</Caminho>.</>,
            'Na janela da Meta, entre com o portfólio da empresa e escolha conectar o app WhatsApp Business que já existe.',
          ]}
        />
        <Paragrafo>
          O número continua o mesmo na Livih, com as mesmas conversas, e não ocupa outra vaga do plano. O celular continua
          funcionando: a lista mostra “API oficial, também no app do celular”.{' '}
          <strong className="text-texto">Os aparelhos conectados (WhatsApp Web) se desconectam nessa hora.</strong>
        </Paragrafo>
        <Paragrafo>
          Depois de conectar pela API oficial, cadastre a forma de pagamento na Meta (veja{' '}
          <Caminho>{titulo('pagamento')}</Caminho>).
        </Paragrafo>
      </Secao>

      <Secao id="lista" titulo={titulo('lista')}>
        <Paragrafo>Cada número ocupa uma linha, com:</Paragrafo>
        <Lista
          itens={[
            'o nome e as etiquetas, como “Origem: Site” ou “Distribui contatos · Televendas”;',
            'de quem é: “Da empresa · toda a equipe vê”, “Seu número” ou “De Ana”, com a equipe do vendedor e “API oficial” quando for o caso;',
            'a situação da conexão;',
            'o agente ligado ou desligado e, para dono e admin, o botão Configurar.',
          ]}
        />
        <Subtitulo>A situação</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'O que quer dizer']}
          linhas={[
            ['Conectado · (41) 99999-8888', 'Funcionando. Mostra desde quando'],
            ['Aguardando o celular ser conectado', 'Falta ler o QR code ou digitar o código'],
            ['Iniciando a conexão…', 'A Livih está preparando a conexão. Espere alguns segundos'],
            ['Caiu há 10 minutos', 'O número saiu do ar sem ninguém desconectar. Ninguém recebe as mensagens dele'],
            ['Desconectado pela equipe', 'Alguém clicou em Desconectar'],
            ['Servidor do WhatsApp fora do ar', 'Problema do lado da Livih. Se continuar, avise o suporte'],
          ]}
        />
        <Paragrafo>
          A partir de 6 números, aparecem a busca (por nome, vendedor ou telefone) e o filtro: desconectados, da empresa,
          de vendedores ou de uma equipe.
        </Paragrafo>
      </Secao>

      <Secao id="configurar" titulo={titulo('configurar')}>
        <Paragrafo>
          Em cada número, clique em <Caminho>Configurar</Caminho> (dono e admin). Na janela:
        </Paragrafo>
        <Lista
          itens={[
            <><Caminho>Nome do número</Caminho>: como ele aparece na Livih.</>,
            <>
              <Caminho>De quem é este número</Caminho>: da empresa ou de um vendedor (veja{' '}
              <Caminho>{titulo('de-quem')}</Caminho>).
            </>,
            <>
              <Caminho>Origem dos contatos deste número</Caminho> (veja <Caminho>{titulo('origem')}</Caminho>).
            </>,
            <>
              <Caminho>Distribuir os contatos entre a equipe</Caminho>, só no número da empresa (veja{' '}
              <Caminho>{titulo('distribuicao')}</Caminho>).
            </>,
          ]}
        />
        <Paragrafo>
          Clique em <Caminho>Salvar</Caminho> para gravar. Em <Caminho>Conexão</Caminho>, no fim da janela, ficam os
          botões abaixo. Cada um pede confirmação.
        </Paragrafo>
        <Tabela
          colunas={['Botão', 'O que faz']}
          linhas={[
            [
              'Desconectar',
              'Tira a Livih do celular do número. Nada entra ou sai por ele até alguém conectar de novo. Não libera a vaga do plano. Só nos números conectados pelo celular',
            ],
            [
              'Remover número',
              'O número sai da Livih e o agente dele desliga. As conversas antigas continuam no histórico. Libera a vaga do plano',
            ],
            ['Passar para a API oficial', 'Veja Conectar pela API oficial'],
          ]}
        />
        <Paragrafo>
          Número da API oficial não tem Desconectar: para tirar da Livih, use <Caminho>Remover número</Caminho>.
        </Paragrafo>
      </Secao>

      <Secao id="agente" titulo={titulo('agente')}>
        <Paragrafo>
          O agente de IA liga e desliga por número, no botão <Caminho>Agente ligado</Caminho> /{' '}
          <Caminho>Agente desligado</Caminho> da lista. As instruções e a base de conhecimento são as mesmas para todos os
          números.
        </Paragrafo>
        <Lista
          itens={[
            <><Caminho>Dono e admin:</Caminho> ligam e desligam em qualquer número.</>,
            <>
              <Caminho>Gestor da equipe:</Caminho> liga e desliga no número dele e nos números dos vendedores da equipe
              dele. Os números da empresa ficam com o dono e os admins.
            </>,
            'As outras pessoas só veem se o agente está ligado.',
          ]}
        />
        <Paragrafo>
          Com o agente desligado, as mensagens do número chegam direto para a equipe atender.
        </Paragrafo>
      </Secao>

      <Secao id="distribuicao" titulo={titulo('distribuicao')}>
        <Paragrafo>
          No número da empresa, a Livih pode escolher sozinha qual vendedor atende cada cliente. Quem recebe ganha um aviso
          no celular. O agente continua atendendo até chamar a equipe.
        </Paragrafo>
        <Lista
          numerada
          itens={[
            <>
              No número da empresa, clique em <Caminho>Configurar</Caminho> e marque{' '}
              <Caminho>Distribuir os contatos entre a equipe</Caminho>.
            </>,
            <>
              Se a empresa tem equipes de venda, escolha a <Caminho>Equipe que recebe</Caminho> os contatos deste número
              (por exemplo, o número do site para a equipe Televendas). Para usar todos os vendedores, deixe em{' '}
              <Caminho>Todos marcados com “Recebe contatos novos”</Caminho>.
            </>,
            <>Clique em <Caminho>Salvar</Caminho>. A lista mostra a etiqueta “Distribui contatos”.</>,
            <>
              Em <Caminho>Configurações → Equipe</Caminho>, marque <Caminho>Recebe contatos novos</Caminho> em cada
              vendedor que entra na distribuição. Sem ninguém marcado, nada é distribuído.
            </>,
          ]}
        />
        <Paragrafo>
          A equipe que recebe vale quando ninguém atendeu esse cliente no período escolhido e a cidade dele não tem
          equipe. A ordem completa da escolha, as cidades de cada equipe e o período estão no manual da Equipe, em “Como a
          Livih escolhe o vendedor”.
        </Paragrafo>
        <Paragrafo>
          Número de vendedor não distribui: o cliente fica com o vendedor do número. Se um número da empresa passa a ser
          de um vendedor, a distribuição dele desliga.
        </Paragrafo>
      </Secao>

      <Secao id="origem" titulo={titulo('origem')}>
        <Paragrafo>
          A Livih anota de onde veio cada contato (site, anúncio, campanha) e mostra no Painel, no bloco{' '}
          <Caminho>De onde vêm os contatos</Caminho>. A origem é anotada na primeira mensagem depois de 30 dias sem
          conversa com a empresa, em qualquer número.
        </Paragrafo>
        <Paragrafo>
          <strong className="text-texto">Marque a origem antes de divulgar o número.</strong> A origem não vale para trás:
          quem escreveu antes fica sem origem. No número do site ou do anúncio, preencha a origem já na janela{' '}
          <Caminho>Adicionar número</Caminho>, antes de ler o QR code. Na API oficial, abra <Caminho>Configurar</Caminho>{' '}
          logo depois de conectar.
        </Paragrafo>
        <Subtitulo>Origem do número</Subtitulo>
        <Paragrafo>
          Para o número usado só num lugar, como o número do Google Ads. Preencha{' '}
          <Caminho>Origem dos contatos deste número</Caminho> ao adicionar o número ou depois, em{' '}
          <Caminho>Configurar</Caminho> (até 60 letras; há sugestões como Site, Google Ads e Instagram). Deixe em branco
          se o número não tem uma origem só.
        </Paragrafo>
        <Subtitulo>Origem pela mensagem pronta</Subtitulo>
        <Paragrafo>
          Para quando o botão do site ou de um anúncio abre o WhatsApp com uma mensagem pronta, como “Olá, vim pelo site”.
          Vale em qualquer número.
        </Paragrafo>
        <Lista
          numerada
          itens={[
            <>No alto da tela, abra <Caminho>Origem pela mensagem pronta</Caminho>.</>,
            <>
              Em <Caminho>Se a primeira mensagem tiver</Caminho>, escreva um trecho da mensagem pronta (de 3 a 100
              letras).
            </>,
            <>Em <Caminho>a origem é</Caminho>, escreva a origem, como “Site”.</>,
            <>Clique em <Caminho>Adicionar</Caminho>.</>,
          ]}
        />
        <Paragrafo>
          Não importa acento nem maiúscula. Se duas regras servem, vence a de texto mais longo. A regra vale mais que a
          origem do número.
        </Paragrafo>
        <Subtitulo>O que mais conta</Subtitulo>
        <Lista
          itens={[
            'Se a primeira mensagem foi de uma campanha, a origem é “Campanha”.',
            'Se foi a equipe que escreveu primeiro, a origem é “Prospecção ativa”.',
            'Sem regra e sem origem no número, o Painel mostra “Direto no WhatsApp”.',
          ]}
        />
        <Paragrafo>
          Por isso, “Campanha”, “Prospecção ativa” e “Direto no WhatsApp” não podem ser usados como origem.
        </Paragrafo>
      </Secao>

      <Secao id="pagamento" titulo={titulo('pagamento')}>
        <Paragrafo>
          No número da API oficial, a Meta cobra direto da sua empresa as campanhas e as mensagens por modelo fora das 24
          horas. Esse valor não entra na fatura da Livih. Sem cartão na Meta, essas mensagens são recusadas. Responder
          quem escreveu nas últimas 24 horas continua grátis.
        </Paragrafo>
        <Paragrafo>
          Até você confirmar, o número mostra o quadro “Cadastre a forma de pagamento na Meta.”. Para cadastrar:
        </Paragrafo>
        <Lista
          numerada
          itens={[
            'Entre em business.facebook.com com o Facebook usado para conectar o número.',
            <>Vá em <Caminho>Configurações → Cobrança e pagamentos</Caminho>.</>,
            <>
              Escolha a conta do WhatsApp Business (não a de anúncios) e toque em{' '}
              <Caminho>Adicionar forma de pagamento</Caminho>.
            </>,
            <>
              Volte à Livih e clique em <Caminho>Já cadastrei</Caminho> (dono e admin). O quadro some.
            </>,
          ]}
        />
        <Paragrafo>
          A Livih não consegue conferir na Meta se o cartão foi cadastrado: ela confia no “Já cadastrei”. Se a Meta recusar
          uma mensagem por falta de pagamento depois disso, o quadro volta, em vermelho, e uma faixa no alto da tela avisa
          dono e admin.
        </Paragrafo>
      </Secao>

      <Secao id="caiu" titulo={titulo('caiu')}>
        <Paragrafo>
          Número conectado pelo celular pode cair, por exemplo quando alguém tira a Livih dos aparelhos conectados no
          celular ou o WhatsApp é reinstalado. Enquanto ele está fora, nenhuma mensagem entra ou sai, e o agente não responde.
        </Paragrafo>
        <Paragrafo>
          Depois de 5 minutos fora do ar, aparece uma faixa vermelha no alto de todas as telas, como “O WhatsApp “Comercial
          – Ana” está desconectado.”. Quem vê o número vê a faixa. Se o campo <Caminho>Cópia dos alertas</Caminho> estiver preenchido em{' '}
          <Caminho>Configurações → Agente</Caminho>, esse número recebe um alerta pelo WhatsApp, e outro quando o número
          volta.
        </Paragrafo>
        <Subtitulo>Como reconectar</Subtitulo>
        <Lista
          numerada
          itens={[
            <>
              Na faixa, clique em <Caminho>Reconectar</Caminho> (dono e admin). Quem não é dono nem admin vê “Avise o dono
              ou um admin.”.
            </>,
            <>No número, clique em <Caminho>Conectar celular</Caminho>.</>,
            <>Leia o QR code com o celular do número (veja <Caminho>{titulo('celular')}</Caminho>).</>,
          ]}
        />
        <Paragrafo>
          Quando alguém clica em <Caminho>Desconectar</Caminho>, a Livih não trata como queda: não há faixa nem alerta.
        </Paragrafo>
      </Secao>

      <Secao id="limite" titulo={titulo('limite')}>
        <Paragrafo>
          Cada plano permite um número de WhatsApps. Contam os números da lista, conectados ou não. Quando a empresa chega
          no limite, adicionar outro número mostra o limite do plano e o que fazer.
        </Paragrafo>
        <Lista
          itens={[
            <>
              Para liberar uma vaga, use <Caminho>Remover número</Caminho> num número que não usa.{' '}
              <Caminho>Desconectar</Caminho> não libera a vaga.
            </>,
            <>
              Para ter mais números, o dono sobe de plano em <Caminho>Configurações → Plano e consumo</Caminho>.
            </>,
            'Se uma troca para um plano menor já está marcada, vale o limite menor dos dois.',
          ]}
        />
      </Secao>

      <Secao id="problemas" titulo={titulo('problemas')}>
        <Subtitulo>Conectar</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Só dono e admin conectam, desconectam e mudam os números.”',
              'Você não é dono nem admin',
              'Peça ao dono ou a um admin',
            ],
            [
              'O QR code não aparece ou não conecta',
              'O código vence a cada poucos segundos, ou a câmera não lê',
              'Espere o código se renovar e aponte de novo, ou use “Usar código”',
            ],
            [
              '“Informe DDD + número do celular.”',
              'O número digitado em “Usar código” está incompleto',
              'Digite com DDD, como (41) 99999-8888',
            ],
            [
              '“O WhatsApp não gerou o código. Tente o QR code.”',
              'O WhatsApp não respondeu ao pedido do código',
              'Use “Ler QR code”',
            ],
            [
              '“O servidor do WhatsApp não respondeu. Tente de novo em instantes.”',
              'Falha passageira na conexão',
              'Tente de novo. Se continuar, avise o suporte da Livih',
            ],
            [
              '“O responsável precisa estar ativo na equipe.”',
              'O vendedor escolhido foi desativado',
              'Escolha outra pessoa ou reative o acesso em Configurações → Equipe',
            ],
            [
              '“O plano … permite … de WhatsApp, e a empresa já tem …”',
              'A empresa chegou no limite de números do plano',
              'Remova um número que não usa (Configurar → Remover número) ou peça ao dono para subir de plano',
            ],
          ]}
        />
        <Subtitulo>API oficial</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“O login da Meta ainda está carregando (ou foi bloqueado pelo navegador).”',
              'Um bloqueador de anúncios ou de janelas impediu o login da Meta',
              'Libere janelas para a Livih, desative o bloqueador e tente de novo',
            ],
            [
              '“Conexão cancelada antes do fim.”',
              'A janela da Meta foi fechada antes de terminar',
              'Clique de novo e vá até o fim',
            ],
            [
              '“A Meta recusou: …”',
              'A Meta não aceitou o cadastro. O motivo vem depois dos dois pontos',
              'Resolva o que a Meta diz e tente de novo',
            ],
            [
              '“A Meta recusou a conexão (o código expirou?).” ou “A Meta não informou qual conta foi conectada.”',
              'A resposta da Meta demorou ou veio incompleta',
              'Tente conectar de novo',
            ],
            [
              '“Não achamos o número nessa conta do WhatsApp.”',
              'A conta escolhida na Meta não tem o número',
              'Tente de novo e escolha a conta certa',
            ],
            [
              '“Este número já está conectado na Livih em outro lugar.”',
              'O número já está na Livih, nesta ou em outra empresa',
              'Procure o número na lista. Se ele está em outra empresa, remova lá antes',
            ],
          ]}
        />
        <Subtitulo>Agente, distribuição e origem</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Só dono, admin ou o gestor da equipe do vendedor ligam e desligam o agente deste número.”',
              'Você não pode mudar o agente desse número',
              'Peça ao dono, a um admin ou ao gestor da equipe',
            ],
            [
              '“Este número ainda não tem agente. Fale com o suporte da Livih.”',
              'O agente desse número não foi criado',
              'Fale com o suporte da Livih',
            ],
            [
              '“Não foi possível mudar o agente deste número. Tente de novo.”',
              'A conexão falhou',
              'Confira a internet e tente de novo',
            ],
            [
              '“Ninguém está marcado para receber contatos novos, então nada é distribuído.”',
              'Nenhum vendedor está com “Recebe contatos novos”',
              'Em Configurações → Equipe, clique em Editar na pessoa e marque a opção',
            ],
            [
              'Não aparece “Distribuir os contatos entre a equipe”',
              'O número é de um vendedor',
              'Em “De quem é este número”, escolha “Da empresa”',
            ],
            [
              '“Esta equipe foi removida. Recarregue a tela e escolha outra.”',
              'A equipe escolhida foi removida enquanto a janela estava aberta',
              'Recarregue a página e escolha outra equipe',
            ],
            [
              '“A origem “Campanha” é usada pela Livih.”',
              'Esse nome a Livih já usa no Painel',
              'Escolha outro nome, como “Site” ou “Google Ads”',
            ],
            [
              '“Já existe uma regra com esse texto.”',
              'Outra regra já tem esse trecho, sem diferença de acento ou maiúscula',
              'Remova a regra antiga ou use outro trecho',
            ],
          ]}
        />
        <Subtitulo>Pagamento</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“A Meta recusou mensagens deste número por falta de forma de pagamento”',
              'Não há cartão na conta do WhatsApp Business, ou ele foi recusado',
              'Cadastre ou troque o cartão na Meta e clique em Já cadastrei',
            ],
            [
              '“Quem faz isso é o dono ou o admin.”',
              'Só dono e admin confirmam a forma de pagamento',
              'Peça ao dono ou a um admin',
            ],
          ]}
        />
        <Paragrafo>Dúvidas que este manual não responde: fale com o suporte da Livih.</Paragrafo>
      </Secao>
    </>
  )
}
