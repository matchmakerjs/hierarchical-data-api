import { ConstructorFunction, DIContainer, Inject, Injectable, InjectionToken } from '@matchmakerjs/di';
import { RequestMetadata } from '@matchmakerjs/matchmaker-security';
import { Transactional } from '@matchmakerjs/matchmaker-typeorm';
import { EntityManager } from 'typeorm';
import { ItemRelationship } from '../data/entities/item-relationship.entity';
import { Item } from '../data/entities/item.entity';

@Injectable()
export class ItemRelationshipService {
    constructor(
        private entityManager: EntityManager,
        @Inject(InjectionToken.container) private container: DIContainer,
    ) {}

    @Transactional()
    async createRelationships(entity: Item, parent: Item, ancestors: ItemRelationship[]): Promise<ItemRelationship[]> {
        if (!parent) return;
        const requestMetadata = this.container.getInstance(RequestMetadata as ConstructorFunction<RequestMetadata>);
        const relations: ItemRelationship[] = [];

        const parentRelationship = new ItemRelationship();
        parentRelationship.descendant = entity;
        parentRelationship.ancestor = parent;
        parentRelationship.distance = 0;
        parentRelationship.audit.createdBy = requestMetadata.userId;
        await this.entityManager.save(parentRelationship);
        entity.parentId = parent.id;
        relations.push(parentRelationship);

        for (const ancestor of ancestors) {
            if (ancestor.descendant.id !== parent.id) {
                continue;
            }
            const parentLocation = new ItemRelationship();
            parentLocation.descendant = entity;
            parentLocation.ancestor = ancestor.ancestor;
            parentLocation.derivedFrom = ancestor;
            parentLocation.distance = ancestor.distance + 1;
            parentLocation.audit.createdBy = requestMetadata.userId;
            await this.entityManager.save(parentLocation);
            relations.push(parentLocation);
        }
        entity.ancestors = relations.sort((a, b) => a.distance - b.distance).map((it) => it.ancestor);
        return relations;
    }

    async getLineage(ids: string[]): Promise<ItemRelationship[]> {
        if (!ids?.length) {
            return [];
        }
        return this.entityManager
            .createQueryBuilder(ItemRelationship, 'a_c')
            .innerJoinAndSelect('a_c.ancestor', 'a')
            .innerJoinAndSelect('a_c.descendant', 'c')
            .leftJoinAndSelect('a_c.derivedFrom', 'df')
            .where('(df.id IS NULL OR df.deactivatedAt IS NULL)')
            .andWhere('(a.id IN (:...ids) OR c.id IN (:...ids))', { ids })
            .orderBy('a_c.distance', 'ASC')
            .getMany();
    }

    async getAncestors(ids: string[]): Promise<ItemRelationship[]> {
        if (!ids?.length) {
            return [];
        }
        return this.entityManager
            .createQueryBuilder(ItemRelationship, 'a_c')
            .innerJoinAndSelect('a_c.ancestor', 'a')
            .innerJoinAndSelect('a_c.descendant', 'c')
            .leftJoin('a_c.derivedFrom', 'df')
            .where('(df.id IS NULL OR df.deactivatedAt IS NULL)')
            .andWhere('c.id IN (:...ids)', { ids })
            .orderBy('a_c.distance', 'ASC')
            .getMany();
    }

    async getParents(ids: string[]): Promise<ItemRelationship[]> {
        if (!ids?.length) {
            return;
        }
        return this.entityManager
            .createQueryBuilder(ItemRelationship, 'a_c')
            .innerJoinAndSelect('a_c.ancestor', 'a')
            .innerJoinAndSelect('a_c.descendant', 'c')
            .leftJoin('a_c.derivedFrom', 'df')
            .where('df.id IS NULL')
            .andWhere('c.id IN (:...ids)', { ids })
            .getMany();
    }

    async getChildren(ids: string[]): Promise<ItemRelationship[]> {
        if (!ids?.length) {
            return;
        }
        return this.entityManager
            .createQueryBuilder(ItemRelationship, 'a_c')
            .innerJoinAndSelect('a_c.ancestor', 'a')
            .innerJoinAndSelect('a_c.descendant', 'c')
            .leftJoin('a_c.derivedFrom', 'df')
            .where('df.id IS NULL')
            .andWhere('a.id IN (:...ids)', { ids })
            .getMany();
    }

    async countChildren(ids: string[]): Promise<{ [key: string]: number }> {
        const response: { [key: string]: number } = {};
        if (!ids?.length) {
            return response;
        }
        const results = await this.entityManager
            .createQueryBuilder(ItemRelationship, 'a_c')
            .innerJoinAndSelect('a_c.ancestor', 'a')
            .innerJoinAndSelect('a_c.descendant', 'c')
            .leftJoin('a_c.derivedFrom', 'df')
            .where('(df.id IS NULL)')
            .andWhere('a.id IN (:...ids)', { ids })
            .select('a.id', 'id')
            .addSelect('COUNT(DISTINCT c.id)', 'value')
            .groupBy('a.id')
            .getRawMany<{ id: string; value: number }>();
        results.forEach((it) => (response[it.id] = it.value));
        return response;
    }
}
