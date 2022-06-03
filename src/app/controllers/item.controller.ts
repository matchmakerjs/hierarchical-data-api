import {
    Delete,
    ErrorResponse,
    Get,
    HandlerContext,
    PathParameter,
    Post,
    Put,
    Query,
    RequestBody,
    RestController,
    Valid,
} from '@matchmakerjs/matchmaker';
import { AnonymousUserAllowed } from '@matchmakerjs/matchmaker-security';
import { IncomingMessage, ServerResponse } from 'http';
import { EntityManager } from 'typeorm';
import { ItemFilter } from '../data/dto/filter/item.filter';
import { ItemApiRequest } from '../data/dto/requests/item.request';
import { PageRequest } from '../data/dto/requests/page-request';
import { ItemApiResponse } from '../data/dto/responses/item.response';
import { SearchResult } from '../data/dto/responses/search-result';
import { ItemRelationship } from '../data/entities/item-relationship.entity';
import { Item } from '../data/entities/item.entity';
import { ItemRelationshipService } from '../services/item-relationship.service';
import { ItemService } from '../services/item.service';
import { StringUtils } from '../utils/string.util';

@AnonymousUserAllowed()
@RestController('items')
export class ItemController {
    constructor(
        private entityManager: EntityManager,
        private itemService: ItemService,
        private itemRelationshipService: ItemRelationshipService,
    ) {}

    @Post()
    async registerItem(
        context: HandlerContext<IncomingMessage, ServerResponse>,
        @Valid() @RequestBody() request: ItemApiRequest,
    ): Promise<ItemApiResponse> {
        const similarName = await this.entityManager
            .createQueryBuilder(Item, 'e')
            .where('lower(e.name)=lower(:name)', { name: StringUtils.normalizeSpace(request.name) })
            .limit(1)
            .getOne();
        if (similarName) {
            throw new ErrorResponse(409, {
                message: `Item with name ${request.name} exists`,
                data: ItemApiResponse.fromItem(similarName),
            });
        }
        const entity = await this.itemService.createItem(request);
        context.response.statusCode = 201;
        return ItemApiResponse.fromItem(entity);
    }

    @Put('{itemId}')
    async updateBusinessCategory(
        @PathParameter('itemId') itemId: string,
        @Valid() @RequestBody() request: ItemApiRequest,
    ): Promise<ItemApiResponse> {
        if (itemId === request.parentId) {
            throw new ErrorResponse(400, {
                message: `Business category cannot be parent of itself`,
            });
        }
        const entity = await this.itemService.getItemOrThrow(itemId);
        const similarName = await this.entityManager
            .createQueryBuilder(Item, 'e')
            .where('lower(e.name)=lower(:name)', { name: StringUtils.normalizeSpace(request.name) })
            .limit(1)
            .getOne();
        if (similarName && similarName.id !== entity.id) {
            throw new ErrorResponse(409, {
                message: `Business category with name ${request.name} exists`,
                data: ItemApiResponse.fromItem(similarName),
            });
        }
        await this.itemService.updateItem(entity, request);
        return ItemApiResponse.fromItem(entity);
    }

    @Delete('{itemId}')
    async deleteBusinessCategory(
        context: HandlerContext<IncomingMessage, ServerResponse>,
        @PathParameter('itemId') itemId: string,
    ): Promise<void> {
        const entity = await this.itemService.getItemOrThrow(itemId);

        await this.itemService.deleteItem(entity);
        context.response.statusCode = 204;
    }

    @AnonymousUserAllowed()
    @Get()
    async searchBusinessCategories(
        context: HandlerContext<IncomingMessage, ServerResponse>,
        @Query() page: PageRequest,
        @Query() filter: ItemFilter,
    ): Promise<SearchResult<ItemApiResponse>> {
        let limit: number;
        let offset: number;

        const MAX_LIMIT = 10;
        if (page.limit) {
            limit = Math.min(MAX_LIMIT, Number(page.limit || 10));
        }
        if (page.offset) {
            offset = Number(page.offset || 0);
        }
        if (limit === undefined && !filter.rootOnly && !filter.parent) {
            limit = MAX_LIMIT;
        }

        const qb = this.entityManager.createQueryBuilder(Item, 'e');

        qb.leftJoin(ItemRelationship, 'aRel', 'aRel.descendant.id=e.id');
        qb.leftJoin('aRel.ancestor', 'a');
        qb.leftJoin(ItemRelationship, 'dRel', 'dRel.ancestor.id=e.id');
        qb.leftJoin('dRel.descendant', 'd');

        if (filter?.parent) {
            qb.innerJoin(ItemRelationship, 'pRel', 'pRel.descendant.id=e.id');
            qb.innerJoin('pRel.ancestor', 'p');
            qb.andWhere(`pRel.derivedFrom IS NULL AND p.id=:parent`, {
                parent: filter.parent,
            });
            if (filter?.name) {
                qb.andWhere(`(e.name ilike :name OR a.name ilike :name OR d.name ilike :name)`, {
                    name: `%${filter.name}%`,
                });
            }
        } else if (filter.rootOnly?.toString() == 'true') {
            qb.andWhere(`a.id IS NULL`);
            if (filter?.name) {
                qb.andWhere(`(e.name ilike :name OR d.name ilike :name)`, {
                    name: `%${filter.name}%`,
                });
            }
        } else if (filter?.name) {
            qb.andWhere(`e.name ilike :name`, {
                name: `%${filter.name}%`,
            });
        }
        const excluded = context.query.get('not');
        if (excluded) {
            qb.setParameter('excluded', Array.isArray(excluded) ? excluded : [excluded]);
            qb.andWhere(`e.id NOT IN (:...excluded)`);
            qb.andWhere(
                (qb) =>
                    `${qb
                        .subQuery()
                        .from(ItemRelationship, 'rel')
                        .where('rel.descendant=e.id')
                        .andWhere('rel.ancestor IN (:...excluded)')
                        .select('rel.id')
                        .limit(1)
                        .getSql()} IS NULL`,
            );
        }
        const entities = await qb.clone().distinct().orderBy('e.name', 'ASC').limit(limit).offset(offset).getMany();

        const childrenCounts = await this.itemRelationshipService.countChildren(entities.map((it) => it.id));
        const ancestors = await this.itemRelationshipService.getAncestors(entities.map((it) => it.id));

        const results = entities.map((entity) => {
            const response = ItemApiResponse.fromItem(entity);
            response.numberOfChildren = childrenCounts[entity.id] || 0;
            response.ancestors = ancestors
                .filter((it) => it.descendant.id === entity.id)
                .map((it) => ItemApiResponse.fromItem(it.ancestor));
            if (response.ancestors.length) {
                response.parentId = response.ancestors[0].id;
            }
            return response;
        });
        let total = results.length;
        if (total && total == limit) {
            ({ total } = await qb.clone().select('count(DISTINCT e.id)', 'total').getRawOne());
        }
        return { limit, offset, total, results };
    }
}
