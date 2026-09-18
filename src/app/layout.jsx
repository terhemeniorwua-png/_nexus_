import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import ToastStack from "@/components/workspace/ToastStack";
import Footer from "@/components/workspace/Footer";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Nexus — Team Collaboration Workspace",
  description:
    "Nexus is a professional workspace where teams manage work, share knowledge, and communicate in one connected place.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <AuthProvider>
          {children}
          <Footer />
        </AuthProvider>
        <ToastStack />
      </body>
    </html>
  );
}