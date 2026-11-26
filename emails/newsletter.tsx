// React Email preview fixture. Run `pnpm email:dev` and open
// http://localhost:3001. This file is only used by the preview server; the real
// digest is built per subscriber in lib/newsletter/digest.ts.

import { NewsletterEmail } from "../lib/newsletter/emails/NewsletterEmail";
import type { DigestView } from "../lib/newsletter/digest";

const view: DigestView = {
  subject: "Hör & Se: konserter 24–30 november",
  preview: "5 konserter på Debaser, Nalen, Berwaldhallen och Fasching",
  intro: "Här är konserterna på scenerna du följer den kommande veckan.",
  periodLabel: "Vecka 48",
  frequency: "weekly",
  venues: [
    { name: "Berwaldhallen", color: "#b08960" },
    { name: "Debaser", color: "#d4573c" },
    { name: "Fasching", color: "#d4573c" },
    { name: "Nalen", color: "#e0b25a" },
  ],
  weeks: [
    {
      key: "2026-11-23",
      title: "Denna veckans konserter",
      count: 4,
      listenUrl: "https://www.hoeroch.se/nalen#nalen-spawner",
      days: [
        {
          key: "2026-11-24",
          kicker: "Tisdag",
          rest: "24 november",
          events: [
            {
              id: "nalen-spawner",
              title: "Spawner & ånghäst parken",
              time: "18:00",
              venue: "Nalen",
              venueColor: "#e0b25a",
              venueUrl: "https://www.hoeroch.se/nalen",
              place: "Klubben",
              excerpt:
                "Rått, vackert och stökigt när Köpenhamn möter Stockholm på Nalen. Gitarrbrus, drömska melodier och suggestiva stämningar.",
              imageUrl:
                "https://a.storyblok.com/f/336862/1080x1350/853ee18770/spawner-anghast-parken-logo-25-november-2026-nalen-stockholm-4-5.jpg",
              listenUrl: "https://www.hoeroch.se/nalen#nalen-spawner",
              externalUrl: "https://www.nalen.com/konsert/spawner-anghaest-parken",
              icsUrl: "https://www.hoeroch.se/kalender/nalen-spawner.ics",
            },
          ],
        },
        {
          key: "2026-11-26",
          kicker: "Torsdag",
          rest: "26 november",
          events: [
            {
              id: "debaser-coffin",
              title: "C.O.F.F.I.N",
              time: "19:00",
              venue: "Debaser",
              venueColor: "#d4573c",
              venueUrl: "https://www.hoeroch.se/debaser",
              place: "Debaser Nova",
              excerpt:
                "Australiska C.O.F.F.I.N till Sverige i höst. Dörrar 19.00, 18 år med förköpsbiljett.",
              imageUrl:
                "https://admin.debaser.se/uploads/img/30153_20260601093643.jpg",
              listenUrl: "https://www.hoeroch.se/debaser#debaser-coffin",
              externalUrl: "https://debaser.se/events/c-o-f-f-i-n",
              icsUrl: "https://www.hoeroch.se/kalender/debaser-coffin.ics",
            },
            {
              id: "berwaldhallen-karlekens",
              title: "Kärlekens rötter",
              time: "18:00",
              venue: "Berwaldhallen",
              venueColor: "#b08960",
              venueUrl: "https://www.hoeroch.se/berwaldhallen",
              place: "Finlandsinstitutet",
              excerpt:
                "Barockens känsloträdgård med Birthe Wingren och musiker ur Radiosymfonikerna, Radiokören.",
              imageUrl:
                "https://cdn-production.berwaldhallen.se/wp-content/uploads/2026/10/22161651/Karlekensrotter_1920x1280.jpg",
              listenUrl: "https://www.hoeroch.se/berwaldhallen#berwaldhallen-karlekens",
              externalUrl:
                "https://www.berwaldhallen.se/konsert/karlekens-rotter",
              icsUrl: "https://www.hoeroch.se/kalender/berwaldhallen-karlekens.ics",
            },
          ],
        },
      ],
    },
    {
      key: "2026-11-30",
      title: "Nästa vecka",
      count: 1,
      listenUrl: "https://www.hoeroch.se/fasching#fasching-jazz",
      days: [
        {
          key: "2026-12-01",
          kicker: "Tisdag",
          rest: "1 december",
          events: [
            {
              id: "fasching-jazz",
              title: "Jazz på Fasching",
              time: "20:00",
              venue: "Fasching",
              venueColor: "#d4573c",
              venueUrl: "https://www.hoeroch.se/fasching",
              place: "",
              excerpt:
                "En kväll med svensk och internationell jazz på Kungsgatan. Ingen bild hittad – så ser kortet ut utan poster.",
              imageUrl: "",
              listenUrl: "https://www.hoeroch.se/fasching#fasching-jazz",
              externalUrl: "https://www.fasching.se/",
              icsUrl: "https://www.hoeroch.se/kalender/fasching-jazz.ics",
            },
          ],
        },
      ],
    },
  ],
  eventCount: 5,
  capped: false,
  manageUrl: "https://www.hoeroch.se/prenumerera/preview",
  unsubscribeUrl: "https://www.hoeroch.se/prenumerera/preview/avsluta",
  siteUrl: "https://www.hoeroch.se/",
};

export default function NewsletterPreview() {
  return <NewsletterEmail view={view} />;
}
