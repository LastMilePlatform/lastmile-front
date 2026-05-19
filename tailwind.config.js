/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effcf5',
          100: '#d9f7e6',
          500: '#22a45d',
          700: '#177240',
        },
      },
    },
  },
  plugins: [],
};