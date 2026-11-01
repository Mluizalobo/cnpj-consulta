"use client";
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";

interface BIPEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

export function InstallCard() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  return (
    <Card id="instalar">
      <CardHeader title="Instalar no celular" description={installed ? "O app já está instalado neste aparelho." : "Use como aplicativo, em tela cheia, direto da tela inicial."} />
      <CardBody className="space-y-3 text-sm">
        {evt && <Button onClick={async () => { await evt.prompt(); setEvt(null); }}><Smartphone size={16} /> Instalar agora</Button>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3"><p className="mb-1 font-medium">iPhone (Safari)</p><ol className="list-decimal space-y-0.5 pl-4 text-muted"><li>Abra o app no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b> (quadrado com seta).</li><li>Escolha <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>.</li></ol><p className="mt-1 text-xs text-muted">Para entrar no app instalado, use o <b>código de 6 dígitos</b> do e-mail.</p></div>
          <div className="rounded-xl border p-3"><p className="mb-1 font-medium">Android (Chrome)</p><ol className="list-decimal space-y-0.5 pl-4 text-muted"><li>Abra o app no <b>Chrome</b>.</li><li>Toque nos <b>três pontos</b> (⋮).</li><li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li></ol></div>
        </div>
      </CardBody>
    </Card>
  );
}
