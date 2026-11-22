"use client";

import { useState } from "react";

/** Footer sign-up: email → confirmation email (double opt-in). */
export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: hidden from people, bots fill it in
  const [state, setState] = useState<{ kind: "idle" | "sending" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      const data = await res.json().catch(() => ({}));
      setState(res.ok ? { kind: "ok", message: data.message } : { kind: "error", message: data.error ?? "Something went wrong. Try again." });
      if (res.ok) setEmail("");
    } catch {
      setState({ kind: "error", message: "Network error. Try again." });
    }
  };

  return (
    <section aria-labelledby="subscribe-heading" className="mx-auto max-w-xl text-center">
      <h2 id="subscribe-heading" className="font-headline text-[1.3rem] text-ink">
        Get the morning briefing by email
      </h2>
      <p className="mt-1.5 text-[0.98rem] leading-relaxed text-text">Top stories, deadlines closing soon and today&apos;s puzzles. One short email a day; unsubscribe anytime.</p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap justify-center gap-2 font-sans">
        <label htmlFor="subscribe-email" className="sr-only">
          Email address
        </label>
        <input
          id="subscribe-email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 min-w-0 flex-1 basis-56 rounded-md border border-rule bg-surface px-4 text-[0.95rem] text-ink placeholder:text-muted"
        />
        {/* Honeypot: off-screen and skipped by keyboard and screen readers. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
          </label>
        </div>
        <button
          type="submit"
          disabled={state.kind === "sending"}
          className="h-11 rounded-md bg-ink px-5 text-[0.9rem] font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {state.kind === "sending" ? "Sending…" : "Subscribe"}
        </button>
      </form>
      {state.message && (
        <p role="status" className={`mt-3 font-sans text-[0.875rem] ${state.kind === "error" ? "text-accent" : "text-text"}`}>
          {state.message}
        </p>
      )}
    </section>
  );
}
