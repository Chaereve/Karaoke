# KaraokeForge Studio 🎤🎬

**KaraokeForge** là ứng dụng web kết xuất video karaoke chuyên nghiệp, miễn phí, chạy hoàn toàn trên trình duyệt theo mô hình **Local-First** và bảo mật tuyệt đối riêng tư.

## 🚀 Tính năng nổi bật
* **Quản lý Media & Waveform**: Giải mã audio (MP3, WAV, M4A, OGG, FLAC) bằng Web Audio API, vẽ sóng âm độ phân giải cao, cắt đoạn (Trim) và điều chỉnh âm lượng/mute.
* **Đồng bộ lời bài hát (Sync Studio)**: Hỗ trợ Standard LRC, Enhanced LRC (từng từ), SRT, Plain Text. Chế độ **Tap-to-Sync** theo dòng và từng từ bằng phím `Space`, tinh chỉnh Nudge (`±10ms` đến `±500ms`) và Shift all.
* **Renderer tất định (Deterministic Canvas)**: Hỗ trợ hiệu ứng tô màu chạy ngang qua từng từ (`word-level fill`), 6 template chuyên nghiệp, nền gradient/ảnh/video, hạt ánh sáng (`particles`), Intro tiêu đề và đếm ngược `3-2-1`.
* **Xuất video phần cứng (Export Pipeline)**: Tích hợp `VideoEncoder` + `AudioEncoder` + `mp4-muxer` xuất MP4 H.264/AAC, tự động dự phòng WebM và MediaRecorder.
* **Lưu trữ IndexedDB & Autosave**: Lưu bản nháp tự động, khôi phục khi reload, hỗ trợ quản lý dự án và nhập/xuất file `.json`.

---

## 🛠️ Hướng dẫn chạy dự án trong 5 phút

### Yêu cầu hệ thống
* Node.js >= 18.0.0
* Trình duyệt hiện đại (Chrome, Edge, Firefox, Safari) hỗ trợ Web Audio API và HTML5 Canvas.

### Các bước cài đặt và chạy
1. Giải nén thư mục dự án `karaokeforge`.
2. Cài đặt các gói thư viện phụ thuộc:
   ```bash
   npm install
   ```
3. Khởi động môi trường phát triển (Dev Server):
   ```bash
   npm run dev
   ```
4. Mở trình duyệt tại địa chỉ: `http://localhost:5173`.

### Chạy Unit Test
```bash
npm run test
```

### Build sản phẩm để Deploy tĩnh (Vercel / Netlify / GitHub Pages)
```bash
npm run build
```
Kết quả build nằm trong thư mục `dist/`, sẵn sàng đưa lên mọi hosting tĩnh.
