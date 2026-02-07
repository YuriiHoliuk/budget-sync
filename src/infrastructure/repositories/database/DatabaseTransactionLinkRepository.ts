import type {
  LinkType,
  TransactionLink,
} from '@domain/entities/TransactionLink.ts';
import type { TransactionLinkRepository } from '@domain/repositories/TransactionLinkRepository.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import {
  transactionLinkMembers,
  transactionLinks,
  transactions,
} from '@modules/database/schema/index.ts';
import { eq, inArray } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import {
  DatabaseTransactionLinkMapper,
  type TransactionLinkMemberRow,
  type TransactionLinkRow,
  type TransactionLinkWithMembers,
} from '../../mappers/DatabaseTransactionLinkMapper.ts';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

@injectable()
export class DatabaseTransactionLinkRepository
  implements TransactionLinkRepository
{
  private readonly mapper = new DatabaseTransactionLinkMapper();

  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  findById(id: string): Promise<TransactionLink | null> {
    return this.findByLinkId(id);
  }

  async findByLinkId(linkId: string): Promise<TransactionLink | null> {
    const dbId = Number.parseInt(linkId, 10);
    if (Number.isNaN(dbId)) {
      return null;
    }

    const linkData = await this.fetchLinkWithMembers(dbId);
    return linkData ? this.mapper.toEntity(linkData) : null;
  }

  async findAll(): Promise<TransactionLink[]> {
    const linkRows = await this.db.select().from(transactionLinks);
    return this.fetchMembersForLinks(linkRows);
  }

  async findByTransactionId(transactionId: string): Promise<TransactionLink[]> {
    const transactionDbId = await this.resolveTransactionDbId(transactionId);
    if (transactionDbId === null) {
      return [];
    }

    const memberRows = await this.db
      .select({ linkId: transactionLinkMembers.linkId })
      .from(transactionLinkMembers)
      .where(eq(transactionLinkMembers.transactionId, transactionDbId));

    if (memberRows.length === 0) {
      return [];
    }

    const linkIds = [...new Set(memberRows.map((row) => row.linkId))];
    const linkRows = await this.db
      .select()
      .from(transactionLinks)
      .where(inArray(transactionLinks.id, linkIds));

    return this.fetchMembersForLinks(linkRows);
  }

  async findAllByType(linkType: LinkType): Promise<TransactionLink[]> {
    const linkRows = await this.db
      .select()
      .from(transactionLinks)
      .where(eq(transactionLinks.linkType, linkType));

    return this.fetchMembersForLinks(linkRows);
  }

  async save(link: TransactionLink): Promise<void> {
    await this.saveAndReturn(link);
  }

  async saveAndReturn(link: TransactionLink): Promise<TransactionLink> {
    const insertData = this.mapper.toInsert(link);

    const [insertedLink] = await this.db
      .insert(transactionLinks)
      .values(insertData)
      .returning();

    if (!insertedLink) {
      throw new Error('Failed to insert transaction link');
    }

    const transactionDbIds = await this.resolveTransactionDbIds(
      link.members.map((member) => member.transactionId),
    );

    const memberInserts = this.mapper.toMemberInserts(
      insertedLink.id,
      link.members,
      transactionDbIds,
    );

    await this.db.insert(transactionLinkMembers).values(memberInserts);

    const savedLinkData = await this.fetchLinkWithMembers(insertedLink.id);
    if (!savedLinkData) {
      throw new Error('Failed to fetch saved transaction link');
    }

    return this.mapper.toEntity(savedLinkData);
  }

  async update(link: TransactionLink): Promise<void> {
    const dbId = link.dbId;
    if (dbId === null) {
      throw new Error('Cannot update link without dbId');
    }

    await this.db
      .update(transactionLinks)
      .set({
        linkType: link.linkType,
        notes: link.notes ?? null,
      })
      .where(eq(transactionLinks.id, dbId));

    await this.db
      .delete(transactionLinkMembers)
      .where(eq(transactionLinkMembers.linkId, dbId));

    const transactionDbIds = await this.resolveTransactionDbIds(
      link.members.map((member) => member.transactionId),
    );

    const memberInserts = this.mapper.toMemberInserts(
      dbId,
      link.members,
      transactionDbIds,
    );

    if (memberInserts.length > 0) {
      await this.db.insert(transactionLinkMembers).values(memberInserts);
    }
  }

  async delete(id: string): Promise<void> {
    const dbId = Number.parseInt(id, 10);
    if (Number.isNaN(dbId)) {
      return;
    }

    await this.db.delete(transactionLinks).where(eq(transactionLinks.id, dbId));
  }

  private async fetchLinkWithMembers(
    linkDbId: number,
  ): Promise<TransactionLinkWithMembers | null> {
    const linkRows = await this.db
      .select()
      .from(transactionLinks)
      .where(eq(transactionLinks.id, linkDbId))
      .limit(1);

    const linkRow = linkRows[0];
    if (!linkRow) {
      return null;
    }

    const memberRows = await this.fetchMemberRowsWithTransactionIds([linkDbId]);
    const members = memberRows.filter((row) => row.linkId === linkDbId);

    return { link: linkRow, members };
  }

  private async fetchMembersForLinks(
    linkRows: TransactionLinkRow[],
  ): Promise<TransactionLink[]> {
    if (linkRows.length === 0) {
      return [];
    }

    const linkIds = linkRows.map((row) => row.id);
    const memberRows = await this.fetchMemberRowsWithTransactionIds(linkIds);

    const membersByLinkId = this.groupMembersByLinkId(memberRows);

    return linkRows.map((linkRow) =>
      this.mapper.toEntity({
        link: linkRow,
        members: membersByLinkId.get(linkRow.id) ?? [],
      }),
    );
  }

  private async fetchMemberRowsWithTransactionIds(
    linkIds: number[],
  ): Promise<TransactionLinkMemberRow[]> {
    const rows = await this.db
      .select({
        id: transactionLinkMembers.id,
        linkId: transactionLinkMembers.linkId,
        transactionId: transactionLinkMembers.transactionId,
        role: transactionLinkMembers.role,
        transactionExternalId: transactions.externalId,
      })
      .from(transactionLinkMembers)
      .leftJoin(
        transactions,
        eq(transactionLinkMembers.transactionId, transactions.id),
      )
      .where(inArray(transactionLinkMembers.linkId, linkIds));

    return rows;
  }

  private groupMembersByLinkId(
    memberRows: TransactionLinkMemberRow[],
  ): Map<number, TransactionLinkMemberRow[]> {
    const membersByLinkId = new Map<number, TransactionLinkMemberRow[]>();

    for (const row of memberRows) {
      const existing = membersByLinkId.get(row.linkId) ?? [];
      existing.push(row);
      membersByLinkId.set(row.linkId, existing);
    }

    return membersByLinkId;
  }

  private async resolveTransactionDbId(
    externalId: string,
  ): Promise<number | null> {
    const numericId = Number.parseInt(externalId, 10);
    if (!Number.isNaN(numericId)) {
      const rows = await this.db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.id, numericId))
        .limit(1);

      if (rows[0]) {
        return rows[0].id;
      }
    }

    const rows = await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.externalId, externalId))
      .limit(1);

    return rows[0]?.id ?? null;
  }

  private async resolveTransactionDbIds(
    externalIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    if (externalIds.length === 0) {
      return result;
    }

    const rows = await this.db
      .select({ id: transactions.id, externalId: transactions.externalId })
      .from(transactions)
      .where(inArray(transactions.externalId, externalIds));

    for (const row of rows) {
      if (row.externalId) {
        result.set(row.externalId, row.id);
      }
    }

    return result;
  }
}
