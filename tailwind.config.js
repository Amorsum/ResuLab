/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
          '"Microsoft YaHei"', '"微软雅黑"', '"PingFang SC"',
          '"Hiragino Sans GB"', '"Helvetica Neue"', 'Arial', 'sans-serif',
        ],
      },
      width: {
        a4: '794px',
      },
      height: {
        a4: '1123px',
      },
    },
  },
  plugins: [],
};
