import { IsEnum } from 'class-validator';
import { Plan } from '@prisma/client';

export class UpdatePlanDto {
  @IsEnum(Plan)
  plan: Plan;
}
