import { createContainer, LazyDIContainer } from '@matchmakerjs/di';
import { JwtClaims } from '@matchmakerjs/jwt-validator';
import { RequestMetadata } from '@matchmakerjs/matchmaker-security';
import { createTypeOrmModule, SqliteInMemoryConnectionOptions } from '@matchmakerjs/matchmaker-typeorm';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import { ItemApiRequest } from '../src/app/data/dto/requests/item.request';
import { ItemService } from '../src/app/services/item.service';
import { TestServer } from './conf/test-server';

describe('item upload', () => {
    jest.setTimeout(20000);

    let cleanUp: () => Promise<void>;
    let container: LazyDIContainer;

    beforeAll(async () => {
        dotenv.config();
        await createTypeOrmModule(SqliteInMemoryConnectionOptions()).then(async (typeOrmModule) => {
            [container, cleanUp] = createContainer({
                modules: [typeOrmModule],
            });
            container = container.clone([
                {
                    provide: RequestMetadata,
                    with: () => ({}),
                },
            ]);
        });
    });

    afterAll(async () => cleanUp && cleanUp());

    it('should register single item', async () => {
        const response = await TestServer(container, {} as JwtClaims).post(`/items`, {
            name: randomUUID(),
        } as ItemApiRequest);
        expect(response.statusCode).toBe(201);
    });

    it('should not register invalid parentId', async () => {
        const response = await TestServer(container, {} as JwtClaims).post(`/items`, {
            name: randomUUID(),
            parentId: randomUUID(),
        } as ItemApiRequest);
        expect(response.statusCode).toBe(400);
    });

    it('should prevent duplicate names', async () => {
        const name = randomUUID();
        const requests: ItemApiRequest[] = [
            {
                name,
            },
            {
                name,
            },
        ];
        await container.getInstance(ItemService).createItem(requests[0]);
        const response = await TestServer(container, {} as JwtClaims).post(`/items`, requests[1]);
        expect(response.statusCode).toBe(409);
    });
});
