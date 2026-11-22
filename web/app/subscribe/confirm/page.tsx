import { Suspense } from "react";
import TokenActionPage from "@/components/TokenActionPage";

export const metadata = { title: "Confirm subscription · The Data Science & AI Newspaper", robots: { index: false } };

type SP = PageProps<"/subscribe/confirm">["searchParams"];

export default function ConfirmPage({ searchParams }: PageProps<"/subscribe/confirm">) {
  return (
    <Suspense fallback={<div className="pt-24" aria-busy="true" />}>
      <Confirm searchParams={searchParams} />
    </Suspense>
  );
}

async function Confirm({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return (
    <TokenActionPage
      title="Confirm your subscription"
      intro="Press the button to start receiving the DS & AI Daily morning briefing."
      button="Confirm subscription"
      action="/api/subscribe/confirm"
      token={one(sp.token)}
      status={one(sp.status)}
      done={{
        confirmed: { heading: "You're subscribed", body: "The next briefing arrives after tomorrow morning's edition. Every email has an unsubscribe link." },
        invalid: { heading: "This link has expired", body: "Confirmation links work once and expire after 7 days. Sign up again from the bottom of any page." },
      }}
    />
  );
}
