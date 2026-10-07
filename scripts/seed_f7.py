"""Configuração inicial do agente da F7 no Livih, a partir do workflow "Agente F7" do n8n.

Uso: python scripts/seed_f7.py <export do workflow Agente F7 (.json)>
Grava/atualiza o agente do canal da F7 (sessão WAHA "f7") e a base de conhecimento. O agente
fica INATIVO; ativar é uma decisão separada.
"""
import json
import os
import subprocess
import sys
import tempfile

wf = json.load(open(sys.argv[1], encoding="utf-8"))
wf = wf[0] if isinstance(wf, list) else wf
nos = {n["name"]: n for n in wf["nodes"]}

prompt = nos["AI Agent"]["parameters"]["options"]["systemMessage"].lstrip("=")
base = nos["base_conhecimento_f7"]["parameters"]["jsCode"].strip()
base = base[base.index("`") + 1:base.rindex("`")]

# No Livih a base vem injetada no fim do prompt, não por ferramenta.
trocas = {
    "consulte obrigatoriamente a ferramenta:\n\n*base_conhecimento_f7*":
        "use somente a seção BASE DE CONHECIMENTO, no fim destas instruções.",
    "Se a ferramenta não retornar informações suficientes responda apenas:":
        "Se a base não tiver a informação, responda apenas:",
    "Caso existam dúvidas institucionais consulte a Base de Conhecimento.":
        "Para dúvidas institucionais, use a Base de Conhecimento.",
}
for de, para in trocas.items():
    if de not in prompt:
        sys.exit(f"trecho não encontrado no prompt: {de[:60]}")
    prompt = prompt.replace(de, para)

regras = {"casos": [
    "lead quente: o cliente demonstrou interesse claro em contratar ou pediu reunião",
    "pedido de orçamento, preço ou proposta",
    "reclamação ou insatisfação",
    "o cliente pediu para falar com uma pessoa",
]}


def lit(texto):
    return "$livih$" + texto + "$livih$"


sql = f"""
with canal as (select id, org_id from public.canais where tipo = 'waha' and instance_id = 'f7')
insert into public.agentes (org_id, canal_id, nome, ativo, modelo, prompt, regras_humano)
select org_id, id, 'Assistente F7', false, 'gpt-5-mini', {lit(prompt)}, {lit(json.dumps(regras, ensure_ascii=False))}::jsonb
  from canal
on conflict (canal_id) do update
  set prompt = excluded.prompt, regras_humano = excluded.regras_humano, modelo = excluded.modelo;

delete from public.base_conhecimento
 where org_id = (select org_id from public.canais where tipo = 'waha' and instance_id = 'f7')
   and titulo = 'F7 TECH';
insert into public.base_conhecimento (org_id, titulo, conteudo)
select org_id, 'F7 TECH', {lit(base)} from public.canais where tipo = 'waha' and instance_id = 'f7';

select (select count(*) from public.agentes a join public.canais c on c.id = a.canal_id where c.instance_id = 'f7') agentes,
       (select length(prompt) from public.agentes a join public.canais c on c.id = a.canal_id where c.instance_id = 'f7') tamanho_prompt,
       (select count(*) from public.base_conhecimento b join public.canais c on c.org_id = b.org_id where c.instance_id = 'f7') bases;
"""

arquivo = os.path.join(tempfile.gettempdir(), "livih_seed_f7.sql")
open(arquivo, "w", encoding="utf-8").write(sql)
r = subprocess.run(["npx", "-y", "supabase", "db", "query", "--linked", "-o", "json", "-f", arquivo],
                   capture_output=True, text=True, encoding="utf-8", shell=sys.platform == "win32")
saida = r.stdout + r.stderr
print(saida[saida.find('"rows"'):][:300] if '"rows"' in saida else saida[-800:])
