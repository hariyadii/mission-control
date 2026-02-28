import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import Sidebar from "@/components/Sidebar";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import CommandPalette from "@/components/CommandPalette";
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
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ height: "100%", overflow: "hidden" }}>
        <ConvexClientProvider>
          <MissionControlProvider>
            {/* app-shell: height:100vh, overflow:hidden, flex row */}
            <div className="app-shell">
              <Sidebar />
              {/* content-wrap: flex:1, min-height:0, overflow-y:auto */}
              <main className="content-wrap">{children}</main>
            </div>
            <KeyboardShortcuts />
            <CommandPalette />
          </MissionControlProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
