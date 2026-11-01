import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RootProviders } from "@/components/app/providers";
import { THEME_SCRIPT } from "@/components/app/theme";
import { SwRegister } from "@/components/app/sw-register";

export const metadata: Metadata = {
  title: { default: "Meu Concurso PCMG", template: "%s · PCMG Estudos" },
  description: "Painel pessoal de estudos para o concurso de Investigador da Polícia Civil de Minas Gerais.",
  applicationName: "PCMG Estudos",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PCMG Estudos", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192" }, { url: "/favicon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F7F8F6" }, { media: "(prefers-color-scheme: dark)", color: "#111412" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <RootProviders>{children}</RootProviders>
        <SwRegister />
      </body>
    </html>
  );
}
