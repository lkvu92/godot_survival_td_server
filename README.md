# Survival TD — Production Backend Deployment (VPS)

Seed/schema updates and explicit ads/payment publication: [Seeding guide](docs/SEEDING.md).

> **Repository:** `https://github.com/lkvu92/godot_survival_td_server.git` — branch `main`
> Nhánh này chỉ chứa toàn bộ mã nguồn backend, dịch vụ xác thực thanh toán, cấu hình Docker và dữ liệu cân bằng game (`data/*.json`) cần thiết để vận hành máy chủ trên VPS. Đã loại bỏ hoàn toàn mã nguồn client Godot, assets hình ảnh/âm thanh và tài liệu phát triển.

---

## 🏗️ Kiến trúc Hệ thống Backend

Hệ thống máy chủ bao gồm 3 container Docker chính chạy trong cùng một network:

1. **Nakama Server (`heroiclabs/nakama:3.24.2`)**:
   - Game server authoritative quản lý User Authentication, Account Linking, Cloud Save, Inventory, Vip, Lực chiến, Bảng xếp hạng và Remote Game Config.
   - Entrypoint TypeScript runtime đã được biên dịch sẵn tại `nakama/data/build/index.js`.
   - Cổng giao tiếp: `7350` (HTTP/REST), `7349` (gRPC), `7351` (Web Console - chỉ bind local).

2. **PostgreSQL 16 (`postgres:16-alpine`)**:
   - Lưu trữ toàn bộ bảng cấu hình game (`game_heroes`, `game_stages`, `game_items`, v.v.), bảng dữ liệu người chơi, storage engine và purchase ledgers.
   - Cổng nội bộ: `5432` (chỉ bind `127.0.0.1` để bảo mật).

3. **Monetization Verifier (`services/monetization-verifier`)**:
   - Microservice Node.js xác thực thanh toán Google Play IAP, Google Play Real-Time Developer Notifications (RTDN) và AdMob Server-Side Verification (SSV).
   - Cổng nội bộ: `8080` (mapping ra ngoài qua port `8082` hoặc reverse proxy).

---

## 📁 Cấu trúc Thư mục trên VPS

```text
├── deploy.sh              # Script tự động hóa khởi chạy, kiểm tra healthcheck và seed data
├── app-ads.txt            # File định danh AdMob để host ở root domain
├── .gitignore             # Quy tắc loại trừ secrets, node_modules và log
├── data/                  # Game balance & config JSON (dùng để seed vào PostgreSQL)
│   ├── heroes.json
│   ├── enemies.json
│   ├── stages.json
│   ├── stage_levels.json
│   ├── items.json
│   ├── skills.json
│   ├── packs.json
│   └── ...
├── nakama/                # Máy chủ Nakama chính
│   ├── docker-compose.yml # Định nghĩa container stack
│   ├── .env.example       # Template biến môi trường bảo mật
│   ├── iap.secret.example.yml # Template Google Service Account cho IAP
│   ├── seed_all.py        # Script Python seed data từ data/ vào DB
│   ├── package.json       # Dependencies cho TypeScript runtime
│   └── data/
│       ├── local.yml      # Cấu hình Nakama server runtime
│       ├── build/index.js # Runtime JS bundle đã build sẵn
│       └── modules/       # Mã nguồn TypeScript gốc của các RPC
└── services/
    └── monetization-verifier/ # Microservice xác thực IAP & AdMob
        ├── Dockerfile
        ├── package.json
        └── src/server.js
```

---

## 🚀 Hướng dẫn Triển khai Từng bước (Quick Start)

### 1. Yêu cầu hệ thống trên VPS
- **Hệ điều hành:** Ubuntu 22.04 / 24.04 LTS hoặc Debian 12 (khuyến nghị).
- **Phần mềm bắt buộc:**
  - Docker & Docker Compose (`docker compose version` >= 2.20).
  - Python 3 (`python3 --version` >= 3.8) để chạy script seed dữ liệu ban đầu.
  - `curl` để kiểm tra healthcheck.

### 2. Tải mã nguồn về VPS
```bash
git clone https://github.com/lkvu92/godot_survival_td_server.git survival_td_server
cd survival_td_server
chmod +x deploy.sh
```

### 3. Cấu hình Biến môi trường & Secrets
Tạo file cấu hình bí mật từ template mẫu:

```bash
# 1. Cấu hình biến môi trường Nakama & Postgres
cp nakama/.env.example nakama/.env
nano nakama/.env

# 2. Cấu hình Google Play IAP Service Account
cp nakama/iap.secret.example.yml nakama/iap.secret.yml
nano nakama/iap.secret.yml
```

> [!IMPORTANT]
> - Thay đổi `POSTGRES_PASSWORD` và `NAKAMA_HTTP_KEY` trong `nakama/.env` thành chuỗi ngẫu nhiên có độ bảo mật cao.
> - Dán `client_email` và `private_key` của Google Play Console Service Account vào `nakama/iap.secret.yml`.

### 4. Triển khai và Seed dữ liệu chỉ với 1 lệnh
Chạy lệnh triển khai tự động:
```bash
./deploy.sh deploy
```

Kịch bản `deploy.sh` sẽ tự động:
1. Tạo file bí mật mẫu nếu chưa có.
2. Build container Monetization Verifier và khởi động PostgreSQL + Nakama.
3. Chờ Nakama hoàn thành khởi động và đạt trạng thái Healthy.
4. Tự động chạy `seed_all.py` để nạp toàn bộ cấu hình từ `data/*.json` vào PostgreSQL.

---

## ⚙️ Các lệnh Quản lý Thường dùng

| Mục đích | Lệnh thực hiện |
|---|---|
| **Khởi động / Deploy lại** | `./deploy.sh deploy` (hoặc `cd nakama && docker compose up -d`) |
| **Dừng hệ thống** | `./deploy.sh stop` (hoặc `cd nakama && docker compose down`) |
| **Khởi động lại** | `./deploy.sh restart` |
| **Xem log hệ thống** | `./deploy.sh logs` hoặc `./deploy.sh logs nakama` |
| **Kiểm tra trạng thái** | `./deploy.sh health` |
| **Seed lại dữ liệu game** | `./deploy.sh seed` (hoặc `python3 nakama/seed_all.py`) |
| **Biên dịch lại TS Runtime** | `./deploy.sh build` (yêu cầu VPS có Node.js & npm) |

---

## 🔒 Cấu hình Tên miền & Reverse Proxy (Nginx)

Game client Android kết nối qua HTTPS/WSS (cổng 443). Tuyệt đối **không mở public** cổng `5432` (PostgreSQL) hoặc `7351` (Nakama Console) ra ngoài internet.

Mẫu cấu hình Nginx gợi ý (`/etc/nginx/sites-available/survival-td.conf`):

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # 1. Nakama Game Client API & RPC
    location /v2/ {
        proxy_pass http://127.0.0.1:7350;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 2. Nakama Realtime WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:7350;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # 3. AdMob SSV Callback & Google Play RTDN
    location /admob/ssv {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /google-play/rtdn {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 4. Host file app-ads.txt cho AdMob
    location = /app-ads.txt {
        alias /path/to/survival_td_server/app-ads.txt;
        default_type text/plain;
    }
}
```

---

## 📱 Cấu hình Client Game kết nối đến VPS

Khi xuất bản bản build release (Android APK/AAB), trong `project.godot` cấu hình trỏ về domain VPS:

```ini
[nakama]
environment="production"
production_host="api.yourdomain.com"
production_port=443
production_scheme="https"
production_server_key="defaultkey"
```

Xác nhận server hoạt động từ trình duyệt hoặc thiết bị di động:
`https://api.yourdomain.com/v2/rpc/get_game_config?table=heroes` (với header Authorization tương ứng).
