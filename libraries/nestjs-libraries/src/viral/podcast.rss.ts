import { PodcastConfig } from '@gitroom/nestjs-libraries/viral/podcast.keys';

// Dựng RSS 2.0 cho podcast — bám CHẶT Spotify Podcast Delivery Specification
// v1.9 (kiêm luôn chuẩn Apple Podcasts):
// - channel: title/link/description (1..1), language, itunes:author (1..1),
//   itunes:image href (1..1) + <image><url>> bản RSS cổ điển (spec 5.8 cho phép),
//   itunes:explicit, itunes:category text=..., itunes:type episodic,
//   itunes:owner (email nhận mã xác minh khi nộp Spotify), spotify:countryOfOrigin.
// - item: guid isPermaLink="false" (1..1), title + description (bắt buộc 1 trong
//   cặp title/media:title — dùng bản chuẩn), enclosure url+type+length ĐỦ 3
//   thuộc tính (length = BYTE), pubDate RFC 2822, itunes:duration (giây trần —
//   spec 5.25 cho phép số không dấu hai chấm), itunes:episodeType full.
// - XML 1.0 UTF-8, escape & < > " ' mọi nơi (spec 4.3 bắt escape &amp;).

export interface RssEpisode {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  bytes: number;
  durationSec: number | null;
  publishedAt: string | Date;
}

const esc = (s: any) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// RFC 2822, vd "Thu, 20 Nov 2014 10:30:00 GMT" (spec 5.18 chấp nhận hậu tố GMT)
const rfc2822 = (d: string | Date) => new Date(d).toUTCString();

export function buildPodcastRss(
  cfg: PodcastConfig,
  coverUrl: string,
  episodes: RssEpisode[]
): string {
  const items = episodes
    .map(
      (e) =>
        `    <item>\n` +
        `      <guid isPermaLink="false">${esc(e.id)}</guid>\n` +
        `      <title>${esc(e.title)}</title>\n` +
        `      <description>${esc(e.description)}</description>\n` +
        `      <enclosure url="${esc(e.audioUrl)}" type="audio/mpeg" length="${Math.max(0, Math.round(e.bytes))}"/>\n` +
        `      <pubDate>${esc(rfc2822(e.publishedAt))}</pubDate>\n` +
        (e.durationSec
          ? `      <itunes:duration>${Math.max(1, Math.round(e.durationSec))}</itunes:duration>\n`
          : '') +
        `      <itunes:explicit>${cfg.explicit ? 'true' : 'false'}</itunes:explicit>\n` +
        `      <itunes:episodeType>full</itunes:episodeType>\n` +
        `    </item>`
    )
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:spotify="http://www.spotify.com/ns/rss" version="2.0">\n` +
    `  <channel>\n` +
    `    <title>${esc(cfg.title)}</title>\n` +
    `    <link>${esc(cfg.link)}</link>\n` +
    `    <description>${esc(cfg.description)}</description>\n` +
    `    <language>${esc(cfg.language || 'vi')}</language>\n` +
    `    <itunes:author>${esc(cfg.author)}</itunes:author>\n` +
    `    <itunes:owner>\n` +
    `      <itunes:name>${esc(cfg.author)}</itunes:name>\n` +
    `      <itunes:email>${esc(cfg.email)}</itunes:email>\n` +
    `    </itunes:owner>\n` +
    `    <itunes:image href="${esc(coverUrl)}"/>\n` +
    `    <image>\n` +
    `      <url>${esc(coverUrl)}</url>\n` +
    `      <title>${esc(cfg.title)}</title>\n` +
    `      <link>${esc(cfg.link)}</link>\n` +
    `    </image>\n` +
    `    <itunes:explicit>${cfg.explicit ? 'true' : 'false'}</itunes:explicit>\n` +
    `    <itunes:category text="${esc(cfg.category || 'Education')}"/>\n` +
    `    <itunes:type>episodic</itunes:type>\n` +
    (cfg.country
      ? `    <spotify:countryOfOrigin>${esc(cfg.country)}</spotify:countryOfOrigin>\n`
      : '') +
    (items ? items + '\n' : '') +
    `  </channel>\n` +
    `</rss>\n`
  );
}
