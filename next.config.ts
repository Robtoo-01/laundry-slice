import type { NextConfig } from 'next';

// The site is exported as plain files (the `out` folder) so GitHub Pages can serve it.
// On GitHub Pages a project site lives under /<repository-name>, which the deploy workflow
// passes in as NEXT_PUBLIC_BASE_PATH. Leave it empty for local work or a custom domain.
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
};

export default config;
