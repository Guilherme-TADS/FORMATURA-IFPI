# Status do projeto — Sistema da Comissão de Formatura (Financeiro + Rifas)

> Documento de handoff. Escrito para que qualquer pessoa (ou uma nova sessão do
> Claude) consiga entender o que já existe, por que foi feito assim, e o que
> falta, sem precisar reconstruir esse contexto do zero.

**Última atualização:** 2026-08-19
**Estado:** **9 de 9 fases concluídas e verificadas contra o banco real e um
navegador de verdade** (não só lidas/assumidas corretas — ver seções 4.1,
4.2 e 4.3 para o que foi de fato clicado e testado, incluindo três bugs reais
encontrados e corrigidos nesta sessão). Falta só uma coisa, e é intencional:
a integração real com o Google Drive (o usuário pediu para pausar essa parte
— ver seção 2 e seção 5).

---

## 1. O que é o projeto

Sistema web para uma comissão de formatura controlar:
- **Financeiro**: receitas, despesas, categorias, fornecedores, auditoria de
  alterações.
- **Rifas**: criação de rifas, geração automática de números, reserva
  temporária, venda (autoatendimento público ou assistida por vendedor),
  cancelamento auditado, comprovantes de pagamento.

Dois ambientes: área administrativa (`/admin/*`, autenticada, com papéis
ADMIN/VENDEDOR/VISUALIZADOR) e área pública da rifa (`/rifas/*`, sem login,
qualquer pessoa pode escolher números e comprar).

**Documento original com a especificação completa (92 seções)**: foi dado
pelo usuário no início da conversa, não está salvo em arquivo — só existe no
histórico do chat que gerou este projeto. Resumo do que importa está aqui
neste documento. O plano de implementação original das fases 1–6 ficava em
`C:\Users\User\.claude\plans\squishy-zooming-spindle.md`, num arquivo local
de uma sessão/máquina anterior — **não existe mais, não faz parte do
repositório, e não deve ser tratado como referência viva**. As fases 7–9
foram implementadas numa sessão posterior, nesta máquina, sem esse arquivo
disponível — o roteiro que guiou o trabalho foi reconstruído a partir do que
já estava registrado na seção 5 (antiga) deste documento e complementado
conforme necessário; ver seções 4.1–4.3 para o que foi de fato construído.

---

## 2. Stack e decisões arquiteturais

- **Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4 + shadcn/ui**
  — mas atenção: o registry do shadcn usado aqui é baseado em **Base UI**
  (`@base-ui/react`), não Radix. Isso importa porque os componentes usam
  `render={<Componente />}` em vez de `asChild`, e `Button` tem uma prop
  `nativeButton` que precisa ser `false` quando ele renderiza como
  `<Link>` (ver `components/ui/link-button.tsx` — sempre usar esse wrapper
  em vez de `<Button render={<Link .../>}>` direto, um bug real de
  acessibilidade já foi encontrado e corrigido por causa disso).
- **Supabase** (Postgres 17 + Auth + Storage) como backend único. Projeto
  real já linkado: `ekdbiofodxxwnlimazop` (região us-east-2).
- **Dinheiro sempre em centavos** (`bigint`), nunca float. Ver `lib/money.ts`
  (`centsToBRL`, `brlStringToCents` — este último faz parsing de string
  decimal sem multiplicação de float, para não arredondar errado).
- **Regras de negócio críticas vivem no Postgres**, não no Next.js — todas as
  operações de reserva/venda/cancelamento de números da rifa e edição/exclusão
  financeira passam por funções `SECURITY DEFINER` (RPCs), nunca por
  UPDATE/DELETE direto do cliente. Ver seção 4.
- **RBAC simplificado**: enum `user_role` (`ADMIN`, `VENDEDOR`,
  `VISUALIZADOR`) direto em `profiles.role`, sem tabelas genéricas de
  permissão — decisão deliberada de simplicidade, documentada no plano.
- **Google Drive**: **não configurado ainda, de propósito** (o usuário pediu
  para pausar essa parte). Existe uma abstração `DriveService`
  (`lib/services/drive.ts`) com uma implementação "não configurada" que
  lança um erro claro em vez de fingir sucesso. Todos os uploads (comprovante
  PIX) hoje vão para um bucket privado do **Supabase Storage** (`attachments`)
  e ficam lá até alguém plugar as credenciais do Google.

---

## 3. Credenciais e segurança

- Credenciais reais do Supabase (URL, publishable key, secret key) estão em
  `.env.local` **na máquina local** — esse arquivo está no `.gitignore` e
  **nunca foi commitado**. Não existe `SUPABASE_ACCESS_TOKEN` (Personal
  Access Token do CLI) configurado nesta máquina — não foi necessário para
  nada feito nas fases 7–9 (ver nota no fim da seção 4.1), só é preciso se
  uma migration nova precisar ser aplicada (seção 6).
- `.env.example` documenta todas as variáveis necessárias (sem valores) e
  **está commitado** — usar como referência para configurar um ambiente novo.
- Existe uma conta ADMIN de teste no banco: `admin@teste.local` (criada via
  `scripts/create-admin-user.mjs`, que também serve para criar a primeira
  conta admin real quando for para produção). A senha foi trocada durante o
  QA desta sessão e não ficou salva em nenhum arquivo — se precisar logar
  como esse usuário, use "Esqueci minha senha" (precisa do SMTP do Supabase
  Auth configurado, ver `README.md` seção 7) ou peça para alguém com acesso
  ao `SUPABASE_SECRET_KEY` chamar `admin.auth.admin.updateUserById` para
  definir uma senha nova.
- Existe também uma conta VENDEDOR de demonstração:
  `vendedor.demo@teste.local` (criada por `scripts/seed-demo-data.mjs`,
  sem senha conhecida/salva — não foi pensada para login, só para aparecer
  como "vendedor" nas vendas de demonstração e nos filtros de relatório).
- **Google Drive**: nenhuma credencial foi configurada. Quando for a hora,
  preencher `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
  e os `GOOGLE_DRIVE_*_FOLDER_ID` em `.env.local` (nunca em `NEXT_PUBLIC_*`).

---

## 4. O que já está pronto (fases 1–6)

Cada fase abaixo foi **verificada de verdade** — não só escrita e assumida
correta. Isso incluiu rodar migrations contra o banco remoto real, testes de
integração automatizados (Vitest) fazendo requisições concorrentes reais, e
sessões de QA manual num navegador de verdade (via MCP preview) clicando nos
fluxos, incluindo inspecionar o banco antes/depois de cada ação.

### Fase 1 — Schema, RLS, RPCs de concorrência
Migrations em `supabase/migrations/` (nomeadas por timestamp, aplicadas em
ordem). Tabelas principais: `profiles`, `raffles`, `raffle_points`, `buyers`,
`raffle_sales`, `raffle_sale_points`, `payment_records`, `payment_methods`,
`financial_transactions`, `financial_categories`, `suppliers`, `attachments`,
`audit_logs`, `system_settings`.

RLS habilitado em **todas** as tabelas desde o início. `raffle_points` não
tem nenhuma policy de INSERT/UPDATE/DELETE para nenhum papel — a única forma
de mudar o status de um número é através das RPCs abaixo.

RPCs críticas (todas `SECURITY DEFINER`):
- `rpc_reserve_points` — `UPDATE ... WHERE status='AVAILABLE'` atômico. Se
  qualquer número pedido não estiver disponível, a exceção desfaz toda a
  reserva (nada fica parcialmente reservado).
- `rpc_confirm_sale` — confirma a venda, é **idempotente** via
  `idempotency_key` (chave única), revalida a expiração da reserva na hora
  (não confia só no status), retorna um **recibo em jsonb** (não só o id —
  ver por quê na seção de bugs abaixo).
- `rpc_cancel_sale`, `rpc_close_raffle`, `rpc_cancel_raffle` — admin-only,
  sempre pedem motivo, sempre geram `audit_logs`.
- `rpc_release_expired_reservations` — rodada a cada minuto via **pg_cron**
  (job `release-expired-raffle-reservations`), libera reservas expiradas.
- `rpc_update_financial_transaction` / `rpc_delete_financial_transaction` —
  edição/exclusão financeira sempre exige motivo e sempre audita
  (old/new value via trigger `financial_transactions_audit`).

Testes de integração: `tests/integration/concurrency.test.ts` e
`tests/integration/cancellation.test.ts` (rodam contra o banco real, criam e
apagam sua própria rifa de teste). Rodar com `npm run test:integration`.

**Três bugs reais encontrados e corrigidos só porque havia testes/QA real:**
1. Coluna ambígua em `rpc_reserve_points` (o parâmetro de retorno tinha o
   mesmo nome de uma coluna da tabela) — toda reserva falhava.
2. `SELECT array_agg() ... FOR UPDATE` não é permitido pelo Postgres — tinha
   que separar em CTE de lock + agregação por fora.
3. **Bug de segurança sério**: `is_admin()`/`is_vendedor_or_admin()`
   comparavam um valor que podia ser `NULL` com `=`, o que retorna `NULL`
   (não `false`). Em RLS isso é seguro (`NULL` = deny), mas dentro de
   `IF NOT is_admin() THEN RAISE EXCEPTION` do PL/pgSQL, uma condição `NULL`
   é tratada como "não verdadeira, pule o bloco" — ou seja, **um usuário
   anônimo conseguia cancelar uma venda de verdade**, confirmado por teste.
   Corrigido envolvendo os dois helpers em `COALESCE(..., false)`. Ver
   migration `20260819092000_fix_null_boolean_authz_bypass.sql`.

Além disso: `rpc_cancel_sale` tinha uma expressão `CASE` sem cast explícito
pro enum `point_status` (Postgres não inferia o tipo nesse contexto) — todo
cancelamento falhava até isso ser corrigido. E `audit_logs.user_id` não
tinha `ON DELETE SET NULL`, o que bloqueava apagar um usuário (ou uma conta
de teste) por causa do histórico de auditoria — corrigido.

### Fase 2 — Auth, RBAC, layout admin/público
- Login, logout, recuperação de senha, fluxo de "definir senha" (para
  convites), tudo em `app/login/`, `app/esqueci-minha-senha/`,
  `app/auth/`.
- `proxy.ts` (nome novo do `middleware.ts` no Next 16) bloqueia
  `/admin/*` para não-autenticados e para contas desativadas, redireciona
  quem já está logado para longe de `/login`.
- Layout admin (`app/admin/layout.tsx` + `app/admin/_components/admin-shell.tsx`):
  sidebar desktop, menu mobile (Sheet), navegação por papel
  (`app/admin/nav-config.ts` — adicionar itens de menu aqui conforme cada
  seção nova for construída).
- `scripts/create-admin-user.mjs` — bootstrap do primeiro admin.

### Fase 3 — Gestão de rifas (admin)
`app/admin/rifas/` — criar/editar rifa (`raffle-form.tsx`, compartilhado),
geração automática de números via trigger no banco, grid de números com
filtro/paginação/busca (`[id]/numeros/page.tsx`), encerrar/cancelar rifa
(`[id]/raffle-actions.tsx`).

### Fase 4 — Fluxo público de compra + vendas/compradores no admin
- `app/rifas/` — listagem pública, página da rifa com SEO
  (`generateMetadata`), grid de números paginado (`number-grid.tsx`),
  fluxo de compra completo (`purchase-flow.tsx`): seleção → reserva com
  cronômetro (retomável entre reloads via `sessionStorage`) → formulário do
  comprador → forma de pagamento (PIX exige upload real validado
  server-side; dinheiro exige um checkbox de confirmação) → confirmação
  idempotente → tela de recibo.
- `app/api/uploads/comprovante/route.ts` — valida o arquivo de verdade
  (magic bytes, não só o MIME que o navegador diz), tamanho máximo, salva no
  Storage privado, insere a linha em `attachments`.
- `app/admin/rifas/[id]/vendas/` — lista de vendas por rifa, cancelamento
  auditado (admin only).
- `app/admin/compradores/` — busca por nome/telefone/whatsapp ou número
  comprado.

### Fase 5 — (mesclada com a 4 na prática — fluxo público + vendas foram
construídos e testados juntos, ver commits).

### Fase 6 — Financeiro
`app/admin/financeiro/` — visão geral (saldo, receitas/despesas do mês,
resultado — tudo calculado por agregação, nunca guardado manualmente),
`receitas/`, `despesas/` (com fornecedor auto-criado por nome),
`categorias/`. Edição e exclusão sempre pedem motivo e sempre auditam
(verificado: editei um valor, motivo apareceu em `audit_logs` com
old/new value; excluí um lançamento, ele sumiu da lista mas continua no
banco com `deleted_at` preenchido).

---

## 4.1 Fase 7 — Documentos (UI implementada e testada de verdade)

Implementado nesta sessão:
- `lib/uploads.ts` ganhou `sniffMimeType` (magic bytes, extraído da rota de
  comprovante para ser compartilhado), `ATTACHMENT_KINDS`,
  `ATTACHMENT_KIND_LABELS`, `ATTACHMENT_STATUS_LABELS` e
  `DOCUMENT_ENTITY_TYPES`. `app/api/uploads/comprovante/route.ts` foi
  atualizada para reusar esse helper (sem mudança de comportamento).
- `app/api/uploads/documento/route.ts` — rota de upload autenticada,
  **admin-only** (verifica `profiles.role === 'ADMIN'` e `active` antes de
  aceitar), mesma validação real de magic bytes/tamanho da rota de
  comprovante. Aceita `kind`, e opcionalmente `entityType`
  (`raffle` | `financial_transaction`) + `entityId` para já nascer vinculado
  a uma rifa ou lançamento financeiro; sem isso, o anexo fica com
  `entity_type = 'document'` (avulso).
- `app/admin/documentos/actions.ts` — `getDownloadUrl` (gera signed URL via
  o client autenticado do próprio usuário, funciona para qualquer papel
  ativo porque a policy `attachments_bucket_staff_read` já permite leitura
  do bucket para `is_active_user()` — não precisou do client admin),
  `linkAttachment` e `updateAttachmentDescription` (essas duas exigem
  ADMIN).
- `app/admin/documentos/page.tsx` — lista até 100 anexos mais recentes, com
  filtros por tipo (`kind`), vínculo (`entity_type`), status e busca por
  nome/descrição (via querystring, GET). Resolve o rótulo de exibição do
  vínculo (título da rifa, descrição do lançamento, ou nome do comprador da
  venda) com consultas em lote (`.in(...)`) — `entity_id`/`entity_type` são
  polimórficos, sem FK real, então não dá pra fazer isso num único join do
  PostgREST.
- `app/admin/documentos/document-upload-form.tsx` e `document-row.tsx`
  (client components) — formulário de envio e linha da tabela com ações de
  baixar / vincular / editar descrição, seguindo o mesmo padrão de
  "expandir linha para editar" já usado em `transaction-row.tsx`.
- Item de menu "Documentos" em `app/admin/nav-config.ts` (papéis ADMIN e
  VISUALIZADOR, mesmo padrão do item "Financeiro").
- Nenhuma migration nova foi necessária — a tabela `attachments` e as
  policies (`attachments_select`, `attachments_admin_write`,
  `attachments_bucket_staff_read`) já suportavam tudo isso desde a Fase 1.

**Decisão deliberada de escopo:** não foi implementada exclusão de anexos
pelo painel de Documentos. Diferente de lançamento financeiro, apagar um
anexo (que pode ser um comprovante de pagamento real, evidência de uma
venda) sem motivo obrigatório e sem trilha de auditoria quebraria o padrão
de cuidado já estabelecido no resto do projeto (toda exclusão relevante
pede motivo e gera `audit_logs` — ver seção 4). Se precisar dessa
funcionalidade, o caminho certo é uma RPC `rpc_delete_attachment(p_id,
p_reason)` `SECURITY DEFINER` que audita antes de apagar, no mesmo molde de
`rpc_delete_financial_transaction`, não um DELETE direto do cliente.

**QA real feita** (não só `typecheck`/`lint`/`build`): subiu `npm run dev`
contra o projeto Supabase real, logou como admin de verdade num navegador
(via MCP preview), e:
- Enviou um PDF de teste vinculado à rifa de demonstração pelo formulário —
  apareceu na lista com o vínculo certo, o rótulo resolvido
  ("Rifa da Formatura — Técnico em ADS 2026"), status "Enviado".
- Confirmou a rejeição de um arquivo inválido (`.pdf` fake, bytes de texto
  puro) com a mensagem de erro certa — a defesa por magic bytes funciona
  de ponta a ponta, não só na unidade isolada.
- Baixou o arquivo de volta via signed URL e conferiu que os bytes batem
  exatamente com o que foi enviado.
- Confirmou como VISUALIZADOR: vê a lista e o botão "Baixar", **não** vê o
  formulário de envio nem "Vincular"/"Descrição".
- Confirmou que VENDEDOR é redirecionado para `/admin/dashboard` mesmo
  entrando direto pela URL (`/admin/documentos` não tem link no menu para
  esse papel, mas o teste foi pela URL direta, que é o caso que importa).

## 4.2 Fase 8 — Dashboards, relatórios, auditoria, configurações, usuários, seed

Tudo construído e testado nesta sessão, sem precisar de nenhuma migration
nova — cada item abaixo usa só tabelas/RPCs/Admin API que já existiam desde
as fases 1–6 (checado antes de começar, especificamente para não depender de
`SUPABASE_ACCESS_TOKEN`, que não estava disponível nesta máquina).

- **Dashboard** (`app/admin/dashboard/page.tsx`) — saldo, resultado do mês,
  rifas ativas, vendas recentes (todo mundo vê), despesas recentes e
  atividade recente de `audit_logs` (só ADMIN/VISUALIZADOR e só ADMIN,
  respectivamente — tudo calculado por agregação em JS a partir de queries
  simples, mesmo padrão de `app/admin/financeiro/page.tsx`).
- **Relatório de vendas** (`app/admin/relatorios/vendas/`, query builder em
  `lib/reports/sales.ts`) — filtros por comprador (nome/telefone), vendedor,
  número da rifa, forma de pagamento, status, rifa e intervalo de datas;
  paginação e ordenação por valor/data. Exportação real em
  `/api/reports/vendas` (CSV, XLSX via `exceljs`, PDF via
  `@react-pdf/renderer` — o documento PDF fica em `lib/reports/sales-pdf.tsx`
  porque um route handler não pode ser `.tsx`/usar JSX diretamente).
- **Auditoria** (`app/admin/auditoria/`) — admin-only, lista `audit_logs`
  com filtro por ação/tipo de entidade/usuário/data, paginação, e uma linha
  expansível (`audit-row.tsx`, client component) mostrando o `old_data`/
  `new_data`/`metadata` em JSON.
- **Configurações** (`app/admin/configuracoes/`, leitura/escrita em
  `lib/settings.ts`) — nome do evento/curso/turma, limite de upload (MB) e
  prazo de reserva (minutos), guardados em `system_settings` (key/value
  jsonb, já existia). **Não é só uma tela bonita que não faz nada**: os
  valores são de fato lidos em runtime —
  `getUploadLimits()` é usado pelas duas rotas de upload (comprovante e
  documento) em vez do `DEFAULT_UPLOAD_LIMITS` fixo, e
  `getReservationTtlMinutes()` é passado como `p_ttl_minutes` para
  `rpc_reserve_points` a partir de `app/rifas/[slug]/page.tsx` — mudar o
  valor em `/admin/configuracoes` muda o comportamento imediatamente, sem
  deploy. `getEventInfo()` alimenta o título da home (`app/page.tsx`) e da
  listagem pública de rifas.
- **Usuários** (`app/admin/usuarios/`) — convite por e-mail
  (`supabase.auth.admin.inviteUserByEmail`, dispara e-mail de verdade —
  **não testado ao vivo nesta sessão** para não mandar e-mail de convite
  para um endereço arbitrário; a criação de perfil a partir do metadata do
  convite via trigger `handle_new_user` já é coberta por
  `tests/integration/rbac.test.ts`, que cria usuários com `createUser`
  passando `role` no metadata e confirma que o perfil nasce com o papel
  certo), mudança de papel e ativar/desativar — testado ao vivo mudando o
  papel do vendedor de demonstração (VENDEDOR → VISUALIZADOR → VENDEDOR de
  novo) e confirmando no banco que persistiu. Um usuário nunca vê controle
  para alterar o próprio papel/status (a UI esconde, e o banco também
  bloqueia via trigger `prevent_self_privilege_escalation` — dupla camada).
- **Seed de demonstração** — `supabase/seed.sql` (referência para Postgres
  local, não usado neste projeto) + `scripts/seed-demo-data.mjs`, que
  **populou o projeto Supabase real** com uma rifa, 6 compradores/vendas
  (passando pelas RPCs reais `rpc_reserve_points`/`rpc_confirm_sale`, não
  inserindo linhas direto — por isso os números ficam `SOLD` de verdade,
  `payment_records`/`audit_logs` são gerados normalmente), um vendedor de
  demonstração, e 6 lançamentos financeiros. **Idempotente** — rodar de novo
  detecta o que já existe e pula, verificado rodando duas vezes seguidas.

**Três bugs reais encontrados durante o QA desta sessão** (mesma filosofia
da fase 1 — só apareceram porque algo foi de fato executado):
1. **Filtro por número truncava a lista de números exibida.** O filtro de
   `numero` no relatório de vendas usava
   `raffle_sale_points!inner(raffle_points!inner(point_number))` +
   `.eq(...)` para restringir as vendas — mas o PostgREST, ao usar `!inner`
   num embed e filtrar nele, não só restringe *quais vendas* aparecem, ele
   também restringe *quais linhas do embed* voltam. Resultado: filtrar por
   "número 18" numa venda de 4 números (18, 19, 20, 21) mostrava só "18" na
   coluna de números, escondendo os outros três. Corrigido em
   `lib/reports/sales.ts`: o número agora é resolvido antes, com uma
   consulta separada em `raffle_points` para achar os `sale_id`s
   correspondentes, e a query principal usa `.in('id', saleIds)` com o embed
   normal (sem `!inner`) — assim o filtro restringe as vendas sem truncar o
   que é exibido.
2. **Link morto no dashboard para VENDEDOR.** O botão "Relatório de vendas"
   aparecia pra todo mundo, mas a página é ADMIN/VISUALIZADOR-only — um
   vendedor clicando só era redirecionado de volta ao painel, sem explicação.
   Corrigido: o botão agora só aparece quando `canSeeFinancials` é
   verdadeiro, igual ao botão "Ver financeiro" ao lado dele.
3. **Teste de configurações apagou dados reais configurados pelo admin.**
   `tests/integration/settings.test.ts`, na primeira versão, tinha um
   `afterEach` que sempre apagava as 3 chaves de `system_settings` — mas a
   primeira asserção do arquivo (`espera valores default`) falhou porque eu
   já tinha configurado valores reais pela UI durante o QA, e o Vitest roda
   `afterEach` **mesmo quando o teste falha** — então os dados reais que eu
   tinha acabado de configurar foram apagados pelo teste, sem eu pedir.
   Corrigido para o padrão certo: `beforeAll` tira um snapshot do que já
   existe em `system_settings` antes de limpar, e `afterAll` restaura
   exatamente essas linhas no final — testado de verdade rodando a suíte
   completa de novo e conferindo que os valores configurados sobreviveram.
   **Lição para qualquer teste de integração futuro que mexe numa tabela de
   configuração/estado compartilhado**: nunca fazer `DELETE` incondicional
   sem antes salvar o que já estava lá — mesmo um teste "só de leitura" pode
   destruir dado real através do cleanup de outro teste no mesmo arquivo.

## 4.3 Fase 9 — Testes + README

- `tests/unit/uploads.test.ts` (novo — primeiro teste unitário do projeto,
  não bate no banco) — cobre `sniffMimeType` com JPEG/PNG/WEBP/PDF válidos,
  um `.exe` disfarçado de imagem (rejeitado), buffer vazio/curto demais
  (rejeitado sem lançar exceção).
- `tests/integration/rbac.test.ts` (novo) — RBAC por RPC admin-only
  (`rpc_close_raffle`, `rpc_cancel_raffle`, `rpc_update_financial_transaction`,
  `rpc_delete_financial_transaction`) testado contra anônimo, VENDEDOR e
  VISUALIZADOR (não só anônimo, que já estava coberto); `rpc_cancel_sale`
  testado especificamente contra uma sessão VENDEDOR (o caso existente em
  `cancellation.test.ts` só cobria anônimo); RLS de `financial_transactions`
  testada diretamente (sem passar por RPC) para VENDEDOR/VISUALIZADOR/
  anônimo, tanto para `insert` quanto para `select`.
- `tests/integration/settings.test.ts` (novo) — `lib/settings.ts` com e sem
  override configurado, e um caso de "linha malformada" (`maxSizeBytes: 0`)
  caindo de volta pro default em vez de aplicar um limite quebrado.
- `tests/integration/concurrency.test.ts` já cobria idempotência (duas
  confirmações concorrentes com a mesma `idempotency_key` geram só uma
  venda) — não foi necessário duplicar, só confirmar que continua passando.
- `tests/mocks/server-only.ts` + alias em `vitest.config.mts` — o pacote
  `server-only` (usado em `lib/settings.ts`, `lib/supabase/admin.ts`, etc.)
  lança erro por padrão fora do bundler do Next (que é quem normalmente o
  neutraliza via a condição de export `react-server`); sem esse alias,
  qualquer teste de integração que importasse um desses módulos quebrava.
- **34 testes passando no total** (`npm run test`), rodando contra o projeto
  Supabase real, sem deixar rastro (toda rifa/usuário/lançamento de teste é
  limpo no `afterAll` — verificado com uma varredura manual no banco ao
  final da sessão: zero rifas/usuários "teste-*" sobrando).
- `README.md` reescrito do zero (era o placeholder do `create-next-app`) —
  stack, arquitetura, instalação, variáveis de ambiente, setup do Supabase,
  migrations, seed, Auth (criar admin, convidar usuário, configurar SMTP),
  Google Drive (como habilitar quando chegar a hora), testes, deploy,
  troubleshooting.

## 5. O que falta

Só uma coisa, e é proposital: a **implementação real do Google Drive**
(`GoogleDriveService` dentro de `lib/services/drive.ts` — o comentário
`TODO(google-drive)` explica o que fazer: `googleapis` + `google-auth-library`,
JWT de service account). Ver seção 8 do `README.md` para o passo a passo
completo de como habilitar quando as credenciais chegarem. Isso foi deixado
de fora **de propósito**, porque o usuário pediu para pausar essa parte no
início do projeto — não é uma fase incompleta por falta de tempo, é uma
decisão consciente registrada desde a seção 2 deste documento.

Depois que o Drive for configurado, o botão "Baixar" em `/admin/documentos`
já está preparado para preferir `drive_url` quando presente (é o
comportamento de `getDownloadUrl` em `app/admin/documentos/actions.ts`) —
só falta o job/fluxo que efetivamente sobe o arquivo pro Drive e preenche
essa coluna.

---

## 6. Como continuar

Ver `README.md` para instruções completas (instalação, variáveis de
ambiente, setup do Supabase, deploy, troubleshooting) — o que segue aqui é
só o essencial para retomar o desenvolvimento.

### Rodar localmente
```powershell
npm install
npm run dev
```
Precisa de `.env.local` preenchido (ver `.env.example`). As credenciais do
Supabase já existem — pedir para o dono do projeto ou olhar no dashboard do
Supabase (projeto `ekdbiofodxxwnlimazop`). Sem `SUPABASE_ACCESS_TOKEN`
configurado dá pra fazer praticamente tudo (rodar a app, testes, seed de
demonstração) — só falta pra aplicar migrations novas, abaixo.

### Aplicar migrations novas
```powershell
$env:SUPABASE_ACCESS_TOKEN = "<personal access token>"  # supabase.com/dashboard/account/tokens
npx supabase db push --linked --yes
npm run db:types  # regenerar types/database.ts depois de QUALQUER mudança de schema
```

### Popular com dados de demonstração
```powershell
node scripts/seed-demo-data.mjs
```
Idempotente — seguro rodar mais de uma vez. Ver seção 4.2.

### Rodar os testes
```powershell
npm run test               # unit + integração
npm run test:integration   # só integração — bate no banco real, cria/apaga seus próprios dados
npm run typecheck
npm run lint
npm run build
```

### Regra de ouro para continuar
Antes de marcar qualquer coisa como "pronta": rodar `typecheck` + `lint` +
`build`, e sempre que a mudança envolver uma RPC, RLS, ou qualquer fluxo de
concorrência/dinheiro/permissão, testar de verdade (subir o dev server e
clicar, ou escrever um teste de integração) — não confiar em "parece certo
pela leitura do código". Isso vale mesmo para telas que "só leem dados" —
o bug do filtro por número (seção 4.2) era read-only e mesmo assim só
apareceu ao clicar de verdade no navegador, não ao reler o SQL/TypeScript.
Se um teste de integração escrever em uma tabela de configuração/estado
compartilhado (como `system_settings`), nunca fazer `DELETE`/limpeza
incondicional — tirar um snapshot do que já existe antes e restaurar depois
(ver o bug #3 da seção 4.2, que apagou configuração real por causa disso).
