/**
 * Types of transaction links that define how transactions are related.
 * - 'transfer': Links outgoing and incoming transactions between accounts
 * - 'split': Links a source transaction to multiple parts
 * - 'refund': Links an original transaction to its refund
 */
export type LinkType = 'transfer' | 'split' | 'refund';

const VALID_LINK_TYPES: readonly LinkType[] = ['transfer', 'split', 'refund'];

/**
 * Type guard to check if a string is a valid LinkType.
 */
export function isLinkType(value: string): value is LinkType {
  return VALID_LINK_TYPES.includes(value as LinkType);
}

/**
 * Parse a string to LinkType, returning undefined if invalid.
 */
export function parseLinkType(
  value: string | null | undefined,
): LinkType | undefined {
  if (value && isLinkType(value)) {
    return value;
  }
  return undefined;
}

/**
 * Role of a transaction within a link.
 * - 'source': The original transaction (for splits)
 * - 'outgoing': The debit side of a transfer
 * - 'incoming': The credit side of a transfer
 * - 'part': A portion of a split transaction
 * - 'refund': A refund transaction
 */
export type MemberRole = 'source' | 'outgoing' | 'incoming' | 'part' | 'refund';

const VALID_MEMBER_ROLES: readonly MemberRole[] = [
  'source',
  'outgoing',
  'incoming',
  'part',
  'refund',
];

/**
 * Type guard to check if a string is a valid MemberRole.
 */
export function isMemberRole(value: string): value is MemberRole {
  return VALID_MEMBER_ROLES.includes(value as MemberRole);
}

/**
 * Parse a string to MemberRole, returning undefined if invalid.
 */
export function parseMemberRole(
  value: string | null | undefined,
): MemberRole | undefined {
  if (value && isMemberRole(value)) {
    return value;
  }
  return undefined;
}

/**
 * A member of a transaction link with its role.
 */
export interface TransactionLinkMember {
  transactionId: string;
  role: MemberRole;
}

export interface TransactionLinkProps {
  linkType: LinkType;
  notes?: string;
  members: TransactionLinkMember[];
  createdAt?: Date;
  dbId?: number | null;
}

/**
 * TransactionLink entity represents a relationship between two or more transactions.
 *
 * Use cases:
 * - Transfers: Link outgoing (debit) and incoming (credit) transactions between accounts
 * - Splits: Link a source transaction to multiple parts for itemized categorization
 * - Refunds: Link an original purchase to its refund
 */
export class TransactionLink {
  private constructor(
    public readonly id: string,
    private readonly props: TransactionLinkProps,
  ) {}

  static create(props: TransactionLinkProps, id?: string): TransactionLink {
    const linkId = id ?? crypto.randomUUID();
    return new TransactionLink(linkId, {
      ...props,
      createdAt: props.createdAt ?? new Date(),
    });
  }

  get linkType(): LinkType {
    return this.props.linkType;
  }

  get notes(): string | undefined {
    return this.props.notes;
  }

  get members(): TransactionLinkMember[] {
    return this.props.members;
  }

  get createdAt(): Date {
    return this.props.createdAt ?? new Date();
  }

  get dbId(): number | null {
    return this.props.dbId ?? null;
  }

  /**
   * Get the outgoing (debit) transaction in a transfer link.
   */
  getOutgoingTransaction(): TransactionLinkMember | undefined {
    return this.props.members.find((member) => member.role === 'outgoing');
  }

  /**
   * Get the incoming (credit) transaction in a transfer link.
   */
  getIncomingTransaction(): TransactionLinkMember | undefined {
    return this.props.members.find((member) => member.role === 'incoming');
  }

  /**
   * Get the source transaction in a split link.
   */
  getSourceTransaction(): TransactionLinkMember | undefined {
    return this.props.members.find((member) => member.role === 'source');
  }

  /**
   * Get all part transactions in a split link.
   */
  getParts(): TransactionLinkMember[] {
    return this.props.members.filter((member) => member.role === 'part');
  }

  /**
   * Get the refund transaction in a refund link.
   */
  getRefundTransaction(): TransactionLinkMember | undefined {
    return this.props.members.find((member) => member.role === 'refund');
  }

  /**
   * Check if a transaction is part of this link.
   */
  hasTransaction(transactionId: string): boolean {
    return this.props.members.some(
      (member) => member.transactionId === transactionId,
    );
  }

  withDbId(dbId: number): TransactionLink {
    return TransactionLink.create({ ...this.props, dbId }, this.id);
  }
}
