// @vitest-environment happy-dom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
vi.mock('@tanstack/react-start', () => { const read = vi.fn(); return { useServerFn: () => read }; });
vi.mock('@/lib/owner-session', () => ({ useOwnerSession: () => ({ accessToken: null }) }));
vi.mock('@/lib/office-files.functions', () => ({ prepareOfficeUpload: {}, finishOfficeUpload: {}, listOfficeFiles: {}, openOfficeFile: {}, officeUploadConnection: {}, saveOfficeLink: {}, deleteOfficeFile: {} }));
import { OfficeFiles } from './OfficeFiles';
afterEach(cleanup);
it.each([false, true])('upload appearance opts in explicitly: %s', (brainAppearance) => {
  render(<OfficeFiles room="brain" compact brainAppearance={brainAppearance} />);
  fireEvent.click(screen.getByRole('button', { name: /Add files or photos/ }));
  const panel = screen.getByRole('dialog');
  expect(panel.classList.contains('brain-upload-panel')).toBe(brainAppearance);
  expect(screen.getByLabelText('File in room')).toBeTruthy();
  expect(screen.getByLabelText('Folder')).toBeTruthy();
  expect(screen.getByLabelText('Choose files, photos or videos').getAttribute('multiple')).not.toBeNull();
});
