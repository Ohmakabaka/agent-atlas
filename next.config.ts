import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, experimental: { cpus: 2 }, serverExternalPackages: ['@prisma/client'] };
export default config;
