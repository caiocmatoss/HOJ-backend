import { IsDefined, IsNotEmpty, IsString } from 'class-validator';

export class CreateInviteDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  receiverId: string;
}
