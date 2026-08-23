import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ServiceNow360 — Portail anomalies et suivi de projet',
  description:
    'Portail client de gestion des anomalies (incidents, évolutions, nouvelles demandes) et de suivi de projet (planning et diagramme de Gantt).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
