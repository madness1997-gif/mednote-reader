# Kết nối MedNote Windows với Google Drive

MedNote Windows dùng OAuth 2.0 cho ứng dụng cài đặt, mở đăng nhập trong trình duyệt mặc định và chỉ xin quyền `drive.appdata`. Không dùng Client Secret.

## 1. Tạo OAuth Client cho bản Windows

1. Mở Google Cloud Console và chọn cùng project đang dùng cho MedNote web.
2. Bật **Google Drive API** nếu chưa bật.
3. Vào **APIs & Services → OAuth consent screen**. Nếu ứng dụng còn ở chế độ Testing, thêm tài khoản Google của bạn vào **Test users**.
4. Vào **Credentials → Create credentials → OAuth client ID**.
5. Chọn **Desktop app**, đặt tên `MedNote Windows`, rồi tạo.
6. Sao chép chuỗi **Client ID** kết thúc bằng `.apps.googleusercontent.com`. Không cần tải hay nhập Client Secret.

## 2. Kết nối trong MedNote

1. Cài và mở **MedNote Reader**.
2. Bấm **Kết nối Drive**.
3. Dán Desktop Client ID vào ô cấu hình, rồi bấm **Kết nối**.
4. Trình duyệt mặc định của Windows sẽ mở. Chọn tài khoản Google và cấp quyền.
5. Quay lại MedNote, chọn **Lưu bản này lên Drive** hoặc **Tải bản từ Drive** khi ứng dụng hỏi cách xử lý dữ liệu đã có.

Nếu trình duyệt quay về `127.0.0.1` nhưng báo không thể hoàn tất đăng nhập, hãy đọc lý do hiển thị ngay trên trang đó. Lỗi thường gặp nhất là dán nhầm Web Client ID thay vì Client ID loại **Desktop app**, hoặc VPN/proxy/tường lửa chặn kết nối từ ứng dụng tới máy chủ Google.

Client ID là định danh công khai và được lưu cục bộ trên máy. Refresh token được mã hóa bằng cơ chế bảo vệ thông tin đăng nhập của Windows; ứng dụng không ghi Client Secret vào mã nguồn hay ổ đĩa.

## 3. Dùng chung dữ liệu với bản web

Hãy tạo OAuth Web client và Desktop client trong cùng một Google Cloud project. Cả hai bản đều dùng quyền `drive.appdata`, nên có thể đọc cùng bộ dữ liệu MedNote của tài khoản Google đã đăng nhập.
