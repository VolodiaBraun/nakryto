import { Module } from '@nestjs/common';
import { MaxController } from './max.controller';
import { MaxService } from './max.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MaxController],
  providers: [MaxService],
  exports: [MaxService],
})
export class MaxModule {}
