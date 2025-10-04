// Orders service - handles all order-related database operations
import { supabase } from '../supabase';
import { logger } from '../logger';
import { sanitizeInput } from '../sanitization';
import { buyWindowService } from '../buy-window.service';

export interface DatabaseOrder {
  id: number;
  user_id: string;
  team_id: number;
  order_type: 'BUY' | 'SELL';
  quantity: number;
  price_per_share: number;
  total_amount: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
  executed_at?: string;
  created_at: string;
  updated_at: string;
  // CRITICAL: Immutable market cap snapshots
  market_cap_before?: number;
  market_cap_after?: number;
  shares_outstanding_before?: number;
  shares_outstanding_after?: number;
}

export interface DatabaseOrderWithTeam extends DatabaseOrder {
  team: {
    name: string;
  };
}

export const ordersService = {
  async createOrder(order: Omit<DatabaseOrder, 'id' | 'executed_at' | 'created_at' | 'updated_at'>): Promise<DatabaseOrder> {
    // CRITICAL: Validate buy window before processing
    await buyWindowService.validateBuyWindow(order.team_id);
    
    logger.debug('Creating order with buy window validation passed');
    
    // Get current team state BEFORE processing to capture immutable snapshots
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('market_cap, shares_outstanding')
      .eq('id', order.team_id)
      .single();
    
    if (teamError) throw teamError;
    
    // Calculate market cap states for immutable snapshots
    const marketCapBefore = team.market_cap;
    const sharesOutstandingBefore = team.shares_outstanding;
    
    const marketCapAfter = marketCapBefore + order.total_amount;
    const sharesOutstandingAfter = sharesOutstandingBefore + order.quantity;
    
    // Sanitize inputs and add immutable snapshots
    const sanitizedOrder = {
      ...order,
      user_id: sanitizeInput(order.user_id, 'database'),
      order_type: order.order_type as 'BUY' | 'SELL',
      quantity: Math.max(1, Math.floor(order.quantity)),
      price_per_share: Math.max(0, order.price_per_share),
      total_amount: Math.max(0, order.total_amount),
      status: order.status as 'PENDING' | 'FILLED' | 'CANCELLED',
      // CRITICAL: Store immutable market cap snapshots
      market_cap_before: marketCapBefore,
      market_cap_after: marketCapAfter,
      shares_outstanding_before: sharesOutstandingBefore,
      shares_outstanding_after: sharesOutstandingAfter
    };
    
    const { data, error } = await supabase
      .from('orders')
      .insert(sanitizedOrder)
      .select()
      .single();
    
    if (error) throw error;
    
    logger.debug(`Order created with immutable snapshots: Market cap ${marketCapBefore} → ${marketCapAfter}`);
    return data;
  },

  async getUserOrders(userId: string): Promise<DatabaseOrderWithTeam[]> {
    const sanitizedUserId = sanitizeInput(userId, 'database');
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        team:teams(name)
      `)
      .eq('user_id', sanitizedUserId)
      .order('executed_at', { ascending: false });
    
    if (error) throw error;
    return (data || []) as DatabaseOrderWithTeam[];
  },

  async getOrderById(orderId: number): Promise<DatabaseOrder | null> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateOrderStatus(orderId: number, status: 'PENDING' | 'FILLED' | 'CANCELLED', executedAt?: string): Promise<void> {
    const updateData: any = { 
      status,
      updated_at: new Date().toISOString()
    };
    
    if (executedAt) {
      updateData.executed_at = executedAt;
    }
    
    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);
    
    if (error) throw error;
  },

  async cancelOrder(orderId: number): Promise<void> {
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'CANCELLED',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);
    
    if (error) throw error;
  },

  async getOrdersByTeam(teamId: number): Promise<DatabaseOrder[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async getPendingOrders(): Promise<DatabaseOrder[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
};


