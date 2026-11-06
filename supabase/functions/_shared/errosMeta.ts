// Erros da API oficial do WhatsApp (Meta) em português, para quem usa a Livih. Servem ao envio (whatsapp-enviar, quando a
// Meta recusa na hora) e ao meta-webhook (quando a Meta aceita e depois avisa que não entregou). Caso de 06/11: campanha
// com 0% entregue por 131042 e a tela não dizia por quê.

export const ERROS_META: Record<number, string> = {
  131047: "Passaram mais de 24 h desde a última mensagem do cliente. Fora dessa janela a API oficial só envia modelo aprovado.",
  131026: "O número não recebe mensagens (sem WhatsApp ou versão antiga).",
  131052: "A Meta não conseguiu baixar o arquivo. Tente enviar de novo.",
  131053: "A Meta recusou o arquivo (formato ou tamanho não aceito pelo WhatsApp).",
  132001: "Esse modelo não existe (ou não neste idioma) na conta do WhatsApp. Confira em Configurações → Modelos.",
  132000: "A quantidade de variáveis não bate com o modelo aprovado.",
  132015: "O modelo foi pausado pela Meta por baixa qualidade.",
  132016: "O modelo foi desativado pela Meta.",
  130497: "Envio bloqueado para o país deste número.",
  190: "O acesso ao WhatsApp oficial expirou. Conecte o número de novo em Configurações → WhatsApp.",
  131042:
    "Falta configurar a forma de pagamento na conta do WhatsApp Business. O administrador cadastra um cartão no Meta Business Suite → Configurações → Cobrança e pagamentos.",
  131049:
    "Mensagem de marketing segurada pela Meta para não cansar o cliente (limite por pessoa). Tente mais tarde ou em outra campanha.",
  131050: "O cliente pediu ao WhatsApp para não receber mensagens de marketing desta empresa.",
  131056: "Muitas mensagens para o mesmo número em pouco tempo. Espere alguns minutos e tente de novo.",
  131048: "A Meta limitou os envios deste número por denúncias ou bloqueios recentes. Reduza as campanhas por alguns dias.",
  131031: "A conta do WhatsApp Business está bloqueada pela Meta. Veja o aviso no Gerenciador do WhatsApp.",
  131051: "Tipo de mensagem não aceito pelo WhatsApp.",
  131021: "Não dá para enviar mensagem para o próprio número que envia.",
  130472: "Teste interno da Meta com este número. Não é erro da empresa.",
  368: "A Meta bloqueou temporariamente o envio por violação das políticas do WhatsApp.",
};

type ErroMeta = { code?: number | string; title?: string; message?: string; error_data?: { details?: string } };

/** Texto do motivo para gravar na mensagem; `erros` é o `statuses[].errors` do webhook. */
export function motivoNaoEntregue(erros: ErroMeta[] | undefined): string {
  const e = erros?.[0];
  if (!e) return "A Meta não entregou e não informou o motivo.";
  const conhecido = ERROS_META[Number(e.code)];
  if (conhecido) return `A Meta não entregou: ${conhecido}`;
  const detalhe = String(e.error_data?.details ?? e.message ?? e.title ?? "").trim().slice(0, 250);
  return `A Meta não entregou (código ${e.code ?? "?"})${detalhe ? `: ${detalhe}` : "."}`;
}
