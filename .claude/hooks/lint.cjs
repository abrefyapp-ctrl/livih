// PostToolUse (Edit/Write/MultiEdit): roda o ESLint só no arquivo de src/ que acabou de mudar. Com erro, sai com 2 e
// manda a saída do ESLint ao Claude, que corrige na hora. A checagem de tipos (tsc) continua no fim da tarefa.
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
  if (!/^src\/.+\.(ts|tsx)$/.test(rel) || rel === "src/services/tiposBanco.ts") process.exit(0);

  const eslint = path.join(raiz, "node_modules", "eslint", "bin", "eslint.js");
  try {
    execFileSync(process.execPath, [eslint, "--quiet", rel], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const saida = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    if (saida) {
      process.stderr.write(`ESLint encontrou erro em ${rel}:\n${saida}\n`);
      process.exit(2);
    }
  }
  process.exit(0);
});
