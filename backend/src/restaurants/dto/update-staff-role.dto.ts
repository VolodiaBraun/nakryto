import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStaffRoleDto {
  @ApiProperty({ enum: ['MANAGER', 'HOSTESS'] })
  @IsIn(['MANAGER', 'HOSTESS'])
  role: 'MANAGER' | 'HOSTESS';
}
