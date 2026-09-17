/** @type {import('tailwindcss').Config} */
// 设计 token 与根目录 DESIGN.md 对齐（唯一事实源，lint 校验通过）
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f5f7fa',
        surface: '#ffffff',
        'surface-2': '#f9fafb',
        'surface-3': '#eef2f6',
        ink: '#17202a',
        muted: '#5d6b7d',
        soft: '#8a96a6',
        line: '#dce3ea',
        'line-strong': '#c2ccd8',
        primary: { DEFAULT: '#155e75', soft: '#e2eff3', ink: '#0c3b4a', hover: '#104c60' },
        teal: { DEFAULT: '#0f766e', soft: '#dff3f0' },
        green: { DEFAULT: '#156f43', soft: '#e5f6ed' },
        amber: { DEFAULT: '#8f6100', soft: '#fff3cf' },
        red: { DEFAULT: '#ba3030', soft: '#ffe6e6' },
        violet: { DEFAULT: '#6d4fc2', soft: '#efebfb' },
      },
      borderRadius: { base: '8px', sm: '6px' },
      fontSize: {
        meta: '11.5px',
        small: '12.5px',
        body: '14px',
        'section-title': ['15px', { lineHeight: '1.45', fontWeight: '600' }],
        'page-title': ['21px', { lineHeight: '1.3', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
};
