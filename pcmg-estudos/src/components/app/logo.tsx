export function Logo({ size = 32, withText = false }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#173D2B" />
        <path d="M32 12 L48 18 V31 C48 41 41 48.5 32 52 C23 48.5 16 41 16 31 V18 Z" fill="none" stroke="#E8F0E9" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M24.5 32.5 L30 38 L40.5 27" fill="none" stroke="#7FC29B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withText && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight">Meu Concurso</span>
          <span className="block text-xs text-muted">PCMG · Investigador</span>
        </span>
      )}
    </span>
  );
}
