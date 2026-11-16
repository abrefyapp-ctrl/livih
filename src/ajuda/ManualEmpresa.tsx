import { Caminho, Lista, Paragrafo, Secao, Subtitulo, Tabela } from './componentes'

// Manual de Configurações → Empresa (16/11). O texto sai da tela (src/components/SecaoEmpresa.tsx,
// ModalNotaFiscal.tsx, CredenciamentoSefaz.tsx), dos serviços (src/services/empresa.ts e nfe.ts), da função nfe-config
// e de docs/nfe.md e docs/nfse.md. Mudou a tela ou a regra, mude aqui também.

export const SECOES_EMPRESA = [
  { id: 'para-que-serve', titulo: 'Para que serve' },
  { id: 'cadastrar', titulo: 'Cadastrar a empresa' },
  { id: 'logo', titulo: 'A logo' },
  { id: 'padroes', titulo: 'Padrões do orçamento' },
  { id: 'varios-cnpjs', titulo: 'Mais de um CNPJ' },
  { id: 'onde-aparece', titulo: 'Onde os dados aparecem' },
  { id: 'nota-fiscal', titulo: 'Nota fiscal: configurar o CNPJ' },
  { id: 'situacao', titulo: 'Situação da nota e certificado' },
  { id: 'nfse', titulo: 'Nota de serviço (NFS-e)' },
  { id: 'parana', titulo: 'Empresa do Paraná: autorizar o emissor' },
  { id: 'producao', titulo: 'Do teste para a produção' },
  { id: 'problemas', titulo: 'Problemas comuns' },
]

const titulo = (id: string) => SECOES_EMPRESA.find((s) => s.id === id)!.titulo

export function ManualEmpresa() {
  return (
    <>
      <Paragrafo>
        Em <Caminho>Configurações → Empresa</Caminho> ficam a logo e os dados da sua empresa: razão social, CNPJ,
        endereço e contato. A Livih usa esses dados no orçamento e no pedido em PDF. Com o módulo Pedidos e estoque (ERP) ou
        Ordens de serviço ligado, é também aqui que você prepara cada CNPJ para emitir nota fiscal.
      </Paragrafo>

      <Secao id="para-que-serve" titulo={titulo('para-que-serve')}>
        <Lista
          itens={[
            'Cadastrar a empresa, com a logo, para o orçamento sair com a cara dela.',
            'Definir os padrões do orçamento: validade, prazo de entrega, condições de pagamento e rodapé.',
            'Cadastrar mais de um CNPJ, quando a empresa vende por mais de um, e escolher qual é o padrão.',
            'Configurar a nota fiscal de cada CNPJ: regime, certificado digital e ambiente de teste ou produção.',
          ]}
        />
        <Subtitulo>Quem pode mexer</Subtitulo>
        <Paragrafo>
          Só o <strong className="text-texto">dono</strong> e os <strong className="text-texto">admins</strong> cadastram,
          editam e removem. Os outros membros da equipe veem a lista, com o aviso “Só dono e admin alteram os dados da
          empresa.”
        </Paragrafo>
        <Subtitulo>O que ter em mãos</Subtitulo>
        <Lista
          itens={[
            'O cartão CNPJ ou o contrato social: razão social, nome fantasia, CNPJ e endereço.',
            'A inscrição estadual, se a empresa tiver. A contabilidade informa.',
            'A logo em PNG ou JPG, de até 2 MB.',
            'Para a nota fiscal: o certificado digital A1 (arquivo .pfx ou .p12) e a senha dele, e o regime tributário.',
          ]}
        />
      </Secao>

      <Secao id="cadastrar" titulo={titulo('cadastrar')}>
        <Lista
          numerada
          itens={[
            <>Abra <Caminho>Configurações → Empresa</Caminho>.</>,
            <>
              Sem nenhuma empresa cadastrada, a tela mostra “Dados da empresa ainda não cadastrados”. Clique em{' '}
              <Caminho>Cadastrar a empresa</Caminho>.
            </>,
            'Preencha os grupos da janela: Identificação, Endereço, Contato e Padrões do orçamento.',
            <>Clique em <Caminho>Salvar</Caminho>. A empresa aparece na lista.</>,
          ]}
        />
        <Paragrafo>
          O botão <Caminho>Salvar</Caminho> só libera com a razão social e o CNPJ preenchidos. Os outros campos são
          opcionais, mas sem o endereço completo a nota fiscal não pode ser configurada.
        </Paragrafo>
        <Paragrafo>
          Para mudar algum dado depois, clique em <Caminho>Editar</Caminho> na linha da empresa.
        </Paragrafo>

        <Subtitulo>Identificação</Subtitulo>
        <Tabela
          colunas={['Campo', 'O que preencher']}
          linhas={[
            ['Razão social', 'O nome registrado no CNPJ. Obrigatório'],
            ['Nome fantasia', 'O nome que o cliente conhece. Quando preenchido, é ele que aparece em destaque na lista e no PDF'],
            [
              'CNPJ',
              'Obrigatório. Pode digitar com ou sem pontos. Aceita também o CNPJ novo, com letras (ex.: 12.ABC.345/01DE-35)',
            ],
            ['Inscrição estadual', 'Opcional. Sai no cabeçalho do orçamento e vai para a nota fiscal'],
          ]}
        />

        <Subtitulo>Endereço</Subtitulo>
        <Paragrafo>
          Comece pelo <Caminho>CEP</Caminho>. Ao sair do campo, a Livih busca o endereço e preenche rua, bairro, cidade e
          UF que ainda estiverem vazios. Se o CEP não for encontrado, nada muda: preencha à mão. Depois complete o{' '}
          <Caminho>Número</Caminho> (sem número, escreva SN) e o <Caminho>Complemento</Caminho>, se houver.
        </Paragrafo>

        <Subtitulo>Contato</Subtitulo>
        <Paragrafo>
          <Caminho>Telefone</Caminho> com DDD, <Caminho>E-mail</Caminho> e <Caminho>Site</Caminho>. Os três saem no
          cabeçalho do orçamento. Todos são opcionais.
        </Paragrafo>
      </Secao>

      <Secao id="logo" titulo={titulo('logo')}>
        <Lista
          numerada
          itens={[
            <>Na janela da empresa, clique em <Caminho>Escolher logo</Caminho> (ou <Caminho>Trocar logo</Caminho>).</>,
            'Escolha um arquivo PNG ou JPG de até 2 MB. A prévia aparece ao lado.',
            <>Clique em <Caminho>Salvar</Caminho>. A logo só vale depois de salvar.</>,
          ]}
        />
        <Paragrafo>
          Fundo transparente ou branco fica melhor. Para tirar a logo, clique em <Caminho>Tirar</Caminho> e salve.
        </Paragrafo>
        <Paragrafo>
          A logo sai no orçamento, no pedido e na nota fiscal. A logo da empresa padrão aparece também no alto da Livih, ao
          lado do nome da empresa. Se o CNPJ já está configurado para a nota fiscal, a Livih manda a logo nova para a nota
          na hora em que você salva.
        </Paragrafo>
      </Secao>

      <Secao id="padroes" titulo={titulo('padroes')}>
        <Paragrafo>
          No grupo <Caminho>Padrões do orçamento</Caminho>, você define o que vem preenchido em todo pedido novo. Em cada
          pedido, dá para mudar.
        </Paragrafo>
        <Tabela
          colunas={['Campo', 'Como funciona']}
          linhas={[
            [
              'Validade (dias)',
              'De 1 a 365. O pedido novo vem com “Válido até” igual à data de criação mais esses dias. O padrão é 7',
            ],
            ['Prazo de entrega', 'Texto livre, como “10 dias úteis”'],
            [
              'Condições de pagamento',
              'Texto livre, como “50% na aprovação e 50% na entrega. Pix, boleto ou cartão em até 3x.”',
            ],
            ['Rodapé', 'Sai no fim de todo orçamento em PDF deste CNPJ: garantia, observações gerais, dados bancários'],
          ]}
        />
        <Paragrafo>
          Validade, prazo e condições são copiados para o pedido quando ele é criado. Mudar os padrões aqui não muda os
          pedidos que já existem. O rodapé é diferente: ele sai como está no cadastro na hora em que o PDF é gerado.
        </Paragrafo>
      </Secao>

      <Secao id="varios-cnpjs" titulo={titulo('varios-cnpjs')}>
        <Paragrafo>
          Se a empresa vende por mais de um CNPJ, cadastre cada um. Com a primeira empresa já cadastrada, clique em{' '}
          <Caminho>Outro CNPJ</Caminho>, no alto da tela, e preencha a janela como da primeira vez. O mesmo CNPJ não pode
          ser cadastrado duas vezes.
        </Paragrafo>
        <Subtitulo>A empresa padrão</Subtitulo>
        <Lista
          itens={[
            'A primeira empresa cadastrada já nasce como padrão. Com mais de uma, a padrão leva a etiqueta Padrão na lista.',
            <>Para trocar, clique em <Caminho>Tornar padrão</Caminho> na linha de outra empresa. Só uma é padrão por vez.</>,
            'A padrão vem marcada em todo pedido novo. No pedido, no bloco Orçamento, o campo Empresa (CNPJ) deixa trocar.',
            'Ao trocar o CNPJ no pedido, validade, prazo e condições passam para os padrões do novo CNPJ, se ainda estavam com os ' +
              'do anterior.',
          ]}
        />
        <Subtitulo>Remover uma empresa</Subtitulo>
        <Paragrafo>
          Clique no ícone de lixeira na linha da empresa e confirme em <Caminho>Remover</Caminho>. A empresa sai da lista
          junto com a logo. Se ela era a padrão, a mais antiga que sobrou passa a ser a padrão.
        </Paragrafo>
        <Paragrafo>
          Empresa que já está em algum pedido não pode ser removida: os pedidos precisam continuar mostrando de qual CNPJ
          saíram.
        </Paragrafo>
      </Secao>

      <Secao id="onde-aparece" titulo={titulo('onde-aparece')}>
        <Tabela
          colunas={['Onde', 'O que aparece']}
          linhas={[
            [
              'Orçamento e pedido em PDF',
              'Logo, nome fantasia, razão social, CNPJ, inscrição estadual, endereço, telefone, e-mail e site do CNPJ do ' +
                'pedido, e o rodapé no fim',
            ],
            ['Ordem de serviço em PDF', 'O mesmo cabeçalho, com os dados da empresa padrão'],
            ['Alto da tela da Livih', 'A logo da empresa padrão, ao lado do nome da empresa'],
            ['Pedido novo', 'A empresa padrão, a validade, o prazo de entrega e as condições de pagamento'],
            ['Nota fiscal', 'Razão social, nome fantasia, CNPJ, inscrição estadual, endereço, contato e logo'],
          ]}
        />
        <Paragrafo>
          Sem nenhuma empresa cadastrada, o orçamento em PDF sai sem logo, sem CNPJ e sem endereço. O pedido avisa e leva
          para esta tela.
        </Paragrafo>
      </Secao>

      <Secao id="nota-fiscal" titulo={titulo('nota-fiscal')}>
        <Paragrafo>
          O botão <Caminho>Nota fiscal</Caminho> aparece na linha de cada empresa só quando o módulo Pedidos e estoque
          (ERP) ou o de Ordens de serviço está ligado. Sem ele, a nota fiscal não está no seu plano: o dono contrata o
          módulo em <Caminho>Configurações → Plano e consumo</Caminho>, na parte Módulos.
        </Paragrafo>
        <Paragrafo>
          A emissão das notas é feita pela Focus NFe, parceira da Livih. Cada CNPJ é configurado uma vez. Antes de começar,
          confira se o endereço do CNPJ está completo: CEP, rua, número, bairro, cidade e UF.
        </Paragrafo>
        <Lista
          numerada
          itens={[
            <>Na linha da empresa, clique em <Caminho>Nota fiscal</Caminho>.</>,
            <>
              Em <Caminho>Empresa</Caminho>, escolha o <Caminho>Regime tributário</Caminho> (Simples Nacional, Simples
              com excesso de sublimite, MEI ou Regime normal). Se não souber, pergunte à contabilidade. A{' '}
              <Caminho>Série</Caminho> vem com 1; só mude se a contabilidade pedir.
            </>,
            <>
              Em <Caminho>Padrões dos itens</Caminho>, clique em <Caminho>usar sugestão</Caminho>. A Livih preenche os
              campos vazios com o mais comum para revenda de mercadoria no seu regime: CFOP, ICMS, PIS e COFINS. Mostre os
              valores à contabilidade e corrija o que for diferente. Eles valem para todos os produtos da nota.
            </>,
            <>
              Em <Caminho>Certificado digital A1</Caminho>, clique em <Caminho>Escolher certificado</Caminho>, escolha o
              arquivo .pfx ou .p12 e digite a <Caminho>Senha do certificado</Caminho>.
            </>,
            <>
              Em <Caminho>Ambiente e balcão</Caminho>, deixe <Caminho>Teste (homologação)</Caminho>. A produção só libera
              depois que o CNPJ estiver pronto.
            </>,
            <>
              Clique em <Caminho>Salvar e enviar à Focus</Caminho>. Se der certo, a janela fecha e a empresa ganha a
              etiqueta “NF-e: Pronta para emitir (teste)”.
            </>,
          ]}
        />
        <Paragrafo>
          O arquivo e a senha do certificado vão direto para a Focus NFe, que assina as notas. A Livih não guarda nenhum
          dos dois. Se o certificado já foi cadastrado direto na Focus NFe (por exemplo, pela equipe da Livih), salve sem
          escolher o arquivo: a Livih usa o cadastro de lá.
        </Paragrafo>

        <Subtitulo>Outros campos da janela</Subtitulo>
        <Lista
          itens={[
            <>
              <Caminho>Origem da mercadoria:</Caminho> vale para todos os produtos. Um produto pode ter a origem dele, no
              cadastro do produto.
            </>,
            <>
              <Caminho>Limite de faturamento anual (opcional):</Caminho> fica anotado no cadastro do CNPJ, para consulta.
              Vazio, fica anotado o teto do regime (R$ 4,8 milhões no Simples, R$ 81 mil no MEI); no Regime normal, fica
              sem limite anotado.
            </>,
            <>
              <Caminho>CNPJ do balcão:</Caminho> marca o CNPJ usado nas vendas de balcão. Ele aparece marcado como
              “balcão” na lista de CNPJs e na hora de emitir a nota. Só um CNPJ pode ter essa marcação.
            </>,
          ]}
        />

        <Paragrafo>
          Depois que o CNPJ está pronto, quem emite é o dono, o admin e quem tiver a permissão{' '}
          <Caminho>Emite nota fiscal</Caminho>, em <Caminho>Configurações → Equipe</Caminho>. A nota sai do pedido (botão{' '}
          <Caminho>Emitir nota</Caminho>); a de serviço sai também da ordem de serviço.
        </Paragrafo>
      </Secao>

      <Secao id="situacao" titulo={titulo('situacao')}>
        <Subtitulo>A situação da nota fiscal</Subtitulo>
        <Paragrafo>
          Depois de configurado, cada CNPJ mostra uma etiqueta na lista. No alto da janela Nota fiscal aparecem também a
          data de validade do certificado e o ambiente.
        </Paragrafo>
        <Tabela
          colunas={['Etiqueta', 'O que quer dizer']}
          linhas={[
            ['NF-e: Pronta para emitir (teste)', 'Pode emitir notas de teste, sem valor fiscal'],
            ['NF-e: Pronta para emitir', 'Está em produção: as notas valem de verdade'],
            ['NF-e: Falta o certificado', 'A Focus NFe ainda não tem um certificado válido deste CNPJ, ou ele venceu'],
            ['NF-e: Com erro', 'A Focus NFe recusou o cadastro. O motivo aparece em vermelho no alto da janela Nota fiscal'],
          ]}
        />
        <Subtitulo>Certificado perto de vencer</Subtitulo>
        <Paragrafo>
          O certificado A1 vale um ano, em geral. Faltando 30 dias ou menos, a data aparece em amarelo, com “vence em N
          dias”; depois, com “vencido”. Para renovar, abra <Caminho>Nota fiscal</Caminho>, clique em{' '}
          <Caminho>Trocar certificado</Caminho>, escolha o arquivo novo, digite a senha e salve.
        </Paragrafo>
      </Secao>

      <Secao id="nfse" titulo={titulo('nfse')}>
        <Paragrafo>
          Para emitir nota de serviço pelo CNPJ, marque <Caminho>Emitir nota de serviço por este CNPJ</Caminho> na janela
          Nota fiscal. A Livih emite pelo padrão nacional da NFS-e.
        </Paragrafo>
        <Tabela
          colunas={['Campo', 'O que preencher']}
          linhas={[
            ['Código de tributação nacional do ISS', 'Obrigatório, 6 números. Identifica o serviço. Peça à contabilidade'],
            ['Inscrição municipal', 'Opcional. O número inteiro, como no cadastro da prefeitura, com os zeros do começo'],
            ['Código de tributação municipal e Código NBS', 'Opcionais. A contabilidade informa quando a prefeitura pede'],
            ['Alíquota efetiva do Simples (%)', 'Aparece no Simples Nacional. A do último DAS; a contabilidade sabe'],
            ['Regime especial de tributação', 'Em geral, Nenhum'],
            ['Descrição padrão do serviço', 'Opcional. Vem sugerida na nota avulsa; na emissão dá para ajustar'],
            ['Reforma tributária (IBS/CBS)', 'Três códigos que dependem do serviço. Peça à contabilidade'],
          ]}
        />
        <Paragrafo>
          A alíquota do ISS não é pedida: no padrão nacional, ela vem da prefeitura.
        </Paragrafo>
        <Paragrafo>
          Depois de salvar, a janela mostra se a cidade do CNPJ usa o padrão nacional. Se a cidade usa um sistema próprio
          da prefeitura, a Livih ainda não emite a nota de serviço desse CNPJ. A NF-e de mercadoria continua normal.
        </Paragrafo>
      </Secao>

      <Secao id="parana" titulo={titulo('parana')}>
        <Paragrafo>
          A SEFAZ do Paraná só aceita nota emitida por um sistema que a própria empresa autorizou. As notas da Livih são geradas pela
          Focus NFe, e é ela que precisa ser autorizada. É uma vez só por CNPJ, vale para teste e produção, e costuma ser
          feito pelo contador.
        </Paragrafo>
        <Paragrafo>
          Para empresa do Paraná, a janela Nota fiscal mostra o aviso “Empresa do Paraná: autorize a Focus NFe no portal
          da Receita/PR antes da primeira NF-e”. Clique nele para abrir o passo a passo, com o CNPJ da Focus NFe e o botão{' '}
          <Caminho>Copiar</Caminho>. Em resumo:
        </Paragrafo>
        <Lista
          numerada
          itens={[
            'Entre em receita.pr.gov.br com o certificado digital da empresa (A1 ou A3) ou peça ao contador.',
            <>Abra <Caminho>UPD → Autorização de Uso → Cadastro de Autorização de Uso</Caminho>.</>,
            'Digite o CNPJ da Focus NFe (no portal, ela aparece como Acras) e escolha o sistema 54078 (AC-NFE).',
            'Digite a inscrição estadual e o CNPJ da sua empresa, confira os dados e marque todos os documentos fiscais.',
            'Avise o suporte da Livih. A equipe da Livih pede à Focus NFe o aceite e avisa você quando estiver liberado.',
          ]}
        />
        <Paragrafo>
          Em outro estado, se uma nota for recusada porque o emissor não está autorizado, a tela da nota mostra o que
          fazer: autorizar a Focus NFe no portal da SEFAZ do estado e avisar o suporte da Livih.
        </Paragrafo>
      </Secao>

      <Secao id="producao" titulo={titulo('producao')}>
        <Paragrafo>
          Todo CNPJ começa em teste (homologação). A nota de teste vai até a SEFAZ, mas não tem valor fiscal. Use para
          conferir se os dados e os padrões fiscais estão certos.
        </Paragrafo>
        <Lista
          numerada
          itens={[
            'Com a etiqueta do CNPJ em “NF-e: Pronta para emitir (teste)”, emita uma nota de teste num pedido.',
            'Confira a nota com a contabilidade. Se houver erro, ajuste a janela Nota fiscal e emita outra de teste.',
            <>
              Com a nota de teste certa, abra <Caminho>Nota fiscal</Caminho>, escolha{' '}
              <Caminho>Produção (vale de verdade)</Caminho> e clique em <Caminho>Salvar e enviar à Focus</Caminho>.
            </>,
          ]}
        />
        <Paragrafo>
          Em produção, cada nota tem valor fiscal. A opção de produção só fica disponível quando a etiqueta do CNPJ
          mostra “NF-e: Pronta para emitir”.
        </Paragrafo>
      </Secao>

      <Secao id="problemas" titulo={titulo('problemas')}>
        <Subtitulo>Dados da empresa</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            ['Não vejo os botões Editar e Outro CNPJ', 'Só dono e admin alteram os dados da empresa', 'Peça ao dono ou a um admin'],
            ['“Não foi possível carregar os dados da empresa.”', 'Falha de conexão', 'Recarregue a página'],
            [
              '“CNPJ inválido. Confira as letras e os números.”',
              'Algum caractere do CNPJ está errado',
              'Copie o CNPJ do cartão CNPJ',
            ],
            ['“Esse CNPJ já está cadastrado nesta conta.”', 'O CNPJ já está na lista', 'Use Editar na empresa que já existe'],
            ['“Telefone inválido. Use DDD e número.”', 'Falta o DDD ou sobram números', 'Digite como (41) 3333-4444'],
            ['“O CEP tem 8 números.”', 'O CEP está incompleto', 'Confira o CEP'],
            ['“UF são duas letras (ex.: PR).”', 'O estado foi escrito por extenso ou errado', 'Use a sigla: PR, SP, SC…'],
            ['“A validade vai de 1 a 365 dias.”', 'A validade do orçamento ficou fora do limite', 'Use um número de 1 a 365'],
            [
              '“A logo precisa ser PNG ou JPG.” ou “A logo pode ter até 2 MB.”',
              'O arquivo é de outro tipo ou é grande demais',
              'Salve a logo em PNG ou JPG, menor que 2 MB, e escolha de novo',
            ],
            [
              '“A logo foi salva, mas não chegou à nota fiscal (…)”',
              'A logo está no orçamento, mas a Focus NFe não recebeu',
              'Abra a Nota fiscal deste CNPJ e clique em Salvar e enviar à Focus',
            ],
            [
              '“Essa empresa já está em pedidos e não pode sair (…)”',
              'Os pedidos precisam continuar mostrando de qual CNPJ saíram',
              'Deixe a empresa na lista. Se não usa mais, torne outra a padrão',
            ],
            ['O orçamento sai sem logo e sem CNPJ', 'Nenhuma empresa cadastrada', 'Cadastre a empresa nesta tela'],
          ]}
        />
        <Subtitulo>Nota fiscal</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              'Não vejo o botão Nota fiscal',
              'Só dono e admin configuram, e só com o módulo Pedidos e estoque (ERP) ou Ordens de serviço ligado',
              'Peça ao dono. Para ter o módulo, o dono contrata em Configurações → Plano e consumo → Módulos',
            ],
            [
              'O botão Salvar e enviar à Focus não libera',
              'Falta o regime tributário, ou um código está no formato errado, ou o certificado foi escolhido sem a senha',
              'Escolha o regime, corrija o campo marcado em vermelho e digite a senha',
            ],
            [
              '“Preencha no cadastro do CNPJ: (…)”',
              'Falta parte do endereço (CEP, rua, número, bairro, cidade ou UF)',
              'Feche a janela, clique em Editar, complete o endereço, salve e volte à Nota fiscal',
            ],
            [
              '“Envie o certificado digital A1 (.pfx) com a senha para cadastrar o CNPJ na Focus.”',
              'É a primeira vez do CNPJ e o certificado não foi escolhido',
              'Escolha o arquivo do certificado, digite a senha e salve',
            ],
            [
              '“A Focus ainda não registrou o certificado: envie o arquivo .pfx com a senha.”',
              'O CNPJ foi cadastrado, mas sem certificado válido',
              'Escolha o certificado, digite a senha e salve de novo',
            ],
            [
              '“O certificado está vencido: envie o novo.”',
              'O certificado A1 passou da validade',
              'Peça o certificado novo à certificadora e envie em Trocar certificado',
            ],
            [
              '“Já existe outro CNPJ marcado como o do balcão. Desmarque lá primeiro.”',
              'Só um CNPJ pode ser o do balcão',
              'Abra a Nota fiscal do outro CNPJ, desmarque CNPJ do balcão e salve. Depois marque neste',
            ],
            [
              '“Confira o CFOP (estadual começa com 5, interestadual com 6) e os códigos de situação.”',
              'Algum padrão dos itens está fora do formato',
              'Confira com a contabilidade os valores de CFOP, ICMS, PIS e COFINS',
            ],
            [
              '“A Focus não respondeu. Tente de novo em instantes.”',
              'A Focus NFe demorou ou está fora do ar',
              'Espere alguns minutos e salve de novo',
            ],
            [
              'Etiqueta “NF-e: Com erro”, com uma mensagem em vermelho na janela',
              'A Focus NFe recusou o cadastro do CNPJ. A mensagem é dela e diz o motivo',
              'Corrija o que a mensagem aponta e salve de novo. Se não entender, mande a mensagem ao suporte da Livih',
            ],
            [
              '“A NFS-e de (cidade) é pelo sistema da prefeitura (…)”',
              'A cidade do CNPJ não usa o padrão nacional da nota de serviço',
              'A NF-e de mercadoria segue normal. A nota de serviço desse CNPJ ainda não sai pela Livih',
            ],
            [
              'A opção Produção está apagada',
              'A etiqueta do CNPJ ainda não mostra “NF-e: Pronta para emitir”',
              'Resolva a situação do CNPJ, emita uma nota de teste e depois passe para produção',
            ],
          ]}
        />
        <Paragrafo>Dúvidas que este manual não responde: fale com o suporte da Livih.</Paragrafo>
      </Secao>
    </>
  )
}
