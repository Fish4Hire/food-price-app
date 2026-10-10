/** The site logo: a simple basket in a rounded green square. */
export function BasketMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M9 13h14l-1.6 9.2a2 2 0 0 1-2 1.8h-6.8a2 2 0 0 1-2-1.8z M12 13l3-5 M20 13l-3-5"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 17v3.5 M18 17v3.5" stroke="var(--accent-ink)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
