/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg-color)',
        bgSecondary: 'var(--bg-secondary)',
        card: 'var(--card-bg)',
        border: 'var(--border-color)',
        text: 'var(--text-color)',
        textMuted: 'var(--text-muted)',
        primary: 'var(--primary)',
        primaryHover: 'var(--primary-hover)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)'
      },
    },
  },
  plugins: [],
}
