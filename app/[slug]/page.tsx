import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConcertApp } from "@/components/ConcertApp";
import { JsonLd } from "@/components/JsonLd";
import { loadPayload } from "@/lib/db/queries";
import { upcomingEvents } from "@/lib/events";
import { findVenue, musicEventGraph, venueAddress } from "@/lib/seo";
import s from "./page.module.scss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function venueDescription(name: string, address: string | undefined): string {
  const place = address ? `, ${address}` : " i Stockholm";
  return `Kommande spelningar på ${name}${place}. Datum, tid och artister.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const venue = findVenue(slug);
  if (!venue) notFound();
  const address = venueAddress(venue.slug);
  const title = `Konserter på ${venue.name} — Hör & Se`;
  const description = venueDescription(venue.name, address);
  return {
    title,
    description,
    alternates: { canonical: `/${venue.slug}` },
    openGraph: {
      title,
      description,
      url: `/${venue.slug}`,
      locale: "sv_SE",
      type: "website",
    },
  };
}

export default async function VenuePage({ params }: Props) {
  const { slug } = await params;
  const venue = findVenue(slug);
  if (!venue) notFound();

  const payload = await loadPayload();
  const events = upcomingEvents(payload.events ?? [], [], "all").filter(
    (event) => event.venue_slug === venue.slug,
  );
  const address = venueAddress(venue.slug);

  return (
    <>
      <JsonLd data={musicEventGraph(events)} />
      <ConcertApp
        payload={payload}
        initialPeek={venue.slug}
        venueIntro={
          <section className={s.intro} aria-labelledby="venue-heading">
            <h2 id="venue-heading">Kommande konserter på {venue.name}</h2>
            <p>
              Här samlar vi spelningar på {venue.name} under de närmaste fem veckorna.
              Se vilka artister som spelar, hitta datum och tider och lyssna på
              smakprov där det finns. Varje konsert länkar vidare till spelställets
              eller arrangörens sida för mer information och biljetter.
            </p>
            {address && <p className={s.address}>Adress: {address}</p>}
          </section>
        }
      />
    </>
  );
}
