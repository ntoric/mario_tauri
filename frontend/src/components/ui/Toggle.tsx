import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  id?: string;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, disabled, size = 'md', id }) => {
  return (
    <label
      className={`toggle-switch ${size === 'sm' ? 'toggle-sm' : ''} ${disabled ? 'toggle-disabled' : ''}`}
      onClick={e => e.stopPropagation()}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="toggle-slider" />
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
};

export default Toggle;
