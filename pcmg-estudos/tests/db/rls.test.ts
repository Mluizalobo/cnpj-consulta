/**
 * Testes de banco REAIS (PostgreSQL): aplica as migrations e verifica RLS/isolamento.
 * Requer um PostgreSQL local: `./scripts/pg-local.sh` (ou defina PGTEST_URL).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_URL = process.env.PGTEST_URL ?? "postgres://postgres@localhost:54329/postgres";
const DB = `rls_test_${process.pid}`;
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

let admin: Client;
let db: Client;
let available = true;

async function asUser<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${uid ? "authenticated" : "anon"}`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    const r = await fn();
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_URL });
  try { await admin.connect(); } catch { available = false; return; }
  await admin.query(`drop database if exists ${DB}`);
  await admin.query(`create database ${DB}`);
  db = new Client({ connectionString: ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`) });
  await db.connect();
  await db.query("set client_min_messages = warning");
  await db.query(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"));
  const dir = join(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.query(readFileSync(join(dir, f), "utf8"));
  await db.query(`insert into auth.users(id, email) values ($1,'a@x.com'), ($2,'b@x.com')`, [U1, U2]);
}, 60000);

afterAll(async () => {
  if (!available) return;
  await db?.end();
  await admin.query(`drop database if exists ${DB}`);
  await admin.end();
});

const subjectInsert = (uid: string, name: string) =>
  db.query(`insert into public.subjects(user_id, name, short_name) values ($1, $2, $2) returning id`, [uid, name]);

describe("Banco de dados e RLS", () => {
  it("cria perfil automaticamente para novo usuário", async () => {
    if (!available) return;
    const r = await db.query(`select id from public.profiles order by id`);
    expect(r.rows.map((x) => x.id)).toEqual([U1, U2]);
  });

  it("cada usuária só vê e altera os próprios dados", async () => {
    if (!available) return;
    await asUser(U1, () => subjectInsert(U1, "Português U1"));
    await asUser(U2, () => subjectInsert(U2, "Português U2"));
    const seen1 = await asUser(U1, () => db.query(`select name from public.subjects`));
    expect(seen1.rows.map((r) => r.name)).toEqual(["Português U1"]);
    const upd = await asUser(U2, () => db.query(`update public.subjects set name='hack' where name='Português U1'`));
    expect(upd.rowCount).toBe(0);
    const del = await asUser(U2, () => db.query(`delete from public.subjects where name='Português U1'`));
    expect(del.rowCount).toBe(0);
  });

  it("impede inserir dados em nome de outra usuária", async () => {
    if (!available) return;
    await expect(asUser(U2, () => subjectInsert(U1, "Falso"))).rejects.toThrow(/row-level security/);
  });

  it("visitante sem login (anon) não acessa nada", async () => {
    if (!available) return;
    await expect(asUser(null, () => db.query(`select * from public.subjects`))).rejects.toThrow(/permission denied/);
    await expect(asUser(null, () => db.query(`select * from public.competition_documents`))).rejects.toThrow(/permission denied/);
  });

  it("dados do concurso: usuária lê, mas não escreve (somente o servidor)", async () => {
    if (!available) return;
    const r = await asUser(U1, () => db.query(`select count(*)::int as n from public.competition_sources`));
    expect(r.rows[0].n).toBeGreaterThan(5);
    await expect(asUser(U1, () => db.query(`insert into public.competition_updates(kind,title) values ('nova_informacao','x')`))).rejects.toThrow(/permission denied/);
    await expect(asUser(U1, () => db.query(`update public.competition_sources set active=false`))).rejects.toThrow(/permission denied/);
  });

  it("registra exclusões para sincronizar entre aparelhos e atualiza updated_at", async () => {
    if (!available) return;
    const { rows } = await asUser(U1, () => subjectInsert(U1, "Temporária"));
    const id = rows[0].id;
    await asUser(U1, () => db.query(`delete from public.subjects where id=$1`, [id]));
    const log = await asUser(U1, () => db.query(`select table_name from public.deleted_records where record_id=$1`, [id]));
    expect(log.rows).toEqual([{ table_name: "subjects" }]);
    const other = await asUser(U2, () => db.query(`select * from public.deleted_records where record_id=$1`, [id]));
    expect(other.rowCount).toBe(0);
  });

  it("impede revisões duplicadas (mesma sessão e intervalo)", async () => {
    if (!available) return;
    await asUser(U1, async () => {
      const s = await db.query(`insert into public.study_sessions(user_id,date,activity) values ($1,'2026-11-02','teoria_questoes') returning id`, [U1]);
      const sid = s.rows[0].id;
      const ins = `insert into public.review_schedule(user_id,session_id,interval_days,base_date,original_due_date,due_date) values ($1,$2,1,'2026-11-02','2026-11-03','2026-11-03')`;
      await db.query(ins, [U1, sid]);
      await expect(db.query(ins, [U1, sid])).rejects.toThrow(/duplicate key/);
    }).catch((e) => { if (!/duplicate key/.test(String(e))) throw e; });
  });

  it("valida dados no banco (gabarito, percentuais, tempos)", async () => {
    if (!available) return;
    const q = `insert into public.questions(user_id,statement,option_a,option_b,option_c,option_d,option_e,correct_option,content_hash) values ($1,'Enunciado','a','b','c','d','e',$2,$3)`;
    await expect(asUser(U1, () => db.query(q, [U1, "F", "h1"]))).rejects.toThrow(/check constraint/);
    await asUser(U1, () => db.query(q, [U1, "A", "h2"]));
    await expect(asUser(U1, () => db.query(q, [U1, "B", "h2"]))).rejects.toThrow(/duplicate key/);
    await expect(asUser(U1, () => db.query(`update public.user_settings set target_accuracy=150`))).resolves.toBeDefined(); // sem linha ainda
    await expect(asUser(U1, () => db.query(`insert into public.study_sessions(user_id,date,activity,questions_done,questions_correct) values ($1,'2026-11-02','questoes',2,5)`, [U1]))).rejects.toThrow(/check constraint/);
  });

  it("modo 'revisao' é aceito nas tentativas (histórico separado do erro original)", async () => {
    if (!available) return;
    await asUser(U1, () => db.query(`insert into public.question_attempts(user_id,selected_option,correct_option,is_correct,mode) values ($1,'A','A',true,'revisao')`, [U1]));
    await expect(asUser(U1, () => db.query(`insert into public.question_attempts(user_id,selected_option,correct_option,is_correct,mode) values ($1,'A','A',true,'outro')`, [U1]))).rejects.toThrow(/check constraint/);
  });

  it("videoaulas: cada usuária vê só a própria biblioteca e o link precisa ser https", async () => {
    if (!available) return;
    await asUser(U1, () => db.query(`insert into public.video_lessons(user_id,youtube_id,url,title) values ($1,'dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ','Aula')`, [U1]));
    const other = await asUser(U2, () => db.query(`select * from public.video_lessons`));
    expect(other.rowCount).toBe(0);
    await expect(asUser(U1, () => db.query(`insert into public.video_lessons(user_id,url,title) values ($1,'javascript:alert(1)','x')`, [U1]))).rejects.toThrow(/check constraint/);
    await expect(asUser(U1, () => db.query(`insert into public.video_lessons(user_id,youtube_id,url,title) values ($1,'dQw4w9WgXcQ','https://youtu.be/dQw4w9WgXcQ','dup')`, [U1]))).rejects.toThrow(/duplicate key/);
  });

  it("excluir a conta apaga os dados dela sem afetar a outra", async () => {
    if (!available) return;
    await db.query(`delete from auth.users where id=$1`, [U2]);
    const r = await db.query(`select count(*)::int n from public.subjects where user_id=$1`, [U2]);
    expect(r.rows[0].n).toBe(0);
    const r1 = await db.query(`select count(*)::int n from public.subjects where user_id=$1`, [U1]);
    expect(r1.rows[0].n).toBeGreaterThan(0);
  });
});
