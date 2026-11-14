import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const {syncSources} = await import('../src/lib/ingestion');
  const {prisma} = await import('../src/lib/db');
  try {
    const result = await syncSources();
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
main().catch(error => {console.error(error instanceof Error ? error.message : '同步失败'); process.exitCode = 1;});
