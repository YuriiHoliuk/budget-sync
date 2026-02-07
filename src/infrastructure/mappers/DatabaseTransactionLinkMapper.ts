import {
  type LinkType,
  type MemberRole,
  parseLinkType,
  parseMemberRole,
  TransactionLink,
  type TransactionLinkMember,
} from '@domain/entities/TransactionLink.ts';

/**
 * Row type from the transaction_links table.
 */
export interface TransactionLinkRow {
  id: number;
  linkType: string;
  notes: string | null;
  createdAt: Date | null;
}

/**
 * Row type from the transaction_link_members table joined with transactions.
 */
export interface TransactionLinkMemberRow {
  id: number;
  linkId: number;
  transactionId: number;
  role: string;
  transactionExternalId?: string | null;
}

/**
 * Insert type for the transaction_links table.
 */
export interface NewTransactionLinkRow {
  linkType: string;
  notes: string | null;
}

/**
 * Insert type for the transaction_link_members table.
 */
export interface NewTransactionLinkMemberRow {
  linkId: number;
  transactionId: number;
  role: string;
}

/**
 * Combined link and members data for mapping to entity.
 */
export interface TransactionLinkWithMembers {
  link: TransactionLinkRow;
  members: TransactionLinkMemberRow[];
}

/**
 * Maps between database rows and TransactionLink domain entities.
 */
export class DatabaseTransactionLinkMapper {
  toEntity(data: TransactionLinkWithMembers): TransactionLink {
    const members = this.mapMembers(data.members);
    const linkType = this.parseLinkTypeOrThrow(data.link.linkType);

    return TransactionLink.create(
      {
        linkType,
        notes: data.link.notes ?? undefined,
        members,
        createdAt: data.link.createdAt ?? undefined,
        dbId: data.link.id,
      },
      String(data.link.id),
    );
  }

  toInsert(link: TransactionLink): NewTransactionLinkRow {
    return {
      linkType: link.linkType,
      notes: link.notes ?? null,
    };
  }

  toMemberInserts(
    linkDbId: number,
    members: TransactionLinkMember[],
    transactionDbIds: Map<string, number>,
  ): NewTransactionLinkMemberRow[] {
    return members.map((member) => {
      const transactionDbId = transactionDbIds.get(member.transactionId);
      if (transactionDbId === undefined) {
        throw new Error(
          `Transaction with external ID ${member.transactionId} not found in database`,
        );
      }
      return {
        linkId: linkDbId,
        transactionId: transactionDbId,
        role: member.role,
      };
    });
  }

  private mapMembers(
    rows: TransactionLinkMemberRow[],
  ): TransactionLinkMember[] {
    return rows.map((row) => ({
      transactionId: row.transactionExternalId ?? String(row.transactionId),
      role: this.parseMemberRoleOrThrow(row.role),
    }));
  }

  private parseLinkTypeOrThrow(value: string): LinkType {
    const parsed = parseLinkType(value);
    if (!parsed) {
      throw new Error(`Invalid link type: ${value}`);
    }
    return parsed;
  }

  private parseMemberRoleOrThrow(value: string): MemberRole {
    const parsed = parseMemberRole(value);
    if (!parsed) {
      throw new Error(`Invalid member role: ${value}`);
    }
    return parsed;
  }
}
