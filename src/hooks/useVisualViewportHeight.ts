import { useEffect, useState } from 'react';

function getViewportHeight(): number {
  if (typeof window === 'undefined') return 0;
  return window.visualViewport?.height ?? window.innerHeight;
}

export function useVisualViewportHeight(): number {
  const [height, setHeight] = useState(getViewportHeight);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => setHeight(vv.height);
    vv.addEventListener('resize', handleResize);
    handleResize();

    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  return height;
}
