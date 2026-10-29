/** @type {import('tailwindcss').Config} */
export default {
  content: { relative: true, files: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'] },
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f2fa',
          100: '#ebe5f5',
          200: '#d7cbea',
          300: '#bcaad9',
          400: '#9b82c2',
          500: '#8065ae',
          600: '#67518e',
          700: '#53416f',
          800: '#44365a',
          900: '#332b43',
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
