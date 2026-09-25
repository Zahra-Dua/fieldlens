import { Injectable } from "@nestjs/common";
import { CreateItemDto } from "./dto/create-item.dto";

export interface Item {
  id: string;
  name: string;
  quantity: number;
}

@Injectable()
export class ItemsService {
  private items: Item[] = [];

  create(dto: CreateItemDto): Item {
    const item: Item = {
      id: crypto.randomUUID(),
      name: dto.name,
      quantity: dto.quantity,
    };
    this.items.push(item);
    return item;
  }

  findAll(): Item[] {
    return this.items;
  }
}