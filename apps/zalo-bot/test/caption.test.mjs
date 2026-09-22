// test/caption.test.mjs — kiểm logic fallback + gộp text (không gọi API).
import assert from "node:assert";
import { combineTexts, fallbackCaption, writeCaption, stripZaloEmoticons, stripMarkdown } from "../src/caption.mjs";

let pass = 0;
const ok = (n) => { console.log(`✅ ${n}`); pass++; };

// combineTexts: bỏ rỗng, bỏ trùng liền kề
{
  assert.equal(combineTexts([{ text: "các bé học vẽ" }, { text: " " }, { text: "các bé học vẽ" }, { text: "vui lắm" }]), "các bé học vẽ\nvui lắm");
  assert.equal(combineTexts([]), "");
  assert.equal(fallbackCaption([{ text: "abc" }]), "abc");
  ok("combineTexts/fallback: gộp đúng, bỏ rỗng+trùng");
}

// Mã sticker Zalo: Facebook không hiểu -> đổi emoji thật / bỏ mã lạ
{
  assert.equal(stripZaloEmoticons("Cô Vy chào ba mẹ /-heart"), "Cô Vy chào ba mẹ ❤️");
  assert.equal(stripZaloEmoticons("Giỏi lắm /-strong các con"), "Giỏi lắm 👍 các con");
  // mã lạ -> bỏ hẳn, không để chữ thô lọt lên Facebook (và không để lại 2 dấu cách)
  assert.equal(stripZaloEmoticons("chào ba mẹ /-xyzabc nhé"), "chào ba mẹ nhé");
  // không đụng vào chữ thường có dấu / (đường dẫn, phân số...)
  assert.equal(stripZaloEmoticons("lớp 3/4 và a/b"), "lớp 3/4 và a/b");
  // lọt qua đường fallback (nguyên text cô giáo) -> vẫn phải sạch
  assert.equal(fallbackCaption([{ text: "Cô gửi hoạt động /-heart" }]), "Cô gửi hoạt động ❤️");
  // AI chép lại mã vào output -> stripMarkdown cũng phải dọn
  assert.equal(stripMarkdown("**Hôm nay** các con vui /-heart"), "Hôm nay các con vui ❤️");
  ok("stripZaloEmoticons: /-heart -> ❤️, mã lạ bị bỏ, chặn cả 2 đường AI+fallback");
}

// disableAI -> fallback dùng nguyên text, không sập
{
  const r = await writeCaption({ items: [{ kind: "image", buffer: Buffer.from("x") }], texts: [{ text: "hôm nay các bé đi dã ngoại" }] }, { disableAI: true });
  assert.equal(r.source, "fallback");
  assert.equal(r.caption, "hôm nay các bé đi dã ngoại");
  ok("disableAI -> fallback dùng nguyên ghi chú");
}

// không có ảnh -> fallback
{
  const r = await writeCaption({ items: [], texts: [{ text: "ghi chú" }] }, { disableAI: true });
  assert.equal(r.source, "fallback");
  ok("không có ảnh -> fallback");
}

console.log(`\n🎉 PASS ${pass}/${pass} test.`);
