import { Button, Heading, Link, Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";

import { emailColors, emailFonts } from "../theme";
import { EmailLayout } from "./Layout";

export function ConfirmEmail({
  venues,
  frequency,
  verifyUrl,
  manageUrl,
  unsubscribeUrl,
}: {
  venues: { name: string; color: string }[];
  frequency: string;
  verifyUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;
}) {
  return (
    <EmailLayout
      preview="Bekräfta din prenumeration på Hör & Se"
      footer={
        <>
          <Text style={footerText}>
            Du får det här mailet för att någon har angett din adress på Hör &amp; Se. Om
            det inte var du kan du bortse från mailet.
          </Text>
          <Text style={footerLinks}>
            <Link href={manageUrl} style={footerLink}>
              Ändra inställningar
            </Link>
            <span style={footerSep}> · </span>
            <Link href={unsubscribeUrl} style={footerLink}>
              Avbryt prenumerationen
            </Link>
          </Text>
        </>
      }
    >
      <Text style={eyebrow}>Ett mail {frequency.toLowerCase()}</Text>
      <Heading style={headline}>Bekräfta din prenumeration</Heading>
      <Text style={lead}>
        Klicka på knappen för att bekräfta din adress. Först då börjar vi skicka
        konserttipsen.
      </Text>
      <Button href={verifyUrl} style={button}>
        Bekräfta prenumerationen
      </Button>

      <Section style={summary}>
        <Text style={summaryLabel}>Du får konserter på</Text>
        <Text style={venueList}>
          {venues.map((venue, index) => (
            <span key={venue.name}>
              {index > 0 ? <span style={venueSep}> · </span> : null}
              <span style={{ color: venue.color }}>{venue.name}</span>
            </span>
          ))}
        </Text>
        <Text style={summaryLabel}>Hur ofta</Text>
        <Text style={summaryValue}>{frequency}</Text>
      </Section>

      <Text style={small}>
        Länken går alltid att använda. Du kan ändra scener och frekvens, eller avsluta
        prenumerationen, från samma sida.
      </Text>
    </EmailLayout>
  );
}

const eyebrow: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "11px",
  letterSpacing: "0.1em",
  lineHeight: "1.4",
  margin: "0 0 8px",
  textTransform: "uppercase",
};

const headline: CSSProperties = {
  color: emailColors.ink,
  fontFamily: emailFonts.serif,
  fontSize: "28px",
  fontWeight: 400,
  letterSpacing: "-0.02em",
  lineHeight: "1.15",
  margin: "0 0 12px",
};

const lead: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.serif,
  fontSize: "16px",
  lineHeight: "1.5",
  margin: "0 0 22px",
};

const button: CSSProperties = {
  backgroundColor: emailColors.button,
  borderRadius: "4px",
  color: emailColors.buttonInk,
  display: "inline-block",
  fontFamily: emailFonts.sans,
  fontSize: "11px",
  letterSpacing: "0.08em",
  lineHeight: "1",
  padding: "14px 20px",
  textDecoration: "none",
  textTransform: "uppercase",
};

const summary: CSSProperties = {
  borderTop: `1px solid ${emailColors.line}`,
  marginTop: "28px",
  paddingTop: "16px",
};

const summaryLabel: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "10px",
  letterSpacing: "0.08em",
  lineHeight: "1.5",
  margin: "0 0 2px",
  textTransform: "uppercase",
};

const summaryValue: CSSProperties = {
  color: emailColors.ink,
  fontFamily: emailFonts.serif,
  fontSize: "16px",
  lineHeight: "1.4",
  margin: "0 0 14px",
};

const venueList: CSSProperties = {
  fontFamily: emailFonts.sans,
  fontSize: "11px",
  letterSpacing: "0.04em",
  lineHeight: "1.6",
  margin: "0 0 14px",
  textTransform: "uppercase",
};

const venueSep: CSSProperties = {
  color: emailColors.muted,
};

const small: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "11px",
  lineHeight: "1.6",
  margin: "22px 0 0",
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
  margin: 0,
};

const footerLink: CSSProperties = {
  color: emailColors.ink,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

const footerSep: CSSProperties = {
  color: emailColors.muted,
};
