import type { PropsWithChildren } from 'react';

type AppShellProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  description: string;
}>;

export function AppShell({ eyebrow, title, description, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#09090b] text-stone-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="mb-10 border-b border-stone-800 pb-6">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-400/80">{eyebrow}</p>
          <div className="mt-4 max-w-3xl">
            <h1 className="font-serif text-4xl tracking-tight text-stone-50 md:text-5xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300 md:text-base">
              {description}
            </p>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
