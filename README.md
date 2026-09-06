# Sistema da Comissão de Formatura — Financeiro + Rifas

Sistema web para uma comissão de formatura controlar as finanças (receitas,
despesas, categorias, fornecedores, auditoria) e as rifas (criação,
geração automática de números, venda pública ou assistida, cancelamento
auditado, comprovantes de pagamento, documentos administrativos).

Dois ambientes:
- **Área administrativa** (`/admin/*`) — autenticada, com papéis `ADMIN`,
  `VENDEDOR` e `VISUALIZADOR`.
- **Área pública da rifa** (`/rifas/*`) — sem login, qualquer pessoa pode
  escolher números e comprar.

Para o histórico de decisões, bugs reais encontrados/corrigidos e o que
falta, ver [`PROGRESS.md`](./PROGRESS.md) — este README cobre como instalar,
rodar e operar o sistema.

---

## 1. Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **Tailwind v4** +
  **shadcn/ui** sobre **Base UI** (`@base-ui/react`, não Radix — componentes
  usam `render={<Componente />}` em vez de `asChild`; ver
  [`components/ui/link-button.tsx`](./components/ui/link-button.tsx) para o
  wrapper obrigatório sempre que um `Button` renderiza como link).
- **Supabase** (Postgres 17 + Auth + Storage) como backend único.
- **Dinheiro sempre em centavos** (`bigint`), nunca `float` — ver
  [`lib/money.ts`](./lib/money.ts).
- **Regras de negócio críticas vivem no Postgres**: reserva/venda/
  cancelamento de números de rifa e edição/exclusão financeira só acontecem
  através de funções `SECURITY DEFINER` (RPCs) — nunca por
  `UPDATE`/`DELETE` direto do cliente. Toda tabela tem Row Level Security
  habilitada.
- **Exportações**: `exceljs` (XLSX) e `@react-pdf/renderer` (PDF).
- **Testes**: `vitest`, testes de integração batem no banco real (não há
  Postgres local neste projeto).

## 2. Arquitetura em um parágrafo

O Next.js nunca decide sozinho se uma operação sensível pode acontecer —
ele só chama uma RPC ou faz um `select`/`insert` simples e deixa o Postgres
(via RLS e as funções `SECURITY DEFINER`) decidir. Isso significa que o
`role` do usuário (`ADMIN`/`VENDEDOR`/`VISUALIZADOR`), a validade de uma
reserva de número, a idempotência de uma venda e a obrigatoriedade de motivo
numa edição/exclusão financeira são todas garantidas no banco, não só na UI.
`lib/settings.ts` lê configurações de `system_settings` (nome do evento,
limite de upload, prazo de reserva) com fallback para valores padrão —
mudar uma configuração em `/admin/configuracoes` tem efeito imediato, sem
deploy.

## 3. Instalação

```bash
npm install
```

## 4. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000

SUPABASE_SECRET_KEY=
SUPABASE_PROJECT_REF=

GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_DRIVE_ROOT_FOLDER_ID=
GOOGLE_DRIVE_RAFFLES_FOLDER_ID=
GOOGLE_DRIVE_FINANCIAL_FOLDER_ID=
GOOGLE_DRIVE_DOCUMENTS_FOLDER_ID=
GOOGLE_SHARED_DRIVE_ID=
GOOGLE_SHEET_DEFAULT_ID=
```

| Variável | Onde encontrar | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard do Supabase → **Settings → API** | Segura para expor no cliente. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Settings → API Keys → Publishable Keys** | Segura para expor no cliente (RLS protege). |
| `SUPABASE_SECRET_KEY` | **Settings → API Keys → Secret Keys** | **Nunca** vai para o navegador — bypassa RLS. Só em código server-only. |
| `SUPABASE_PROJECT_REF` | Referência do projeto (parte da URL) | Usado pelo Supabase CLI. |
| `GOOGLE_*` | Ver seção 8 | Deixe em branco — integração ainda não configurada, ver seção 8. |

`.env.local` está no `.gitignore` e nunca deve ser commitado. `.env.example`
é o único arquivo de ambiente versionado.

## 5. Rodando localmente

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). A área pública fica em
`/rifas`, a administrativa em `/admin` (requer login — ver seção 7).

## 6. Banco de dados (Supabase)

Este projeto **não usa Postgres local** — todo desenvolvimento acontece
contra o projeto Supabase remoto já linkado (`supabase/config.toml`).

### Aplicar migrations novas

```bash
export SUPABASE_ACCESS_TOKEN="<personal access token>"  # supabase.com/dashboard/account/tokens
npx supabase db push --linked --yes
npm run db:types   # regenera types/database.ts — rodar depois de QUALQUER mudança de schema
```

Migrations ficam em `supabase/migrations/`, nomeadas por timestamp e
aplicadas em ordem. Nunca edite uma migration já aplicada — crie uma nova.

### Dados de referência (categorias, formas de pagamento)

Já vêm em `20260819080700_operational_seed_data.sql` — é uma migration
normal, roda junto com as demais, não precisa de nenhum passo extra.

### Dados de demonstração (fictícios, para apresentar o sistema)

`supabase/seed.sql` é a versão de referência para Postgres local (não usado
aqui). Para popular o **projeto remoto real** com uma rifa, compradores,
vendas e lançamentos financeiros fictícios, mas realistas:

```bash
node scripts/seed-demo-data.mjs
```

O script vai através das mesmas RPCs que o app usa (`rpc_reserve_points`,
`rpc_confirm_sale`) — nunca insere `raffle_sales`/`raffle_points`
diretamente — então os números ficam corretamente marcados como `SOLD`,
`payment_records` e `audit_logs` são gerados normalmente. É **idempotente**:
rodar de novo detecta o que já existe (pela slug da rifa, pelo nome do
vendedor demo, pela tag de origem dos lançamentos financeiros) e pula em vez
de duplicar.

## 7. Autenticação e usuários

Login/logout/recuperação de senha ficam em `app/login/`,
`app/esqueci-minha-senha/`, `app/auth/`. `proxy.ts` (equivalente ao antigo
`middleware.ts` no Next 16) protege `/admin/*`.

### Criar o primeiro administrador

```bash
node scripts/create-admin-user.mjs <email> <"Nome completo">
```

Imprime uma senha temporária no terminal (não fica salva em nenhum lugar) —
troque no primeiro login ou use "Esqueci minha senha" depois de configurar
o envio de e-mail do Supabase Auth.

### Convidar novos usuários

Depois que existir pelo menos um admin, use `/admin/usuarios` — convida por
e-mail (`supabase.auth.admin.inviteUserByEmail`, dispara e-mail de convite
de verdade), define o papel (`ADMIN`/`VENDEDOR`/`VISUALIZADOR`) já no
convite. Um trigger no banco (`handle_new_user`) cria a linha em `profiles`
automaticamente a partir do metadata do convite.

### Configurar o envio de e-mail do Supabase Auth

Necessário para "Esqueci minha senha" e para o e-mail de convite chegarem de
verdade — configure um provedor SMTP em **Authentication → Settings → SMTP
Settings** no dashboard do Supabase (o provedor padrão do Supabase tem
limite de envio baixo, adequado só para testes).

## 8. Google Drive (opcional, não configurado por padrão)

Comprovantes e documentos hoje vivem inteiramente no **Supabase Storage**
(bucket privado `attachments`) e funcionam sem nenhuma credencial do Google.
`lib/services/drive.ts` já tem a abstração (`DriveService`) pronta para uma
implementação real — a classe atual (`UnconfiguredDriveProvider`) lança um
erro claro em vez de fingir sucesso.

Quando quiser habilitar o envio real ao Drive:

1. Crie um projeto no Google Cloud e habilite **Google Drive API**.
2. Crie uma conta de serviço (**IAM & Admin → Service Accounts → Create Service Account**).
3. Gere uma chave JSON (**Service Account → Keys → Add Key → Create new key → JSON**).
4. Preencha em `.env.local` (nunca em `NEXT_PUBLIC_*`):
   ```env
   GOOGLE_SERVICE_ACCOUNT_EMAIL=
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
   GOOGLE_DRIVE_ROOT_FOLDER_ID=
   GOOGLE_DRIVE_RAFFLES_FOLDER_ID=
   GOOGLE_DRIVE_FINANCIAL_FOLDER_ID=
   GOOGLE_DRIVE_DOCUMENTS_FOLDER_ID=
   ```
5. Compartilhe as pastas do Drive com o e-mail da conta de serviço.
6. Implemente `GoogleDriveService` em `lib/services/drive.ts` (o comentário
   `TODO(google-drive)` no arquivo explica o que fazer — `googleapis` +
   `google-auth-library`, autenticação via JWT).

Nunca coloque o JSON da conta de serviço no Git nem em `/public`.

## 9. Testes

```bash
npm run test              # unit + integração
npm run test:integration  # só integração (bate no banco real)
npm run typecheck
npm run lint
npm run build
```

Os testes de integração (`tests/integration/`) rodam contra o projeto
Supabase real configurado em `.env.local` — criam e apagam seus próprios
dados de teste (rifas, vendas, usuários com e-mail `@teste.local`), exceto
`audit_logs`, que nunca é apagado por design (é um log permanente).
Cobrem: concorrência na reserva de números, idempotência de confirmação de
venda, expiração de reserva, e RBAC (usuário anônimo/vendedor/visualizador
barrados de toda RPC admin-only e das políticas de RLS financeiras).

Os testes unitários (`tests/unit/`) não tocam o banco — hoje cobrem a
detecção de tipo de arquivo por magic bytes (`lib/uploads.ts`), que é a
defesa real contra upload de arquivo malicioso disfarçado de imagem/PDF.

### Regra de ouro antes de marcar algo como "pronto"

Rodar `typecheck` + `lint` + `build`, e sempre que a mudança envolver uma
RPC ou fluxo de concorrência/dinheiro, testar de verdade (subir o
`dev`, ou escrever um teste de integração) — não confiar em "parece certo
pela leitura do código". Ver seção 8 de `PROGRESS.md` para os bugs reais que
só foram encontrados assim.

## 10. Deploy

Qualquer plataforma que rode Next.js 16 (Vercel é o caminho mais direto)
funciona. Passos:

1. Configure as mesmas variáveis de ambiente da seção 4 no ambiente de
   produção (nunca reutilize as chaves de desenvolvimento se o projeto
   Supabase de produção for diferente).
2. Rode as migrations contra o projeto de produção (`supabase db push
   --linked`, apontando o CLI para o projeto certo).
3. Crie o primeiro admin de produção com `scripts/create-admin-user.mjs`.
4. Configure o SMTP do Supabase Auth (seção 7) — sem isso, convites e
   recuperação de senha não chegam a ninguém.
5. **Não rode `scripts/seed-demo-data.mjs` em produção** — ele cria dados
   fictícios (rifa, compradores, vendedor demo, lançamentos financeiros)
   pensados para demonstração, não para uso real.
6. `pg_cron` (liberação de reservas expiradas, limpeza de rate limit) já
   está agendado nas migrations — nada a fazer manualmente no Supabase
   gerenciado.

## 11. Troubleshooting

**"Cannot find name 'LayoutProps'" no `typecheck`** — normal logo após
`npm install` num checkout novo: esse tipo é gerado pelo Next 16 em tempo de
build/dev. Rode `npm run dev` ou `npm run build` uma vez e o erro some.

**Upload de comprovante/documento rejeitado mesmo com um arquivo válido** —
o tipo é detectado pelos *magic bytes* do arquivo, não pela extensão nem
pelo `Content-Type` do navegador (ver `lib/uploads.ts`). Só JPG, PNG, WEBP e
PDF de verdade passam. O limite de tamanho é configurável em
`/admin/configuracoes`.

**"Apenas administradores podem..." num RPC que deveria funcionar** —
confira `profiles.role` e `profiles.active` do usuário logado; várias RPCs
(fechar/cancelar rifa, cancelar venda, editar/excluir financeiro) são
`ADMIN`-only por design, e há teste de regressão (`tests/integration/rbac.test.ts`)
garantindo que isso nunca regrida silenciosamente.

**Erro do Google Drive** — esperado até a seção 8 ser configurada;
`DriveNotConfiguredError` é intencional, não é bug.

**"row-level security policy" ao tentar um `insert`/`update` direto numa
tabela** — várias tabelas (`raffle_points`, `raffle_sales`,
`financial_transactions` em edição/exclusão) só aceitam mudança através de
RPC `SECURITY DEFINER`, nunca de um `UPDATE`/`DELETE` direto do cliente,
mesmo sendo admin. Use a RPC correspondente.
