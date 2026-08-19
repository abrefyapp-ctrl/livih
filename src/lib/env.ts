// Configuração de ambiente.
// Nada de URL ou chave hardcoded no código: tudo vem daqui, e daqui vem do .env.
// Se faltar variável, o app quebra no boot — de propósito. É melhor não subir
// do que subir apontando para o projeto errado.

const required = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Copie .env.example para .env e preencha.`,
    );
  }
  return value;
};

export const SUPABASE_URL = required(
  "VITE_SUPABASE_URL",
  import.meta.env.VITE_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = required(
  "VITE_SUPABASE_ANON_KEY",
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
