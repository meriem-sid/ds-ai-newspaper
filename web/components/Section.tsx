export default function Section({
  id,
  title,
  count,
  children,
  aside,
}: {
  id: string;
  title: string;
  count?: number;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-rule-strong pb-1.5">
        <h2 id={`${id}-heading`} className="font-serif text-2xl font-bold">
          {title}
          {count !== undefined && <span className="kicker ml-2 align-middle text-muted">{count}</span>}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="font-sans text-sm text-muted">{children}</p>;
}
