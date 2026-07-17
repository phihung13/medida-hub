'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Nhập TÀI KHOẢN GỬI EMAIL (Gmail/SMTP hoặc Resend) ngay trong UI Settings —
// khỏi sửa env trên Coolify. Dùng để gửi BẢN TIN trang Phát hiện + thông báo.
// Gmail: bật Xác minh 2 bước → tạo "App password" tại
// myaccount.google.com/apppasswords, dùng làm mật khẩu (KHÔNG dùng mật khẩu
// đăng nhập Gmail thường).
type EmailStatus = {
  provider: string;
  host: string;
  port: string;
  secure: string;
  user: string;
  fromAddress: string;
  fromName: string;
  hasPass: boolean;
  hasResendKey: boolean;
  configured: boolean;
};

export const EmailSmtpComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [st, setSt] = useState<EmailStatus | null>(null);
  const [provider, setProvider] = useState('nodemailer');
  const [host, setHost] = useState('smtp.gmail.com');
  const [port, setPort] = useState('465');
  const [secure, setSecure] = useState('true');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [resendKey, setResendKey] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [fromName, setFromName] = useState('Trường Việt Anh');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');

  const load = useCallback(async () => {
    try {
      const res: EmailStatus = await (await fetch('/settings/email-config')).json();
      setSt(res);
      if (res.provider) setProvider(res.provider);
      if (res.host) setHost(res.host);
      if (res.port) setPort(res.port);
      if (res.secure) setSecure(res.secure);
      setUser(res.user || '');
      setFromAddress(res.fromAddress || '');
      if (res.fromName) setFromName(res.fromName);
    } catch {
      /* chưa cấu hình — dùng mặc định */
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const body: any = { provider, fromAddress: fromAddress.trim(), fromName: fromName.trim() };
      if (provider === 'nodemailer') {
        body.host = host.trim();
        body.port = port.trim();
        body.secure = secure;
        body.user = user.trim();
        if (pass) body.pass = pass; // để trống = giữ mật khẩu cũ
      } else if (provider === 'resend') {
        if (resendKey) body.resendKey = resendKey.trim();
      }
      const res = await fetch('/settings/email-config', { method: 'POST', body: JSON.stringify(body) });
      if (res.status >= 400) {
        toast.show(t('email_save_fail', 'Không lưu được — cần quyền quản trị hệ thống.'), 'warning');
        return;
      }
      setPass('');
      setResendKey('');
      toast.show(t('email_saved', 'Đã lưu cấu hình email.'), 'success');
      load();
    } finally {
      setSaving(false);
    }
  }, [provider, host, port, secure, user, pass, resendKey, fromAddress, fromName, load, t]);

  const sendTest = useCallback(async () => {
    setTesting(true);
    try {
      const res = await fetch('/settings/email-config/test', {
        method: 'POST',
        body: JSON.stringify({ to: testTo.trim() || undefined }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message || '');
      toast.show(`✅ ${t('email_test_ok', 'Đã gửi email thử tới')} ${d?.to}`, 'success');
    } catch (e: any) {
      toast.show(e?.message || t('email_test_fail', 'Gửi thử thất bại — kiểm lại thông tin.'), 'warning');
    } finally {
      setTesting(false);
    }
  }, [testTo, t]);

  return (
    <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
      <h3 className="text-[18px] mb-[4px]">📧 {t('email_title', 'Tài khoản gửi email (Gmail / SMTP)')}</h3>
      <div className="text-[13px] opacity-70 mb-[12px] leading-[1.6]">
        {t(
          'email_desc',
          'Dùng để gửi bản tin trang Phát hiện qua email. Gmail: bật Xác minh 2 bước rồi tạo "App password" tại myaccount.google.com/apppasswords — dùng chuỗi 16 ký tự đó làm mật khẩu (không phải mật khẩu đăng nhập Gmail).'
        )}
        {st?.configured ? ` — ✅ ${t('email_configured', 'Đã cấu hình.')}` : ` — ⚠ ${t('email_not_configured', 'Chưa cấu hình.')}`}
      </div>

      <div className="flex items-center gap-[8px] mb-[10px]">
        <span className="text-[13px] font-[600]">{t('email_provider', 'Nhà gửi:')}</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className="bg-input border border-fifth rounded-[6px] h-[38px] px-[10px] text-[13px] text-inputText outline-none">
          <option value="nodemailer">{t('email_provider_smtp', 'Gmail / SMTP')}</option>
          <option value="resend">Resend</option>
        </select>
      </div>

      {provider === 'nodemailer' ? (
        <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[10px]">
          <label className="flex flex-col gap-[4px] text-[12px] text-textItemBlur">{t('email_host', 'SMTP host')}
            <Input value={host} disableForm removeError name="ehost" label="" onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
          </label>
          <label className="flex flex-col gap-[4px] text-[12px] text-textItemBlur">{t('email_port', 'Cổng (465 SSL / 587 TLS)')}
            <Input value={port} disableForm removeError name="eport" label="" onChange={(e) => setPort(e.target.value)} placeholder="465" />
          </label>
          <label className="flex flex-col gap-[4px] text-[12px] text-textItemBlur">{t('email_user', 'Tài khoản Gmail')}
            <Input value={user} disableForm removeError name="euser" label="" onChange={(e) => setUser(e.target.value)} placeholder="ban@gmail.com" />
          </label>
          <label className="flex flex-col gap-[4px] text-[12px] text-textItemBlur">{t('email_pass', 'App password (16 ký tự)')}
            <Input value={pass} disableForm removeError type="password" name="epass" label="" onChange={(e) => setPass(e.target.value)} placeholder={st?.hasPass ? t('email_pass_saved', 'đã lưu — nhập để đổi') : 'abcd efgh ijkl mnop'} />
          </label>
        </div>
      ) : (
        <label className="flex flex-col gap-[4px] text-[12px] text-textItemBlur">{t('email_resend', 'Resend API key')}
          <Input value={resendKey} disableForm removeError type="password" name="eresend" label="" onChange={(e) => setResendKey(e.target.value)} placeholder={st?.hasResendKey ? t('email_pass_saved', 'đã lưu — nhập để đổi') : 're_...'} />
        </label>
      )}

      <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[10px] mt-[10px]">
        <label className="flex flex-col gap-[4px] text-[12px] text-textItemBlur">{t('email_from_addr', 'Email người gửi (From)')}
          <Input value={fromAddress} disableForm removeError name="efrom" label="" onChange={(e) => setFromAddress(e.target.value)} placeholder="ban@gmail.com" />
        </label>
        <label className="flex flex-col gap-[4px] text-[12px] text-textItemBlur">{t('email_from_name', 'Tên người gửi')}
          <Input value={fromName} disableForm removeError name="efromname" label="" onChange={(e) => setFromName(e.target.value)} placeholder="Trường Việt Anh" />
        </label>
      </div>

      <div className="flex items-center gap-[8px] flex-wrap mt-[14px]">
        <Button className="h-[40px]" onClick={save} disabled={saving}>
          {saving ? t('saving', 'Saving...') : `💾 ${t('save', 'Lưu')}`}
        </Button>
        <div className="flex-1" />
        <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={t('email_test_to', 'Email nhận thử (trống = chính bạn)')} className="bg-input border border-fifth rounded-[6px] h-[40px] px-[10px] text-[13px] text-inputText outline-none w-[240px] mobile:w-full" />
        <button onClick={sendTest} disabled={testing} className="h-[40px] px-[14px] rounded-[8px] text-[13px] font-[700] border border-newBgLineColor text-textItemBlur hover:text-textColor disabled:opacity-50">
          {testing ? t('email_testing', 'Đang gửi…') : `📨 ${t('email_test', 'Gửi thử')}`}
        </button>
      </div>
    </div>
  );
};

export default EmailSmtpComponent;
