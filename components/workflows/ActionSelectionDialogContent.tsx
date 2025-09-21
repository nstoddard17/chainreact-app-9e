import React from 'react';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Zap } from 'lucide-react';

interface ActionSelectionDialogContentProps {
  children: React.ReactNode;
}

export default function ActionSelectionDialogContent({ children }: ActionSelectionDialogContentProps) {
  // Force re-render with timestamp
  const [timestamp] = React.useState(Date.now());

  React.useEffect(() => {
    console.log('🔍 ActionSelectionDialogContent mounted at', new Date().toISOString());

    // Track the source of any element with the debug text
    const findDebugBanner = () => {
      const allElements = document.querySelectorAll('*');
      allElements.forEach((el) => {
        if (el.textContent?.includes('THIS IS THE ACTION DIALOG')) {
          console.error('🚨 FOUND DEBUG BANNER!', {
            element: el,
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            parent: el.parentElement,
            stack: new Error().stack,
            innerHTML: el.innerHTML?.substring(0, 200)
          });

          // Try to trace where it was created
          if ((el as any)._reactInternalFiber) {
            console.error('React Fiber:', (el as any)._reactInternalFiber);
          }
          if ((el as any).__reactInternalInstance) {
            console.error('React Instance:', (el as any).__reactInternalInstance);
          }

          // Remove it completely
          el.remove();
        }
      });
    };

    // Aggressively remove any red banners on mount and continuously
    const removeRedBanners = () => {
      const elements = document.querySelectorAll('*');
      elements.forEach((el) => {
        const computed = window.getComputedStyle(el);
        const hasRedBg = computed.backgroundColor.includes('239') ||
                         computed.backgroundColor.includes('68') ||
                         computed.backgroundColor.includes('red');
        const hasDebugText = el.textContent?.includes('THIS IS THE ACTION DIALOG') ||
                             el.textContent?.includes('IF YOU SEE THIS');

        if ((hasRedBg || hasDebugText) && el.textContent?.includes('THIS IS THE ACTION DIALOG')) {
          console.log('🔥 FORCE REMOVING DEBUG BANNER');
          el.style.display = 'none !important';
          el.style.visibility = 'hidden !important';
          el.style.opacity = '0 !important';
          el.remove();
        }
      });
    };

    // Run immediately
    findDebugBanner();
    removeRedBanners();

    // Run continuously for 10 seconds
    const interval = setInterval(() => {
      findDebugBanner();
      removeRedBanners();
    }, 10);
    const timeout = setTimeout(() => clearInterval(interval), 10000);

    // Also intercept any DOM mutations
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && (node as Element).textContent?.includes('THIS IS THE ACTION DIALOG')) {
              console.error('🚨 DEBUG BANNER ADDED VIA MUTATION!', {
                node,
                parent: mutation.target,
                previousSibling: mutation.previousSibling,
                nextSibling: mutation.nextSibling
              });
              (node as Element).remove();
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      {/* Clean dialog header without any debug info */}
      <div data-timestamp={timestamp} className="action-dialog-content">
        {children}
      </div>
    </>
  );
}