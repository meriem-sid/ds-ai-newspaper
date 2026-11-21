export default function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-12 pt-12 sm:pt-16">
      <h1 className="font-serif text-[2.4rem] font-semibold tracking-[-0.02em] text-ink sm:text-[3rem]">{title}</h1>
      <p className="mt-2 max-w-[65ch] font-sans text-[0.95rem] leading-relaxed text-muted">{subtitle}</p>
    </header>
  );
}

export function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid animate-pulse gap-10 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-56 rounded-lg bg-chip/70" />
      ))}
    </div>
  );
}
