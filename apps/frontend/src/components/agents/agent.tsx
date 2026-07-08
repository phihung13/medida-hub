'use client';

import React, {
  createContext,
  FC,
  useCallback,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import clsx from 'clsx';
import useCookie from 'react-use-cookie';
import useSWR, { useSWRConfig } from 'swr';
import { orderBy } from 'lodash';
import { SVGLine } from '@gitroom/frontend/components/launches/launches.component';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useWaitForClass } from '@gitroom/helpers/utils/use.wait.for.class';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import { Integration } from '@prisma/client';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { TrashIcon } from '@gitroom/frontend/components/ui/icons';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { BulkComponent } from '@gitroom/frontend/components/bulk/bulk.component';

export const MediaPortal: FC<{
  media: { path: string; id: string }[];
  value: string;
  setMedia: (event: {
    target: {
      name: string;
      value?: {
        id: string;
        path: string;
        alt?: string;
        thumbnail?: string;
        thumbnailTimestamp?: number;
      }[];
    };
  }) => void;
}> = ({ media, setMedia, value }) => {
  const waitForClass = useWaitForClass('copilotKitMessages');
  const t = useT();
  if (!waitForClass) return null;
  return (
    <div className="pl-[14px] pr-[24px] whitespace-nowrap editor rm-bg flex items-center gap-[8px]">
      <MultiMediaComponent
        allData={[{ content: value }]}
        text={value}
        label={t('attachments', 'Attachments')}
        description=""
        value={media}
        dummy={false}
        name="image"
        onChange={setMedia}
        onOpen={() => {}}
        onClose={() => {}}
      />
      <ExcelAttach />
    </div>
  );
};

// Nút "chèn file Excel" cạnh nút chèn phương tiện trong ô chat Agent. Chèn
// file → parse (tạo BulkFile) → làm mới mục "Lịch sử file" ở sidebar (global
// SWR mutate 'bulk-files') → mở bảng duyệt luôn.
export const ExcelAttach: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const modal = useModals();
  const { mutate } = useSWRConfig();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [loading, setLoading] = React.useState(false);

  const onPick = useCallback(
    async (f: File | null) => {
      if (!f) return;
      setLoading(true);
      try {
        const form = new FormData();
        form.append('file', f);
        const res = await (
          await fetch('/bulk/parse', { method: 'POST', body: form })
        ).json();
        mutate('bulk-files'); // làm mới lịch sử file ở sidebar
        modal.openModal({
          title: f.name,
          closeOnClickOutside: false,
          closeOnEscape: true,
          size: '90%',
          children: (
            <BulkComponent
              fileId={res?.fileId}
              onChanged={() => mutate('bulk-files')}
            />
          ),
        });
      } finally {
        setLoading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [fetch, modal, mutate]
  );

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] || null)}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        title={t('agent_attach_excel', 'Chèn file Excel lịch đăng')}
        className="shrink-0 w-[34px] h-[34px] grid place-items-center rounded-[8px] text-textItemBlur hover:text-[#32d583] hover:bg-[#32d583]/10 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <span className="text-[13px]">…</span>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M11.5 2.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5L11.5 2.5Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path
              d="M11.5 2.5V6.5h4M8 11l4 4M12 11l-4 4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </>
  );
};

export const AgentList: FC<{ onChange: (arr: any[]) => void }> = ({
  onChange,
}) => {
  const fetch = useFetch();
  const t = useT();
  const [selected, setSelected] = useState([]);

  const load = useCallback(async () => {
    return (await (await fetch('/integrations/list')).json()).integrations;
  }, []);

  const [collapseMenu, setCollapseMenu] = useCookie('collapseMenu', '0');

  const { data } = useSWR('integrations', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });

  const setIntegration = useCallback(
    (integration: Integration) => () => {
      if (selected.some((p) => p.id === integration.id)) {
        onChange(selected.filter((p) => p.id !== integration.id));
        setSelected(selected.filter((p) => p.id !== integration.id));
      } else {
        onChange([...selected, integration]);
        setSelected([...selected, integration]);
      }
    },
    [selected]
  );

  const sortedIntegrations = useMemo(() => {
    return orderBy(
      data || [],
      ['type', 'disabled', 'identifier'],
      ['desc', 'asc', 'asc']
    );
  }, [data]);

  return (
    <div
      className={clsx(
        'trz bg-newBgColorInner flex flex-col gap-[15px] transition-all relative',
        collapseMenu === '1' ? 'group sidebar w-[100px]' : 'w-[260px]'
      )}
    >
      <div className="absolute top-0 start-0 w-full h-full p-[20px] overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
        <div className="flex items-center">
          <h2 className="group-[.sidebar]:hidden flex-1 text-[20px] font-[500] mb-[15px]">
            {t('select_channels', 'Select Channels')}
          </h2>
          <div
            onClick={() => setCollapseMenu(collapseMenu === '1' ? '0' : '1')}
            className="-mt-3 group-[.sidebar]:rotate-[180deg] group-[.sidebar]:mx-auto text-btnText bg-btnSimple rounded-[6px] w-[24px] h-[24px] flex items-center justify-center cursor-pointer select-none"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="7"
              height="13"
              viewBox="0 0 7 13"
              fill="none"
            >
              <path
                d="M6 11.5L1 6.5L6 1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <div className={clsx('flex flex-col gap-[15px]')}>
          {sortedIntegrations.map((integration, index) => (
            <div
              onClick={setIntegration(integration)}
              key={integration.id}
              className={clsx(
                'flex gap-[12px] items-center group/profile justify-center hover:bg-boxHover rounded-e-[8px] hover:opacity-100 cursor-pointer',
                !selected.some((p) => p.id === integration.id) && 'opacity-20'
              )}
            >
              <div
                className={clsx(
                  'relative rounded-full flex justify-center items-center gap-[6px]',
                  integration.disabled && 'opacity-50'
                )}
              >
                {(integration.inBetweenSteps || integration.refreshNeeded) && (
                  <div className="absolute start-0 top-0 w-[39px] h-[46px] cursor-pointer">
                    <div className="bg-red-500 w-[15px] h-[15px] rounded-full start-0 -top-[5px] absolute z-[200] text-[10px] flex justify-center items-center">
                      !
                    </div>
                    <div className="bg-primary/60 w-[39px] h-[46px] start-0 top-0 absolute rounded-full z-[199]" />
                  </div>
                )}
                <div className="h-full w-[4px] -ms-[12px] rounded-s-[3px] opacity-0 group-hover/profile:opacity-100 transition-opacity">
                  <SVGLine />
                </div>
                <ImageWithFallback
                  fallbackSrc={`/icons/platforms/${integration.identifier}.png`}
                  src={integration.picture}
                  className="rounded-[8px]"
                  alt={integration.identifier}
                  width={36}
                  height={36}
                />
                <SafeImage
                  src={`/icons/platforms/${integration.identifier}.png`}
                  className="rounded-[8px] absolute z-10 bottom-[5px] -end-[5px] border border-fifth"
                  alt={integration.identifier}
                  width={18.41}
                  height={18.41}
                />
              </div>
              <div
                className={clsx(
                  'flex-1 whitespace-nowrap text-ellipsis overflow-hidden group-[.sidebar]:hidden',
                  integration.disabled && 'opacity-50'
                )}
              >
                {integration.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const PropertiesContext = createContext({ properties: [] });
export const Agent: FC<{ children: ReactNode }> = ({ children }) => {
  const [properties, setProperties] = useState([]);

  return (
    <PropertiesContext.Provider value={{ properties }}>
      <AgentList onChange={setProperties} />
      <div className="bg-newBgColorInner flex flex-1">{children}</div>
      <Threads />
    </PropertiesContext.Provider>
  );
};

const Threads: FC = () => {
  const fetch = useFetch();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const threads = useCallback(async () => {
    return (await fetch('/copilot/list')).json();
  }, []);
  const { id } = useParams<{ id: string }>();

  const { data, mutate } = useSWR('threads', threads);

  const deleteChat = useCallback(
    (threadId: string) => async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        !(await deleteDialog(
          t('delete_chat_confirm', 'Delete this chat?'),
          t('yes_delete', 'Delete')
        ))
      ) {
        return;
      }
      await fetch(`/copilot/list/${threadId}/delete`, { method: 'POST' });
      await mutate();
      // Đang mở đúng chat vừa xóa → về trang tạo chat mới.
      if (threadId === id) {
        router.push('/agents');
      }
    },
    [fetch, mutate, id, router, t]
  );

  return (
    <div
      className={clsx(
        'trz bg-newBgColorInner flex flex-col gap-[15px] transition-all relative',
        'w-[260px]'
      )}
    >
      <div className="absolute top-0 start-0 w-full h-full p-[20px] overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
        <div className="mb-[15px] justify-center flex group-[.sidebar]:pb-[15px]">
          <Link
            href={`/agents`}
            className="text-white whitespace-nowrap flex-1 pt-[12px] pb-[14px] ps-[16px] pe-[20px] group-[.sidebar]:p-0 min-h-[44px] max-h-[44px] rounded-md bg-btnPrimary flex justify-center items-center gap-[5px] outline-none"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="21"
              height="20"
              viewBox="0 0 21 20"
              fill="none"
              className="min-w-[21px] min-h-[20px]"
            >
              <path
                d="M10.5001 4.16699V15.8337M4.66675 10.0003H16.3334"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex-1 text-start text-[16px] group-[.sidebar]:hidden">
              {t('start_a_new_chat', 'Start a new chat')}
            </div>
          </Link>
        </div>
        <div className="flex flex-col gap-[1px]">
          {data?.threads?.map((p: any) => (
            <div
              key={p.id}
              className={clsx(
                'group/thread flex items-center gap-[4px] hover:bg-newBgColor px-[10px] py-[6px] rounded-[10px]',
                p.id === id && 'bg-newBgColor'
              )}
            >
              <Link
                href={`/agents/${p.id}`}
                className="flex-1 min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap cursor-pointer"
              >
                {p.title}
              </Link>
              <button
                onClick={deleteChat(p.id)}
                title={t('delete_chat', 'Delete chat')}
                className="shrink-0 opacity-0 group-hover/thread:opacity-100 transition-opacity text-textItemBlur hover:text-red-500 p-[2px]"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
        <BulkFilesSection />
      </div>
    </div>
  );
};

// ===== Lịch sử file Excel (GĐ3) — nằm dưới lịch sử chat của trang Agent =====
const BulkFilesSection: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const modal = useModals();

  const loadFiles = useCallback(
    async () => (await fetch('/bulk/files')).json(),
    []
  );
  const { data, mutate } = useSWR('bulk-files', loadFiles, {
    revalidateOnFocus: false,
  });
  const files = data?.files || [];

  const openFile = useCallback(
    (fileId?: string, name?: string) => {
      modal.openModal({
        title:
          name ||
          t('bulk_title', 'Nhập lịch đăng từ Excel'),
        closeOnClickOutside: false, // tránh lỡ tay đóng mất bảng đang duyệt dở
        closeOnEscape: true,
        size: '90%',
        children: (
          <BulkComponent fileId={fileId} onChanged={() => mutate()} />
        ),
      });
    },
    [modal, mutate, t]
  );

  const removeFile = useCallback(
    (fileId: string) => async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        !(await deleteDialog(
          t('bulk_delete_file_confirm', 'Xóa file này khỏi lịch sử? (Bài đã lên lịch KHÔNG bị ảnh hưởng)'),
          t('yes_delete', 'Delete')
        ))
      ) {
        return;
      }
      await fetch(`/bulk/files/${fileId}/delete`, { method: 'POST' });
      mutate();
    },
    [fetch, mutate, t]
  );

  return (
    <div className="mt-[18px] flex flex-col gap-[6px]">
      <div className="flex items-center gap-[6px] px-[10px]">
        <div className="text-[11px] font-[800] tracking-[0.08em] uppercase text-newTableText/50 flex-1">
          {t('bulk_files_title', 'Lịch sử file')}
        </div>
        <button
          onClick={() => openFile()}
          title={t('bulk_import_new', 'Nhập file Excel/CSV mới')}
          className="text-[#1e6fd9] hover:bg-[#1e6fd9]/10 rounded-[6px] px-[6px] py-[2px] text-[16px] leading-none font-[700]"
        >
          +
        </button>
      </div>
      {!files.length ? (
        <div className="px-[10px] text-[11.5px] text-newTableText/40">
          {t('bulk_files_empty', 'Chưa nhập file nào — bấm + để nhập Excel.')}
        </div>
      ) : (
        <div className="flex flex-col gap-[1px]">
          {files.map((f: any) => (
            <div
              key={f.id}
              onClick={() => openFile(f.id, f.name)}
              className="group/file flex items-center gap-[6px] hover:bg-newBgColor px-[10px] py-[6px] rounded-[10px] cursor-pointer"
            >
              <span className="shrink-0 text-[13px]">📄</span>
              <div className="flex-1 min-w-0">
                <div className="overflow-ellipsis overflow-hidden whitespace-nowrap text-[12.5px]">
                  {f.name}
                </div>
                <div className="text-[10.5px] text-newTableText/45 tabular-nums">
                  {new Date(f.createdAt).toLocaleDateString('vi-VN')} ·{' '}
                  <span
                    className={
                      f.done >= f.total && f.total > 0
                        ? 'text-[#32d583]'
                        : ''
                    }
                  >
                    {f.done}/{f.total}{' '}
                    {t('bulk_files_scheduled', 'đã lên lịch')}
                  </span>
                </div>
              </div>
              <button
                onClick={removeFile(f.id)}
                title={t('bulk_delete_file', 'Xóa khỏi lịch sử')}
                className="shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity text-textItemBlur hover:text-red-500 p-[2px]"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
