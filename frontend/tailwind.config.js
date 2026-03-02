/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          primary: '#0a0a0f',
          secondary: '#111118',
          surface: '#1a1a25',
          elevated: '#222233',
          border: '#2a2a3a',
        },
        accent: {
          cyan: '#00d4ff',
          saffron: '#ff9933',
          green: '#00cc88',
          red: '#ff4444',
        },
        text: {
          primary: '#ffffff',
          secondary: '#8888aa',
          muted: '#555566',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Devanagari', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fade-in-up 0.6s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
