import { Type } from 'class-transformer';

export class SearchResult<T> {
    @Type(() => Number)
    limit: number;
    @Type(() => Number)
    offset: number;
    @Type(() => Number)
    total: number;
    results: T[];
}
