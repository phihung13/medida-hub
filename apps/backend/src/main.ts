// Nạp ANTHROPIC_API_KEY (nhập qua UI Settings) từ file vào env — PHẢI đầu tiên.
import '@gitroom/nestjs-libraries/openai/anthropic.key';
// Nạp cấu hình tạo ảnh AI (nhà cung cấp + key) từ file vào env.
import '@gitroom/nestjs-libraries/openai/image.key';
// Nạp OAuth keys các kênh (nhập qua UI Settings) từ CONFIG_DIR/social-keys.env
// — bền qua rebuild container, trước khi provider nào đọc env.
import '@gitroom/nestjs-libraries/keys/social.keys';
import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
initializeSentry('backend', true);
import compression from 'compression';

import { loadSwagger } from '@gitroom/helpers/swagger/load.swagger';
import { json } from 'express';
import { Runtime } from '@temporalio/worker';
Runtime.install({ shutdownSignals: [] });

process.env.TZ = 'UTC';
// Chỉ backend chạy scheduler cào "Lò Bài Thắng" (orchestrator KHÔNG set cờ này).
process.env.RUN_VIRAL_CRAWLER = '1';

import cookieParser from 'cookie-parser';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { SubscriptionExceptionFilter } from '@gitroom/backend/services/auth/permissions/subscription.exception';
import { PostValidationExceptionFilter } from '@gitroom/backend/api/routes/posts.validation.exception';
import { HttpExceptionFilter } from '@gitroom/nestjs-libraries/services/exception.filter';
import { ConfigurationChecker } from '@gitroom/helpers/configuration/configuration.checker';
import { startMcp } from '@gitroom/nestjs-libraries/chat/start.mcp';

async function start() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    cors: {
      // LUÔN bật credentials: CopilotKit (trang Agent) fetch với credentials:"include";
      // thiếu Access-Control-Allow-Credentials → trình duyệt chặn → "[Network] Unknown error".
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'auth',
        'showorg',
        'impersonate',
        'x-copilotkit-runtime-client-gql-version',
      ],
      exposedHeaders: [
        'reload',
        'onboarding',
        'activate',
        'x-copilotkit-runtime-client-gql-version',
        ...(process.env.NOT_SECURED ? ['auth', 'showorg', 'impersonate'] : []),
      ],
      // Ngoài FRONTEND_URL, cho phép origin LAN NỘI BỘ cùng port frontend
      // (điện thoại/tablet mở http://<IP-máy>:4200) — chỉ dải IP private.
      origin: (origin, callback) => {
        const staticOrigins = [
          process.env.FRONTEND_URL,
          'http://localhost:6274',
          ...(process.env.MAIN_URL ? [process.env.MAIN_URL] : []),
        ];
        const frontendPort = (() => {
          try {
            return new URL(process.env.FRONTEND_URL || '').port || '4200';
          } catch {
            return '4200';
          }
        })();
        const privateLan = new RegExp(
          `^https?://(localhost|127\\.0\\.0\\.1|10\\.[0-9.]+|192\\.168\\.[0-9.]+|172\\.(1[6-9]|2[0-9]|3[01])\\.[0-9.]+):${frontendPort}$`,
          'i'
        );
        if (!origin || staticOrigins.includes(origin) || privateLan.test(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
    },
  });

  await startMcp(app);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    })
  );

  app.use(['/copilot/{*splat}', '/posts'], (req: any, res: any, next: any) => {
    json({ limit: '50mb' })(req, res, next);
  });

  app.use(cookieParser());
  app.use(compression());
  app.useGlobalFilters(new SubscriptionExceptionFilter());
  app.useGlobalFilters(new PostValidationExceptionFilter());
  app.useGlobalFilters(new HttpExceptionFilter());

  loadSwagger(app);

  const port = process.env.PORT || 3000;

  try {
    await app.listen(port);
    console.log('Backend started successfully on port ' + port);

    checkConfiguration(); // Do this last, so that users will see obvious issues at the end of the startup log without having to scroll up.

    Logger.log(`🚀 Backend is running on: http://localhost:${port}`);
  } catch (e) {
    Logger.error(`Backend failed to start on port ${port}`, e);
    // Thoát hẳn để pm2/Docker restart lại — nếu không tiến trình treo "zombie"
    // (pm2 thấy online, không bao giờ restart) khi temporal/DB chưa sẵn sàng
    // lúc boot lần đầu (temporal cần 1-3 phút tạo schema trước khi mở cổng).
    process.exit(1);
  }
}

function checkConfiguration() {
  const checker = new ConfigurationChecker();
  checker.readEnvFromProcess();
  checker.check();

  if (checker.hasIssues()) {
    for (const issue of checker.getIssues()) {
      Logger.warn(issue, 'Configuration issue');
    }

    Logger.warn('Configuration issues found: ' + checker.getIssuesCount());
  } else {
    Logger.log('Configuration check completed without any issues');
  }
}

start();
