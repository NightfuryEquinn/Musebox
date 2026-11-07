import { useEffect, useId, useState } from 'react';

type Props = { label: string; value: string; disabled: boolean; onChange: (value: string) => void };

export function ColorControl({ label, value, disabled, onChange }: Props) {
  const [draft, setDraft] = useState(value);
  const id = useId();
  useEffect(() => { setDraft(value); }, [value]);
  const valid = /^#?[\da-f]{6}$/i.test(draft);
  function edit(text: string) {
    setDraft(text);
    if (/^#?[\da-f]{6}$/i.test(text)) onChange(`#${text.replace(/^#/, '').toLowerCase()}`);
  }
  return <div className="custom-color">
    <label htmlFor={`${id}-picker`}>{label}</label>
    <div className="color-inputs">
      <input id={`${id}-picker`} type="color" value={value} disabled={disabled} onChange={e => { setDraft(e.target.value); onChange(e.target.value); }}/>
      <input className="hex-input" aria-label={`${label} hex code`} aria-invalid={!valid} aria-describedby={!valid ? `${id}-hint` : undefined} type="text" value={draft} maxLength={7} spellCheck={false} autoComplete="off" disabled={disabled} onChange={e => edit(e.target.value)} onBlur={() => setDraft(value)} onKeyDown={e => { if (e.key === 'Escape') setDraft(value); }}/>
    </div>
    {!valid && <small id={`${id}-hint`} className="color-hint">Use six hex digits, e.g. #D4FF00.</small>}
  </div>;
}
