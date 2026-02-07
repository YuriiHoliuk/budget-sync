import type {
  LinkType,
  MemberRole,
  TransactionLink,
  TransactionLinkMember,
} from '@domain/entities/TransactionLink.ts';

export const LINK_TYPE_TO_GQL: Record<LinkType, string> = {
  transfer: 'TRANSFER',
  split: 'SPLIT',
  refund: 'REFUND',
};

export const MEMBER_ROLE_TO_GQL: Record<MemberRole, string> = {
  source: 'SOURCE',
  outgoing: 'OUTGOING',
  incoming: 'INCOMING',
  part: 'PART',
  refund: 'REFUND',
};

export interface TransactionLinkMemberGql {
  transactionId: string;
  role: string;
}

export interface TransactionLinkGql {
  id: string;
  linkType: string;
  notes: string | null;
  members: TransactionLinkMemberGql[];
  createdAt: string;
}

function mapMemberToGql(
  member: TransactionLinkMember,
): TransactionLinkMemberGql {
  return {
    transactionId: member.transactionId,
    role: MEMBER_ROLE_TO_GQL[member.role] ?? 'SOURCE',
  };
}

export function mapTransactionLinkToGql(
  link: TransactionLink,
): TransactionLinkGql {
  return {
    id: link.id,
    linkType: LINK_TYPE_TO_GQL[link.linkType] ?? 'TRANSFER',
    notes: link.notes ?? null,
    members: link.members.map(mapMemberToGql),
    createdAt: link.createdAt.toISOString(),
  };
}
