import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import {
  MailProvider,
  SendMailOptions,
} from '../interfaces/mail-provider.interface';

@Injectable()
export class SmtpMailProvider extends MailProvider {
  private readonly logger = new Logger(SmtpMailProvider.name);

  constructor(private readonly mailerService: MailerService) {
    super();
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  getProviderName(): string {
    return 'SMTP';
  }
}
