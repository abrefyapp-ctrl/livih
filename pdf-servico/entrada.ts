// Ponto de entrada do serviço livih-pdf: o MESMO componente do orçamento usado no navegador (um layout só).
// Empacotado com `npm run pdf:build` (vite em modo servidor) para pdf-servico/dist/entrada.js.
export { gerarPdf } from '../src/components/DocumentoOrcamento'
export { nomeArquivoOrcamento } from '../src/services/formato'
