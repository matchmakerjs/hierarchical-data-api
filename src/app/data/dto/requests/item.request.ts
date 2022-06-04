import { IsDefined, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class ItemApiRequest {
    @IsDefined()
    @IsNotEmpty()
    @MaxLength(50)
    name: string;

    @IsOptional()
    @MaxLength(50)
    description?: string;

    parentId?: string;
}
