"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/dialog";
import { DatesCard, GoalsCard, SubjectsCard, WeeklyPlanCard } from "@/components/settings/planning";
import { PreferencesCard } from "@/components/settings/preferences";
import { BackupCard } from "@/components/settings/backup";
import { InstallCard } from "@/components/settings/install";

export default function SettingsPage() {
  const { user, auth } = useApp();
  const router = useRouter();
  const confirm = useConfirm();
  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Configurações" />
      <h2 className="pt-1 text-sm font-semibold uppercase tracking-wide text-muted">Planejamento</h2>
      <DatesCard />
      <GoalsCard />
      <WeeklyPlanCard />
      <SubjectsCard />
      <h2 className="pt-3 text-sm font-semibold uppercase tracking-wide text-muted">Preferências</h2>
      <PreferencesCard />
      <h2 className="pt-3 text-sm font-semibold uppercase tracking-wide text-muted">Dados</h2>
      <BackupCard />
      <InstallCard />
      <Card>
        <CardHeader title="Conta" description={user.email ?? ""} />
        <CardBody><Button variant="outline" onClick={async () => { if (await confirm({ title: "Sair da conta?", confirmLabel: "Sair" })) { await auth.signOut(); router.replace("/entrar"); } }}><LogOut size={15} /> Sair</Button></CardBody>
      </Card>
    </div>
  );
}
