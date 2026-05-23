import { useEffect, useRef } from 'react';

export function useAndroidBack(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    window.history.pushState({ modal: true }, '', window.location.href);

    const handlePop = (e: PopStateEvent) => {
      // Prevent TanStack Router from handling this popstate
      e.stopImmediatePropagation();
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePop, true);
    return () => {
      window.removeEventListener('popstate', handlePop, true);
    };
  }, [isOpen]);
}
