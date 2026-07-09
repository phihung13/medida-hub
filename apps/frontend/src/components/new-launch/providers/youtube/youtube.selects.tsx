'use client';

import { FC, useEffect, useState } from 'react';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { Select } from '@gitroom/react/form/select';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Dropdown động tải danh sách từ provider YouTube qua /integrations/function.
// Dùng chung cho Category và Playlist — cả hai đều tuỳ chọn (có mục "để trống").
const YoutubeDynamicSelect: FC<{
  name: string;
  label: string;
  emptyLabel: string;
  funcName: 'categories' | 'playlists';
  onChange: (event: { target: { value: string; name: string } }) => void;
}> = (props) => {
  const { onChange, name, label, emptyLabel, funcName } = props;
  const t = useT();
  const customFunc = useCustomProviderFunction();
  const { getValues } = useSettings();
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<string>('');

  const onChangeInner = (event: {
    target: { value: string; name: string };
  }) => {
    setCurrent(event.target.value);
    onChange(event);
  };

  useEffect(() => {
    let alive = true;
    customFunc
      .get(funcName)
      .then((data) => {
        if (alive) setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setItems([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const existing = getValues()[name];
    if (existing) setCurrent(existing);
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="text-[12px] text-textColor/60 my-[8px]">
        {t('loading', 'Đang tải...')} {label.toLowerCase()}
      </div>
    );
  }

  if (!items.length) {
    return null;
  }

  return (
    <Select name={name} label={label} onChange={onChangeInner} value={current}>
      <option value="">{emptyLabel}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </Select>
  );
};

export const YoutubeCategory: FC<{
  name: string;
  onChange: (event: { target: { value: string; name: string } }) => void;
}> = (props) => {
  const t = useT();
  return (
    <YoutubeDynamicSelect
      {...props}
      funcName="categories"
      label={t('category', 'Danh mục')}
      emptyLabel={t('youtube_default_category', '-- Mặc định của kênh --')}
    />
  );
};

export const YoutubePlaylist: FC<{
  name: string;
  onChange: (event: { target: { value: string; name: string } }) => void;
}> = (props) => {
  const t = useT();
  return (
    <YoutubeDynamicSelect
      {...props}
      funcName="playlists"
      label={t('playlist', 'Playlist')}
      emptyLabel={t('youtube_no_playlist', '-- Không thêm vào playlist --')}
    />
  );
};
