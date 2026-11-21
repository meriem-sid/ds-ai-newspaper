import { notFound } from "next/navigation";
import { Suspense } from "react";
import EditionView, { EditionSkeleton } from "@/components/EditionView";

export default function EditionPage({ params }: PageProps<"/edition/[date]">) {
  return (
    <Suspense fallback={<EditionSkeleton />}>
      <EditionForParams params={params} />
    </Suspense>
  );
}

async function EditionForParams({ params }: { params: PageProps<"/edition/[date]">["params"] }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) notFound();
  return <EditionView date={date} />;
}
