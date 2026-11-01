"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Input } from "./primitives";
import { cn } from "./cn";

export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md" }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg";
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] animate-fade-in" />
        <D.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] w-full flex-col border bg-surface shadow-pop focus:outline-none",
            "bottom-0 left-0 rounded-t-2xl animate-slide-up sm:inset-0 sm:m-auto sm:h-fit sm:rounded-2xl sm:animate-scale-in",
            size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl",
          )}>
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div>
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Diálogo"}</D.Description>}
            </div>
            <D.Close asChild><Button variant="ghost" size="icon" aria-label="Fechar" className="-mr-2 -mt-1 h-9 w-9"><X size={18} /></Button></D.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="pb-safe flex flex-wrap justify-end gap-2 border-t px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

interface ConfirmOpts { title: string; description?: ReactNode; confirmLabel?: string; danger?: boolean; typeToConfirm?: string }
const Ctx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(Ctx);

/** Modal de confirmação para ações importantes. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<(v: boolean) => void>(() => undefined);
  const confirm = useCallback((o: ConfirmOpts) => {
    setTyped(""); setOpts(o);
    return new Promise<boolean>((res) => { resolver.current = res; });
  }, []);
  const close = (v: boolean) => { resolver.current(v); setOpts(null); };
  const blocked = !!opts?.typeToConfirm && typed.trim().toUpperCase() !== opts.typeToConfirm.toUpperCase();
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onOpenChange={(o) => !o && close(false)} title={opts?.title ?? ""} size="sm"
        footer={<>
          <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>
          <Button variant={opts?.danger ? "danger" : "primary"} disabled={blocked} onClick={() => close(true)}>{opts?.confirmLabel ?? "Confirmar"}</Button>
        </>}>
        {opts?.description && <div className="text-sm leading-relaxed text-muted">{opts.description}</div>}
        {opts?.typeToConfirm && (
          <div className="mt-3">
            <p className="mb-1.5 text-sm">Digite <b>{opts.typeToConfirm}</b> para confirmar:</p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label="Confirmação" />
          </div>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}
