import { Caminho, Lista, Paragrafo, Secao, Subtitulo, Tabela } from './componentes'

// Manual das Respostas rápidas (16/11). O texto sai do que a tela faz: src/components/SecaoRespostas.tsx, a caixa da
// conversa (src/components/Compositor.tsx e PainelConversa.tsx), src/services/respostasRapidas.ts (atalho e {nome}) e a
// RLS da migration 20261106120000_respostas_rapidas.sql (quem cria, edita e apaga). Mudou a tela ou a regra, mude aqui.

export const SECOES_RESPOSTAS = [
  { id: 'listas', titulo: 'Da empresa ou só suas' },
  { id: 'criar', titulo: 'Criar, editar e apagar' },
  { id: 'nome', titulo: 'O nome do cliente com {nome}' },
  { id: 'usar', titulo: 'Usar na conversa' },
  { id: 'dicas', titulo: 'Dicas' },
  { id: 'problemas', titulo: 'Problemas comuns' },
]

const titulo = (id: string) => SECOES_RESPOSTAS.find((s) => s.id === id)!.titulo

export function ManualRespostas() {
  return (
    <>
      <Paragrafo>
        Em <Caminho>Configurações → Respostas rápidas</Caminho> ficam as mensagens prontas para o que a equipe responde
        todo dia: a chave Pix, o prazo de entrega, o endereço da loja. Na conversa, você chama a resposta pelo atalho, ela
        entra na caixa de texto, e você revisa antes de enviar. Nada sai sozinho.
      </Paragrafo>

      <Secao id="listas" titulo={titulo('listas')}>
        <Paragrafo>A tela tem duas listas:</Paragrafo>
        <Tabela
          colunas={['Lista', 'Quem usa', 'Quem cria, edita e apaga']}
          linhas={[
            ['Da empresa', 'Toda a equipe', 'Só dono e admin'],
            ['Minhas', 'Só você', 'Só você. Nem o dono vê as respostas pessoais dos outros'],
          ]}
        />
        <Paragrafo>
          Use a lista da empresa para o que todos devem responder igual, como a chave Pix e o horário. Use as suas para o
          seu jeito de escrever.
        </Paragrafo>
        <Paragrafo>
          O atendente vê as respostas da empresa, mas sem os botões de editar e apagar. Ele pode criar as dele em{' '}
          <Caminho>Minhas</Caminho>.
        </Paragrafo>
      </Secao>

      <Secao id="criar" titulo={titulo('criar')}>
        <Subtitulo>Criar</Subtitulo>
        <Lista
          numerada
          itens={[
            <>Em <Caminho>Configurações → Respostas rápidas</Caminho>, clique em <Caminho>Nova resposta</Caminho>.</>,
            <>
              Em <Caminho>Atalho</Caminho>, escreva a palavra que você vai digitar depois da “/”, como “pix”.
            </>,
            <>Em <Caminho>Texto</Caminho>, escreva a mensagem como o cliente vai ler.</>,
            <>
              Dono e admin escolhem em <Caminho>Quem usa</Caminho>: <Caminho>Toda a equipe</Caminho> (lista da empresa) ou{' '}
              <Caminho>Só eu</Caminho> (lista Minhas). O atendente não vê essa escolha: a resposta dele vai para Minhas.
            </>,
            <>Clique em <Caminho>Salvar</Caminho>.</>,
          ]}
        />
        <Subtitulo>O atalho</Subtitulo>
        <Lista
          itens={[
            'Só letras minúsculas, números, - e _, com até 30 caracteres.',
            'A Livih ajeita o que você digita: tira o acento, passa para minúscula e troca o espaço por -. “Endereço Loja” vira “endereco-loja”.',
            'O atalho não pode repetir dentro da mesma lista. Entre a lista da empresa e a sua, pode.',
          ]}
        />
        <Subtitulo>O texto</Subtitulo>
        <Paragrafo>
          Até 4.096 caracteres, com quebra de linha. Negrito e itálico saem como no WhatsApp: *negrito* e _itálico_. Para
          pôr o nome do cliente, veja <Caminho>{titulo('nome')}</Caminho>.
        </Paragrafo>
        <Subtitulo>Editar e apagar</Subtitulo>
        <Paragrafo>
          Na resposta, clique em <Caminho>Editar</Caminho> para mudar o atalho ou o texto, ou na lixeira para apagar. Apagar
          tira a resposta da lista (da equipe toda, se for da empresa). As mensagens já enviadas não mudam.
        </Paragrafo>
        <Paragrafo>
          Depois de criada, a resposta não troca de lista. Para levar uma resposta sua para a empresa, o dono ou um admin
          cria outra igual em <Caminho>Toda a equipe</Caminho>, e você apaga a sua.
        </Paragrafo>
      </Secao>

      <Secao id="nome" titulo={titulo('nome')}>
        <Paragrafo>
          Escreva {'{nome}'} no texto, e a Livih troca pelo primeiro nome do cliente quando você usa a resposta. Por
          exemplo: “Oi {'{nome}'}, a chave Pix é o nosso CNPJ: 00.000.000/0001-00.” vira “Oi Maria, a chave Pix é o nosso
          CNPJ: 00.000.000/0001-00.”
        </Paragrafo>
        <Lista
          itens={[
            'O nome vem do cadastro do contato na Livih. Sem nome no cadastro, vale o nome que o cliente usa no WhatsApp.',
            <>
              Sem nome nenhum (só o número), o {'{nome}'} some junto com a vírgula antes dele: “Olá, {'{nome}'}!” vira
              “Olá!”, “Oi {'{nome}'}, tudo bem?” vira “Oi, tudo bem?” e “{'{nome}'}, tudo bem?” vira “Tudo bem?”.
            </>,
            <>{'{nome}'} é a única variável. Outra palavra entre chaves sai como foi escrita.</>,
          ]}
        />
        <Paragrafo>
          O nome do WhatsApp nem sempre é o nome da pessoa (pode ser o nome de uma loja ou um apelido). Confira na caixa
          antes de enviar.
        </Paragrafo>
      </Secao>

      <Secao id="usar" titulo={titulo('usar')}>
        <Lista
          numerada
          itens={[
            <>
              Na caixa de mensagem da conversa, digite “/” e o começo do atalho, como “/pix”. Ou clique no botão do raio, ao
              lado da caixa.
            </>,
            <>
              Abre a lista com até 8 respostas. As suas aparecem com a marca “minha”. Use ↑ e ↓ para escolher e Enter ou
              Tab para usar, ou clique na resposta. Esc fecha a lista.
            </>,
            'A resposta entra no lugar do “/pix”, com o nome do cliente já preenchido. Revise e mude o que quiser.',
            'Envie como uma mensagem comum.',
          ]}
        />
        <Paragrafo>
          A busca olha o atalho e, a partir de 2 letras, também o texto: “/entrega” acha a resposta que fala em entrega,
          mesmo com outro atalho.
        </Paragrafo>
        <Paragrafo>
          A “/” funciona no começo da caixa ou depois de um espaço. O que você já tinha escrito fica: “Bom dia! /pix” vira
          “Bom dia! ” seguido da resposta.
        </Paragrafo>
        <Paragrafo>
          A lista é carregada quando você abre a conversa. Criou ou mudou uma resposta com a conversa aberta? Abra a
          conversa de novo.
        </Paragrafo>
        <Paragrafo>
          Com um arquivo anexado, o raio some e a “/” não abre a lista: tire o arquivo para usar uma resposta.
        </Paragrafo>
      </Secao>

      <Secao id="dicas" titulo={titulo('dicas')}>
        <Lista
          itens={[
            <><strong className="text-texto">Atalhos curtos e fáceis de lembrar:</strong> “pix”, “prazo”, “endereco”.</>,
            <>
              <strong className="text-texto">Uma resposta por assunto.</strong> É mais fácil achar e juntar duas do que
              cortar um texto grande.
            </>,
            <>
              <strong className="text-texto">Mesmo começo para assuntos parecidos,</strong> como “prazo-capital” e
              “prazo-interior”: digitando “/prazo”, as duas aparecem.
            </>,
            <>
              <strong className="text-texto">Dado que muda (preço, chave Pix, horário) na lista da empresa.</strong> Muda em
              um lugar só, e a equipe toda passa a usar o novo.
            </>,
          ]}
        />
      </Secao>

      <Secao id="problemas" titulo={titulo('problemas')}>
        <Subtitulo>Na tela de Respostas rápidas</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Já existe uma resposta com o atalho /pix nesta lista. Escolha outro.”',
              'O atalho já está em uso na mesma lista',
              'Use outro atalho, ou edite a resposta que já existe',
            ],
            ['“Dê um atalho à resposta, ex.: pix.”', 'O atalho ficou vazio', 'Preencha o atalho'],
            ['“Escreva o texto da resposta.”', 'O texto ficou vazio', 'Escreva a mensagem'],
            [
              'Não vejo Editar nem a lixeira nas respostas da empresa',
              'Só dono e admin mudam a lista da empresa',
              'Peça ao dono ou a um admin, ou crie a sua em Minhas',
            ],
            [
              '“Não foi possível salvar a resposta. Tente de novo.” ou “Não foi possível apagar a resposta. Tente de novo.”',
              'A conexão falhou',
              'Confira a conexão e tente de novo',
            ],
            [
              '“Não foi possível carregar as respostas. Recarregue a página.”',
              'A conexão falhou',
              'Recarregue a página',
            ],
          ]}
        />
        <Subtitulo>Na conversa</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Nenhuma resposta rápida ainda. Criar em Configurações”',
              'Não há resposta da empresa nem sua',
              'Clique em Criar em Configurações',
            ],
            [
              '“Nenhuma resposta com “…”. Enter envia o texto como está.”',
              'Nenhum atalho tem o que você digitou depois da “/”',
              'Apague e digite de novo. Cuidado: Enter manda o “/…” para o cliente',
            ],
            [
              'A resposta nova não aparece na lista',
              'A lista foi carregada quando a conversa abriu',
              'Abra a conversa de novo',
            ],
            [
              'O botão do raio não aparece',
              'Há um arquivo anexado, a lista não carregou, ou o cliente escreveu há mais de 24 horas num número da API oficial (aí só sai modelo aprovado)',
              'Tire o arquivo ou abra a conversa de novo. Passadas as 24 horas, envie um modelo',
            ],
            [
              'A mensagem saiu sem o nome do cliente',
              'O contato não tem nome no cadastro nem no WhatsApp',
              'Ponha o nome no cadastro do contato',
            ],
          ]}
        />
        <Paragrafo>Dúvidas que este manual não responde: fale com o suporte da Livih.</Paragrafo>
      </Secao>
    </>
  )
}
