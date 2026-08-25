import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCheckinDto {
  @IsString()
  @IsNotEmpty()
  venueId: string;
}
