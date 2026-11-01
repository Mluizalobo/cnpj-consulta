import { CalendarDays, ChartColumn, ClipboardCheck, Home, Library, ListTree, NotebookPen, Radar, Settings, type LucideIcon } from "lucide-react";
export interface NavItem { href: string; label: string; short?: string; icon: LucideIcon; mobile?: boolean }
export const NAV: NavItem[] = [
  { href: "/", label: "Hoje", icon: Home, mobile: true },
  { href: "/plano", label: "Plano de estudos", short: "Plano", icon: CalendarDays, mobile: true },
  { href: "/questoes", label: "Questões", icon: Library, mobile: true },
  { href: "/simulados", label: "Simulados", icon: ClipboardCheck, mobile: true },
  { href: "/caderno", label: "Caderno de erros", short: "Erros", icon: NotebookPen },
  { href: "/desempenho", label: "Desempenho", icon: ChartColumn },
  { href: "/concurso", label: "Central do Concurso", short: "Concurso", icon: Radar },
  { href: "/edital", label: "Edital verticalizado", short: "Edital", icon: ListTree },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
export const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
