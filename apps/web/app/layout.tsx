// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

import type { Metadata } from "next";
import { Inter, Space_Grotesk, Space_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { AuthHydrator } from "../components/AuthHydrator";
import { ProfileGate } from "../components/ProfileGate";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Qnit — Site Intelligence",
  description: "Cited, India-specific site intelligence — flood, sun, wind, rainfall, temperature — on one map.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-neutral-bg text-text-primary">
        <SessionProvider>
          <AuthHydrator>
            <ProfileGate />
            {children}
          </AuthHydrator>
        </SessionProvider>
      </body>
    </html>
  );
}
