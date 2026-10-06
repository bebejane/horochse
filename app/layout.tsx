import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
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
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var r=document.documentElement;if(localStorage.getItem("konserter-theme")==="light")r.setAttribute("data-theme","light");if(localStorage.getItem("konserter-hide-intro")==="1")r.setAttribute("data-hide-intro","")}catch(e){}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
