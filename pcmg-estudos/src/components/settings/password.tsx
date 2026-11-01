"use client";
import { useState } from "react";
import { toast } from "sonner";
import { LockKeyhole } from "lucide-react";
import { useApp } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Field, Input } from "@/components/ui/primitives";

/** Senha para entrar no app instalado (iPhone), sem depender do link do e-mail. */
export function PasswordCard() {
  const { auth } = useApp();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const error = pw && pw.length < 8 ? "Use pelo menos 8 caracteres" : pw2 && pw !== pw2 ? "As senhas não conferem" : undefined;
  const save = async () => {
    setBusy(true);
    try { await auth.setPassword(pw); setPw(""); setPw2(""); toast.success("Senha salva! No app instalado, use “Entrar com senha”."); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card id="senha">
      <CardHeader title="Senha de acesso" description="Para entrar no app instalado no celular sem depender do link do e-mail." />
      <CardBody className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nova senha" htmlFor="new-pw" error={pw && pw.length < 8 ? error : undefined}><Input id="new-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Repita a senha" htmlFor="new-pw2" error={pw2 && pw !== pw2 ? error : undefined}><Input id="new-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        </div>
        <Button onClick={save} loading={busy} disabled={!pw || !!error || pw !== pw2} data-testid="save-password"><LockKeyhole size={15} /> Salvar senha</Button>
      </CardBody>
    </Card>
  );
}
