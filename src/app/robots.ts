import type { MetadataRoute } from 'next';

// robots.txt generado por Next. §8 descarta SEO activo y analytics, pero
// tampoco hay motivo para ocultar la landing: permitimos el rastreo de
// `/` y `/privacidad`, y bloqueamos todo lo que colgase de un token de
// pago o sesión para no exponer URLs con secretos a buscadores.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacidad'],
        disallow: ['/api/', '/pay/', '/session/'],
      },
    ],
  };
}
