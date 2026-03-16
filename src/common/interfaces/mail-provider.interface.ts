export interface SendMailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export abstract class MailProvider {
  abstract sendMail(options: SendMailOptions): Promise<void>;
  abstract getProviderName(): string;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
