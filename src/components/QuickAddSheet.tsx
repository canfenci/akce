import { Icon, type IconName } from './Icon';
import { useDialogSheet } from '../hooks/useDialogSheet';
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight';

export type QuickAddAction = 'expense' | 'income' | 'investment' | 'asset';

interface QuickAddItem {
  action: QuickAddAction;
  icon: IconName;
  title: string;
  subtitle: string;
}

const items: QuickAddItem[] = [
  { action: 'expense', icon: 'receipt', title: 'Harcama ekle', subtitle: 'Günlük harcamanı kaydet' },
  { action: 'income', icon: 'wallet', title: 'Gelir ekle', subtitle: 'Yeni gelir ekle' },
  { action: 'investment', icon: 'chart', title: 'Yatırım ekle', subtitle: 'Aylık yatırım gerçekleşmesini kaydet' },
  { action: 'asset', icon: 'target', title: 'Varlık ekle', subtitle: 'Portföyüne yeni varlık ekle' },
];

export function QuickAddSheet({ open, onClose, onSelect }: {
  open: boolean;
  onClose: () => void;
  onSelect: (action: QuickAddAction) => void;
}) {
  const sheetRef = useDialogSheet(open, onClose);
  const viewportHeight = useVisualViewportHeight();
  const sheetMaxHeight = viewportHeight > 0 ? `${Math.floor(viewportHeight * 0.5)}px` : '50vh';

  if (!open) return null;

  return <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="sheet quick-add-sheet" role="dialog" aria-modal="true" aria-labelledby="quickadd-title" ref={sheetRef} style={{ maxHeight: sheetMaxHeight }}>
      <div className="sheet__handle" />
      <header className="sheet__header">
        <div><span className="eyebrow">HIZLI EKLE</span><h2 id="quickadd-title">Hızlı Ekle</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Kapat"><Icon name="close" /></button>
      </header>
      <div className="quick-add-list">
        {items.map(item => <button key={item.action} className="quick-add-item" onClick={() => onSelect(item.action)} aria-label={item.title}>
          <span className="quick-add-item__icon"><Icon name={item.icon} /></span>
          <div className="quick-add-item__text"><b>{item.title}</b><small>{item.subtitle}</small></div>
        </button>)}
      </div>
    </section>
  </div>;
}
