import { useEffect } from 'react';
import { mountWidget } from '@vansham/unravel-sdk';

export function UnravelReporter() {
  useEffect(() => {
    const widget = mountWidget({
      projectId: '0e41d427-d3d5-4794-b81e-afbc87fb542f',
      applicationOrigin: "https://unravel-eight-beta.vercel.app",
      limits: { maxBytes: 3_000_000 },
    });
    return () => widget.destroy();
  }, []);
  return null;
}