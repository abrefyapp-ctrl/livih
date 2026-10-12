// Embedded Signup da Meta: a empresa entra com o portfólio dela e conecta o número à API oficial.
// Na coexistência o número continua no app WhatsApp Business do celular.
//
// O fluxo devolve duas coisas por caminhos diferentes, e precisamos das duas:
//   - o código (FB.login), que vale 30 s e a função troca pelo token;
//   - a WABA e o número (postMessage da janela da Meta, tipo WA_EMBEDDED_SIGNUP).
// App ID e configuration ID não são segredo (vão para o navegador de qualquer jeito).

const APP_ID = '2190905941640235'
const CONFIG_ID = '1057665457305098'
const VERSAO_GRAPH = 'v25.0'
// v3 com coexistência: a v2 sai do ar em 15/10/2026, e a v4 não documenta como pedir coexistência pelo extras.
const EXTRAS = {
  setup: {},
  featureType: 'whatsapp_business_app_onboarding',
  version: 'v3',
}

type FB = {
  init: (o: Record<string, unknown>) => void
  login: (
    cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void,
    o: Record<string, unknown>,
  ) => void
}
declare global {
  interface Window {
    FB?: FB
    fbAsyncInit?: () => void
  }
}

export type ResultadoCadastro = {
  code: string
  waba_id: string
  phone_number_id?: string
  evento: string
}

let carregando: Promise<FB> | null = null

/** Carrega o SDK uma vez. Chamar cedo (ao abrir a tela): o login precisa sair direto do clique, senão o navegador bloqueia a janela. */
export function carregarSdkMeta(): Promise<FB> {
  if (window.FB) return Promise.resolve(window.FB)
  if (carregando) return carregando
  carregando = new Promise<FB>((resolver, rejeitar) => {
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId: APP_ID,
        autoLogAppEvents: true,
        xfbml: false,
        version: VERSAO_GRAPH,
      })
      resolver(window.FB!)
    }
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    s.async = true
    s.defer = true
    s.crossOrigin = 'anonymous'
    s.onerror = () => {
      carregando = null
      rejeitar(new Error('Não foi possível carregar o login da Meta. Desative bloqueadores e tente de novo.'))
    }
    document.body.appendChild(s)
  })
  return carregando
}

/** Abre o cadastro. Precisa ser chamada dentro do clique, com o SDK já carregado. */
export function abrirCadastroMeta(fb: FB): Promise<ResultadoCadastro> {
  return new Promise((resolver, rejeitar) => {
    let code: string | null = null
    let sessao: {
      waba_id: string
      phone_number_id?: string
      evento: string
    } | null = null
    let espera: ReturnType<typeof setTimeout> | undefined

    const terminar = (erro?: string) => {
      window.removeEventListener('message', ouvir)
      clearTimeout(espera)
      if (erro) rejeitar(new Error(erro))
      else resolver({ code: code!, ...sessao! })
    }
    const conferir = () => {
      if (code && sessao) terminar()
    }

    function ouvir(e: MessageEvent) {
      let host: string
      try {
        host = new URL(e.origin).hostname
      } catch {
        return
      }
      if (!/(^|\.)facebook\.com$/.test(host)) return
      let d: { type?: string; event?: string; data?: Record<string, string> }
      try {
        d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (d?.type !== 'WA_EMBEDDED_SIGNUP') return
      if (d.event === 'CANCEL') {
        terminar(d.data?.error_message ? `A Meta recusou: ${d.data.error_message}` : 'Conexão cancelada antes do fim.')
      } else if (d.event === 'ERROR') {
        terminar(`A Meta recusou: ${d.data?.error_message ?? 'erro no cadastro'}`)
      } else if (d.event?.startsWith('FINISH') && d.data?.waba_id) {
        sessao = {
          waba_id: d.data.waba_id,
          phone_number_id: d.data.phone_number_id,
          evento: d.event,
        }
        conferir()
      }
    }
    window.addEventListener('message', ouvir)

    fb.login(
      (r) => {
        if (!r.authResponse?.code) return terminar('Conexão cancelada antes do fim.')
        code = r.authResponse.code
        // A mensagem com a WABA às vezes chega logo depois do código.
        espera = setTimeout(() => terminar('A Meta não informou qual conta foi conectada. Tente de novo.'), 10_000)
        conferir()
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: EXTRAS,
      },
    )
  })
}
