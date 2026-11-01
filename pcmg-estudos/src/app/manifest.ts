import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meu Concurso PCMG",
    short_name: "PCMG Estudos",
    description: "Painel pessoal de estudos para Investigador da Polícia Civil de Minas Gerais.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F8F6",
    theme_color: "#173D2B",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Hoje", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Questões", url: "/questoes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
