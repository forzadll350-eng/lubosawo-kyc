import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ระบบยืนยันตัวตน อบต.ลุโบะสาวอ",
    short_name: "KYC ลุโบะสาวอ",
    description: "ระบบยืนยันตัวตนดิจิทัล IAL2 องค์การบริหารส่วนตำบลลุโบะสาวอ",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1628",
    theme_color: "#0a1628",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
