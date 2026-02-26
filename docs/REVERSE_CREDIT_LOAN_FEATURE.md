# Reverse Credit Loan Feature

## Overview
This feature allows administrators to reverse unauthorized or erroneous credit loan transactions. When a credit loan is reversed, the amount is deducted from the user's wallet and a reversal transaction is recorded for audit purposes.

**Key Features:**
- ✅ Reverse individual credit loans with one click
- ✅ Net credit calculations (loans minus reversals)
- ✅ Visual indicators for reversed transactions
- ✅ Prevents duplicate reversals
- ✅ Proper Net Worth calculations including reversals

## Implementation Details

### Database Migration
**File:** `supabase/migrations/20250226000000_add_reverse_credit_loan.sql`

- Adds `credit_loan_reversal` transaction type to the `wallet_transactions` table
- Creates `reverse_credit_loan()` RPC function that:
  - Validates the transaction exists and is of type `credit_loan`
  - Checks if the user has sufficient balance to reverse the loan
  - Creates a reversal transaction with negative amount
  - Updates the user's wallet balance by deducting the loan amount
  - Records the reversal with reference to the original transaction

### Backend Service
**File:** `src/shared/lib/services/admin.service.ts`

**Updated `getCreditLoans()` method:**
- Returns `is_reversed` flag for each loan
- Checks if loan has been reversed by looking for matching reversal transaction
- Marks reversed loans so UI can display appropriate status

**Updated `getCreditLoanSummary()` method:**
- Calculates NET credit (loans minus reversals)
- Includes both `credit_loan` and `credit_loan_reversal` transactions
- Reversal amounts are negative, so they automatically subtract from totals
- Filters out users with zero or negative net credit
- Returns only users with active outstanding credit

**Added `reverseCreditLoan()` method:**
- Takes a transaction ID as parameter
- Calls the `reverse_credit_loan` RPC function
- Logs the admin action for audit trail
- Handles errors appropriately

### Frontend Component
**File:** `src/features/admin/components/CreditWalletPanel.tsx`

Enhanced the Credit Loan History table:
- Added `is_reversed` property to `CreditLoan` type
- Each credit loan transaction has a trash icon button in Actions column
- Reversed transactions show a "Reversed" badge instead of delete button
- Clicking the delete button shows a confirmation dialog
- Shows loading state during reversal (spinning icon)
- Displays success/error toast notifications
- Automatically refreshes data after successful reversal
- Summary cards show NET credit (total minus reversals)
- Per-user breakdown shows only users with positive net credit

**New Features:**
- **Searchable User Dropdown**: Implemented Command component with search functionality
- **Alphabetically Sorted Users**: Users are sorted by display name (first name + last name or email)
- **Enhanced Summary Cards**: 
  - "Total Credit Extended" - Net amount of credit currently loaned
  - "Users with Credit" - Count of users with active credit
  - "Total Transactions" - All credit operations (blue)
  - "Active Loans" - Count of non-reversed loans (green)
  - "Reversed Loans" - Count of reversed transactions (amber)
  - 5-column grid on laptop, 2-column grid on mobile for optimal viewing
- **Real-time Search**: Filter users as you type in the dropdown
- **Better UX**: Shows user's full name with email below in the dropdown

## Usage

1. **Navigate** to the Admin Panel > Credit Wallet section
2. **Locate** the credit loan transaction you want to reverse in the "Credit Loan History" table
3. **Click** the trash icon button in the "Actions" column
4. **Confirm** the reversal in the confirmation dialog
5. **Wait** for the operation to complete
6. **Verify** the transaction now shows "Reversed" badge
7. **Check** that summary cards reflect the net credit amounts

## How It Works

### Credit Calculation
- **Total Credit Extended** = Sum of all credit_loan transactions MINUS sum of all credit_loan_reversal transactions
- **Users with Credit** = Count of users with positive net credit (after reversals)
- **Per-User Breakdown** = Shows only users with net positive credit

### Reversal Process
1. Admin clicks trash icon on a credit loan
2. System checks if user has sufficient wallet balance
3. If yes: Creates a `credit_loan_reversal` transaction with negative amount
4. Updates user's wallet balance (deducts the loan amount)
5. Original loan remains in history but is marked as "Reversed"
6. Summary calculations automatically update to show net amounts

### Visual Indicators
- **Active Loans**: Show red trash icon button
- **Reversed Loans**: Show gray "Reversed" badge (no button)
- **Net Worth Module**: Properly reflects credit balance after reversals

## Safety Features

### Validation
- Only transactions of type `credit_loan` can be reversed
- User must have sufficient wallet balance to cover the reversal
- Confirmation dialog prevents accidental reversals

### Audit Trail
- All reversals are logged as admin actions
- Reversal transactions are recorded separately with type `credit_loan_reversal`
- Original transaction remains in the database for historical record

### Error Handling
- Clear error messages if user has insufficient balance
- Transaction not found errors if invalid ID is provided
- All errors are displayed to the admin via toast notifications

## Database Schema Changes

### New Transaction Type
```sql
CHECK (type IN ('deposit', 'purchase', 'sale', 'refund', 'adjustment', 'credit_loan', 'credit_loan_reversal'))
```

### New RPC Function
```sql
reverse_credit_loan(p_transaction_id bigint) RETURNS void
```

## Security Considerations

- Function uses `SECURITY DEFINER` to run with elevated privileges
- Only accessible through the admin service (requires admin authentication)
- All actions are logged for audit purposes
- Balance validation prevents over-deduction

## Deployment Checklist

- [ ] Apply database migration: `supabase/migrations/20250226000000_add_reverse_credit_loan.sql`
- [ ] Deploy backend service changes
- [ ] Deploy frontend component changes
- [ ] Test reversal with sufficient balance
- [ ] Test reversal with insufficient balance (should fail gracefully)
- [ ] Verify audit logs are created
- [ ] Verify wallet balance calculations are correct

## Testing Scenarios

1. **Successful Reversal**
   - User has sufficient balance
   - Transaction exists and is of type `credit_loan`
   - Expected: Reversal succeeds, balance deducted, reversal transaction created

2. **Insufficient Balance**
   - User's current balance is less than loan amount
   - Expected: Error message displayed, no changes to wallet

3. **Invalid Transaction**
   - Transaction ID doesn't exist or is not a `credit_loan`
   - Expected: Error message displayed

4. **Concurrent Reversals**
   - Multiple admins attempt to reverse the same transaction
   - Expected: First reversal succeeds, subsequent attempts may fail due to insufficient balance

## Related Files

- `supabase/migrations/20250225000000_add_credit_loan.sql` - Original credit loan feature
- `src/shared/lib/services/users.service.ts` - User wallet credit service
- `docs/CREDIT_WALLET_MIGRATION.md` - Original credit wallet documentation
