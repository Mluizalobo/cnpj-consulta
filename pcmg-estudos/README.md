# Meu Concurso PCMG — PCMG Estudos

Aplicativo pessoal de estudos para o concurso de **Investigador de Polícia da Polícia Civil de Minas Gerais (PCMG)**.
Funciona no computador e no celular (pode ser instalado como aplicativo), com os dados salvos na nuvem e sincronizados entre os aparelhos.

> **Previsões não são dados oficiais.** O app começa com a data do edital prevista para 15/12/2026 e a da prova para 16/05/2027, ambas marcadas como "previsão" e editáveis. A banca começa como "FGV (prevista)". Esses dados só passam a ser "confirmados" quando um documento oficial é analisado e você aplica a atualização.

---

## Sumário

1. [O que o app faz](#1-o-que-o-app-faz)
2. [Como foi construído (arquitetura)](#2-como-foi-construído-arquitetura)
3. [Central do Concurso: monitoramento e atualização do edital](#3-central-do-concurso)
4. [Videoaulas](#4-videoaulas)
5. [Tutorial de publicação gratuita (passo a passo)](#5-tutorial-de-publicação-gratuita)
6. [Instalar no celular](#6-instalar-no-celular)
7. [Atualizar o app no futuro](#7-atualizar-o-app-no-futuro)
8. [Backup dos seus dados](#8-backup-dos-seus-dados)
9. [Limites dos planos gratuitos](#9-limites-dos-planos-gratuitos)
10. [Testes e verificação](#10-testes-e-verificação)
11. [O que ainda não está completo](#11-o-que-ainda-não-está-completo)

---

## 1. O que o app faz

| Área | O que tem |
|---|---|
| **Hoje** | Saudação, data, contagem regressiva, fase atual, horas do dia (meta de 2 h), revisões pendentes, progresso da semana, sequência de dias, sessões do dia com **cronômetro 35/25** (teoria/questões), revisões do dia, recomendações baseadas nos seus dados e botão "Encontrar videoaulas". |
| **Plano de estudos** | As 3 fases, visão **semanal** e **mensal**, sessões concluídas e pendentes, revisões, simulados e histórico. |
| **Questões** | 70 questões **autorais** (originais, nenhuma atribuída à FGV), resolução com correção imediata, histórico de cada questão, filtros, cadastro, edição e **importação CSV/JSON** com validação, prévia e bloqueio de duplicatas. |
| **Simulados** | Simulado de 70 questões com a distribuição da prova de 2024, 4h30, cronômetro regressivo, mapa de questões, marcar para revisar, salvamento automático, resultado por matéria e evolução. |
| **Caderno de erros** | Erros vindos das questões e dos simulados, anotações manuais, refazer a questão antes de ver o gabarito, contador de revisões, status (pendente/revisando/dominado), erros recorrentes e "Meus pontos de atenção". |
| **Desempenho** | Horas, dias, sequência, acertos por matéria (crítico < 50%, em desenvolvimento, meta ≥ 70%), evolução semanal/mensal de acertos e erros, notas dos simulados e análise de erros: matérias e assuntos mais difíceis, questões erradas repetidamente, 1ª tentativa × posteriores e fácil × difícil. |
| **Central do Concurso** | Situação do concurso, monitoramento de fontes oficiais, alertas, documentos, histórico de versões e **atualização do plano com um clique**. |
| **Edital verticalizado** | Matéria → tema → subtema → item, com status (não estudado/estudado/revisado/dominado), horas, questões, % de acertos, revisões, anotações, prioridade, questões vinculadas e videoaulas. |
| **Videoaulas** | Busca no YouTube por conteúdo, biblioteca pessoal (favoritas, assistir depois, assistidas, histórico), observações, vínculo com o edital e player incorporado. |
| **Configurações** | Datas, distribuição semanal, matérias/questões/pesos, metas, proporções por fase, tema claro/escuro/automático, avisos, revisões, **backup/restauração** e instruções de instalação. |

**Regras importantes já implementadas:**
- Revisões D+1, D+7 e D+30 são criadas automaticamente ao concluir um estudo. Revisões que cairiam no domingo passam para segunda-feira, e nenhuma revisão é duplicada.
- Questão **não respondida nunca conta como erro**. Respostas de treino, de simulado e de revisão do caderno ficam separadas.
- Assistir a uma videoaula **não** marca o conteúdo como dominado.
- Nada é apagado sem confirmação. Matérias que saem do edital ficam **inativas**, com o histórico preservado.

---

## 2. Como foi construído (arquitetura)

| Tecnologia | Por quê |
|---|---|
| **Next.js 15 + React + TypeScript** | Padrão do mercado, gratuito e publicado na Vercel com poucos cliques. |
| **Tailwind CSS** + componentes no estilo shadcn/ui | Visual próprio, leve e consistente nos temas claro e escuro. |
| **Supabase** (PostgreSQL + login por e-mail) | Banco na nuvem gratuito, com regras de segurança (RLS) que garantem que só você vê seus dados. |
| **Recharts**, **Zod**, **React Hook Form**, **Lucide** | Gráficos, validação de dados, formulários e ícones. |
| **Vitest + Playwright** | Testes automáticos das regras e do uso no navegador. |

**Sincronização ("local primeiro"):** cada ação aparece na hora e vai para uma fila guardada no aparelho (IndexedDB). A fila é enviada ao Supabase. Sem internet, ela espera e envia quando a conexão volta. O app busca o que mudou em outros aparelhos ao abrir, ao voltar para a aba e a cada minuto. O indicador no topo mostra: Sincronizado, Sincronizando, Offline (com pendências) ou Erro.

**Pastas principais:**
```
pcmg-estudos/
├─ src/app/            telas (Hoje, Plano, Questões…) e rotas do servidor (/api)
├─ src/components/     componentes visuais
├─ src/lib/domain/     regras puras (fases, plano, revisões, estatísticas, simulado, cronômetro…)
├─ src/lib/data/       sincronização, login e ações do app
├─ src/lib/monitor/    Central do Concurso (busca, PDF, classificação, leitura do edital, comparação, plano adaptativo)
├─ src/lib/videos/     regras e API do YouTube
├─ src/lib/seed/       matérias, plano semanal, questões autorais e estrutura preliminar do edital
├─ supabase/migrations/  estrutura do banco + segurança (execute no Supabase)
├─ tests/  e2e/        testes automáticos
└─ public/             ícones, service worker (PWA)
```

**Banco de dados (tabelas):** `profiles`, `user_settings`, `subjects`, `study_plan`, `study_sessions`, `review_schedule`, `questions`, `question_attempts`, `error_notebook`, `mock_exams`, `mock_exam_questions` (as respostas do simulado ficam nesta mesma tabela, o que dispensa uma `mock_exam_answers` separada), `syllabus_topics`, `plan_update_history`, `user_notifications`, `syllabus_import_jobs`, `video_lessons`, `video_search_cache`, `deleted_records` e as tabelas públicas do concurso: `competition_sources`, `competition_documents`, `competition_document_texts`, `competition_updates`, `competition_versions` e `monitoring_logs`.

---

## 3. Central do Concurso

### Como o monitoramento funciona
1. **Uma vez por dia**, o **Vercel Cron** (gratuito) chama `/api/cron/monitorar`, protegida por um segredo (`CRON_SECRET`). Não é preciso deixar o navegador aberto.
2. Opcionalmente, o **GitHub Actions** chama a mesma rota mais vezes por dia (arquivo `.github/workflows/pcmg-monitor.yml`).
3. O botão **"VERIFICAR E ATUALIZAR CONCURSO"** faz a mesma verificação na hora, com barra de progresso. Ele exige login e tem limite de frequência.

### Fontes monitoradas
- **Oficiais:** Polícia Civil de MG (páginas de concursos, notícias e ACADEPOL), Portal MG, SEPLAG-MG, Diário Oficial de MG (Jornal Minas Gerais) e FGV Conhecimento.
- **Secundárias (só pistas):** PCI Concursos, Estratégia, Gran e Direção Concursos. Elas **nunca** alteram o plano. Viram apenas "Pista não oficial", e links delas para sites oficiais são seguidos para encontrar o documento verdadeiro.
- Para editar as fontes: tabela `competition_sources` no Supabase (ou o arquivo `supabase/migrations/20261101000100_seed_sources.sql`). Os endereços podem mudar com o tempo. Se uma fonte aparecer com erro na Central, atualize o endereço.

### O que acontece com cada documento
1. **Baixa** o documento (com limite de tamanho e tempo, e bloqueio de endereços internos) e calcula um **hash SHA-256**, para nunca processar o mesmo documento duas vezes.
2. **Extrai o texto** do PDF (biblioteca `unpdf`, gratuita, sem IA) ou da página.
3. **Classifica:** tipo (edital, retificação, comunicado, cronograma, convocação, resultado), cargo (rejeita editais de **Delegado, Escrivão, Perito e Médico-Legista**), órgão (precisa ser a PCMG), **ano** (rejeita concursos anteriores), se a fonte é oficial e o grau de confiança. Também marca o status: confirmado, preliminar ou aguardando confirmação.
4. **Interpreta** o edital (regras próprias, sem IA). Extrai número, cargo, banca, vagas, escolaridade, requisitos, remuneração, taxa, inscrições, data/horário/duração da prova, etapas, critério de aprovação, total de questões, quadro de questões por matéria e pesos, conteúdo programático em árvore, legislação citada e cronograma, **sempre com a página de origem**.
5. **Retificações:** lê os trechos "onde se lê… leia-se…", aplica sobre a versão anterior e cria uma **nova versão**, mostrando o que mudou. O que o app não conseguir interpretar fica listado como "verificar manualmente".
6. **Divergências** entre documentos oficiais: vale o mais recente, e a divergência fica registrada e visível.
7. **IA opcional:** se você configurar `GEMINI_API_KEY` (camada gratuita do Google AI Studio), a IA completa **só** os campos que as regras não acharam. Cada resposta precisa citar um trecho literal do documento; se o trecho não existir, é descartada. Se a IA falhar, o app continua só com as regras.

### Atualização com um clique
Quando sai um edital oficial confirmado, a Central mostra **"ANALISAR NOVO EDITAL"**. A tela **"O que mudou no novo edital?"** mostra:
- antes × depois de cada informação (banca, data, total de questões, questões e peso por matéria, matérias novas, removidas e renomeadas, conteúdos, legislação, cronograma), com a página e o impacto;
- o que será alterado e o que será preservado, a nova distribuição semanal (continua com 12 h, domingo livre), a prioridade de cada matéria, dias e horas disponíveis até a prova, a estimativa de conclusão da teoria e a estratégia recomendada.

O botão **"APLICAR ATUALIZAÇÃO AO MEU PLANO"** atualiza matérias, pesos, conteúdos (preservando o status dos conteúdos equivalentes), banca, data e duração da prova, fases, contagem regressiva, cronograma, rotação de sexta, revisões atrasadas e simulados (que passam a seguir a nova distribuição). Também etiqueta o banco de questões: "Conteúdo fora do edital atual", "Legislação precisa ser atualizada", "Reclassificação necessária" e "Questão válida para o edital atual" (**nenhuma questão é excluída**). Um retrato do estado anterior fica salvo e há o botão **"desfazer"** no histórico.

Documento não confirmado como oficial (por exemplo, um PDF enviado manualmente sem endereço oficial) só pode ser aplicado depois de você digitar "CONFERI", e as datas ficam marcadas como não confirmadas.

**Modo manual assistido:** na Central, "Tenho o PDF do edital — analisar manualmente" lê o PDF ou o texto colado e gera o mesmo relatório.

### Como o plano é reorganizado (prioridade)
Para cada matéria: **peso na prova × (base mínima + necessidade)**. A necessidade combina:
- o seu % de acertos (suavizado quando há poucas questões);
- os conteúdos ainda não estudados;
- os erros em aberto no caderno;
- as revisões atrasadas.

Perto da prova, o desempenho pesa mais que a cobertura. Matérias prioritárias recebem até 2 sessões por semana; as demais entram na rotação de sexta. Nenhuma é abandonada.

---

## 4. Videoaulas

- **Busca automática:** usa a **YouTube Data API v3** (gratuita, cerca de 100 buscas por dia). A chave fica **só no servidor** (`YOUTUBE_API_KEY`).
- **Filtros contra vídeos errados:** descarta vídeos com menos de 6 min, transmissões ao vivo e vídeos que não citam a matéria ou o assunto ou que são claramente de outra matéria. Prioriza aulas completas, recentes, sobre concursos e que citam a banca. Vídeos antigos aparecem com o aviso "confira se está atualizado".
- **Sem chave configurada:** o botão "Abrir busca no YouTube" abre a pesquisa real no site, e o campo "Colar link" preenche título, canal e miniatura pelo **oEmbed** do YouTube (gratuito, sem chave). O app **nunca inventa** vídeos, links ou nomes de professores. Ele mostra apenas o canal informado pelo YouTube.
- Player incorporado (youtube-nocookie) ou abertura no YouTube. Os resultados ficam guardados por 14 dias para poupar a cota.
- Depois de aplicar um novo edital, o app busca videoaulas automaticamente para até 10 conteúdos novos. Em Videoaulas, o botão "Atualizar recomendações" busca mais, e a seção "Conteúdos sem videoaulas encontradas" lista o que ainda falta.

---

## 5. Tutorial de publicação gratuita

Você vai precisar de um e-mail e de uns 30–40 minutos. Tudo é gratuito.

### Passo 1 — Conta no GitHub (guarda o código)
1. Acesse **https://github.com/signup** e crie a conta.
2. O código já está no repositório **mluizalobo/cnpj-consulta**, branch **`claude/pcmg-estudos`**, pasta **`pcmg-estudos/`**. Para ficar mais organizado, você pode depois juntar (fazer *merge* de) esse branch no `main` pelo próprio GitHub (botão **Compare & pull request**).

### Passo 2 — Projeto gratuito no Supabase (banco de dados e login)
1. Acesse **https://supabase.com/dashboard** e entre com sua conta do GitHub.
2. Clique em **New project**. Escolha um nome (ex.: `pcmg-estudos`), crie uma **senha do banco** (guarde-a) e a região **South America (São Paulo)**. Clique em **Create new project** e espere uns 2 minutos.
3. No menu lateral, abra **SQL Editor** → **New query**. Abra no GitHub cada arquivo abaixo, **nesta ordem**, copie todo o conteúdo, cole e clique em **Run**:
   1. `pcmg-estudos/supabase/migrations/20261101000000_init.sql`
   2. `pcmg-estudos/supabase/migrations/20261101000100_seed_sources.sql`
   3. `pcmg-estudos/supabase/migrations/20261101000200_videos.sql`

   Cada um deve terminar com "Success".
4. **Entrar no app instalado (iPhone):** o Supabase só permite editar o modelo do e-mail com um servidor de e-mail próprio (SMTP). Por isso o app oferece **senha**: entre a primeira vez pelo link do e-mail, crie uma senha em **Configurações → Senha de acesso** e, no app instalado, use **"Entrar com senha"**.
5. **Endereços permitidos** (faça depois do Passo 5, quando tiver o endereço da Vercel): **Authentication → URL Configuration**.
   - **Site URL:** `https://SEU-APP.vercel.app`
   - **Redirect URLs:** adicione `https://SEU-APP.vercel.app/**` e `http://localhost:3000/**`.

### Passo 3 — Copiar as credenciais
Em **Project Settings → API Keys** (ou **Data API**), copie:
- **Project URL** (ex.: `https://abcd.supabase.co`) → vai em `NEXT_PUBLIC_SUPABASE_URL`;
- **Publishable key** (ou **anon public**, nas versões antigas) → vai em `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Essa chave é pública por natureza; a proteção vem das regras RLS.
- **Secret key** (ou **service_role**) → vai em `SUPABASE_SERVICE_ROLE_KEY`. Esta é **secreta**: nunca a coloque em nada que comece com `NEXT_PUBLIC_`, nunca a envie a ninguém e nunca a coloque no código. Ela fica só na Vercel.

### Passo 4 — Variáveis de ambiente
| Variável | Onde | Obrigatória? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel e `.env.local` | Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel e `.env.local` | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | **Só Vercel** | Para o monitoramento do concurso |
| `CRON_SECRET` | **Só Vercel** | Para a verificação diária automática. Use um texto aleatório longo (gere em https://www.uuidgenerator.net/ e junte dois). |
| `ALLOWED_EMAILS` | Só Vercel | Recomendado: o seu e-mail. Só ele pode usar as rotas do servidor. |
| `YOUTUBE_API_KEY` | Só Vercel | Opcional (busca automática de videoaulas) |
| `GEMINI_API_KEY` | Só Vercel | Opcional (IA para editais difíceis) |

**Chave do YouTube (opcional, grátis):**
1. Acesse **https://console.cloud.google.com/** e crie um projeto.
2. Em **APIs e serviços → Biblioteca**, ative a **YouTube Data API v3**.
3. Em **Credenciais → Criar credenciais → Chave de API**, crie a chave. Em **Restrições da API**, deixe só a YouTube Data API v3.

**Chave do Gemini (opcional, grátis):** **https://aistudio.google.com/apikey** → *Create API key*. No plano gratuito, o Google pode usar os textos enviados para melhorar seus produtos. Como os editais são documentos públicos, não há problema, mas a IA nunca recebe seus dados pessoais.

### Passo 5 — Publicar na Vercel (hospedagem)
1. Acesse **https://vercel.com/signup** e entre com o GitHub.
2. Clique em **Add New… → Project** e importe o repositório **cnpj-consulta** (autorize o acesso, se pedir).
3. Em **Root Directory**, clique em **Edit** e escolha **`pcmg-estudos`**. Isso é essencial.
4. Em **Environment Variables**, adicione as variáveis do Passo 4.
5. Se o código ainda não estiver no `main`: depois de criado o projeto, vá em **Settings → Git → Production Branch** e escolha `claude/pcmg-estudos` (ou faça o *merge* para o `main`).
6. Clique em **Deploy**. Em 2–3 minutos você recebe o endereço (ex.: `https://pcmg-estudos.vercel.app`).
7. Volte ao **Passo 2.5** e configure os endereços no Supabase.
8. **Verificação diária:** o arquivo `vercel.json` já agenda `/api/cron/monitorar` para 1x por dia. A Vercel usa automaticamente o `CRON_SECRET`. Confira em **Settings → Cron Jobs**.
9. **Primeiro acesso:** entre com seu e-mail. Depois, por segurança, desative novos cadastros no Supabase: **Authentication → Sign In / Providers → Allow new users to sign up = OFF**.

### Passo 6 (opcional) — Mais verificações por dia com o GitHub Actions
No GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
- `PCMG_APP_URL` = o endereço da Vercel;
- `PCMG_CRON_SECRET` = o mesmo valor de `CRON_SECRET`.

O workflow `Monitorar concurso PCMG` passa a rodar 3x por dia. Para aumentar a frequência perto do edital, edite a linha `cron:` em `.github/workflows/pcmg-monitor.yml`.

### Rodar no seu computador (opcional)
1. Instale o **Node.js 20 ou mais novo**: https://nodejs.org/
2. No terminal:
   ```bash
   git clone https://github.com/mluizalobo/cnpj-consulta.git
   cd cnpj-consulta && git checkout claude/pcmg-estudos && cd pcmg-estudos
   npm install
   cp .env.example .env.local   # depois edite .env.local com as suas chaves
   npm run dev
   ```
3. Abra **http://localhost:3000**.

---

## 6. Instalar no celular

**iPhone (Safari):**
1. Abra o endereço da Vercel no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta).
3. Toque em **Adicionar à Tela de Início** e depois em **Adicionar**.
4. No app instalado, toque em **Entrar com senha** (crie a senha antes em **Configurações → Senha de acesso**, entrando pelo link do e-mail no Safari).

**Android (Chrome):** abra o endereço no Chrome, toque nos **⋮** e depois em **Instalar app** (ou **Adicionar à tela inicial**).

**Notificações:**
- No Android e no computador, os avisos do cronômetro funcionam com o app aberto, inclusive em outra aba.
- No iPhone, só com o app instalado (iOS 16.4+), e o iOS pode atrasar avisos com o app fechado.
- Notificações *push* com o app totalmente fechado **não** foram implementadas. As novidades do concurso aparecem no sino 🔔 e na tela Hoje ao abrir o app.

---

## 7. Atualizar o app no futuro
Qualquer alteração enviada ao GitHub, no branch configurado na Vercel, gera uma nova versão publicada automaticamente em poucos minutos. Seus dados ficam no Supabase e **não são afetados**. No celular, feche e abra o app para carregar a versão nova.

## 8. Backup dos seus dados
- Seus dados já ficam salvos no Supabase. O backup é uma **cópia extra**.
- Em **Configurações → Backup e restauração**:
  - **Exportar tudo (JSON)** baixa sessões, revisões, questões, respostas, caderno, simulados, edital verticalizado, videoaulas e configurações.
  - **Exportar questões (CSV)** baixa só o banco de questões.
  - **Importar backup** valida o arquivo, mostra um resumo e oferece duas opções:
    - **Mesclar:** não apaga nada.
    - **Substituir:** pede que você digite "SUBSTITUIR" e baixa antes uma cópia dos dados atuais.
- Sugestão: exporte um backup por mês e guarde no Google Drive.

## 9. Limites dos planos gratuitos
Os planos e limites podem mudar; confira nos sites oficiais.
- **Supabase Free:** 500 MB de banco (sobra para anos de estudo). Projetos **sem uso por 7 dias são pausados**; basta entrar no painel e clicar em *Restore*. Como você usará o app quase todo dia, isso dificilmente acontece.
- **Vercel Hobby:** uso pessoal e não comercial, com cron **1x por dia** e funções de até cerca de 60 s.
- **GitHub Actions:** gratuito em repositórios públicos; em privados, há uma cota mensal de minutos (cada verificação usa menos de 1 minuto).
- **YouTube Data API:** 10.000 unidades por dia; cada busca usa cerca de 101, ou seja, perto de 100 buscas por dia.
- **Gemini (opcional):** a camada gratuita tem limites de requisições por minuto e por dia.

---

## 10. Testes e verificação
```bash
npm run lint         # padrão de código
npm run typecheck    # TypeScript
npm test             # testes unitários e de integração (Vitest)
./scripts/pg-local.sh && npm run test:db   # banco real local: migrations, RLS e isolamento (PostgreSQL 16)
npm run test:e2e     # navegador (Playwright): celular Android, iPhone, tablet e computador
npm run build        # versão de produção
npm run check:secrets  # confere que nenhuma chave secreta está no código ou no navegador
```
- Os testes de documentos usam **arquivos fictícios**, claramente marcados como tal, em `tests/fixtures/`.
- Os testes E2E rodam o app em **modo de teste** (`NEXT_PUBLIC_E2E=1`, servidor em memória, código de login `123456`) e **não** tocam o seu Supabase.

## 11. O que ainda não está completo
- **Ainda não testado contra serviços reais:** o Supabase real, o Vercel Cron e as APIs do YouTube e do Gemini dependem das suas contas. A lógica foi testada com um PostgreSQL real local (inclusive as regras de segurança) e com respostas simuladas dessas APIs.
- **Leitura de editais:** o interpretador foi testado com editais fictícios no formato usual. Um edital real pode ter quadros e tabelas com outra diagramação. Por isso o relatório sempre mostra a página de origem, avisa o que precisa ser conferido e nada é aplicado sem a sua confirmação. PDFs escaneados (imagem, sem texto) não são lidos.
- **Endereços das fontes:** os sites oficiais mudam de endereço com frequência; fontes com erro aparecem em vermelho na Central.
- **Notificações push** com o app fechado e **alertas por e-mail** não foram implementados. As novidades aparecem dentro do app (sino e tela Hoje).
- **Professores:** o app não classifica canais por fama, para não inventar reputações. Ele prioriza aulas completas, recentes e sobre concursos, e mostra o canal informado pelo YouTube.
