import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Build autocontenido para el runtime Docker del Paso 13: copia sólo lo
  // imprescindible (`.next/standalone/server.js` + deps de runtime) y
  // deja fuera devDependencies, permitiendo una imagen final ~10× más
  // pequeña que arrastrar `node_modules` entero.
  output: 'standalone',
  // pdfkit carga sus fuentes AFM desde el propio paquete con `require`
  // relativo. Bundlear el módulo con Webpack rompe esa resolución, así
  // que lo dejamos como external en las Server Components / API routes.
  serverExternalPackages: ['pdfkit'],
};

export default nextConfig;
