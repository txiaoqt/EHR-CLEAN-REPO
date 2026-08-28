// src/hooks/useStaffDeviceCheck.js
import { useState, useEffect } from 'react';

export const STAFF_PORTAL_MIN_WIDTH = 1024;

export const isStaffPortalSupportedViewport = () => {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= STAFF_PORTAL_MIN_WIDTH;
};

export const useStaffDeviceCheck = () => {
  const [isSupported, setIsSupported] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= STAFF_PORTAL_MIN_WIDTH;
  });

  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  }));

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewport({ width: w, height: h });
      setIsSupported(w >= STAFF_PORTAL_MIN_WIDTH);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return { isSupported, viewport };
};
