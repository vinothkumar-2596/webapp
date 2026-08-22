import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/outfit/latin-700.css';
import '@fontsource/outfit/latin-800.css';
import '@fontsource/outfit/latin-900.css';
import './index.css';
import App from './app/App';
import { fitInstalledWindow } from './lib/installWindow';

// When launched as an installed app, open in a small, single-purpose window.
// No-op in a normal browser tab.
fitInstalledWindow();

// No polyfill import here on purpose: pdf.js is loaded from `pdfjs-dist/legacy/*`,
// which installs core-js polyfills into both the main thread and the worker.
// See CLAUDE.md.

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
