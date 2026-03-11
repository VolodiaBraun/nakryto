import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MailerService } from './mailer.service';

@Module({
  providers: [MailerService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
