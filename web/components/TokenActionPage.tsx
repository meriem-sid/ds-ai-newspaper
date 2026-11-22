import Link from "next/link";

/**
 * Shared layout for /subscribe/confirm and /unsubscribe. The link in the email only
 * opens this page; the change happens when the person presses the button (a POST),
 * so mail-security scanners that pre-open links don't confirm or unsubscribe anyone.
 */
export default function TokenActionPage(props: {
  title: string;
  token: string | null;
  status: string | null;
  action: string;
  button: string;
  intro: string;
  done: Record<string, { heading: string; body: string }>;
}) {
  const result = props.status ? props.done[props.status] ?? props.done.invalid : null;
  return (
    <div className="mx-auto max-w-xl pt-16 text-center sm:pt-24">
      {result ? (
        <>
          <h1 className="font-headline text-[2rem] text-ink">{result.heading}</h1>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-text">{result.body}</p>
        </>
      ) : props.token ? (
        <>
          <h1 className="font-headline text-[2rem] text-ink">{props.title}</h1>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-text">{props.intro}</p>
          <form method="post" action={props.action} className="mt-8">
            <input type="hidden" name="token" value={props.token} />
            <button type="submit" className="h-11 rounded-md bg-ink px-6 font-sans text-[0.95rem] font-medium text-paper transition-opacity hover:opacity-85">
              {props.button}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="font-headline text-[2rem] text-ink">Link incomplete</h1>
          <p className="mt-3 text-text">Open the link from your email again; it may have been cut off.</p>
        </>
      )}
      <p className="mt-10 font-sans text-[0.875rem]">
        <Link href="/" className="text-link underline underline-offset-2">
          Go to today&apos;s edition
        </Link>
      </p>
    </div>
  );
}
