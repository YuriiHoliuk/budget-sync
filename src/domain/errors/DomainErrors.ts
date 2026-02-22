/**
 * Domain-specific errors for business rule violations.
 *
 * These errors represent domain-level problems that occur when
 * business rules cannot be satisfied or entities are not found.
 */

/**
 * Base class for all domain errors.
 * Provides consistent error structure across the domain layer.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper stack trace for where error was thrown (V8 engines)
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Thrown when an account cannot be found by its identifier.
 */
export class AccountNotFoundError extends DomainError {
  constructor(
    public readonly identifier: string,
    public readonly identifierType: 'externalId' | 'id' | 'iban' = 'externalId',
  ) {
    super(`Account not found with ${identifierType}: ${identifier}`);
  }
}

/**
 * Thrown when a budget cannot be found by its identifier.
 */
export class BudgetNotFoundError extends DomainError {
  constructor(public readonly budgetId: number) {
    super(`Budget not found with id: ${budgetId}`);
  }
}

/**
 * Thrown when attempting to create a budget with a name that already exists.
 */
export class BudgetNameTakenError extends DomainError {
  constructor(public readonly budgetName: string) {
    super(`Budget with name "${budgetName}" already exists`);
  }
}

/**
 * Thrown when a category cannot be found by its identifier.
 */
export class CategoryNotFoundError extends DomainError {
  constructor(public readonly categoryId: number) {
    super(`Category not found with id: ${categoryId}`);
  }
}

/**
 * Thrown when attempting to create a category with a name that already exists.
 */
export class CategoryNameTakenError extends DomainError {
  constructor(public readonly categoryName: string) {
    super(`Category with name "${categoryName}" already exists`);
  }
}

/**
 * Thrown when a parent category referenced by name does not exist.
 */
export class ParentCategoryNotFoundError extends DomainError {
  constructor(public readonly parentName: string) {
    super(`Parent category "${parentName}" not found`);
  }
}

/**
 * Thrown when a transaction cannot be found by its identifier.
 */
export class TransactionNotFoundError extends DomainError {
  constructor(public readonly transactionId: number | string) {
    super(`Transaction not found with id: ${transactionId}`);
  }
}

/**
 * Thrown when an allocation cannot be found by its identifier.
 */
export class AllocationNotFoundError extends DomainError {
  constructor(public readonly allocationId: number) {
    super(`Allocation not found with id: ${allocationId}`);
  }
}

/**
 * Thrown when an external service (bank gateway, API) enforces rate limiting.
 * Use this in the application layer for retry logic.
 */
export class RateLimitError extends DomainError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
  }
}

/**
 * Thrown when attempting to update protected fields on a synced account.
 * Synced accounts (source = 'bank_sync') have protected fields that cannot be modified.
 */
export class ProtectedFieldUpdateError extends DomainError {
  constructor(
    public readonly fieldName: string,
    public readonly accountId: number,
  ) {
    super(
      `Cannot modify protected field "${fieldName}" on synced account (id: ${accountId})`,
    );
  }
}

/**
 * Thrown when attempting to create an account with a name that already exists.
 */
export class AccountNameTakenError extends DomainError {
  constructor(public readonly accountName: string) {
    super(`Account with name "${accountName}" already exists`);
  }
}

/**
 * Thrown when attempting to manually create a transaction on a synced account.
 * Synced accounts (source = 'bank_sync') can only receive transactions via bank sync.
 */
export class ManualTransactionNotAllowedError extends DomainError {
  constructor(public readonly accountId: number) {
    super(
      `Manual transactions are not allowed on synced accounts (id: ${accountId}). Only manual accounts support manually created transactions.`,
    );
  }
}

/**
 * Thrown when a budget's end date is set to a date before the current month.
 */
export class InvalidBudgetEndDateError extends DomainError {
  constructor(
    public readonly endDate: string,
    public readonly minDate: string,
  ) {
    super(`End date ${endDate} is before the minimum allowed date ${minDate}`);
  }
}

/**
 * Thrown when a budget group cannot be found by its identifier.
 */
export class BudgetGroupNotFoundError extends DomainError {
  constructor(public readonly groupId: number) {
    super(`Budget group not found with id: ${groupId}`);
  }
}

/**
 * Thrown when attempting to create a budget group with an empty name.
 */
export class BudgetGroupNameEmptyError extends DomainError {
  constructor() {
    super('Budget group name cannot be empty');
  }
}

/**
 * Thrown when a rule cannot be found by its identifier.
 */
export class RuleNotFoundError extends DomainError {
  constructor(public readonly ruleId: number) {
    super(`Rule not found with id: ${ruleId}`);
  }
}

/**
 * Thrown when attempting to convert a transaction that is already a transfer.
 */
export class TransactionAlreadyTransferError extends DomainError {
  constructor(public readonly transactionId: number) {
    super(`Transaction ${transactionId} is already a transfer`);
  }
}

/**
 * Thrown when the source transaction currency doesn't match the destination account currency.
 */
export class CurrencyMismatchError extends DomainError {
  constructor(
    public readonly transactionCurrency: string,
    public readonly accountCurrency: string,
  ) {
    super(
      `Currency mismatch: transaction is ${transactionCurrency} but destination account is ${accountCurrency}`,
    );
  }
}

/**
 * Thrown when trying to revert a transfer that was auto-detected (not manually created).
 */
export class TransferRevertNotAllowedError extends DomainError {
  constructor(public readonly transactionId: number) {
    super(
      `Cannot revert transfer for transaction ${transactionId}: only manually converted transfers can be reverted`,
    );
  }
}

/**
 * Thrown when the returning transaction is not a credit transaction.
 */
export class ReturningTransactionNotCreditError extends DomainError {
  constructor(public readonly transactionId: number) {
    super(
      `Transaction ${transactionId} must be a credit transaction to mark as returning`,
    );
  }
}

/**
 * Thrown when the original transaction is not a debit transaction.
 */
export class OriginalTransactionNotDebitError extends DomainError {
  constructor(public readonly transactionId: number) {
    super(
      `Transaction ${transactionId} must be a debit transaction to be the original expense`,
    );
  }
}

/**
 * Thrown when the returning amount exceeds the original transaction amount.
 */
export class ReturningAmountExceedsOriginalError extends DomainError {
  constructor(
    public readonly returningAmount: number,
    public readonly originalAmount: number,
  ) {
    super(
      `Returning amount (${returningAmount}) exceeds original amount (${originalAmount})`,
    );
  }
}

/**
 * Thrown when attempting to mark a transfer transaction as returning.
 */
export class TransactionIsTransferError extends DomainError {
  constructor(public readonly transactionId: number) {
    super(
      `Transaction ${transactionId} is a transfer and cannot be marked as returning`,
    );
  }
}

/**
 * Thrown when the returning and original transactions belong to different accounts.
 */
export class ReturningAccountMismatchError extends DomainError {
  constructor(
    public readonly returningAccountId: number,
    public readonly originalAccountId: number,
  ) {
    super(
      `Returning transaction (account ${returningAccountId}) and original transaction (account ${originalAccountId}) must belong to the same account`,
    );
  }
}

/**
 * Thrown when trying to revert a return that has no credit bank transactions linked.
 */
export class NoReturningBankTransactionsError extends DomainError {
  constructor(public readonly transactionId: number) {
    super(
      `Transaction ${transactionId} has no returning bank transactions to revert`,
    );
  }
}

/**
 * Thrown when the total amount of split parts exceeds the original transaction amount.
 */
export class SplitAmountExceedsOriginalError extends DomainError {
  constructor(
    public readonly splitTotal: number,
    public readonly originalAmount: number,
  ) {
    super(
      `Total split amount (${splitTotal}) exceeds the original transaction amount (${originalAmount})`,
    );
  }
}

/**
 * Thrown when a split part has an amount that is zero or negative.
 */
export class SplitAmountMustBePositiveError extends DomainError {
  constructor(public readonly amount: number) {
    super(`Split amount must be positive, but got ${amount}`);
  }
}

/**
 * Thrown when splitting a transaction would leave a remainder that is zero or negative.
 */
export class SplitRemainderMustBePositiveError extends DomainError {
  constructor(
    public readonly remainder: number,
    public readonly originalAmount: number,
  ) {
    super(
      `Remainder after split (${remainder}) must be positive for original transaction amount (${originalAmount})`,
    );
  }
}

/**
 * Thrown when attempting to split a transfer transaction.
 * Transfers cannot be split because they represent linked movements between accounts.
 */
export class TransactionCannotBeSplitError extends DomainError {
  constructor(public readonly transactionId: number) {
    super(`Transaction ${transactionId} is a transfer and cannot be split`);
  }
}

/**
 * Thrown when attempting to join transactions that do not share the same bank transaction.
 * Only sibling transactions (originating from the same bank transaction) can be joined.
 */
export class JoinTransactionsNotSiblingsError extends DomainError {
  constructor(
    public readonly sourceTransactionId: number,
    public readonly targetTransactionId: number,
  ) {
    super(
      `Transactions ${sourceTransactionId} and ${targetTransactionId} cannot be joined because they do not share the same bank transaction`,
    );
  }
}

/**
 * Thrown when attempting to join a transaction with itself.
 */
export class JoinTransactionCannotBeSelfError extends DomainError {
  constructor(public readonly transactionId: number) {
    super(`Transaction ${transactionId} cannot be joined with itself`);
  }
}

/**
 * Thrown when attempting to join into a target transaction that is a transfer.
 * Transfer transactions cannot be the target of a join operation.
 */
export class JoinTargetIsTransferError extends DomainError {
  constructor(public readonly targetTransactionId: number) {
    super(
      `Cannot join into transaction ${targetTransactionId} because it is a transfer`,
    );
  }
}
