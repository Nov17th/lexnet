# Kịch bản quay demo LexNet

Thời lượng mục tiêu: **4 phút 20 giây**, trong giới hạn 3–5 phút của đề bài. Tài liệu này gồm thao tác và lời thuyết minh để người quay đọc hoặc thu âm riêng.

## Chuẩn bị trước khi quay

1. Khởi động Fuseki và web theo [README](README.md#run-locally). Nếu đã có `.env.local`, giữ cấu hình đang dùng. Mở đúng URL mà terminal web hiển thị; mặc định là `http://127.0.0.1:3000`.
2. Kiểm tra đầu trang hiện **Endpoint connected**. Thử tìm `cat`, `bank`, `白色`; kiểm tra Topics và Knowledge graph tải được.
3. Trong **Developer → SPARQL**, thử trước truy vấn số **1** và **14** ở danh sách **Sample query → LexNet demo queries**. Truy vấn 14 cần mạng và endpoint Wikidata hoạt động.
4. Mở sẵn các tab web: Dictionary và Developer. Toàn bộ cảnh quay thực hiện trên giao diện ứng dụng.
5. Chuẩn bị sẵn chữ `白色` để dán, tránh mất thời gian gõ tiếng Trung. Chọn kích thước cửa sổ và mức zoom để đọc rõ chữ; đóng thông báo và tab riêng tư trước khi ghi hình.
6. Quay thử khoảng 15 giây để kiểm tra chữ, âm lượng micro và chuyển tab. Các mốc dưới đây bao gồm cả thời gian thao tác; đọc tự nhiên và chừa vài giây cho kết quả tải.

Không cần chạy lại pipeline hoặc sửa dữ liệu trong lúc quay. GitHub Pages phục vụ RDF và ontology; web và Fuseki được chạy riêng.

## Kịch bản chính

### 00:00–00:25 — Giới thiệu và kiến trúc

**Thao tác:** Mở Dictionary, chỉ ba ngôn ngữ và trạng thái **Endpoint connected**.

**Lời đọc:**

> Đây là LexNet, ứng dụng Linked Open Data hỗ trợ người Việt học tiếng Anh và tiếng Trung. Các từ được tổ chức quanh khái niệm chung, kèm nghĩa, trình độ và ví dụ. Giao diện gọi API của web; API thực thi SPARQL trên Fuseki để lấy dữ liệu RDF tại thời điểm truy vấn.

### 00:25–01:00 — Khái niệm, URI và liên kết dữ liệu

**Thao tác:** Trong **Dictionary**, tìm `cat` và mở kết quả danh từ. Mở **Source details** trong phần nghĩa, chỉ URI khái niệm của nhóm và liên kết **Exact match** đến Wikidata. Giữ cảnh trên ứng dụng để người xem đọc được hai địa chỉ.

**Lời đọc:**

> LexNet phân biệt từ, nghĩa của từ và khái niệm chung, đồng thời mô hình hóa chữ Hán và bộ thủ. Nhóm tổng hợp, rà soát dữ liệu rồi chuyển thành RDF theo ontology này. Trong Source details, mỗi khái niệm có URI riêng thuộc dữ liệu công bố trên GitHub Pages. Liên kết Exact match nối khái niệm cat với item tương ứng trên Wikidata. Nhờ đó, ứng dụng có thể lấy thêm thông tin từ dataset bên ngoài, như phần truy vấn ở cuối demo.

### 01:00–01:40 — Dịch đa ngôn ngữ và đa nghĩa

**Thao tác:** Ngay trên trang `cat`, thu gọn **Source details** và chỉ các từ cùng khái niệm ở ba ngôn ngữ. Tiếp tục tìm `bank` trong **Dictionary**, mở danh từ và cuộn qua hai nghĩa, trình độ và ví dụ.

**Lời đọc:**

> Với cat, ứng dụng tìm được các từ biểu đạt cùng khái niệm trong tiếng Anh, tiếng Việt và tiếng Trung. Tiếp theo, bank có hai nghĩa: tổ chức tài chính và bờ sông. Mỗi nghĩa gắn với một khái niệm riêng, có định nghĩa, ví dụ và trình độ riêng. Trong dữ liệu hiện tại, nghĩa tài chính là A1, còn nghĩa bờ sông là B1. Vì vậy, trình độ được đặt ở nghĩa của từ, thay vì gán chung cho cả từ.

### 01:40–02:05 — Lọc từ theo chủ đề và trình độ

**Thao tác:** Mở **Topics**. Chọn **Topic = Animals**, **Language = Chinese**, **Framework = HSK**, **Maximum level = HSK 2**. Giữ **Include unspecified levels** bỏ chọn. Chỉ danh sách kết quả.

**Lời đọc:**

> Người học có thể chọn chủ đề động vật, tiếng Trung và trình độ tối đa HSK 2. Kết quả được lọc theo thứ hạng trình độ của từng nghĩa. Các nghĩa chưa có trình độ được loại khỏi bộ lọc này, trừ khi người dùng chủ động chọn đưa chúng vào.

Tên chủ đề và khung trình độ được tải từ RDF; chọn nhãn tương ứng nếu bản dữ liệu mới đổi cách viết.

### 02:05–02:30 — Chữ Hán trong từ ghép

**Thao tác:** Về **Dictionary**, tìm `白色`. Trong **Explore the characters**, chỉ hai nút `白` và `色`, mở `白` và chỉ ký tự dễ nhầm `百`.

**Lời đọc:**

> Với từ ghép 白色, giao diện giữ thứ tự các chữ và hiển thị nghĩa riêng: white và color. Khi mở chữ 白, người học xem được thông tin chữ, bộ thủ và chữ có hình dạng gần giống là 百. Quan hệ giữa các chữ cũng giúp phát hiện sự dễ nhầm trong những từ ghép chứa chúng.

### 02:30–03:00 — Khám phá đồ thị

**Thao tác:** Mở lại entry danh từ `bank`, mở **Source details** ở một nghĩa rồi bấm **Explore in graph →**. Đợi bố cục ổn định. Rê chuột rồi chọn một nút nghĩa để hiện nhãn; chỉ màu loại nút. Bấm **Expand 1 step** một lần nếu kịp.

**Lời đọc:**

> Đồ thị thể hiện từ bank, các nghĩa và những tài nguyên liên quan. Các loại nút được phân biệt bằng màu. Rê chuột hoặc chọn nút sẽ hiện nhãn quan hệ và nghĩa để dễ đọc. Người dùng có thể mở rộng vùng lân cận từng bước; giao diện giới hạn số nút và cạnh để đồ thị vẫn dễ quan sát.

### 03:00–03:55 — SPARQL và truy vấn liên kết Wikidata

**Thao tác:** Mở **Developer → SPARQL**. Trong **Sample query**, chọn truy vấn số **1** về bản dịch của cat, bấm **Run query →** và chỉ bảng kết quả. Chọn truy vấn số **14**, chỉ `skos:exactMatch` và `SERVICE <https://query.wikidata.org/sparql>`, rồi chạy. Chỉ các nhãn ngoài ba ngôn ngữ của LexNet nếu kết quả trả về.

**Lời đọc:**

> Console cho phép xem, chỉnh sửa và chạy câu SPARQL trực tiếp. Truy vấn đầu tiên lấy các từ cùng khái niệm cat và trình độ từ endpoint của nhóm. Truy vấn số 14 dùng liên kết skos:exactMatch của khái niệm này để tìm item tương ứng trên Wikidata. Khối SERVICE gửi phần truy vấn sang endpoint Wikidata và lấy thêm các nhãn đa ngôn ngữ, chẳng hạn tiếng Pháp hoặc tiếng Hàn. Đây là ví dụ khai thác liên kết giữa hai dataset trong một câu truy vấn. Console hỗ trợ truy vấn đọc dữ liệu và từ chối thao tác cập nhật.

### 03:55–04:20 — Thống kê và kết thúc

**Thao tác:** Chuyển **Developer → Overview**, chỉ số lượng tài nguyên và bảng **Language coverage**. Dừng ở một màn hình ổn định.

**Lời đọc:**

> Overview thống kê trực tiếp số tài nguyên và mức độ đầy đủ của dữ liệu theo ngôn ngữ. Qua demo, có thể thấy dữ liệu RDF có URI và liên kết Wikidata được khai thác bằng SPARQL. Giao diện đưa các quan hệ trong đồ thị vào những chức năng cụ thể cho người học: tra nghĩa đa ngôn ngữ, lọc trình độ và khám phá chữ Hán.

## Cảnh audio tùy chọn: thêm 15–20 giây

Chỉ thêm khi đã thử phát thành công trước khi quay. Tổng thời lượng khi thêm cảnh này khoảng **4 phút 40 giây**.

**Thao tác:** Mở `bank`, tải danh sách audio theo điều khiển trên trang; chọn bản **American English**, phát khoảng 2–3 giây và chỉ liên kết nguồn Wikidata. Nếu có bản **British English**, chỉ nhãn để minh họa các biến thể phát âm.

**Lời đọc:**

> Từ còn được liên kết đến lexeme Wikidata để lấy audio khi người dùng yêu cầu. Giao diện hiển thị biến thể phát âm nếu nguồn cung cấp và ưu tiên American English. Âm thanh được phục vụ từ Wikimedia.

Audio của giao diện dùng một yêu cầu riêng đến Wikidata. Cảnh SPARQL số 14 mới minh họa federation bằng `SERVICE`.

## Dự phòng khi quay

| Tình huống | Cách xử lý |
|---|---|
| Endpoint offline | Dừng quay, kiểm tra Fuseki và `SPARQL_ENDPOINT`, rồi quay lại khi trạng thái connected. |
| Truy vấn 14 chậm hoặc lỗi | Nếu sau khoảng 10 giây chưa có kết quả, dùng **Cancel**. Giữ mã truy vấn trên màn hình và nói: “Truy vấn này gọi Wikidata qua SERVICE; hiện endpoint ngoài chưa trả kết quả, nên lượt quay này chưa minh họa được phần kết quả federation.” Giữ cảnh truy vấn 1 thành công; thử quay lại cảnh 14 khi dịch vụ hoạt động. |
| Audio không tải hoặc không phát | Bỏ cảnh audio tùy chọn. Nếu đã quay tới lỗi, nói ngắn rằng nguồn audio ngoài đang không truy cập được. Không nói đã phát thành công. |
| Đồ thị chưa ổn định hoặc quá nhiều nút | Đợi bố cục ổn định, dùng **Fit**, chọn một nút nghĩa và bỏ thao tác mở rộng. |
| Số lượng tài nguyên thay đổi | Đọc số đang hiện ở Overview nếu cần; không dùng số ghi nhớ từ bản dữ liệu cũ. |

## Kiểm tra bản quay trước khi nộp

- Thời lượng nằm trong 3–5 phút; chữ và kết quả truy vấn đọc được.
- Phần giới thiệu giải thích mô hình và quá trình chuẩn bị dữ liệu; các cảnh trên web minh họa URI, liên kết dataset ngoài và giao diện SPARQL. Chi tiết ontology và nguồn dữ liệu được trình bày trong slide hoặc report.
- Nhãn nghĩa của `bank`, chữ Hán và phần `SERVICE` xuất hiện đủ lâu để người xem nhận ra.
- Lời thuyết minh khớp với kết quả thực tế; phần truy vấn hoặc audio lỗi được nói rõ.
- Không nói web chạy OWL reasoner: bước kiểm tra suy luận thuộc pipeline của nhóm, còn web truy vấn RDF đã nạp vào Fuseki.
- Không nói GitHub Pages chạy Next.js hay Fuseki: Pages phục vụ các file dữ liệu và ontology.

Sau khi nhóm lưu hoặc đăng video, cập nhật đường dẫn tại `../deliverables/demo/README.md` theo cách nộp bài của nhóm.
