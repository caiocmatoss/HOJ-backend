import { IsNotEmpty, IsString } from 'class-validator';

export class CreateInviteDto {
  @IsString()
  @IsNotEmpty()
  receiverId: string;
}
