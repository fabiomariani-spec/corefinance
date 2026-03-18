import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Core Finance — Gestão Financeira Empresarial",
  description: "Sistema central de gestão financeira empresarial",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
