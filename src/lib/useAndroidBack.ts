import { useEffect, useRef } from 'react';

export function useAndroidBack(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState(null, '', window.location.href);

    const handlePop = (e: PopStateEvent) => {
      e.stopPropagation();
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePop, true);
    return () => window.removeEventListener('popstate', handlePop, true);
  }, [isOpen]);
}
