import nodemailer from 'nodemailer';
import { EmailInterface } from '@gitroom/nestjs-libraries/emails/email.interface';
import { getEmailConfig } from '@gitroom/nestjs-libraries/emails/email.config';

export class NodeMailerProvider implements EmailInterface {
  name = 'nodemailer';
  validateEnvKeys = [
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_SECURE',
    'EMAIL_USER',
    'EMAIL_PASS',
  ];
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string
  ) {
    // Build transporter MỖI LẦN từ cấu hình đọc FRESH — đổi tài khoản Gmail/SMTP
    // qua UI Settings là ăn ngay, không cache lúc module-load, không cần restart.
    const c = getEmailConfig();
    const transporter = nodemailer.createTransport({
      host: c.host,
      port: +(c.port || '465'),
      secure: c.secure === 'true',
      auth: {
        user: c.user,
        pass: c.pass,
      },
    });
    const sends = await transporter.sendMail({
      from: `${emailFromName} <${emailFromAddress}>`, // sender address
      to: to, // list of receivers
      subject: subject, // Subject line
      text: html, // plain text body
      html: html, // html body
    });

    return sends;
  }
}
