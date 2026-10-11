# Pendências

Coisas anotadas para corrigir depois. Tirar daqui quando entrar no commit.

## Front

- **Selo de data cobre a mensagem ao rolar** (anotado em 10/10). O separador "Hoje" da conversa é
  `sticky top-0` ([PainelConversa.tsx](../src/components/PainelConversa.tsx), no `<li>` do separador de dia) e,
  ao rolar, fica por cima do texto do balão logo abaixo. Visto no print da conversa da Fer (canal 4133663942).
  Ideia: separador fixo só como pílula com fundo/sombra e espaço reservado, ou deixar de ser sticky e mostrar
  a data flutuante só durante a rolagem (como o WhatsApp).
