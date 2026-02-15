import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const ibmThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ibm-thai",
});

export const metadata: Metadata = {
  title: "à¸£à¸°à¸šà¸šà¸¢à¸·à¸™à¸¢à¸±à¸™à¸•à¸±à¸§à¸•à¸™ KYC â€” à¸­à¸šà¸•.à¸¥à¸¸à¹‚à¸šà¸°à¸ªà¸²à¸§à¸­",
  description:
    "à¸£à¸°à¸šà¸šà¸¢à¸·à¸™à¸¢à¸±à¸™à¸•à¸±à¸§à¸•à¸™à¸”à¸´à¸ˆà¸´à¸—à¸±à¸¥ à¸£à¸°à¸”à¸±à¸š IAL2 à¸­à¸‡à¸„à¹Œà¸à¸²à¸£à¸šà¸£à¸´à¸«à¸²à¸£à¸ªà¹ˆà¸§à¸™à¸•à¸³à¸šà¸¥à¸¥à¸¸à¹‚à¸šà¸°à¸ªà¸²à¸§à¸­",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className={`${ibmThai.variable} font-sans`}>{children}<script dangerouslySetInnerHTML={{__html:`if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js")}`}}/></body>
    </html>
  );
}

