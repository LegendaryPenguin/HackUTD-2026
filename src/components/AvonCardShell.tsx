import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Flat Avon Night Tide panel — same solid navy chrome as triage v4.
 * No ReflectiveCard gloss; sized to fit the viewport.
 */
export function AvonCardShell({
  onClose,
  scrimClassName = 'triage-scrim',
  topLeft,
  topCenter,
  children,
  wide,
}: {
  onClose: () => void;
  scrimClassName?: string;
  topLeft?: ReactNode;
  topCenter?: ReactNode;
  children: ReactNode;
  /** Slightly wider decide/act panels */
  wide?: boolean;
}) {
  return (
    <div className={scrimClassName} onClick={onClose} role="presentation">
      <motion.div
        className={`triage-card avon-panel${wide ? ' avon-panel--wide' : ''}`}
        role="dialog"
        aria-modal
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.22, ease: [0.2, 0.85, 0.25, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="avon-panel__chrome">
          <div className="avon-panel__top">
            <div className="avon-panel__top-slot">{topLeft ?? <span />}</div>
            <div className="avon-panel__top-center">{topCenter ?? <span />}</div>
            <button type="button" className="avon-panel__close" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="avon-panel__body">
            {children}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
