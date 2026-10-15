// Abre o app num Chrome headless SEM login e confere se a tela desenha.
// Pega o tipo de bug do e56b6fe: erro de JS no boot deixa o #root vazio (tela branca).
//
// Uso:  npm run verificar                       (produção: https://app.livih.com.br)
//       npm run verificar -- http://localhost:4173
//       npm run publicar                        (build + push + espera a Cloudflare publicar + verifica)
// Chrome em outro lugar: CHROME_PATH="C:\...\chrome.exe"
//
// --esperar: o deploy é feito pela Cloudflare a cada push na main, alguns minutos depois. Antes de
// verificar, espera o site servir o mesmo bundle do dist/ local (o hash do build bate com o da Cloudflare).

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const esperar = args.includes('--esperar')
const url = args.find((a) => !a.startsWith('--')) ?? 'https://app.livih.com.br/'

const bundleDe = (html) => html.match(/assets\/(index-[\w-]+\.js)/)?.[1]

if (esperar) {
  const esperado = existsSync('dist/index.html') ? bundleDe(readFileSync('dist/index.html', 'utf8')) : undefined
  if (!esperado) {
    console.error('--esperar precisa do build local (dist/index.html). Rode npm run build antes.')
    process.exit(2)
  }
  const LIMITE_MS = 10 * 60_000
  const inicio = Date.now()
  let noAr
  console.log(`Esperando a Cloudflare publicar ${esperado}…`)
  while (Date.now() - inicio < LIMITE_MS) {
    try {
      noAr = bundleDe(await (await fetch(url, { cache: 'no-store' })).text())
    } catch {
      noAr = undefined
    }
    if (noAr === esperado) break
    await new Promise((ok) => setTimeout(ok, 15_000))
  }
  if (noAr !== esperado) {
    console.error(
      `\nFALHOU: depois de 10 min o site ainda serve ${noAr ?? '(sem resposta)'}, não ${esperado}.\n` +
        'Veja o build no painel da Cloudflare (Workers → livih → Deployments). Se o dist/ local tinha ' +
        'mudanças não commitadas, o hash não bate mesmo; rode npm run verificar direto.',
    )
    process.exit(1)
  }
  console.log(`No ar após ${Math.round((Date.now() - inicio) / 1000)} s.\n`)
}

const candidatos = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)
const chrome = candidatos.find((c) => existsSync(c))
if (!chrome) {
  console.error('Chrome não encontrado. Defina CHROME_PATH.')
  process.exit(2)
}

// Perfil descartável: sem cookies nem sessão = visitante sem login, e sem service worker antigo.
function abrir() {
  const perfil = mkdtempSync(join(tmpdir(), 'livih-verificar-'))
  const r = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      `--user-data-dir=${perfil}`,
      '--enable-logging=stderr',
      '--v=0',
      '--virtual-time-budget=10000',
      '--dump-dom',
      url,
    ],
    { encoding: 'utf8', timeout: 60_000 },
  )
  rmSync(perfil, { recursive: true, force: true })
  if (r.error) {
    console.error(`Falha ao rodar o Chrome: ${r.error.message}`)
    process.exit(2)
  }
  return r
}

let r = abrir()
// Logo depois do deploy, partes da Cloudflare ainda servem a versão anterior por alguns segundos (bundle trocado,
// tela branca). Antes de acusar falha, tenta mais uma vez.
if (esperar && (!bundleDe(r.stdout ?? '') || !(r.stdout ?? '').match(/<div id="root">\s*<\w/))) {
  console.log('A primeira abertura pegou o deploy no meio; tentando de novo em 30 s…')
  await new Promise((ok) => setTimeout(ok, 30_000))
  r = abrir()
}

const dom = r.stdout ?? ''
const bundle = bundleDe(dom) ?? '?'
const root = dom.match(/<div id="root">([\s\S]*?)<\/div>/)?.[1]?.trim() ?? ''

// Só erros do próprio site; o aviso de CacheStorage do sw.js é do perfil headless e não indica bug.
const erros = (r.stderr ?? '')
  .split('\n')
  .filter((l) => l.includes(':CONSOLE') && /Uncaught|Error/.test(l))
  .filter((l) => !l.includes("on 'CacheStorage'"))
  .map((l) => l.replace(/^.*?:CONSOLE[^\]]*\]\s*/, ''))

console.log(`URL:    ${url}`)
console.log(`Bundle: ${bundle}`)

if (erros.length) {
  console.log('\nErros no console:')
  for (const e of erros) console.log(`  - ${e}`)
}

if (!root) {
  console.error('\nFALHOU: #root vazio — o app não desenhou nada (tela branca).')
  process.exit(1)
}
if (erros.length) {
  console.error('\nFALHOU: o app desenhou, mas houve erro de JS.')
  process.exit(1)
}
console.log('\nOK: o app desenhou a tela sem erro de JS.')
