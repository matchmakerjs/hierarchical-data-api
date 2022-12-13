import {
  Delete,
  ErrorResponse,
  Get,
  HandlerContext,
  PathParameter,
  Post,
  Put,
  Query,
  QueryParameter,
  RequestBody,
  RestController,
  Valid,
} from "@matchmakerjs/matchmaker";
import { AnonymousUserAllowed } from "@matchmakerjs/matchmaker-security";
import { IncomingMessage, ServerResponse } from "http";
import { EntityManager } from "typeorm";
import { ItemDao } from "../dao/item.dao";
import { ItemApiRequest } from "../data/dto/requests/item.request";
import { PageRequest } from "../data/dto/requests/page-request";
import { ItemApiResponse } from "../data/dto/responses/item.response";
import { SearchResult } from "../data/dto/responses/search-result";
import { Item } from "../data/entities/item.entity";
import { ItemRelationshipService } from "../services/item-relationship.service";
import { ItemService } from "../services/item.service";
import { StringUtils } from "../utils/string.util";

@AnonymousUserAllowed()
@RestController("items")
export class ItemController {
  constructor(
    private entityManager: EntityManager,
    private itemService: ItemService,
    private itemDao: ItemDao,
    private itemRelationshipService: ItemRelationshipService
  ) {}

  @Post()
  async registerItem(
    context: HandlerContext<IncomingMessage, ServerResponse>,
    @Valid() @RequestBody() request: ItemApiRequest
  ): Promise<ItemApiResponse> {
    const similarName = await this.entityManager
      .createQueryBuilder(Item, "e")
      .where("lower(e.name)=lower(:name)", {
        name: StringUtils.normalizeSpace(request.name),
      })
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

  @Put("{itemId}")
  async updateItem(
    @PathParameter("itemId") itemId: string,
    @Valid() @RequestBody() request: ItemApiRequest
  ): Promise<ItemApiResponse> {
    if (itemId === request.parentId) {
      throw new ErrorResponse(400, {
        message: `Item cannot be parent of itself`,
      });
    }
    const entity = await this.itemService.getItemOrThrow(itemId);
    const similarName = await this.entityManager
      .createQueryBuilder(Item, "e")
      .where("lower(e.name)=lower(:name)", {
        name: StringUtils.normalizeSpace(request.name),
      })
      .limit(1)
      .getOne();
    if (similarName && similarName.id !== entity.id) {
      throw new ErrorResponse(409, {
        message: `Item with name ${request.name} exists`,
        data: ItemApiResponse.fromItem(similarName),
      });
    }
    await this.itemService.updateItem(entity, request);
    return ItemApiResponse.fromItem(entity);
  }

  @Delete("{itemId}")
  async deleteItem(
    context: HandlerContext<IncomingMessage, ServerResponse>,
    @PathParameter("itemId") itemId: string
  ): Promise<void> {
    const entity = await this.itemService.getItemOrThrow(itemId);

    await this.itemService.deleteItem(entity);
    context.response.statusCode = 204;
  }

  @AnonymousUserAllowed()
  @Get()
  async searchItems(
    @Query() page: PageRequest,
    @QueryParameter("id") id: string[],
    @QueryParameter("name") name: string,
    @QueryParameter("nameInPath") nameInPath: string,
    @QueryParameter("parent") parent: string,
    @QueryParameter("rootOnly") rootOnly: boolean,
    @QueryParameter("not") not: string[]
  ): Promise<SearchResult<ItemApiResponse>> {
    const canFetchAll = rootOnly?.toString() === "true" || parent;
    const limit = PageRequest.getLimit(
      page.limit,
      canFetchAll ? null : 10,
      canFetchAll ? null : 100
    );
    const offset = PageRequest.getOffset(page.offset);

    const qb = this.itemDao.createQuery(
      {
        id,
        name,
        nameInPath,
        not,
        parent,
        rootOnly: rootOnly?.toString() === "true",
      },
      "e"
    );

    const entities = await qb
      .clone()
      .distinct()
      .orderBy("e.name", "ASC")
      .limit(limit)
      .offset(offset)
      .getMany();

    const childrenCounts = await this.itemRelationshipService.countChildren(
      entities.map((it) => it.id)
    );
    const ancestors = await this.itemRelationshipService.getAncestors(
      entities.map((it) => it.id)
    );

    const results = entities.map((entity) => {
      const response = ItemApiResponse.fromItem(entity);
      response.numberOfChildren = Number(childrenCounts[entity.id] || 0);
      response.ancestors = ancestors
        .filter((it) => it.source.id === entity.id)
        .map((it) => ItemApiResponse.fromItem(it.target));
      if (response.ancestors.length) {
        response.parentId = response.ancestors[0].id;
      }
      return response;
    });

    let total = PageRequest.computeTotal(limit, offset, results.length);
    if (typeof total !== "number") {
      ({ total } = await qb
        .clone()
        .select("count(DISTINCT e.id)", "total")
        .getRawOne());
      total = Number(total);
    }
    return { limit, offset, total, results };
  }
}
