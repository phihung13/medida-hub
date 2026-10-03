import { Injectable } from '@nestjs/common';

// ============================================================================
//  Lớp gọi API "Thu thập sử dụng" của Major OS (tầng tương đương repository —
//  nguồn dữ liệu ở đây là Major OS chứ không phải DB). Khoá app nằm ở biến môi
//  trường MAJOR_OS_APP_KEY phía máy chủ; KHÔNG BAO GIỜ đưa ra trình duyệt.
// ============================================================================

export type MajorOsReply = {
  status: number; // 0 = lỗi mạng
  retryAfterSec?: number;
  body?: any;
};

@Injectable()
export class MajorOsClient {
  private readonly base = (process.env.MAJOR_OS_URL || 'https://os.truongvietanh.com').replace(/\/$/, '');

  get enabled() {
    return !!process.env.MAJOR_OS_APP_KEY;
  }

  private async post(path: string, body: unknown): Promise<MajorOsReply> {
    try {
      const res = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.MAJOR_OS_APP_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const retry = Number(res.headers.get('retry-after'));
      const json = await res.json().catch(() => undefined);
      return {
        status: res.status,
        ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSec: retry } : {}),
        body: json,
      };
    } catch {
      return { status: 0 };
    }
  }

  sendEvents(events: unknown[]) {
    return this.post('/api/thu-thap/v1/su-kien', { events });
  }

  sendFeedback(feedback: unknown) {
    return this.post('/api/thu-thap/v1/gop-y', feedback);
  }
}
