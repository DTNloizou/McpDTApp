// Polyfill missing Performance API methods in Dynatrace sandbox
if (typeof performance !== 'undefined') {
  if (typeof performance.clearMarks !== 'function') {
    performance.clearMarks = () => {};
  }
  if (typeof performance.clearMeasures !== 'function') {
    performance.clearMeasures = () => {};
  }
  if (typeof performance.mark !== 'function') {
    performance.mark = (() => {}) as any;
  }
  if (typeof performance.measure !== 'function') {
    performance.measure = (() => {}) as any;
  }
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoot } from '@dynatrace/strato-components/core';
import { App } from './app/App';
import './app/styles.css';

// Get base path from <base href> tag set by dt-app
const base = document.querySelector('base')?.getAttribute('href') || '/';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <AppRoot>
    <BrowserRouter basename={base}>
      <App />
    </BrowserRouter>
  </AppRoot>
);
