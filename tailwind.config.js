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
        accent: {
          DEFAULT: '#0052FF',
          secondary: '#4D7CFF',
          foreground: '#FFFFFF',
        },
        iceberg: {
          catalog: '#F59E0B',      // Amber / Gold
          metadata: '#0052FF',     // Electric Blue signature
          manifestList: '#0284C7', // Sky Blue
          manifest: '#0D9488',     // Teal / Emerald
          data: '#16A34A',         // Forest Green
          delete: '#DC2626',       // Crimson Red
          dark: '#0F172A',         // Slate 900
          surface: '#1E293B',      // Slate 800
          card: '#1E293B',
          border: '#334155',
          accent: '#0052FF'
        }
      },
      fontFamily: {
        calistoga: ['Calistoga', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      boxShadow: {
        'accent': '0 4px 14px rgba(0, 82, 255, 0.25)',
        'accent-lg': '0 8px 24px rgba(0, 82, 255, 0.35)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 5s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 82, 255, 0.2), 0 0 10px rgba(0, 82, 255, 0.1)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 82, 255, 0.6), 0 0 30px rgba(77, 124, 255, 0.3)' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' }
        }
      }
    },
  },
  plugins: [],
}
