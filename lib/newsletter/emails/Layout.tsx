import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

import { emailColors, emailFonts } from "../theme";

export function EmailLayout({
  preview,
  children,
  footer,
}: {
  preview: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Html lang="sv">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <style>{`
          @media only screen and (max-width: 480px) {
            .email-poster { display: none !important; }
            .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
            .email-title { font-size: 21px !important; }
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container} className="email-pad">
          <Section style={masthead}>
            <Text style={wordmark}>Hör &amp; Se</Text>
            <Text style={eyebrow}>KONSERTER I STOCKHOLM</Text>
          </Section>
          {children}
          <Hr style={rule} />
          <Section style={footerStyle}>{footer}</Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: CSSProperties = {
  backgroundColor: emailColors.bg,
  color: emailColors.ink,
  fontFamily: emailFonts.serif,
  margin: 0,
  padding: "24px 0 40px",
  WebkitFontSmoothing: "antialiased",
};

const container: CSSProperties = {
  backgroundColor: emailColors.bg,
  margin: "0 auto",
  maxWidth: "640px",
  padding: "0 32px",
};

const masthead: CSSProperties = {
  borderBottom: `1px solid ${emailColors.line}`,
  padding: "0 0 18px",
  marginBottom: "26px",
};

const wordmark: CSSProperties = {
  color: emailColors.ink,
  fontFamily: emailFonts.serif,
  fontSize: "30px",
  letterSpacing: "-0.03em",
  lineHeight: "1",
  margin: "0 0 8px",
};

const eyebrow: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "10px",
  letterSpacing: "0.12em",
  lineHeight: "1.4",
  margin: 0,
};

const rule: CSSProperties = {
  borderColor: emailColors.line,
  margin: "30px 0 18px",
};

const footerStyle: CSSProperties = {
  color: emailColors.muted,
  fontFamily: emailFonts.sans,
  fontSize: "12px",
  lineHeight: "1.6",
};
