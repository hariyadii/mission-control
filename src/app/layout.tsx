import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import Sidebar from "@/components/Sidebar";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import { MissionControlProvider } from "@/contexts";

export const metadata: Metadata = {
  title: "Mission Control",
  description: "OpenClaw Agent Mission Control",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>
          <MissionControlProvider>
            <div className="app-shell flex min-h-screen">
              <Sidebar />
              <main className="content-wrap">{children}</main>
            </div>
            <KeyboardShortcuts />
          </MissionControlProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
