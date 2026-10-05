import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import FeedbackChatMount from "./FeedbackChatMount";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo" });

export const metadata: Metadata = {
  title: "ourLeads",
  description: "לידים מדודו (בסיס) ומישראל (סנפלינג ישראל) — לוח משותף, עדכון סטטוס בקול",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f5f8b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-sans antialiased">
        {children}
        <FeedbackChatMount />
      </body>
    </html>
  );
}
