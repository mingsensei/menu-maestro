# Đã triển khai: chatbot gợi ý món và tách FE/BE

- Frontend ở `frontend/`, chỉ gọi API qua `src/lib/api.ts`; không còn Supabase SDK/token/API key AI trong trình duyệt.
- Backend JavaScript ở `backend/src/`, dùng Supabase JS với RLS hiện có, cookie HttpOnly mã hóa và kiểm tra role ở server.
- Chatbot ưu tiên Groq (`openai/gpt-oss-20b`), dự phòng Gemini; key cấu hình riêng ở `backend/.env`, `.env.example` không chứa key thật. Hỗ trợ 10 ngôn ngữ, bộ lọc khẩu vị/ngân sách gồm VAT, tối đa 4 món thật và mở modal chi tiết.
- Backend lọc món trước khi AI viết lời giới thiệu; gợi ý theo bộ lọc vẫn hoạt động khi AI thiếu quota.
- Lượt xem món/top món admin được bổ sung qua migration `20261019160000_menu_item_views.sql`. Migration chưa được chạy lên project thật.
- Upload/HEIC/WebP/thumbnail/dịch hàng loạt chuyển sang backend; frontend theo dõi job.
- Migration `20261019160100_secure_role_assignment.sql` bỏ tự cấp admin cho tài khoản mới và chặn tự ghi role; giữ admin hiện có.
- Hướng dẫn cấu hình, khởi chạy, deployment và giới hạn kiểm thử nằm trong README.md.
- Kiểm tra 24/10/2026: Groq trả lời thực tế qua `/api/chat` ở cả context menu/home (`mode: ai`); sửa model cũ báo `model_not_found` và nạp key từ `.env` thay vì file mẫu. 41 test backend, typecheck, lint (còn warning có sẵn) và build đều qua.
- Nút RTR AI dùng chung có trên `/menu`; tăng lớp hiển thị lên trên thanh lọc sticky, kiểm tra hiển thị/bấm được ở desktop và mobile.

- Cache menu theo phiên bản: tối đa 200 truy vấn; câu hỏi tiếp nối dùng ngữ cảnh server (500 cuộc chat, TTL 15 phút), thu hẹp tập ứng viên hoặc lấy đúng món vừa gợi ý; đổi chủ đề/nới điều kiện truy xuất lại. API có số liệu `retrieval`. Ngữ cảnh reset cùng nút chat mới; không dùng vector DB/migration mới.
