import { Column, Entity, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';
import { Audit } from '../embedded/Audit';

@Entity()
export class Item {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @VersionColumn()
    version: number;

    @Column({ nullable: false })
    name: string;

    @Column({ nullable: true })
    description: string;

    @Column((_) => Audit, { prefix: false })
    audit: Audit = new Audit();

    ancestors: Item[];
    sibblings: Item[];
    // numberOfChildren: number;
    parentId: string;
}
