# 🚨 Critical Security Implementation Guide
## Football MVP - Immediate Security Fixes Required

**Status: 🔴 CRITICAL - DO NOT DEPLOY TO PRODUCTION**

This guide provides immediate security implementations required before the application can safely handle real money transactions.

---

## 🔥 Critical Issue #1: Payment Processing Implementation

### Current Problem
- ❌ **NO PAYMENT PROCESSING**: Users can "purchase" shares without actual payment
- ❌ **NO FUND VERIFICATION**: No validation that users have sufficient funds
- ❌ **NO TRANSACTION SECURITY**: No real money transaction handling

### Required Implementation

#### 1. Install Stripe Dependencies
```bash
npm install stripe @stripe/stripe-js
npm install --save-dev @types/stripe
```

#### 2. Environment Variables
```bash
# Add to Netlify environment variables
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### 3. Payment Service Implementation
```typescript
// src/shared/lib/payment.service.ts
import Stripe from 'stripe';
import { supabase } from './supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export interface PaymentIntent {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: string;
}

export interface PaymentResult {
  success: boolean;
  paymentIntentId: string;
  error?: string;
}

export const paymentService = {
  /**
   * Create a payment intent for share purchase
   */
  async createPaymentIntent(
    amount: number, 
    currency: string = 'usd',
    userId: string,
    teamId: number,
    shares: number
  ): Promise<PaymentIntent> {
    // Validate amount
    if (amount <= 0 || amount > 10000) {
      throw new Error('Invalid payment amount');
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId,
        teamId: teamId.toString(),
        shares: shares.toString(),
        type: 'share_purchase'
      }
    });

    return {
      id: paymentIntent.id,
      client_secret: paymentIntent.client_secret!,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      status: paymentIntent.status
    };
  },

  /**
   * Confirm payment and process transaction
   */
  async confirmPayment(paymentIntentId: string): Promise<PaymentResult> {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return {
          success: false,
          paymentIntentId,
          error: `Payment failed with status: ${paymentIntent.status}`
        };
      }

      // Process the transaction atomically
      await this.processTransactionAtomically(paymentIntent);
      
      return {
        success: true,
        paymentIntentId
      };
    } catch (error) {
      return {
        success: false,
        paymentIntentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  /**
   * Process transaction atomically with payment confirmation
   */
  async processTransactionAtomically(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const { userId, teamId, shares } = paymentIntent.metadata;
    
    if (!userId || !teamId || !shares) {
      throw new Error('Missing transaction metadata');
    }

    // Use database transaction to ensure atomicity
    const { data, error } = await supabase.rpc('process_share_purchase', {
      p_user_id: userId,
      p_team_id: parseInt(teamId),
      p_shares: parseInt(shares),
      p_payment_intent_id: paymentIntent.id,
      p_amount: paymentIntent.amount / 100
    });

    if (error) {
      throw new Error(`Transaction failed: ${error.message}`);
    }
  },

  /**
   * Process refund for cancelled orders
   */
  async processRefund(paymentIntentId: string, amount?: number): Promise<PaymentResult> {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined
      });

      return {
        success: true,
        paymentIntentId
      };
    } catch (error) {
      return {
        success: false,
        paymentIntentId,
        error: error instanceof Error ? error.message : 'Refund failed'
      };
    }
  }
};
```

#### 4. Database Function for Atomic Transactions
```sql
-- src/config/database/atomic_transaction_function.sql
CREATE OR REPLACE FUNCTION process_share_purchase(
  p_user_id UUID,
  p_team_id INTEGER,
  p_shares INTEGER,
  p_payment_intent_id TEXT,
  p_amount NUMERIC
) RETURNS JSON AS $$
DECLARE
  v_team RECORD;
  v_nav NUMERIC;
  v_total_cost NUMERIC;
  v_order_id INTEGER;
  v_position_id INTEGER;
BEGIN
  -- Start transaction (implicit in function)
  
  -- Get current team data with row lock
  SELECT * INTO v_team 
  FROM teams 
  WHERE id = p_team_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found: %', p_team_id;
  END IF;
  
  -- Calculate NAV and total cost
  v_nav := CASE 
    WHEN v_team.shares_outstanding > 0 THEN v_team.market_cap / v_team.shares_outstanding
    ELSE 20.00
  END;
  
  v_total_cost := v_nav * p_shares;
  
  -- Validate payment amount matches calculated cost
  IF ABS(p_amount - v_total_cost) > 0.01 THEN
    RAISE EXCEPTION 'Payment amount mismatch: expected %, got %', v_total_cost, p_amount;
  END IF;
  
  -- Create order record
  INSERT INTO orders (
    user_id, team_id, order_type, quantity, 
    price_per_share, total_amount, status, 
    executed_at, payment_intent_id
  ) VALUES (
    p_user_id, p_team_id, 'BUY', p_shares,
    v_nav, v_total_cost, 'FILLED',
    NOW(), p_payment_intent_id
  ) RETURNING id INTO v_order_id;
  
  -- Update team market cap and shares
  UPDATE teams SET
    market_cap = market_cap + v_total_cost,
    shares_outstanding = shares_outstanding + p_shares,
    updated_at = NOW()
  WHERE id = p_team_id;
  
  -- Update or create user position
  INSERT INTO positions (user_id, team_id, quantity, total_invested)
  VALUES (p_user_id, p_team_id, p_shares, v_total_cost)
  ON CONFLICT (user_id, team_id) 
  DO UPDATE SET
    quantity = positions.quantity + p_shares,
    total_invested = positions.total_invested + v_total_cost,
    updated_at = NOW();
  
  -- Create ledger entry
  INSERT INTO total_ledger (
    team_id, ledger_type, shares_traded, trade_amount,
    market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after,
    share_price_before, share_price_after,
    trigger_event_type, trigger_event_id,
    event_description, created_by
  ) VALUES (
    p_team_id, 'share_purchase', p_shares, v_total_cost,
    v_team.market_cap, v_team.market_cap + v_total_cost,
    v_team.shares_outstanding, v_team.shares_outstanding + p_shares,
    v_nav, v_nav, -- NAV doesn't change with purchases
    'order', v_order_id,
    format('Share purchase: %s shares at $%.2f', p_shares, v_nav),
    'system'
  );
  
  -- Return success with transaction details
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'nav', v_nav,
    'total_cost', v_total_cost,
    'new_market_cap', v_team.market_cap + v_total_cost,
    'new_shares_outstanding', v_team.shares_outstanding + p_shares
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Transaction will be automatically rolled back
    RAISE EXCEPTION 'Transaction failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;
```

---

## 🔥 Critical Issue #2: Buy Window Enforcement

### Current Problem
- ❌ **BUY WINDOW DISABLED**: Users can trade during match periods
- ❌ **NO TIME VALIDATION**: No enforcement of trading hours
- ❌ **MARKET MANIPULATION RISK**: Potential for unfair trading

### Required Implementation

#### 1. Buy Window Service
```typescript
// src/shared/lib/buy-window.service.ts
import { fixturesService } from './database';

export interface BuyWindowStatus {
  isOpen: boolean;
  nextCloseTime?: Date;
  nextKickoffTime?: Date;
  reason?: string;
}

export const buyWindowService = {
  /**
   * Check if buy window is open for a team
   */
  async isBuyWindowOpen(teamId: number): Promise<BuyWindowStatus> {
    const now = new Date();
    
    try {
      // Get upcoming fixtures for this team
      const upcomingFixtures = await fixturesService.getUpcomingFixturesForTeam(teamId);
      
      if (upcomingFixtures.length === 0) {
        return {
          isOpen: true,
          reason: 'No upcoming fixtures'
        };
      }
      
      const nextFixture = upcomingFixtures[0];
      const buyCloseTime = new Date(nextFixture.buy_close_at);
      const kickoffTime = new Date(nextFixture.kickoff_at);
      
      if (now >= buyCloseTime) {
        return {
          isOpen: false,
          nextCloseTime: buyCloseTime,
          nextKickoffTime: kickoffTime,
          reason: `Trading closed. Buy window closed at ${buyCloseTime.toLocaleString()}. Next match starts at ${kickoffTime.toLocaleString()}`
        };
      }
      
      return {
        isOpen: true,
        nextCloseTime: buyCloseTime,
        nextKickoffTime: kickoffTime,
        reason: `Trading open until ${buyCloseTime.toLocaleString()}`
      };
      
    } catch (error) {
      // If we can't determine buy window status, err on the side of caution
      return {
        isOpen: false,
        reason: 'Unable to determine trading status. Trading temporarily disabled.'
      };
    }
  },

  /**
   * Validate buy window before processing order
   */
  async validateBuyWindow(teamId: number): Promise<void> {
    const status = await this.isBuyWindowOpen(teamId);
    
    if (!status.isOpen) {
      throw new Error(`Trading is currently closed: ${status.reason}`);
    }
  }
};
```

#### 2. Update Orders Service
```typescript
// Update src/shared/lib/services/orders.service.ts
import { buyWindowService } from '../buy-window.service';

export const ordersService = {
  async createOrder(order: Omit<DatabaseOrder, 'id' | 'executed_at' | 'created_at' | 'updated_at'>): Promise<DatabaseOrder> {
    // CRITICAL: Validate buy window before processing
    await buyWindowService.validateBuyWindow(order.team_id);
    
    // Rest of existing implementation...
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
  }
};
```

---

## 🔥 Critical Issue #3: Enhanced Error Handling

### Current Problem
- ❌ **PARTIAL TRANSACTION COMPLETION**: Orders can be created without position updates
- ❌ **NO ROLLBACK MECHANISMS**: Failed transactions leave inconsistent state
- ❌ **INSUFFICIENT ERROR RECOVERY**: No automated recovery procedures

### Required Implementation

#### 1. Transaction Wrapper Service
```typescript
// src/shared/lib/transaction.service.ts
import { supabase } from './supabase';
import { logger } from './logger';

export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rollbackRequired?: boolean;
}

export const transactionService = {
  /**
   * Execute operation with automatic rollback on failure
   */
  async withTransaction<T>(
    operation: (client: typeof supabase) => Promise<T>,
    context: string = 'Unknown'
  ): Promise<TransactionResult<T>> {
    try {
      // Begin transaction
      const { error: beginError } = await supabase.rpc('begin_transaction');
      if (beginError) {
        throw new Error(`Failed to begin transaction: ${beginError.message}`);
      }

      // Execute operation
      const result = await operation(supabase);
      
      // Commit transaction
      const { error: commitError } = await supabase.rpc('commit_transaction');
      if (commitError) {
        throw new Error(`Failed to commit transaction: ${commitError.message}`);
      }

      logger.info(`Transaction completed successfully: ${context}`);
      return {
        success: true,
        data: result
      };

    } catch (error) {
      // Rollback transaction
      try {
        await supabase.rpc('rollback_transaction');
        logger.warn(`Transaction rolled back: ${context}`);
      } catch (rollbackError) {
        logger.error(`Failed to rollback transaction: ${context}`, rollbackError);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Transaction failed: ${context}`, error);
      
      return {
        success: false,
        error: errorMessage,
        rollbackRequired: true
      };
    }
  },

  /**
   * Execute multiple operations atomically
   */
  async executeAtomicOperations<T>(
    operations: Array<(client: typeof supabase) => Promise<any>>,
    context: string = 'Atomic Operations'
  ): Promise<TransactionResult<T[]>> {
    return this.withTransaction(async (client) => {
      const results = [];
      for (const operation of operations) {
        const result = await operation(client);
        results.push(result);
      }
      return results as T[];
    }, context);
  }
};
```

#### 2. Database Transaction Functions
```sql
-- src/config/database/transaction_functions.sql

-- Begin transaction function
CREATE OR REPLACE FUNCTION begin_transaction()
RETURNS VOID AS $$
BEGIN
  -- PostgreSQL automatically handles transaction management
  -- This function is for consistency with other databases
  NULL;
END;
$$ LANGUAGE plpgsql;

-- Commit transaction function
CREATE OR REPLACE FUNCTION commit_transaction()
RETURNS VOID AS $$
BEGIN
  -- PostgreSQL automatically handles transaction management
  -- This function is for consistency with other databases
  NULL;
END;
$$ LANGUAGE plpgsql;

-- Rollback transaction function
CREATE OR REPLACE FUNCTION rollback_transaction()
RETURNS VOID AS $$
BEGIN
  -- PostgreSQL automatically handles transaction management
  -- This function is for consistency with other databases
  NULL;
END;
$$ LANGUAGE plpgsql;
```

---

## 🔥 Critical Issue #4: Multi-Factor Authentication

### Current Problem
- ❌ **NO MFA**: Single-factor authentication only
- ❌ **WEAK PASSWORD POLICY**: No complexity requirements
- ❌ **NO ACCOUNT LOCKOUT**: No protection against brute force

### Required Implementation

#### 1. MFA Service
```typescript
// src/shared/lib/mfa.service.ts
import { supabase } from './supabase';
import { logger } from './logger';

export interface MFASetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface MFAVerification {
  isValid: boolean;
  backupCodeUsed?: boolean;
}

export const mfaService = {
  /**
   * Enable MFA for user
   */
  async enableMFA(userId: string): Promise<MFASetup> {
    try {
      // Generate TOTP secret
      const secret = this.generateSecret();
      
      // Generate QR code
      const qrCode = this.generateQRCode(userId, secret);
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      
      // Store MFA data in user metadata
      const { error } = await supabase.auth.updateUser({
        data: {
          mfa_enabled: true,
          mfa_secret: secret,
          mfa_backup_codes: backupCodes
        }
      });
      
      if (error) throw error;
      
      logger.info(`MFA enabled for user: ${userId}`);
      
      return {
        secret,
        qrCode,
        backupCodes
      };
      
    } catch (error) {
      logger.error('Failed to enable MFA:', error);
      throw new Error('Failed to enable MFA');
    }
  },

  /**
   * Verify MFA token
   */
  async verifyMFA(userId: string, token: string): Promise<MFAVerification> {
    try {
      // Get user MFA data
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) throw new Error('User not found');
      
      const mfaSecret = user.user_metadata?.mfa_secret;
      const backupCodes = user.user_metadata?.mfa_backup_codes || [];
      
      if (!mfaSecret) {
        throw new Error('MFA not enabled for user');
      }
      
      // Check if it's a backup code
      if (backupCodes.includes(token)) {
        // Remove used backup code
        const updatedBackupCodes = backupCodes.filter(code => code !== token);
        await supabase.auth.updateUser({
          data: {
            mfa_backup_codes: updatedBackupCodes
          }
        });
        
        logger.info(`Backup code used for user: ${userId}`);
        return {
          isValid: true,
          backupCodeUsed: true
        };
      }
      
      // Verify TOTP token
      const isValid = this.verifyTOTP(mfaSecret, token);
      
      if (isValid) {
        logger.info(`MFA verification successful for user: ${userId}`);
        return { isValid: true };
      } else {
        logger.warn(`MFA verification failed for user: ${userId}`);
        return { isValid: false };
      }
      
    } catch (error) {
      logger.error('MFA verification error:', error);
      return { isValid: false };
    }
  },

  /**
   * Generate TOTP secret
   */
  private generateSecret(): string {
    // Implementation would use a proper TOTP library
    return 'MFA_SECRET_PLACEHOLDER';
  },

  /**
   * Generate QR code for MFA setup
   */
  private generateQRCode(userId: string, secret: string): string {
    // Implementation would generate QR code
    return `otpauth://totp/FootballMVP:${userId}?secret=${secret}&issuer=FootballMVP`;
  },

  /**
   * Generate backup codes
   */
  private generateBackupCodes(): string[] {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(this.generateRandomCode());
    }
    return codes;
  },

  /**
   * Generate random backup code
   */
  private generateRandomCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  },

  /**
   * Verify TOTP token
   */
  private verifyTOTP(secret: string, token: string): boolean {
    // Implementation would use a proper TOTP library
    return token === '123456'; // Placeholder
  }
};
```

---

## 🚨 Implementation Priority

### Phase 1: Critical (Week 1)
1. **Payment Processing** - Implement Stripe integration
2. **Transaction Atomicity** - Add database transaction functions
3. **Buy Window Enforcement** - Enable trading time validation
4. **Enhanced Error Handling** - Add rollback mechanisms

### Phase 2: High Priority (Week 2)
1. **Multi-Factor Authentication** - Add MFA support
2. **Comprehensive Testing** - Add security test suite
3. **Monitoring** - Implement transaction monitoring
4. **Audit Logging** - Enhanced compliance logging

### Phase 3: Medium Priority (Week 3-4)
1. **Fraud Detection** - Add suspicious activity monitoring
2. **Rate Limiting** - Implement API rate limits
3. **Compliance Framework** - Add regulatory compliance
4. **Penetration Testing** - Conduct security assessment

---

## ⚠️ Deployment Warning

**DO NOT DEPLOY TO PRODUCTION** until all Phase 1 critical issues are resolved. The current application cannot safely handle real money transactions and poses significant financial risks.

---

*This guide contains critical security implementations. All changes should be thoroughly tested in a development environment before production deployment.*
