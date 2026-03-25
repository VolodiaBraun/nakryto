import { IsNumber, IsString, Min, MaxLength, IsOptional } from 'class-validator';

export class RequestWithdrawalDto {
  @IsNumber()
  @Min(100)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  paymentDetails?: string;
}
