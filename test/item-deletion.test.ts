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
import { Item } from "../src/app/data/entities/item.entity";
import { ItemService } from "../src/app/services/item.service";
import { TestServer } from "./conf/test-server";

describe("item upload", () => {
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

  it("should delete single item", async () => {
    const itemService = container.getInstance(ItemService);
    let item = await itemService.createItem({ name: randomUUID() });
    const response = await TestServer(container, {} as JwtClaims).delete(
      `/items/${item.id}`
    );
    expect(response.statusCode).toBe(204);
    item = await container.getInstance(EntityManager).findOne(Item, {
      where: { id: item.id },
      withDeleted: true,
    });
    expect(item.audit.deactivatedAt).toBeDefined();
  });

  it("should delete tree", async () => {
    const itemService = container.getInstance(ItemService);
    const item = await itemService.createItem({ name: randomUUID() });
    const child = await itemService.createItem({
      name: randomUUID(),
      parentId: item.id,
    });
    const response = await TestServer(container, {} as JwtClaims).delete(
      `/items/${item.id}`
    );
    expect(response.statusCode).toBe(204);
    const list = await container.getInstance(EntityManager).find(Item, {
      where: { id: In([item.id, child.id]) },
      withDeleted: true,
    });
    expect(list.length).toBe(2);
    for (const entry of list) {
      expect(entry.audit.deactivatedAt).toBeDefined();
    }
  });
});
