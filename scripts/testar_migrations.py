"""Aplica as migrations pendentes + scripts/teste_fase1.sql no banco linkado dentro de begin … rollback.

Nada fica gravado. Uso (na raiz do repo): python scripts/testar_migrations.py
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

def consultar(sql):
    saida = subprocess.run(
        ["npx", "-y", "supabase", "db", "query", "--linked", "-o", "json", sql],
        capture_output=True, text=True, encoding="utf-8", shell=sys.platform == "win32",
    ).stdout
    return json.loads(saida[saida.index("{"):saida.rindex("}") + 1])["rows"]


# Só as migrations que ainda não estão no banco; as já aplicadas fazem parte do estado atual.
aplicadas = {r["version"] for r in consultar("select version from supabase_migrations.schema_migrations")}
partes = ["begin;"]
for arquivo in sorted(glob.glob("supabase/migrations/*.sql")):
    if os.path.basename(arquivo).split("_")[0] in aplicadas:
        continue
    print("aplicando no teste:", os.path.basename(arquivo))
    partes.append(open(arquivo, encoding="utf-8").read())
partes.append(open("scripts/teste_fase1.sql", encoding="utf-8").read())
partes.append("rollback;")
arquivo_tmp = os.path.join(tempfile.gettempdir(), "livih_teste_migrations.sql")
open(arquivo_tmp, "w", encoding="utf-8").write("\n".join(partes))

saida = subprocess.run(
    ["npx", "-y", "supabase", "db", "query", "--linked", "-o", "json", "-f", arquivo_tmp],
    capture_output=True, text=True, encoding="utf-8", shell=sys.platform == "win32",
)
texto = saida.stdout + saida.stderr
try:
    linhas = json.loads(texto[texto.index("{"):texto.rindex("}") + 1])["rows"]
except (ValueError, KeyError):
    print(texto[-3000:])
    sys.exit(1)

falhas = 0
for linha in linhas:
    marca = "OK " if linha["ok"] else "FALHOU"
    falhas += not linha["ok"]
    print(f'{marca} {linha["n"]:>2}. {linha["teste"]}')
print(f"\n{len(linhas) - falhas}/{len(linhas)} OK")
sys.exit(1 if falhas else 0)
