import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StegChat · Conversas com algo mais",
  description: "Converse, crie grupos e partilhe mensagens escondidas em imagens.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt"><body>{children}</body></html>;
}
