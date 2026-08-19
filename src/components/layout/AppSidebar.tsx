import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, MessageSquare, Users, Headphones, Settings, LogOut, ShieldCheck, X, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { to: "/dashboard",   icon: LayoutDashboard, label: "Dashboard" },
  { to: "/tickets",     icon: MessageSquare,   label: "Tickets" },
  { to: "/customers",   icon: Users,           label: "Clientes" },
  { to: "/agents",      icon: Headphones,      label: "Agentes" },
  { to: "/relatorios",  icon: TrendingUp,        label: "Relatórios" },
  { to: "/settings",    icon: Settings,         label: "Configurações" },
];

interface AppSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

const AppSidebar = ({ open, onClose }: AppSidebarProps) => {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [isAbrefyAdmin, setIsAbrefyAdmin] = useState(false);
  const [agentName, setAgentName] = useState<string>("");
  const [agentRole, setAgentRole] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("agents")
      .select("organization_id, role, name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setIsAbrefyAdmin(
          data.organization_id === "00000000-0000-0000-0000-000000000001" &&
          data.role === "admin"
        );
        setAgentName(data.name || "");
        setAgentRole(data.role || "");
      });
  }, [user]);

  const initials = agentName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200",
        // Mobile: esconde por padrão, mostra quando open=true
        "md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-5">
        <img src="/logoSoNomeBranco.png" alt="Abrefy" className="h-8 w-auto" />
        {/* Botão fechar no mobile */}
        <button
          onClick={onClose}
          className="md:hidden text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              onClick={handleNavClick}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          );
        })}

        {isAbrefyAdmin && (
          <NavLink
            to="/admin"
            onClick={handleNavClick}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              location.pathname.startsWith("/admin")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            Admin
          </NavLink>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-2">
        <div className="flex items-center gap-3 px-2 py-1">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs bg-sidebar-accent text-sidebar-accent-foreground">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{agentName || "Usuário"}</p>
            <p className="text-xs text-sidebar-foreground/50 capitalize">{agentRole || ""}</p>
          </div>
        </div>

        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
