const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

/**
 * Recursively collect every transitive dependency (incl. peer deps) of a
 * package so we can force-include them in the Vercel serverless function via
 * outputFileTracingIncludes.  createRequire() in render-pdf.ts bypasses the
 * bundler, so the file tracer never sees these imports on its own.
 */
function getTransitiveDeps(packageName, visited = new Set()) {
  const pkgDir = join('node_modules', ...packageName.split('/'));
  const pkgJson = join(pkgDir, 'package.json');
  if (visited.has(packageName) || !existsSync(pkgJson)) return visited;
  visited.add(packageName);
  try {
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
    for (const dep of [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ]) {
      getTransitiveDeps(dep, visited);
    }
  } catch { /* skip unresolvable packages */ }
  return visited;
}

const reactPdfDeps = getTransitiveDeps('@react-pdf/renderer');
const reactPdfIncludePatterns = [...reactPdfDeps].map(
  (dep) => `./node_modules/${dep}/**/*`,
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    optimizePackageImports: ['lucide-react'],
  },
  outputFileTracingIncludes: {
    '/api/pdf/generate': reactPdfIncludePatterns,
  },
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
