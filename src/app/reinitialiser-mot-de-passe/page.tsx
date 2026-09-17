import type { Metadata } from 'next';
import AuthCard from '@/components/auth/AuthCard';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
import { findValidToken } from '@/lib/passwordReset';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Nouveau mot de passe — ServiceDesk360',
  // Le jeton figure dans l'URL : ne pas le transmettre aux sites tiers.
  referrer: 'no-referrer',
  robots: { index: false },
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const row = await findValidToken(token);

  if (!row) {
    return (
      <AuthCard title="Lien expiré">
        <div className="alert alert-error" role="alert">
          Ce lien de réinitialisation est invalide, a déjà servi ou a expiré (validité : 60 minutes).
        </div>
        <a href="/mot-de-passe-oublie" className="btn btn-primary btn-block mt-16" style={{ textDecoration: 'none', minHeight: 44 }}>
          Demander un nouveau lien
        </a>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choisir un nouveau mot de passe">
      <ResetPasswordForm token={token} email={row.user.email} />
    </AuthCard>
  );
}
