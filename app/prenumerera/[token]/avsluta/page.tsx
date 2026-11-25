import type { Metadata } from "next";
import Link from "next/link";

import { NewsletterUnsubscribe } from "@/components/NewsletterUnsubscribe";
import { getNewsletterByToken } from "@/lib/db/newsletter";
import s from "../page.module.scss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Avsluta prenumeration — Hör & Se",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }> };

export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params;
  const subscriber = await getNewsletterByToken(token);

  if (!subscriber) {
    return (
      <main className={s.page}>
        <p className={s.mark}>Hör &amp; Se</p>
        <p className={s.eyebrow}>Nyhetsbrev</p>
        <h1 className={s.title}>Länken fungerar inte</h1>
        <p className={s.lead}>
          Länken är ogiltig eller så har prenumerationen redan avslutats.
        </p>
        <p className={s.fine}>
          <Link className={s.back} href="/">
            Till Hör &amp; Se →
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <p className={s.mark}>Hör &amp; Se</p>
      <p className={s.eyebrow}>Nyhetsbrev</p>
      <h1 className={s.title}>Avsluta prenumerationen?</h1>
      <div className={s.formWrap}>
        <NewsletterUnsubscribe token={token} email={subscriber.email} />
      </div>
      <p className={s.fine}>
        <Link className={s.back} href={`/prenumerera/${encodeURIComponent(token)}`}>
          Till dina inställningar
        </Link>
      </p>
    </main>
  );
}
