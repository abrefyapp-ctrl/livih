import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import { Menu } from 'lucide-react';

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background max-w-full overflow-x-hidden">

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 min-w-0 md:ml-60 max-w-full overflow-x-hidden">
        {/* Header mobile com botão hambúrguer */}
        <div className="flex h-14 items-center border-b border-border px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img src="/logoSoNomeBranco.png" alt="Abrefy" className="h-6 w-auto mx-auto" />
        </div>

        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
