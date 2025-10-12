// Audit service for comprehensive logging of user and system actions
import { supabase } from '../supabase';
import { logger } from '../logger';

export const auditService = {
  /**
   * Log user actions for audit trail
   */
  async logUserAction(
    userId: string, 
    action: string, 
    tableName: string, 
    recordId: number | null, 
    data: any
  ): Promise<void> {
    try {
      const { error } = await supabase.from('audit_log').insert({
        user_id: userId,
        action,
        table_name: tableName,
        record_id: recordId,
        new_values: data,
        created_at: new Date().toISOString()
      });

      if (error) {
        logger.error('Failed to log user action:', error);
        return;
      }

      logger.debug('User action logged successfully:', { action, userId, tableName });
    } catch (error) {
      logger.error('Failed to log user action:', error);
    }
  },

  /**
   * Log system actions for audit trail
   */
  async logSystemAction(
    action: string, 
    tableName: string, 
    data: any
  ): Promise<void> {
    try {
      const { error } = await supabase.from('audit_log').insert({
        user_id: null,
        action,
        table_name: tableName,
        new_values: data,
        created_at: new Date().toISOString()
      });

      if (error) {
        logger.error('Failed to log system action:', error);
        return;
      }

      logger.debug('System action logged successfully:', { action, tableName });
    } catch (error) {
      logger.error('Failed to log system action:', error);
    }
  },

  /**
   * Log admin actions with additional context
   */
  async logAdminAction(
    adminUserId: string,
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      const { error } = await supabase.from('audit_log').insert({
        user_id: adminUserId,
        action,
        table_name: 'admin_panel',
        new_values: {
          ...details,
          admin_action: true,
          timestamp: new Date().toISOString()
        },
        created_at: new Date().toISOString()
      });

      if (error) {
        logger.error('Failed to log admin action:', error);
        return;
      }

      logger.debug('Admin action logged successfully:', { action, adminUserId });
    } catch (error) {
      logger.error('Failed to log admin action:', error);
    }
  },

  /**
   * Log financial transactions with detailed context
   */
  async logFinancialTransaction(
    userId: string,
    transactionType: 'purchase' | 'sale' | 'transfer',
    amount: number,
    details: Record<string, any>
  ): Promise<void> {
    try {
      const { error } = await supabase.from('audit_log').insert({
        user_id: userId,
        action: `financial_${transactionType}`,
        table_name: 'financial_transactions',
        new_values: {
          transaction_type: transactionType,
          amount,
          ...details,
          financial_action: true,
          timestamp: new Date().toISOString()
        },
        created_at: new Date().toISOString()
      });

      if (error) {
        logger.error('Failed to log financial transaction:', error);
        return;
      }

      logger.debug('Financial transaction logged successfully:', { 
        transactionType, 
        userId, 
        amount 
      });
    } catch (error) {
      logger.error('Failed to log financial transaction:', error);
    }
  },

  /**
   * Log security events
   */
  async logSecurityEvent(
    eventType: 'login_attempt' | 'permission_denied' | 'suspicious_activity',
    userId: string | null,
    details: Record<string, any>
  ): Promise<void> {
    try {
      const { error } = await supabase.from('audit_log').insert({
        user_id: userId,
        action: `security_${eventType}`,
        table_name: 'security_events',
        new_values: {
          event_type: eventType,
          ...details,
          security_event: true,
          timestamp: new Date().toISOString()
        },
        created_at: new Date().toISOString()
      });

      if (error) {
        logger.error('Failed to log security event:', error);
        return;
      }

      logger.debug('Security event logged successfully:', { eventType, userId });
    } catch (error) {
      logger.error('Failed to log security event:', error);
    }
  }
};

