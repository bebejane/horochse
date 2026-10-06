import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "@/styles/index.scss";

const anselm = localFont({
  src: [
    { path: "../public/fonts/AnselmRegular/2F602A_2_0.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/AnselmItalic/2F5FB4_9_0.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/AnselmBold/2F5FB4_4_0.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/AnselmBoldItalic/2F5FB4_2_0.woff2", weight: "700", style: "italic" },
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
    <html lang="sv" className={`${anselm.variable} ${walter.variable}`} suppressHydrationWarning>
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
