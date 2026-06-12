import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Lora (cargada vía next/font) se inyecta en <html> como
        // --font-lora. Se usa para el h1 del hero en la landing.
        serif: ['var(--font-lora)', 'Georgia', 'serif'],
      },
      animation: {
        'slide-in': 'slide-in 0.22s ease-out',
      },
      keyframes: {
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(14px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
