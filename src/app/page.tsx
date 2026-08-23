import { redirect } from 'next/navigation';
import LandingPage from '@/components/landing/LandingPage';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect('/app');
  return <LandingPage />;
}
