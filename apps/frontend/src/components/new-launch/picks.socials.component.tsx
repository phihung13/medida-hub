'use client';

import { FC, useState } from 'react';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

// Chữ cái đầu của từ đầu + từ cuối: "Mầm Non Việt Anh" -> "MA".
const initialsOf = (name = '') => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
};

// Ảnh kênh thiếu hoặc tải lỗi (URL ảnh Facebook hết hạn là chuyện thường) thì
// hiện CHỮ CÁI ĐẦU thay cho /no-picture.jpg — trước đây là một loạt vòng tròn
// xám trống trông như ảnh tải hỏng và không phân biệt được kênh nào với kênh nào.
const ChannelAvatar: FC<{ src?: string; name: string; selected: boolean }> = ({
  src,
  name,
  selected,
}) => {
  const [failed, setFailed] = useState(false);
  const base = clsx(
    'rounded-full transition-all w-[42px] h-[42px] min-w-[42px] min-h-[42px] border-[1.5px]',
    selected ? 'border-[#000]' : 'border-transparent'
  );
  if (!src || failed || src.includes('no-picture')) {
    return (
      <div
        aria-hidden="true"
        className={clsx(
          base,
          'flex items-center justify-center bg-newColColor text-newTextColor text-[14px] font-[600]'
        )}
      >
        {initialsOf(name)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={42}
      height={42}
      onError={() => setFailed(true)}
      className={base}
    />
  );
};

export const PicksSocialsComponent: FC<{ toolTip?: boolean }> = ({
  toolTip,
}) => {
  const exising = useExistingData();

  const {
    locked,
    addOrRemoveSelectedIntegration,
    integrations,
    selectedIntegrations,
  } = useLaunchStore(
    useShallow((state) => ({
      integrations: state.integrations,
      selectedIntegrations: state.selectedIntegrations,
      addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      locked: state.locked,
    }))
  );

  return (
    <div className={clsx('flex', locked && 'opacity-50 pointer-events-none')}>
      <div className="flex flex-1">
        <div className="innerComponent flex-1 flex">
          <div className="flex flex-wrap gap-[12px] flex-1">
            {integrations
              .filter((f) => {
                if (exising.integration) {
                  return f.id === exising.integration;
                }
                return !f.inBetweenSteps && !f.disabled;
              })
              .map((integration) => (
                <div
                  key={integration.id}
                  className="flex gap-[8px] items-center"
                  {...(toolTip && {
                    'data-tooltip-id': 'tooltip',
                    'data-tooltip-content': integration.name,
                  })}
                >
                  {/* <button> thay cho <div onClick>: trước đây bàn phím không chọn
                      được kênh. Viền kênh đang chọn dùng màu nhấn chính (btnPrimary)
                      thay cho tím #622FF6 — một màu nhấn thứ ba giữa giao diện. */}
                  <button
                    type="button"
                    aria-label={integration.name}
                    aria-pressed={
                      selectedIntegrations.findIndex(
                        (p) => p.integration.id === integration.id
                      ) !== -1
                    }
                    aria-disabled={!!exising.integration}
                    onClick={() => {
                      if (exising.integration) {
                        return;
                      }
                      addOrRemoveSelectedIntegration(integration, {});
                    }}
                    className={clsx(
                      'cursor-pointer border-[2px] relative rounded-full flex justify-center items-center bg-fifth filter transition-all duration-500 outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary focus-visible:ring-offset-2 focus-visible:ring-offset-newBgColorInner',
                      selectedIntegrations.findIndex(
                        (p) => p.integration.id === integration.id
                      ) === -1
                        ? 'grayscale border-transparent'
                        : 'border-btnPrimary'
                    )}
                  >
                    <ChannelAvatar
                      src={integration.picture}
                      name={integration.name}
                      selected={
                        selectedIntegrations.findIndex(
                          (p) => p.integration.id === integration.id
                        ) !== -1
                      }
                    />
                    {integration.identifier === 'youtube' ? (
                      <img
                        src="/icons/platforms/youtube.svg"
                        className="absolute z-10 bottom-0 -end-[5px] min-w-[16px]"
                        width={16}
                      />
                    ) : (
                      <SafeImage
                        src={`/icons/platforms/${integration.identifier}.png`}
                        className="rounded-[4px] absolute z-10 bottom-0 -end-[5px] min-w-[16px] min-h-[16px]"
                        alt={integration.identifier}
                        width={16}
                        height={16}
                      />
                    )}
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
