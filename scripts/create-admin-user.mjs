// One-off bootstrap for the very first admin account (before the in-app user
// management screen exists / for recovering access if every admin is
// locked out). Requires SUPABASE_SECRET_KEY, never runs in the browser.
//
// Usage: node scripts/create-admin-user.mjs <email> <full name>
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env.local") });

const [, , email, ...nameParts] = process.argv;
const fullName = nameParts.join(" ");

if (!email || !fullName) {
  console.error("Usage: node scripts/create-admin-user.mjs <email> <full name>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);

const temporaryPassword = randomBytes(9).toString("base64url");

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password: temporaryPassword,
  email_confirm: true,
  user_metadata: { full_name: fullName, role: "ADMIN" },
});

if (error) {
  console.error("Falha ao criar usuário:", error.message);
  process.exit(1);
}

console.log("Usuário administrador criado com sucesso.");
console.log("  Email:", email);
console.log("  Senha temporária:", temporaryPassword);
console.log("  ID:", data.user.id);
console.log(
  "\nFaça login e troque a senha imediatamente (ou use 'Esqueci minha senha').",
);
