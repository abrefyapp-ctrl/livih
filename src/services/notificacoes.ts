// Notificações push neste aparelho (migration 20261009160000 e Edge Function push-enviar).
// O aparelho se inscreve no serviço de push do navegador com a chave pública do Livih (push_config) e o banco
// guarda a inscrição (push_inscrever). Quem decide quando notificar é o banco.
import { ehIos, rodandoComoApp } from '../pwa'
import { supabase } from './supabaseClient'

export type EstadoNotificacoes =
  | 'sem_suporte' // navegador sem push
  | 'instalar_ios' // iPhone: só funciona com o app instalado na tela inicial
  | 'sem_service_worker' // ambiente de desenvolvimento
  | 'bloqueadas' // a pessoa negou a permissão
  | 'desativadas'
  | 'ativas'

const suportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function registro() {
  return 'serviceWorker' in navigator ? ((await navigator.serviceWorker.getRegistration()) ?? null) : null
}

export async function estadoNotificacoes(): Promise<EstadoNotificacoes> {
  if (ehIos() && !rodandoComoApp()) return 'instalar_ios'
  if (!suportaPush()) return 'sem_suporte'
  if (Notification.permission === 'denied') return 'bloqueadas'
  const reg = await registro()
  if (!reg) return 'sem_service_worker'
  const sub = await reg.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'ativas' : 'desativadas'
}

function chaveParaBytes(base64url: string) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function nomeDoAparelho() {
  const ua = navigator.userAgent
  const so = /iphone|ipad/i.test(ua) ? 'iPhone' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : 'outro sistema'
  const nav = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Navegador'
  return `${nav} no ${so}${rodandoComoApp() ? ' (app)' : ''}`
}

/** Pede a permissão e inscreve este aparelho. Devolve a mensagem de erro, se não deu. */
export async function ativarNotificacoes(): Promise<string | null> {
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return 'Sem permissão, o navegador não deixa mostrar notificações.'

  const reg = await registro()
  if (!reg) return 'As notificações funcionam só na versão publicada do Livih.'
  const { data: config } = await supabase.from('push_config').select('chave_publica').maybeSingle()
  if (!config) return 'As notificações ainda não foram configuradas no servidor. Avise o suporte da Livih.'
  const chave = chaveParaBytes(config.chave_publica)

  let sub = await reg.pushManager.getSubscription()
  // Inscrição antiga com outra chave (ex.: chaves trocadas no servidor) não serve: refaz.
  const atual = sub?.options.applicationServerKey
  if (sub && atual && new Uint8Array(atual).toString() !== chave.toString()) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave })

  const json = sub.toJSON()
  const { error } = await supabase.rpc('push_inscrever', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_dispositivo: nomeDoAparelho(),
  })
  return error ? 'Não foi possível ativar agora. Tente de novo.' : null
}

/** Para de receber neste aparelho (também usado ao sair da conta). */
export async function desativarNotificacoes() {
  const sub = await (await registro())?.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('push_cancelar', { p_endpoint: sub.endpoint })
  await sub.unsubscribe().catch(() => undefined)
}

export async function enviarNotificacaoTeste() {
  const { error } = await supabase.rpc('push_testar')
  return error ? 'Não foi possível enviar o teste.' : null
}
