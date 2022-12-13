import { Injectable } from "@matchmakerjs/di";
import { ErrorResponse } from "@matchmakerjs/matchmaker";
import { EntityManager } from "typeorm";
import { ItemFilter } from "../data/dto/filter/item.filter";
import { ItemRelationship } from "../data/entities/item-relationship.entity";
import { Item } from "../data/entities/item.entity";
import { ItemRelationshipService } from "../services/item-relationship.service";
import { ItemRelationshipDao } from "./item-relationship.dao";

@Injectable()
export class ItemDao {
  constructor(
    private entityManager: EntityManager,
    private entityRelationshipDao: ItemRelationshipDao,
    private itemRelationshipService: ItemRelationshipService
  ) {}

  createQuery(filter: ItemFilter, alias = "e") {
    const qb = this.entityManager.createQueryBuilder(Item, alias);

    qb.leftJoin(
      ItemRelationship,
      `${alias}_aRel`,
      `${alias}_aRel.source=${alias}.id
      AND ${this.entityRelationshipDao.isActiveRelationship(
        qb,
        `${alias}_aRel`
      )}`
    );
    qb.leftJoin(`${alias}_aRel.target`, `${alias}_a`);
    qb.leftJoin(
      ItemRelationship,
      `${alias}_dRel`,
      `${alias}_dRel.target=${alias}.id
      AND ${this.entityRelationshipDao.isActiveRelationship(
        qb,
        `${alias}_dRel`
      )}`
    );
    qb.leftJoin(`${alias}_dRel.source`, `${alias}_d`);

    if (filter?.parent) {
      qb.andWhere(`${alias}_aRel.distance=0 AND ${alias}_a.id=:parent`, {
        parent: filter.parent,
      });
    } else if (filter.rootOnly) {
      qb.andWhere(`${alias}_a.id IS NULL`);
    }

    if (filter?.nameInPath) {
      qb.andWhere(
        `(
          ${alias}.name ilike :nameInPath
          OR ${alias}_a.name ilike :nameInPath
          OR ${alias}_d.name ilike :nameInPath
          )`,
        {
          nameInPath: `%${filter.nameInPath}%`,
        }
      );
    }

    if (filter?.name) {
      qb.andWhere(`${alias}.name ilike :name`, {
        name: `%${filter.name}%`,
      });
    }

    if (filter.id) {
      qb.andWhere(`${alias}.id IN (:...ids)`, { ids: filter.id });
    }
    if (filter.not) {
      qb.setParameter("excluded", filter.not);
      qb.andWhere(`${alias}.id NOT IN (:...excluded)`);
      qb.andWhere(
        `(${alias}_a.id IS NULL OR ${alias}_a.id NOT IN (:...excluded))`
      );
      qb.andWhere(`${alias}_a.id NOT IN (:...excluded)`);
    }

    return qb;
  }

  async getCategories(ids: string[]): Promise<Item[]> {
    if (!ids?.length) {
      return [];
    }
    return this.entityManager
      .createQueryBuilder(Item, "e")
      .where("e.id IN (:...ids)", { ids })
      .getMany();
  }

  async loadFully(items: Item[]) {
    if (!items?.length) return;

    const ancestors = await this.itemRelationshipService.getAncestors(
      items.filter((it) => !!it).map((it) => it.id)
    );
    const sibblings = await this.itemRelationshipService.getChildren(
      ancestors.filter((it) => it?.distance === 0).map((it) => it.target.id)
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
    const entity = await this.entityManager.findOne(Item, {
      where: { id },
    });
    if (!entity) {
      throw new ErrorResponse(400, {
        message: `Invalid item id ${id}`,
      });
    }
    return entity;
  }
}
