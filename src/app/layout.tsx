import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const ibmThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ibm-thai",
});

export const metadata: Metadata = {
  title: "Lubosawo KYC System",
  description: "Digital Identity Verification System IAL2",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${ibmThai.variable} font-sans`}>{children}<script dangerouslySetInnerHTML={{__html:`if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js")}`}}/></body>
    </html>
  );
}
