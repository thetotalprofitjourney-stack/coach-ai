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
    },
  },
  plugins: [],
};

export default config;
