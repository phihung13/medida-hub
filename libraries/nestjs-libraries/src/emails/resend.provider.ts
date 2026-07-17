import { Resend } from 'resend';
import { EmailInterface } from '@gitroom/nestjs-libraries/emails/email.interface';
import { getEmailConfig } from '@gitroom/nestjs-libraries/emails/email.config';

export class ResendProvider implements EmailInterface {
  name = 'resend';
  validateEnvKeys = ['RESEND_API_KEY'];
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string,
    replyTo?: string
  ) {
    // Key đọc FRESH từ cấu hình (UI Settings) — đổi là ăn ngay.
    const resend = new Resend(getEmailConfig().resendKey || 're_132');
    try {
      const sends = await resend.emails.send({
        from: `${emailFromName} <${emailFromAddress}>`,
        to,
        subject,
        html,
        ...(replyTo && { reply_to: replyTo }),
      });

      return sends;
    } catch (err) {
      console.log(err);
    }

    return { sent: false };
  }
}
