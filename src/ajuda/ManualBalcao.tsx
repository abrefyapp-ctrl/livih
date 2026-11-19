import { Caminho, Figura, Lista, Paragrafo, Secao, Subtitulo, Tabela } from './componentes'

// Manual do Balcão (18/11). O texto sai do que a tela faz: src/pages/Balcao.tsx, src/components/EnvioNota.tsx,
// src/components/SecaoBalcaoUsuarios.tsx e o cancelamento em src/pages/PedidoDetalhe.tsx; as regras, das migrations
// 20261118140000_balcao, 20261118160000_balcao_cancelar, 20261118180000_balcao_usuarios e 20261118220000_nota_envios
// (docs/balcao.md). Mudou a tela ou a regra, mude aqui.

export const SECOES_BALCAO = [
  { id: 'liberar', titulo: 'Ligar o Balcão e quem usa' },
  { id: 'vender', titulo: 'Fazer uma venda' },
  { id: 'nota', titulo: 'A nota fiscal' },
  { id: 'enviar', titulo: 'Mandar a nota ao cliente' },
  { id: 'depois', titulo: 'Depois da venda' },
  { id: 'problemas', titulo: 'Problemas comuns' },
]

const titulo = (id: string) => SECOES_BALCAO.find((s) => s.id === id)!.titulo

// Imagens de 19/11, com produtos, cliente e contatos fictícios (as respostas do banco foram trocadas só no navegador
// da captura; nada foi gravado).
const IMG = '/ajuda/balcao'

export function ManualBalcao() {
  return (
    <>
      <Paragrafo>
        O <Caminho>Balcão</Caminho> é a tela da venda de loja: busca o produto, fecha a venda e emite a NF-e numa tela só.
        Ao fechar, a Livih registra o pedido como entregue, baixa o estoque, lança o pagamento no Financeiro e, se você
        marcou, emite a nota e manda ao cliente.
      </Paragrafo>

      <Secao id="liberar" titulo={titulo('liberar')}>
        <Paragrafo>
          O Balcão é um módulo: quem liga é a equipe da Livih, e ele precisa de <Caminho>Pedidos e estoque</Caminho> ligado.
          Com ele ligado, o Balcão aparece no menu <Caminho>Operação</Caminho> para:
        </Paragrafo>
        <Tabela
          colunas={['Quem', 'O que vê']}
          linhas={[
            ['Dono e admin', 'Tudo, como sempre, e o Balcão'],
            [
              'Usuário do balcão',
              'Só o Balcão, as vendas de balcão da loja, os produtos e os clientes. Não vê conversas, contatos, oportunidades nem os pedidos dos vendedores',
            ],
            ['Atendente com “Vê todos os clientes”', 'O Balcão, além do que já vê como atendente'],
          ]}
        />
        <Subtitulo>Cadastrar o usuário do balcão</Subtitulo>
        <Lista
          numerada
          itens={[
            <>Em <Caminho>Configurações → Equipe</Caminho>, no fim da página, clique em <Caminho>Cadastrar usuário do balcão</Caminho>.</>,
            <>Escreva o nome e um e-mail que não seja de alguém da equipe.</>,
            <>Mande o link à pessoa (copiar ou WhatsApp). Ela cria a senha e entra direto no Balcão.</>,
            <>Para ela emitir a NF-e, ligue <Caminho>Emite nota fiscal</Caminho> na linha dela.</>,
          ]}
        />
        <Paragrafo>
          Na mesma lista ficam <Caminho>Link de senha nova</Caminho> (esqueceu a senha) e <Caminho>Tirar acesso</Caminho>. Tirar o
          acesso não apaga nada: as vendas que ela fez continuam.
        </Paragrafo>
        <Subtitulo>Conta do caixa</Subtitulo>
        <Paragrafo>
          Dinheiro, Pix e débito entram pagos numa conta do Financeiro. Sem escolha, é a conta do tipo caixa. Dono e admin
          trocam no próprio Balcão, no bloco <Caminho>Pagamento</Caminho>.
        </Paragrafo>
      </Secao>

      <Secao id="vender" titulo={titulo('vender')}>
        <Lista
          numerada
          itens={[
            <>
              <strong>Produto:</strong> digite o código ou o nome e aperte Enter. O leitor de código de barras faz isso sozinho.
              Antes de buscar, aparecem os mais vendidos dos últimos 90 dias.
            </>,
            <>
              <strong>Itens:</strong> ajuste a quantidade com − e +. No campo de desconto do item, digite <Caminho>5,00</Caminho>{' '}
              (reais) ou <Caminho>10%</Caminho>. Produto sem estoque aparece em laranja e pode ser vendido.
            </>,
            <>
              <strong>Cliente:</strong> o padrão é consumidor final. <Caminho>Escolher cliente</Caminho> busca por nome, razão
              social, CNPJ ou CPF. Também dá para começar pelo cliente: no cadastro dele, <Caminho>Iniciar venda</Caminho> abre o
              Balcão com ele escolhido.
            </>,
            <>
              <strong>Pagamento:</strong> dinheiro (com o valor recebido, a tela mostra o troco), Pix, débito, crédito ou a prazo.
              A prazo pede cliente e os prazos em dias: 30, 30/60, 30/60/90 ou outro, como 28/56.
            </>,
            <>
              <strong>Desconto no total</strong> e <strong>observação</strong>, se precisar.
            </>,
            <>
              <strong>Fechar venda.</strong> Se algo falta, o botão fica apagado e o motivo aparece embaixo.
            </>,
          ]}
        />
        <Figura
          src={`${IMG}/venda.png`}
          alt="O Balcão com quatro itens, um deles com 10% de desconto, o cliente escolhido e o pagamento em dinheiro com valor recebido e troco"
          legenda="Uma venda montada: quantidades, desconto no item, cliente e troco. Os dados são de exemplo."
          largura="max-w-3xl"
        />
        <Tabela
          colunas={['Forma', 'No Financeiro']}
          linhas={[
            ['Dinheiro, Pix e débito', 'Já entra pago na conta do caixa'],
            ['Crédito', 'A receber em 30 dias, até cair o dinheiro da maquininha'],
            ['A prazo', 'A receber em boleto, nos prazos escolhidos'],
          ]}
        />
        <Paragrafo>
          Logo depois de fechar, a tela fica livre para a próxima venda. O andamento da última (nota, impressão, envio) aparece
          embaixo dos itens.
        </Paragrafo>
      </Secao>

      <Secao id="nota" titulo={titulo('nota')}>
        <Paragrafo>
          A NF-e sai pelo CNPJ do balcão (<Caminho>Configurações → Empresa → Nota fiscal</Caminho>) quando três coisas valem: há
          cliente escolhido, o CNPJ está pronto para emitir e quem vende tem <Caminho>Emite nota fiscal</Caminho>.
        </Paragrafo>
        <Lista
          itens={[
            <>
              <strong>Consumidor final sem cadastro não recebe NF-e:</strong> a NF-e exige o destinatário. Cadastre o cliente (CPF
              e endereço) e escolha ele na venda.
            </>,
            <>
              <strong>Impressão:</strong> com <Caminho>Abrir a impressão do DANFE</Caminho> marcado, a janela de impressão abre
              sozinha quando a nota é autorizada; aperte Enter. A opção fica lembrada no computador.
            </>,
            <>
              <strong>Se faltar algo no cadastro</strong> (endereço, CPF), a tela lista o que falta. A venda fica gravada: acerte o
              cadastro e emita no pedido (<Caminho>Vendas do balcão</Caminho> → a venda → <Caminho>Emitir nota</Caminho>).
            </>,
          ]}
        />
      </Secao>

      <Secao id="enviar" titulo={titulo('enviar')}>
        <Paragrafo>
          Com a NF-e marcada, o bloco <Caminho>Quando a nota for autorizada</Caminho> já traz o WhatsApp e o e-mail do cliente.
          A nota (DANFE em PDF) sai sozinha assim que a SEFAZ autorizar.
        </Paragrafo>
        <Figura
          src={`${IMG}/nota.png`}
          alt="O fim da venda: NF-e e impressão do DANFE marcadas e o bloco Quando a nota for autorizada, com o WhatsApp de um contato do cliente e o e-mail"
          legenda="Com vários contatos, escolha na lista para qual WhatsApp vai a nota."
          largura="max-w-sm"
        />
        <Tabela
          colunas={['', 'De onde vem', 'Como sai']}
          linhas={[
            [
              'WhatsApp',
              'O contato do cliente que conversou por último (vários: escolha na lista). Sem contato, o telefone do cliente, se for celular',
              'Pelo número da empresa, na conversa do cliente, sem tirar a conversa do agente. Um número novo vira contato ligado ao cliente',
            ],
            [
              'E-mail',
              'O e-mail do cliente; sem ele, o de um contato. Corrigiu? Marque Salvar no cadastro do cliente',
              'Pela Focus, a empresa da nota fiscal. Pode levar alguns minutos',
            ],
          ]}
        />
        <Paragrafo>
          Para reenviar ou mandar depois, abra a venda e use <Caminho>Enviar ao cliente</Caminho> no bloco da nota. Ali também
          aparece o que já foi enviado e o motivo, quando não saiu.
        </Paragrafo>
        <Figura
          src={`${IMG}/reenviar.png`}
          alt="A janela Enviar a nota ao cliente, com o WhatsApp e o e-mail já preenchidos e os botões Cancelar e Enviar"
          legenda="Enviar ao cliente, no bloco da nota do pedido: os mesmos campos do Balcão."
          largura="max-w-md"
        />
      </Secao>

      <Secao id="depois" titulo={titulo('depois')}>
        <Lista
          itens={[
            <>
              <strong>Vendas do balcão</strong> (ou <Caminho>Pedidos</Caminho>, para a equipe): abra a venda para baixar ou
              reimprimir o DANFE e mandar a nota de novo.
            </>,
            <>
              <strong>Cancelar venda:</strong> só dono e admin, no pedido da venda, com o motivo. A Livih desfaz o pagamento,
              cancela as parcelas e devolve os itens ao estoque. Com NF-e autorizada, cancele a nota antes (a SEFAZ dá 24 horas).
            </>,
          ]}
        />
      </Secao>

      <Secao id="problemas" titulo={titulo('problemas')}>
        <Tabela
          colunas={['O que aparece', 'O que fazer']}
          linhas={[
            ['O Balcão não está no menu', 'O módulo não está ligado (fale com a Livih) ou falta a permissão: veja Ligar o Balcão'],
            ['“Para a NF-e, escolha o cliente”', 'Consumidor final não recebe NF-e: escolha ou cadastre o cliente'],
            ['A impressão não abriu sozinha', 'Clique em imprimir o DANFE na última venda; confira se o navegador bloqueou janelas'],
            [
              'WhatsApp: “fora das 24 horas”',
              'No número da API oficial, a nota só sai se o cliente mandou mensagem nas últimas 24 horas. Mande por e-mail',
            ],
            ['WhatsApp: “número desconectado”', 'Reconecte o número em Configurações → WhatsApp e reenvie pelo pedido'],
            ['“Só o dono ou um admin cancela”', 'Peça ao dono ou ao admin: cancelar venda desfaz pagamento e estoque'],
          ]}
        />
      </Secao>
    </>
  )
}
