/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Évite la génération automatique d'AGENTS.md / CLAUDE.md au lancement du serveur de dev.
  agentRules: false,
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
};

export default nextConfig;
