/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        forge: {
          bg: '#090b10',
          panel: '#11151f',
          surface: '#181e2c',
          border: '#252d40',
          accent: '#6366f1',
          accentHover: '#818cf8',
          highlight: '#22d3ee',
          text: '#f1f5f9',
          muted: '#94a3b8',
          danger: '#ef4444',
          success: '#10b981',
          warning: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
