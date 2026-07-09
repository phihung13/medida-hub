// ============================================================================
//  SEED 8 chân dung phụ huynh — port NGUYÊN VĂN từ Google Sheet "Profiles"
//  (F1:ContentStore) của workflow n8n, bản persona v2 "làm giàu bằng dữ liệu
//  web thật" (cập nhật 2026-07-08). Mã TiH-* của sheet đổi thành TH-* cho khớp
//  mã persona hệ thống đang dùng (ViralPost.persona).
//  Seed chỉ chạy khi org CHƯA có persona trong DB; sau đó phần động
//  (moiQuanTam/tamLy/hanhVi/insights) được AI tự làm giàu sau mỗi lần cào.
// ============================================================================

export interface PersonaSeed {
  code: string;
  label: string;
  capHoc: string;
  khuVuc: string;
  statics: {
    phan_khuc: string;
    do_tuoi: string;
    hoc_van: string;
    nghe_nghiep: string;
    thu_nhap: string;
    kinh_te: string;
    fanpage: string;
  };
  moiQuanTam: string;
  tamLy: string;
  hanhVi: string;
  insights: string;
  dataPoints: number;
}

export const VIRAL_PERSONA_SEEDS: PersonaSeed[] = [
  {
    code: 'MN-HCM',
    label: 'Mẹ tri thức cầu toàn (lần đầu cho con đi học)',
    capHoc: 'Mầm non',
    khuVuc: 'TP HCM',
    statics: {
      phan_khuc: 'Trí thức trung lưu thành thị',
      do_tuoi: '28-38',
      hoc_van: 'Đại học / sau ĐH',
      nghe_nghiep: 'Chuyên viên / quản lý cấp trung (marketing, IT, tài chính, giáo viên)',
      thu_nhap: '30-60 triệu/hộ',
      kinh_te: 'Trung lưu thành thị',
      fanpage: 'https://www.facebook.com/mamnonVietAnh',
    },
    moiQuanTam:
      'Phương pháp giáo dục sớm có cơ sở khoa học; môi trường an toàn; dinh dưỡng & giấc ngủ; phát triển cảm xúc & kỹ năng sớm; tiếng Anh; con thích nghi khi lần đầu xa mẹ; tỷ lệ cô/trẻ; cô giáo tận tâm; camera & app theo dõi con minh bạch',
    tamLy:
      'Cầu toàn, lo âu cao vì là con đầu; sợ chọn sai trường ảnh hưởng cả đời con; lo con thua bạn nhưng muốn con vừa hạnh phúc vừa giỏi; đọc nhiều sách & nghiên cứu nuôi dạy con, tin khoa học giáo dục; cần được trấn an bằng chuyên môn, không thích lời quảng cáo sáo rỗng',
    hanhVi:
      'Research kỹ trên FB & group mẹ bỉm, đọc bài dài, xem review; so sánh 3-5 trường, đi tham quan trước khi quyết; mẹ là người quyết chính, quyết bằng cảm xúc + lý trí; tin chuyên gia & nguồn khoa học hơn lời giới thiệu; quyết chậm, cần nhiều bằng chứng',
    insights:
      "Đánh trúng nỗi sợ 'ngày đầu con khóc, mẹ khóc' bằng quy trình thích nghi bài bản. Dùng khái niệm giáo dục (SEL, mindfulness) ở mức vừa phải kèm ví dụ thực tế. Content dạng 'giải thích vì sao' hiệu quả hơn 'khoe hoạt động'.",
    dataPoints: 445,
  },
  {
    code: 'MN-CG',
    label: 'Mẹ lao động KCN thực tế (gần - an toàn - vừa tiền)',
    capHoc: 'Mầm non',
    khuVuc: 'Cần Giuộc (Long An — nay thuộc tỉnh Tây Ninh sau sáp nhập 2025)',
    statics: {
      phan_khuc: 'Người lao động & quản lý cấp trung khu công nghiệp',
      do_tuoi: '25-35',
      hoc_van: 'THPT / Cao đẳng, một số ĐH',
      nghe_nghiep: 'Công nhân/tổ trưởng KCN, nhân viên văn phòng nhà máy, buôn bán nhỏ, một số quản lý cấp trung sản xuất',
      thu_nhap: '12-25 triệu/hộ (công nhân KCN ~7-13 triệu/người/tháng)',
      kinh_te: 'Lao động & cận trung lưu ngoại thành',
      fanpage: 'https://www.facebook.com/truongmamnonnhanle',
    },
    moiQuanTam:
      'Trông giữ an toàn khi cha mẹ đi làm/tăng ca/ca đêm; giờ giấc linh hoạt, nhận trẻ sớm-trả muộn; học phí vừa túi tiền, đóng trọn gói rõ ràng; gần nhà/gần KCN tiện đưa đón; ăn uống đủ chất, bé tăng cân; cô giáo thương con; có dạy chữ & tiếng Anh cơ bản để vào lớp 1; camera xem con',
    tamLy:
      "Thực tế, lo cơm áo gạo tiền; sợ con bị bỏ bê khi cha mẹ tăng ca; muốn con 'ngoan - khỏe - biết chữ' hơn là triết lý cao siêu; e ngại trường 'sang chảnh' đắt đỏ vượt khả năng; tin lời truyền miệng của hàng xóm, đồng nghiệp; quyết nhanh khi thấy hợp túi tiền và gần nhà",
    hanhVi:
      'Hỏi hàng xóm/đồng nghiệp cùng KCN, xem Facebook nhóm khu dân cư & nhóm tuyển dụng KCN; đến trường xem trực tiếp; rất nhạy giá - hỏi học phí đầu tiên; ông bà nhiều khi là người đưa đón nên có tiếng nói; quyết dựa trên giá + khoảng cách + cảm nhận về cô giáo; ít đọc bài dài',
    insights:
      "Đánh trúng 'yên tâm gửi con để đi làm/tăng ca' + minh bạch học phí trọn gói. Vì nhiều nhà máy chạy ca 08-18h và có ca đêm nên dịch vụ nhận sớm-trả muộn là điểm chốt sống còn. Camera, suất ăn đủ chất quan trọng. Tránh ngôn ngữ học thuật; dùng hình ảnh bé ăn ngoan - ngủ ngon - được cô ôm ấp.",
    dataPoints: 423,
  },
  {
    code: 'MN-RG',
    label: 'Gia đình kinh doanh tỉnh (thể diện - con nổi trội)',
    capHoc: 'Mầm non',
    khuVuc: 'Rạch Giá (Kiên Giang — nay là phường thuộc tỉnh An Giang sau sáp nhập 2025)',
    statics: {
      phan_khuc: 'Chủ doanh nghiệp / hộ kinh doanh tư nhân tỉnh',
      do_tuoi: '28-40',
      hoc_van: 'THPT / Cao đẳng / Đại học (đa dạng)',
      nghe_nghiep: 'Chủ DN tư nhân, chủ vựa/cửa hàng, kinh doanh thủy sản - thương mại, hộ buôn bán lớn',
      thu_nhap: '30-80 triệu/hộ',
      kinh_te: 'Khá giả tỉnh lẻ',
      fanpage: 'https://www.facebook.com/TruongMekongXanh',
    },
    moiQuanTam:
      "Trường 'có tiếng' nhất nhì trong tỉnh; tiếng Anh / yếu tố quốc tế; cơ sở vật chất đẹp, hiện đại; con dạn dĩ, tự tin, lễ phép; suất ăn ngon - sang; đưa đón tận nơi; thể diện với đối tác, họ hàng; sự kiện - văn nghệ hoành tráng",
    tamLy:
      "Bận rộn kinh doanh, ít thời gian nên có xu hướng 'khoán' con cho trường & người giúp việc; sĩ diện, muốn con nổi trội bằng con của đối tác làm ăn; tin vào thương hiệu và sự đông đúc (đông phụ huynh gửi = uy tín); sẵn sàng chi mạnh nhưng đòi hỏi dịch vụ tương xứng",
    hanhVi:
      'Nghe giới thiệu từ bạn bè làm ăn, để ý trường "hot" trong tỉnh; xem Facebook/TikTok của trường, chú ý hình ảnh sự kiện - cơ sở đẹp; ít đọc bài dài, thích xem video lễ hội, văn nghệ, đồng phục; quyết nhanh bằng thương hiệu + truyền miệng giới kinh doanh',
    insights:
      "Đánh vào thể diện & 'đầu tư cho con xứng tầm gia đình'. Khoe cơ sở vật chất, sự kiện, đồng phục, chương trình quốc tế. Dịch vụ đưa đón & chăm sóc cao cấp là đòn bẩy chốt. Hình ảnh hoành tráng thắng bài viết dài.",
    dataPoints: 416,
  },
  {
    code: 'TH-HCM',
    label: 'Mẹ trung lưu chú trọng nền tảng & cân bằng',
    capHoc: 'Tiểu học',
    khuVuc: 'TP HCM',
    statics: {
      phan_khuc: 'Trí thức trung lưu thành thị',
      do_tuoi: '30-42',
      hoc_van: 'Đại học / sau ĐH',
      nghe_nghiep: 'Chuyên viên / quản lý cấp trung, kinh doanh tự do',
      thu_nhap: '35-70 triệu/hộ',
      kinh_te: 'Trung lưu thành thị',
      fanpage: 'https://www.facebook.com/truongvietanhhcm',
    },
    moiQuanTam:
      'Chương trình học (GDPT 2018); tiếng Anh & toán tư duy; cân đối học phí - chất lượng; bán trú an toàn; giảm áp lực, không nhồi nhét; kỹ năng sống & tự lập; giáo viên chủ nhiệm & sĩ số lớp; lộ trình chuyển cấp lên THCS tốt',
    tamLy:
      "Lo con đuối sức khi vào lớp 1; giằng co giữa 'học giỏi' và 'tuổi thơ hạnh phúc'; sợ áp lực điểm số & vòng xoáy học thêm; muốn con tự lập, yêu thích việc học; nhạy với phương pháp giảng dạy, cảnh giác với quảng cáo phóng đại",
    hanhVi:
      'Research group phụ huynh tiểu học, so sánh trường công - tư - quốc tế; hỏi review & học phí dài hạn; dự ngày hội tuyển sinh, tham quan lớp học; mẹ quyết chính nhưng bàn bạc cùng chồng; quyết theo chương trình + giáo viên + chi phí dài hạn',
    insights:
      "Nhấn 'nền tảng vững mà con vẫn vui'. Minh bạch lộ trình học, tiếng Anh, kỹ năng sống. Bằng chứng học sinh tự tin, chuyển cấp tốt. Chủ động trấn an nỗi lo áp lực & học thêm.",
    dataPoints: 796,
  },
  {
    code: 'TH-CG',
    label: 'Phụ huynh lao động ngoại thành (gần - vừa tiền - nền tảng lớp 1)',
    capHoc: 'Tiểu học',
    khuVuc: 'Cần Giuộc (Long An — nay thuộc tỉnh Tây Ninh sau sáp nhập 2025)',
    statics: {
      phan_khuc: 'Người lao động & viên chức ngoại thành',
      do_tuoi: '28-38',
      hoc_van: 'THPT / Cao đẳng',
      nghe_nghiep: 'Công nhân/tổ trưởng KCN, viên chức, buôn bán nhỏ, nông nghiệp - dịch vụ',
      thu_nhap: '12-25 triệu/hộ (công nhân KCN ~7-13 triệu/người/tháng)',
      kinh_te: 'Lao động & cận trung lưu ngoại thành',
      fanpage: 'https://www.facebook.com/truongthaisoncangiuoc',
    },
    moiQuanTam:
      'Gần nhà; bán trú để cha mẹ yên tâm đi làm; học phí thấp, chi phí sách vở - đồng phục hợp lý; con đọc - viết - tính tốt; cô giáo quan tâm sát; an toàn giao thông; lo con thua bạn ở thành phố',
    tamLy:
      "Thực tế, mong con 'học hành tử tế để có tương lai tốt hơn'; tin trường công gần nhà; ngại trường tư đắt đỏ; lo không đủ thời gian/kiến thức kèm con học vì bận đi làm; trông cậy nhiều vào thầy cô; quyết theo khoảng cách + chi phí + uy tín truyền miệng",
    hanhVi:
      'Hỏi hàng xóm, họ hàng; xem fanpage trường địa phương; ưu tiên trường công trong khu vực; ông bà hỗ trợ đưa đón nên có ảnh hưởng; ít đọc bài dài, tin hình ảnh thực tế lớp học và kết quả thi/khen thưởng',
    insights:
      "Đánh vào 'con học tốt mà chi phí nhẹ, gần nhà, cha mẹ an tâm đi làm'. Bằng chứng bé đọc - viết - tính tốt, bán trú chu đáo. Tránh học thuật; nhấn lộ trình rõ ràng và sự hỗ trợ cho phụ huynh bận rộn.",
    dataPoints: 754,
  },
  {
    code: 'TH-RG',
    label: 'Gia đình kinh doanh tỉnh (thành tích - tiếng Anh - nổi trội)',
    capHoc: 'Tiểu học',
    khuVuc: 'Rạch Giá (Kiên Giang — nay là phường thuộc tỉnh An Giang sau sáp nhập 2025)',
    statics: {
      phan_khuc: 'Chủ doanh nghiệp / hộ kinh doanh tư nhân tỉnh',
      do_tuoi: '30-42',
      hoc_van: 'THPT / Cao đẳng / Đại học',
      nghe_nghiep: 'Chủ DN/cửa hàng, kinh doanh thủy sản - thương mại, hộ buôn bán lớn',
      thu_nhap: '30-70 triệu/hộ',
      kinh_te: 'Khá giả tỉnh lẻ',
      fanpage: 'https://www.facebook.com/TruongMekongXanh',
    },
    moiQuanTam:
      'Trường điểm / trường tư có tiếng; tiếng Anh - tin học; thành tích thi & giải thưởng; cơ sở vật chất tốt; bán trú chất lượng; con tự tin giao tiếp; sẵn sàng chi cho học thêm, trung tâm bổ trợ',
    tamLy:
      "Kỳ vọng con học giỏi để nối nghiệp hoặc 'bằng bạn bằng bè'; sĩ diện về thành tích; bận kinh doanh nên khoán việc học cho trường & gia sư; tin vào thương hiệu - thành tích; quyết nhanh, chi mạnh nhưng đòi hỏi đầu ra rõ ràng",
    hanhVi:
      'Nghe giới thiệu trong giới kinh doanh; để ý trường top tỉnh; xem thành tích thi HSG/tiếng Anh, fanpage trường; quyết theo danh tiếng + thành tích + dịch vụ; thích hình ảnh trao giải, sự kiện, học sinh tiêu biểu',
    insights:
      "Đánh vào thành tích & 'con hơn người'. Khoe giải thưởng, chứng chỉ tiếng Anh, học sinh tiêu biểu. Dịch vụ bán trú - đưa đón cao cấp giúp chốt deal. Đầu ra đo được quan trọng hơn triết lý.",
    dataPoints: 736,
  },
  {
    code: 'THCS-HCM',
    label: 'Phụ huynh lo thi cử & đồng hành tuổi dậy thì',
    capHoc: 'THCS',
    khuVuc: 'TP HCM',
    statics: {
      phan_khuc: 'Trí thức trung lưu - khá thành thị',
      do_tuoi: '38-48',
      hoc_van: 'Đại học / sau ĐH',
      nghe_nghiep: 'Quản lý / chuyên viên, chủ doanh nghiệp',
      thu_nhap: '40-90 triệu/hộ',
      kinh_te: 'Trung lưu - khá thành thị',
      fanpage: 'https://www.facebook.com/truongvietanhhcm',
    },
    moiQuanTam:
      'Thi vào lớp 10 trường công top; học lực Toán - Văn - Anh; định hướng nghề sớm; tâm lý tuổi teen - nghiện điện thoại & mạng xã hội; an toàn học đường, bạo lực & bắt nạt; kỹ năng tự học; ngoại ngữ & chứng chỉ (IELTS); cân bằng học - chơi',
    tamLy:
      'Áp lực thành tích thi cử; lo con sa sút, đua đòi, dậy thì khó bảo; sợ con lệch hướng vì game & mạng xã hội; vừa muốn ép con học vừa sợ con stress; mâu thuẫn giữa kiểm soát và tôn trọng; cần phương pháp đồng hành con tuổi teen',
    hanhVi:
      'Tham gia group ôn thi lớp 10; hỏi điểm chuẩn, lò luyện; so sánh trường công - tư - quốc tế; theo dõi điểm số sát sao; bàn bạc với con nhiều hơn vì con đã có chính kiến; quyết theo chất lượng học thuật + định hướng + môi trường an toàn',
    insights:
      "Đánh vào nỗi lo 'thi lớp 10 & con tuổi teen khó bảo'. Nội dung định hướng học tập, quản lý điện thoại, đồng hành dậy thì, lộ trình IELTS. Bằng chứng học sinh đỗ trường top đồng thời trưởng thành về nhân cách.",
    dataPoints: 922,
  },
  {
    code: 'THPT-HCM',
    label: 'Phụ huynh THPT định hướng tương lai (nghề nghiệp + xét tuyển ĐH; du học là nhánh của nhóm khá giả có chuẩn bị)',
    capHoc: 'THPT',
    khuVuc: 'TP HCM',
    statics: {
      phan_khuc: 'Trí thức - khá giả thành thị',
      do_tuoi: '42-52',
      hoc_van: 'Đại học / sau ĐH',
      nghe_nghiep: 'Quản lý cấp cao / chuyên gia / chủ doanh nghiệp',
      thu_nhap: '50-120+ triệu/hộ',
      kinh_te: 'Khá giả - thượng trung lưu thành thị',
      fanpage: 'https://www.facebook.com/truongvietanhhcm',
    },
    moiQuanTam:
      "Xét tuyển ĐH & tốt nghiệp THPT (phần lớn hướng ĐH TRONG NƯỚC; chọn ngành - chọn trường); định hướng nghề nghiệp theo năng lực/đam mê của con; tiếng Anh & chứng chỉ (IELTS) làm lợi thế xét tuyển và hội nhập; kỹ năng mềm - lãnh đạo; sức khỏe tâm lý & áp lực thi cử; hiệu quả đầu tư giáo dục. Du học / 'du học tại chỗ' (trường quốc tế - song ngữ trong nước) là mối quan tâm của NHÓM KHÁ GIẢ hơn, cần chuẩn bị sớm.",
    tamLy:
      "Nỗi sợ sâu nhất thường KHÔNG phải 'con học dở' mà là 'con học mà không biết để làm gì', mơ hồ về tương lai, chọn sai ngành (chọn theo bạn/ba mẹ). Với nhóm hướng du học: lo chuẩn bị muộn (đến lớp 12 mới vội luyện IELTS, làm hồ sơ) thì lỡ cơ hội, đành 'chọn tạm' một ĐH trong nước. Giằng co giữa kỳ vọng cao và nguy cơ con kiệt sức/trầm cảm; muốn con vừa đỗ tốt vừa hiểu mình - có chính kiến - hạnh phúc; tôn trọng quyết định của con nhưng vẫn muốn định hướng; cần một cố vấn đáng tin hơn người bán hàng.",
    hanhVi:
      'Nghiên cứu kỹ thông tin tuyển sinh - ngành nghề - đầu ra; dự hội thảo hướng nghiệp & (nhóm khá giả) tư vấn du học; theo dõi điểm số/hồ sơ năng lực; con là người đồng quyết định chính, nhiều khi quyết chính; quyết theo định hướng tương lai + đầu ra đo được + uy tín. So sánh trường công - tư - quốc tế/song ngữ; nhạy với tương quan chi phí - chất lượng.',
    insights:
      "Đánh đúng nỗi sợ 'con mơ hồ, chọn sai ngành' MẠNH HƠN thông điệp 'đỗ trường top'. Lõi nội dung cho cả tệp: định hướng bản thân & nghề nghiệp + lộ trình tiếng Anh/IELTS + hướng dẫn xét tuyển (trong nước là chính). DU HỌC chỉ là NHÁNH cho nhóm khá giả - đừng bán du học như mặc định cho số đông. Giọng cố vấn, dùng câu chuyện cựu HS & dữ liệu đầu ra; bám mùa thi tốt nghiệp/xét tuyển.",
    dataPoints: 1135,
  },
];
