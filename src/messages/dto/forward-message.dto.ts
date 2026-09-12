import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ForwardMessageDto {
  @IsIn(['DIRECT', 'GROUP'])
  targetType: 'DIRECT' | 'GROUP';

  @IsString()
  @IsNotEmpty()
  targetId: string;
}
