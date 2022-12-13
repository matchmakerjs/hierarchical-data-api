import { createContainer, LazyDIContainer } from "@matchmakerjs/di";
import { RequestMetadata } from "@matchmakerjs/matchmaker-security";
import {
  createTypeOrmModule,
  SqliteInMemoryConnectionOptions,
} from "@matchmakerjs/matchmaker-typeorm";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";
import { EntityManager } from "typeorm";
import { ItemApiRequest } from "../../src/app/data/dto/requests/item.request";
import { ItemApiResponse } from "../../src/app/data/dto/responses/item.response";
import { SearchResult } from "../../src/app/data/dto/responses/search-result";
import { ItemRelationship } from "../../src/app/data/entities/item-relationship.entity";
import { Item } from "../../src/app/data/entities/item.entity";
import { ItemService } from "../../src/app/services/item.service";
import { TestServer } from "../conf/test-server";

describe("item search", () => {
  jest.setTimeout(20000);

  let cleanUp: () => Promise<void>;
  let container: LazyDIContainer;

  beforeAll(async () => {
    dotenv.config();
    await createTypeOrmModule(SqliteInMemoryConnectionOptions()).then(
      async (typeOrmModule) => {
        [container, cleanUp] = createContainer({
          modules: [typeOrmModule],
        });
        container = container.clone([
          {
            provide: RequestMetadata,
            with: () => ({}),
          },
        ]);
      }
    );
  });

  afterAll(async () => cleanUp && cleanUp());

  beforeEach(async () => {
    await container
      .getInstance(EntityManager)
      .createQueryBuilder(ItemRelationship, "e")
      .delete()
      .execute();
    await container
      .getInstance(EntityManager)
      .createQueryBuilder(Item, "e")
      .delete()
      .execute();
  });

  it("should not fail on empty DB", async () => {
    const response = await TestServer(container).get(`/items`);
    expect(response.statusCode).toBe(200);
    const searchResult: SearchResult<ItemApiResponse> = response.parseJson();
    expect(searchResult).toBeDefined();
    expect(searchResult.total).toBe(0);
  });

  it("should search", async () => {
    const requests: ItemApiRequest[] = [
      {
        name: randomUUID(),
      },
      {
        name: randomUUID(),
      },
    ];
    await Promise.all(
      requests.map((it) => container.getInstance(ItemService).createItem(it))
    );
    const response = await TestServer(container).get(`/items`);
    expect(response.statusCode).toBe(200);
    const searchResult: SearchResult<ItemApiResponse> = response.parseJson();
    expect(searchResult).toBeDefined();
    expect(searchResult.total).toBe(requests.length);
    expect(
      searchResult.results.map((it) => it.numberOfChildren).sort()
    ).toEqual([0, 0]);
  });

  it("should search by parent", async () => {
    const requests: ItemApiRequest[] = [
      {
        name: randomUUID(),
      },
      {
        name: randomUUID(),
      },
    ];
    const parent = await container
      .getInstance(ItemService)
      .createItem(requests[0]);
    requests[1].parentId = parent.id;
    await container.getInstance(ItemService).createItem(requests[1]);
    const response = await TestServer(container).get(
      `/items?parent=${parent.id}`
    );
    expect(response.statusCode).toBe(200);
    const searchResult: SearchResult<ItemApiResponse> = response.parseJson();
    expect(searchResult).toBeDefined();
    expect(searchResult.total).toBe(1);
  });

  it("should search by not", async () => {
    const requests: ItemApiRequest[] = [
      {
        name: randomUUID(),
      },
      {
        name: randomUUID(),
      },
    ];
    const parent = await container
      .getInstance(ItemService)
      .createItem(requests[0]);
    requests[1].parentId = parent.id;
    await container.getInstance(ItemService).createItem(requests[1]);
    const response = await TestServer(container).get(`/items?not=${parent.id}`);
    expect(response.statusCode).toBe(200);
    const searchResult: SearchResult<ItemApiResponse> = response.parseJson();
    expect(searchResult).toBeDefined();
    expect(searchResult.total).toBe(0);
  });

  it("should return count of children", async () => {
    const requests: ItemApiRequest[] = [
      {
        name: randomUUID(),
      },
      {
        name: randomUUID(),
      },
    ];
    const parent = await container
      .getInstance(ItemService)
      .createItem(requests[0]);
    requests[1].parentId = parent.id;
    await container.getInstance(ItemService).createItem(requests[1]);
    const response = await TestServer(container).get(`/items`);
    expect(response.statusCode).toBe(200);
    const searchResult: SearchResult<ItemApiResponse> = response.parseJson();
    expect(searchResult).toBeDefined();
    expect(searchResult.total).toBe(requests.length);
    expect(
      searchResult.results.map((it) => it.numberOfChildren).sort()
    ).toEqual([0, 1]);
  });
});
