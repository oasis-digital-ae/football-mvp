// Orders service - handles all order-related database operations
import { supabase } from '../supabase';
import { logger } from '../logger';
import { sanitizeInput } from '../sanitization';

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
}

export interface DatabaseOrderWithTeam extends DatabaseOrder {
  team: {
    name: string;
  };
}

export const ordersService = {
  async createOrder(order: Omit<DatabaseOrder, 'id' | 'executed_at' | 'created_at' | 'updated_at'>): Promise<DatabaseOrder> {
    // Buy window enforcement disabled for MVP - can be re-enabled later
    logger.debug('Creating order without buy window enforcement (MVP mode)');
    
    // Sanitize inputs
    const sanitizedOrder = {
      ...order,
      user_id: sanitizeInput(order.user_id, 'database'),
      order_type: order.order_type as 'BUY' | 'SELL',
      quantity: Math.max(1, Math.floor(order.quantity)),
      price_per_share: Math.max(0, order.price_per_share),
      total_amount: Math.max(0, order.total_amount),
      status: order.status as 'PENDING' | 'FILLED' | 'CANCELLED'
    };
    
    const { data, error } = await supabase
      .from('orders')
      .insert(sanitizedOrder)
      .select()
      .single();
    
    if (error) throw error;
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


