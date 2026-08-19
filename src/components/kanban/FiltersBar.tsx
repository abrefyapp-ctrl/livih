import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AgentStats, TicketPriority, PRIORITY_LABELS } from '@/types/database';
import { Search } from 'lucide-react';

interface FiltersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  agents: AgentStats[];
  selectedAgent: string;
  onAgentChange: (value: string) => void;
  selectedPriority: string;
  onPriorityChange: (value: string) => void;
}

const FiltersBar: React.FC<FiltersBarProps> = ({
  search, onSearchChange, agents, selectedAgent, onAgentChange, selectedPriority, onPriorityChange,
}) => {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={selectedAgent} onValueChange={onAgentChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Agente" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os agentes</SelectItem>
          {agents.map(agent => (
            <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedPriority} onValueChange={onPriorityChange}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {(Object.entries(PRIORITY_LABELS) as [TicketPriority, string][]).map(([key, label]) => (
            <SelectItem key={key} value={key}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default FiltersBar;
