// Renders the React Email templates to the HTML and plain-text bodies Postmark
// expects. Server-only; called from the cron and subscribe routes.

import { render, toPlainText } from "@react-email/render";

import type { DigestView } from "./digest";
import { ConfirmEmail } from "./emails/ConfirmEmail";
import { NewsletterEmail } from "./emails/NewsletterEmail";

export type RenderedMail = { subject: string; html: string; text: string };

export async function renderDigestMail(view: DigestView): Promise<RenderedMail> {
  const html = await render(<NewsletterEmail view={view} />);
  return {
    subject: view.subject,
    html,
    text: toPlainText(html),
  };
}

export async function renderConfirmMail(props: {
  venues: { name: string; color: string }[];
  frequency: string;
  verifyUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;
}): Promise<RenderedMail> {
  const html = await render(<ConfirmEmail {...props} />);
  return {
    subject: "Bekräfta din prenumeration på Hör & Se",
    html,
    text: toPlainText(html),
  };
}
