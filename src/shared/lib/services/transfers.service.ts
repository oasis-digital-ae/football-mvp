// Transfers service - handles all transfer ledger operations
import { supabase } from '../supabase';
import { logger } from '../logger';

export interface DatabaseTransferLedger {
  id: number;
  fixture_id: number;
  winner_team_id: number;
  loser_team_id: number;
  transfer_amount: number;
  applied_at: string;
  is_latest: boolean;
}

export const transfersLedgerService = {
  async getAll(): Promise<DatabaseTransferLedger[]> {
    const { data, error } = await supabase
      .from('transfers_ledger')
      .select('*')
      .order('applied_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async getByTeam(teamId: number): Promise<DatabaseTransferLedger[]> {
    const { data, error } = await supabase
      .from('transfers_ledger')
      .select('*')
      .or(`winner_team_id.eq.${teamId},loser_team_id.eq.${teamId}`)
      .order('applied_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async getByFixture(fixtureId: number): Promise<DatabaseTransferLedger[]> {
    const { data, error } = await supabase
      .from('transfers_ledger')
      .select('*')
      .eq('fixture_id', fixtureId)
      .order('applied_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async getHistorical(): Promise<DatabaseTransferLedger[]> {
    const { data, error } = await supabase
      .from('transfers_ledger')
      .select('*')
      .order('applied_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async createTransfer(transfer: Omit<DatabaseTransferLedger, 'id' | 'applied_at'>): Promise<DatabaseTransferLedger> {
    const { data, error } = await supabase
      .from('transfers_ledger')
      .insert({
        ...transfer,
        applied_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async clearAllTransfers(): Promise<void> {
    const { error } = await supabase
      .from('transfers_ledger')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
    if (error) throw error;
    logger.info('Cleared all transfer ledger entries');
  }
};


