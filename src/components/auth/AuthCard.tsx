/** Habillage des pages publiques d'authentification (mot de passe oublié, réinitialisation). */
export default function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '20px 16px', borderBottom: '1px solid var(--color-divider)' }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--color-text)' }}>
          <span aria-hidden style={{ width: 22, height: 22, background: 'var(--color-accent)', display: 'inline-block' }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20 }}>ServiceDesk360</span>
        </a>
      </header>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '56px 16px' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 440,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-divider)',
            boxShadow: 'var(--shadow-md)',
            padding: '28px 28px 32px',
          }}
        >
          <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>{title}</h1>
          {subtitle ? (
            <p className="text-muted" style={{ fontSize: 13, margin: '0 0 22px' }}>
              {subtitle}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </main>
  );
}
