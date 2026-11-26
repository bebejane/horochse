// React Email preview fixture for the double opt-in mail.
// Run `pnpm email:dev` and open http://localhost:3001.

import { ConfirmEmail } from "../lib/newsletter/emails/ConfirmEmail";

export default function ConfirmPreview() {
  return (
    <ConfirmEmail
      venues={[
        { name: "Berwaldhallen", color: "#b08960" },
        { name: "Debaser", color: "#d4573c" },
        { name: "Nalen", color: "#e0b25a" },
      ]}
      frequency="Varje vecka"
      verifyUrl="https://www.hoeroch.se/api/newsletter/verify?token=preview"
      manageUrl="https://www.hoeroch.se/prenumerera/preview"
      unsubscribeUrl="https://www.hoeroch.se/prenumerera/preview/avsluta"
    />
  );
}
