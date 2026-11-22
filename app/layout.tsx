import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import Script from "next/script";
import "@/styles/index.scss";
import { siteOrigin } from "@/lib/seo";

const william = localFont({
  src: [
    {
      path: "../public/fonts/William/WilliamTextVFRomanNormal.woff2",
      weight: "400 700",
      style: "normal",
    },
  ],
  variable: "--font-anselm",
  display: "swap",
});

const walter = localFont({
  src: "../public/fonts/ABCWalterNeue-Regular.otf",
  variable: "--font-walter",
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "Hör & Se",
  description:
    "Konserter den kommande månaden på scener runt Stockholm, från Debaser och Nalen till Konserthuset, arenorna och de små jazzkrogarna.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv" className={`${william.variable} ${walter.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-3RKD8M02HP"
          strategy="beforeInteractive"
        />
        <Script id="google-tag" strategy="beforeInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-3RKD8M02HP');`}
        </Script>
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '4035946179880931');
fbq('track', 'PageView');`}
        </Script>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var r=document.documentElement;if(localStorage.getItem("konserter-theme")==="light")r.setAttribute("data-theme","light");if(localStorage.getItem("konserter-hide-intro")==="1")r.setAttribute("data-hide-intro","")}catch(e){}',
          }}
        />
        {children}
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=4035946179880931&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
      </body>
    </html>
  );
}
