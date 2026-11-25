import {
  Column,
  Heading,
  Img,
  Link,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties } from "react";

import type { DigestEventView, DigestView } from "../digest";
import { emailColors, emailFonts } from "../theme";
import { EmailLayout } from "./Layout";

export function NewsletterEmail({ view }: { view: DigestView }) {
  return (
    <EmailLayout
      preview={view.preview}
      footer={
        <>
          <Text style={footerText}>
            Du får det här mailet för att du prenumererar på Hör &amp; Se.
          </Text>
          <Text style={footerLinks}>
            <Link href={view.manageUrl} style={footerLink}>
              Ändra inställningar
            </Link>
            <span style={footerSep}> · </span>
            <Link href={view.unsubscribeUrl} style={footerLink}>
              Avsluta prenumeration
            </Link>
          </Text>
          <Text style={footerFine}>Hör &amp; Se · Konst &amp; Teknik · Stockholm</Text>
        </>
      }
    >
      <Section>
        <Text style={period}>{view.periodLabel}</Text>
        <Heading style={headline}>Konserter på dina scener</Heading>
        <Text style={intro}>{view.intro}</Text>
        <Text style={venueList}>
          {view.venues.map((venue, index) => (
            <span key={venue.name}>
              {index > 0 ? <span style={venueSep}> · </span> : null}
              <span style={{ color: venue.color }}>{venue.name}</span>
            </span>
          ))}
        </Text>
      </Section>

      {view.weeks.map((week) => (
        <Section key={week.key} style={weekSection}>
          <Row>
            <Column style={{ verticalAlign: "baseline" }}>
              <Heading as="h2" style={weekHeading}>
                {week.title}{" "}
                <sup style={weekCount}>{week.count}</sup>
              </Heading>
            </Column>
            <Column align="right" style={{ verticalAlign: "baseline" }}>
              <Link href={week.listenUrl} style={weekListen}>
                Lyssna på veckan →
              </Link>
            </Column>
          </Row>

          {week.days.map((day) => (
            <Section key={day.key} style={daySection}>
              <Text style={dayHeading}>
                <span style={dayKicker}>{day.kicker}</span>{" "}
                <span style={dayRest}>{day.rest}</span>
              </Text>
              {day.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </Section>
          ))}
        </Section>
      ))}

      {view.capped ? (
        <Text style={more}>
          Det finns fler konserter i perioden.{" "}
          <Link href={view.siteUrl} style={moreLink}>
            Se hela listan på Hör &amp; Se
          </Link>
          .
        </Text>
      ) : null}
    </EmailLayout>
  );
}

function EventRow({ event }: { event: DigestEventView }) {
  const href = event.listenUrl || event.externalUrl;
  return (
    <Section style={eventRow}>
      <Row>
        {event.imageUrl ? (
          <Column className="email-poster" style={posterColumn}>
            <Img
              src={event.imageUrl}
              width={168}
              height={105}
              alt=""
              style={poster}
            />
          </Column>
        ) : null}
        <Column style={eventText}>
          <Text style={meta}>
            <span style={metaTime}>{event.time}</span>
            <span style={metaSep}> · </span>
            <Link href={event.venueUrl} style={{ ...metaVenue, color: event.venueColor }}>
              {event.venue}
            </Link>
            {event.place ? (
              <>
                <span style={metaSep}> · </span>
                <span>{event.place}</span>
              </>
            ) : null}
          </Text>
          <Link href={href} style={title}>
            {event.title}
          </Link>
          {event.excerpt ? <Text style={excerpt}>{event.excerpt}</Text> : null}
          <Text style={actions}>
            {event.listenUrl ? (
              <Link href={event.listenUrl} style={action}>
                ▶ Lyssna
              </Link>
            ) : (
              <Link href={event.externalUrl} style={action}>
                Läs mer
              </Link>
            )}
            {event.listenUrl ? (
              <>
                <span style={actionSep}> · </span>
                <Link href={event.externalUrl} style={action}>
                  Se mer
                </Link>
              </>
            ) : null}
            <span style={actionSep}> · </span>
            <Link href={event.icsUrl} style={action}>
              Lägg till i kalender
            </Link>
          </Text>
        </Column>
      </Row>
    </Section>
  );
}

const period: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "11px",
  letterSpacing: "0.1em",
  lineHeight: "1.4",
  margin: "0 0 6px",
  textTransform: "uppercase",
};

const headline: CSSProperties = {
  color: emailColors.ink,
  fontFamily: emailFonts.serif,
  fontSize: "28px",
  fontWeight: 400,
  letterSpacing: "-0.02em",
  lineHeight: "1.15",
  margin: "0 0 10px",
};

const intro: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.serif,
  fontSize: "16px",
  lineHeight: "1.5",
  margin: "0 0 10px",
};

const venueList: CSSProperties = {
  fontFamily: emailFonts.sans,
  fontSize: "11px",
  letterSpacing: "0.04em",
  lineHeight: "1.6",
  margin: 0,
  textTransform: "uppercase",
};

const venueSep: CSSProperties = {
  color: emailColors.muted,
};

const weekSection: CSSProperties = {
  borderTop: `1px solid ${emailColors.ink}`,
  marginTop: "30px",
  paddingTop: "10px",
};

const weekHeading: CSSProperties = {
  color: emailColors.ink,
  fontFamily: emailFonts.serif,
  fontSize: "23px",
  fontWeight: 400,
  letterSpacing: "-0.02em",
  lineHeight: "1.15",
  margin: 0,
};

const weekCount: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "10px",
  letterSpacing: "0.05em",
  marginLeft: "8px",
  verticalAlign: "baseline",
};

const weekListen: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "10px",
  letterSpacing: "0.08em",
  textDecoration: "none",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const daySection: CSSProperties = {
  marginTop: "20px",
};

const dayHeading: CSSProperties = {
  borderTop: `1px solid ${emailColors.line}`,
  color: emailColors.muted,
  fontFamily: emailFonts.serif,
  fontSize: "15px",
  lineHeight: "1.3",
  margin: "0 0 8px",
  paddingTop: "10px",
};

const dayKicker: CSSProperties = {
  color: emailColors.ink,
  fontSize: "17px",
};

const dayRest: CSSProperties = {
  color: emailColors.muted,
};

const eventRow: CSSProperties = {
  borderBottom: `1px solid ${emailColors.line}`,
  padding: "12px 0 14px",
};

const posterColumn: CSSProperties = {
  verticalAlign: "top",
  width: "168px",
};

const poster: CSSProperties = {
  borderRadius: "3px",
  display: "block",
  objectFit: "cover",
};

const eventText: CSSProperties = {
  paddingLeft: "16px",
  verticalAlign: "top",
};

const meta: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "10px",
  letterSpacing: "0.06em",
  lineHeight: "1.5",
  margin: "0 0 4px",
  textTransform: "uppercase",
};

const metaTime: CSSProperties = {
  color: emailColors.ink,
  letterSpacing: "0",
};

const metaSep: CSSProperties = {
  color: emailColors.line,
};

const metaVenue: CSSProperties = {
  textDecoration: "none",
};

const title: CSSProperties = {
  color: emailColors.ink,
  fontFamily: emailFonts.serif,
  fontSize: "20px",
  letterSpacing: "-0.015em",
  lineHeight: "1.2",
  textDecoration: "none",
};

const excerpt: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.serif,
  fontSize: "14px",
  lineHeight: "1.45",
  margin: "6px 0 0",
};

const actions: CSSProperties = {
  fontFamily: emailFonts.sans,
  fontSize: "10px",
  letterSpacing: "0.07em",
  lineHeight: "1.6",
  margin: "8px 0 0",
  textTransform: "uppercase",
};

const action: CSSProperties = {
  color: emailColors.ink,
  textDecoration: "none",
};

const actionSep: CSSProperties = {
  color: emailColors.muted,
};

const more: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.serif,
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "26px 0 0",
};

const moreLink: CSSProperties = {
  color: emailColors.ink,
};

const footerText: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "11px",
  lineHeight: "1.6",
  margin: "0 0 6px",
};

const footerLinks: CSSProperties = {
  fontFamily: emailFonts.sans,
  fontSize: "11px",
  lineHeight: "1.6",
  margin: "0 0 6px",
};

const footerLink: CSSProperties = {
  color: emailColors.ink,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

const footerSep: CSSProperties = {
  color: emailColors.muted,
};

const footerFine: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "10px",
  letterSpacing: "0.05em",
  lineHeight: "1.6",
  margin: 0,
  textTransform: "uppercase",
};
