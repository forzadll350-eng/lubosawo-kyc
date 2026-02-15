import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const ibmThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ibm-thai",
});

export const metadata: Metadata = {
  title: "ระบบยืนยันตัวตน KYC - อบต.ลุโบะสาวอ",
  description: "ระบบยืนยันตัวตนดิจิทัล ระดับ IAL2 องค์การบริหารส่วนตำบลลุโบะสาวอ",
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
