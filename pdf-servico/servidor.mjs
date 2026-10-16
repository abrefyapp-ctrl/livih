// Serviço livih-pdf: gera o PDF do orçamento no servidor, para o agente (n8n) enviar pelo WhatsApp.
// POST /orcamento  { dados: DadosOrcamento sem `logo`, logo_url?: string }  →  application/pdf
// Só na rede interna do n8n (sem porta publicada). Com PDF_TOKEN definido, exige o header x-livih-token.
import { createServer } from 'node:http'
import { gerarPdf, nomeArquivoOrcamento } from './dist/entrada.js'

const TOKEN = process.env.PDF_TOKEN || ''
const LIMITE = 2 * 1024 * 1024

async function logoComoDataUrl(url) {
  if (!url) return null
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return null
    const tipo = r.headers.get('content-type') || 'image/png'
    return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

function responder(res, status, corpo, cabecalhos = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...cabecalhos })
  res.end(typeof corpo === 'string' || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo))
}

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/saude') return responder(res, 200, { ok: true })
  if (req.method !== 'POST' || req.url !== '/orcamento') return responder(res, 404, { erro: 'rota inexistente' })
  if (TOKEN && req.headers['x-livih-token'] !== TOKEN) return responder(res, 401, { erro: 'não autorizado' })
  try {
    const partes = []
    let tamanho = 0
    for await (const p of req) {
      tamanho += p.length
      if (tamanho > LIMITE) return responder(res, 413, { erro: 'corpo grande demais' })
      partes.push(p)
    }
    const { dados, logo_url } = JSON.parse(Buffer.concat(partes).toString('utf8'))
    if (!dados?.pedido || !Array.isArray(dados?.itens)) return responder(res, 400, { erro: 'dados do orçamento incompletos' })
    const blob = await gerarPdf({ ...dados, logo: await logoComoDataUrl(logo_url) })
    const pdf = Buffer.from(await blob.arrayBuffer())
    responder(res, 200, pdf, {
      'content-type': 'application/pdf',
      'x-nome-arquivo': encodeURIComponent(nomeArquivoOrcamento(dados)),
    })
  } catch (e) {
    console.error('orcamento:', e)
    responder(res, 500, { erro: String(e?.message || e).slice(0, 300) })
  }
}).listen(Number(process.env.PORT || 3000), () => console.log('livih-pdf ouvindo na porta', process.env.PORT || 3000))
