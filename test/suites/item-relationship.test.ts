import { createContainer, LazyDIContainer } from "@matchmakerjs/di";
import { JwtClaims } from "@matchmakerjs/jwt-validator";
import { RequestMetadata } from "@matchmakerjs/matchmaker-security";
import {
  createTypeOrmModule,
  SqliteInMemoryConnectionOptions,
} from "@matchmakerjs/matchmaker-typeorm";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";
import { EntityManager, In } from "typeorm";
import { ItemApiRequest } from "../../src/app/data/dto/requests/item.request";
import { ItemApiResponse } from "../../src/app/data/dto/responses/item.response";
import { ItemRelationship } from "../../src/app/data/entities/item-relationship.entity";
import { Item } from "../../src/app/data/entities/item.entity";
import { ItemRelationshipService } from "../../src/app/services/item-relationship.service";
import { ItemService } from "../../src/app/services/item.service";
import { TestServer } from "../conf/test-server";

describe("item relationship", () => {
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

  it("should order nested items", async () => {
    const list: string[] = [];
    for (let i = 0; i < 5; i++) {
      const previous = list.at(-1);
      const response = await TestServer(container, {} as JwtClaims).post(
        `/items`,
        {
          name: randomUUID(),
          parentId: previous,
        } as ItemApiRequest
      );
      expect(response.statusCode).toBe(201);
      list.push((response.parseJson() as ItemApiResponse).id);
    }
    const ancestors = await container
      .getInstance(ItemRelationshipService)
      .getAncestors([list.pop()]);
    for (let i = 0; i < ancestors.length; i++) {
      expect(ancestors[i].target.id).toEqual(list.pop());
      expect(ancestors[i].distance).toBe(i);
    }
  });

  it("should update tree", async () => {
    const itemService = container.getInstance(ItemService);
    const b = await itemService.createItem({ name: randomUUID() });
    const a = await itemService.createItem({ name: randomUUID() });
    const a1 = await itemService.createItem({
      name: randomUUID(),
      parentId: a.id,
    });

    const response = await TestServer(container, {} as JwtClaims).put(
      `/items/${a.id}`,
      {
        name: a.name,
        parentId: b.id,
      } as ItemApiRequest
    );
    expect(response.statusCode).toBe(200);
    const list = await container
      .getInstance(EntityManager)
      .find(ItemRelationship, {
        where: {
          source: {
            id: In([a.id, a1.id]),
          },
        },
        loadRelationIds: true,
      });
    expect(list.length).toBe(3);
    expect(
      list.filter((it) => it.source.toString() === a1.id).map((it) => it.target)
    ).toEqual([a.id, b.id]);
    expect(
      list.filter((it) => it.source.toString() === a.id).map((it) => it.target)
    ).toEqual([b.id]);
  });

  it("should update relationships on update", async () => {
    const requests: ItemApiRequest[] = [];
    const entities: Item[] = [];
    for (let i = 0; i < 7; i++) {
      requests.push({
        name: randomUUID(),
      });
      entities.push(
        await container.getInstance(ItemService).createItem(requests.at(-1))
      );
    }
    expect(entities.length).toBe(requests.length);

    const start = Math.floor(requests.length / 2);
    for (let i = start + 1; i < requests.length; i++) {
      const entry = entities[i];
      const previous = entities[i - 1];
      const response = await TestServer(container, {} as JwtClaims).put(
        `/items/${entry.id}`,
        {
          name: entry.name,
          parentId: previous.id,
        } as ItemApiRequest
      );
      expect(response.statusCode).toBe(200);
      const updateResult = response.parseJson() as ItemApiResponse;
      expect(updateResult.ancestors?.length).toBe(i - start);
    }
    const last = entities.at(-1);

    const startItem = entities[start];
    for (let i = 0; i < start; i++) {
      const entry = entities[i];
      const response = await TestServer(container, {} as JwtClaims).put(
        `/items/${startItem.id}`,
        {
          name: startItem.name,
          parentId: entry.id,
        } as ItemApiRequest
      );
      expect(response.statusCode).toBe(200);
      expect((response.parseJson() as ItemApiResponse).ancestors.length).toBe(
        1
      );
    }
    const ancestors = await container
      .getInstance(ItemRelationshipService)
      .getAncestors([last.id]);
    expect(ancestors.length).toBe(requests.length - start);
    expect(ancestors.at(-1).target.id).toBe(entities[start - 1].id);
  });

  it("should prevent cyclic dependency", async () => {
    const requests: ItemApiRequest[] = [];
    const entities: Item[] = [];
    for (let i = 0; i < 5; i++) {
      requests.push({
        name: randomUUID(),
      });
      entities.push(
        await container.getInstance(ItemService).createItem(requests.at(-1))
      );
    }
    expect(entities.length).toBe(requests.length);

    for (let i = 1; i < requests.length; i++) {
      const entry = entities[i];
      const previous = entities[i - 1];
      const response = await TestServer(container, {} as JwtClaims).put(
        `/items/${entry.id}`,
        {
          name: entry.name,
          parentId: previous.id,
        } as ItemApiRequest
      );
      expect(response.statusCode).toBe(200);
      const updateResult = response.parseJson() as ItemApiResponse;
      expect(updateResult.ancestors?.length).toBe(i);
    }

    const first = entities[0];
    const last = entities.at(-1);
    const response2 = await TestServer(container, {} as JwtClaims).put(
      `/items/${first.id}`,
      {
        name: first.name,
        parentId: last.id,
      } as ItemApiRequest
    );
    expect(response2.statusCode).toBe(400);
  });

  it("should delete parent and children", async () => {
    const requests: ItemApiRequest[] = [
      {
        name: randomUUID(),
      },
      {
        name: randomUUID(),
      },
    ];
    const itemService = container.getInstance(ItemService);
    let parent = await itemService.createItem(requests[0]);
    requests[1].parentId = parent.id;
    let child = await itemService.createItem(requests[1]);

    const response = await TestServer(container, {} as JwtClaims).delete(
      `/items/${parent.id}`
    );
    expect(response.statusCode).toBe(204);

    parent = await container.getInstance(EntityManager).findOne(Item, {
      where: { id: parent.id },
      withDeleted: true,
    });
    expect(parent.audit.deactivatedAt).toBeDefined();
    child = await container.getInstance(EntityManager).findOne(Item, {
      where: { id: child.id },
      withDeleted: true,
    });
    expect(child.audit.deactivatedAt).toBeDefined();
  });
});
