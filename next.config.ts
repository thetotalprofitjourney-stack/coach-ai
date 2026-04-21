import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfkit carga sus fuentes AFM desde el propio paquete con `require`
  // relativo. Bundlear el módulo con Webpack rompe esa resolución, así
  // que lo dejamos como external en las Server Components / API routes.
  serverExternalPackages: ['pdfkit'],
};

export default nextConfig;
