import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { CommandMenu } from "@/components/command-menu";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gold Mine V2",
  description: "Browse lectures, exercise series, files, and comments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="absolute left-2 top-2 z-50 -translate-y-14 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-0 focus:translate-y-0 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <ToastProvider>
          {children}
          <CommandMenu />
        </ToastProvider>
      </body>
    </html>
  );
}
