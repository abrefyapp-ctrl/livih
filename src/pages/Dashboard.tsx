import TicketBoard from '@/components/kanban/TicketBoard';
import TicketHistory from '@/components/kanban/TicketHistory';

const Dashboard = () => {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Gerencie seus tickets de atendimento</p>
      </div>
      <TicketBoard />

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Histórico de Tickets Fechados</h2>
        <TicketHistory />
      </div>
    </div>
  );
};

export default Dashboard;
