import { BeforeInsert, BeforeUpdate, Column, DeleteDateColumn } from 'typeorm';

export class Audit {
    createdAt?: Date;

    @Column({ nullable: true })
    createdBy?: string;

    @Column({ nullable: true })
    lastUpdatedAt?: Date;

    @Column({ nullable: true })
    lastUpdatedBy?: string;

    @DeleteDateColumn({ nullable: true })
    deactivatedAt?: Date;

    @Column({ nullable: true })
    deactivatedBy?: string;

    @BeforeInsert()
    useNowAsCreationDate() {
        this.createdAt = new Date();
    }

    @BeforeUpdate()
    useNowAsLastUpdateDate() {
        this.lastUpdatedAt = new Date();
    }
}
