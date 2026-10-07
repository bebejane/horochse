import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import Script from "next/script";
import "@/styles/index.scss";

const william = localFont({
  src: [
    {
      path: "../public/fonts/William/WilliamTextVFRomanNormal.woff2",
      weight: "400 700",
      style: "normal",
    },
    {
      path: "../public/fonts/William/WilliamTextVFItalicNormal.woff2",
      weight: "400 700",
      style: "italic",
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
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var r=document.documentElement;if(localStorage.getItem("konserter-theme")==="light")r.setAttribute("data-theme","light");var hide=localStorage.getItem("konserter-hide-intro")==="1";if(!hide){var raw=localStorage.getItem("konserter-mine");if(raw){var list=JSON.parse(raw);hide=Array.isArray(list)&&list.length>0}}if(hide)r.setAttribute("data-hide-intro","")}catch(e){}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
