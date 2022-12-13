import { Injectable } from "@matchmakerjs/di";
import { SelectQueryBuilder } from "typeorm";
import { ItemRelationship } from "../data/entities/item-relationship.entity";

@Injectable()
export class ItemRelationshipDao {
  isActiveRelationship(qb: SelectQueryBuilder<unknown>, alias: string) {
    return `(
            ${alias}.derivedFrom IS NULL 
            OR ${this.getDeactivatedTimeSubquery(
              qb,
              alias,
              `${alias}.derivedFrom`
            )} IS NULL
        )`;
  }

  private getDeactivatedTimeSubquery(
    qb: SelectQueryBuilder<unknown>,
    alias: string,
    id: string
  ) {
    return qb
      .subQuery()
      .from(ItemRelationship, `${alias}_sq`)
      .where(`${alias}_sq.id=${id}`)
      .withDeleted()
      .select(`${alias}_sq.deactivatedAt`)
      .getSql();
  }
}
