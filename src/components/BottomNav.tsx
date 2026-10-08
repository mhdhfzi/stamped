import { FileText, Home, User } from 'lucide-react';
import type { Tab } from '../types';
import { cn } from '../lib/utils';

const ITEMS: { id: Tab; label: string; Icon: typeof Home }[] = [
  { id: 'feed', label: 'Feed', Icon: Home },
  { id: 'trips', label: 'Trips', Icon: FileText },
  { id: 'account', label: 'Account', Icon: User },
];

export function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
      <div className="liquid-glass rounded-full flex gap-6 px-6 py-2">
        {ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active === id ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-0.5 transition-colors', active === id ? 'text-white' : 'text-white/50')}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
