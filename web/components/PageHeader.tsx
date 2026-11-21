export default function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-8 border-b-2 border-rule-strong pt-10 pb-4">
      <h1 className="font-serif text-4xl font-bold">{title}</h1>
      <p className="mt-1 text-muted">{subtitle}</p>
    </header>
  );
}

export function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid animate-pulse gap-8 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-48 rounded bg-chip" />
      ))}
    </div>
  );
}
