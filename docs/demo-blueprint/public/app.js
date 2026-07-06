// UI cho cả 2 backend. Poll Hub API để cập nhật trạng thái, nhóm, bản nháp,
// nhật ký. Nút giả lập gọi thẳng Worker (backend 2) để thấy rõ vai trò tách bạch.

const HUB = ''; // cùng origin với Hub API (được Hub phục vụ)
const WORKER = 'http://localhost:3002';

const $ = (id) => document.getElementById(id);

async function api(path, method = 'GET', body) {
  const res = await fetch(HUB + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function toast(msg, isErr = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.className = 'toast'), 2600);
}

function timeStr(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---- Render trạng thái + đèn ----
async function refreshStatus() {
  let s;
  try {
    s = await api('/api/status');
  } catch {
    $('light-hub').className = 'light down';
    return;
  }
  $('light-hub').className = 'light up';
  $('light-worker').className = 'light ' + (s.worker === 'up' ? 'up' : 'down');
  $('queue-count').textContent = s.queuePending;
  $('claude-state').textContent = s.claude ? 'Claude' : 'mock';
  $('c-pending').textContent = s.draftsPending;
  $('c-posted').textContent = s.draftsPosted;
}

// ---- Render nhóm Zalo ----
let channelsMap = {};
async function refreshGroups() {
  const { groups, channels } = await api('/api/groups');
  channelsMap = channels;
  $('groups').innerHTML = groups
    .map((g) => {
      const chans = g.channels.map((c) => channels[c]?.name || c).join(' · ');
      return `<div class="group">
        <div class="g-emoji">${g.emoji || '📷'}</div>
        <div class="g-info">
          <div class="g-name">${g.name}</div>
          <div class="g-ch">→ ${chans}</div>
        </div>
        <label class="switch">
          <input type="checkbox" ${g.enabled ? 'checked' : ''} data-id="${g.id}" />
          <span class="slider"></span>
        </label>
      </div>`;
    })
    .join('');

  $('groups')
    .querySelectorAll('input[type=checkbox]')
    .forEach((el) =>
      el.addEventListener('change', async () => {
        await api('/api/groups/toggle', 'POST', { id: el.dataset.id });
        refreshGroups();
      })
    );
}

// ---- Render bản nháp ----
function draftCard(d) {
  const thumbs = d.mediaUrls
    .slice(0, 4)
    .map((u) => `<img src="${u}" alt="media" />`)
    .join('');
  const oneCls = d.mediaUrls.length === 1 ? ' one' : '';
  const chans = d.channels.map((c) => `<span class="chan">${channelsMap[c]?.name || c}</span>`).join('');
  const badge =
    d.captionSource === 'claude'
      ? `<span class="badge claude">Claude</span>`
      : `<span class="badge mock">mock AI</span>`;

  let footer;
  if (d.status === 'pending') {
    footer = `<div class="actions">
      <button class="btn-approve" data-approve="${d.id}">👍 Duyệt & đăng</button>
      <button class="btn-reject" data-reject="${d.id}">Từ chối</button>
    </div>`;
  } else if (d.status === 'approved' || d.status === 'posting') {
    footer = `<div class="state-row posting"><span class="spinner"></span> Đang đăng lên ${d.channels.length} kênh...</div>`;
  } else if (d.status === 'posted') {
    footer = `<div class="state-row posted">✅ Đã đăng · ${timeStr(d.postedAt)}</div>`;
  } else if (d.status === 'rejected') {
    footer = `<div class="state-row rejected">🗑️ Đã từ chối</div>`;
  }

  return `<div class="draft">
    <div class="thumbs${oneCls}">${thumbs}</div>
    <div class="body">
      <div class="d-src">${d.emoji} <b>${d.groupName}</b> ${badge}</div>
      <div class="d-cap">${escapeHtml(d.caption)}</div>
      <div class="chans">${chans}</div>
      ${footer}
    </div>
  </div>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function refreshDrafts() {
  const { drafts } = await api('/api/drafts');
  const box = $('drafts');
  if (drafts.length === 0) {
    box.innerHTML = `<div class="empty"><div class="big">📭</div>Chưa có bài nào.<br/>Bấm "Giả lập ảnh từ nhóm Zalo" để bắt đầu.</div>`;
    return;
  }
  box.innerHTML = drafts.map(draftCard).join('');
  box.querySelectorAll('[data-approve]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      await api('/api/drafts/approve', 'POST', { id: b.dataset.approve });
      refreshAll();
    })
  );
  box.querySelectorAll('[data-reject]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api('/api/drafts/reject', 'POST', { id: b.dataset.reject });
      refreshAll();
    })
  );
}

// ---- Render nhật ký ----
async function refreshActivity() {
  const { activity } = await api('/api/activity');
  $('activity').innerHTML = activity
    .map(
      (a) =>
        `<li><span class="ts">${timeStr(a.t)}</span><span class="who ${a.actor}">${a.actor}</span>${escapeHtml(
          a.msg
        )}</li>`
    )
    .join('');
}

async function refreshAll() {
  await Promise.all([refreshStatus(), refreshDrafts(), refreshActivity()]);
}

// ---- Nút giả lập (gọi thẳng Worker) ----
$('btn-simulate').addEventListener('click', async () => {
  const btn = $('btn-simulate');
  btn.disabled = true;
  try {
    const res = await fetch(WORKER + '/simulate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.ok) {
      toast(`📸 Worker bắt được ${data.job.count} ảnh từ "${data.job.groupName}"`);
    } else {
      toast(data.error || 'Lỗi giả lập', true);
    }
  } catch {
    toast('Không gọi được Zalo Worker (backend 2 có đang chạy không?)', true);
  }
  setTimeout(() => (btn.disabled = false), 400);
  refreshAll();
});

$('btn-reset').addEventListener('click', async () => {
  await api('/api/reset', 'POST', {});
  toast('Đã reset demo');
  refreshAll();
  refreshGroups();
});

// ---- Vòng lặp cập nhật ----
refreshGroups();
refreshAll();
setInterval(refreshStatus, 1500);
setInterval(refreshDrafts, 1500);
setInterval(refreshActivity, 2000);
