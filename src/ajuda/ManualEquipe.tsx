import { Caminho, Lista, Paragrafo, Secao, Subtitulo, Tabela } from './componentes'

// Manual da Equipe (16/11). O texto sai do que a tela faz: src/components/SecaoEquipe.tsx, ConviteEmLote.tsx,
// EquipesDeVenda.tsx, DistribuicaoContatos.tsx, AusenciaPessoa.tsx, LinkConvite.tsx e MeusDados.tsx, e das regras em
// docs/equipes-origem-prospeccao.md (entregas 1 e 2 e a implantação de 16/11). Mudou a tela ou a regra, mude aqui.
// Termos: "alerta" é a mensagem no WhatsApp; "aviso" é a notificação no aparelho.

export const SECOES_EQUIPE = [
  { id: 'papeis', titulo: 'Quem é quem na equipe' },
  { id: 'convidar', titulo: 'Convidar uma pessoa' },
  { id: 'convidar-varias', titulo: 'Convidar várias pessoas pela planilha' },
  { id: 'editar', titulo: 'Editar uma pessoa' },
  { id: 'equipes', titulo: 'Equipes de venda e o gestor' },
  { id: 'distribuicao', titulo: 'Ligar a distribuição' },
  { id: 'distribuicao-escolha', titulo: 'Como a Livih escolhe o vendedor' },
  { id: 'ausencia', titulo: 'Ausência e férias' },
  { id: 'seus-dados', titulo: 'O seu telefone em Seus dados' },
  { id: 'problemas', titulo: 'Problemas comuns' },
]

const titulo = (id: string) => SECOES_EQUIPE.find((s) => s.id === id)!.titulo

export function ManualEquipe() {
  return (
    <>
      <Paragrafo>
        Em <Caminho>Configurações → Equipe</Caminho> ficam as pessoas que usam a Livih na sua empresa: quem atende, o que
        cada uma pode fazer, as equipes de venda e como os clientes são distribuídos entre os vendedores.
      </Paragrafo>

      <Secao id="papeis" titulo={titulo('papeis')}>
        <Paragrafo>Cada pessoa tem um papel. O papel diz o que ela pode fazer na Livih.</Paragrafo>
        <Tabela
          colunas={['Papel', 'O que faz']}
          linhas={[
            [
              'Dono',
              'Tudo, inclusive a equipe. Só o dono convida pessoas, muda o papel de alguém, desativa e reativa o acesso',
            ],
            [
              'Admin',
              'Atende e cuida das configurações: agente, base de conhecimento, dados da empresa e nota fiscal. Na equipe, cria as equipes de venda, muda o que cada pessoa pode e marca ausências. Não convida, não muda papéis nem troca o plano',
            ],
            ['Atendente', 'Atende as conversas. Não muda as configurações da empresa'],
          ]}
        />
        <Paragrafo>
          A empresa sempre precisa de pelo menos um dono ativo. Para ter um segundo dono, convide a pessoa como Admin e
          depois troque o papel dela para Dono em <Caminho>Editar</Caminho>.
        </Paragrafo>
        <Subtitulo>A lista da equipe</Subtitulo>
        <Paragrafo>Cada pessoa aparece com o nome, o e-mail, o último acesso e uma situação:</Paragrafo>
        <Lista
          itens={[
            <><Caminho>Ativo:</Caminho> já criou a senha e usa a Livih.</>,
            <><Caminho>Convite pendente:</Caminho> recebeu o link, mas ainda não criou a senha.</>,
            <><Caminho>Desativado:</Caminho> não tem mais acesso. O histórico do que fez continua.</>,
          ]}
        />
        <Paragrafo>
          Embaixo do nome aparecem etiquetas com a equipe e o que a pessoa pode fazer, como “Recebe contatos novos” ou
          “Ausente até 20/11”. Quando a empresa tem equipes de venda, a lista se agrupa por equipe. A partir de 6 pessoas,
          aparecem a busca por nome ou e-mail e o filtro por equipe.
        </Paragrafo>
      </Secao>

      <Secao id="convidar" titulo={titulo('convidar')}>
        <Paragrafo>Só o dono convida. A Livih não manda e-mail: ela cria um link, e você manda o link para a pessoa.</Paragrafo>
        <Lista
          numerada
          itens={[
            <>Em <Caminho>Configurações → Equipe</Caminho>, clique em <Caminho>Convidar pessoa</Caminho>.</>,
            'Preencha o nome (como aparece para a equipe) e o e-mail da pessoa.',
            <>Escolha o papel: <Caminho>Atendente</Caminho> ou <Caminho>Admin</Caminho>.</>,
            <>Clique em <Caminho>Criar convite</Caminho>.</>,
            <>
              Clique em <Caminho>Enviar pelo WhatsApp</Caminho>: abre o WhatsApp com a mensagem pronta, e você escolhe o
              contato da pessoa. Se preferir, use <Caminho>Copiar link</Caminho> e mande por onde quiser.
            </>,
          ]}
        />
        <Paragrafo>
          <strong className="text-texto">O link vale por 24 horas.</strong> Ele abre a tela para a pessoa criar a senha. Até
          ela criar, a lista mostra “Convite pendente”.
        </Paragrafo>
        <Subtitulo>A pessoa já tem conta na Livih</Subtitulo>
        <Paragrafo>
          Se o e-mail já tem conta na Livih (por exemplo, a pessoa trabalha em outra empresa que usa a Livih), ela entra na
          sua equipe na hora, sem link. A tela mostra “Adicionado à equipe”, e ela entra com a senha que já usa.
        </Paragrafo>
        <Subtitulo>O link venceu ou a pessoa esqueceu a senha</Subtitulo>
        <Paragrafo>
          Na lista, clique em <Caminho>Editar</Caminho> na pessoa e, em <Caminho>Acesso à Livih</Caminho>:
        </Paragrafo>
        <Lista
          itens={[
            <>
              <Caminho>Novo link de convite</Caminho>, para quem ainda não criou a senha. Sai um link novo, também de 24
              horas.
            </>,
            <>
              <Caminho>Redefinir senha</Caminho>, para quem esqueceu a senha. Sai um link para criar uma senha nova, de 24
              horas. A senha atual continua valendo até a pessoa trocar.
            </>,
          ]}
        />
        <Paragrafo>
          Se a pessoa também tem acesso a outra empresa na Livih, a Livih não gera o link: peça para ela usar “Esqueci minha
          senha” na tela de entrar.
        </Paragrafo>
      </Secao>

      <Secao id="convidar-varias" titulo={titulo('convidar-varias')}>
        <Paragrafo>
          Para montar a equipe de uma vez, cole as linhas de uma planilha. A Livih convida cada pessoa, coloca na equipe de
          venda e marca o gestor. Só o dono vê este botão.
        </Paragrafo>
        <Lista
          numerada
          itens={[
            <>Em <Caminho>Configurações → Equipe</Caminho>, clique em <Caminho>Convidar várias</Caminho>.</>,
            'No Excel ou no Google Planilhas, selecione as colunas, copie e cole no campo.',
            'Confira a prévia: cada linha mostra o nome, o e-mail, o telefone, a equipe e a situação. Linha com problema fica em vermelho e fica de fora.',
            <>Clique em <Caminho>Convidar N pessoas</Caminho> e espere terminar.</>,
            'Mande o link de cada pessoa pelo WhatsApp (veja abaixo).',
          ]}
        />
        <Subtitulo>As colunas</Subtitulo>
        <Tabela
          colunas={['Coluna', 'O que pôr']}
          linhas={[
            ['Nome', 'Como a pessoa aparece para a equipe'],
            ['E-mail', 'Obrigatório. É com ele que a pessoa entra na Livih'],
            ['Telefone', 'Celular com DDD, como (42) 99999-1234. Serve para mandar o link e para os alertas'],
            ['Equipe', 'O nome da equipe de venda, como “Televendas”. Se ela ainda não existe, a Livih cria'],
            ['Gestor', '“sim” para o gestor da equipe. Vazio ou “não” para os outros. Gestor só vale para atendente'],
            ['Papel', '“admin” para quem vai ser Admin. Vazio, a pessoa entra como Atendente'],
          ]}
        />
        <Paragrafo>
          <strong className="text-texto">Com a linha de títulos</strong> (a primeira linha com “Nome”, “E-mail” e as
          outras), a ordem das colunas não importa, e dá para usar a coluna Papel.{' '}
          <strong className="text-texto">Sem a linha de títulos</strong>, use esta ordem: Nome, E-mail, Telefone, Equipe,
          Gestor. Nesse caso, todos entram como Atendente.
        </Paragrafo>
        <Paragrafo>
          A equipe é reconhecida pelo nome, sem diferença de acento ou de maiúscula: “televendas” e “Televendas” são a
          mesma. Antes de convidar, a prévia mostra as equipes que serão criadas.
        </Paragrafo>
        <Paragrafo>
          <strong className="text-texto">Teste antes com 2 linhas.</strong> Assim você confere se as colunas foram lidas
          certo antes de convidar a equipe toda.
        </Paragrafo>
        <Subtitulo>Opções e regras</Subtitulo>
        <Lista
          itens={[
            <>
              <Caminho>Marcar “Recebe contatos novos” em quem não é gestor:</Caminho> marque para os vendedores que vão
              receber os clientes dos números com a distribuição ligada. Dá para mudar pessoa por pessoa depois.
            </>,
            'Só vira gestor quem tem a equipe na linha. Gestor sem equipe é avisado na prévia.',
            'Gestor só vale para atendente: quem entra como Admin não vira gestor, mesmo com “sim” na coluna Gestor.',
            'Quem já está na equipe e já criou a senha não recebe convite novo: só muda de equipe, se a linha tiver uma.',
            'Telefone que a Livih não reconhece não impede o convite: o link sai assim mesmo, e você escolhe o contato no WhatsApp.',
            <>
              O telefone da planilha fica gravado em <Caminho>Seus dados</Caminho> da pessoa, para ela receber os alertas
              desde o primeiro dia. Só vale para quem ainda não tem telefone e nunca entrou na Livih: o que a pessoa
              preencheu não muda.
            </>,
          ]}
        />
        <Subtitulo>Mandar os links</Subtitulo>
        <Paragrafo>
          No fim, a tela mostra cada pessoa e o que aconteceu com ela (“Convite criado”, “Já estava na equipe”, a equipe, o
          telefone salvo). Cada link vale por 24 horas.
        </Paragrafo>
        <Lista
          itens={[
            <>
              <Caminho>WhatsApp:</Caminho> abre a conversa com o celular da pessoa e a mensagem pronta. Sem telefone na
              planilha, o botão é <Caminho>WhatsApp (escolher contato)</Caminho>.
            </>,
            <><Caminho>Copiar link:</Caminho> copia só o link daquela pessoa.</>,
            <>
              <Caminho>Copiar nome, telefone e link de todos:</Caminho> copia uma tabela para colar na planilha. Útil quando
              outra pessoa vai mandar os links.
            </>,
          ]}
        />
        <Paragrafo>
          Se algo falhar no meio, o que já foi feito aparece na tela. Confira a lista da equipe antes de colar de novo.
        </Paragrafo>
      </Secao>

      <Secao id="editar" titulo={titulo('editar')}>
        <Paragrafo>
          Na lista, clique em <Caminho>Editar</Caminho> na pessoa. Dono e admin veem esse botão. Cada mudança vale na hora:
          não precisa salvar.
        </Paragrafo>
        <Subtitulo>Papel e equipe</Subtitulo>
        <Lista
          itens={[
            <><Caminho>Papel:</Caminho> só o dono muda, e não muda o próprio papel.</>,
            <>
              <Caminho>Equipe de venda:</Caminho> aparece quando a empresa tem equipes. Cada pessoa fica em uma equipe só.
            </>,
            <>
              <Caminho>Gestor da equipe:</Caminho> aparece para atendentes que estão numa equipe. Dono e admin já veem tudo,
              então não precisam ser gestores. Veja <Caminho>{titulo('equipes')}</Caminho>.
            </>,
          ]}
        />
        <Subtitulo>O que a pessoa pode</Subtitulo>
        <Tabela
          colunas={['Opção', 'O que faz', 'Para quem aparece']}
          linhas={[
            [
              'Recebe contatos novos',
              'A pessoa entra na distribuição dos clientes que escrevem nos números com a distribuição ligada, os novos e os que voltam',
              'Todos',
            ],
            [
              'Vê todos os clientes',
              'Para quem atende no balcão ou cuida do faturamento: vê o cadastro de todos os clientes e vende para qualquer um. Não vê as conversas nem os negócios dos outros vendedores',
              'Atendentes',
            ],
            [
              'Emite nota fiscal',
              'Emite a nota fiscal dos pedidos que vê. Cancelar nota continua só com dono e admin',
              'Atendentes',
            ],
            [
              'Financeiro',
              'Vê os lançamentos e dá baixa nos pagamentos, para quem cuida do caixa ou da cobrança',
              'Atendentes, quando a empresa usa o Financeiro da Livih (vem com o ERP ou as Ordens de serviço e pode estar escondido pela equipe da Livih)',
            ],
            [
              'Alerta de estoque',
              'Recebe o aviso no celular e o alerta no WhatsApp quando um produto fica abaixo do estoque mínimo, e o resumo da manhã',
              'Todos, quando a empresa usa o ERP',
            ],
          ]}
        />
        <Paragrafo>
          Dono e admin não veem as opções “Vê todos os clientes”, “Emite nota fiscal” e “Financeiro” porque já podem tudo
          isso.
        </Paragrafo>
        <Subtitulo>Ausência</Subtitulo>
        <Paragrafo>
          Na mesma janela, marque férias, folga ou afastamento. Veja <Caminho>{titulo('ausencia')}</Caminho>.
        </Paragrafo>
        <Subtitulo>Desativar o acesso</Subtitulo>
        <Paragrafo>
          Quando alguém sai da empresa, o dono clica em <Caminho>Desativar acesso</Caminho>, em{' '}
          <Caminho>Acesso à Livih</Caminho>. A pessoa deixa de ver as conversas, e o histórico do que ela fez continua. Para
          trazer de volta, o dono clica em <Caminho>Reativar</Caminho> na lista (a pessoa aparece como Desativado).
        </Paragrafo>
        <Paragrafo>
          O vendedor desativado continua na equipe de venda: o gestor segue vendo o histórico dele. Se quem saiu era o
          gestor, marque outro gestor na equipe.
        </Paragrafo>
      </Secao>

      <Secao id="equipes" titulo={titulo('equipes')}>
        <Paragrafo>
          As equipes de venda separam as pessoas por loja ou canal de venda, como “Loja Centro”, “Televendas” ou “Vendas
          externas”. Elas ficam no quadro <Caminho>Equipes de venda</Caminho>, no alto da tela.
        </Paragrafo>
        <Subtitulo>Criar e mudar equipes</Subtitulo>
        <Lista
          itens={[
            <>
              Para criar, escreva o nome no campo e clique em <Caminho>Criar equipe</Caminho>. O nome tem até 60 letras e
              não pode repetir.
            </>,
            <>
              Em cada equipe: <Caminho>Cidades</Caminho> (veja <Caminho>{titulo('distribuicao')}</Caminho>),{' '}
              <Caminho>Renomear</Caminho> e <Caminho>Remover</Caminho>.
            </>,
            <>
              Para pôr alguém numa equipe, clique em <Caminho>Editar</Caminho> na pessoa e escolha a{' '}
              <Caminho>Equipe de venda</Caminho>.
            </>,
          ]}
        />
        <Paragrafo>
          Dono e admin criam, renomeiam e removem equipes. Cada equipe mostra quantas pessoas tem e quantos gestores. Equipe
          “sem gestor” aparece em destaque.
        </Paragrafo>
        <Paragrafo>
          Remover uma equipe deixa as pessoas dela sem equipe, e o gestor deixa de ver as conversas dos vendedores dela. As
          cidades da equipe deixam de valer na distribuição. As conversas e os contatos não mudam.
        </Paragrafo>
        <Subtitulo>O que o gestor faz</Subtitulo>
        <Paragrafo>
          O gestor é um atendente com a marcação <Caminho>Gestor da equipe</Caminho>. Uma equipe pode ter mais de um gestor.
          O gestor:
        </Paragrafo>
        <Lista
          itens={[
            'vê e responde as conversas dos vendedores da equipe dele;',
            'vê os contatos, o funil, os pedidos, os clientes, as tarefas e a agenda deles;',
            'vê o Painel da equipe, que já abre filtrado nela;',
            'liga e desliga o agente nos números dos vendedores da equipe;',
            'marca a ausência das pessoas da equipe, pelo botão Ausência na lista;',
            'recebe o alerta do agente quando o vendedor da conversa está ausente ou desativado.',
          ]}
        />
        <Paragrafo>
          O gestor não mexe nas configurações da empresa, na cobrança nem nas equipes. As instruções do agente ficam com dono
          e admin, para todos os números atenderem do mesmo jeito.
        </Paragrafo>
      </Secao>

      <Secao id="distribuicao" titulo={titulo('distribuicao')}>
        <Paragrafo>
          Nos números da empresa com a distribuição ligada, a Livih escolhe sozinha qual vendedor atende cada cliente. Quem
          recebe ganha um aviso no celular, e a conversa mostra uma linha dizendo por quê, como “Contato distribuído para
          Ana: foi quem mais atendeu este cliente nos últimos 90 dias.” O agente continua atendendo até chamar a equipe.
        </Paragrafo>
        <Subtitulo>Onde ligar</Subtitulo>
        <Lista
          numerada
          itens={[
            <>
              Em <Caminho>Configurações → WhatsApp</Caminho>, clique em <Caminho>Configurar</Caminho> no número da empresa.
            </>,
            <>Marque <Caminho>Distribuir os contatos entre a equipe</Caminho>.</>,
            <>
              Se a empresa tem equipes, escolha a <Caminho>Equipe que recebe</Caminho> os contatos daquele número (por
              exemplo, o número do site para a equipe Televendas). Sem equipe, vale o rodízio entre todos.
            </>,
            <>
              Em <Caminho>Configurações → Equipe</Caminho>, marque <Caminho>Recebe contatos novos</Caminho> em cada
              vendedor que entra na distribuição. Sem ninguém marcado, nada é distribuído.
            </>,
          ]}
        />
        <Paragrafo>
          Número de vendedor (em <Caminho>Configurações → WhatsApp → Configurar</Caminho>, “De quem é este número” com o
          nome de alguém) não distribui: o cliente fica com esse vendedor.
        </Paragrafo>
        <Subtitulo>O período do “quem mais atendeu”</Subtitulo>
        <Paragrafo>
          No quadro <Caminho>Distribuição dos contatos</Caminho> (dono e admin), escolha em{' '}
          <Caminho>Contar quem mais atendeu nos últimos</Caminho> quantos dias contam: 30, 60, 90, 180 ou 365. O padrão é 90
          dias. O quadro aparece quando a empresa tem equipes ou algum número com a distribuição ligada. Veja como esse
          período entra na escolha em <Caminho>{titulo('distribuicao-escolha')}</Caminho>.
        </Paragrafo>
        <Subtitulo>As cidades de cada equipe</Subtitulo>
        <Paragrafo>
          No quadro <Caminho>Equipes de venda</Caminho>, clique em <Caminho>Cidades</Caminho> na equipe e escreva as cidades
          separadas por vírgula, como “Castro, Piraí do Sul”. Não importa acento nem a sigla do estado. Cada cidade fica em
          uma equipe só, e cada equipe aceita até 200 cidades.
        </Paragrafo>
        <Paragrafo>
          A cidade do cliente vem do que o agente anotou na conversa ou do cadastro do cliente ligado ao contato. Se ainda
          não se sabe a cidade e o agente está atendendo, ele pergunta, e a Livih espera a resposta por até uns 15 minutos.
          Sem resposta, vale a equipe que recebe o número.
        </Paragrafo>
      </Secao>

      <Secao id="distribuicao-escolha" titulo={titulo('distribuicao-escolha')}>
        <Subtitulo>Quando a Livih escolhe</Subtitulo>
        <Paragrafo>A escolha acontece quando o cliente manda mensagem num número com a distribuição ligada e:</Paragrafo>
        <Lista
          itens={[
            'escreve pela primeira vez;',
            'volta depois de 30 dias sem conversa com a empresa;',
            'quem o atendia está ausente ou foi desativado, ou deixou de receber contatos novos e não está atendendo a conversa.',
          ]}
        />
        <Paragrafo>
          Fora desses casos, o cliente continua com o mesmo vendedor. A Livih não usa carteira fixa: a cada volta depois de
          30 dias, a escolha é feita de novo.
        </Paragrafo>
        <Subtitulo>A ordem da escolha</Subtitulo>
        <Paragrafo>A Livih segue esta ordem e para no primeiro passo que encontra alguém:</Paragrafo>
        <Lista
          numerada
          itens={[
            <>
              <strong className="text-texto">Quem já está atendendo.</strong> Se o cliente voltou a escrever antes de 30
              dias e alguém está atendendo a conversa, ela continua com essa pessoa.
            </>,
            <>
              <strong className="text-texto">Quem mais atendeu esse cliente</strong> no período escolhido (veja{' '}
              <Caminho>{titulo('distribuicao')}</Caminho>), em qualquer número da empresa. Conta quem mais escreveu para
              ele; no empate, quem escreveu por último.
            </>,
            <>
              <strong className="text-texto">A equipe da cidade do cliente</strong>, quando a cidade dele está nas cidades
              de uma equipe.
            </>,
            <>
              <strong className="text-texto">A equipe que recebe o número</strong>, escolhida em Configurações → WhatsApp.
            </>,
            <>
              <strong className="text-texto">Rodízio entre todos</strong> os marcados com “Recebe contatos novos”.
            </>,
          ]}
        />
        <Paragrafo>
          Nas equipes e no rodízio, cada pessoa recebe na sua vez: vai quem recebeu há mais tempo. Quem está ausente,
          desativado ou sem “Recebe contatos novos” fica de fora, e o cliente vai para o próximo da lista, sem esperar. Se
          ninguém puder receber, o cliente não é distribuído, e o aviso de cliente aguardando vai para todos que veem o
          número.
        </Paragrafo>
        <Paragrafo>
          <strong className="text-texto">Atenção:</strong> a cidade vem antes da equipe do número. Se a maioria dos seus
          clientes é de uma cidade só e você cadastrar essa cidade numa equipe, quase todos vão para ela, mesmo os que
          escrevem no número do site ou do televendas. Cadastre cidades só quando elas devem mesmo mandar o cliente para uma
          equipe.
        </Paragrafo>
      </Secao>

      <Secao id="ausencia" titulo={titulo('ausencia')}>
        <Paragrafo>
          Use a ausência para férias, folga ou afastamento. Ela é separada de “Recebe contatos novos”: você não precisa
          desmarcar nada e lembrar de marcar de novo na volta.
        </Paragrafo>
        <Subtitulo>Quem marca</Subtitulo>
        <Lista
          itens={[
            <>
              <Caminho>Dono e admin:</Caminho> de qualquer pessoa, em <Caminho>Editar</Caminho>, na parte{' '}
              <Caminho>Ausência</Caminho>.
            </>,
            <>
              <Caminho>Gestor:</Caminho> dos atendentes da equipe dele e dele mesmo, pelo botão{' '}
              <Caminho>Ausência</Caminho> na lista.
            </>,
          ]}
        />
        <Subtitulo>Como marcar</Subtitulo>
        <Lista
          numerada
          itens={[
            <>
              Escolha o <Caminho>Último dia de ausência</Caminho>. É opcional: sem data, a pessoa fica ausente até alguém
              marcar que voltou.
            </>,
            <>Clique em <Caminho>Marcar ausente</Caminho>. A lista mostra a etiqueta “Ausente até 20/11”.</>,
          ]}
        />
        <Paragrafo>
          No dia seguinte à data, a pessoa volta sozinha. Para encerrar antes, clique em <Caminho>Marcar que voltou</Caminho>.
        </Paragrafo>
        <Subtitulo>O que muda enquanto a pessoa está ausente</Subtitulo>
        <Lista
          itens={[
            'não recebe contatos novos;',
            'não recebe o aviso nem o alerta de cliente aguardando;',
            'nos números com a distribuição ligada, os clientes dela que escreverem vão para outra pessoa, sem esperar a volta;',
            'o alerta do agente vai para o gestor da equipe.',
          ]}
        />
        <Subtitulo>O que não muda</Subtitulo>
        <Lista
          itens={[
            'nos números sem distribuição, as conversas que já estavam com a pessoa continuam com ela. Antes da ausência, passe essas conversas para outra pessoa;',
            'os lembretes de tarefas e compromissos dela continuam chegando.',
          ]}
        />
      </Secao>

      <Secao id="seus-dados" titulo={titulo('seus-dados')}>
        <Paragrafo>
          Cada pessoa cadastra o próprio nome e telefone. Clique no seu nome (no celular, na bolinha com a sua inicial), no
          alto da tela: abre a janela <Caminho>Seus dados</Caminho>. Use o celular com DDD, como (41) 99999-8888, e clique
          em <Caminho>Salvar</Caminho>. Não use um dos números que atendem clientes na Livih (os de{' '}
          <Caminho>Configurações → WhatsApp</Caminho>): para esse número, o alerta não sai.
        </Paragrafo>
        <Paragrafo>Esse telefone é usado para:</Paragrafo>
        <Lista
          itens={[
            <>
              <strong className="text-texto">Alertas do agente.</strong> Quando o agente chama a equipe (cliente pronto
              para comprar, pedido de orçamento, reclamação), a Livih manda pelo WhatsApp, para quem vai atender, o nome do
              cliente, o motivo e o link da conversa. Quem atende é o vendedor do número ou, nos números com distribuição,
              o vendedor do cliente. Se ele estiver ausente ou desativado, vai para o gestor da equipe.
            </>,
            'Lembretes de tarefas e compromissos, pelo WhatsApp.',
            'O contato do vendedor nos orçamentos em PDF em que ele é o responsável.',
          ]}
        />
        <Paragrafo>
          A mensagem sai por um número da empresa conectado à Livih (nunca pelo número de um vendedor). Sem número da
          empresa conectado, não há alerta pelo WhatsApp, mas o aviso no celular continua.
        </Paragrafo>
        <Paragrafo>
          Sem telefone em Seus dados, a pessoa não recebe nada disso pelo WhatsApp. No convite pela planilha, a Livih já
          grava o telefone de quem ainda não tem.
        </Paragrafo>
      </Secao>

      <Secao id="problemas" titulo={titulo('problemas')}>
        <Subtitulo>Convites e edição</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Só o dono da empresa convida pessoas e muda papéis.” ou “Só o dono da empresa convida pessoas.”',
              'Você é admin ou atendente',
              'Peça ao dono da empresa',
            ],
            [
              'Não vejo o botão Editar',
              'Só dono e admin editam as pessoas. Pessoa desativada também não tem Editar',
              'Peça ao dono ou a um admin. Para a pessoa desativada, o dono clica em Reativar',
            ],
            [
              '“Essa pessoa já está na equipe.”',
              'O e-mail já está ativo e com senha criada',
              'Procure a pessoa na lista. Se esqueceu a senha, use Editar → Redefinir senha',
            ],
            [
              '“Informe um e-mail válido.”',
              'O e-mail está incompleto ou com espaço',
              'Confira o e-mail e tente de novo',
            ],
            [
              'O link não abre ou diz que venceu',
              'O link vale por 24 horas',
              'Editar → Novo link de convite (ou Redefinir senha) e mande o link novo',
            ],
            [
              '“Essa pessoa também tem acesso a outra empresa. Peça para ela usar “Esqueci minha senha” na tela de entrar.”',
              'A Livih não gera link de senha para quem usa a Livih em outra empresa',
              'A pessoa clica em “Esqueci minha senha” na tela de entrar',
            ],
            [
              '“Não foi possível mudar. Só dono e admin mudam.”',
              'Você não é dono nem admin, ou a conexão falhou',
              'Peça ao dono ou a um admin, ou tente de novo',
            ],
            [
              '“O último dia de ausência já passou. Escolha hoje ou um dia depois.”',
              'A data escolhida é anterior a hoje',
              'Escolha hoje ou uma data depois',
            ],
          ]}
        />
        <Subtitulo>Planilha</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Sem e-mail”, “E-mail inválido” ou “E-mail repetido na lista”',
              'A linha não tem um e-mail que dê para usar',
              'Corrija na planilha e cole de novo. As outras linhas podem seguir',
            ],
            [
              '“marcado(s) como gestor sem equipe”',
              'Só vira gestor quem tem a equipe na linha',
              'Preencha a coluna Equipe dessa pessoa',
            ],
            [
              'Uma pessoa com “sim” em Gestor não virou gestor',
              'Gestor só vale para atendente, e ela entrou como Admin',
              'Admin já vê tudo e não precisa ser gestor. Se ela deve ser gestora, deixe a coluna Papel vazia',
            ],
            [
              'Telefone “não reconhecido”',
              'Falta o DDD ou sobram números',
              'O convite sai assim mesmo. Corrija o telefone ou peça para a pessoa preencher em Seus dados',
            ],
            [
              'As colunas saíram trocadas',
              'Sem a linha de títulos, a Livih usa a ordem Nome, E-mail, Telefone, Equipe, Gestor',
              'Copie também a linha de títulos, ou ponha as colunas nessa ordem',
            ],
          ]}
        />
        <Subtitulo>Equipes e cidades</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Já existe uma equipe com esse nome.”',
              'Os nomes de equipe não se repetem, sem diferença de maiúscula',
              'Use outro nome ou a equipe que já existe',
            ],
            [
              '“… já está na equipe … Tire a cidade de lá e salve de novo aqui.”',
              'Cada cidade fica em uma equipe só',
              'Tire a cidade da outra equipe e salve de novo',
            ],
            [
              '“O nome da cidade … passa de 100 letras.”',
              'Provavelmente faltou uma vírgula entre as cidades',
              'Separe as cidades por vírgula',
            ],
          ]}
        />
        <Subtitulo>Distribuição e alertas</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              'O cliente não foi distribuído para ninguém',
              'Ninguém está com “Recebe contatos novos”, ou todos estão ausentes',
              'Marque “Recebe contatos novos” em Editar e confira as ausências',
            ],
            [
              'Os clientes do número do site vão todos para a mesma equipe',
              'A cidade vem antes da equipe do número',
              'Confira as cidades de cada equipe e tire as que não devem mandar o cliente para ela',
            ],
            [
              'O vendedor não recebe o alerta do agente no WhatsApp',
              'Está sem telefone em Seus dados, cadastrou lá um dos números que atendem clientes na Livih, está ausente, ou a empresa não tem número próprio conectado',
              'Peça para ele preencher Seus dados e confira a ausência e a conexão em Configurações → WhatsApp',
            ],
          ]}
        />
        <Paragrafo>Dúvidas que este manual não responde: fale com o suporte da Livih.</Paragrafo>
      </Secao>
    </>
  )
}
