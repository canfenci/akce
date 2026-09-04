import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export interface CardAction {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onAction: () => void;
}

interface CardActionMenuProps {
  actions: CardAction[];
  ariaLabel: string;
}

export function CardActionMenu({ actions, ariaLabel }: CardActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab' && menuRef.current) {
        const focusable = menuRef.current.querySelectorAll<HTMLElement>('button');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && triggerRef.current && !triggerRef.current.contains(target)) {
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    const timer = setTimeout(() => menuRef.current?.querySelector<HTMLElement>('button')?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
      clearTimeout(timer);
    };
  }, [open, close]);

  return (
    <div className="card-action-menu">
      <button
        ref={triggerRef}
        className="card-action-menu__trigger"
        onClick={() => setOpen(o => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Icon name="more" />
      </button>
      {open && (
        <>
          <div className="card-action-menu__backdrop" onClick={close} />
          <div ref={menuRef} className="card-action-menu__panel" role="menu">
            {actions.map((action, i) => (
              <button
                key={i}
                className={`card-action-menu__item${action.destructive ? ' card-action-menu__item--danger' : ''}`}
                role="menuitem"
                onClick={() => { action.onAction(); close(); }}
              >
                {action.icon && <Icon name={action.icon} />}
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
