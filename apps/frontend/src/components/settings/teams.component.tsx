'use client';

import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import React, { FC, useCallback, useMemo, useState } from 'react';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { capitalize } from 'lodash';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Input } from '@gitroom/react/form/input';
import { useForm, FormProvider } from 'react-hook-form';
import { Select } from '@gitroom/react/form/select';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { AddTeamMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/add.team.member.dto';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import copy from 'copy-to-clipboard';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const roles = [
  { name: 'Member (User)', value: 'USER' },
  { name: 'Admin', value: 'ADMIN' },
];

// Thông tin cá nhân của chính mình (tên hiển thị) — dùng cho mục "Tài khoản của tôi"
const usePersonal = () => {
  const fetch = useFetch();
  return useSWR(
    '/user/personal',
    async () => (await fetch('/user/personal')).json(),
    { revalidateOnFocus: false }
  );
};

// Đọc message lỗi từ HttpException của backend ({message, statusCode})
const readError = async (response: Response) => {
  try {
    const json = await response.json();
    return Array.isArray(json?.message)
      ? json.message.join(', ')
      : json?.message || '';
  } catch {
    return '';
  }
};

const origin = () =>
  typeof window === 'undefined' ? '' : window.location.origin;

// Hiển thị link (mời / đặt lại mật khẩu) để admin copy — vì máy chưa cấu hình
// email nên không gửi tự động được.
const LinkResult: FC<{ title: string; note: string; url: string }> = ({
  title,
  note,
  url,
}) => {
  const toast = useToaster();
  const t = useT();
  const [copied, setCopied] = useState(false);
  const doCopy = useCallback(() => {
    copy(url);
    setCopied(true);
    toast.show(t('link_copied', 'Link copied'), 'success');
  }, [url]);
  return (
    <div className="flex flex-col gap-[12px] p-[16px] pt-0">
      <div className="text-[14px] font-[600]">{title}</div>
      <div className="text-[13px] opacity-70">{note}</div>
      <div className="flex gap-[8px] items-center">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 bg-input border border-fifth rounded-[6px] px-[12px] h-[42px] text-[13px] text-inputText outline-none"
        />
        <Button onClick={doCopy} className="h-[42px] whitespace-nowrap">
          {copied ? t('copied', 'Copied ✓') : t('copy', 'Copy')}
        </Button>
      </div>
      <div className="text-[12px] opacity-50">
        {t('link_expires_2days', 'This link expires in 2 days.')}
      </div>
    </div>
  );
};

// Sửa tên hiển thị của chính mình
const EditName: FC<{ personal: any; reload: () => void }> = ({
  personal,
  reload,
}) => {
  const fetch = useFetch();
  const modals = useModals();
  const toast = useToaster();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const form = useForm({ values: { fullname: personal?.name || '' } });
  const submit = useCallback(
    async (values: { fullname: string }) => {
      const fullname = (values.fullname || '').trim();
      if (fullname.length < 3) {
        form.setError('fullname', {
          message: t('name_too_short', 'Name must be at least 3 characters'),
        });
        return;
      }
      setLoading(true);
      try {
        await fetch('/user/personal', {
          method: 'POST',
          body: JSON.stringify({
            fullname,
            bio: personal?.bio || '',
            ...(personal?.picture ? { picture: personal.picture } : {}),
          }),
        });
        toast.show(t('saved', 'Saved'), 'success');
        reload();
        modals.closeAll();
      } finally {
        setLoading(false);
      }
    },
    [personal, reload]
  );
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        <div className="relative flex gap-[12px] flex-col flex-1 p-[16px] pt-0">
          <Input
            label={t('display_name', 'Display name')}
            placeholder={t('display_name', 'Display name')}
            name="fullname"
          />
          <Button type="submit" loading={loading}>
            {t('save', 'Save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};

// Tự đổi mật khẩu (phải nhập mật khẩu hiện tại)
const ChangeMyPassword: FC = () => {
  const fetch = useFetch();
  const modals = useModals();
  const toast = useToaster();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const form = useForm({
    values: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const submit = useCallback(
    async (values: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) => {
      if (values.newPassword.length < 3) {
        form.setError('newPassword', {
          message: t(
            'password_too_short',
            'Password must be at least 3 characters'
          ),
        });
        return;
      }
      if (values.newPassword !== values.confirmPassword) {
        form.setError('confirmPassword', {
          message: t('password_mismatch', 'Passwords do not match'),
        });
        return;
      }
      setLoading(true);
      try {
        const response = await fetch('/user/change-password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
          }),
        });
        if (response.status !== 200) {
          form.setError('currentPassword', {
            message:
              (await readError(response)) ||
              t('wrong_password', 'Wrong password'),
          });
          return;
        }
        toast.show(t('password_changed', 'Password changed'), 'success');
        modals.closeAll();
      } finally {
        setLoading(false);
      }
    },
    []
  );
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        <div className="relative flex gap-[12px] flex-col flex-1 p-[16px] pt-0">
          <Input
            label={t('current_password', 'Current password')}
            placeholder={t('current_password', 'Current password')}
            name="currentPassword"
            type="password"
            autoComplete="off"
          />
          <Input
            label={t('label_new_password', 'New Password')}
            placeholder={t('label_new_password', 'New Password')}
            name="newPassword"
            type="password"
            autoComplete="off"
          />
          <Input
            label={t('confirm_password', 'Confirm new password')}
            placeholder={t('confirm_password', 'Confirm new password')}
            name="confirmPassword"
            type="password"
            autoComplete="off"
          />
          <Button type="submit" loading={loading}>
            {t('change_password', 'Change Password')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};

// Admin tự đổi email của chính mình (email = tên đăng nhập).
// KHÔNG reload trang sau khi đổi — reload làm trang "chết" vài giây (nhất là qua
// tunnel) và nuốt mất modal nếu người dùng thao tác tiếp; chỉ cần mutate SWR.
const ChangeMyEmail: FC<{ currentEmail: string; reload: () => void }> = ({
  currentEmail,
  reload,
}) => {
  const fetch = useFetch();
  const modals = useModals();
  const toast = useToaster();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const form = useForm({ values: { email: '', password: '' } });
  const submit = useCallback(
    async (values: { email: string; password: string }) => {
      setLoading(true);
      try {
        const response = await fetch('/user/change-email', {
          method: 'POST',
          body: JSON.stringify(values),
        });
        if (response.status !== 200) {
          form.setError('password', {
            message:
              (await readError(response)) ||
              t('wrong_password', 'Wrong password'),
          });
          return;
        }
        toast.show(
          t('email_changed', 'Email changed — use the new email to sign in'),
          'success'
        );
        reload();
        modals.closeAll();
      } finally {
        setLoading(false);
      }
    },
    [reload]
  );
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        <div className="relative flex gap-[12px] flex-col flex-1 p-[16px] pt-0">
          <div className="text-[13px] opacity-70">
            {t(
              'change_email_note',
              'Your email is also your login. Current email:'
            )}{' '}
            <span className="font-[600]">{currentEmail}</span>
          </div>
          <Input
            label={t('new_email', 'New email')}
            placeholder={t('new_email', 'New email')}
            name="email"
            type="email"
          />
          <Input
            label={t('confirm_with_password', 'Password (to confirm)')}
            placeholder={t('confirm_with_password', 'Password (to confirm)')}
            name="password"
            type="password"
            autoComplete="off"
          />
          <Button type="submit" loading={loading}>
            {t('change_email', 'Change email')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};

const AddMember: FC<{ reload: () => void }> = ({ reload }) => {
  const modals = useModals();
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const resolver = useMemo(() => classValidatorResolver(AddTeamMemberDto), []);
  const form = useForm({
    values: { email: '', role: '', sendEmail: false },
    resolver,
    mode: 'onChange',
  });

  const submit = useCallback(
    async (values: { email: string; role: string; sendEmail: boolean }) => {
      const { url } = await (
        await fetch('/settings/team', {
          method: 'POST',
          body: JSON.stringify({ ...values, sendEmail: false, origin: origin() }),
        })
      ).json();
      copy(url);
      reload();
      modals.closeAll();
      modals.openModal({
        title: t('invite_created', 'Invitation created'),
        withCloseButton: true,
        classNames: { modal: 'w-[100%] max-w-[560px]' },
        children: (
          <LinkResult
            title={t('send_this_link', 'Send this link to the invited person')}
            note={t(
              'invite_note',
              'The recipient opens the link → sets a password → gets in right away with the chosen role. (The link has been copied to your clipboard.)'
            )}
            url={url}
          />
        ),
      });
      toast.show(t('link_copied', 'Link copied'), 'success');
    },
    [reload]
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        <div className="relative flex gap-[12px] flex-col flex-1 p-[16px] pt-0">
          <div className="text-[13px] opacity-70">
            {t(
              'add_member_desc',
              'Enter the email of the person you want to give an account to and pick a role. The system generates a link for you to send them.'
            )}
          </div>
          <Input
            label="Email"
            placeholder={t('enter_email', 'Enter email')}
            name="email"
          />
          <Select label={t('role', 'Role')} name="role">
            <option value="">{t('select_role', 'Select a role')}</option>
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.name}
              </option>
            ))}
          </Select>
          <Button type="submit" className="mt-[10px]">
            {t('create_invite_link', 'Create invite link')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};

export const TeamsComponent = () => {
  const fetch = useFetch();
  const user = useUser();
  const modals = useModals();
  const toast = useToaster();
  const t = useT();
  const myLevel = user?.role === 'USER' ? 0 : user?.role === 'ADMIN' ? 1 : 2;
  const isAdmin = myLevel >= 1;
  const getLevel = useCallback(
    (role: 'USER' | 'ADMIN' | 'SUPERADMIN') =>
      role === 'USER' ? 0 : role === 'ADMIN' ? 1 : 2,
    []
  );
  const { data: personal, mutate: mutatePersonal } = usePersonal();
  const loadTeam = useCallback(async () => {
    return (await (await fetch('/settings/team')).json()).users as Array<{
      id: string;
      role: 'SUPERADMIN' | 'ADMIN' | 'USER';
      disabled?: boolean;
      user: { email: string; id: string };
    }>;
  }, []);
  const { data, mutate } = useSWR('/api/teams', loadTeam, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });

  const addMember = useCallback(() => {
    modals.openModal({
      classNames: { modal: 'bg-transparent text-textColor w-[100%] max-w-[520px]' },
      title: t('add_account', 'Add new account'),
      withCloseButton: true,
      children: <AddMember reload={mutate} />,
    });
  }, [t, mutate]);

  const resetPassword = useCallback(
    (p: { user: { id: string; email: string } }) => async () => {
      const res = await (
        await fetch(`/settings/team/${p.user.id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ origin: origin() }),
        })
      ).json();
      if (!res?.url) {
        toast.show(t('reset_failed', 'Could not create reset link'), 'warning');
        return;
      }
      copy(res.url);
      modals.openModal({
        title: t('reset_link_created', 'Password reset link'),
        withCloseButton: true,
        classNames: { modal: 'w-[100%] max-w-[560px]' },
        children: (
          <LinkResult
            title={`${t('for', 'For')}: ${p.user.email}`}
            note={t(
              'reset_note',
              'Send this link to that person so they can set a new password. (The link has been copied to your clipboard.)'
            )}
            url={res.url}
          />
        ),
      });
    },
    [t]
  );

  const remove = useCallback(
    (toRemove: { user: { id: string } }) => async () => {
      if (
        !(await deleteDialog(
          t('confirm_remove_member', 'Remove this member from the organization?'),
          t('remove', 'Remove')
        ))
      ) {
        return;
      }
      await fetch(`/settings/team/${toRemove.user.id}`, { method: 'DELETE' });
      await mutate();
    },
    [t]
  );

  // Đổi vai Member ↔ Admin — chỉ CHỦ tổ chức (backend cũng chặn).
  const changeRole = useCallback(
    (p: { role: string; user: { id: string; email: string } }) => async () => {
      const next = p.role === 'USER' ? 'ADMIN' : 'USER';
      if (
        !(await deleteDialog(
          next === 'ADMIN'
            ? t('confirm_promote', 'Nâng {{email}} lên Admin? Họ sẽ duyệt/sản xuất/xoá được nội dung.').replace('{{email}}', p.user.email)
            : t('confirm_demote', 'Hạ {{email}} xuống Member? Họ chỉ còn xem, không duyệt được nữa.').replace('{{email}}', p.user.email),
          t('change_role', 'Đổi vai')
        ))
      ) {
        return;
      }
      const res = await fetch(`/settings/team/${p.user.id}/role`, {
        method: 'POST',
        body: JSON.stringify({ role: next }),
      });
      if (!res.ok) {
        toast.show(t('change_role_failed', 'Không đổi được vai — thử lại.'), 'warning');
        return;
      }
      toast.show(
        t('change_role_done', 'Đã đổi vai — người đó cần tải lại trang để thấy thay đổi.'),
        'success'
      );
      await mutate();
    },
    [t, mutate]
  );

  // Chuyển vai CHỦ tổ chức cho người khác — mình xuống Admin. Đổi cả quyền của
  // CHÍNH mình nên xong thì tải lại trang cho context sạch.
  const transferOwner = useCallback(
    (p: { user: { id: string; email: string } }) => async () => {
      if (
        !(await deleteDialog(
          t(
            'confirm_transfer',
            'Trao vai CHỦ tổ chức cho {{email}}? BẠN sẽ xuống Admin (vẫn duyệt được, thôi quản thành viên). Lưu ý: quyền quản trị HỆ THỐNG (key AI, cấu hình) là cờ riêng, không đổi theo.'
          ).replace('{{email}}', p.user.email),
          t('transfer_owner', 'Chuyển chủ')
        ))
      ) {
        return;
      }
      const res = await fetch(`/settings/team/${p.user.id}/transfer-superadmin`, {
        method: 'POST',
      });
      if (!res.ok) {
        toast.show(t('transfer_failed', 'Không chuyển được — thử lại.'), 'warning');
        return;
      }
      toast.show(t('transfer_done', 'Đã chuyển chủ — đang tải lại trang…'), 'success');
      setTimeout(() => window.location.reload(), 1200);
    },
    [t]
  );

  // Gộp MỌI tài khoản của hệ thống về tổ chức này (chỉ super admin thấy nút).
  // Chữa cảnh tài khoản tự đăng ký sinh tổ chức riêng → vào /viral thấy kho
  // rỗng. Người được gộp vào với vai Member (chỉ xem); muốn ai duyệt được thì
  // xoá khỏi team rồi mời lại làm Admin.
  const mergeAll = useCallback(async () => {
    if (
      !(await deleteDialog(
        t(
          'confirm_merge_all',
          'Gộp TẤT CẢ tài khoản hiện có về tổ chức này? Ai chưa thuộc tổ chức sẽ được thêm làm Member (chỉ xem); tài khoản của họ ở tổ chức khác sẽ bị tắt để đăng nhập vào thẳng đây.'
        ),
        t('merge_all_confirm', 'Gộp tất cả')
      ))
    ) {
      return;
    }
    const res = await (
      await fetch('/settings/team/merge-all', { method: 'POST' })
    ).json();
    if (typeof res?.totalUsers !== 'number') {
      toast.show(t('merge_all_failed', 'Không gộp được — thử lại.'), 'warning');
      return;
    }
    const parts = [
      `${res.totalUsers} tài khoản`,
      `thêm mới ${res.added?.length || 0}`,
      ...(res.reEnabled?.length ? [`bật lại ${res.reEnabled.length}`] : []),
      `tắt ${res.disabledElsewhere || 0} org cá nhân`,
      ...(res.skippedMultiMemberOrgs
        ? [`chừa ${res.skippedMultiMemberOrgs} tổ chức thật`]
        : []),
    ];
    toast.show(
      t('merge_all_done', 'Đã gộp xong: ') + parts.join(' · '),
      'success'
    );
    await mutate();
  }, [t, mutate]);

  const name = (email: string) =>
    capitalize(email.split('@')[0]).split('.')[0];

  const editMyName = useCallback(() => {
    modals.openModal({
      classNames: { modal: 'bg-transparent text-textColor w-[100%] max-w-[480px]' },
      title: t('edit_name', 'Edit display name'),
      withCloseButton: true,
      children: <EditName personal={personal} reload={mutatePersonal} />,
    });
  }, [t, personal, mutatePersonal]);

  const changeMyPassword = useCallback(() => {
    modals.openModal({
      classNames: { modal: 'bg-transparent text-textColor w-[100%] max-w-[480px]' },
      title: t('change_password', 'Change Password'),
      withCloseButton: true,
      children: <ChangeMyPassword />,
    });
  }, [t]);

  const myEmail = personal?.email || user?.email || '';

  const changeMyEmail = useCallback(() => {
    modals.openModal({
      classNames: { modal: 'bg-transparent text-textColor w-[100%] max-w-[480px]' },
      title: t('change_email', 'Change email'),
      withCloseButton: true,
      children: (
        <ChangeMyEmail currentEmail={myEmail} reload={mutatePersonal} />
      ),
    });
  }, [t, myEmail, mutatePersonal]);

  const myDisplayName =
    personal?.name && !personal.name.includes('###')
      ? personal.name
      : name(user?.email || '');

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('my_account', 'My account')}</h3>
      <div className="text-customColor18 mt-[4px] text-[13px]">
        {t(
          'my_account_desc',
          'Your own account: display name, password'
        )}
        {isAdmin ? ` ${t('and_email', 'and login email')}` : ''}
        .
      </div>
      <div className="my-[16px] bg-sixth border-fifth border rounded-[8px] p-[24px] mobile:p-[14px] flex items-center gap-[12px] flex-wrap">
        <div className="w-[36px] h-[36px] rounded-full bg-btnPrimary/20 text-btnPrimary flex items-center justify-center text-[14px] font-[700] uppercase">
          {(myDisplayName || '?').slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-[600] truncate">{myDisplayName}</div>
          <div className="text-[12px] opacity-60 truncate">{myEmail}</div>
        </div>
        {/* Mobile: nhóm nút xuống hàng riêng full-width, chạm ≥40px */}
        <div className="flex gap-[6px] flex-wrap mobile:w-full mobile:gap-[8px]">
          <button
            type="button"
            onClick={editMyName}
            className="text-[12px] rounded-[6px] px-[10px] py-[6px] bg-newColColor border border-fifth hover:bg-boxHover mobile:flex-1 mobile:min-h-[40px] mobile:px-[14px] mobile:whitespace-nowrap tap-shrink"
          >
            {t('edit_name', 'Edit display name')}
          </button>
          <button
            type="button"
            onClick={changeMyPassword}
            className="text-[12px] rounded-[6px] px-[10px] py-[6px] bg-newColColor border border-fifth hover:bg-boxHover mobile:flex-1 mobile:min-h-[40px] mobile:px-[14px] mobile:whitespace-nowrap tap-shrink"
          >
            {t('change_password', 'Change Password')}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={changeMyEmail}
              className="text-[12px] rounded-[6px] px-[10px] py-[6px] bg-newColColor border border-fifth hover:bg-boxHover mobile:flex-1 mobile:min-h-[40px] mobile:px-[14px] mobile:whitespace-nowrap tap-shrink"
            >
              {t('change_email', 'Change email')}
            </button>
          )}
        </div>
      </div>

      <h3 className="text-[20px]">{t('team_members', 'Accounts & members')}</h3>
      <div className="text-customColor18 mt-[4px] text-[13px]">
        {isAdmin
          ? t(
              'team_desc_admin',
              'Only admins can create accounts and invite others. Create a link → send it to them → they set a password and get in right away.'
            )
          : t(
              'team_desc_user',
              'List of members in the organization. Only admins can create or remove accounts.'
            )}
      </div>

      <div className="my-[16px] bg-sixth border-fifth border rounded-[8px] p-[24px] mobile:p-[14px] flex flex-col gap-[18px]">
        <div className="flex flex-col gap-[10px]">
          {(data || []).map((p) => {
            const canManage = +myLevel > +getLevel(p.role);
            return (
              // Mobile: cho wrap để avatar+tên+badge ở hàng 1, nút quản trị rơi
              // xuống hàng 2 full-width — desktop vẫn 1 hàng như cũ
              <div
                key={p.user.id}
                className="flex items-center gap-[12px] py-[8px] border-b border-fifth/40 last:border-0 mobile:flex-wrap mobile:py-[12px]"
              >
                <div className="w-[36px] h-[36px] rounded-full bg-btnPrimary/20 text-btnPrimary flex items-center justify-center text-[14px] font-[700] uppercase">
                  {name(p.user.email).slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-[600] truncate">
                    {name(p.user.email)}
                  </div>
                  <div className="text-[12px] opacity-60 truncate">
                    {p.user.email}
                  </div>
                </div>
                <div
                  className={
                    'text-[11px] font-[600] rounded-[6px] px-[8px] py-[3px] ' +
                    (p.role === 'USER'
                      ? 'bg-newColColor text-textItemBlur'
                      : 'bg-btnPrimary/15 text-btnPrimary')
                  }
                >
                  {p.role === 'USER'
                    ? t('user', 'Member')
                    : p.role === 'ADMIN'
                    ? t('admin', 'Admin')
                    : t('super_admin', 'Super Admin')}
                </div>
                {p.disabled && (
                  <span className="text-[10.5px] font-[700] rounded-[6px] px-[7px] py-[2px] bg-amber-400/15 text-amber-400" title={t('member_disabled_hint', 'Tài khoản này chưa thuộc tổ chức (đang tắt) — không đổi vai được cho tới khi họ tham gia')}>
                    {t('member_disabled', 'đang tắt')}
                  </span>
                )}
                {/* Đổi vai/chuyển chủ vô nghĩa với membership đang tắt (backend
                    cũng chặn) → chỉ hiện nút quản trị khi thành viên đang bật */}
                {isAdmin && canManage && !p.disabled ? (
                  <div className="flex gap-[6px] flex-wrap mobile:w-full mobile:gap-[8px]">
                    {/* Đổi vai + chuyển chủ: chỉ CHỦ tổ chức (myLevel 2) — khớp
                        luật backend changeMemberRole/transferSuperAdmin */}
                    {myLevel >= 2 && (
                      <button
                        type="button"
                        onClick={changeRole(p)}
                        title={
                          p.role === 'USER'
                            ? t('promote_hint', 'Nâng lên Admin — duyệt/sản xuất được trên trang Phát hiện')
                            : t('demote_hint', 'Hạ xuống Member — chỉ xem')
                        }
                        className="text-[12px] rounded-[6px] px-[10px] py-[6px] bg-btnPrimary/10 text-btnPrimary border border-btnPrimary/30 hover:bg-btnPrimary/20 mobile:flex-1 mobile:min-h-[40px] mobile:px-[14px] tap-shrink"
                      >
                        {p.role === 'USER'
                          ? `↑ ${t('promote_admin', 'Nâng Admin')}`
                          : `↓ ${t('demote_member', 'Hạ Member')}`}
                      </button>
                    )}
                    {myLevel >= 2 && (
                      <button
                        type="button"
                        onClick={transferOwner(p)}
                        title={t(
                          'transfer_hint',
                          'Trao vai CHỦ tổ chức cho người này — bạn xuống Admin'
                        )}
                        className="text-[12px] rounded-[6px] px-[10px] py-[6px] bg-newColColor border border-fifth hover:bg-boxHover mobile:flex-1 mobile:min-h-[40px] mobile:px-[14px] tap-shrink"
                      >
                        👑 {t('transfer_owner', 'Chuyển chủ')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={resetPassword(p)}
                      className="text-[12px] rounded-[6px] px-[10px] py-[6px] bg-newColColor border border-fifth hover:bg-boxHover mobile:flex-1 mobile:min-h-[40px] mobile:px-[14px] tap-shrink"
                    >
                      {t('reset_password', 'Reset password')}
                    </button>
                    <button
                      type="button"
                      onClick={remove(p)}
                      className="text-[12px] rounded-[6px] px-[10px] py-[6px] text-red-500 hover:bg-red-500/10 mobile:flex-1 mobile:min-h-[40px] mobile:px-[14px] mobile:border mobile:border-red-500/30 tap-shrink"
                    >
                      {t('remove', 'Remove')}
                    </button>
                  </div>
                ) : (
                  <div className="w-[1px] mobile:hidden" />
                )}
              </div>
            );
          })}
        </div>
        {/* Gộp = quyền HỆ THỐNG (cờ isSuperAdmin), KHÔNG phải role tổ chức —
            phải khớp backend assertSuperAdmin, nên đặt NGOÀI khối isAdmin, không
            thì cựu chủ vừa chuyển giao (xuống Admin/Member) mất luôn nút Gộp. */}
        {(isAdmin || !!user?.isSuperAdmin) && (
          <div className="flex gap-[8px] flex-wrap items-center">
            {isAdmin && (
              <Button onClick={addMember}>
                {t('add_account', 'Add new account')}
              </Button>
            )}
            {!!user?.isSuperAdmin && (
              <button
                onClick={mergeAll}
                className="text-[12px] rounded-[6px] px-[10px] py-[6px] bg-newColColor border border-fifth hover:bg-boxHover"
                title={t(
                  'merge_all_hint',
                  'Đưa mọi tài khoản tự đăng ký (đang kẹt ở tổ chức riêng, thấy kho rỗng) về tổ chức này làm Member'
                )}
              >
                🧲 {t('merge_all', 'Gộp tất cả tài khoản về tổ chức này')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
