// PreToolUse (Edit/Write/MultiEdit): recusa editar o que não deve ser mexido à mão. Sai com 2 e o motivo no stderr,
// que o Claude Code mostra para o Claude.
const { execFileSync } = require("child_process");
const path = require("path");

const raiz = path.resolve(__dirname, "..", "..");
let entrada = "";
process.stdin.on("data", (d) => (entrada += d)).on("end", () => {
  let arquivo;
  try {
    arquivo = JSON.parse(entrada).tool_input?.file_path;
  } catch {
    process.exit(0);
  }
  if (!arquivo) process.exit(0);
  const rel = path.relative(raiz, path.resolve(arquivo)).split(path.sep).join("/");
  if (rel.startsWith("..")) process.exit(0);

  const recusar = (motivo) => {
    process.stderr.write(`Edição recusada (${rel}): ${motivo}\n`);
    process.exit(2);
  };

  if (rel === "src/services/tiposBanco.ts") {
    recusar("é gerado pelo banco. Aplique a migration e rode `npm run tipos`.");
  }
  if (/^\.env(\..*)?$/.test(path.basename(rel)) && !rel.endsWith(".env.example")) {
    recusar("guarda as chaves do ambiente. Peça ao usuário para editar.");
  }
  if (rel === "docs/roadmap.md") {
    recusar("é do usuário. Proponha o texto e deixe que ele edite.");
  }
  // Migration que já está no origin/main foi aplicada: mudar o arquivo não muda o banco. Faça uma migration nova.
  if (/^supabase\/migrations\/.+\.sql$/.test(rel)) {
    try {
      execFileSync("git", ["cat-file", "-e", `origin/main:${rel}`], { cwd: raiz, stdio: "ignore" });
      recusar("esta migration já está no origin/main (aplicada no banco). Crie uma migration nova com a mudança.");
    } catch {
      // Ainda não publicada: pode editar.
    }
  }
  process.exit(0);
});
