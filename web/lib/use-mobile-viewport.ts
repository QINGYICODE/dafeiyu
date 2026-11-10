'use client';
import { useEffect } from 'react';

export function useMobileViewport(page: string) {
  useEffect(() => {
    document.documentElement.dataset.appPage = page;
    return () => { delete document.documentElement.dataset.appPage; };
  }, [page]);

  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let baseline = window.innerHeight;
    let width = window.innerWidth;
    let frame = 0;
    const update = () => {
      if (viewport && viewport.scale !== 1) return;
      const height = viewport?.height || window.innerHeight;
      if (width !== window.innerWidth) {
        width = window.innerWidth;
        baseline = window.innerHeight;
      }
      baseline = Math.max(baseline, window.innerHeight, height);
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && focused.matches('textarea, input:not([type=checkbox]):not([type=radio]), [contenteditable=true]');
      root.style.setProperty('--app-height', `${height}px`);
      root.dataset.keyboard = width <= 720 && editing && baseline - height > 120 ? 'open' : 'closed';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('resize', schedule);
    viewport?.addEventListener('resize', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      root.style.removeProperty('--app-height');
      delete root.dataset.keyboard;
    };
  }, []);
}
