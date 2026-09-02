/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        iceberg: {
          catalog: '#F59E0B',      // Amber / Gold
          metadata: '#6366F1',     // Indigo / Royal Purple
          manifestList: '#0284C7', // Sky Blue
          manifest: '#0D9488',     // Teal / Emerald
          data: '#16A34A',         // Forest Green
          delete: '#DC2626',       // Crimson Red
          dark: '#0B0F17',
          surface: '#111827',
          card: '#1A2234',
          border: '#243048',
          accent: '#38BDF8'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(56, 189, 248, 0.2), 0 0 10px rgba(56, 189, 248, 0.1)' },
          '100%': { boxShadow: '0 0 20px rgba(56, 189, 248, 0.6), 0 0 30px rgba(56, 189, 248, 0.3)' }
        }
      }
    },
  },
  plugins: [],
}
