import {
  ConstructorFunction,
  DIContainer,
  Inject,
  Injectable,
  InjectionToken,
} from "@matchmakerjs/di";
import { ErrorResponse } from "@matchmakerjs/matchmaker";
import { RequestMetadata } from "@matchmakerjs/matchmaker-security";
import { Transactional } from "@matchmakerjs/matchmaker-typeorm";
import { EntityManager } from "typeorm";
import { ItemApiRequest } from "../data/dto/requests/item.request";
import { ItemRelationship } from "../data/entities/item-relationship.entity";
import { Item } from "../data/entities/item.entity";
import { StringUtils } from "../utils/string.util";
import { ItemRelationshipService } from "./item-relationship.service";

@Injectable()
export class ItemService {
  constructor(
    private entityManager: EntityManager,
    private relationshipService: ItemRelationshipService,
    @Inject(InjectionToken.container) private container: DIContainer
  ) {}

  @Transactional()
  async createItem(data: ItemApiRequest): Promise<Item> {
    const parent =
      data.parentId &&
      (await this.entityManager
        .getRepository(Item)
        .findOneBy({ id: data.parentId }));
    if (data.parentId && !parent) {
      throw new ErrorResponse(400, {
        message: `Invalid parent id: ${data.parentId}`,
      });
    }
    return this.createItemAndRelationships(
      data,
      parent,
      await this.relationshipService.getAncestors([data.parentId])
    );
  }

  @Transactional()
  async updateItem(entity: Item, data: ItemApiRequest): Promise<void> {
    const requestMetadata = this.container.getInstance(
      RequestMetadata as ConstructorFunction<RequestMetadata>
    );
    const lineage = await this.relationshipService.getLineage([entity.id]);
    const currentAncestors = lineage.filter((it) => it.source.id === entity.id);
    if (
      (!currentAncestors.length && data.parentId) ||
      (currentAncestors.length &&
        (!data.parentId || currentAncestors[0].target.id !== data.parentId))
    ) {
      const parent =
        data.parentId &&
        (await this.entityManager
          .getRepository(Item)
          .findOneBy({ id: data.parentId }));
      if (data.parentId && !parent) {
        throw new ErrorResponse(400, {
          message: `Invalid parent id: ${data.parentId}`,
        });
      }
      await this.applyNewParent(
        entity,
        parent,
        currentAncestors,
        lineage.filter((it) => it.target.id === entity.id)
      );
    } else {
      entity.ancestors = currentAncestors
        .sort((a, b) => a.distance - b.distance)
        .map((it) => it.target);
    }
    entity.name = StringUtils.normalizeSpace(data.name);
    entity.description = StringUtils.normalizeSpace(data.description);
    entity.audit.lastUpdatedBy = requestMetadata.userId;
    await this.entityManager.save(entity);
  }

  @Transactional()
  async deleteItem(entity: Item): Promise<void> {
    const requestMetadata = this.container.getInstance(
      RequestMetadata as ConstructorFunction<RequestMetadata>
    );
    entity.audit.deactivatedBy = requestMetadata.userId;
    const now = new Date();
    entity.audit.deactivatedAt = now;
    await this.entityManager.save(entity);
    const children = this.entityManager
      .createQueryBuilder(ItemRelationship, "ac")
      .leftJoin("ac.source", "c")
      .where(`ac.target = :id`)
      .select("c.id")
      .getSql();
    await this.entityManager
      .createQueryBuilder(Item, "c")
      .update()
      .setParameter("id", entity.id)
      .where(`id IN (${children})`)
      .set({
        audit: {
          deactivatedAt: now,
          deactivatedBy: requestMetadata.userId,
        },
      })
      .callListeners(false)
      .execute();
  }

  private async applyNewParent(
    entity: Item,
    newParent: Item,
    relationshipWithAncestors: ItemRelationship[],
    relationshipWithDescendants: ItemRelationship[]
  ) {
    const requestMetadata = this.container.getInstance(
      RequestMetadata as ConstructorFunction<RequestMetadata>
    );

    const newAncestors = !newParent
      ? []
      : await this.relationshipService.getAncestors([newParent.id]);
    if (newAncestors.findIndex((it) => it.target.id === entity.id) >= 0) {
      throw new ErrorResponse(400, {
        message: `Category ${newParent.name} is a sub-category of ${entity.name}`,
      });
    }
    const descendantIds = relationshipWithDescendants.map((it) => it.source.id);
    if (relationshipWithAncestors.length) {
      await this.entityManager
        .createQueryBuilder()
        .update(ItemRelationship)
        .set({
          audit: {
            deactivatedAt: new Date(),
            deactivatedBy: requestMetadata.userId,
          },
        })
        .where("target IN (:...ancestors)", {
          ancestors: relationshipWithAncestors.map((it) => it.target.id),
        })
        .andWhere("source IN (:...descendants)", {
          descendants: [entity.id, ...descendantIds],
        })
        .callListeners(false)
        .execute();
    }

    if (newParent) {
      const relationships = await this.relationshipService.createRelationships(
        entity,
        newParent,
        newAncestors
      );
      for (const descendantRelationship of relationshipWithDescendants) {
        for (const ancestorRelationship of relationships) {
          const relationship = new ItemRelationship();
          relationship.target = ancestorRelationship.target;
          relationship.source = descendantRelationship.source;
          relationship.derivedFrom =
            descendantRelationship.derivedFrom || descendantRelationship;
          relationship.distance =
            descendantRelationship.distance + ancestorRelationship.distance + 1;
          await this.entityManager.save(relationship);
        }
      }
    }
  }

  private async createItemAndRelationships(
    data: ItemApiRequest,
    parent: Item,
    ancestors: ItemRelationship[]
  ) {
    const requestMetadata = this.container.getInstance(
      RequestMetadata as ConstructorFunction<RequestMetadata>
    );

    const entity = new Item();
    entity.name = StringUtils.normalizeSpace(data.name);
    entity.description = StringUtils.normalizeSpace(data.description);
    entity.audit.createdBy = requestMetadata.userId;
    await this.entityManager.save(entity);
    await this.relationshipService.createRelationships(
      entity,
      parent,
      ancestors
    );
    return entity;
  }

  async getCategories(ids: string[]): Promise<Item[]> {
    if (!ids?.length) {
      return [];
    }
    return this.entityManager
      .createQueryBuilder(Item, "l")
      .where("l.id IN (:...ids)", { ids })
      .getMany();
  }

  async loadFully(items: Item[]) {
    if (!items?.length) return;

    const ancestors = await this.relationshipService.getAncestors(
      items.map((it) => it.id)
    );
    const sibblings = await this.relationshipService.getChildren(
      ancestors.filter((it) => it.distance === 0).map((it) => it.target.id)
    );

    items.forEach((item) => {
      item.ancestors = ancestors
        .filter((it) => it.source.id === item.id)
        .sort((a, b) => a.distance - b.distance)
        .map((it) => it.target);
      for (let i = 0; i < item.ancestors.length - 1; i++) {
        item.ancestors[i].parentId = item.ancestors[i + 1].id;
      }
      if (item.ancestors?.length) {
        item.parentId = item.ancestors[0].id;
        item.sibblings = sibblings
          .filter(
            (it) =>
              it.source.id !== item.id && it.target.id === item.ancestors[0].id
          )
          .map((it) => {
            it.source.parentId = it.target.id;
            return it.source;
          });
      }
    });
  }

  async getItemOrThrow(id: string) {
    const entity = await this.entityManager.findOneBy(Item, { id });
    if (!entity) {
      throw new ErrorResponse(400, {
        message: `Invalid id ${id}`,
      });
    }
    return entity;
  }
}
