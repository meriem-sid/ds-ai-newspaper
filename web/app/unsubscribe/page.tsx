import { Suspense } from "react";
import TokenActionPage from "@/components/TokenActionPage";

export const metadata = { title: "Unsubscribe · The Data Science & AI Newspaper", robots: { index: false } };

type SP = PageProps<"/unsubscribe">["searchParams"];

export default function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  return (
    <Suspense fallback={<div className="pt-24" aria-busy="true" />}>
      <Unsubscribe searchParams={searchParams} />
    </Suspense>
  );
}

async function Unsubscribe({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const token = one(sp.token);
  return (
    <TokenActionPage
      title="Unsubscribe from the briefing?"
      intro="You'll stop receiving the DS & AI Daily email. The website stays open to you."
      button="Unsubscribe"
      action={`/api/unsubscribe${token ? `?token=${encodeURIComponent(token)}` : ""}`}
      token={token}
      status={one(sp.status)}
      done={{
        unsubscribed: { heading: "You're unsubscribed", body: "You won't get any more briefings. You can sign up again anytime from the bottom of any page." },
        invalid: { heading: "We couldn't find that subscription", body: "The link may be incomplete. If emails keep arriving, use the unsubscribe link in the latest one." },
      }}
    />
  );
}
