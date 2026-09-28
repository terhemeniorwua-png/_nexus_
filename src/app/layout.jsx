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
  // public/favicon.svg on its own is not enough: files under public/ are served
  // at their path but never linked, and /favicon.svg is not a path any browser
  // requests on its own. Without this the browser falls back to /favicon.ico,
  // finds nothing, and shows a generic page icon in the tab.
  //
  // Declared with an explicit type and size because the file is an SVG, which
  // is what lets the glyph stay sharp at every tab size.
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml", sizes: "any" }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("nexus-theme");var light=t==="light";var root=document.documentElement;if(light)root.classList.add("light");root.style.colorScheme=light?"light":"dark";}catch(e){}})();`,
          }}
        />
      </head>
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