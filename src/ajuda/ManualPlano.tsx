import { Caminho, Lista, Paragrafo, Secao, Subtitulo, Tabela } from './componentes'

// Manual de Plano e consumo (16/11). Texto tirado da tela Configurações → Plano e consumo (src/components/SecaoUsoIa.tsx,
// PlanoDaEmpresa.tsx, TrocaDePlano.tsx, FaturasDaEmpresa.tsx, ListaFaturas.tsx, DadosCobranca.tsx), das mensagens das
// funções do banco e das regras em docs/planos-modulos.md e docs/cobranca-asaas.md. Mudou a tela ou a regra, mude aqui.
// Os preços do plano, dos módulos e dos pacotes ficam de fora de propósito: a tela lê do banco, e o manual manda olhar
// lá. Só os itens de nota fiscal (CNPJ a mais e notas além das 100) têm valor aqui, como a tela mostra (revisão 16/11).

export const SECOES_PLANO = [
  { id: 'quem-pode', titulo: 'Quem vê e quem muda' },
  { id: 'plano', titulo: 'O plano da empresa' },
  { id: 'atendimento', titulo: 'O que conta como um atendimento' },
  { id: 'limite', titulo: 'Quando os atendimentos do mês acabam' },
  { id: 'pacote', titulo: 'Comprar mais atendimentos' },
  { id: 'trocar', titulo: 'Subir ou descer de plano' },
  { id: 'mensal-anual', titulo: 'Mensal ou anual' },
  { id: 'modulos', titulo: 'Módulos: ERP e Ordens de serviço' },
  { id: 'uso-ia', titulo: 'Uso da IA no mês' },
  { id: 'faturas', titulo: 'Faturas e pagamento' },
  { id: 'atraso', titulo: 'Fatura em atraso' },
  { id: 'dados-cobranca', titulo: 'Dados de cobrança' },
  { id: 'problemas', titulo: 'Problemas comuns' },
]

const titulo = (id: string) => SECOES_PLANO.find((s) => s.id === id)!.titulo

export function ManualPlano() {
  return (
    <>
      <Paragrafo>
        Em <Caminho>Configurações → Plano e consumo</Caminho> você vê o plano da sua empresa, quantos atendimentos o agente
        já fez no mês, as faturas da Livih e os dados de quem paga. É ali também que o dono troca de plano, passa para o
        anual, contrata módulos e compra mais atendimentos.
      </Paragrafo>

      <Secao id="quem-pode" titulo={titulo('quem-pode')}>
        <Paragrafo>
          Só o dono e os admins da empresa abrem esta tela. As outras pessoas da equipe veem só o aviso “Só o dono e
          os administradores da empresa veem o plano e o uso da IA.”
        </Paragrafo>
        <Tabela
          colunas={['O que', 'Dono', 'Admin']}
          linhas={[
            ['Ver o plano, o consumo, o uso da IA, as faturas e os dados de cobrança', 'Sim', 'Sim'],
            ['Abrir e pagar uma fatura', 'Sim', 'Sim'],
            ['Receber os avisos de consumo e de fatura em atraso', 'Sim', 'Sim'],
            ['Escolher o que acontece quando os atendimentos acabam', 'Sim', 'Não'],
            ['Comprar mais atendimentos', 'Sim', 'Não'],
            ['Trocar de plano, passar para o anual e contratar módulos', 'Sim', 'Não'],
            ['Mudar os dados de cobrança', 'Sim', 'Não'],
          ]}
        />
        <Paragrafo>
          Para o admin, as opções aparecem apagadas. Se precisar mudar algo, peça ao dono. O papel de cada pessoa
          aparece em <Caminho>Configurações → Equipe</Caminho>.
        </Paragrafo>
      </Secao>

      <Secao id="plano" titulo={titulo('plano')}>
        <Paragrafo>
          No alto da tela fica o nome do plano, o preço por mês (no anual, a data em que o plano renova), quantos números de
          WhatsApp ele permite e quantos atendimentos do agente ele traz por mês.
        </Paragrafo>
        <Paragrafo>
          Logo abaixo, a barra <Caminho>Atendimentos do agente em</Caminho> mostra o mês atual: quantos já foram usados, de
          quantos o mês tem (por exemplo, “120 de 350”). A barra muda de cor aos 80 % e fica vermelha quando os atendimentos
          acabam. Se a empresa comprou pacotes ou ganhou atendimentos de cortesia da Livih, uma linha embaixo mostra quanto
          veio do plano e quanto veio de fora.
        </Paragrafo>
        <Subtitulo>Os planos</Subtitulo>
        <Tabela
          colunas={['Plano', 'Atendimentos do agente por mês', 'Números de WhatsApp', 'ERP e Ordens de serviço']}
          linhas={[
            ['Essencial', '150', '1', 'Não tem'],
            ['Start', '350', '2', 'Contrata à parte'],
            ['Pro', '500', '3', 'Contrata à parte'],
            ['Business', '800', '5', 'Contrata à parte'],
          ]}
        />
        <Paragrafo>
          Todos os planos têm o agente. O preço de cada um, no mensal e no anual, aparece no cartão do plano, em{' '}
          <Caminho>Plano, forma de pagamento e módulos</Caminho>, mais abaixo na mesma tela.
        </Paragrafo>
        <Paragrafo>
          Se aparecer “A sua empresa ainda não tem um plano definido, e o agente atende sem limite de atendimentos”, o plano
          ainda não foi escolhido. Para escolher, fale com a equipe da Livih.
        </Paragrafo>
      </Secao>

      <Secao id="atendimento" titulo={titulo('atendimento')}>
        <Paragrafo>
          Um atendimento começa quando o agente responde uma conversa e dura 24 horas. Tudo o que ele mandar nesse tempo,
          naquela conversa, conta como um só. Se o cliente voltar a falar depois disso e o agente responder, conta outro.
        </Paragrafo>
        <Tabela
          colunas={['Exemplo', 'Quantos atendimentos']}
          linhas={[
            ['O cliente pergunta um preço às 9h e o agente troca 10 mensagens com ele até as 15h', '1'],
            ['O mesmo cliente volta no dia seguinte às 10h, e o agente responde', 'Mais 1 (já passaram as 24 horas)'],
            ['A equipe responde a conversa sozinha, sem o agente', 'Nenhum'],
            ['Você testa o agente no simulador', 'Nenhum'],
          ]}
        />
        <Lista
          itens={[
            'As 24 horas contam a partir da primeira resposta do agente, não da última mensagem.',
            'O atendimento conta no mês em que começou, pelo horário de Brasília.',
            'A contagem é feita na hora em que o agente responde.',
            'Todo dia 1, a contagem do mês começa do zero.',
          ]}
        />
      </Secao>

      <Secao id="limite" titulo={titulo('limite')}>
        <Paragrafo>
          Em <Caminho>Quando os atendimentos do mês acabarem</Caminho>, o dono escolhe uma de duas opções. A escolha vale na
          hora e pode ser mudada quando quiser. Se ninguém escolheu, vale <Caminho>Parar o agente</Caminho>.
        </Paragrafo>
        <Tabela
          colunas={['Opção', 'O que acontece', 'Quanto custa']}
          linhas={[
            [
              'Parar o agente',
              'As conversas novas vão para a equipe. O agente só termina os atendimentos que já tinha começado. Ele volta a atender conversas novas no dia 1 ou quando o dono compra um pacote',
              'Nada a mais',
            ],
            [
              'Continuar com o agente',
              'O agente segue atendendo normalmente',
              'Cada atendimento a mais tem o preço escrito na opção e entra na próxima fatura',
            ],
          ]}
        />
        <Paragrafo>
          Com <Caminho>Parar o agente</Caminho>, a conversa que passou para a equipe continua com ela, mesmo depois de virar
          o mês ou de comprar um pacote. Para o agente voltar a cuidar dela, abra a conversa e use{' '}
          <Caminho>Devolver ao agente</Caminho>.
        </Paragrafo>
        <Paragrafo>
          Com <Caminho>Continuar com o agente</Caminho>, a tela mostra quantos atendimentos a mais já houve no mês e quanto
          eles vão somar na próxima fatura.
        </Paragrafo>
        <Subtitulo>Avisos</Subtitulo>
        <Paragrafo>
          Quando o mês chega a 80 % dos atendimentos e quando eles acabam, o dono e os admins recebem um aviso:
        </Paragrafo>
        <Lista
          itens={[
            <>no celular, para quem ativou as notificações em <Caminho>Configurações → Notificações</Caminho>;</>,
            <>no WhatsApp cadastrado em <Caminho>Seus dados</Caminho> (clique no seu nome — no celular, na bolinha com a sua inicial —, no alto da tela).</>,
          ]}
        />
        <Paragrafo>
          Cada aviso sai uma vez por mês. Depois de comprar um pacote, os avisos voltam a sair aos 80 % e quando o novo limite
          acabar.
        </Paragrafo>
      </Secao>

      <Secao id="pacote" titulo={titulo('pacote')}>
        <Paragrafo>
          O dono pode comprar um pacote de atendimentos a qualquer momento, antes ou depois de acabarem. O botão fica logo
          abaixo da escolha e já diz quantos atendimentos vêm no pacote e o preço (por exemplo,{' '}
          <Caminho>Comprar 100 atendimentos por R$ …</Caminho>).
        </Paragrafo>
        <Lista
          numerada
          itens={[
            'Clique no botão do pacote.',
            'A janela mostra o limite do mês antes e depois da compra. Confira.',
            <>Clique em <Caminho>Comprar por R$ …</Caminho>. O limite do mês aumenta na hora.</>,
          ]}
        />
        <Lista
          itens={[
            'O valor do pacote entra na próxima fatura. Não sai uma cobrança separada.',
            'O pacote vale até o fim do mês da compra. O que sobrar não passa para o mês seguinte.',
            'Dá para comprar mais de um pacote no mesmo mês.',
            'Com Parar o agente, ele volta a atender as conversas novas assim que o pacote é comprado.',
          ]}
        />
        <Paragrafo>
          Se os atendimentos acabam todo mês, compare na tela o preço dos pacotes com o do plano de cima: às vezes subir de
          plano sai mais em conta.
        </Paragrafo>
      </Secao>

      <Secao id="trocar" titulo={titulo('trocar')}>
        <Paragrafo>
          Em <Caminho>Plano, forma de pagamento e módulos</Caminho>, na parte <Caminho>Planos</Caminho>, cada plano tem o
          botão <Caminho>Subir para o …</Caminho> ou <Caminho>Descer para o …</Caminho>. Antes de confirmar, uma janela mostra
          o que acontece e quanto custa. Nada muda até você confirmar.
        </Paragrafo>
        <Subtitulo>Subir de plano</Subtitulo>
        <Lista
          itens={[
            'Vale na hora: os números de WhatsApp do plano novo já ficam liberados.',
            'Neste mês, o limite de atendimentos cresce na proporção dos dias que faltam (a janela mostra o número). A partir do mês seguinte, vem o limite cheio do plano novo.',
            'No mensal, a diferença de preço dos dias que faltam (contando o dia da troca) entra na próxima fatura.',
            'No anual, sai uma cobrança avulsa da diferença pelos meses que faltam até a renovação. Ela vence em 3 dias e aparece em Faturas, na mesma tela. A data de renovação não muda.',
            'No teste grátis, não há diferença a pagar.',
          ]}
        />
        <Paragrafo>
          O botão de confirmar é <Caminho>Subir agora</Caminho>.
        </Paragrafo>
        <Subtitulo>Descer de plano</Subtitulo>
        <Lista
          itens={[
            'Vale no dia 1 do mês seguinte. No anual, só na renovação.',
            'Não há devolução da diferença do período que já foi pago.',
            'Até a troca, continua o plano atual. Mas, para conectar um número novo de WhatsApp, já vale o limite do plano menor.',
            <>Para desistir antes da data, clique em <Caminho>Manter o plano …</Caminho>, no aviso que aparece acima dos planos.</>,
          ]}
        />
        <Paragrafo>
          O botão de confirmar é <Caminho>Agendar a troca</Caminho>.
        </Paragrafo>
        <Subtitulo>Quando a troca é recusada</Subtitulo>
        <Lista
          itens={[
            <>
              <strong className="text-texto">O plano novo tem menos números de WhatsApp do que a empresa usa.</strong> Remova
              os que sobram em <Caminho>Configurações → WhatsApp</Caminho>, com o botão Remover, e tente de novo.
              Desconectar não libera a vaga.
            </>,
            <>
              <strong className="text-texto">Descer para o Essencial com módulos contratados.</strong> O Essencial não tem ERP
              nem Ordens de serviço. Desligue os módulos antes, na mesma tela. Eles continuam funcionando até a troca.
            </>,
            <>
              <strong className="text-texto">A troca pela tela não está liberada para a sua empresa</strong>, como quando o
              plano tem um valor combinado com a Livih. A tela avisa, e a troca é feita pela equipe da Livih.
            </>,
          ]}
        />
      </Secao>

      <Secao id="mensal-anual" titulo={titulo('mensal-anual')}>
        <Paragrafo>
          Na parte <Caminho>Mensal ou anual</Caminho>, o cartão com a marca <Caminho>Atual</Caminho> é o jeito como a empresa
          paga hoje.
        </Paragrafo>
        <Tabela
          colunas={['O que', 'Mensal', 'Anual: pague 10 meses e use 12']}
          linhas={[
            ['Fatura', 'Uma por mês, com vencimento no dia 10', 'Uma a cada 12 meses, com vencimento no dia 10'],
            ['Como pagar', 'Pix, boleto ou cartão', 'À vista (Pix, boleto ou cartão) ou no cartão em até 12x sem juros'],
            ['Atendimentos a mais e pacotes', 'Na fatura do mês seguinte', 'Numa fatura mensal à parte, no mês seguinte'],
            ['Descer de plano e desligar módulo', 'Vale no dia 1 do mês seguinte', 'Vale só na renovação'],
          ]}
        />
        <Subtitulo>Passar para o anual</Subtitulo>
        <Lista
          numerada
          itens={[
            <>Clique em <Caminho>Passar para o anual</Caminho>.</>,
            'A janela mostra quando o anual começa e o valor do ano, com o plano e os módulos contratados.',
            <>Escolha a <Caminho>Forma de pagamento</Caminho>: à vista ou no cartão de 2 a 12 vezes.</>,
            <>Clique em <Caminho>Passar para o anual</Caminho>. A fatura do ano sai no dia em que o anual começa.</>,
          ]}
        />
        <Lista
          itens={[
            'O anual renova sozinho a cada 12 meses, pelo preço de tabela do momento. O dono recebe um aviso 15 dias antes.',
            <>Para mudar só a forma de pagamento do próximo ano, use <Caminho>Mudar a forma de pagamento</Caminho>.</>,
            'Se cancelar o anual, a devolução é integral até 7 dias depois do pagamento. Depois disso, a Livih devolve o que foi pago menos os meses usados, contados a preço mensal. Para cancelar com devolução, fale com a equipe da Livih.',
          ]}
        />
        <Subtitulo>Voltar ao mensal</Subtitulo>
        <Paragrafo>
          Clique em <Caminho>Voltar ao mensal</Caminho>. O anual continua até o fim do período já pago e, daí em diante, a
          empresa paga por mês. Se a fatura do ano ainda não saiu, a volta é na hora. Mudou de ideia antes da data? Use{' '}
          <Caminho>Continuar no anual</Caminho>, no aviso que aparece.
        </Paragrafo>
      </Secao>

      <Secao id="modulos" titulo={titulo('modulos')}>
        <Paragrafo>
          Os módulos <Caminho>Pedidos e estoque (ERP)</Caminho> e <Caminho>Ordens de serviço</Caminho> são pagos à parte, do
          plano Start para cima. A nota fiscal vem com eles: a NF-e com o ERP, e a NFS-e com as Ordens de serviço. Os dois
          juntos têm desconto. O preço de cada um, e dos dois juntos, aparece na parte <Caminho>Módulos</Caminho>.
        </Paragrafo>
        <Subtitulo>Contratar</Subtitulo>
        <Lista
          itens={[
            <>Clique em <Caminho>Contratar</Caminho>, confira a janela e clique em <Caminho>Contratar agora</Caminho>.</>,
            'O módulo liga na hora e já aparece no menu.',
            'No mensal, a diferença dos dias que faltam no mês entra na próxima fatura. No anual, sai uma cobrança avulsa pelos meses que faltam até a renovação, com vencimento em 3 dias.',
            <>Para emitir nota, abra <Caminho>Configurações → Empresa</Caminho> e clique em <Caminho>Nota fiscal</Caminho> na linha do CNPJ (veja o manual Empresa e nota fiscal).</>,
          ]}
        />
        <Paragrafo>
          Com o módulo, a empresa emite nota por 1 CNPJ, com 100 notas por mês nesse CNPJ. Além disso, entram na fatura:
        </Paragrafo>
        <Lista
          itens={[
            'CNPJ a mais: R$ 49 por mês, a partir do segundo CNPJ emitindo nota em produção. Só com módulo pago.',
            'Notas além das 100 do mês, em cada CNPJ: R$ 0,20 cada.',
          ]}
        />
        <Paragrafo>
          Na parte Faturas, uma linha lembra esses valores para quem usa a nota fiscal.
        </Paragrafo>
        <Subtitulo>Desligar</Subtitulo>
        <Lista
          itens={[
            'O módulo continua ligado até o dia 1 do mês seguinte (no anual, até a renovação), sem devolução. No teste grátis, desliga na hora.',
            'Sem o ERP e sem as Ordens de serviço, a empresa deixa de emitir nota fiscal. As notas já emitidas continuam visíveis.',
            'Nada é apagado: se ligar o módulo de novo, está tudo lá.',
            <>Para desistir antes da data, clique em <Caminho>Manter o módulo</Caminho>.</>,
          ]}
        />
      </Secao>

      <Secao id="uso-ia" titulo={titulo('uso-ia')}>
        <Paragrafo>
          Abaixo do plano, <Caminho>Uso da IA</Caminho> mostra três números do mês. Eles são só para acompanhar o trabalho
          do agente: o que conta para o plano são os atendimentos, na barra de cima. Uma conversa longa, de vários dias, pode
          somar mais de um atendimento.
        </Paragrafo>
        <Tabela
          colunas={['Número', 'O que é']}
          linhas={[
            ['Conversas atendidas pelo agente', 'Quantas conversas diferentes tiveram resposta do agente no mês'],
            ['Respostas do agente', 'Quantas mensagens o agente mandou'],
            ['Áudios transcritos', 'Quantos áudios dos clientes o agente transformou em texto, com o total de minutos ao lado'],
          ]}
        />
        <Paragrafo>
          Estes números são atualizados a cada poucos minutos. Por isso, podem ficar um pouco atrás da barra de atendimentos,
          que conta na hora. Embaixo, a tabela <Caminho>Meses anteriores</Caminho> mostra os últimos meses.
        </Paragrafo>
      </Secao>

      <Secao id="faturas" titulo={titulo('faturas')}>
        <Paragrafo>
          A parte <Caminho>Faturas</Caminho> aparece quando a empresa tem a primeira fatura e mostra as mais recentes. Cada
          uma traz o mês, a situação, o valor, o vencimento e os itens cobrados.
        </Paragrafo>
        <Subtitulo>O que entra na fatura</Subtitulo>
        <Lista
          itens={[
            'O plano e os módulos do mês (no anual, do ano inteiro, na fatura em que o ano começa).',
            'Os atendimentos a mais e os pacotes do mês anterior.',
            'As diferenças de troca de plano ou de módulo no mensal, quando houver.',
            'Os CNPJs a mais emitindo nota (R$ 49 por mês cada) e as notas além das 100 do mês em cada CNPJ (R$ 0,20 cada). Veja Módulos.',
          ]}
        />
        <Paragrafo>
          As faturas vencem no dia 10. A primeira e as cobranças avulsas (a diferença do anual ao subir de plano ou contratar
          módulo) vencem em outra data: confira em cada fatura.
        </Paragrafo>
        <Subtitulo>Como pagar</Subtitulo>
        <Lista
          numerada
          itens={[
            <>Na fatura, clique em <Caminho>Abrir fatura (Pix, boleto ou cartão)</Caminho>. No anual parcelado, o botão diz o número de parcelas.</>,
            'Abre a página de pagamento do Asaas, que faz a cobrança da Livih. Escolha Pix, boleto ou cartão.',
            'Depois de pagar, atualize a página da Livih. O pagamento aparece assim que é confirmado: Pix e cartão na hora, boleto em até 3 dias úteis.',
          ]}
        />
        <Paragrafo>
          Precisa da fatura de novo (a segunda via)? Use o mesmo botão. Ele fica na fatura enquanto ela está a pagar ou
          vencida.
        </Paragrafo>
        <Subtitulo>Situação da fatura</Subtitulo>
        <Tabela
          colunas={['Situação', 'O que quer dizer']}
          linhas={[
            ['Gerando a cobrança', 'A fatura foi fechada e o link de pagamento está sendo criado'],
            ['A pagar', 'Pronta para pagar, dentro do prazo'],
            ['Vencida', 'Passou do vencimento sem pagamento. Pague o quanto antes (veja Fatura em atraso)'],
            ['Paga', 'O pagamento foi confirmado. A data aparece ao lado do vencimento'],
            ['Sem link de pagamento', 'O link não foi criado. Confira os dados de cobrança e salve; a Livih tenta de novo no dia seguinte'],
            ['Cancelando ou Cancelada', 'A fatura foi cancelada pela Livih e não precisa ser paga'],
            ['Estornada', 'O pagamento foi devolvido'],
          ]}
        />
      </Secao>

      <Secao id="atraso" titulo={titulo('atraso')}>
        <Tabela
          colunas={['Quando', 'O que acontece']}
          linhas={[
            ['Depois do vencimento', 'A fatura fica Vencida, com multa de 2 % e juros de 1 % ao mês'],
            [
              '3 dias de atraso',
              'O dono e os admins recebem um aviso no celular e no WhatsApp, com o link de pagamento e a data-limite para pagar sem suspensão',
            ],
            [
              '10 dias de atraso',
              'O acesso da empresa é suspenso: o agente não responde, a equipe não consegue entrar e as mensagens que chegarem não entram na Livih. Nada é apagado',
            ],
          ]}
        />
        <Paragrafo>
          Com o acesso suspenso, o dono e os admins, ao entrar, veem a tela{' '}
          <Caminho>Acesso suspenso por fatura em atraso</Caminho>, com as faturas e os dados de cobrança. Pague por lá. O
          acesso volta sozinho quando o pagamento é confirmado. Depois, atualize a página para entrar.
        </Paragrafo>
        <Paragrafo>
          Boleto leva até 3 dias úteis para compensar. Perto do prazo, prefira Pix ou cartão.
        </Paragrafo>
      </Secao>

      <Secao id="dados-cobranca" titulo={titulo('dados-cobranca')}>
        <Paragrafo>
          Em <Caminho>Dados de cobrança</Caminho> ficam os dados de quem paga a Livih. A cobrança do plano sai com estes dados. Só o dono muda.
        </Paragrafo>
        <Lista
          itens={[
            'Nome ou razão social',
            'CNPJ ou CPF',
            'E-mail de cobrança: de quem cuida dos pagamentos da empresa',
            'Telefone (opcional)',
            'Endereço: CEP, rua, número, complemento (opcional), bairro, cidade e UF. Ao digitar o CEP, a Livih preenche rua, bairro, cidade e UF que estiverem vazios',
          ]}
        />
        <Paragrafo>
          Preencha tudo e clique em <Caminho>Salvar dados de cobrança</Caminho>. O botão só libera com os campos obrigatórios
          preenchidos.
        </Paragrafo>
        <Paragrafo>
          Se aparecer “Ainda não salvos: trouxemos os dados de Configurações → Empresa”, a Livih sugeriu os dados da sua
          empresa, mas eles só valem depois de salvos. Confira, complete e salve.
        </Paragrafo>
        <Paragrafo>
          Estes dados são só para a cobrança da Livih. Eles não mudam o CNPJ que emite nota para os seus clientes, que fica em{' '}
          <Caminho>Configurações → Empresa</Caminho>.
        </Paragrafo>
      </Secao>

      <Secao id="problemas" titulo={titulo('problemas')}>
        <Subtitulo>Plano e pacotes</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Só o dono e os administradores da empresa veem o plano e o uso da IA.”',
              'Você não é dono nem admin da empresa',
              'Peça ao dono',
            ],
            [
              'As opções aparecem apagadas, com “Só o dono da empresa muda esta escolha e compra pacotes.”',
              'Você é admin. Só o dono muda o plano, compra pacotes e muda os dados de cobrança',
              'Peça ao dono',
            ],
            [
              '“A sua empresa ainda não tem um plano definido…”',
              'O plano da empresa ainda não foi escolhido',
              'Fale com a equipe da Livih',
            ],
            [
              '“Para escolher ou trocar o plano, fale com a equipe da Livih.”',
              'A troca pela tela ainda não está liberada para a sua empresa',
              'Fale com a equipe da Livih',
            ],
            [
              '“O plano da sua empresa tem um valor combinado. Para trocar, fale com a equipe da Livih.”',
              'O preço da sua empresa foi combinado à parte e não segue a tabela',
              'Fale com a equipe da Livih',
            ],
            [
              '“O plano … permite … de WhatsApp, e a empresa tem … em Configurações → WhatsApp…”',
              'O plano escolhido tem menos números do que a empresa usa',
              'Em Configurações → WhatsApp, remova os que sobram (botão Remover; Desconectar não libera a vaga) e tente de novo',
            ],
            [
              '“O plano Essencial não inclui ERP nem Ordens de serviço. Para descer, desligue antes estes módulos…”',
              'O Essencial não tem módulos',
              'Desligue os módulos na mesma tela e peça a troca de novo',
            ],
            [
              '“O plano Essencial não inclui ERP nem Ordens de serviço. Para contratar, suba para o Start…”',
              'Módulo só a partir do Start',
              'Suba para o Start ou um plano acima e contrate o módulo',
            ],
            [
              '“O plano …, que começa em …, não inclui ERP nem Ordens de serviço…”',
              'Há uma descida para o Essencial agendada',
              'Clique em Manter o plano … e contrate o módulo',
            ],
            [
              '“O limite do mês mudou enquanto você comprava…”',
              'O limite mudou entre abrir a janela e confirmar (por exemplo, um clique duplo)',
              'Confira o consumo na tela e compre de novo só se ainda precisar',
            ],
            [
              'O agente parou de atender conversas novas',
              'Os atendimentos do mês acabaram, com a escolha Parar o agente',
              'Compre um pacote, mude para Continuar com o agente ou espere o dia 1',
            ],
            [
              'Com Parar o agente, o uso passou um pouco do limite',
              'Uma resposta que o agente já estava preparando saiu depois de o limite acabar',
              'Nada a fazer: esse atendimento não é cobrado',
            ],
            [
              '“Não foi possível … Confira a internet e tente de novo.”',
              'A conexão falhou no meio do caminho',
              'Confira a internet e tente de novo. Se continuar, fale com o suporte da Livih',
            ],
          ]}
        />
        <Subtitulo>Faturas e atraso</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              'Fatura “Sem link de pagamento”',
              'Os dados de cobrança estão incompletos ou com erro',
              'Confira os dados de cobrança e salve. A Livih tenta de novo no dia seguinte',
            ],
            [
              'Paguei e a fatura continua “A pagar”',
              'O pagamento ainda não foi confirmado. Boleto leva até 3 dias úteis',
              'Atualize a página. Se passar desse prazo, fale com a equipe da Livih',
            ],
            [
              'Não aparece a parte Faturas',
              'A empresa ainda não tem fatura',
              'Ela aparece sozinha com a primeira fatura',
            ],
            [
              '“Acesso suspenso por fatura em atraso”, ao entrar',
              'Uma fatura passou de 10 dias de atraso',
              'Pague a fatura nessa tela. O acesso volta sozinho quando o pagamento é confirmado',
            ],
          ]}
        />
        <Subtitulo>Dados de cobrança</Subtitulo>
        <Tabela
          colunas={['O que aparece', 'Por quê', 'Como resolver']}
          linhas={[
            [
              '“Faltam os dados de cobrança. Preencha e salve.”',
              'A empresa ainda não tem dados de cobrança',
              'O dono preenche e clica em Salvar dados de cobrança',
            ],
            [
              'O botão Salvar dados de cobrança não libera',
              'Falta um campo obrigatório. Só telefone e complemento são opcionais',
              'Preencha o que falta',
            ],
            [
              '“CNPJ ou CPF inválido. Confira o que foi digitado.”',
              'O número não confere',
              'Digite de novo, com todos os números (o CNPJ pode ter letras)',
            ],
            ['“Informe um e-mail de cobrança válido.”', 'O e-mail está incompleto ou com erro', 'Corrija o e-mail'],
            ['“CEP inválido. Use os 8 números.”', 'O CEP não tem 8 números', 'Corrija o CEP'],
            [
              '“Telefone inválido. Use o DDD e o número, como (41) 99999-9999.”',
              'Falta o DDD ou um número',
              'Corrija o telefone ou deixe em branco: ele é opcional',
            ],
            ['“Informe a UF com a sigla do estado, como PR.”', 'A UF não é uma sigla de estado', 'Use as duas letras do estado'],
          ]}
        />
        <Paragrafo>Dúvidas que este manual não responde: fale com o suporte da Livih.</Paragrafo>
      </Secao>
    </>
  )
}
