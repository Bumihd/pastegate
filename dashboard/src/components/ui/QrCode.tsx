// Shared QR display for TOTP provisioning.
// The image is rendered server-side (data: URI) and NOT loaded from an external
// service – the TOTP secret never leaves the self-hosted system.

export function QrCode({ src, label }: { src: string; label: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      padding: 20, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
    }}>
      <img
        src={src}
        alt={label}
        width={180}
        height={180}
        style={{ width: 180, height: 180, borderRadius: 8, background: '#fff', padding: 8 }}
      />
    </div>
  )
}

export default QrCode
