# 타이틀 슬라이드 타입 추가

## Context

### Original Request
PPT 생성기에 새로운 슬라이드 타입 "타이틀"(주일 예배 표지) 추가. 선택 사항은
디자인 3종, 교회 이름, 날짜. 선택하면 어느 정도 자동화된 주일 예배 타이틀이
생성된다.

### Interview Summary
- 디자인 3종을 시안으로 만들어 비교 후 **세 가지 모두 채택**
  (클래식 채플 / 모던 에디토리얼 / 스테인드 글로우)
- 부제(예: 성찬 예배)는 **선택 필드로 포함**하고 절기는 자동 제안
- 구현 방식: 새 슬라이드 타입 `title` + 서버(pptxgenjs) 렌더링.
  텍스트가 PPT 텍스트로 남아 파워포인트에서 수정 가능해야 함
- 렌더링 코드는 `server.js`(2,700줄)에서 분리해 `lib/`로 둔다
- 테스트: 순수 함수(날짜 포맷 / 절기 / 다음 주일)만 `node --test`,
  렌더링·UI는 기존 방식대로 수동 QA

### Research Findings
- 기존 슬라이드 타입: `simple`, `hymn`, `ad`
- 광고 타입이 타입 선택 → 설정 패널 → 미리보기 → 저장 → 다운로드 →
  묶음 export 경로를 모두 닦아 놓음. 그 패턴을 따른다.
- 통합 지점
  - `public/index.html:318` 슬라이드 타입 `<select>`
  - `public/app.js` `updateSettingsVisibility` / `populateEditor` /
    `createSlide` / `saveCurrentSlide` / `renderPreview` /
    `getSlideTypeLabel` / 저장 직렬화
  - `server.js` `sanitizeSlideForTemplate` /
    `appendSlideDefinitionToDeck` / `POST /api/create-*-slide-pptx`
- 기존 표지 렌더링 참고: `addScriptureTitleSlide`, `addHymnTitleSlide`
  (명조체 대제목 + 금색 괘선 + 하단 밴드 + 영문 자간)
- 배경 그라디언트는 `buildSvgDataUri` + SVG 문자열 패턴 사용

---

## Work Objectives

### Core Objective
교회 이름과 주일 날짜만 고르면 세 가지 디자인 중 하나로 주일 예배 표지
슬라이드가 자동 생성된다.

### Concrete Deliverables
- `lib/title-slide-date.js`: 날짜 포맷 / 절기 판정 / 다음 주일 목록 (순수 함수)
- `test/title-slide-date.test.js`: 위 순수 함수 테스트
- `lib/title-slide.js`: 디자인 3종 PPTX 렌더러
- `server.js`: `POST /api/create-title-slide-pptx`, 묶음 export·템플릿 연동
- `public/index.html`: 타입 옵션 + 타이틀 설정 패널
- `public/app.js`: 생성·편집·자동화·미리보기·다운로드
- `public/styles.css`: 디자인 선택 카드 스타일

### Definition of Done
- [ ] 타입 드롭다운에 "타이틀 (주일 예배)" 표시
- [ ] 디자인 3종 선택, 교회 이름·날짜·부제 입력 가능
- [ ] 날짜 목록은 다음 주일이 기본값, 절기 자동 제안 동작
- [ ] 미리보기가 실제 출력 좌표와 같은 구성으로 렌더
- [ ] 저장 후 새로고침해도 값 유지
- [ ] 단독 다운로드 / 선택 묶음 다운로드 / 템플릿 저장에서 정상 렌더
- [ ] `node --test` 통과

### Must Have
- 새 필드는 광고 필드와 분리: `titleDesign`, `churchName`, `serviceDate`,
  `titleSubtitle`
- `serviceDate`는 ISO(`YYYY-MM-DD`) 문자열만 저장하고 표기는 렌더 시 생성
  (파생값 저장 금지, 단일 진실 공급원)
- 순수 함수는 `lib/title-slide-date.js` 한 곳에만 구현하고
  서버는 직접 import, 브라우저는 `/lib` 정적 서빙 + 모듈 스크립트로 사용
- 부제가 비면 해당 요소를 아예 렌더하지 않음 (빈 자리 금지)

### Must NOT Have (Guardrails)
- 기존 `simple` / `hymn` / `ad` 동작 변경
- 타이틀 타입의 업로드 소스 (`sourceType`은 항상 `basic`)
- 사용자 배경 이미지 업로드 / 색상 선택기 / 폰트 선택기
- 슬라이드를 이미지로 굽는 방식
- 디자인 4번째 추가, 절기 데이터 외부 API 조회

---

## Verification Strategy

- **순수 함수**: `node --test` (TDD, 테스트 먼저)
- **렌더러 / API**: 서버 기동 후 `curl`로 PPTX 생성, 파일 열어 확인
- **UI**: 브라우저 수동 확인

---

## Task Flow

```
1 (date utils, TDD) → 2 (renderer) → 3 (server) → 4 (html) → 5 (app.js) → 6 (verify)
```

---

## TODOs

- [ ] 1. `lib/title-slide-date.js` + 테스트

  날짜 ISO 파싱, 한글 표기(`2026년 9월 13일 주일`), 영문 표기
  (`SEPTEMBER 13, 2026`), 다음 주일 목록, 절기 판정(부활주일·종려주일·
  성령강림주일·추수감사주일(11월 셋째 주일)·성탄주일·신년 첫 주일).
  부활절은 Meeus/Jones/Butcher 알고리즘. 테스트를 먼저 작성해 실패를 확인한 뒤
  구현한다. 로컬 타임존 영향을 받지 않도록 `Date.UTC` 기반으로 계산.

  **Commit**: `feat(title): add title slide date and season helpers`

- [ ] 2. `lib/title-slide.js` 렌더러

  `appendTitleSlide(pptx, slide)`와 디자인별 함수 3개. 13.333 × 7.5in 기준
  좌표. 세로 스택은 블록 배열을 중앙 정렬하는 헬퍼로 계산해 부제 유무에 따라
  자동으로 재배치. 스테인드 글로우 배경은 SVG data URI.

  **Commit**: `feat(title): render three title slide designs`

- [ ] 3. `server.js` 연동

  `POST /api/create-title-slide-pptx`, `appendSlideDefinitionToDeck` 분기,
  `sanitizeSlideForTemplate`에 새 필드 4개, `/lib` 정적 서빙.

  **Commit**: `feat(title): wire title slide api and deck export`

- [ ] 4. `public/index.html` 설정 패널

  타입 옵션과 `titleSlideSettings` 패널(디자인 카드 3개, 교회 이름, 주일 날짜
  select, 부제 + 절기 제안 버튼). 기존 `rte-panel` 마크업 관례를 따른다.

  **Commit**: `feat(title): add title slide editor panel`

- [ ] 5. `public/app.js` 연동

  DOM 참조, `updateSettingsVisibility`·`populateEditor`·`createSlide`·
  `saveCurrentSlide`·`getSlideTypeLabel`·직렬화 분기, 미리보기 렌더,
  `downloadSlide` 연결, 날짜 select 지연 초기화, 절기 제안 버튼.

  **Commit**: `feat(title): add title slide editing and preview`

- [ ] 6. 검증

  `node --test`, 서버 기동, `curl`로 디자인 3종 PPTX 생성 확인.
