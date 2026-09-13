# PPT Generator & Bible Extractor

웹 브라우저에서 편리하게 성경 구절과 찬송가를 검색하고, 예배용 PPT 슬라이드를 생성/관리하는 애플리케이션입니다.

## 주요 기능

### 1. 성경 텍스트 (Bible Extractor)
- 구약/신약, 책, 장/절 범위 선택
- **다중 번역 지원**: 한글(새번역/개역한글/현대인의 성경) + 영어(NIV) 동시 표시
- **텍스트/PPTX 다운로드**: 선택한 구절을 텍스트 파일이나 포맷팅된 PPTX로 다운로드

### 2. 슬라이드 생성기 (PPT Editor)
- **서버 저장소 (Persistence)**:
  - 모든 슬라이드 데이터는 서버(`data/slides.json`)에 영구 저장됩니다.
  - 브라우저를 닫거나 새로고침해도 데이터가 유지됩니다.
- **슬라이드 타입**:
  - **단순 슬라이드**: 텍스트, 이미지, 배경 설정 가능.
  - **찬송가 (Hymn)**: 장수만 입력하면 RickC.online에서 자동으로 악보 PPT를 다운로드하여 구성.
  - **타이틀 (주일 예배)**: 디자인 3종(클래식 채플 / 모던 에디토리얼 / 스테인드 글로우)과
    교회 이름, 주일 날짜만 고르면 예배 표지를 자동 생성. 날짜 목록은 다음 주일이 기본값이고,
    절기(부활주일·추수감사주일 등)에 해당하면 부제를 자동으로 제안합니다.
  - **타이틀 (Custom)**: 타이틀 이름(한글 / 영문)만 넣는 단순 표지 슬라이드.
    디자인 4종(오로라 그라디언트 / 모노리스 / 아이보리 클래식 / 마키 프레임)을 고를 수 있고,
    한글 제목 길이에 맞춰 글자 크기가 자동으로 조절됩니다.
- **파일 업로드**:
  - 내 컴퓨터의 PPTX 파일을 업로드하여 슬라이드로 추가.
  - 대용량 파일(최대 50MB) 지원.
- **미리보기 (Preview)**:
  - `.pptx` 및 텍스트 슬라이드: 실시간 렌더링.
  - **찬송가(.ppt) 슬라이드**: MS Office Online Viewer를 통한 실시간 미리보기 (별도 변환 불필요).

## 설치 및 실행

### 요구 사항
- Node.js (v16 이상 권장)

### 실행 방법

1. 의존성 설치
   ```bash
   npm install
   ```

2. 개발 서버 실행 (Vite 미들웨어 + API)
   ```bash
   npm run dev
   ```
   - 기본 포트: `3000` (http://localhost:3000)
   - 프론트엔드는 Vite HMR로 자동 반영됩니다. `server.js`/`lib/`를 고친 경우에는 서버를 직접 재시작하세요.

3. 운영 실행
   ```bash
   npm run build
   npm start
   ```

## 프로젝트 구조

- **Backend (`server.js`)**:
  - API 엔드포인트 제공 (`/api/slides`, `/api/upload`, `/api/hymn/download`)
  - 파일 시스템 기반 데이터 저장 (`data/slides.json`)
  - `curl`을 이용한 안정적인 외부 리소스 다운로드

- **Frontend (`public/`)**:
  - 바닐라 JS (`app.js`) 기반의 SPA 구조
  - 실시간 미리보기 및 슬라이드 관리 UI

## API 명세

- `GET /api/slides`: 슬라이드 목록 조회
- `POST /api/slides`: 슬라이드 목록 저장 (전체 덮어쓰기)
- `POST /api/upload`: 파일 업로드 (Multipart)
- `POST /api/hymn/download`: 찬송가 PPT 다운로드 (RickC.online 연동)
- `POST /api/create-title-slide-pptx`: 타이틀(주일 예배) 슬라이드 PPTX 생성
- `POST /api/create-custom-title-slide-pptx`: 타이틀(Custom) 슬라이드 PPTX 생성
- `DELETE /api/slides/:id`: 슬라이드 삭제

## 라이선스
MIT
