import { AuthedApp } from "@/components/app/providers";
import { AppShell } from "@/components/app/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthedApp>
      <AppShell>{children}</AppShell>
    </AuthedApp>
  );
}
