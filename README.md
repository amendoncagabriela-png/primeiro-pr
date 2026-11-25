# Rotina BIN

Checklist diário das lojas BIN Embalagens, feito para usar no celular.

- **Diretoria**: vê e configura todas as lojas.
- **Gerente**: monta a rotina da loja, direciona tarefas, cadastra a equipe e acompanha os indicadores.
- **Colaborador**: vê o checklist da loja e marca cada atividade como realizada ou não realizada.

O login é por e-mail (link de acesso, sem senha, qualquer provedor) ou pela conta Google. O login por SMS continua no código, escondido (`MOSTRAR_SMS` em `index.html`). Cada pessoa só enxerga a loja em que foi cadastrada; isso é garantido pelas regras de segurança do banco (`firestore.rules`), não só pela tela.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html` | O app inteiro (tela, estilos e lógica). |
| `firebase-config.js` | Dados do projeto Firebase. Precisa ser preenchido. |
| `firestore.rules` | Regras de segurança do banco. Copiar para o console do Firebase. |

## Configuração do Firebase

1. **Authentication → Método de login:**
   - **E-mail/senha → Ativar** e ligue também **Link do e-mail (login sem senha)**.
   - **Google → Ativar** (escolha o e-mail de suporte e salve).
   - (Opcional, escondido no app) **Telefone → Ativar**. O SMS exige o plano Blaze; use *Números de telefone para teste* para testar sem custo.
2. **Authentication → Configurações → Domínios autorizados → Adicionar domínio:** `amendoncagabriela-png.github.io`
3. **Firestore Database → Criar banco de dados** (local `southamerica-east1`, modo de produção).
4. **Firestore Database → Regras:** apague o conteúdo, cole o conteúdo de `firestore.rules` e clique em **Publicar**.
5. **Cadastre a diretoria:** Firestore Database → Dados → **Iniciar coleção** → ID da coleção `admins` →
   ID do documento = e-mail em minúsculas (ex.: `nome@outlook.com`) ou celular no formato `+5511999990000` → adicione um campo qualquer (ex.: `nome` = `Diretoria`) → Salvar.
   Repita para cada pessoa da diretoria.
6. **Configurações do projeto → Seus apps → app Web:** copie os valores de `firebaseConfig` para `firebase-config.js`.

## Como usar

1. A diretoria entra com o e-mail, cria as lojas e, na aba **Equipe** de cada loja, cadastra o gerente com nome, e-mail e papel *Gerente*.
2. O gerente entra com o e-mail dele e cadastra os colaboradores da loja (o e-mail é opcional: sem ele, a pessoa recebe tarefas, mas não entra no app).
3. Cada pessoa abre o endereço do app, digita o e-mail e toca no link que recebe (no mesmo aparelho), ou entra com a conta Google.
4. Quem entra com um e-mail ainda não cadastrado preenche nome, loja e função e envia um **pedido de acesso**. A diretoria vê os pedidos na tela **Lojas BIN**, escolhe a loja e o papel e libera (ou recusa). A pessoa entra na loja assim que for liberada.

## Regras de uso do checklist

- **Trava do dia:** gerentes e colaboradores só marcam atividades do dia de hoje. Dias anteriores ficam fechados (na tela e nas regras do banco); só a diretoria corrige. Dias futuros continuam abertos para planejamento.
- **Avisos de marcação apressada:** o app pede confirmação quando uma tarefa é marcada como realizada até 5 minutos depois de criada, ou quando a mesma pessoa marca 4 ou mais atividades em 3 minutos. Se confirmada, a marcação fica sinalizada (campo `al`) e aparece para o gerente e na coluna “Com aviso” do painel da diretoria.

## Registro do dia e reporte semanal (gerente)

- **Registro do dia:** no fim do checklist, o gerente marca o clima da equipe, faltas/atestados, diferença de caixa e se conferiu o ritmo de vendas no FUTURA (sem valores). Fecha junto com o dia.
- **Aba Reporte:** reporte semanal (sexta/sábado) com resumo automático da semana, a partir do checklist e dos registros do dia, mais os campos de vendas, equipe, loja, estoque e urgências. Substitui o resuminho do WhatsApp.
- Só o gerente da loja e a diretoria leem e escrevem os reportes; colaboradores não têm acesso. A diretoria vê tudo na seção **Reportes semanais** do painel.

## Resumo diário por e-mail

Todo dia às 7h30 (Brasília), o GitHub Actions roda `scripts/resumo-diario.mjs` (`.github/workflows/resumo-diario.yml`): lê o que as lojas registraram no dia anterior e envia para a diretoria só os pontos de atenção (urgências, diferença de caixa, clima ruim, faltas, lojas sem uso, registro do dia não preenchido, marcações com aviso, vendas abaixo do ritmo, reportes pendentes e pedidos de acesso).

Segredos do repositório (Settings → Secrets and variables → Actions):
- `FIREBASE_SERVICE_ACCOUNT`: JSON da conta de serviço (Firebase → Configurações do projeto → Contas de serviço → Gerar nova chave privada).
- `SMTP_USER` e `SMTP_PASS`: Gmail que envia e a senha de app dele.
- `EMAIL_TO`: quem recebe (vários separados por vírgula).

O agendamento do GitHub só roda a partir da branch principal (`main`). Para testar na hora: aba Actions → “Resumo diário da Rotina BIN” → Run workflow.

## Estrutura dos dados

- `admins/{celular ou e-mail}`: diretoria (cadastrada só pelo console).
- `acessos/{celular ou e-mail}`: loja e papel de cada pessoa que entra no app.
- `pedidos/{celular ou e-mail}`: pedidos de acesso aguardando a diretoria.
- `lojas/{loja}`: nome e equipe da loja.
- `lojas/{loja}/config/rotina`: rotinas que se repetem.
- `lojas/{loja}/dias/{AAAA-MM-DD}`: checklist de cada dia.
- `lojas/{loja}/reportes/dia-{AAAA-MM-DD}`: registro do dia do gerente.
- `lojas/{loja}/reportes/sem-{AAAA-MM-DD}`: reporte semanal (a data é a segunda-feira da semana).
