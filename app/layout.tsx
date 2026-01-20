import "./globals.css";

export const metadata = {
  title: "Controle de Gastos da Frota",
  description: "App para controle de custos por caminhão",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
