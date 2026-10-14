// Abre o app num Chrome headless SEM login e confere se a tela desenha.
// Pega o tipo de bug do e56b6fe: erro de JS no boot deixa o #root vazio (tela branca).
//
// Uso:  npm run verificar                       (produção: https://app.livih.com.br)
//       npm run verificar -- http://localhost:4173
// Chrome em outro lugar: CHROME_PATH="C:\...\chrome.exe"

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] ?? 'https://app.livih.com.br/'

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

const dom = r.stdout ?? ''
const bundle = dom.match(/assets\/(index-[\w-]+\.js)/)?.[1] ?? '?'
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
