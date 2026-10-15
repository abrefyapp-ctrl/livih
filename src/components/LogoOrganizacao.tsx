import { useEffect, useState } from 'react'
import { EVENTO_LOGO, logoPadrao } from '../services/empresa'
import { Avatar } from './Avatar'

/** Logo da empresa padrão (Configurações → Empresa); sem logo, as iniciais. */
export function LogoOrganizacao({ orgId, nome }: { orgId: string; nome: string }) {
  const [logo, setLogo] = useState<{ orgId: string; url: string | null } | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    const recarregar = () => setVersao((v) => v + 1)
    window.addEventListener(EVENTO_LOGO, recarregar)
    return () => window.removeEventListener(EVENTO_LOGO, recarregar)
  }, [])

  useEffect(() => {
    let ativo = true
    logoPadrao(orgId)
      .then((url) => ativo && setLogo({ orgId, url }))
      .catch(() => ativo && setLogo({ orgId, url: null }))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  const url = logo?.orgId === orgId ? logo.url : null
  if (!url) return <Avatar nome={nome} tamanho="sm" tom="organizacao" />
  return (
    <img
      src={url}
      alt={nome}
      onError={() => setLogo({ orgId, url: null })}
      className="size-8 shrink-0 rounded-md bg-white object-contain ring-1 ring-borda"
    />
  )
}
