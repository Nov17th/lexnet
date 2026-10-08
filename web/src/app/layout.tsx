import type { Metadata } from "next";
import Shell from "@/components/Shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "LexNet — Words connect.",
  description:
    "Explore the shared meanings and connections between English, Vietnamese, and Chinese.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
