import { Caminho, Lista, Paragrafo, Secao, Subtitulo, Tabela } from './componentes'

// Manual de Notificações (16/11). O texto sai do que o código faz: a tela (src/components/SecaoNotificacoes.tsx e
// src/services/notificacoes.ts), o "Instalar app" e a ajuda do iPhone (src/components/Layout.tsx, src/pwa.ts), o
// telefone de "Seus dados" (MeusDados.tsx) e quem recebe cada aviso no banco (migrations 20261009160000,
// 20261020130000, 20261105130000, 20261106140000, 20261113120000 e 20261116150000). Mudou a tela ou a regra de quem
// recebe, mude aqui também.

export const SECOES_NOTIFICACOES = [
  { id: 'o-que-sao', titulo: 'O que são as notificações' },
  { id: 'ativar', titulo: 'Como ativar' },
  { id: 'avisos', titulo: 'Quais avisos chegam' },
  { id: 'cliente-aguardando', titulo: 'Quem recebe o aviso de cliente aguardando' },
  { id: 'whatsapp', titulo: 'Alertas pelo WhatsApp' },
  { id: 'ausencia', titulo: 'Férias e folgas' },
  { id: 'problemas', titulo: 'Problemas comuns' },
]

const titulo = (id: string) => SECOES_NOTIFICACOES.find((s) => s.id === id)!.titulo

export function ManualNotificacoes() {
  return (
    <>
      <Paragrafo>
        As notificações avisam você no celular ou no computador quando um cliente precisa da equipe, sem precisar ficar
        com a Livih aberta na tela. Elas valem por aparelho: ative em cada um que você usa.
      </Paragrafo>

      <Secao id="o-que-sao" titulo={titulo('o-que-sao')}>
        <Paragrafo>
          A notificação é o aviso que aparece na tela do aparelho, como o de qualquer outro aplicativo. Ela mostra o nome
          do cliente e o começo da mensagem. Ao tocar nela, a Livih abre direto na conversa (ou na Agenda, nas Tarefas ou
          em Produtos, conforme o aviso).
        </Paragrafo>
        <Lista
          itens={[
            'No celular Android, o aviso chega mesmo com a Livih fechada.',
            'No computador, o aviso chega com o navegador aberto, mesmo sem a aba da Livih.',
            'No iPhone, só funciona com a Livih instalada na tela de início (veja “Como ativar”).',
            'Várias mensagens seguidas da mesma conversa viram um aviso só, atualizado com a última.',
          ]}
        />
        <Paragrafo>
          A tela fica em <Caminho>Configurações → Notificações</Caminho>. Qualquer pessoa da equipe pode ativar.
        </Paragrafo>
      </Secao>

      <Secao id="ativar" titulo={titulo('ativar')}>
        <Subtitulo>No computador e no celular Android</Subtitulo>
        <Lista
          numerada
          itens={[
            <>Abra <Caminho>Configurações → Notificações</Caminho>.</>,
            <>Clique em <Caminho>Ativar notificações</Caminho>.</>,
            <>O navegador pergunta se a Livih pode mostrar notificações. Escolha <Caminho>Permitir</Caminho>.</>,
            <>Aparece “Notificações ativas neste aparelho”. Clique em <Caminho>Enviar teste</Caminho>: o aviso de teste chega em alguns segundos.</>,
          ]}
        />
        <Paragrafo>
          Use o Chrome, o Edge ou o Safari atualizados. Se o navegador oferecer, aparece o botão{' '}
          <Caminho>Instalar app</Caminho>, no alto da tela (no celular, só o ícone de seta para baixo): ele põe a Livih com ícone
          próprio no aparelho. No computador e no Android, instalar é opcional.
        </Paragrafo>

        <Subtitulo>No iPhone</Subtitulo>
        <Paragrafo>
          No iPhone, as notificações só funcionam com a Livih instalada na tela de início. Antes disso, a tela de
          Notificações mostra só esse aviso, sem o botão de ativar.
        </Paragrafo>
        <Lista
          numerada
          itens={[
            <>Abra a Livih no <Caminho>Safari</Caminho>.</>,
            <>Toque em <Caminho>Compartilhar</Caminho> (o quadrado com a seta para cima).</>,
            <>Escolha <Caminho>Adicionar à Tela de Início</Caminho> e confirme em <Caminho>Adicionar</Caminho>.</>,
            'Feche o Safari e abra a Livih pelo ícone novo na tela de início. Entre com seu e-mail e senha, se ela pedir.',
            <>Vá em <Caminho>Configurações → Notificações</Caminho>, toque em <Caminho>Ativar notificações</Caminho> e permita.</>,
            <>Toque em <Caminho>Enviar teste</Caminho> para conferir.</>,
          ]}
        />
        <Paragrafo>
          O botão <Caminho>Instalar app</Caminho>, no alto da tela (no celular, só o ícone de seta para baixo), mostra esses mesmos
          passos.
        </Paragrafo>

        <Subtitulo>Para desligar</Subtitulo>
        <Paragrafo>
          Em <Caminho>Configurações → Notificações</Caminho>, clique em <Caminho>Desativar neste aparelho</Caminho>. Os
          outros aparelhos continuam recebendo.
        </Paragrafo>
        <Paragrafo>
          Ao clicar em <Caminho>Sair</Caminho>, a Livih desliga as notificações daquele aparelho, para quem usar depois
          não ver os seus avisos. Quando entrar de novo, ative outra vez. Se outra pessoa entrar no mesmo aparelho e
          ativar, o aparelho passa a receber só os avisos dela.
        </Paragrafo>
      </Secao>

      <Secao id="avisos" titulo={titulo('avisos')}>
        <Paragrafo>Cada aviso vai só para quem precisa dele.</Paragrafo>
        <Tabela
          colunas={['Aviso', 'Quando chega', 'Quem recebe']}
          linhas={[
            [
              '“Fulano aguarda atendimento”',
              'A conversa passa do agente para a equipe, ou o cliente escreve num número sem agente',
              'Depende do número. Veja a próxima seção',
            ],
            [
              'O nome do cliente e a mensagem dele',
              'O cliente manda mensagem numa conversa que já está com alguém da equipe',
              'Só quem está atendendo a conversa',
            ],
            [
              '“Contato para você”',
              'A Livih distribui um contato para você, num número com a distribuição ligada',
              'Quem recebeu o contato',
            ],
            [
              '“O agente retomou uma conversa sua”',
              'O agente escreve de novo para um cliente que parou de responder, numa conversa que está com você',
              'Quem está atendendo a conversa',
            ],
            [
              '“Tarefa: hoje às…”',
              'Na hora do lembrete da tarefa',
              'O responsável pela tarefa',
            ],
            [
              '“Compromisso: hoje às…”',
              'Na hora do lembrete do compromisso da Agenda (marcado ou confirmado)',
              'O responsável pelo compromisso',
            ],
            [
              '“Estoque baixo” e o resumo da manhã',
              'Um produto fica abaixo do estoque mínimo, e às 8 h, de segunda a sábado, se houver produto abaixo',
              <>Quem tem <Caminho>Alerta de estoque</Caminho> marcado em Configurações → Equipe</>,
            ],
            [
              'Plano e pagamento da Livih',
              'Os atendimentos do agente chegam a 80 % ou ao limite do mês, a fatura atrasa, o acesso é suspenso ou liberado, o plano anual vai renovar',
              'Dono e admin',
            ],
          ]}
        />
        <Paragrafo>
          A antecedência do lembrete é escolhida em cada tarefa e em cada compromisso. Sem lembrete marcado, não há
          aviso.
        </Paragrafo>
      </Secao>

      <Secao id="cliente-aguardando" titulo={titulo('cliente-aguardando')}>
        <Paragrafo>
          Quando a conversa passa para a equipe, o aviso vai para quem vai atender. Quem é essa pessoa depende do tipo de
          número:
        </Paragrafo>
        <Tabela
          colunas={['Número', 'Quem recebe o aviso']}
          linhas={[
            [
              'Número de um vendedor',
              'O vendedor do número. Se ele estiver ausente, o gestor da equipe dele',
            ],
            [
              <>Número da empresa com <Caminho>Distribuir os contatos entre a equipe</Caminho> ligado</>,
              'O vendedor do contato. Sem ele, ou se ele estiver ausente, o gestor da equipe que recebe o número',
            ],
            [
              'Número da empresa sem distribuição',
              'Todas as pessoas da equipe que veem o número',
            ],
          ]}
        />
        <Lista
          itens={[
            'O gestor da equipe também recebe o primeiro aviso, quando a conversa passa para a equipe. As mensagens seguintes do cliente vão só para quem atende.',
            'Se não houver vendedor nem gestor disponível, o aviso vai para todos que veem o número.',
            'Quando alguém assume a conversa, os avisos das próximas mensagens vão só para essa pessoa.',
            'Quem está ausente não recebe esse aviso (veja “Férias e folgas”).',
          ]}
        />
      </Secao>

      <Secao id="whatsapp" titulo={titulo('whatsapp')}>
        <Paragrafo>
          Alguns avisos chegam também como alerta pelo WhatsApp, no telefone que você cadastra em{' '}
          <Caminho>Seus dados</Caminho>. Para abrir, clique no seu nome (no celular, na bolinha com a sua inicial), no alto
          da tela. O alerta não depende de ativar as notificações no aparelho.
        </Paragrafo>
        <Tabela
          colunas={['Alerta pelo WhatsApp', 'Quem recebe']}
          linhas={[
            [
              'Cliente aguardando você, com o link da conversa',
              'Quem vai atender, quando o agente passa a conversa para a equipe: o vendedor ou, sem ele, o gestor da equipe',
            ],
            ['Lembrete de tarefa e de compromisso', 'O responsável'],
            ['Estoque baixo e o resumo da manhã', 'Quem tem Alerta de estoque marcado'],
            ['Plano e pagamento da Livih', 'Dono e admin'],
          ]}
        />
        <Lista
          itens={[
            'O alerta sai por um número de WhatsApp da sua empresa conectado à Livih. Sem nenhum número da empresa, o alerta de cliente aguardando não sai; o aviso no aparelho continua.',
            <>Em <Caminho>Seus dados</Caminho>, não use um dos números que atendem clientes na Livih (os de Configurações → WhatsApp): para esse número, o alerta não sai.</>,
            'Num número da empresa sem distribuição, o alerta pelo WhatsApp não vai para ninguém da equipe, só para a Cópia dos alertas, se a empresa preencher (Configurações → Agente). O aviso no aparelho vai para todos que veem o número.',
            <>O número em <Caminho>Configurações → Agente → Cópia dos alertas</Caminho>, se a empresa preencher, recebe uma cópia de todos os alertas de cliente aguardando.</>,
          ]}
        />
      </Secao>

      <Secao id="ausencia" titulo={titulo('ausencia')}>
        <Paragrafo>
          Em férias, folga ou afastamento, a pessoa pode ser marcada como ausente. Marcam o dono e o admin, em{' '}
          <Caminho>Configurações → Equipe → Editar</Caminho>, e o gestor, nas pessoas da equipe dele, pelo botão{' '}
          <Caminho>Ausência</Caminho>.
        </Paragrafo>
        <Lista
          itens={[
            'Quem está ausente não recebe contatos novos nem o aviso (no aparelho) e o alerta (no WhatsApp) de cliente aguardando. Eles vão para o gestor da equipe ou para quem vê o número.',
            'Nos números com a distribuição ligada, o cliente que escrever vai para outra pessoa da equipe.',
            'Nos outros números, a conversa que já estava com a pessoa continua com ela, e as mensagens do cliente continuam avisando só ela. Passe essas conversas para alguém antes da ausência.',
            'Os lembretes de tarefa e de compromisso continuam chegando. Passe para outra pessoa o que vence durante a ausência.',
            'Com data, a pessoa volta sozinha no dia seguinte ao último dia de ausência. Sem data, fica ausente até alguém clicar em Marcar que voltou.',
          ]}
        />
      </Secao>

      <Secao id="problemas" titulo={titulo('problemas')}>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“As notificações estão bloqueadas para a Livih neste navegador”',
              'Alguém escolheu Bloquear quando o navegador perguntou',
              'Clique no ícone ao lado do endereço do site e libere as notificações. No celular, libere nas configurações de notificação do aparelho. Depois, recarregue a página e clique em Ativar notificações',
            ],
            [
              '“No iPhone, as notificações só funcionam com a Livih instalada na tela de início”',
              'A Livih está aberta no Safari, não pelo ícone da tela de início',
              'Instale pelo botão Instalar app, no alto da tela (no celular, só o ícone de seta para baixo), como em “Como ativar”. Depois, abra a Livih pelo ícone e ative de novo ali',
            ],
            [
              '“Sem permissão, o navegador não deixa mostrar notificações”',
              'A pergunta do navegador foi fechada sem escolher Permitir',
              'Clique em Ativar notificações de novo e escolha Permitir',
            ],
            [
              '“Este navegador não aceita notificações”',
              'O navegador é antigo ou não tem esse recurso',
              'Use o Chrome, o Edge ou o Safari atualizados',
            ],
            [
              '“As notificações ainda não foram configuradas no servidor”',
              'Falta uma configuração do lado da Livih',
              'Avise o suporte da Livih',
            ],
            [
              '“Não foi possível ativar agora” ou “Não foi possível enviar o teste”',
              'A conexão falhou no meio do caminho',
              'Confira a internet e tente de novo',
            ],
            [
              'O teste não chega',
              'O aparelho está no modo Não perturbe, ou as notificações do navegador estão desligadas no sistema',
              'Desligue o Não perturbe e libere as notificações do navegador nas configurações do celular ou do Windows. Depois, envie outro teste',
            ],
            [
              'O teste chega, mas o aviso de um cliente não',
              'O aviso foi para outra pessoa: o vendedor do contato, o vendedor do número ou quem está atendendo. Ou você está marcado como ausente',
              'Confira na seção “Quem recebe o aviso de cliente aguardando” e peça ao gestor ou ao dono para conferir a sua ausência',
            ],
            [
              'Parou de chegar de um dia para o outro',
              'Você saiu da conta nesse aparelho, outra pessoa ativou nele, ou o navegador apagou os dados do site',
              'Abra Configurações → Notificações. Se aparecer Ativar notificações, ative de novo',
            ],
            [
              'Avisos de quando o aparelho estava desligado não chegam',
              'O aviso espera no máximo uma hora pelo aparelho',
              'Ao ligar, confira as conversas em Conversas',
            ],
            [
              'Não recebo o alerta pelo WhatsApp',
              'Falta o telefone em Seus dados, a empresa não tem número próprio conectado, ou o telefone cadastrado é um dos números que atendem clientes na Livih',
              'Clique no seu nome (no celular, na bolinha com a sua inicial), no alto da tela, e confira o telefone com DDD',
            ],
          ]}
        />
        <Paragrafo>Dúvidas que este manual não responde: fale com o suporte da Livih.</Paragrafo>
      </Secao>
    </>
  )
}
