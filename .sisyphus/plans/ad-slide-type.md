# 광고 슬라이드 타입 추가

## Context

### Original Request
PPT 생성기에 새로운 슬라이드 타입 "광고" 추가. 기본적으로 단순 슬라이드와 동일하나 다음 기능 추가:
- 광고 제목: 슬라이드 상단 제목
- 광고 제목 정렬: 가운데, 왼쪽, 오른쪽
- 광고 제목 크기: 대, 중, 소 (항상 볼드, "대" 선택 시 텍스트 박스 꽉차게)
- 배경그림: 파일 업로드 또는 URL 입력
- 배경그림 투명도: 슬라이더 0-100%

### Interview Summary
**Key Discussions**:
- 제목 + 본문 둘 다 표시 (제목=상단, 본문=중앙/하단)
- 배경그림: 파일 업로드 + URL 입력 둘 다 지원
- 투명도: 슬라이더 UI (0-100%)
- 제목 크기: 대/중/소 프리셋 (기본 중), 항상 볼드
- 테스트 전략: 수동 테스트 (기존 프로젝트 방식 유지)

**Research Findings**:
- 현재 슬라이드 타입: `simple`, `hymn`
- 기존 배경 이미지 패턴: `server.js:1059-1088` (`applySlideBackground`)
- 파일 업로드 패턴: multer 기반 (`server.js:93-154`)
- 슬라이드 생성: `app.js:515-537` (`createSlide`)

### Metis Review
**Identified Gaps** (addressed):
- File vs URL 동시 입력 시 충돌 → 나중 입력 우선 (상호 배타적 UI)
- "Fit text to box" 해석 → 고정 폰트 크기 + 줄바꿈 (대=60pt, 중=40pt, 소=24pt)
- Opacity 의미 → 0%=투명(배경 완전 보임), 100%=완전 어두움 (오버레이 투명도)
- 이미지 포맷/크기 제한 → JPEG, PNG 지원, 최대 5MB
- URL 실패 시 → 검정 배경으로 폴백

---

## Work Objectives

### Core Objective
PPT 생성기에 새로운 "광고" 슬라이드 타입을 추가하여, 사용자가 제목+본문+배경이미지+투명도를 설정할 수 있게 한다.

### Concrete Deliverables
- `index.html`: 광고 슬라이드 타입 선택기 옵션 + 설정 폼
- `app.js`: 광고 슬라이드 생성/편집/저장/미리보기 로직
- `server.js`: 광고 슬라이드 PPTX 생성 API

### Definition of Done
- [ ] 슬라이드 타입 드롭다운에 "광고" 옵션 표시됨
- [ ] 광고 슬라이드 설정 폼(제목, 크기, 정렬, 배경이미지, 투명도)이 작동함
- [ ] 배경 이미지 업로드 및 URL 입력 가능
- [ ] 미리보기에서 배경 이미지 + 투명도 반영됨
- [ ] PPTX 다운로드 시 배경 이미지 + 제목 + 본문 정상 렌더링

### Must Have
- 광고 타입 선택 시 기존 simple 설정 유지 + 추가 설정 표시
- 제목/본문 모두 슬라이드에 표시
- 배경 이미지 파일 업로드 (JPEG, PNG)
- 배경 이미지 URL 입력 지원
- 투명도 슬라이더 0-100%
- PPTX 생성 시 배경 이미지 + 오버레이 적용

### Must NOT Have (Guardrails)
- 이미지 크롭, 줌, 위치 조정 컨트롤
- 배경 비디오 지원
- 오버레이 색상 선택기 (검정 오버레이만)
- 템플릿/프리셋 시스템
- 자동 폰트 크기 축소 알고리즘 (고정 크기만)
- 기존 simple/hymn 슬라이드 동작 변경
- slides.json에 이미지 base64 저장 (파일 경로만 저장)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO
- **User wants tests**: 수동 테스트
- **Framework**: none

### Manual QA Procedures
각 TODO는 수동 검증 절차를 포함합니다. 검증 도구:
- **Frontend/UI**: 브라우저에서 직접 확인
- **API/Backend**: curl 또는 브라우저 네트워크 탭

---

## Task Flow

```
Task 1 (HTML) → Task 2 (JS 기본) → Task 3 (JS 미리보기)
                                 ↘ Task 4 (JS 저장) → Task 5 (Backend)
```

## Parallelization

| Task | Depends On | Reason |
|------|------------|--------|
| 1 | - | 독립적 HTML 작업 |
| 2 | 1 | HTML 요소 ID 필요 |
| 3 | 2 | createSlide 속성 필요 |
| 4 | 2 | createSlide 속성 필요 |
| 5 | 4 | 업로드된 이미지 경로 필요 |

---

## TODOs

- [x] 1. HTML: 광고 슬라이드 타입 선택기 및 설정 폼 추가

  **What to do**:
  - `index.html` 라인 194-197: 슬라이드 타입 `<select>`에 `<option value="ad">광고</option>` 추가
  - 라인 265 근처 (hymn 설정 div 다음): 새로운 `<div id="adSlideSettings">` 추가
    - 제목 입력: `<input id="adTitle" type="text" placeholder="광고 제목">`
    - 제목 크기: `<select id="adTitleSize">` (대/중/소, 기본 중)
    - 제목 정렬: `<select id="adTitleAlign">` (왼쪽/가운데/오른쪽, 기본 가운데)
    - 배경 이미지 소스 선택: 라디오 버튼 (파일 업로드 / URL 입력)
    - 파일 업로드: `<input id="adBgImageFile" type="file" accept="image/jpeg,image/png">`
    - URL 입력: `<input id="adBgImageUrl" type="url" placeholder="https://...">`
    - 투명도: `<input id="adBgOpacity" type="range" min="0" max="100" value="30">` + 현재값 표시 span
  - 기존 simple 설정(텍스트, 폰트, 크기, 배경색, 정렬)도 광고 타입에서 사용하므로 표시

  **Must NOT do**:
  - 이미지 크롭/줌/위치 조정 컨트롤 추가 금지
  - 오버레이 색상 선택기 추가 금지

  **Parallelizable**: NO (첫 번째 작업)

  **References**:
  - `public/index.html:192-198` - 기존 슬라이드 타입 선택기 패턴
  - `public/index.html:201-263` - 단순 슬라이드 설정 폼 패턴
  - `public/index.html:265-275` - 찬송가 설정 폼 패턴

  **Acceptance Criteria**:
  - [ ] 브라우저에서 `http://localhost:3000` 접속
  - [ ] 슬라이드 타입 드롭다운에 "광고" 옵션 표시됨
  - [ ] "광고" 선택 시 광고 설정 폼 표시됨
  - [ ] 제목 입력, 크기/정렬 선택, 배경 이미지 업로드/URL, 투명도 슬라이더 UI 존재

  **Commit**: YES
  - Message: `feat(ppt): add ad slide type HTML structure`
  - Files: `public/index.html`

---

- [x] 2. JS: 광고 슬라이드 생성 및 에디터 로직

  **What to do**:
  - `app.js` 상단: 새 DOM 요소 참조 추가
    ```javascript
    const adSlideSettings = document.getElementById('adSlideSettings');
    const adTitleInput = document.getElementById('adTitle');
    const adTitleSizeSelect = document.getElementById('adTitleSize');
    const adTitleAlignSelect = document.getElementById('adTitleAlign');
    const adBgSourceRadios = document.querySelectorAll('input[name="adBgSource"]');
    const adBgImageFile = document.getElementById('adBgImageFile');
    const adBgImageUrl = document.getElementById('adBgImageUrl');
    const adBgOpacity = document.getElementById('adBgOpacity');
    ```
  - `createSlide()` (라인 515-537): 광고 속성 추가
    ```javascript
    // Ad slide specific properties
    adTitle: "",
    adTitleSize: "medium",    // large, medium, small
    adTitleAlign: "center",   // left, center, right
    adBgSource: "none",       // none, file, url
    adBgImagePath: null,      // 서버 저장 경로
    adBgImageUrl: null,       // 외부 URL
    adBgOpacity: 30,          // 0-100 (기본 30%)
    ```
  - 슬라이드 타입 변경 이벤트 (라인 398-409): 광고 타입 처리 추가
    - `type === 'ad'` 일 때: `simpleSlideSettings` 표시 + `adSlideSettings` 표시
  - `populateEditor()` (라인 1132-1160): 광고 속성 로드
    - 광고 타입일 때 추가 필드 값 설정
  - 배경 이미지 소스 라디오 버튼 이벤트: 파일/URL 입력 필드 토글

  **Must NOT do**:
  - 기존 simple/hymn 타입 동작 변경 금지

  **Parallelizable**: NO (Task 1 완료 필요)

  **References**:
  - `public/app.js:391-409` - 기존 DOM 참조 및 타입 변경 이벤트 패턴
  - `public/app.js:515-537` - createSlide 기존 구조
  - `public/app.js:1132-1160` - populateEditor 기존 구조

  **Acceptance Criteria**:
  - [ ] 브라우저에서 새 슬라이드 추가 → 타입 "광고" 선택
  - [ ] 광고 설정 폼과 기본 설정 폼 모두 표시됨
  - [ ] 제목, 크기, 정렬, 배경 소스 설정 가능
  - [ ] 슬라이드 목록에서 다른 슬라이드 선택 후 다시 광고 슬라이드 선택 → 값 유지됨

  **Commit**: YES
  - Message: `feat(ppt): add ad slide creation and editor logic`
  - Files: `public/app.js`

---

- [x] 3. JS: 광고 슬라이드 미리보기 렌더링

  **What to do**:
  - `renderPreview()` 함수 확장 (또는 새 함수 `renderAdPreview()` 생성)
  - 광고 타입 + basic 소스일 때:
    - 배경 이미지 있으면 CSS `background-image` 적용
    - 투명도 적용: 검정 오버레이 `rgba(0,0,0, opacity/100)` 레이어
    - 제목 표시: 상단, 볼드, 크기에 따른 font-size (대=24px, 중=18px, 소=14px - 미리보기 비율)
    - 본문 표시: 중앙/하단
  - 배경 이미지 URL 입력 시 디바운스 (500ms) 적용
  - 이미지 로드 실패 시 검정 배경 폴백

  **Must NOT do**:
  - 실시간 고해상도 이미지 렌더링 (CSS `background-size: cover` 사용)
  - URL 입력마다 즉시 fetch (디바운스 필수)

  **Parallelizable**: YES (Task 4와 병렬 가능)

  **References**:
  - `public/app.js:729-1089` - 기존 renderPreview 로직 (위치 확인 필요)
  - `public/styles.css:597-640` - 미리보기 영역 CSS

  **Acceptance Criteria**:
  - [ ] 광고 슬라이드에서 배경 이미지 파일 선택 → 미리보기에 표시됨
  - [ ] URL 입력 → 500ms 후 미리보기에 표시됨
  - [ ] 투명도 슬라이더 조정 → 미리보기에 오버레이 반영됨
  - [ ] 제목 입력 → 미리보기 상단에 볼드로 표시됨
  - [ ] 본문 입력 → 미리보기 중앙에 표시됨

  **Commit**: YES
  - Message: `feat(ppt): add ad slide preview rendering`
  - Files: `public/app.js`, `public/styles.css` (필요시)

---

- [x] 4. JS: 광고 슬라이드 저장 로직

  **What to do**:
  - `saveCurrentSlide()` (라인 1278-1407) 확장
  - 광고 타입일 때:
    - `slide.adTitle = adTitleInput.value`
    - `slide.adTitleSize = adTitleSizeSelect.value`
    - `slide.adTitleAlign = adTitleAlignSelect.value`
    - `slide.adBgOpacity = parseInt(adBgOpacity.value)`
  - 배경 이미지 파일 업로드 처리:
    - 파일 선택됨 → 기존 `uploadFile()` 함수 활용 → 경로 저장
    - `slide.adBgSource = 'file'`
    - `slide.adBgImagePath = uploadResult.path`
  - URL 입력 처리:
    - `slide.adBgSource = 'url'`
    - `slide.adBgImageUrl = adBgImageUrl.value`
  - 배경 없음 처리:
    - `slide.adBgSource = 'none'`

  **Must NOT do**:
  - 이미지 base64를 slides.json에 저장 금지 (파일 경로만)
  - 파일과 URL 동시 저장 금지 (상호 배타적)

  **Parallelizable**: YES (Task 3와 병렬 가능)

  **References**:
  - `public/app.js:1278-1350` - 기존 saveCurrentSlide 로직
  - `public/app.js:1260-1276` - uploadFile 함수

  **Acceptance Criteria**:
  - [ ] 광고 슬라이드 설정 후 "저장" 클릭
  - [ ] 배경 이미지 파일 업로드됨 (네트워크 탭에서 /api/upload 확인)
  - [ ] 페이지 새로고침 → 광고 슬라이드 선택 → 모든 설정 유지됨
  - [ ] slides.json에 광고 속성 저장됨 확인

  **Commit**: YES
  - Message: `feat(ppt): add ad slide save logic with image upload`
  - Files: `public/app.js`

---

- [ ] 5. Backend: 광고 슬라이드 PPTX 생성 API

  **What to do**:
  - `server.js`에 새 엔드포인트 추가: `POST /api/create-ad-slide-pptx`
  - 요청 바디:
    ```json
    {
      "content": "본문 텍스트",
      "font": "Malgun Gothic",
      "fontSize": "40",
      "bg": "black",
      "align": "center",
      "adTitle": "광고 제목",
      "adTitleSize": "medium",
      "adTitleAlign": "center",
      "adBgSource": "file|url|none",
      "adBgImagePath": "/uploads/xxx.jpg",
      "adBgImageUrl": "https://...",
      "adBgOpacity": 30
    }
    ```
  - PPTX 생성 로직:
    1. `pptx.addSlide()` 생성
    2. 배경 이미지 적용 (기존 `applySlideBackground` 패턴 참조):
       - `adBgSource === 'file'`: 서버 파일 읽어서 base64 변환 → `slide.addImage()`
       - `adBgSource === 'url'`: URL fetch (10초 타임아웃) → base64 → `slide.addImage()`
       - 오버레이 적용: `slide.addShape(rect)` with `transparency: 100 - adBgOpacity`
    3. 제목 추가:
       - 위치: 상단 (y: 5%, h: 15%)
       - 폰트 크기: 대=60pt, 중=40pt, 소=24pt
       - 볼드: `bold: true`
       - 정렬: `adTitleAlign`
    4. 본문 추가:
       - 위치: 중앙 (y: 25%, h: 65%)
       - 기존 simple 슬라이드와 동일한 스타일

  **Must NOT do**:
  - 이미지 원본 크기 그대로 사용 금지 (1920px 이상이면 리사이즈 권장)
  - URL fetch 무한 대기 금지 (10초 타임아웃)

  **Parallelizable**: NO (Task 4 완료 필요)

  **References**:
  - `server.js:282-348` - 기존 `/api/create-slide-pptx` 패턴
  - `server.js:1059-1088` - `applySlideBackground` 함수 (배경 이미지 + 오버레이)
  - `server.js:93-154` - 파일 업로드 multer 설정
  - PptxGenJS 문서: `slide.addImage()`, `slide.addText()`, `slide.addShape()`

  **Acceptance Criteria**:
  - [ ] curl 테스트:
    ```bash
    curl -X POST http://localhost:3000/api/create-ad-slide-pptx \
      -H "Content-Type: application/json" \
      -d '{"content":"본문","adTitle":"제목","adTitleSize":"medium","adBgSource":"none","adBgOpacity":30}' \
      --output test-ad.pptx
    ```
  - [ ] PowerPoint/Google Slides에서 test-ad.pptx 열기
  - [ ] 제목이 상단에 볼드로 표시됨
  - [ ] 본문이 중앙에 표시됨
  - [ ] (배경 이미지 테스트) 이미지 + 오버레이 정상 렌더링

  **Commit**: YES
  - Message: `feat(ppt): add ad slide PPTX generation API`
  - Files: `server.js`

---

- [ ] 6. JS: 광고 슬라이드 다운로드 연동

  **What to do**:
  - `downloadSlide()` 함수 확장
  - 광고 타입 + basic 소스일 때:
    - `/api/create-ad-slide-pptx` 호출
    - 필요한 모든 광고 속성 전달

  **Must NOT do**:
  - 기존 simple/hymn 다운로드 로직 변경 금지

  **Parallelizable**: NO (Task 5 완료 필요)

  **References**:
  - `public/app.js` - 기존 downloadSlide 함수 (위치 확인 필요)

  **Acceptance Criteria**:
  - [ ] 광고 슬라이드에서 "다운로드" 버튼 클릭
  - [ ] PPTX 파일 다운로드됨
  - [ ] 파일 열어서 제목, 본문, 배경 이미지 확인

  **Commit**: YES
  - Message: `feat(ppt): integrate ad slide download`
  - Files: `public/app.js`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(ppt): add ad slide type HTML structure` | index.html | 브라우저에서 UI 확인 |
| 2 | `feat(ppt): add ad slide creation and editor logic` | app.js | 슬라이드 생성/편집 확인 |
| 3 | `feat(ppt): add ad slide preview rendering` | app.js, styles.css | 미리보기 확인 |
| 4 | `feat(ppt): add ad slide save logic with image upload` | app.js | 저장 후 새로고침 확인 |
| 5 | `feat(ppt): add ad slide PPTX generation API` | server.js | curl 테스트 |
| 6 | `feat(ppt): integrate ad slide download` | app.js | 다운로드 확인 |

---

## Success Criteria

### Final Verification
```bash
# 서버 실행
npm start

# 브라우저에서 http://localhost:3000 접속
# 1. 새 슬라이드 추가 → 타입 "광고" 선택
# 2. 제목: "테스트 광고", 크기: 대, 정렬: 가운데
# 3. 배경 이미지 업로드 (또는 URL 입력)
# 4. 투명도: 50%
# 5. 본문: "광고 내용입니다"
# 6. 저장 클릭
# 7. 미리보기에서 배경 + 제목 + 본문 확인
# 8. 다운로드 클릭
# 9. PPTX 파일 열어서 확인
```

### Final Checklist
- [ ] "광고" 슬라이드 타입 선택 가능
- [ ] 제목 (대/중/소, 좌/중/우) 설정 가능
- [ ] 배경 이미지 업로드 또는 URL 입력 가능
- [ ] 투명도 슬라이더 작동
- [ ] 미리보기에서 모든 설정 반영
- [ ] 저장 후 새로고침해도 설정 유지
- [ ] PPTX 다운로드 시 모든 요소 정상 렌더링
