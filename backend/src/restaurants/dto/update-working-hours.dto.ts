import { IsObject, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

class DaySchedule {
  open: string;   // "10:00"
  close: string;  // "22:00"
  closed: boolean;
}

export class UpdateWorkingHoursDto {
  @ApiPropertyOptional({
    example: {
      mon: { open: '10:00', close: '22:00', closed: false },
      tue: { open: '10:00', close: '22:00', closed: false },
      wed: { open: '10:00', close: '22:00', closed: false },
      thu: { open: '10:00', close: '22:00', closed: false },
      fri: { open: '10:00', close: '23:00', closed: false },
      sat: { open: '10:00', close: '23:00', closed: false },
      sun: { open: '11:00', close: '22:00', closed: true },
    },
  })
  @IsObject()
  workingHours: Record<string, DaySchedule>;
}
