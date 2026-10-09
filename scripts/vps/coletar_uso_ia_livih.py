#!/usr/bin/env python3
"""Coletor do consumo de IA do agente do Livih (n8n) para a tabela uso_ia do Supabase do Livih.

O agente roda no n8n (workflow LvhAgenteLivih01). Cada execução guarda, nos dados da execução, os tokens de cada
chamada ao modelo (promptTokens/completionTokens) e a referência enviada pelo waha-webhook (org_id, conversa_id,
mensagem_id). Este coletor lê as execuções novas no Postgres do n8n e grava uma linha por execução em uso_ia.
Não mexe no workflow: importar workflow no n8n o desativa.

- Roda pelo cron a cada 10 min (/etc/cron.d/coletar_uso_ia_livih). Log em /var/log/coletor_uso_ia.log.
- Idempotente: origem_ref = 'n8n:<id da execução>' é única no banco; o estado só avança depois de gravar.
- O n8n apaga dados de execuções antigas (padrão: 14 dias); o cron frequente evita perder alguma.
- Credenciais: LIVIH_SUPABASE_URL / LIVIH_SUPABASE_KEY do /docker/n8n/.env (chave de serviço).

Uso: coletar_uso_ia_livih.py            -> coleta as execuções novas
     coletar_uso_ia_livih.py --desde 0  -> reprocessa desde o início (não duplica)
"""
import csv, datetime, io, json, os, subprocess, sys, urllib.request

WORKFLOW = "LvhAgenteLivih01"
ESTADO = "/var/lib/coletor_uso_ia/ultimo_id"
ENV = "/docker/n8n/.env"
LOTE = 200


def log(msg):
    print(f"{datetime.datetime.utcnow():%Y-%m-%d %H:%M:%S} {msg}", flush=True)


def env():
    d = {}
    for linha in open(ENV, encoding="utf-8"):
        if "=" in linha and not linha.startswith("#"):
            k, v = linha.rstrip("\n").split("=", 1)
            d[k] = v.strip().strip('"').strip("'")
    return d["LIVIH_SUPABASE_URL"].rstrip("/"), d["LIVIH_SUPABASE_KEY"]


def execucoes(desde):
    sql = (
        'copy (select e.id, e."startedAt", d.data from execution_entity e '
        'join execution_data d on d."executionId" = e.id '
        f"where e.\"workflowId\" = '{WORKFLOW}' and e.id > {int(desde)} and e.\"stoppedAt\" is not null "
        f"order by e.id limit {LOTE}) to stdout with (format csv)"
    )
    saida = subprocess.run(
        ["docker", "exec", "-i", "n8n-postgres", "psql", "-U", "n8n", "-d", "n8ndb", "-c", sql],
        capture_output=True, check=True,
    ).stdout.decode("utf-8")
    csv.field_size_limit(10**9)
    return list(csv.reader(io.StringIO(saida)))


def desachatar(texto):
    """Formato 'flatted' do n8n: um array em que strings numéricas apontam para outros itens."""
    arr = json.loads(texto)
    vistos = {}

    def resolver(i):
        if i in vistos:
            return vistos[i]
        v = arr[i]
        if isinstance(v, dict):
            out = {}
            vistos[i] = out
            for k, x in v.items():
                out[k] = resolver(int(x)) if isinstance(x, str) and x.isdigit() else x
            return out
        if isinstance(v, list):
            out = []
            vistos[i] = out
            for x in v:
                out.append(resolver(int(x)) if isinstance(x, str) and x.isdigit() else x)
            return out
        vistos[i] = v
        return v

    return resolver(0)


def extrair(dados):
    chamadas = entrada = saida = 0
    modelo = None
    ref = None
    pilha, vistos = [dados], set()
    while pilha:
        o = pilha.pop()
        if id(o) in vistos:
            continue
        vistos.add(id(o))
        if isinstance(o, dict):
            if "promptTokens" in o and "completionTokens" in o:
                chamadas += 1
                entrada += int(o.get("promptTokens") or 0)
                saida += int(o.get("completionTokens") or 0)
            m = o.get("model")
            if isinstance(m, str) and m.startswith("gpt") and not modelo:
                modelo = m
            if ref is None and isinstance(o.get("org_id"), str) and isinstance(o.get("conversa_id"), str):
                ref = {"org_id": o["org_id"], "conversa_id": o["conversa_id"], "mensagem_id": o.get("mensagem_id")}
            pilha.extend(o.values())
        elif isinstance(o, list):
            pilha.extend(o)
    return chamadas, entrada, saida, modelo, ref


def gravar(url, chave, linhas):
    req = urllib.request.Request(
        f"{url}/rest/v1/uso_ia?on_conflict=origem_ref",
        data=json.dumps(linhas).encode(),
        method="POST",
        headers={
            "apikey": chave,
            "Authorization": f"Bearer {chave}",
            "Content-Type": "application/json",
            "Prefer": "resolution=ignore-duplicates,return=minimal",
        },
    )
    urllib.request.urlopen(req, timeout=30).read()


def main():
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    if "--desde" in sys.argv:
        desde = int(sys.argv[sys.argv.index("--desde") + 1])
    else:
        try:
            desde = int(open(ESTADO).read().strip() or 0)
        except FileNotFoundError:
            desde = 0
    url, chave = env()
    total = 0
    while True:
        rows = execucoes(desde)
        if not rows:
            break
        linhas = []
        for eid, inicio, data in rows:
            try:
                chamadas, entrada, saida, modelo, ref = extrair(desachatar(data))
            except Exception as e:  # execução com dados ilegíveis: registra e segue
                log(f"execução {eid} ilegível: {e}")
                continue
            if not chamadas or not ref:
                continue
            linhas.append({
                "org_id": ref["org_id"], "conversa_id": ref["conversa_id"], "mensagem_id": ref["mensagem_id"],
                "tipo": "resposta", "modelo": modelo or "desconhecido", "chamadas": chamadas,
                "tokens_entrada": entrada, "tokens_saida": saida,
                "origem_ref": f"n8n:{eid}", "criado_em": inicio,
            })
        if linhas:
            gravar(url, chave, linhas)
            total += len(linhas)
        desde = int(rows[-1][0])
        open(ESTADO, "w").write(str(desde))
        if len(rows) < LOTE:
            break
    if total:
        log(f"ok: {total} execução(ões) do agente gravadas; última {desde}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"ERRO: {e}")
        sys.exit(1)
