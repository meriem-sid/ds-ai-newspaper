import { Suspense } from "react";
import EditionView, { EditionSkeleton } from "@/components/EditionView";

/** Today's (latest) edition. */
export default function Home() {
  return (
    <Suspense fallback={<EditionSkeleton />}>
      <EditionView />
    </Suspense>
  );
}
