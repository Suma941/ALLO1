import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Allo - Real-Time Inventory & Reservation Platform",
  description: "Experience race-condition-free inventory allocation and transactional order holds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 font-sans">
        {/* Navigation Bar */}
        <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 font-bold text-white shadow-lg shadow-indigo-500/20">
                A
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white">Allo</span>
                <span className="ml-1.5 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-400">
                  Engineering
                </span>
              </div>
            </div>

            <nav className="flex items-center gap-6">
              <a
                href="/"
                className="text-sm font-medium text-slate-400 transition-colors hover:text-white"
              >
                Products
              </a>
              <div className="h-4 w-px bg-slate-800"></div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                API Connected
              </span>
            </nav>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Allo Inc. Concurrency & Reservation System Demo.</p>
        </footer>
      </body>
    </html>
  );
}
