import { Injectable } from '@nestjs/common';
import { EmailInterface } from '@gitroom/nestjs-libraries/emails/email.interface';
import { ResendProvider } from '@gitroom/nestjs-libraries/emails/resend.provider';
import { EmptyProvider } from '@gitroom/nestjs-libraries/emails/empty.provider';
import { NodeMailerProvider } from '@gitroom/nestjs-libraries/emails/node.mailer.provider';
import { TemporalService } from 'nestjs-temporal-core';
import { timer } from '@gitroom/helpers/utils/timer';
import {
  getEmailConfig,
  hasEmailConfig,
} from '@gitroom/nestjs-libraries/emails/email.config';

@Injectable()
export class EmailService {
  emailService: EmailInterface;
  constructor(private _temporalService: TemporalService) {
    this.emailService = this.selectProvider(getEmailConfig().provider);
    console.log('Email service provider:', this.emailService.name);
  }

  // Provider chọn FRESH theo cấu hình hiện tại (UI Settings có thể đổi lúc chạy)
  // — không dùng this.emailService đã cache lúc khởi tạo.
  private freshProvider(): EmailInterface {
    return this.selectProvider(getEmailConfig().provider);
  }

  hasProvider() {
    return hasEmailConfig();
  }

  selectProvider(provider: string) {
    switch (provider) {
      case 'resend':
        return new ResendProvider();
      case 'nodemailer':
        return new NodeMailerProvider();
      default:
        return new EmptyProvider();
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    addTo: 'top' | 'bottom',
    replyTo?: string
  ) {
    return this._temporalService.client
      .getRawClient()
      ?.workflow.signalWithStart('sendEmailWorkflow', {
        taskQueue: 'main',
        workflowId: 'send_email',
        signal: 'sendEmail',
        args: [{ queue: [] }],
        signalArgs: [{ to, subject, html, replyTo, addTo }],
        workflowIdConflictPolicy: 'USE_EXISTING',
      });
  }

  // Gửi THẲNG (không qua Temporal). Trả TRUE nếu gửi thành công, FALSE nếu
  // thiếu cấu hình / sai địa chỉ / thất bại sau 3 lần thử — để nơi gọi (vd nút
  // "Gửi bản tin ngay") báo đúng thành/bại thay vì im lặng.
  async sendEmailSync(
    to: string,
    subject: string,
    html: string,
    replyTo?: string
  ): Promise<boolean> {
    if (to.indexOf('@') === -1) {
      return false;
    }

    // FROM đọc FRESH từ cấu hình (UI Settings), không chỉ process.env.
    const emailCfg = getEmailConfig();
    const fromName = emailCfg.fromName;
    const fromAddress = emailCfg.fromAddress;
    if (!fromAddress || !fromName) {
      console.log('Email sender information not configured');
      return false;
    }

    const modifiedHtml = `
    <div style="
        background: linear-gradient(to bottom right, #e6f2ff, #f0e6ff);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
    ">
        <div style="
            background-color: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(4px);
            border-radius: 0.5rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            max-width: 48rem;
            width: 100%;
            padding: 2rem;
        ">
            <h1 style="
                font-size: 1.875rem;
                font-weight: bold;
                margin-bottom: 1.5rem;
                text-align: left;
                color: #1f2937;
            ">${subject}</h1>
            
            <div style="
                margin-bottom: 2rem;
                color: #374151;
            ">
                ${html}
            </div>
            
            <div style="
                display: flex;
                align-items: center;
                border-top: 1px solid #e5e7eb;
                padding-top: 1.5rem;
            ">
                <div>
                    <h2 style="
                        font-size: 1.25rem;
                        font-weight: 600;
                        color: #1f2937;
                        margin: 0;
                    ">${fromName}</h2>
                    <div style="font-size: 12px">
                      You can change your notification preferences in your <a href="${process.env.FRONTEND_URL}/settings">account settings.</a>
                     </div>
                </div>
            </div>
        </div>
    </div>
    `;

    const provider = this.freshProvider();
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const sends = await provider.sendEmail(
          to,
          subject,
          modifiedHtml,
          fromName,
          fromAddress,
          replyTo
        );
        console.log(sends);
        return true;
      } catch (err) {
        lastErr = err;
        console.log(`Email attempt ${attempt + 1}/3 failed:`, err);
        if (attempt < 2) {
          await timer(700);
        }
      }
    }
    console.log(`Email to ${to} failed after 3 attempts:`, lastErr);
    return false;
  }
}
