# Menu Maestro — Riverside Terrace

Ứng dụng menu đã được tách thành hai workspace:

- `frontend/`: React, TypeScript, Vite, shadcn, Tailwind. Chỉ hiển thị, quản lý trạng thái giao diện và gọi HTTP API. Không dùng Supabase SDK, không giữ token đăng nhập hay API key AI.
- `backend/`: Node.js JavaScript, Supabase JS, Groq/Gemini API. Xử lý dữ liệu, xác thực/quyền admin, tìm kiếm/phân trang, gợi ý món, dịch và xử lý ảnh.
- `backend/supabase/`: migrations và cấu hình Supabase hiện có. Các Edge Functions cũ được giữ để tham khảo; ứng dụng mới không gọi chúng và không cần Lovable AI Gateway.

## Chạy local

### Trang giới thiệu và thực đơn

- `/` chuyển hướng đến `/home`. Trang chủ có đủ 10 ngôn ngữ như menu: Anh, Việt, Hàn, Nhật, Trung, Nga, Kazakh, Tây Ban Nha, Pháp và Ý. Nội dung giới thiệu nhà hàng Ý tại Đà Nẵng, Việt Nam; Roma có bức họa Rome, Verona có guitar.
- `/menu` giữ chức năng thực đơn hiện tại. Món nổi bật ở trang chủ lấy trực tiếp từ API theo nhóm pizza, pasta và món chính; giá bao gồm VAT. Nhấn món mở thực đơn đã lọc cùng chi tiết món tương ứng.
- Ảnh không gian được tối ưu thành WebP 720px và tối đa 1800px trong `frontend/public/images/restaurant/`. Nguồn ảnh: `tu lieu anh/areaPhotos.ts`; logo: `tu lieu anh/restaurant-logo.jpg`.
- Màu trang chủ dùng chung các biến màu của menu trong `frontend/src/index.css`. Hiệu ứng hỗ trợ `prefers-reduced-motion`.

### Khởi động

Yêu cầu Node.js **22.12+** và npm. Từ thư mục gốc repo:

```sh
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Điền `SUPABASE_URL`, `SUPABASE_ANON_KEY` và `GROQ_API_KEY` (hoặc `GEMINI_API_KEY`) trong **backend/.env**. Backend chỉ nạp file `.env`, không nạp `.env.example`. File `.env` được ignore khỏi Git; `.env.example` chỉ chứa cấu hình mẫu.

```sh
npm run dev
```

Frontend: `http://localhost:8080`. Backend: `http://localhost:3001`. Vite chuyển tiếp `/api` sang backend, trình duyệt chỉ cần một origin. Có thể chạy riêng bằng `npm run dev:fe` và `npm run dev:be`.

Nếu dùng `http://127.0.0.1:8080` thay cho localhost, thêm origin đó vào `FRONTEND_ORIGIN` (nhiều origin ngăn bằng dấu phẩy). Khi đổi cổng backend, cập nhật `API_PROXY_TARGET` trong frontend/.env.

## RTR AI — trợ lý xuyên suốt website

Nút **RTR AI** mở một khung chat dùng chung toàn website. Lịch sử, bộ lọc và yêu cầu đang xử lý được giữ khi chuyển trang bằng liên kết trong ứng dụng. Gợi ý ban đầu thay đổi theo trang: `/home` ưu tiên thông tin nhà hàng; `/menu` ưu tiên món ăn. Khách hỏi được cả hai chủ đề trên mọi trang. Hỗ trợ 10 ngôn ngữ theo lựa chọn của khách. Lịch sử nằm trong bộ nhớ của tab, tối đa 20 câu hỏi mỗi cuộc trò chuyện; tải lại trang hoặc mở tab mới sẽ bắt đầu lại. Không ghi lịch sử vào database.

### Cập nhật kho kiến thức

1. Đăng nhập Admin, mở tab **AI Knowledge**.
2. Bổ sung hoặc sửa các mục: địa chỉ, giờ mở cửa, đặt bàn, không gian, tiện ích và chính sách. Chỉ nhập thông tin công khai đã xác nhận. Xoá những thông tin cũ hoặc mâu thuẫn khi cập nhật.
3. Nhấn **Lưu kiến thức**. Câu hỏi tiếp theo sẽ dùng nội dung mới, không cần restart hoặc huấn luyện model.

Nguồn mặc định là `backend/knowledge/restaurant.md`; có thể sửa trực tiếp bằng trình soạn thảo. Tài liệu được chia theo tiêu đề `##`, tối đa 24.000 ký tự. Backend gửi các phần này làm ngữ cảnh cho LLM; backend kiểm tra nguồn nội bộ; giao diện chỉ hiển thị câu trả lời trực tiếp, không thêm dòng “Based on”/nguồn tham khảo. Chỉ Admin đọc/ghi tài liệu qua `/api/admin/knowledge`. Các bản ghi có phiên bản để tránh ghi đè chỉnh sửa đồng thời; ghi file theo cơ chế thay thế nguyên tử. Kho này không dùng embeddings hoặc dịch vụ vector ngoài.

Kho kiến thức dùng filesystem của một backend instance. Khi deploy lên môi trường có ổ đĩa tạm hoặc deploy thay toàn bộ source, gắn persistent volume và đặt `KNOWLEDGE_BASE_PATH` trỏ tới file trên volume, rồi chép tài liệu mẫu vào đó trước lần khởi động đầu tiên. Sao lưu file này. Nếu chạy nhiều backend instance, cần dùng một kho lưu trữ dùng chung thay cho file cục bộ.

RTR AI không tự xác nhận đặt bàn, kiểm tra bàn trống, hứa hẹn tiện ích hoặc suy đoán giờ mở cửa. Phần chưa có thông tin sẽ hướng dẫn khách liên hệ nhân viên. Không đưa mật khẩu, API key hoặc dữ liệu cá nhân của khách vào tài liệu.

Khách có thể hỏi tự nhiên, ví dụ “món bò không cay dưới 250k”, hoặc dùng bộ lọc chế độ ăn, mức giá mỗi món đã gồm VAT và nguyên liệu cần tránh. Nút **Tìm món** và các câu hỏi nhanh hoạt động ngay cả khi AI thiếu key/hết quota.

Luồng gợi ý:

1. Với câu hỏi tự nhiên, AI trích xuất yêu cầu, hiểu câu hỏi tiếp theo từ tối đa 11 tin nhắn gần nhất. Với ngân sách cả bàn chưa rõ, bot hỏi lại.
2. Backend lấy menu hiện tại từ Supabase, chỉ giữ món trong danh mục đang hoạt động. Lọc cứng theo yêu cầu và bộ lọc; chế độ ăn cần badge tương ứng. Badge `dairy` có nghĩa là **dairy-free**, theo dữ liệu cũ.
3. Mặc định ưu tiên món ăn và danh mục món chính, chọn đa dạng danh mục, không chọn menu trẻ em trừ khi khách yêu cầu; đồ uống và tráng miệng được chọn theo yêu cầu. Tối đa 4 món thật, giá tính cả VAT. AI chỉ viết lời giới thiệu cho các món backend đã chọn.
4. Nhấn thẻ gợi ý mở chi tiết món, kể cả món không ở trang menu hiện tại.

Không có kết quả thì bot báo rõ. Khi cả hai nhà cung cấp AI lỗi, bot không đoán yêu cầu từ câu hỏi tự nhiên; khách vẫn dùng được bộ lọc và câu hỏi nhanh. Những lưu ý về nguyên liệu/dị ứng dựa trên mô tả và badge, không thay thế xác nhận của nhân viên.

AI ưu tiên Groq khi có `GROQ_API_KEY`. Không cần nhập model: backend hỏi danh sách model còn hoạt động của Groq, tự chọn model chat tương thích và dùng lại lựa chọn cho các câu hỏi sau. `GROQ_MODEL` chỉ là tuỳ chọn ghi đè; bỏ trống hoặc đặt `auto` để chọn tự động. Nếu Groq lỗi và có `GEMINI_API_KEY`, backend thử Gemini, model mặc định `gemini-2.5-flash`. Chỉ cần một key; cả hai nhà cung cấp đều trả JSON, có timeout 25 giây mỗi lần thử và giới hạn token. Một câu hỏi tự nhiên thường dùng 2 lượt gọi (phân loại/trích xuất rồi trả lời); câu hỏi gộp nhà hàng và món ăn có thể dùng 3. Tất cả đi qua một endpoint `/api/chat`, cùng lịch sử và hạn mức. Backend giới hạn 10 yêu cầu chat/phút và 40/giờ/IP; `AI_DAILY_LIMIT` mặc định 500 lượt chat tự nhiên/tác vụ AI/ngày/instance. Bộ đếm nằm trong RAM; nếu chạy nhiều instance cần dùng Redis/gateway để chia sẻ hạn mức. Chỉ bật `TRUST_PROXY=true` khi reverse proxy tin cậy **ghi đè** X-Forwarded-For.

### Cache và ngữ cảnh cho câu hỏi về menu

Backend chuẩn hóa nội dung món một lần cho mỗi phiên bản menu, lưu kết quả lọc theo yêu cầu (tối đa 200 truy vấn, loại truy vấn ít dùng nhất khi đầy). Câu hỏi lặp dùng lại danh sách ID đã lọc. Yêu cầu hẹp hơn về giá, chế độ ăn hoặc nguyên liệu cần tránh có thể lọc tiếp trên toàn bộ tập ứng viên trước, kể cả các món chưa nằm trong 4 thẻ gợi ý. Đổi nguyên liệu, loại món hoặc nới điều kiện sẽ truy xuất lại trên menu hiện tại.

Mỗi cuộc chat có `conversationId` ngẫu nhiên do backend cấp, lưu trong bộ nhớ tab. Backend nhớ ý định đã phân tích và ID/tên các món vừa gợi ý, nên câu như “trong các món đó món nào rẻ nhất?” hay “món thứ hai có gì?” chỉ cần truy xuất các món trước đó. ID món do AI trả về được đối chiếu với ngữ cảnh server; bộ lọc hiện tại vẫn bắt buộc. Mã chat cần đi kèm cặp tin nhắn trước khớp với server. Bấm bắt đầu chat mới hoặc tải lại trang sẽ bỏ mã cũ.

Cache ngữ cảnh tối đa 500 cuộc chat, hết hạn sau 15 phút không hoạt động, chỉ nằm trong RAM. Cache món chỉ lưu ID; giá, VAT và dữ liệu món luôn lấy từ snapshot menu hiện tại. Snapshot database được làm mới sau tối đa 15 giây; thao tác quản trị qua backend xóa cache ngay. Thay đổi nội dung/giá/danh mục làm đổi phiên bản và bỏ kết quả lọc cũ. Không cache nguyên câu trả lời AI; câu hỏi tự nhiên vẫn cần gọi AI để hiểu yêu cầu và viết trả lời. Trường `retrieval` trong API cho biết cách lấy món (`catalog`, `cache`, `narrowed`, `previous`) và số món đã kiểm tra, phục vụ kiểm tra hiệu quả.

Đây là truy xuất theo từ khóa và bộ lọc kết hợp bộ nhớ hội thoại, chưa dùng embeddings/vector database. Không cần migration hoặc dịch vụ mới. Khi chạy nhiều backend instance, cần sticky session hoặc chuyển cache ngữ cảnh sang kho dùng chung như Redis để giữ ngữ cảnh giữa các instance; restart sẽ xóa cache RAM.

## Migration lượt xem món

Áp dụng hai file sau trên **Supabase project hiện có**, sau các migration cũ:

```text
backend/supabase/migrations/20261019160000_menu_item_views.sql
backend/supabase/migrations/20261019160100_secure_role_assignment.sql
```

Có thể chạy nội dung file qua Supabase SQL Editor, hoặc dùng Supabase CLI từ `backend/` sau khi liên kết đúng project:

```sh
cd backend
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Migration thêm `menu_item_views` và RPC `get_menu_item_view_counts()`. RLS cho phép ghi lượt xem món thuộc danh mục đang mở; chỉ admin đọc bản ghi chi tiết, public chỉ đọc tổng hợp. Backend gộp lượt mở lặp lại cùng món trong 30 giây/IP. Analytics admin hiển thị top 5 món được xem.

**Migration chưa được chạy lên database trong phiên bàn giao.** Menu và gợi ý vẫn dùng được khi thiếu bảng; chức năng phổ biến báo chưa có dữ liệu thay vì bịa thứ hạng. “Phổ biến” là lượt xem, không phải số bán.

Migration role thay mặc định đăng ký mới từ `admin` thành `user` và bỏ policy cho phép tự insert role. Các admin hiện có được giữ nguyên. Khi cần cấp thêm admin, chủ project thực hiện từ Supabase SQL Editor; ứng dụng không mở API cấp quyền.

## Đăng nhập và admin

Đăng nhập vẫn dùng tài khoản Supabase hiện có. Backend gọi Supabase để xác thực user và kiểm tra `has_role(..., 'admin')` ở mỗi API admin. Các truy vấn admin dùng JWT của chính user để giữ RLS, không cần service-role key.

Access token và refresh token được mã hóa trong cookie HttpOnly, SameSite=Lax. Backend tự refresh session. Production yêu cầu HTTPS và `SESSION_SECRET` dài ít nhất 32 ký tự, ổn định giữa các lần restart/instance. Mọi instance phải dùng cùng secret.

CRUD món/danh mục, cập nhật VAT, dịch 9 ngôn ngữ và analytics đều đi qua backend. Món mới hoặc mô tả thay đổi được backend điền các bản dịch còn trống, giữ nội dung đã nhập thủ công. Khi dịch lỗi, món vẫn được lưu và API trả cảnh báo. Nút dịch thủ công vẫn có sẵn trong form.

Ảnh được tải lên backend dưới dạng binary (tối đa 15 MB, 40 megapixel), chuyển WebP 1200px và thumbnail 400px rồi lưu Supabase Storage. Có hỗ trợ HEIC/HEIF phía server. **Optimize Images / Auto Fix All** chạy dưới dạng job backend, frontend chỉ theo dõi tiến độ. Các ảnh ngoài Supabase project được bỏ qua; không tải URL tùy ý từ server. Không tự xóa ảnh cũ trong job, tránh xóa ảnh của form chưa lưu.

## Production và triển khai FE/BE riêng

```sh
npm run build
NODE_ENV=production npm start
```

Lệnh `start` chỉ chạy API backend; file tĩnh nằm ở `frontend/dist`. Đưa frontend lên static hosting và backend lên Node hosting. Cấu hình reverse proxy **cùng origin** cho `/api/*` sang backend; những route còn lại phục vụ frontend/index.html. Xem `deployment/nginx.example.conf`.

Nếu dùng Vercel, đặt root directory là `frontend`, output directory `dist`. `frontend/vercel.json` chỉ có SPA fallback; cần thêm rewrite `/api/:path*` đến URL backend thật **trước** SPA fallback. Không publish cấu hình mặc định rồi trông chờ `/api` chạy như serverless function. Giữ `VITE_API_BASE_URL=/api` cho mô hình proxy này.

Backend nhận `NODE_ENV=production`, `SESSION_SECRET`, `FRONTEND_ORIGIN=https://your-menu-domain`, các biến Supabase và `GROQ_API_KEY` hoặc `GEMINI_API_KEY`. Không đặt Gemini/Supabase secret trong biến `VITE_*`. Cookie SameSite=Lax được thiết kế cho proxy cùng origin hoặc các domain cùng site; FE và BE trên hai site khác nhau cần proxy để đăng nhập hoạt động.

## Kiểm tra

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests dùng Node test runner, kiểm tra cả request handler API mà không cần mở cổng hoặc kết nối database thật: phân quyền, cookie/refresh, validation, phân trang >1000 món, VAT, ràng buộc món, fallback khi AI lỗi và xử lý ảnh/rollback upload.

Trong phiên bàn giao, trình duyệt đã đọc được menu thật (138 món / 14 danh mục). Đã gọi thử Gemini bằng key hiện có; project trả **429 quota exceeded**. Sandbox của terminal chặn DNS/mở cổng localhost, nên chưa chạy kiểm thử end-to-end với dev server và đăng nhập admin thật. Giao diện được kiểm tra bằng production bundle trong trình duyệt với API giả lập ở 320px, 390px và 1440px; đã kiểm tra đổi ngôn ngữ, bộ lọc, mở chi tiết và retry. Ảnh HEIC thật được giải mã và chuyển thành WebP 1200px + thumbnail 400px trong kiểm tra cục bộ. Không thay đổi website đang deploy.

### Kiểm tra RTR AI sau cập nhật

Đã kiểm tra 55 bài backend, TypeScript, lint các file liên quan và production build. Groq trả lời thật được câu hỏi gợi ý món bò không cay dưới 300.000đ, rồi trả lời địa chỉ và khu Verona có guitar trong cùng conversation. Trình duyệt đã kiểm tra nút RTR AI trên `/menu`, mở chat ở mobile 320px, giữ lịch sử khi chuyển sang `/home`, vùng nhập ở chiều cao 430px, và chế độ giảm chuyển động. Nút được render qua portal vào `document.body` để tránh bị bố cục menu che/cắt. Khung chat mobile trượt từ dưới lên, desktop mở tại góc nút.
