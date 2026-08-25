import { IsNotEmpty, IsString } from 'class-validator';

export class AddGroupMemberDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
