import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-600.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-900.css';
import './index.css';
import App from './app/App';

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
