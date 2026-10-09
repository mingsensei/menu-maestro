# Kế hoạch: Chatbot AI gợi ý món trên trang Menu

## Mục tiêu
Khách mở một bong bóng chat ở góc màn hình, hỏi kiểu "món nào có bò mà không cay?" hoặc "món nào được nhiều người xem nhất?". Bot trả lời và đưa ra các món phù hợp, bấm vào là mở popup chi tiết món.

## 1. Đếm lượt xem chi tiết món
- Mỗi lần khách mở popup chi tiết, ghi lại một lượt xem cho món đó.
- Mỗi lượt mở chỉ đếm một lần, không ghi thông tin cá nhân của khách.
- Bot dùng số lượt xem này để gợi ý "món phổ biến". Trang Admin có thêm khung "Top món được xem nhiều".

## 2. Dữ liệu bot được dùng
- Tên món, mô tả tiếng Anh, danh mục, giá, VAT, badge (Pork, Beef, Vegetarian, Vegan, Gluten Free, Spicy, Dairy-free).
- Nguyên liệu được lấy từ mô tả và badge (không cần thêm cột mới).
- Số lượt xem của từng món.
- Bot chỉ gợi ý những món có thật trong menu, không tự bịa món.

## 3. Giao diện chat
- Nút chat nổi ở góc dưới bên phải, đúng tông nâu/đỏ/trắng, hỗ trợ dark mode, font Inter.
- Khung chat: bot trả lời từng chữ (streaming), có các câu hỏi gợi ý nhanh ("Món chay", "Món bán chạy", "Không cay").
- Các món được gợi ý hiện thành thẻ nhỏ (ảnh thu nhỏ + tên + giá) ngay trong khung chat; bấm vào thì mở popup chi tiết đã có sẵn.
- Bot trả lời theo ngôn ngữ đang chọn trên menu (10 ngôn ngữ).
- Lịch sử chat chỉ lưu trong phiên đang mở, tải lại trang là bắt đầu mới (tiết kiệm credit, không lưu dữ liệu khách).

## 4. Kiểm soát chi phí
- Mỗi tin nhắn gửi kèm danh sách menu rút gọn (chỉ các trường cần thiết), không gửi ảnh.
- Giới hạn độ dài câu trả lời và số tin nhắn mỗi phiên (ví dụ 20) để tránh tốn credit.
- Hiện thông báo rõ ràng khi hệ thống AI bận hoặc hết credit.

## Chi tiết kỹ thuật
- Bảng mới `menu_item_views (id, menu_item_id → menu_items, created_at)`; RLS: anon được insert, chỉ admin được select. Thêm view/RPC `get_menu_item_view_counts()` (security definer) trả về tổng lượt xem từng món để public đọc.
- Ghi lượt xem trong `MenuItemDetailModal` khi `item` thay đổi.
- Edge function `menu-chat`: nhận lịch sử chat + ngôn ngữ, tải menu + lượt xem bằng service role, gọi Lovable AI Gateway (`openai/gpt-6-astra`, Responses API, streaming, reasoning `low`). Bot có tool `suggest_items({ ids })` để trả về id món; client hiển thị thẻ món từ id.
- Giao diện dùng AI Elements (Conversation, Message, MessageResponse, PromptInput, Tool), `ChatWidget` mount trong `Menu.tsx`.
- Xử lý lỗi 429/402/403 từ gateway và hiện thông báo thân thiện.
