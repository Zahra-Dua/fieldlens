import { IsString, IsNotEmpty, IsInt, IsPositive } from "class-validator";

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;
}