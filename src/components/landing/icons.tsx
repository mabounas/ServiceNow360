/* Icônes Lucide inlinées (le système de design prescrit Lucide). */
type Props = { size?: number; style?: React.CSSProperties };

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export function IconKanban({ size = 24, style }: Props) {
  return (
    <svg {...base(size)} style={{ display: 'block', ...style }} aria-hidden="true">
      <path d="M6 5v11" />
      <path d="M12 5v6" />
      <path d="M18 5v14" />
    </svg>
  );
}

export function IconTicket({ size = 24, style }: Props) {
  return (
    <svg {...base(size)} style={{ display: 'block', ...style }} aria-hidden="true">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}

export function IconLineChart({ size = 24, style }: Props) {
  return (
    <svg {...base(size)} style={{ display: 'block', ...style }} aria-hidden="true">
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

export function IconAlertTriangle({ size = 24, style }: Props) {
  return (
    <svg {...base(size)} style={{ display: 'block', ...style }} aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function IconSquareCheck({ size = 24, style }: Props) {
  return (
    <svg {...base(size)} style={{ display: 'block', ...style }} aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="0" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
