import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrainHub } from '../../src/components/office/BrainHub';
import '../../src/styles.css';
import type { BrainIndex } from '../../src/lib/brain-index';
const fixture: BrainIndex = {
  checkedAt: '2026-10-10T00:00:00Z', sources: [], orphanLabels: 0,
  items: Array.from({length: 25}, (_, n) => ({
    key: `file:fixture-${n}`, title: `Fixture document ${n + 1}`, kind: 'file', shelf: 'library',
    category: 'downloads', defaultCategory: 'downloads', room: 'brain', folder: null,
    at: '2026-10-10T00:00:00Z', provenance: 'Visual fixture only', version: null,
    access: 'metadata only', manual: false, route: null,
  })),
};
createRoot(document.getElementById('root')!).render(<main style={{maxWidth: 1100, margin: '24px auto'}}><BrainHub fixture={fixture}/></main>);
