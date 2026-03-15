import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/prexfx/AppLayout";
import TacticalHub from "@/pages/TacticalHub";
import PrexiTerminal from "@/pages/PrexiTerminal";
import IntelligenceVault from "@/pages/IntelligenceVault";
import NewsScout from "@/pages/NewsScout";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<TacticalHub />} />
            <Route path="/terminal" element={<PrexiTerminal />} />
            <Route path="/vault" element={<IntelligenceVault />} />
            <Route path="/scout" element={<NewsScout />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
