import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, createLightTheme } from '@fluentui/react-components';
import type { BrandVariants } from '@fluentui/react-components';
import { App } from './App.tsx';
import './styles.css';

// Rampa de marca alrededor del navy #0F2B46.
const brand: BrandVariants = {
  10: '#02060A', 20: '#061423', 30: '#0A1D31', 40: '#0C2238', 50: '#0D263F', 60: '#0E2943', 70: '#143657',
  80: '#0F2B46', 90: '#234266', 100: '#3A5A80', 110: '#4A719C', 120: '#6C8CB1', 130: '#7F9EBF', 140: '#B4C8DC',
  150: '#DCE6F0', 160: '#EEF4FA',
};
const theme = { ...createLightTheme(brand), fontFamilyBase: "'Segoe UI', Inter, system-ui, sans-serif" };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={theme} style={{ background: 'transparent' }}>
      <App />
    </FluentProvider>
  </StrictMode>,
);
