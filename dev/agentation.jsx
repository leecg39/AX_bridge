import React from 'react';
import { createRoot } from 'react-dom/client';
import { Agentation } from 'agentation';

// A separate React island leaves the existing vanilla application untouched.
// No endpoint: annotations stay in this browser and are shared by copying.
if (!document.querySelector('#ax-agentation-root')) {
  const root = document.createElement('div');
  root.id = 'ax-agentation-root';
  document.body.append(root);
  createRoot(root).render(<Agentation appName="AX브릿지" useHashLocation />);
}
