module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        display: ['"Fraunces"', '"Plus Jakarta Sans"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        clinical:
          '0 20px 40px -15px rgba(15, 118, 110, 0.08), 0 4px 16px -4px rgba(15, 23, 42, 0.04)',
        'clinical-lg':
          '0 24px 48px -12px rgba(4, 47, 46, 0.14), 0 8px 20px -6px rgba(15, 23, 42, 0.06)',
      },
      keyframes: {
        ekgPulse: {
          '0%': { strokeDashoffset: '240', opacity: '0.35' },
          '50%': { opacity: '1' },
          '100%': { strokeDashoffset: '0', opacity: '0.35' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        'ekg-pulse': 'ekgPulse 4.5s ease-in-out infinite',
        'float-slow': 'floatSlow 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
