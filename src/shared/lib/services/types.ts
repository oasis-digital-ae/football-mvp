export interface Order {
  id: number;
  user_id: string;
  team_id: number;
  order_type: 'BUY' | 'SELL';
  quantity: number;
  price_per_share: number;
  total_amount: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
  executed_at: string | null;
  created_at: string;
  updated_at: string;
  team?: Team;
}

export interface Team {
  id: number;
  external_id: number;
  name: string;
  short_name: string;
  logo_url: string | null;
  initial_market_cap: number;
  market_cap: number;
  total_shares: number;
  available_shares: number;
  shares_outstanding: number;
  is_tradeable: boolean;
  created_at: string;
  updated_at: string;
  launch_price: number;
}

export interface OrderWithImpact extends Order {
  market_cap_impact: number;
  market_cap_before: number;
  market_cap_after: number;
  share_price_before: number;
  share_price_after: number;
  cash_added_to_market_cap: number;
  order_sequence: number;
}

export interface TeamOrdersData {
  team: Team;
  orders: OrderWithImpact[];
  total_cash_added: number;
  total_shares_traded: number;
  market_cap_timeline: Array<{
    date: string;
    type: 'initial' | 'order' | 'match';
    description: string;
    market_cap_before: number;
    market_cap_after: number;
    cash_added?: number;
    opponent?: string;
    match_result?: string;
  }>;
}
