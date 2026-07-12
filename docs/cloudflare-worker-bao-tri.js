/* ============================================================================
   CLOUDFLARE WORKER — trang bảo trì sư tử cho hub.vietanh.org
   (tầng chặn NGOÀI server: phủ cả khách chưa từng mở app; tầng trong app là
   service worker apps/frontend/public/sw-maintenance.js — HTML song sinh,
   sửa 1 nơi nhớ sửa cả 2)

   CÁCH DÁN (1 lần, ~3 phút):
   1. Cloudflare dashboard → chọn zone vietanh.org → Workers Routes (menu trái)
      → "Manage Workers" → Create Worker → đặt tên: bao-tri-hub
   2. Xoá code mẫu, dán TOÀN BỘ file này → Deploy.
   3. Quay lại zone vietanh.org → Workers Routes → Add route:
        Route:  hub.vietanh.org/*
        Worker: bao-tri-hub
   4. Xong. Thử: lúc đang deploy app, mở hub.vietanh.org → thấy sư tử thay vì
      "no available server". API (Cowork) KHÔNG bị ảnh hưởng — chỉ request
      trình duyệt (Accept: text/html) mới nhận trang bảo trì, API vẫn nhận
      nguyên mã lỗi 5xx thật để retry đúng logic.
   ============================================================================ */

const MAINTENANCE_HTML = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Đang cập nhật — Media Hub Việt Anh</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(1200px 600px at 50% -10%,#1c2a5e 0%,#0e1531 55%,#0a0f24 100%);
    font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#fff;overflow:hidden}
  .wrap{text-align:center;padding:24px;max-width:560px}
  .stage{animation:runIn 1.5s cubic-bezier(.22,1,.36,1) both}
  .lion{width:min(46vw,230px);margin:0 auto;display:block;animation:bob 2.6s ease-in-out infinite 1.6s}
  @keyframes runIn{0%{transform:translateX(-70vw) rotate(-4deg)}55%{transform:translateX(4vw) rotate(2deg)}78%{transform:translateX(-10px)}100%{transform:translateX(0) rotate(0)}}
  @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
  .arm-wave{transform-origin:148px 124px;animation:wave 1.6s ease-in-out infinite .9s}
  @keyframes wave{0%,100%{transform:rotate(0)}30%{transform:rotate(-24deg)}60%{transform:rotate(9deg)}}
  .eye{transform-origin:center;transform-box:fill-box;animation:blink 4.2s infinite}
  @keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
  .tail{transform-origin:62px 180px;animation:wag 2.2s ease-in-out infinite}
  @keyframes wag{0%,100%{transform:rotate(0)}50%{transform:rotate(13deg)}}
  h1{font-size:clamp(20px,4.6vw,30px);margin-top:18px;font-weight:800}
  p{color:#b9c4e8;font-size:clamp(13px,3vw,15.5px);line-height:1.65;margin-top:10px}
  .dots{display:inline-flex;gap:7px;margin-top:18px}
  .dots i{width:9px;height:9px;border-radius:50%;background:#f5c63c;animation:hop 1.2s infinite}
  .dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
  @keyframes hop{0%,60%,100%{transform:translateY(0);opacity:.55}30%{transform:translateY(-9px);opacity:1}}
  .note{margin-top:22px;font-size:12px;color:#7f8bb5}
</style></head>
<body><div class="wrap"><div class="stage">
<svg class="lion" viewBox="0 0 220 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sư tử Việt Anh vẫy chào">
  <g class="tail">
    <path d="M62 180 Q28 170 34 138" stroke="#F4A24C" stroke-width="9" fill="none" stroke-linecap="round"/>
    <circle cx="34" cy="134" r="11" fill="#E07B28"/>
  </g>
  <rect x="84" y="186" width="16" height="36" rx="8" fill="#F4A24C"/>
  <rect x="120" y="186" width="16" height="36" rx="8" fill="#F4A24C"/>
  <ellipse cx="92" cy="224" rx="14" ry="9" fill="#F7B265"/>
  <ellipse cx="128" cy="224" rx="14" ry="9" fill="#F7B265"/>
  <path d="M76 132 Q60 150 70 164" stroke="#F4A24C" stroke-width="13" fill="none" stroke-linecap="round"/>
  <rect x="68" y="114" width="84" height="82" rx="28" fill="#1F2C63"/>
  <circle cx="78" cy="122" r="13" fill="#F5C63C"/>
  <circle cx="142" cy="122" r="13" fill="#F5C63C"/>
  <circle cx="110" cy="156" r="17" fill="none" stroke="#F5C63C" stroke-width="3"/>
  <text x="110" y="163" text-anchor="middle" font-size="20" font-weight="800" fill="#F5C63C" font-family="Georgia,serif">A</text>
  <g class="arm-wave">
    <path d="M148 124 Q170 108 172 88" stroke="#F4A24C" stroke-width="13" fill="none" stroke-linecap="round"/>
    <circle cx="173" cy="84" r="10" fill="#F7B265"/>
  </g>
  <g>
    <circle cx="72" cy="34" r="11" fill="#E07B28"/><circle cx="148" cy="34" r="11" fill="#E07B28"/>
    <circle cx="110" cy="68" r="52" fill="#EF8E33"/>
    <circle cx="110" cy="68" r="49" fill="none" stroke="#E07B28" stroke-width="5" stroke-dasharray="11 8"/>
    <circle cx="110" cy="70" r="36" fill="#F8C98C"/>
    <g class="eye"><circle cx="97" cy="63" r="5.2" fill="#241a12"/><circle cx="95.5" cy="61" r="1.7" fill="#fff"/></g>
    <g class="eye"><circle cx="123" cy="63" r="5.2" fill="#241a12"/><circle cx="121.5" cy="61" r="1.7" fill="#fff"/></g>
    <path d="M88 52 q6 -5 12 -2" stroke="#8a5a2b" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M120 50 q6 -3 12 2" stroke="#8a5a2b" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="110" cy="84" rx="16" ry="12" fill="#FDE7C2"/>
    <path d="M104 78 L116 78 L110 85 Z" fill="#6B4423"/>
    <path d="M110 85 v4 M110 89 q-6 6 -12 1 M110 89 q6 6 12 1" stroke="#6B4423" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="82" cy="78" rx="6.5" ry="4.5" fill="#F5A65B" opacity=".7"/>
    <ellipse cx="138" cy="78" rx="6.5" ry="4.5" fill="#F5A65B" opacity=".7"/>
  </g>
</svg>
</div>
<h1>Media Hub Việt Anh đang cập nhật tính năng mới</h1>
<div class="dots"><i></i><i></i><i></i></div>
<div class="note">Trang sẽ tự vào lại khi hệ thống sẵn sàng — không cần bấm gì cả.</div>
</div>
<script>
  (function(){
    async function check(){
      try{
        var r=await fetch('/?hb='+Date.now(),{cache:'no-store'});
        if(r.status<500){location.reload();return;}
      }catch(e){}
      setTimeout(check,5000);
    }
    setTimeout(check,4000);
  })();
</script>
</body></html>`;

const maintenance = () =>
  new Response(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '30',
    },
  });

export default {
  async fetch(request) {
    const wantsHtml =
      request.method === 'GET' &&
      (request.headers.get('accept') || '').includes('text/html');
    let res;
    try {
      res = await fetch(request);
    } catch (e) {
      // origin đứt hẳn (server chết giữa deploy)
      return wantsHtml ? maintenance() : new Response('origin down', { status: 503 });
    }
    // 52x = mã lỗi origin của riêng Cloudflare (521 down, 522 timeout, 523...)
    if (wantsHtml && [502, 503, 504, 521, 522, 523, 525].includes(res.status)) {
      return maintenance();
    }
    return res;
  },
};
