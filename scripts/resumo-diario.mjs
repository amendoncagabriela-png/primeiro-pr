// Resumo diário da Rotina BIN para a diretoria.
// Lê no Firestore o que as lojas preencheram ONTEM (horário de Brasília) e envia por e-mail
// só os pontos que pedem atenção. Roda pelo GitHub Actions (.github/workflows/resumo-diario.yml).
//
// Variáveis de ambiente:
//   FIREBASE_SERVICE_ACCOUNT  JSON da conta de serviço do Firebase (segredo)
//   SMTP_USER / SMTP_PASS     conta Gmail e senha de app usadas para enviar (segredos)
//   EMAIL_TO                  destinatário(s), separados por vírgula
//   DATA_REF                  opcional: data de referência AAAA-MM-DD (padrão: ontem)
//   DRY_RUN=1                 não envia: grava o e-mail em resumo.html
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import { writeFileSync } from "node:fs";

const TZ = "America/Sao_Paulo";
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const APP = "https://amendoncagabriela-png.github.io/primeiro-pr/";

const hojeBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const parse = dk => { const [y, m, d] = dk.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const fmt = d => d.toISOString().slice(0, 10);
const addDias = (dk, n) => { const d = parse(dk); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const semanaDe = dk => addDias(dk, -((parse(dk).getUTCDay() + 6) % 7));
const dm = dk => dk.slice(8) + "/" + dk.slice(5, 7);
const diaSem = dk => DIAS[parse(dk).getUTCDay()];
const hora = iso => iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const EMO = { bom: "😀", medio: "😐", ruim: "😞" };

if (!admin.apps.length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-rotina" });
  else {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
    if (!sa.project_id) throw new Error("FIREBASE_SERVICE_ACCOUNT não configurado.");
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
}
const db = admin.firestore();

const REF = process.env.DATA_REF || addDias(hojeBR(), -1);   // dia analisado
const HOJE = addDias(REF, 1);
const SEM = semanaDe(REF), SEM_ANT = addDias(SEM, -7);

function nomeDe(loja, k) {
  if (k === "todos") return "Toda a equipe";
  if (k === "gerente") return "Gerente";
  if (k === "diretoria") return "Diretoria";
  return loja.membros?.[k]?.nome || "";
}

async function coletar() {
  const lojasSnap = await db.collection("lojas").get();
  const lojas = [];
  for (const d of lojasSnap.docs) {
    const loja = { id: d.id, ...d.data() };
    const base = db.collection("lojas").doc(d.id);
    const [dia, reg, rep, repAnt] = await Promise.all([
      base.collection("dias").doc(REF).get(),
      base.collection("reportes").doc("dia-" + REF).get(),
      base.collection("reportes").doc("sem-" + SEM).get(),
      base.collection("reportes").doc("sem-" + SEM_ANT).get(),
    ]);
    const itens = dia.exists ? Object.values(dia.data().itens || {}).filter(x => x && !x.removido) : [];
    lojas.push({ loja, itens, reg: reg.exists ? reg.data() : null, rep: rep.exists ? rep.data() : null, repAnt: repAnt.exists ? repAnt.data() : null });
  }
  const pedidos = (await db.collection("pedidos").get()).docs.map(x => ({ id: x.id, ...x.data() }));
  return { lojas: lojas.sort((a, b) => (a.loja.nome || "").localeCompare(b.loja.nome || "")), pedidos };
}

// Monta os tópicos que pedem atenção. Cada tópico: { nivel: "alta"|"media", loja, texto }
function analisar({ lojas, pedidos }) {
  const t = [];
  const add = (nivel, grupo, loja, texto) => t.push({ nivel, grupo, loja, texto });
  const resumo = [];
  for (const { loja, itens, reg, rep, repAnt } of lojas) {
    const nome = loja.nome || "Loja";
    const marc = itens.filter(x => ["feito", "nao", "parcial"].includes(x.st));
    const feito = itens.filter(x => x.st === "feito").length;
    const pct = itens.length ? Math.round(feito / itens.length * 100) : null;
    const al = itens.filter(x => x.st === "feito" && x.al);
    resumo.push({ nome, total: itens.length, feito, pct, marc: marc.length, reg: !!reg, al: al.length });

    // Uso do checklist
    if (!marc.length) add("alta", "Uso do app", nome, "Nenhuma atividade marcada no checklist.");
    else if (pct != null && pct < 50) add("media", "Uso do app", nome, `Só ${pct}% do checklist realizado (${feito} de ${itens.length}).`);
    if (al.length >= 3 || (marc.length && al.length / marc.length >= 0.3))
      add("media", "Uso do app", nome, `${al.length} marcações com aviso (feitas logo após criar a tarefa ou várias em sequência).`);
    const naoReal = itens.filter(x => x.st === "nao" && x.motivo);
    if (naoReal.length) add("media", "Atividades não realizadas", nome, naoReal.slice(0, 4).map(x => `“${x.t}”: ${x.motivo}`).join(" · ") + (naoReal.length > 4 ? ` (+${naoReal.length - 4})` : ""));

    // Registro do dia
    if (!reg) add("media", "Registro do dia", nome, "Registro do dia não preenchido.");
    else {
      if (reg.clima === "ruim") add("alta", "Equipe", nome, `Clima ruim 😞${reg.climaObs ? ": " + reg.climaObs : ""}`);
      else if (reg.clima === "medio" && reg.climaObs) add("media", "Equipe", nome, `Clima neutro 😐: ${reg.climaObs}`);
      if (reg.faltas) add("media", "Equipe", nome, `Faltas/atestados: ${reg.faltas}`);
      if (reg.caixa === "falta" || reg.caixa === "sobra") add("alta", "Caixa", nome, `Diferença de caixa (${reg.caixa})${reg.caixaObs ? ": " + reg.caixaObs : ""}`);
      if (reg.vendas === "abaixo") add("media", "Vendas", nome, "Vendas abaixo do ritmo da meta diária (FUTURA).");
      if (reg.vendas === "nao") add("media", "Vendas", nome, "Não conferiu o ritmo de vendas no FUTURA.");
    }

    // Reporte semanal enviado ontem (ou alterado ontem)
    const doDia = rep && rep.enviado && new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(rep.enviado)) === REF;
    if (doDia) {
      if (rep.urgente) add("alta", "Urgências", nome, `Precisa de decisão da diretoria: ${rep.urgente}`);
      if (rep.ritmo === "abaixo") add("media", "Vendas", nome, `Reporte semanal: abaixo da meta do mês${rep.vendasObs ? ". Ação: " + rep.vendasObs : ""}`);
      if (rep.promo === "nao") add("media", "Estoque", nome, "Promoção não está exposta conforme combinado.");
      if (rep.pendencia) add("media", "Loja", nome, `Pendência: ${rep.pendencia}`);
      if (rep.estoque) add("media", "Estoque", nome, rep.estoque);
      if (rep.planejar) add("media", "Manutenção", nome, `Pode ser planejado: ${rep.planejar}`);
      if (rep.futuro) add("media", "Manutenção", nome, `Atenção futura: ${rep.futuro}`);
    }
    // Reporte pendente: sábado e domingo cobram a semana atual; segunda cobra a anterior
    const dowHoje = parse(HOJE).getUTCDay();
    if ((dowHoje === 0 && !rep) || (dowHoje === 1 && !repAnt)) add("media", "Reporte semanal", nome, "Reporte da semana ainda não enviado.");
  }
  for (const p of pedidos) add("media", "Acessos", p.nome || p.id, `Pediu acesso (${[p.loja, p.funcao].filter(Boolean).join(" · ")}).`);
  return { topicos: t, resumo };
}

function montarEmail({ topicos, resumo }) {
  const altas = topicos.filter(x => x.nivel === "alta");
  const assunto = `Rotina BIN · ${diaSem(REF)} ${dm(REF)} · ${topicos.length ? topicos.length + " ponto" + (topicos.length > 1 ? "s" : "") + " de atenção" + (altas.length ? ` (${altas.length} importante${altas.length > 1 ? "s" : ""})` : "") : "tudo em dia"}`;
  const grupos = {};
  for (const x of [...altas, ...topicos.filter(x => x.nivel !== "alta")]) (grupos[x.grupo] ||= []).push(x);
  const ordem = ["Urgências", "Caixa", "Equipe", "Uso do app", "Registro do dia", "Reporte semanal", "Vendas", "Atividades não realizadas", "Loja", "Estoque", "Manutenção", "Acessos"];
  const blocos = ordem.filter(g => grupos[g]).map(g => `
    <h3 style="margin:22px 0 8px;font:700 13px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#5C6473">${esc(g)}</h3>
    ${grupos[g].map(x => `<div style="margin:0 0 6px;padding:9px 12px;border-radius:8px;background:${x.nivel === "alta" ? "#FAE5E2" : "#F2F3EF"};font:14px/1.45 Arial,sans-serif;color:#1A2130">
      <b>${esc(x.loja)}</b> · ${esc(x.texto)}</div>`).join("")}`).join("");
  const linhas = resumo.map(r => `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #DADDD5"><b>${esc(r.nome)}</b></td>
      <td style="padding:6px 8px;border-bottom:1px solid #DADDD5;text-align:right">${r.pct == null ? "–" : r.pct + "%"}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #DADDD5;text-align:right">${r.marc}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #DADDD5;text-align:center">${r.reg ? "✓" : "–"}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #DADDD5;text-align:right">${r.al || "–"}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#F2F3EF">
  <div style="max-width:640px;margin:0 auto;padding:20px 16px;background:#fff">
    <div style="font:800 22px Arial,sans-serif;color:#1A2130;text-transform:uppercase">Rotina BIN</div>
    <div style="font:14px Arial,sans-serif;color:#5C6473;margin-top:2px">Resumo de ${diaSem(REF)}, ${dm(REF)} · ${topicos.length ? topicos.length + " ponto(s) de atenção" : "nenhum ponto de atenção"}</div>
    ${topicos.length ? blocos : `<p style="font:15px Arial,sans-serif;color:#1C7F46;margin-top:20px">Tudo em dia: todas as lojas usaram o checklist e não houve alertas. ✅</p>`}
    <h3 style="margin:26px 0 8px;font:700 13px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#5C6473">Visão geral do dia</h3>
    <table style="width:100%;border-collapse:collapse;font:13px Arial,sans-serif;color:#1A2130">
      <tr style="color:#5C6473"><th style="text-align:left;padding:6px 8px">Loja</th><th style="text-align:right;padding:6px 8px">Realizado</th><th style="text-align:right;padding:6px 8px">Marcadas</th><th style="padding:6px 8px">Registro</th><th style="text-align:right;padding:6px 8px">Com aviso</th></tr>
      ${linhas}</table>
    <p style="margin-top:22px"><a href="${APP}" style="display:inline-block;background:#1F4FD1;color:#fff;text-decoration:none;font:700 14px Arial,sans-serif;padding:11px 18px;border-radius:999px">Abrir o painel da diretoria</a></p>
    <p style="font:12px Arial,sans-serif;color:#8A909B">E-mail automático da Rotina BIN, enviado todo dia de manhã com o que foi registrado no dia anterior.</p>
  </div></body></html>`;
  const texto = `Rotina BIN · Resumo de ${dm(REF)}\n\n` + (topicos.length ? topicos.map(x => `${x.nivel === "alta" ? "[!] " : "- "}${x.loja}: ${x.texto}`).join("\n") : "Tudo em dia.") + `\n\nPainel: ${APP}`;
  return { assunto, html, texto };
}

const dados = await coletar();
const analise = analisar(dados);
const email = montarEmail(analise);
console.log(email.assunto);
if (process.env.DRY_RUN) {
  writeFileSync("resumo.html", email.html);
  console.log(email.texto);
} else {
  const para = process.env.EMAIL_TO;
  if (!para || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error("Configure EMAIL_TO, SMTP_USER e SMTP_PASS.");
  const t = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await t.sendMail({ from: `"Rotina BIN" <${process.env.SMTP_USER}>`, to: para, subject: email.assunto, text: email.texto, html: email.html });
  console.log("Enviado para", para);
}
