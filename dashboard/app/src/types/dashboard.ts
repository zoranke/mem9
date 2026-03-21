export interface AgentDistributionItem {
  agent_id: string;
  count: number;
  ratio: number;
}

export interface DashboardStats {
  total: number;
  pinned: number;
  insight: number;
  today_added: number;
  agent_distribution: AgentDistributionItem[];
}

export interface AuditLog {
  id: number;
  ts: string;
  actor: string;
  action: string;
  method: string;
  path: string;
  query_text: string;
  resource_id: string;
  status_code: number;
  ip: string;
  user_agent: string;
}

export interface AuditLogListResponse {
  logs: AuditLog[];
  total: number;
}
