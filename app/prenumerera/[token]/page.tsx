import type { Metadata } from "next";
import Link from "next/link";

import { NewsletterForm } from "@/components/NewsletterForm";
import {
  getNewsletterByToken,
  normalizeFrequency,
  parseVenueList,
} from "@/lib/db/newsletter";
import s from "./page.module.scss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dina inställningar — Hör & Se",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ bekraftad?: string }>;
};

export default async function NewsletterSettingsPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { bekraftad } = await searchParams;
  const subscriber = await getNewsletterByToken(token);

  if (!subscriber) {
    return (
      <main className={s.page}>
        <p className={s.mark}>Hör &amp; Se</p>
        <p className={s.eyebrow}>Nyhetsbrev</p>
        <h1 className={s.title}>Länken fungerar inte</h1>
        <p className={s.lead}>
          Länken är ogiltig eller så har prenumerationen redan avslutats. Du kan
          prenumerera igen från startsidan.
        </p>
        <Link className={s.back} href="/">
          Till Hör &amp; Se →
        </Link>
      </main>
    );
  }

  const confirmed = bekraftad === "1";

  return (
    <main className={s.page}>
      <p className={s.mark}>Hör &amp; Se</p>
      <p className={s.eyebrow}>Nyhetsbrev</p>
      <h1 className={s.title}>
        {confirmed ? "Din prenumeration är bekräftad" : "Dina inställningar"}
      </h1>
      <p className={s.lead}>
        {confirmed
          ? "Tack! Nu börjar vi skicka konserttips på scenerna du valt. Du kan ändra dig när som helst här."
          : "Här kan du ändra vilka scener du följer och hur ofta du vill få mail."}
      </p>
      <div className={s.formWrap}>
        <NewsletterForm
          mode="manage"
          initialVenues={parseVenueList(subscriber.venues)}
          initialFrequency={normalizeFrequency(subscriber.frequency)}
          email={subscriber.email}
          token={token}
          validated={subscriber.validated}
        />
      </div>
      <p className={s.fine}>
        <Link className={s.back} href="/">
          Till Hör &amp; Se
        </Link>
      </p>
    </main>
  );
}
