export type TicketStatus =
  | 'open'
  | 'in_analysis'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_third_party'
  | 'resolved'
  | 'closed'
  | 'cancelled';

export type TicketPriority = 'low' | 'medium' | 'high';
export type SenderType = 'customer' | 'agent';
export type MessageStatus = 'pending' | 'sent' | 'failed';

export interface Customer {
  id: string;
  name: string;
  phone_number: string;
  email: string | null;
  company: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: number;
  customer_id: string;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string | null;
  assigned_agent_id: string | null;
  helper_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketWithCustomer extends Ticket {
  customer_name: string;
  customer_phone: string;
}

export interface Message {
  id: string;
  ticket_id: string;
  sender_type: SenderType;
  content_text: string;
  status: MessageStatus;
  created_at: string;
}

export interface MessageWithSender extends Message {
  sender_name?: string;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  phone_number: string | null;
  avatar_url: string | null;
}

export interface AgentStats {
  id: string;
  name: string;
  email: string;
  phone_number: string | null;
  avatar_url: string | null;
  active_tickets: number;
  resolved_tickets: number;
}

export const ACTIVE_STATUSES: TicketStatus[] = [
  'open',
  'in_analysis',
  'in_progress',
  'waiting_customer',
  'waiting_third_party',
];

export const BOARD_STATUSES: TicketStatus[] = [
  'open',
  'in_analysis',
  'in_progress',
  'waiting_customer',
  'waiting_third_party',
  'resolved',
];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open:                'Aberto',
  in_analysis:         'Em Análise',
  in_progress:         'Em Atendimento',
  waiting_customer:    'Aguardando Cliente',
  waiting_third_party: 'Aguardando Terceiro',
  resolved:            'Resolvido',
  closed:              'Fechado',
  cancelled:           'Cancelado',
};

export const STATUS_COLORS: Record<TicketStatus, string> = {
  open:                'bg-green-500',
  in_analysis:         'bg-yellow-500',
  in_progress:         'bg-blue-500',
  waiting_customer:    'bg-orange-500',
  waiting_third_party: 'bg-purple-500',
  resolved:            'bg-gray-500',
  closed:              'bg-gray-300',
  cancelled:           'bg-red-500',
};

export const STATUS_PAUSES_SLA: TicketStatus[] = [
  'waiting_customer',
  'waiting_third_party',
];

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
};
