import { Item } from '../../entities/item.entity';

export class ItemApiResponse {
    id: string;
    version: number;
    parentId: string;
    name: string;
    description: string;
    ancestors: ItemApiResponse[];
    // sibblings: ItemApiResponse[];
    numberOfChildren: number;

    static fromItem(entity: Item) {
        const response = new ItemApiResponse();
        response.id = entity.id;
        response.version = entity.version;
        response.name = entity.name;
        response.description = entity.description;
        response.parentId = entity.parentId;
        if (entity.ancestors) {
            response.ancestors = entity.ancestors.map(ItemApiResponse.fromItem);
        }
        // if (entity.sibblings) {
        //     response.sibblings = entity.sibblings.map(ItemApiResponse.fromItem);
        // }
        return response;
    }
}
