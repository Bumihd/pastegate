// Logo mark: clipboard with a barrier – same geometry as extension/icons/logo.svg
export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" fill="none" stroke="var(--text)" strokeWidth="1.8" />
      <rect x="9" y="2.75" width="6" height="3.5" rx="1.2" fill="var(--text)" />
      <rect x="2.5" y="11" width="19" height="3.5" rx="1.75" fill="var(--accent)" />
    </svg>
  )
}

export function Logo({ size = 15 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.5),
      fontSize: size, fontWeight: 500, letterSpacing: '-0.2px' }}>
      <LogoMark size={Math.round(size * 1.35)} />
      <span>Paste<span style={{ color: 'var(--accent)' }}>gate</span></span>
    </span>
  )
}
