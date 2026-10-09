// PWA: registro do service worker (public/sw.js) e o pedido de instalação do navegador.
// O evento beforeinstallprompt chega cedo, antes do React montar: por isso fica aqui, fora de componente.
import { useSyncExternalStore } from 'react'

interface PedidoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pedido: PedidoInstalacao | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // o app mostra o próprio botão "Instalar app"
  pedido = e as PedidoInstalacao
  avisar()
})
window.addEventListener('appinstalled', () => {
  pedido = null
  avisar()
})

export function registrarServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

/** Já está aberto como app instalado (tela inicial / janela própria)? */
export const rodandoComoApp = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iPhone/iPad: o Safari não tem pedido de instalação; o caminho é Compartilhar → Adicionar à Tela de Início. */
export const ehIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Botão "Instalar app": `pronto` quando o navegador oferece instalação; `ios` quando dá para instalar pelo Safari. */
export function useInstalarApp() {
  const pronto = useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    () => pedido !== null,
  )
  const ios = !rodandoComoApp() && ehIos()
  async function instalar() {
    if (!pedido) return
    await pedido.prompt()
    await pedido.userChoice.catch(() => undefined)
    pedido = null
    avisar()
  }
  return { pronto, ios, instalar }
}
