import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

const william = localFont({
  src: [
    { path: "./fonts/WilliamText-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/WilliamText-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/WilliamText-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/WilliamText-BoldItalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-william",
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
      <body>
        <Script id="theme-boot" strategy="beforeInteractive">
          {`try{if(localStorage.getItem("konserter-theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
