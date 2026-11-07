import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type Option = { value: string; label: string };
type Props = { label: string; value: string; options: Option[]; disabled?: boolean; onChange: (value: string) => void };

export function Dropdown({ label, value, options, disabled = false, onChange }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef({ text: '', time: 0 });
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [expanded]);
  useEffect(() => { setOpen(false); }, [disabled, value]);

  function choose(index: number) {
    if (disabled || !options[index]) return;
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  return <div className="dropdown" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <span className="dropdown-label" id={`${id}-label`}>{label}</span>
    <button ref={trigger} type="button" className="dropdown-trigger" role="combobox"
      aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={expanded}
      aria-controls={expanded ? `${id}-list` : undefined}
      aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
      disabled={disabled} onClick={() => { setActive(selected); search.current.text = ''; setOpen(!open); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { if (expanded) { event.preventDefault(); event.stopPropagation(); } setOpen(false); return; }
        if (event.key === 'Tab') { setOpen(false); return; }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (expanded) choose(active); else { setActive(selected); setOpen(true); }
          return;
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
            : !expanded ? selected : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          setActive(next); setOpen(true); return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const now = performance.now();
          search.current.text = (now - search.current.time < 600 ? search.current.text : '') + event.key.toLowerCase();
          search.current.time = now;
          const match = options.findIndex(option => option.label.toLowerCase().startsWith(search.current.text));
          if (match >= 0) { setActive(match); setOpen(true); }
        }
      }}>
      <span id={`${id}-value`}>{options[selected]?.label}</span><ChevronDown size={14} aria-hidden="true"/>
    </button>
    {expanded && <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="dropdown-menu">
      {options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option"
        aria-selected={option.value === value} className={`dropdown-option${active === index ? ' active' : ''}`}
        onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>
        <span>{option.label}</span>{option.value === value && <Check size={13} aria-hidden="true"/>}
      </div>)}
    </div>}
  </div>;
}
