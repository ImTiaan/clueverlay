import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ControlButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: 'default' | 'danger';
  }
>;

export function ControlButton({
  children,
  className = '',
  tone = 'default',
  ...props
}: ControlButtonProps) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/20'
      : 'border-amber-400/30 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20';

  return (
    <button
      className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${toneClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
