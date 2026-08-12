# Kết nối MedNote Windows với Google Drive

MedNote Windows dùng OAuth 2.0 cho ứng dụng cài đặt và mở đăng nhập trong trình duyệt mặc định. Bản sao lưu mới dùng quyền giới hạn `drive.file`, chỉ truy cập thư mục/tệp do MedNote tạo; quyền `drive.appdata` chỉ còn dùng để nhập các bản sao lưu cũ. Ứng dụng hỗ trợ cả OAuth Desktop không yêu cầu Secret và OAuth Desktop được Google cấp kèm Secret.

## 1. Tạo OAuth Client cho bản Windows

1. Mở Google Cloud Console và chọn cùng project đang dùng cho MedNote web.
2. Bật **Google Drive API** nếu chưa bật.
3. Vào **APIs & Services → OAuth consent screen**. Nếu ứng dụng còn ở chế độ Testing, thêm tài khoản Google của bạn vào **Test users**.
4. Vào **Credentials → Create credentials → OAuth client ID**.
5. Chọn **Desktop app**, đặt tên `MedNote Windows`, rồi tạo.
6. Bấm tải tệp JSON của client vừa tạo, rồi mở tệp bằng trình soạn thảo văn bản.

## 2. Kết nối trong MedNote

1. Cài và mở **MedNote Reader**.
2. Bấm **Kết nối Drive**.
3. Sao chép `installed.client_id` trong tệp JSON vào ô **OAuth Client ID (Desktop)**.
4. Sao chép `installed.client_secret` vào ô **Client Secret (Desktop)**. Nếu tệp không có trường này thì để trống.
5. Bấm **Kết nối**.
6. Trình duyệt mặc định của Windows sẽ mở. Chọn tài khoản Google và cấp quyền.
7. Quay lại MedNote, chọn **Lưu bản này lên Drive** hoặc **Tải bản từ Drive** khi ứng dụng hỏi cách xử lý dữ liệu đã có.

Nếu trình duyệt quay về `127.0.0.1` nhưng báo `client_secret is missing`, quay lại MedNote và nhập đúng `installed.client_secret` cùng Client ID của chính tệp đó. Các lỗi thường gặp khác là dán nhầm Web Client ID thay vì Client ID loại **Desktop app**, hoặc VPN/proxy/tường lửa chặn kết nối từ ứng dụng tới máy chủ Google.

Client ID là định danh công khai và được lưu cục bộ trên máy. Client Secret (nếu có) và refresh token được mã hóa bằng cơ chế bảo vệ thông tin đăng nhập của Windows; ứng dụng không ghi Secret vào mã nguồn hoặc `localStorage`.

## 3. Dùng chung dữ liệu với bản web

Hãy tạo OAuth Web client và Desktop client trong cùng một Google Cloud project. Cả hai bản dùng `drive.file` cho thư mục **MedNote Reader**, nên có thể đọc cùng bộ dữ liệu của tài khoản Google đã đăng nhập mà không xin quyền truy cập toàn bộ Drive.
