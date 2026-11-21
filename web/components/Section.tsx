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
    <section aria-labelledby={`${id}-heading`} className="mt-16 sm:mt-20">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3 border-t-2 border-rule-strong pt-3">
        <h2 id={`${id}-heading`} className="font-serif text-[1.6rem] font-semibold tracking-[-0.01em] text-ink sm:text-[1.85rem]">
          {title}
          {count !== undefined && <span className="ml-3 align-middle font-sans text-[0.8125rem] font-medium text-muted">{count}</span>}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Newspaper columns: stories separated by hairline rules instead of boxes. */
export function StoryGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return (
    <div
      className={`grid gap-x-10 gap-y-12 md:grid-cols-2 ${cols === 3 ? "xl:grid-cols-3" : ""} [&>*]:border-t [&>*]:border-rule [&>*]:pt-6`}
    >
      {children}
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="font-sans text-[0.9rem] text-muted">{children}</p>;
}
