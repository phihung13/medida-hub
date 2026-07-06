'use client';

import { FC, ReactNode, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';

const SWR_OPTIONS = {
  refreshWhenHidden: false,
  refreshWhenOffline: false,
  revalidateOnFocus: false,
  revalidateIfStale: false,
  revalidateOnMount: true,
  revalidateOnReconnect: false,
  refreshInterval: 0,
};

export interface ContinueProviderProps {
  onSave: (data: any) => Promise<void>;
  existingId: string[];
  initialData?: any[];
  isSaving?: boolean;
}

export interface EmptyStateMessage {
  key: string;
  text: string;
}

export interface ContinueProviderConfig<TItem, TSelection> {
  endpoint: string;
  swrKey: string;
  titleKey: string;
  titleDefault: string;
  emptyStateMessages: EmptyStateMessage[];
  getSelectionValue: (item: TItem) => TSelection;
  transformSaveData: (selection: TSelection) => any;
  renderItem: (item: TItem, isSelected: boolean) => ReactNode;
  isSelected: (item: TItem, selection: TSelection | null) => boolean;
  getItemId: (item: TItem) => string;
  // Cho chọn NHIỀU (vd Facebook nhiều Page). transformSaveDataMultiple nhận
  // mảng selection → payload {pages:[...]}.
  multiple?: boolean;
  transformSaveDataMultiple?: (selections: TSelection[]) => any;
}

export function withContinueProvider<TItem, TSelection>(
  config: ContinueProviderConfig<TItem, TSelection>
): FC<ContinueProviderProps> {
  const {
    endpoint,
    swrKey,
    titleKey,
    titleDefault,
    emptyStateMessages,
    getSelectionValue,
    transformSaveData,
    renderItem,
    isSelected,
    getItemId,
    multiple,
    transformSaveDataMultiple,
  } = config;

  return function ContinueProviderComponent(props: ContinueProviderProps) {
    const { onSave, existingId, initialData, isSaving } = props;
    const call = useCustomProviderFunction();
    const t = useT();
    const [selection, setSelection] = useState<TSelection | null>(null);
    // Multi-select: theo dõi theo ITEM ID (selection có thể là object nên không
    // dùng === được).
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const loadData = useCallback(async () => {
      // Skip fetch if initial data was provided
      if (initialData) {
        return initialData;
      }
      try {
        return await call.get(endpoint);
      } catch (e) {
        // Handle error silently
      }
    }, [initialData]);

    const { data, isLoading } = useSWR(
      initialData ? null : swrKey,
      loadData,
      SWR_OPTIONS
    );

    const resolvedData = initialData || data;

    const handleSelect = useCallback(
      (item: TItem) => () => {
        if (multiple) {
          const itemId = getItemId(item);
          setSelectedIds((prev) =>
            prev.includes(itemId)
              ? prev.filter((s) => s !== itemId)
              : [...prev, itemId]
          );
        } else {
          setSelection(getSelectionValue(item));
        }
      },
      []
    );

    const handleSave = useCallback(async () => {
      if (multiple) {
        // Map id đã chọn -> item -> selection value -> payload (dùng chung
        // transformSaveData của bản chọn 1 cho từng phần tử).
        const items = ((resolvedData as TItem[]) || []).filter((it) =>
          selectedIds.includes(getItemId(it))
        );
        const selections = items.map((it) => getSelectionValue(it));
        if (selections.length) {
          await onSave(
            transformSaveDataMultiple
              ? transformSaveDataMultiple(selections)
              : // Mặc định: mỗi phần tử map qua transformSaveData (đúng shape
                // data từng provider), gói vào { pages: [...] }.
                { pages: selections.map((s) => transformSaveData(s)) }
          );
        }
      } else if (selection) {
        await onSave(transformSaveData(selection));
      }
    }, [onSave, selection, selectedIds, resolvedData]);

    const filteredData = useMemo(() => {
      return (
        (resolvedData as TItem[])?.filter(
          (item) => !existingId.includes(getItemId(item))
        ) || []
      );
    }, [resolvedData, existingId]);

    if (!isLoading && !resolvedData?.length) {
      return (
        <div className="text-center flex flex-col justify-center items-center text-[18px] leading-[26px] h-[300px]">
          {emptyStateMessages.map((msg, index) => (
            <span key={msg.key}>
              {t(msg.key, msg.text)}
              {index < emptyStateMessages.length - 1 && (
                <>
                  <br />
                  <br />
                </>
              )}
            </span>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-[20px]">
        <div>{t(titleKey, titleDefault)}</div>
        <div className="grid grid-cols-3 justify-items-center select-none cursor-pointer gap-[10px]">
          {filteredData.map((item) => {
            const sel = multiple
              ? selectedIds.includes(getItemId(item))
              : isSelected(item, selection);
            return (
              <div
                key={getItemId(item)}
                className={clsx(
                  'relative flex flex-col w-full text-center gap-[10px] border border-input p-[10px] hover:bg-seventh rounded-[8px]',
                  sel && 'bg-seventh border-primary'
                )}
                onClick={handleSelect(item)}
              >
                {multiple && sel && (
                  <div className="absolute top-[6px] end-[6px] w-[20px] h-[20px] rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-[700]">
                    ✓
                  </div>
                )}
                {renderItem(item, sel)}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-[12px]">
          <Button
            disabled={(multiple ? !selectedIds.length : !selection) || isSaving}
            loading={isSaving}
            onClick={handleSave}
          >
            {multiple && selectedIds.length
              ? t('save', 'Save') + ` (${selectedIds.length})`
              : t('save', 'Save')}
          </Button>
          {multiple && (
            <span className="text-[13px] opacity-60">
              {t('click_multiple_pages', 'Click to select multiple channels at once')}
            </span>
          )}
        </div>
      </div>
    );
  };
}
