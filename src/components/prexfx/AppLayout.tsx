import { useState } from "react";
import { Outlet } from "react-router-dom";
import {
  Home,
  MessageSquare,
  BarChart3,
  Newspaper,
  Settings,
  Bell,
  Menu,
  X,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import SettingsModal from "@/components/prexfx/SettingsModal";

const navItems = [
  { title: "Hub", url: "/", icon: Home },
  { title: "Prexi AI", url: "/terminal", icon: MessageSquare },
  { title: "Vault", url: "/vault", icon: BarChart3 },
  { title: "Scout", url: "/scout", icon: Newspaper },
];

const AppLayout = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background prexfx-grid flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 glass-panel border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:flex p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Menu size={18} />
          </button>
          <span className="tracking-[0.3em] text-lg font-black italic text-primary">
            PrexFx
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors relative">
            <Bell size={16} />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-prexfx-profit rounded-full" />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Settings size={16} />
          </button>
          <div className="flex items-center gap-2 ml-1">
            <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-accent-foreground">
              A
            </div>
            <span className="text-xs text-foreground hidden sm:inline">Apex</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside
          className={`hidden md:flex flex-col border-r border-border glass-panel transition-all duration-300 ${
            sidebarOpen ? "w-48" : "w-14"
          }`}
        >
          <nav className="flex flex-col gap-1 p-2 mt-2">
            {navItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.url === "/"}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-xs"
                activeClassName="bg-accent text-foreground"
              >
                <item.icon size={18} className="shrink-0" />
                {sidebarOpen && (
                  <span className="tracking-widest uppercase text-[10px]">
                    {item.title}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 glass-panel border-t border-border flex justify-around py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/"}
            className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground transition-colors"
            activeClassName="text-foreground"
          >
            <item.icon size={20} />
            <span className="text-[8px] uppercase tracking-widest">{item.title}</span>
          </NavLink>
        ))}
      </nav>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default AppLayout;
