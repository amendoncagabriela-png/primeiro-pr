# Rotina BIN

Checklist diário das lojas BIN Embalagens, feito para usar no celular.

- **Diretoria**: vê e configura todas as lojas.
- **Gerente**: monta a rotina da loja, direciona tarefas, cadastra a equipe e acompanha os indicadores.
- **Colaborador**: vê o checklist da loja e marca cada atividade como realizada ou não realizada.

O login é pelo número de celular (código por SMS) ou pela conta Google. Cada pessoa só enxerga a loja em que foi cadastrada; isso é garantido pelas regras de segurança do banco (`firestore.rules`), não só pela tela.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html` | O app inteiro (tela, estilos e lógica). |
| `firebase-config.js` | Dados do projeto Firebase. Precisa ser preenchido. |
| `firestore.rules` | Regras de segurança do banco. Copiar para o console do Firebase. |

## Configuração do Firebase

1. **Authentication → Método de login → Telefone → Ativar.**
   O envio de SMS exige o plano Blaze (pago por uso). Cadastre um alerta de orçamento.
   Em *Números de telefone para teste*, cadastre um número fictício com código fixo para testar sem gastar SMS.
   Para o login com Google: **Authentication → Método de login → Google → Ativar** (escolha o e-mail de suporte e salve).
2. **Authentication → Configurações → Domínios autorizados → Adicionar domínio:** `amendoncagabriela-png.github.io`
3. **Firestore Database → Criar banco de dados** (local `southamerica-east1`, modo de produção).
4. **Firestore Database → Regras:** apague o conteúdo, cole o conteúdo de `firestore.rules` e clique em **Publicar**.
5. **Cadastre a diretoria:** Firestore Database → Dados → **Iniciar coleção** → ID da coleção `admins` →
   ID do documento = celular no formato `+5511999990000` ou e-mail Google em minúsculas (ex.: `nome@gmail.com`) → adicione um campo qualquer (ex.: `nome` = `Diretoria`) → Salvar.
   Repita para cada pessoa da diretoria.
6. **Configurações do projeto → Seus apps → app Web:** copie os valores de `firebaseConfig` para `firebase-config.js`.

## Como usar

1. A diretoria entra com o celular, cria as lojas e, na aba **Equipe** de cada loja, cadastra o gerente com nome, celular e/ou e-mail Google e papel *Gerente*.
2. O gerente entra com o celular dele e cadastra os colaboradores da loja (o celular é opcional: sem ele, a pessoa recebe tarefas, mas não entra no app).
3. Cada pessoa abre o endereço do app e entra com o celular (código por SMS) ou com a conta Google.

## Estrutura dos dados

- `admins/{celular ou e-mail}`: diretoria (cadastrada só pelo console).
- `acessos/{celular ou e-mail}`: loja e papel de cada pessoa que entra no app.
- `lojas/{loja}`: nome e equipe da loja.
- `lojas/{loja}/config/rotina`: rotinas que se repetem.
- `lojas/{loja}/dias/{AAAA-MM-DD}`: checklist de cada dia.
