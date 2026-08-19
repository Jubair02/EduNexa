import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  label: string;
  /** When false the children render bare — used for the expanded sidebar. */
  enabled?: boolean;
  children: ReactNode;
}

/**
 * Tooltip for the collapsed sidebar. It renders through a portal because the
 * sidebar is a scroll container — an absolutely positioned tip would be
 * clipped at its edge. Opens on hover *and* keyboard focus.
 */
export const Tooltip = ({ label, enabled = true, children }: TooltipProps) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const hide = useCallback(() => setPosition(null), []);

  const show = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.top + rect.height / 2, left: rect.right + 8 });
  }, []);

  // A tip anchored to viewport coordinates goes stale the moment anything
  // moves, so close it instead of trying to follow.
  useEffect(() => {
    if (!position) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [position, hide]);

  if (!enabled) return <>{children}</>;

  return (
    <div
      ref={anchorRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {position &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: position.top, left: position.left }}
            className="pointer-events-none fixed z-[60] -translate-y-1/2 rounded-lg bg-aubergine px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg"
          >
            {label}
          </div>,
          document.body
        )}
    </div>
  );
};
