import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import TicketChat from "@/pages/TicketChat";
import Customers from "@/pages/Customers";
import Agents from "@/pages/Agents";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import Register from "@/pages/Register";
import Admin from "@/pages/Admin";
import InternalReportPage  from '@/pages/InternalReportPage'
import CustomerReportPage  from '@/pages/CustomerReportPage'

const queryClient = new QueryClient();

function NotificationListener() {
  useRealtimeNotifications();
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <NotificationListener />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/tickets" element={<TicketChat />} />
                <Route path="/tickets/:id" element={<TicketChat />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/relatorios" element={<InternalReportPage />} />
              </Route>

              <Route path="/relatorio/:token" element={<CustomerReportPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
