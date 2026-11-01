"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useApp, useRows } from "./context";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";

export function NotificationsButton() {
  const { actions } = useApp();
  const rows = useRows("user_notifications");
  const [open, setOpen] = useState(false);
  const list = useMemo(() => [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50), [rows]);
  const unread = rows.filter((n) => !n.read_at).length;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-2" aria-label={`Notificações${unread ? ` (${unread} novas)` : ""}`} data-testid="notifications">
        <Bell size={18} />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-alert px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Notificações"
        footer={unread > 0 ? <Button variant="outline" size="sm" onClick={() => actions.markAllNotificationsRead()}><CheckCheck size={15} /> Marcar todas como lidas</Button> : undefined}>
        {list.length === 0 ? <EmptyState icon={<Bell size={20} />} title="Nenhuma notificação" description="Novidades oficiais do concurso e atualizações do plano aparecem aqui." /> : (
          <ul className="-mx-2 divide-y">
            {list.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? "#"} onClick={() => { actions.markNotificationRead(n.id); setOpen(false); }} className="flex gap-3 rounded-lg px-2 py-3 hover:bg-surface-2">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-muted">{new Date(n.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
