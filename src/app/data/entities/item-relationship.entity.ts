import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Audit } from "../embedded/Audit";
import { Item } from "./item.entity";

@Entity()
export class ItemRelationship {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Item, { nullable: false })
  ancestor: Item;

  @ManyToOne(() => Item, { nullable: false })
  descendant: Item;

  @ManyToOne(() => ItemRelationship, { nullable: true })
  derivedFrom: ItemRelationship;

  @Column()
  distance: number;

  @Column((_) => Audit, { prefix: false })
  audit: Audit = new Audit();
}
