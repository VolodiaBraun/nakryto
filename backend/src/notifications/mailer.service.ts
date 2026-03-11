import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', 'smtp.timeweb.ru'),
      port: this.config.get<number>('SMTP_PORT', 465),
      secure: true, // SSL on port 465
      auth: {
        user: this.config.get('SMTP_USER', 'info@nakryto.ru'),
        pass: this.config.get('SMTP_PASS'),
      },
    });
  }

  async send(to: string | string[], subject: string, html: string): Promise<void> {
    const from = this.config.get('SMTP_FROM', '"Накрыто" <info@nakryto.ru>');

    try {
      await this.transporter.sendMail({ from, to, subject, html });
      const recipients = Array.isArray(to) ? to.join(', ') : to;
      this.logger.log(`Email sent → ${recipients}: ${subject}`);
    } catch (err) {
      this.logger.error(`Email failed → ${to}: ${err.message}`);
      // Не пробрасываем ошибку — уведомления не должны ломать основной флоу
    }
  }
}
