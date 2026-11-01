import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'normal' | 'close';
  children: ReactNode;
}

export default function XPButton({ variant = 'normal', children, ...rest }: Props) {
  return (
    <button type="button" className={`xp-btn${variant === 'close' ? ' close' : ''}`} {...rest}>
      {children}
    </button>
  );
}
