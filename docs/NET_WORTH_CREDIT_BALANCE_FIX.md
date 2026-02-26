# Net Worth Credit Balance Fix

## Problem
After reversing jayesh30801's credit loan in the admin panel:
- ✅ Admin panel correctly showed "Reversed" badge
- ✅ Admin summary showed correct net credit totals
- ❌ **Net Worth dialog still showed -$50.00 credit balance**
- ❌ Total Value incorrectly calculated as -$50.00

## Root Cause

The `getCreditBalance()` method in `wallet.service.ts` was only querying `credit_loan` transactions:

```typescript
// BEFORE - WRONG ❌
.eq('type', 'credit_loan')  // Only gets loans, not reversals!
```

This meant:
- jayesh had +$50 credit_loan transaction
- jayesh had -$50 credit_loan_reversal transaction
- But `getCreditBalance()` only saw the +$50
- Result: Net Worth showed -$50.00 credit balance (wrong!)

## Solution

Updated `getCreditBalance()` to include BOTH loan and reversal transactions:

```typescript
// AFTER - CORRECT ✅
.in('type', ['credit_loan', 'credit_loan_reversal'])
// Reversal amounts are negative, automatically subtract
// Returns Math.max(0, total) to prevent negative credit
```

Now the calculation works correctly:
```
jayesh transactions:
  credit_loan: +$50.00
  credit_loan_reversal: -$50.00
  -------------------------
  NET Credit: $0.00 ✅
```

## Code Change

**File:** `src/shared/lib/services/wallet.service.ts`

### Before
```typescript
async getCreditBalance(userId: string): Promise<number> {
  // Get credit balance by summing all credit_loan transactions
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('amount_cents')
    .eq('user_id', userId)
    .eq('type', 'credit_loan');  // ❌ Missing reversals!

  if (error) {
    console.error('Error fetching credit balance:', error);
    return 0;
  }

  const total = (data || []).reduce((sum, tx) => 
    sum + fromCents(tx.amount_cents || 0).toNumber(), 0
  );
  return total;  // ❌ Could be wrong if reversals exist
}
```

### After
```typescript
async getCreditBalance(userId: string): Promise<number> {
  // Get NET credit balance by summing credit_loan AND credit_loan_reversal transactions
  // Reversals have negative amounts, so they automatically subtract from the total
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('amount_cents')
    .eq('user_id', userId)
    .in('type', ['credit_loan', 'credit_loan_reversal']);  // ✅ Includes reversals!

  if (error) {
    console.error('Error fetching credit balance:', error);
    return 0;
  }

  // Sum up all credit transactions (loans + reversals) and convert from cents to dollars
  // Reversal amounts are negative, so they subtract automatically
  const total = (data || []).reduce((sum, tx) => 
    sum + fromCents(tx.amount_cents || 0).toNumber(), 0
  );
  // Return max(0, total) to ensure credit balance is never negative
  return Math.max(0, total);  // ✅ Correct net calculation
}
```

## Impact

### Before Fix
**jayesh30801 Net Worth Dialog:**
```
Portfolio Value:    $0.00
Wallet Balance:     $0.00
Credit Balance:    -$50.00  ❌ WRONG
-------------------------
Total Value:       -$50.00  ❌ WRONG
```

### After Fix
**jayesh30801 Net Worth Dialog:**
```
Portfolio Value:    $0.00
Wallet Balance:     $0.00
Credit Balance:     $0.00  ✅ CORRECT
-------------------------
Total Value:        $0.00  ✅ CORRECT
```

## How It Works

### Credit Balance Calculation Flow

1. **User receives credit loan:**
   ```sql
   INSERT INTO wallet_transactions 
   (user_id, amount_cents, type)
   VALUES (jayesh_id, 5000, 'credit_loan')
   ```
   - `getCreditBalance()` returns: $50.00
   - Net Worth shows: Credit Balance -$50.00

2. **Admin reverses the loan:**
   ```sql
   INSERT INTO wallet_transactions 
   (user_id, amount_cents, type)
   VALUES (jayesh_id, -5000, 'credit_loan_reversal')
   ```
   - `getCreditBalance()` now returns: $50 + (-$50) = $0.00 ✅
   - Net Worth shows: Credit Balance $0.00 ✅

3. **Partial reversal example:**
   ```
   Loan: +$100
   Reversal: -$30
   ----------------
   Net Credit: $70
   Credit Balance: -$70 (user still owes $70)
   ```

## Testing

### Test Case 1: Full Reversal
```
User: jayesh30801
Initial: +$50 loan
Action: Reverse full $50
Expected: Credit Balance = $0
Result: ✅ PASS
```

### Test Case 2: Multiple Loans, One Reversal
```
User: amrmiri
Loan 1: +$20
Loan 2: +$30
Reversal: -$20
----------------
Net Credit: $30
Expected: Credit Balance = -$30
Result: ✅ PASS
```

### Test Case 3: No Loans
```
User: newuser
Loans: None
Expected: Credit Balance = $0
Result: ✅ PASS
```

## User Experience

### Opening Net Worth Dialog
1. User clicks "Net Worth" in navigation dropdown
2. `handleNetWorthClick()` triggers
3. Calls `refreshWalletBalance()` which:
   - Fetches profile data including wallet_balance
   - Calls `getCreditBalance()` with fixed logic ✅
   - Updates `creditBalance` state
4. Dialog displays correct values:
   - Portfolio Value (from positions)
   - Wallet Balance (from profile)
   - Credit Balance (NET credit from loans - reversals) ✅
   - Total Value (portfolio + wallet - credit) ✅

### Net Worth Formula
```typescript
const netWorth = walletBalance + portfolioValue - creditBalance;
```

Where:
- `walletBalance`: Cash in user's wallet
- `portfolioValue`: Market value of all positions
- `creditBalance`: NET credit (loans minus reversals) ✅

## Related Components

### Components Using `creditBalance`
1. **Navigation.tsx**
   - Displays credit balance in Net Worth dialog ✅
   - Uses in net worth calculation ✅

2. **AuthContext.tsx**
   - Fetches credit balance on mount
   - Refreshes on wallet balance refresh
   - Now gets correct NET credit ✅

3. **Admin Panel**
   - Uses separate logic (`adminService.getCreditLoanSummary()`)
   - Already correctly calculated net credit ✅
   - No changes needed ✅

## Deployment

### Files Changed
- ✅ `src/shared/lib/services/wallet.service.ts`

### No Migration Needed
- ✅ Database already has `credit_loan_reversal` type
- ✅ All data exists correctly in database
- ✅ Just needed query logic fix

### Testing After Deployment
1. ✅ Open Net Worth for user with reversed loan
2. ✅ Verify Credit Balance shows $0
3. ✅ Verify Total Value is correct
4. ✅ Test with user having active loans
5. ✅ Test with user having no loans

## Summary

✅ **Fixed:** `getCreditBalance()` now includes reversal transactions  
✅ **Fixed:** Net Worth dialog shows correct $0 credit balance after reversal  
✅ **Fixed:** Total Value calculation is now accurate  
✅ **No breaking changes:** Backwards compatible with existing data  
✅ **Consistent:** All credit calculations now use same logic (NET credit)  

The Net Worth feature now correctly reflects credit loan reversals! 🎉
