"""Insere scripts/f7_prompt_ritmo.md no prompt do agente da F7, antes de "# RESPOSTAS".

Idempotente: se a seção já existe, é substituída. A versão anterior fica na auditoria
(trigger agentes_auditar). Uso (na raiz do repo): python scripts/f7_aplicar_ritmo.py
"""
import json
import os
import subprocess
import sys
import tempfile


def consultar(sql):
    arquivo = os.path.join(tempfile.gettempdir(), "livih_f7_ritmo.sql")
    open(arquivo, "w", encoding="utf-8").write(sql)
    r = subprocess.run(["npx", "-y", "supabase", "db", "query", "--linked", "-o", "json", "-f", arquivo],
                       capture_output=True, text=True, encoding="utf-8", shell=sys.platform == "win32")
    t = r.stdout + r.stderr
    return json.loads(t[t.index("{"):t.rindex("}") + 1])["rows"]


FILTRO = "canal_id = (select id from public.canais where tipo = 'waha' and instance_id = 'f7')"
prompt = consultar(f"select prompt from public.agentes where {FILTRO}")[0]["prompt"]
secao = open("scripts/f7_prompt_ritmo.md", encoding="utf-8").read().strip()

TITULO = "# RITMO DA CONVERSA"
if TITULO in prompt:
    ini = prompt.index(TITULO)
    fim = prompt.index("\n---", ini)
    prompt = prompt[:ini] + secao + prompt[fim:]
else:
    alvo = "# RESPOSTAS"
    if alvo not in prompt:
        sys.exit("seção # RESPOSTAS não encontrada")
    i = prompt.index(alvo)
    prompt = prompt[:i] + secao + "\n\n---\n\n" + prompt[i:]

linhas = consultar(
    f"update public.agentes set prompt = $livih${prompt}$livih$ where {FILTRO} "
    "returning length(prompt) tamanho, position('# RITMO DA CONVERSA' in prompt) > 0 tem_secao"
)
print(linhas)
