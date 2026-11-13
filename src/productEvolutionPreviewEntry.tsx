import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ProductEvolutionPreview from './components/ProductEvolutionPreview.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProductEvolutionPreview />
  </StrictMode>
);
