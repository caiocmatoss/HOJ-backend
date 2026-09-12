import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendDirectMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;

  @IsOptional()
  @IsString()
  replyToId?: string;
}
